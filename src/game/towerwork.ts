/** Build tower kits inside, reserve a destination at oversight, then ship exactly one tower. */
import type { Sim } from './sim.ts';
import type { Command, Hero, TowerCrate, Site } from './types.ts';
import {
  CELL,
  GRID_W,
  MAP,
  WALL,
  cellCenter,
  inGrid,
  laneProject,
  onWall,
  outsideWalls,
  wallSpot,
} from './map.ts';
import { benchOf, insideOf } from './systems/rooms.ts';
import { forceCompleteSite } from './systems/crafting/site-completion.ts';
import { occupyFootprint } from './systems/footprint.ts';
import { PLANS } from './content.ts';
export const towerMaterials = () => PLANS.tower.parts;
export const oversightSpot = () => wallSpot(WALL.x, WALL.stairs[0].head);
export function atFabricator(sim: Sim, h: Hero): boolean {
  const b = sim.state.buildings.find((b) => b.kind === 'anvil' && b.interior !== undefined);
  const p = b && benchOf(b);
  return !!b && !!p && insideOf(sim, h, b) && Math.hypot(h.x - p.x, h.z - p.z) < 1.35;
}
export function atOversight(h: Hero): boolean {
  const p = oversightSpot();
  return onWall(h.x, h.z) && Math.hypot(h.x - p.x, h.z - p.z) < 2.5;
}
export function deploymentBlocker(sim: Sim, cx: number, cz: number): string | null {
  if (!Number.isInteger(cx) || !Number.isInteger(cz)) return 'Choose a position on the area map';
  const center = cellCenter(cx, cz);
  if (!outsideWalls(center.x, center.z)) return 'Deploy beyond the defensive wall';
  let roadDistance = Infinity;
  for (const lane of sim.world.lanes) {
    const p = laneProject(lane, center.x, center.z);
    roadDistance = Math.min(roadDistance, Math.abs(p.lat));
  }
  if (roadDistance > 9) return 'Choose ground beside an approach road';
  for (let z = cz - 1; z <= cz + 1; z++)
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (!inGrid(x, z)) return 'Outside the surveyed area';
      const k = z * GRID_W + x,
        f = sim.world.cells[k]!,
        p = cellCenter(x, z);
      if (!outsideWalls(p.x, p.z)) return 'Leave the wall clear';
      if (f & CELL.ROAD) return 'Leave the road open';
      if (f & (CELL.WATER | CELL.STEEP | CELL.BORDER | CELL.NOBUILD)) return 'Choose level, clear ground';
      if (sim.state.occupied[k]) return 'A tower or reserved delivery is already here';
      if (sim.collides(p.x, p.z, 0.45)) return 'Clear the trees first';
    }
  return null;
}
export function ensureTowerwork(sim: Sim): void {
  sim.state.towerCrates ??= [];
  if (sim.state.wave === 0 && sim.state.firstTowerAt < 0) sim.state.nextWaveAt = -1;
  const b = sim.state.buildings.find((b) => b.kind === 'anvil'),
    bench = b && benchOf(b);
  if (bench && !sim.state.pois.some((p) => p.kind === 'fabricator'))
    sim.add('poi', { id: sim.newId(), kind: 'fabricator', ...bench, r: 0.3 });
  if (!sim.state.pois.some((p) => p.kind === 'oversight'))
    sim.add('poi', { id: sim.newId(), kind: 'oversight', ...oversightSpot(), r: 0.3 });
}
export function applyTowerworkCommand(sim: Sim, cmd: Command): boolean {
  if (!['queueTower', 'hammerTower', 'shipTower'].includes(cmd.t)) return false;
  if (!('hero' in cmd)) return true;
  const h = sim.getAs(cmd.hero, 'hero');
  if (!h || h.dead || h.transit) return true;
  const deny = (reason: string) => sim.emit('denied', { hero: h.id, reason });
  ensureTowerwork(sim);
  const crates = sim.state.towerCrates!;
  if (cmd.t === 'queueTower') {
    if (!atFabricator(sim, h)) return (deny('Use the tower platform inside the workshop'), true);
    if (!h.tools.includes('hammer')) return (deny('The Crafter Kit includes the building hammer'), true);
    if (crates.some((c) => !c.ready)) return (deny('Finish the tower already on the platform'), true);
    if (crates.filter((c) => !c.shipment).length >= 3)
      return (deny('Deploy a stored tower to make room'), true);
    const need = towerMaterials();
    if ((h.bag.wood ?? 0) < (need.wood ?? 0) || (h.bag.stone ?? 0) < (need.stone ?? 0))
      return (deny(`A tower kit needs ${need.wood} wood and ${need.stone} stone`), true);
    sim.takeFromBag(h, 'wood', need.wood ?? 0);
    sim.takeFromBag(h, 'stone', need.stone ?? 0);
    crates.push({ id: sim.newId(), owner: h.id, work: 0, ready: false });
    return true;
  }
  if (cmd.t === 'hammerTower') {
    if (!atFabricator(sim, h) || !h.tools.includes('hammer') || (h.fabricatingUntil ?? 0) > sim.state.time)
      return true;
    const c = crates.find((c) => c.id === cmd.crate && !c.ready);
    if (!c) return true;
    c.work = Math.min(100, c.work + 20);
    c.ready = c.work >= 100;
    h.fabricatingUntil = sim.state.time + 0.45;
    h.anim = 'work';
    h.animT = 0;
    if (c.ready) deny('Tower packed and stored — climb the stairs to the overview post');
    return true;
  }
  if (cmd.t !== 'shipTower') return true;
  if (!atOversight(h))
    return (deny('Coordinate deployment from the oversight table at the top of the stairs'), true);
  const c = crates.find((c) => c.id === cmd.crate && c.ready && !c.shipment);
  if (!c) return true;
  const why = deploymentBlocker(sim, cmd.cx, cmd.cz);
  if (why) return (deny(why), true);
  const p = cellCenter(cmd.cx, cmd.cz),
    site: Site = {
      id: sim.newId(),
      plan: 'tower',
      ...p,
      cx: cmd.cx,
      cz: cmd.cz,
      rot: 0,
      need: { ...towerMaterials() },
      have: { ...towerMaterials() },
      step: 0,
      work: 0,
      building: 0,
      placedBy: h.id,
      sockets: [],
      delivery: c.id,
    };
  sim.add('site', site);
  occupyFootprint(sim, site.cx, site.cz, site.id, 3);
  const path: number[] = [MAP.workshops.x, MAP.workshops.z, MAP.heroStart.x, 0, WALL.x + WALL.half + 2, 0];
  let chosen = sim.world.lanes[0],
    best = Infinity,
    index = 0;
  if (!chosen) throw new Error('Tower shipment needs an approach lane');
  for (const lane of sim.world.lanes)
    for (let i = 0; i < lane.xs.length; i++) {
      const d = Math.hypot(lane.xs[i]! - p.x, lane.zs[i]! - p.z);
      if (d < best) {
        best = d;
        chosen = lane;
        index = i;
      }
    }
  for (let i = chosen.xs.length - 1; i >= index; i -= Math.max(1, Math.floor(3 / chosen.def.half)))
    path.push(chosen.xs[i]!, chosen.zs[i]!);
  path.push(p.x, p.z);
  // Paths are assembled as coordinate pairs; both loops advance by complete pairs.
  let length = 0;
  for (let i = 2; i < path.length; i += 2)
    length += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
  c.shipment = { site: site.id, t: 0, duration: Math.max(5, length / 5), path };
  sim.emit('sitePlaced', { site: site.id, plan: 'tower', x: p.x, z: p.z });
  deny('Destination reserved — the tower shipment is on its way');
  return true;
}
export function shipmentPosition(c: TowerCrate): { x: number; z: number; yaw: number } {
  const s = c.shipment;
  if (!s || s.path.length < 2 || s.path.length % 2)
    throw new Error('Tower shipment needs complete coordinate pairs');
  // The shape check above establishes complete pairs for all interpolated segments.
  let total = 0;
  for (let i = 2; i < s.path.length; i += 2)
    total += Math.hypot(s.path[i]! - s.path[i - 2]!, s.path[i + 1]! - s.path[i - 1]!);
  let left = total * Math.min(1, s.t / s.duration);
  for (let i = 2; i < s.path.length; i += 2) {
    const dx = s.path[i]! - s.path[i - 2]!,
      dz = s.path[i + 1]! - s.path[i - 1]!,
      d = Math.hypot(dx, dz);
    if (left <= d || i === s.path.length - 2) {
      const k = d ? Math.min(1, left / d) : 1;
      return { x: s.path[i - 2]! + dx * k, z: s.path[i - 1]! + dz * k, yaw: Math.atan2(dx, dz) };
    }
    left -= d;
  }
  return { x: s.path[0]!, z: s.path[1]!, yaw: 0 };
}
export function updateTowerwork(sim: Sim, dt: number): void {
  const crates = sim.state.towerCrates ?? [];
  for (let i = crates.length - 1; i >= 0; i--) {
    // Reverse traversal removes only the current dense crate slot.
    const c = crates[i]!,
      s = c.shipment;
    if (!s) continue;
    s.t += dt;
    if (s.t < s.duration) continue;
    const site = sim.getAs(s.site, 'site');
    if (site) {
      delete site.delivery;
      forceCompleteSite(sim, site);
      crates.splice(i, 1);
    } else c.shipment = undefined;
  }
}
