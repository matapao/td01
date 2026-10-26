/** Read-only proximity and facing queries, shared by the HUD and interaction routing. */
import { earth } from '../../game/excavation.ts';
import type { Game } from '../game.ts';
import type { Sel } from '../../ui/state.ts';
import {
  buildingTitle,
  ITEMS,
  NODE_TOOL,
  OVER_WALL,
  NODES,
  PLANS,
  REPAIR,
  STATIONS,
  TOOLS,
  type NodeKind,
} from '../../game/content.ts';
import { groundHeight, onWall, outsideWalls, wallDist } from '../../game/map.ts';
import { siteComplete } from '../../game/systems/craft.ts';
import { benchOf, roomAt } from '../../game/systems/rooms.ts';
import { INTERIORS } from '../../game/interiors.ts';
import { GATE_MEND, gateRammed } from '../../game/systems/wall.ts';
import { dist } from '../../core/math.ts';
import { buildingR } from './context.ts';
import type { Hero } from '../../game/types.ts';

const PROMPT_RANGE = 1.5;
export function findPrompt(game: Game, hero: Hero): { sel: Sel; text: string } | null {
  const g = game;
  const s = g.sim.state;
  const h = hero;
  // Hands on the drone's controls: nothing to interact with.
  if (!h || h.dead || h.droneOn || h.transit) return null;
  const fx = Math.sin(h.facing);
  const fz = Math.cos(h.facing);
  let best: { sel: Sel; text: string } | null = null;
  let bs = Infinity;
  const consider = (sel: Sel, x: number, z: number, r: number, text: string) => {
    const d = dist(x, z, h.x, h.z) - r;
    if (d > PROMPT_RANGE) return;
    const dx = x - h.x;
    const dz = z - h.z;
    const l = Math.hypot(dx, dz) || 1;
    // What you face wins over what is merely close: a big blueprint beside you mustn't steal F
    // from the tree in front of you.
    const c = (dx * fx + dz * fz) / l;
    const score = (Math.max(0, d) + 0.5) * (1.6 - c) * (c > 0.3 ? 1 : 4);
    if (score < bs) {
      bs = score;
      best = { sel, text };
    }
  };
  const names: Record<NodeKind, string> = {
    tree: 'tree',
    rock: 'rock',
    ore: 'ore vein',
    crystal: 'crystals',
    metalrock: 'nickel-iron outcrop',
    icefield: 'ice',
    raremound: 'rare-earth vein',
  };
  for (const n of s.nodes) {
    if (n.amount <= 0) continue;
    const tool = NODE_TOOL[n.kind];
    const text = `${NODES[n.kind].verb} ${names[n.kind]}${h.tools.includes(tool) || s.dev ? '' : ` — needs a ${TOOLS[tool].name.toLowerCase()}`}`;
    consider({ kind: 'node', id: n.id }, n.x, n.z, n.radius, text);
  }
  for (const c of s.chests)
    if (!c.opened) consider({ kind: 'chest', id: c.id }, c.x, c.z, 0.8, `Open ${c.name}`);
  for (const site of s.sites) {
    if (site.delivery) {
      consider({ kind: 'site', id: site.id }, site.x, site.z, buildingR('tower'), 'Tower shipment incoming');
      continue;
    }
    if (site.building) continue;
    const sp = PLANS[site.plan];
    consider(
      { kind: 'site', id: site.id },
      site.x,
      site.z,
      buildingR(sp.type === 'building' ? sp.building : 'tower'),
      siteComplete(site) ? `Assemble ${PLANS[site.plan].name}` : `Set parts into ${PLANS[site.plan].name}`,
    );
  }
  const hasRepair = REPAIR.materials.some((m) => (h.bag[m] ?? 0) > 0);
  // Inside a building: its bench, and its door out.
  const room = roomAt(g.sim, h.x, h.z);
  if (room) {
    const b = room.b;
    const bench = benchOf(b);
    const station = STATIONS[b.kind as keyof typeof STATIONS];
    if (bench)
      consider(
        { kind: 'building', id: b.id },
        bench.x,
        bench.z,
        0.3,
        b.kind === 'shop'
          ? 'Shop counter — Crafter Kit'
          : b.kind === 'anvil'
            ? 'Tower construction platform'
            : b.busy
              ? `Work the ${station?.name ?? 'bench'}`
              : 'Load / collect',
      );
    // (Its door needs no key: walk out through it.)
    return best;
  }
  for (const b of s.buildings) {
    let text = '';
    if (b.site) {
      const site = g.sim.getAs(b.site, 'site');
      // A gem being set: its parts go in, then it is melted into the window.
      text = site
        ? `${siteComplete(site) ? (PLANS[site.plan].type === 'gem' ? 'Melt in' : 'Assemble') : 'Set parts into'} ${PLANS[site.plan].name}`
        : '';
    } else if (b.hp < b.maxHp && hasRepair) text = 'Repair';
    // A building you walk into: the work is done inside.
    else if (b.interior !== undefined) text = `Enter the ${INTERIORS[b.kind]?.name ?? buildingTitle(b)}`;
    else if (b.kind in STATIONS)
      text = b.busy ? `Work the ${STATIONS[b.kind as keyof typeof STATIONS].name}` : 'Load / collect';
    if (text) consider({ kind: 'building', id: b.id }, b.x, b.z, buildingR(b.kind), text);
  }
  for (const p of s.pois) {
    if (p.kind === 'store' && !s.discovered.includes(p.store!)) continue;
    const mine = p.mine !== undefined ? s.mines[p.mine] : undefined;
    const gate = s.gate;
    // (The gate stands shut; at its winch there is mending to do, or a mended gate to swing shut.)
    const gateLabel =
      gate.hp < gate.maxHp && (gate.repairBuf > 0 || REPAIR.materials.some((m) => (h.bag[m] ?? 0) > 0))
        ? `Mend the gate (${Math.round(gate.hp)}/${gate.maxHp})${gateRammed(g.sim) ? ' — slowly: the dead are ramming it' : ''}`
        : !gate.shut && gate.hp >= gate.maxHp * GATE_MEND
          ? 'Shut the gate'
          : gate.hp < gate.maxHp
            ? `The gate: ${Math.round(gate.hp)}/${gate.maxHp} — bring wood, stone, planks or blocks to mend it`
            : '';
    if (p.kind === 'gate' && !gateLabel) continue;
    const label =
      p.kind === 'fabricator'
        ? 'Tower construction platform'
        : p.kind === 'oversight'
          ? 'Overview · deploy stored towers'
          : p.kind === 'keep'
            ? 'Storehouse'
            : p.kind === 'gate'
              ? gateLabel
              : p.kind === 'mine'
                ? `Ride the lift down — ${mine?.name ?? 'the mine'}`
                : p.kind === 'lift'
                  ? 'Ride the lift up'
                  : p.store === 'market'
                    ? 'Shop counter — Crafter Kit'
                    : 'Trade';
    consider({ kind: 'poi', id: p.id }, p.x, p.z, p.r, label);
  }
  for (const d of s.drops)
    if (d.inst) consider({ kind: 'drop', id: d.id }, d.x, d.z, 0.3, `Pick up ${d.inst.name}`);
  // Up on the wall-walk: what you look at out on the field.
  if (!best && onWall(h.x, h.z)) return fieldPrompt(game, hero, hasRepair);
  if (!best && !game.indoors) {
    const f = earth(g.sim),
      y = groundHeight(g.sim.world, h.x, h.z) + 0.45;
    const hit = f.ray({ x: h.x, y, z: h.z }, { x: fx, y: 0, z: fz }, 2.7);
    if (hit)
      best = {
        sel: { kind: 'cell', id: -1 },
        text: 'Dig rock · X: dig ahead · right-click: aim · Shift: wider patch · V: scanner',
      };
    else {
      const stump = s.nodes.find(
        (n) => n.kind === 'tree' && n.amount <= 0 && Math.hypot(n.x - h.x, n.z - h.z) < 2,
      );
      const bed = f.state.beds.find((b) => !b.planted && Math.hypot(b.x - h.x, b.z - h.z) < 2);
      if (stump || bed)
        best = {
          sel: { kind: 'cell', id: -2 },
          text: stump?.planted
            ? 'Seed growing'
            : stump?.prepared || bed
              ? 'Plant a seed'
              : 'Shovel a planting hole',
        };
    }
  }
  return best;
}
function fieldPrompt(game: Game, hero: Hero, hasRepair: boolean): { sel: Sel; text: string } | null {
  const g = game;
  const s = g.sim.state;
  const h = hero;
  const f = g.cam.forward;
  const fl = Math.hypot(f.x, f.z) || 1;
  const fx = f.x / fl;
  const fz = f.z / fl;
  let best: { sel: Sel; text: string } | null = null;
  let bs = Infinity;
  const aim = (sel: Sel, x: number, z: number, r: number, text: string) => {
    if (!outsideWalls(x, z) || wallDist(x, z) > OVER_WALL.reach + 4) return;
    const dx = x - h.x;
    const dz = z - h.z;
    const along = dx * fx + dz * fz;
    // How far off your line of sight it is (m, across it), less its own size.
    const off = Math.abs(dx * fz - dz * fx) - r;
    if (along < 1 || off > 1.5 + along * 0.08) return;
    const score = Math.max(0, off) + along * 0.03;
    if (score < bs) {
      bs = score;
      best = { sel, text };
    }
  };
  for (const site of s.sites) {
    if (site.building) continue;
    const sp = PLANS[site.plan];
    aim(
      { kind: 'site', id: site.id },
      site.x,
      site.z,
      buildingR(sp.type === 'building' ? sp.building : 'tower'),
      siteComplete(site) ? `Raise the ${sp.name} from the wall` : `Send the parts over to the ${sp.name}`,
    );
  }
  for (const b of s.buildings) {
    let text = '';
    if (b.site) {
      const site = g.sim.getAs(b.site, 'site');
      const sp = site && PLANS[site.plan];
      text =
        site && sp
          ? siteComplete(site)
            ? `${sp.type === 'gem' ? 'Melt in' : 'Build in'} the ${sp.name} from the wall`
            : `Send the parts over for the ${sp.name}`
          : '';
    } else if (b.hp < b.maxHp && hasRepair) text = `Mend the ${buildingTitle(b)} from the wall`;
    if (text) aim({ kind: 'building', id: b.id }, b.x, b.z, buildingR(b.kind), text);
  }
  for (const d of s.drops)
    aim(
      { kind: 'drop', id: d.id },
      d.x,
      d.z,
      0.4,
      `Haul up ${d.inst ? d.inst.name : d.item === 'gold' ? `${d.amount} gold` : ITEMS[d.item].name}`,
    );
  return best;
}
