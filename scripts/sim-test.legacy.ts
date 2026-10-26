/**
 * Headless simulation test: a scripted player gathers, places plans, delivers parts, assembles,
 * crafts and defends. Checks progress, determinism and tick cost.
 *   npm run test:sim
 */
import { Sim } from '../src/game/sim';
import { restore, snapshot } from '../src/game/save';
import { DT } from '../src/game/config';
import { forceCompleteSite, placementBlocker } from '../src/game/systems/craft';
import { ABILITIES, ENEMIES, WEAPONS, WEAPON_DAMAGE, maxWeaponTier, tierMul, weaponTier, AURA, COLOR_ORDER, DEVICE, DIVE, GEM_LEVELS, LANE_DEAD, NIGHT, OVER_WALL, POWER, STATIONS, type StationKind, type DeviceId, TOWER_TOPS, topOf, DRONE, NODES, PLANS, SOCKETS, STORES, computeTowerStats, gemBlocker, gemLevel, sizeOf, todNow, towerName, type BuildingKind, type GemId, type GemPlan, type ItemId, type PlanId } from '../src/game/content';
import { WAVES } from '../src/game/waves';
import { LOOT_BASES } from '../src/game/loot';
import { BRIDGE, GATE, MAP, WALL, cellCenter, cellOf, deckAt, groundHeight, insideWalls, lanePos, laneProject, onWall, outsideWalls, w, wallAt, wallDist, wallSpot as walkSpot, waterDepth } from '../src/game/map';
import { bodyFree, damageHero, heroDamage, heroSpeed, slide, walkableAt } from '../src/game/systems/heroes';
import { INTERIORS, STOREY, indoors, interiorOrigin } from '../src/game/interiors';
import { benchOf, enterBuilding, frontDoor, insideOf, leaveBuilding, roomDoor, roomWalkable } from '../src/game/systems/rooms';
import { spawnCampEnemy, spawnEnemy } from '../src/game/systems/enemies';
import { darkness } from '../src/game/systems/power';
import { flightTime, hasModule, homecoming, spaceOf } from '../src/game/systems/space';
import { PAYLOADS, SPACE, WINDOW, inSpace, slotOf, spaceHeight, type PayloadId } from '../src/game/space';
import { roadOf } from '../src/game/systems/road';
import { valeAge, type MilestoneId } from '../src/game/road';
import { crewBoost, crewOf, damageBuilding, damageEnemy, destroyBuilding } from '../src/game/systems/combat';
import { MIN, MINERALS, STATION, cellHits, cellYield, digBlocker, digCellAt, digCenter, lairDef, legBlocked, mineItems, mineLayout, mineOpen, mineRoof, mineSdf, pathAt, type Mine, type MineralId } from '../src/game/mines';
import { CELL as GROUND, GRID_W } from '../src/game/map';
import { RAIL, railLine, railPoints, type RailLine } from '../src/game/rails';
import { GATE_MEND, GATE_STOP } from '../src/game/systems/wall';
import { rideLift } from '../src/game/systems/mining';
import type { Building, Hero, Site } from '../src/game/types';

const fail = (msg: string): never => {
  console.error('FAIL:', msg);
  process.exit(1);
};

/** A free spot near (x, z) for a building of `size` cells — with `kind`, by the wall's rule too (towers out, the rest in). */
function findSpot(sim: Sim, x: number, z: number, maxR = 9, size = sizeOf('tower'), kind?: BuildingKind): { cx: number; cz: number } | null {
  const c = cellOf(x, z);
  for (let r = 0; r <= maxR; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (!placementBlocker(sim, c.cx + dx, c.cz + dz, size, kind)) return { cx: c.cx + dx, cz: c.cz + dz };
      }
    }
  }
  return null;
}

/** In town (by the workshop quarter, or `near`): a free spot for a building of ours. */
function townSpot(sim: Sim, kind: BuildingKind, near: { x: number; z: number } = MAP.workshops): { cx: number; cz: number } {
  return findSpot(sim, near.x, near.z, 18, sizeOf(kind), kind) ?? fail(`no room in town for a ${kind}`);
}

/** Out on the dead's side: a spot for a tower by road `lane`, `d` m out from the gate, `lat` m to its side. */
function roadSpot(sim: Sim, d: number, lat = 6, lane = 0): { cx: number; cz: number } {
  const l = sim.world.lanes[lane];
  const p = lanePos(l, l.length - d, lat);
  return findSpot(sim, p.x, p.z, 6, sizeOf('tower'), 'tower') ?? fail(`no room for a tower ${d} m out`);
}

/** Up on the wall-walk: the free cell nearest (x, z) for a brazier, a lamp or a pole. */
function wallSpot(sim: Sim, kind: BuildingKind, x: number, z: number): { cx: number; cz: number } | null {
  let best: { cx: number; cz: number } | null = null;
  let bd = Infinity;
  for (let k = 0; k < sim.world.cells.length; k++) {
    if (!(sim.world.cells[k] & GROUND.WALK)) continue;
    const cx = k % GRID_W;
    const cz = (k / GRID_W) | 0;
    const p = cellCenter(cx, cz);
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd && !placementBlocker(sim, cx, cz, 1, kind)) {
      bd = d;
      best = { cx, cz };
    }
  }
  return best;
}

/** A tiny autopilot that plays the gather → plan → deliver → assemble loop (and lights its towers). */
class Bot {
  goals: PlanId[] = ['tower', 'brazier', 'sawmill', 'tower', 'brazier', 'tower', 'brazier', 'tower', 'brazier'];
  towers = 0;
  site = 0;
  log: string[] = [];
  constructor(private sim: Sim, private h: Hero) {}

  have(item: ItemId): number {
    return this.h.bag[item] ?? 0;
  }

  /** Interacting only works up close now, so walk over first (out on the field: from the wall-walk, which the hero walks up to by itself). */
  use(target: number): void {
    const e = this.sim.get(target)?.e as { x: number; z: number } | undefined;
    if (e && !outsideWalls(e.x, e.z) && Math.hypot(e.x - this.h.x, e.z - this.h.z) > 10) this.sim.apply({ t: 'move', hero: this.h.id, x: e.x, z: e.z });
    else this.sim.apply({ t: 'interact', hero: this.h.id, target });
  }

  nearestNode(kind: string): number {
    let best = 0;
    let bd = Infinity;
    for (const n of this.sim.state.nodes) {
      if (n.kind !== kind || n.amount <= 0) continue;
      const d = Math.hypot(n.x - this.h.x, n.z - this.h.z);
      if (d < bd && this.sim.isExplored(n.x, n.z)) {
        bd = d;
        best = n.id;
      }
    }
    return best;
  }

  /** First stop: the Market for an axe, a pickaxe and a hammer (tools are bought, not given). */
  tools(): boolean {
    const { sim, h } = this;
    const need = (['axe', 'pickaxe', 'hammer'] as const).filter((t) => !h.tools.includes(t));
    if (!need.length) return false;
    const shop = sim.state.buildings.find((b) => b.kind === 'shop')!;
    if (!insideOf(sim, h, shop)) {
      const d = frontDoor(shop);
      if (Math.hypot(d.x - h.x, d.z - h.z) > 0.6) {
        if (h.task.k === 'idle') sim.apply({ t: 'move', hero: h.id, ...d });
      } else enterBuilding(sim, h, shop);
      return true;
    }
    sim.apply({ t: 'buyCrafterKit', hero: h.id, store: 'market' });
    leaveBuilding(sim, h);
    this.log.push(`${sim.state.time.toFixed(1)}s bought ${need.join(', ')}`);
    return true;
  }

  tick(): void {
    const { sim, h } = this;
    if (h.dead) return;
    if (this.tools()) return;
    // Pick up nearby gold when idle.
    if (h.task.k === 'work') {
      sim.apply({ t: 'beat', hero: h.id, quality: sim.state.tick % 3 === 0 ? 2 : 1 });
      return;
    }
    const site = this.site ? sim.getAs(this.site, 'site') : undefined;
    // Stop gathering once the site's needs are covered by what we carry.
    if (h.task.k === 'gather' && site) {
      const node = sim.getAs(h.task.node, 'node');
      const item: ItemId | null = node ? (node.kind === 'tree' ? 'wood' : node.kind === 'rock' ? 'stone' : null) : null;
      if (item && (site.need[item] ?? 0) - (site.have[item] ?? 0) - this.have(item) <= 0) sim.apply({ t: 'stop', hero: h.id });
    }
    if (h.task.k !== 'idle') return;
    if (!site && this.site) this.site = 0;
    const goal = this.goals[0];
    if (!goal) return;
    const parts = PLANS[goal].parts;
    if (!this.site) {
      // Towers go beside the North Road just out from the gate (the only thing that stands beyond
      // the wall); each gets a brazier up on the wall-walk for the nights; the sawmill goes in the
      // workshop quarter in town.
      const lane = sim.world.lanes[0];
      // (Within the reach of the wall's torches, or of a brazier up on the walk: 16 m.)
      const d = lane.length - w(4) - w(2) * this.towers;
      const p = lanePos(lane, d, 0);
      const side = this.towers % 2 ? -5.6 : 5.6;
      const lastTower = sim.state.buildings.filter((b) => b.kind === 'tower').at(-1);
      const spot =
        goal === 'sawmill' ? townSpot(sim, 'sawmill')
        : goal === 'brazier' ? (lastTower ? wallSpot(sim, 'brazier', lastTower.x, lastTower.z) : null)
        : findSpot(sim, p.x - p.tz * side, p.z + p.tx * side, 14, sizeOf('tower'), 'tower');
      if (goal === 'tower') this.towers++;
      if (!spot) fail(`no spot for ${goal}`);
      const n = sim.state.sites.length;
      sim.apply({ t: 'place', hero: h.id, plan: goal, cx: spot!.cx, cz: spot!.cz });
      const placed = sim.state.sites.length > n ? (sim.state.sites[sim.state.sites.length - 1] as Site) : undefined;
      if (!placed) fail(`the ${goal} plan was refused: ${this.log.at(-1)}`);
      this.site = placed!.id;
      this.log.push(`${sim.state.time.toFixed(1)}s placed ${goal}`);
      return;
    }
    // Gather what's missing, then deliver (a full bag goes to the site first).
    if (sim.bagFree(h) <= 0) {
      this.use(this.site);
      return;
    }
    for (const k in parts) {
      const item = k as ItemId;
      const missing = (site!.need[item] ?? 0) - (site!.have[item] ?? 0) - this.have(item);
      if (missing > 0) {
        const kind = item === 'wood' ? 'tree' : item === 'stone' ? 'rock' : '';
        if (!kind) fail(`bot can't source ${item}`);
        const node = this.nearestNode(kind);
        if (!node) fail(`no ${kind} nodes`);
        this.use(node);
        return;
      }
    }
    this.use(this.site);
  }

  onBuilt(): void {
    this.log.push(`${this.sim.state.time.toFixed(1)}s built ${this.goals[0]}`);
    this.goals.shift();
    this.site = 0;
  }
}

function run(seed: number, seconds: number): { sim: Sim; bot: Bot; ms: number } {
  const sim = new Sim({ seed });
  const hero = sim.state.heroes[0];
  const bot = new Bot(sim, hero);
  sim.events.on('buildingDone', () => bot.onBuilt());
  sim.events.on('denied', (e) => bot.log.push(`denied: ${e.reason}`));
  const t0 = performance.now();
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i++) {
    bot.tick();
    sim.step();
    if (sim.state.phase === 'lost' || sim.state.phase === 'won') break;
  }
  return { sim, bot, ms: performance.now() - t0 };
}

const t0 = performance.now();
const probe = new Sim();
console.log(`world: ${probe.props.length} props, ${probe.state.nodes.length} nodes, ${probe.state.camps.length} camps, ` +
  `${probe.world.bridges.length} bridges, lanes ${probe.world.lanes.map((l) => l.length.toFixed(0)).join('/')} m ` +
  `(built in ${(performance.now() - t0).toFixed(0)} ms)`);
if (probe.world.bridges.length < 2) fail('expected a bridge per lane');

const a = run(7, 420);
const b = run(7, 420);
const s = a.sim.state;
console.log(a.bot.log.slice(0, 14).join('\n'));
console.log(`after ${s.time.toFixed(0)}s: phase=${s.phase} wave=${s.wave} lives=${s.lives} gold=${s.gold} kills=${s.stats.kills} ` +
  `gathered=${s.stats.gathered} built=${s.stats.built} crafted=${s.stats.crafted} perfects=${s.stats.perfects} drops=${s.drops.length} ` +
  `library=[${s.library.join(',')}]`);
console.log(`tick cost ≈ ${((a.ms / s.tick) * 1000).toFixed(1)} µs/tick`);
const towers = s.buildings.filter((x) => x.stats);
if (!towers.length) fail('no tower was built');
console.log(`lit towers: ${towers.filter((t) => t.lit).length}/${towers.length} (braziers ${s.buildings.filter((b) => b.kind === 'brazier').length})`);
if (s.stats.gathered < 10) fail('hero did not gather');
if (s.wave < 2) fail('waves did not progress');
if (s.stats.kills < 5) fail('towers did not kill anything');
if (a.sim.hash() !== b.sim.hash()) fail(`non-deterministic: ${a.sim.hash()} vs ${b.sim.hash()}`);
console.log(`deterministic ✓ (hash ${a.sim.hash()})`);

// Save mid-game, restore into a fresh simulation, play both on: they must stay identical.
{
  const live = run(11, 150).sim;
  const copy = new Sim({ seed: 11 });
  restore(copy, JSON.parse(JSON.stringify(snapshot(live))));
  if (copy.hash() !== live.hash()) fail('a restored save differs from the game it was taken from');
  for (let i = 0; i < 600; i++) {
    live.step();
    copy.step();
  }
  if (copy.hash() !== live.hash()) fail(`a restored game drifted: ${copy.hash()} vs ${live.hash()}`);
  console.log(`save/restore exact ✓ (${(JSON.stringify(snapshot(live)).length / 1024).toFixed(0)} KB per save)`);
}

// Electricity: repair the old watermill, run poles toward the keep, light a lamp.
{
  const sim = new Sim({ seed: 5 });
  const st = sim.state;
  st.explored.fill(1);
  const h = st.heroes[0];
  const mill = st.sites.find((x) => x.plan === 'hydro');
  if (!mill) fail('no watermill to repair');
  forceCompleteSite(sim, mill!);
  if (!st.library.includes('pole') || !st.library.includes('lamp')) fail('repairing the watermill did not unlock the power plans');
  const raise = (plan: 'pole' | 'lamp', x: number, z: number) => {
    if (!h.known.includes(plan)) h.known.push(plan);
    const c = findSpot(sim, x, z, 9, 1);
    if (!c) return fail(`no room for a ${plan} near ${x.toFixed(0)}, ${z.toFixed(0)}`);
    sim.apply({ t: 'place', hero: h.id, plan, cx: c.cx, cz: c.cz });
    const site = st.sites[st.sites.length - 1];
    if (!site || site.plan !== plan) return fail(`could not place a ${plan}`);
    forceCompleteSite(sim, site);
    return st.buildings[st.buildings.length - 1];
  };
  const hy = st.buildings.find((b) => b.kind === 'hydro')!;
  let x = hy.x;
  let z = hy.z;
  const poles = [];
  for (let i = 0; i < 3; i++) {
    const l = Math.hypot(MAP.keep.x - x, MAP.keep.z - z);
    const p = raise('pole', x + ((MAP.keep.x - x) / l) * 12, z + ((MAP.keep.z - z) / l) * 12);
    poles.push(p);
    x = p.x;
    z = p.z;
  }
  const near = raise('lamp', x + 3, z + 2);
  const far = raise('lamp', (x + MAP.keep.x) / 2, (z + MAP.keep.z) / 2);
  for (let i = 0; i < 20; i++) sim.step();
  if (!poles.every((p) => p.powered)) fail('the poles did not carry the power');
  if (!near.powered) fail('a lamp beside a live pole is dark');
  if (far.powered) fail('a lamp far from the grid is lit');
  console.log(`electricity ✓ (watermill → ${poles.length} poles → lamp; a far lamp stays dark)`);
}
// Space: payloads stacked at the Port and launched in the window; each flight climbs, cruises, then —
// no air out there — brakes on its engine and comes down on its legs; what lands is the base. A crew
// rides out once a habitat stands; the rover and drill fill the depot; with the oxygen plant the ascent
// vehicle sends the minerals home in a capsule that burns into the vale's air and lands under its
// parachute by the keep — and the crew with them. The body is round: past its rim there's nothing.
{
  const sim = new Sim({ seed: 73 });
  const st = sim.state;
  st.explored.fill(1);
  const h = st.heroes[0];
  for (const id of ['port', 'lander', 'solarfarm', 'habitat', 'crew', 'rover', 'drill', 'oxygen', 'ascent'] as PlanId[]) if (!h.known.includes(id)) h.known.push(id);
  // The Port stands on the launch field at the town's edge (beyond the wall it is refused).
  const lane = sim.world.lanes[0];
  const out = roadSpot(sim, 40, 9);
  sim.apply({ t: 'place', hero: h.id, plan: 'port', cx: out.cx, cz: out.cz });
  if (st.sites.some((x) => x.plan === 'port')) fail('the Port went down beyond the wall');
  const c = townSpot(sim, 'port', MAP.launch);
  sim.apply({ t: 'place', hero: h.id, plan: 'port', cx: c.cx, cz: c.cz });
  forceCompleteSite(sim, st.sites[st.sites.length - 1]);
  const port = st.buildings.find((b) => b.kind === 'port') ?? fail('no Port');
  void lane;
  const phases: string[] = [];
  sim.events.on('flightPhase', (e) => phases.push(e.phase));
  let denied = '';
  sim.events.on('denied', (e) => (denied = e.reason));
  const stack = (payload: PayloadId) => {
    sim.apply({ t: 'stackPayload', hero: h.id, building: port.id, payload });
    const site = st.sites.find((x) => x.building === port.id && sim.alive(x.id));
    if (!site) return false;
    forceCompleteSite(sim, site);
    return port.ready === payload;
  };
  const fly = (n = flightTime) => {
    // (No waves meanwhile: this is about the flights.)
    st.nextWaveAt = st.time + 1e6;
    for (let i = 0; i < Math.ceil(n / DT) + 2; i++) sim.step();
  };
  if (stack('rover')) fail('nothing but the lander should go first');
  if (!stack('lander')) fail('the lander should stack on the pad');
  // The window: shut at first.
  sim.apply({ t: 'launch', hero: h.id, building: port.id, board: false });
  if (!port.ready) fail('a launch should wait for the window');
  st.time = WINDOW.first + 5;
  sim.apply({ t: 'launch', hero: h.id, building: port.id, board: false });
  if (port.ready || !(st.space?.flights.length === 1)) fail('in the window the lander should launch');
  fly();
  if (phases.join(',') !== 'cruise,braking,descent,touchdown') fail(`a flight out should go cruise → braking → descent → touchdown (${phases.join(',')})`);
  if (!hasModule(sim, 'lander')) fail('the lander should have landed at the base');
  const launch = (payload: PayloadId, board = false) => {
    denied = '';
    if (!stack(payload)) fail(`could not stack the ${payload} (${denied}; ready ${port.ready}, site ${port.site}, ${JSON.stringify(spaceOf(sim).modules.map((m) => m.kind))}, flights ${spaceOf(sim).flights.length})`);
    st.time = WINDOW.first + WINDOW.every * Math.ceil((st.time - WINDOW.first) / WINDOW.every) + 1;
    sim.apply({ t: 'launch', hero: h.id, building: port.id, board });
    fly();
  };
  for (const pl of ['solarfarm', 'habitat'] as PayloadId[]) launch(pl);
  // A crew: the hero rides out to the habitat.
  if (!stack('crew')) fail('a crew capsule should stack once a habitat stands');
  st.time = WINDOW.first + WINDOW.every * Math.ceil((st.time - WINDOW.first) / WINDOW.every) + 1;
  h.x = port.x + 2;
  h.z = port.z;
  sim.apply({ t: 'launch', hero: h.id, building: port.id, board: true });
  if (!h.flight) fail('boarding should put the hero aboard');
  const x0 = h.x;
  sim.apply({ t: 'pose', hero: h.id, x: x0 + 0.5, z: h.z, facing: 0, look: 0, gait: 'fwd', moving: true });
  if (h.x !== x0) fail('aboard a flight, nobody walks');
  fly();
  if (h.flight || !inSpace(h.z) || Math.hypot(h.x - slotOf('habitat').x, h.z - slotOf('habitat').z) > 5) fail(`the crew should step out by the habitat (${h.x.toFixed(0)}, ${h.z.toFixed(0)})`);
  if (!walkableAt(sim, h.x, h.z) || walkableAt(sim, slotOf('habitat').x, slotOf('habitat').z)) fail('in Space, the ground should be walkable and the habitat solid');
  if (Math.abs(groundHeight(sim.world, SPACE.x + 34, SPACE.z - 22) - spaceHeight(SPACE.x + 34, SPACE.z - 22)) > 1e-9 || spaceHeight(SPACE.x + 34, SPACE.z - 22) > -1) fail('Space should have its own ground, craters and all');
  if (!walkableAt(sim, SPACE.x + SPACE.half - 2, SPACE.z) || walkableAt(sim, SPACE.x + SPACE.half - 4, SPACE.z + SPACE.half - 4)) fail('the body should be round: walkable to its rim, nothing past it');
  // The rover and the drill fill the depot (with the solar farm feeding them).
  for (const pl of ['rover', 'drill', 'oxygen', 'ascent'] as PayloadId[]) launch(pl);
  st.nextWaveAt = st.time + 1e6;
  for (let i = 0; i < 60 / DT; i++) sim.step();
  const depot = { ...spaceOf(sim).depot };
  if (!(depot.nickeliron ?? 0) || !(depot.rareearth ?? 0)) fail(`the rover and drill should fill the depot (${JSON.stringify(depot)})`);
  // Home: by the ascent vehicle, ride it up; the capsule comes down by the keep with the minerals.
  const asc = slotOf('ascent');
  h.x = asc.x + PAYLOADS.ascent.half + 1;
  h.z = asc.z;
  const drops0 = st.drops.length;
  phases.length = 0;
  sim.apply({ t: 'launchHome', hero: h.id, board: true });
  if (!h.flight) fail('the crew should board the ascent vehicle');
  fly();
  const home = homecoming();
  if (phases.join(',') !== 'cruise,entry,parachute,touchdown') fail(`the way home should go cruise → entry → parachute → touchdown (${phases.join(',')})`);
  if (h.flight || inSpace(h.z) || Math.hypot(h.x - home.x, h.z - home.z) > 3) fail('the crew should come home by the keep');
  const back = st.drops.slice(drops0).filter((d) => d.item === 'rareearth').length;
  if (!back) fail('the rare earths should come home in the capsule');
  const copy = new Sim({ seed: 73 });
  restore(copy, JSON.parse(JSON.stringify(snapshot(sim))));
  if (spaceOf(copy).modules.length !== spaceOf(sim).modules.length) fail('a save lost the base');
  console.log(`space ✓ (the lander first; launches wait for the window; out: cruise → braking → descent → touchdown; ${spaceOf(sim).modules.length} modules at the base; round body; a crew rides out to the habitat and walks the dust; the depot fills (${Object.entries(depot).map(([k, n]) => `${n} ${k}`).join(', ')}); the ascent vehicle brings ${back} rare earths and the crew home by the keep (entry → parachute); saved)`);
}
// Tower devices: powered machines in the upper windows. Dark without power; a solar roof runs them
// by day; on the grid they run while it can carry them (overloaded, they brown out). A searchlight
// lights its tower at night and the dead in its beam take more; a targeter adds crits; relays
// between towers near each other shoot faster; a radar dish gives wave intel.
{
  const sim = new Sim({ seed: 71 });
  const st = sim.state;
  st.explored.fill(1);
  const h = st.heroes[0];
  for (const id of ['tower', 'pole', 'searchlight', 'radar', 'targeter', 'relay', 'solar'] as PlanId[]) if (!h.known.includes(id)) h.known.push(id);
  const mill = st.sites.find((x) => x.plan === 'hydro')!;
  forceCompleteSite(sim, mill);
  const hy = st.buildings.find((b) => b.kind === 'hydro')!;
  const raise = (plan: PlanId, x: number, z: number, size?: number, at?: { cx: number; cz: number }) => {
    const kind = plan === 'tower' || plan === 'pole' ? plan : undefined;
    const c = at ?? findSpot(sim, x, z, 9, size, kind) ?? fail(`no room for a ${plan} near ${x.toFixed(0)}, ${z.toFixed(0)}`);
    sim.apply({ t: 'place', hero: h.id, plan, cx: c.cx, cz: c.cz });
    forceCompleteSite(sim, st.sites[st.sites.length - 1]);
    return st.buildings[st.buildings.length - 1];
  };
  const fit = (b: Building, d: DeviceId) => {
    sim.apply({ t: 'placeDevice', hero: h.id, plan: d, building: b.id });
    const site = st.sites.find((x) => x.plan === d && x.building === b.id && sim.alive(x.id)) ?? fail(`no ${d} site`);
    forceCompleteSite(sim, site);
  };
  const settle = () => {
    for (let i = 0; i < 12; i++) sim.step();
  };
  // A tower far out on the road, away from the wall and any pole: a searchlight sits dark; a solar
  // roof runs it by day, not at night.
  const far = cellCenter(roadSpot(sim, 40, 7).cx, roadSpot(sim, 40, 7).cz);
  const lonely = raise('tower', far.x, far.z);
  fit(lonely, 'searchlight');
  const clock = (tod: number) => {
    st.dev = true;
    sim.apply({ t: 'setTime', tod, hold: true });
    st.dev = false;
  };
  clock(0.5);
  settle();
  if (lonely.devicesOn) fail('a device with no power should sit dark');
  fit(lonely, 'solar');
  settle();
  if (!lonely.devicesOn) fail('a solar roof should run its tower\'s devices by day');
  clock(0.02);
  settle();
  if (lonely.devicesOn || lonely.lit) fail('at night a solar roof alone should leave the devices dark');
  // On the grid: poles from the watermill through town up onto the wall-walk; beyond it a tower
  // carries the line on — out past the reach of the wall's torches, so only its searchlight lights it.
  const north = sim.world.lanes[0];
  let out: { cx: number; cz: number } | null = null;
  for (let d = 10; d < 40 && !out; d += 0.5) {
    const p = lanePos(north, north.length - d, 5.6);
    const f = findSpot(sim, p.x, p.z, 1, sizeOf('tower'), 'tower');
    const c = f && cellCenter(f.cx, f.cz);
    if (c && wallDist(c.x, c.z) > NIGHT.town + 0.4 && wallDist(c.x, c.z) < POWER.link - 0.5) out = f;
  }
  if (!out) fail('no room for a tower by the North Road beyond the reach of the wall\'s torches');
  const target = cellCenter(out!.cx, out!.cz);
  const top = wallSpot(sim, 'pole', target.x, target.z) ?? fail('no room for a pole on the wall-walk');
  const at = cellCenter(top.cx, top.cz);
  let px = hy.x;
  let pz = hy.z;
  for (let i = 0; i < 10 && Math.hypot(at.x - 2 - px, at.z - pz) > 12; i++) {
    const l = Math.hypot(at.x - 2 - px, at.z - pz);
    const p = raise('pole', px + ((at.x - 2 - px) / l) * 11.5, pz + ((at.z - pz) / l) * 11.5, 1);
    px = p.x;
    pz = p.z;
  }
  const pole = raise('pole', 0, 0, 1, top);
  if (!onWall(pole.x, pole.z)) fail('the last pole should stand up on the wall-walk');
  const t = raise('tower', 0, 0, undefined, out!);
  if (wallDist(t.x, t.z) <= NIGHT.town) fail(`the powered tower should stand beyond the wall's torches (${wallDist(t.x, t.z).toFixed(1)} m)`);
  fit(t, 'searchlight');
  settle();
  if (!pole.powered) fail('the poles did not carry the power up onto the wall');
  if (!t.powered || !t.devicesOn) fail(`a tower within reach of a live pole should run its devices (powered ${t.powered})`);
  if (!t.lit) fail('a live searchlight should light its tower at night');
  // The beam: a warrior in it takes more.
  const lane = sim.world.lanes[0];
  const e = spawnEnemy(sim, 'warrior', 0, 0, { d: laneProject(lane, t.x, t.z).d, lat: 0 });
  e.spawnT = 0;
  e.hp = e.maxHp = 1e6;
  e.stunT = 99;
  t.aimX = e.x;
  t.aimZ = e.z;
  for (let i = 0; i < 3; i++) sim.step();
  if (!((e.spotT ?? 0) > 0)) fail('the dead in a searchlight\'s beam should be lit up');
  const hp0 = e.hp;
  damageEnemy(sim, e, 100, 'pierce', 0, false);
  const lit = hp0 - e.hp;
  e.spotT = 0;
  const hp1 = e.hp;
  damageEnemy(sim, e, 100, 'pierce', 0, false);
  const dark = hp1 - e.hp;
  if (Math.abs(lit / dark - (1 + DEVICE.searchBonus)) > 1e-6) fail(`the beam should add ${DEVICE.searchBonus * 100}% damage (×${(lit / dark).toFixed(3)})`);
  // Radar: intel.
  const intel0 = st.intel;
  fit(t, 'radar');
  settle();
  if (!(st.intel > intel0)) fail('a live radar dish should give wave intel');
  // Overloaded: everything browns out.
  for (const d of ['targeter', 'relay'] as DeviceId[]) fit(t, d);
  // A tower further out takes the line on from the first: the grid runs tower to tower along the road.
  const extra = raise('tower', t.x + 7, t.z + 6);
  settle();
  if (!extra.powered || Math.hypot(extra.x - pole.x, extra.z - pole.z) <= POWER.link) fail(`a tower out of the poles' reach should be on the grid through the tower beside it (${extra.powered})`);
  for (const d of ['searchlight', 'radar', 'targeter', 'relay'] as DeviceId[]) fit(extra, d);
  settle();
  if (!(st.grid!.demand > st.grid!.supply) || t.devicesOn || extra.devicesOn) fail(`an overloaded grid should brown the devices out (${st.grid!.demand}/${st.grid!.supply} W)`);
  const over = `${st.grid!.demand}/${st.grid!.supply} W`;
  for (const d of ['searchlight', 'radar', 'targeter'] as DeviceId[]) sim.apply({ t: 'removeDevice', hero: h.id, building: extra.id, device: d });
  settle();
  if (!t.devicesOn || !extra.devicesOn) fail(`with load taken off, the devices should run again (${st.grid!.demand}/${st.grid!.supply} W)`);
  // Relays near each other: faster.
  const speed = (b: Building) => {
    b.cooldown = 5;
    for (let i = 0; i < 20; i++) sim.step();
    return 5 - b.cooldown;
  };
  const linked = speed(t);
  sim.apply({ t: 'removeDevice', hero: h.id, building: extra.id, device: 'relay' });
  settle();
  const alone = speed(t);
  if (Math.abs(linked / alone - (1 + DEVICE.relayRate)) > 0.02) fail(`relayed towers should shoot ${DEVICE.relayRate * 100}% faster (×${(linked / alone).toFixed(3)})`);
  // Rare-earth magnets from Space: a magnet dynamo doubles the watermill's power.
  const supply0 = st.grid!.supply;
  h.known.push('dynamo');
  st.dev = true;
  sim.apply({ t: 'upgradeBuilding', hero: h.id, building: hy.id, plan: 'dynamo' });
  st.dev = false;
  settle();
  if (st.grid!.supply !== supply0 * 2 || !hy.upgrades?.includes('dynamo')) fail(`a magnet dynamo should double the watermill's power (${supply0} → ${st.grid!.supply} W)`);
  const copy = new Sim({ seed: 71 });
  restore(copy, JSON.parse(JSON.stringify(snapshot(sim))));
  if ((copy.getAs(t.id, 'building')!.devices ?? []).join() !== (t.devices ?? []).join()) fail('a save lost the devices');
  console.log(`devices ✓ (dark without power; a solar roof by day only; on the grid they run; overloaded (${over}) they brown out; a searchlight lights its tower and its beam adds ${DEVICE.searchBonus * 100}%; radar intel; relays ×${(linked / alone).toFixed(2)}; a magnet dynamo doubles the watermill (${supply0} → ${st.grid!.supply} W); saved)`);
}
// The world: the dead's roads run from their crypts to the wall's gate (and nowhere else in our
// lands); bridges are one deck between solid parapets — walked in town, out of bounds on the dead's
// roads beyond the wall (no hero goes there); heroes can swim.
{
  const sim = new Sim({ seed: 9 });
  for (const lane of sim.world.lanes) {
    const ex = lane.xs[lane.xs.length - 1];
    const ez = lane.zs[lane.zs.length - 1];
    if (Math.abs(ex - GATE.x) > 0.6 || Math.abs(ez - GATE.z) > 0.6) fail(`${lane.def.name} ends at ${ex.toFixed(1)}, ${ez.toFixed(1)} — not at the gate`);
    for (let i = 0; i < lane.xs.length; i++) if (insideWalls(lane.xs[i], lane.zs[i])) fail(`${lane.def.name} runs inside the walls (${lane.xs[i].toFixed(1)}, ${lane.zs[i].toFixed(1)})`);
    if (lane.length < 140) fail(`${lane.def.name} is only ${lane.length.toFixed(0)} m from its crypt to the gate`);
  }
  for (const b of sim.world.bridges) {
    const sa = Math.sin(b.angle);
    const ca = Math.cos(b.angle);
    const at = (along: number, across: number) => ({ x: b.x + along * sa + across * ca, z: b.z + along * ca - across * sa });
    for (let along = -b.length / 2 - BRIDGE.ends + 0.3; along <= b.length / 2 + BRIDGE.ends - 0.3; along += 0.5) {
      for (let across = -BRIDGE.deckHalf + 0.15; across <= BRIDGE.deckHalf - 0.15; across += 0.35) {
        const p = at(along, across);
        const on = deckAt(sim.world, p.x, p.z);
        if (on === 'rail' || (Math.abs(along) < b.length / 2 && on !== 'deck')) fail(`bridge deck not a deck at along ${along.toFixed(1)}, across ${across.toFixed(1)}`);
        if (groundHeight(sim.world, p.x, p.z) < b.deckY - 0.01) fail('the deck sinks below its height: the dead would fall through');
        if (walkableAt(sim, p.x, p.z) === outsideWalls(b.x, b.z)) fail(outsideWalls(b.x, b.z) ? 'a hero could walk a bridge out beyond the wall' : `a bridge in town is not walkable at along ${along.toFixed(1)}, across ${across.toFixed(1)}`);
      }
      const rail = at(along, BRIDGE.deckHalf + BRIDGE.rail / 2);
      if (Math.abs(along) < b.length / 2 && walkableAt(sim, rail.x, rail.z)) fail('you can walk through a parapet');
      if (deckAt(sim.world, rail.x, rail.z) !== 'rail') fail('parapets are not where the model has them');
    }
  }
  let swim: { x: number; z: number } | null = null;
  for (let z = -40; z < 40 && !swim; z += 0.5) for (let x = -40; x < 20 && !swim; x += 0.5) if (waterDepth(sim.world, x, z) > 0.6 && walkableAt(sim, x, z)) swim = { x, z };
  if (!swim) fail('heroes cannot get into deep water');
  const h = sim.state.heroes[0];
  h.x = swim!.x;
  h.z = swim!.z;
  if (heroSpeed(sim, h) >= 2) fail('swimming should be slower than running');
  const k = Math.floor(swim!.z - MAP.minZ) * Math.round(MAP.maxX - MAP.minX) + Math.floor(swim!.x - MAP.minX);
  if (sim.walkStatic[k]) fail('soldiers and pathing must stay out of the water');
  console.log(`world ✓ (the roads run ${sim.world.lanes.map((l) => l.length.toFixed(0)).join('/')} m from the crypts to the gate, never inside the walls; ${sim.world.bridges.length} bridges one deck between solid parapets (those on the roads out of bounds); heroes swim at ${heroSpeed(sim, h).toFixed(2)} m/s)`);
}

// Classes: Tank, Support, Magic — their health, skills and the class change.
{
  const sim = new Sim({ seed: 13 });
  const st = sim.state;
  const h = st.heroes[0];
  if (h.cls !== 'tank' || h.maxHp !== 600) fail(`a new hero should be a 600-health Knight (is ${h.cls}, ${h.maxHp})`);
  sim.apply({ t: 'chooseClass', hero: h.id, cls: 'magic' });
  if (h.cls !== 'magic' || h.maxHp !== 320) fail('changing class to Mage');
  // A camp creature (the dead on the roads are beyond any hero), the hero 6 m away.
  const camp = st.camps[0];
  const e = spawnCampEnemy(sim, 'warrior', camp.id, camp.x, camp.z);
  e.spawnT = 0;
  h.x = e.x + 6;
  h.z = e.z;
  const hp0 = e.hp;
  sim.apply({ t: 'cast', hero: h.id, ability: 'fireball', target: e.id });
  if (!st.projs.some((p) => p.kind === 'fireball')) fail('Fireball did not fly');
  for (let i = 0; i < 20; i++) sim.step();
  if (e.hp >= hp0) fail('Fireball did no damage');
  sim.apply({ t: 'cast', hero: h.id, ability: 'slam', target: e.id });
  if (h.cds.slam > 0) fail("a Mage cast the Knight's Shield Bash");
  sim.apply({ t: 'chooseClass', hero: h.id, cls: 'support' });
  if (h.cls !== 'magic') fail('class changed with the dead right there');
  // (Away by the gate, far from any camp.)
  h.x = MAP.heroStart.x;
  h.z = MAP.heroStart.z;
  sim.apply({ t: 'chooseClass', hero: h.id, cls: 'support' });
  if (h.cls !== 'support') fail('changing class to Warchief');
  h.hp = 100;
  sim.apply({ t: 'cast', hero: h.id, ability: 'mend' });
  if (h.hp <= 100) fail('Mend did not heal');
  // Keep state: a save carries the class.
  const copy = new Sim({ seed: 13 });
  restore(copy, JSON.parse(JSON.stringify(snapshot(sim))));
  if (copy.state.heroes[0].cls !== 'support') fail('a save lost the hero class');
  console.log(`classes ✓ (Knight 600 hp → Mage 320: Fireball hits ${Math.round(hp0 - e.hp)}; no Knight skills for a Mage; no class change next to the dead; Mend heals; saves keep the class)`);
}
// The dead on the roads are beyond any hero: they walk the field beyond the wall, where no hero goes.
// A hero may not attack or target them, from anywhere; were a blow of theirs ever to land it would
// kill — even a Knight behind his shield wall — and a hero's spells barely scratch them (though the
// whole blow is felt). Camp creatures are a fair fight.
{
  const sim = new Sim({ seed: 19 });
  const st = sim.state;
  st.nextWaveAt = st.time + 1e6;
  const h = st.heroes[0];
  const lane = sim.world.lanes[0];
  const e = spawnEnemy(sim, 'warrior', 0, 0, { d: lane.length - 6, lat: 0 });
  e.spawnT = 0;
  const pin = () => {
    e.d = lane.length - 6;
    e.stunT = 0.2;
  };
  pin();
  sim.step();
  // Up on the wall-walk right above it.
  const above = walkSpot(e.x, e.z);
  h.x = h.px = above.x;
  h.z = h.pz = above.z;
  let denied = '';
  sim.events.on('denied', (ev) => (denied = ev.reason));
  for (let i = 0; i < 40; i++) {
    pin();
    sim.step();
  }
  if (h.task.k === 'attack' || e.hp < e.maxHp || h.dead) fail('a hero on the wall and the dead below should leave each other be');
  sim.apply({ t: 'attack', hero: h.id, target: e.id });
  if (h.task.k === 'attack' || denied !== LANE_DEAD.why) fail(`attacking the dead on the road should be refused (${denied})`);
  denied = '';
  sim.apply({ t: 'cast', hero: h.id, ability: 'slam', target: e.id });
  if ((h.cds.slam ?? 0) > 0 || denied !== LANE_DEAD.why) fail('Shield Bash on the dead on the road should be refused');
  // Their blow kills a Knight behind his shield wall.
  sim.apply({ t: 'cast', hero: h.id, ability: 'wall' });
  if (!(h.wallT > 0)) fail('Shield Wall did not go up');
  let hits = 0;
  let by = 0;
  sim.events.on('heroHit', (ev) => ev.hero === h.id && hits++);
  sim.events.on('heroDied', (ev) => ev.hero === h.id && (by = ev.by ?? 0));
  damageHero(sim, h, ENEMIES[e.kind].damage, !e.camp, e.id);
  if (!h.dead || hits !== 1 || by !== e.id) fail(`one blow from the dead on the road should kill even a walled Knight (dead ${h.dead}, ${hits} hits)`);
  // A Mage's spell barely scratches it (and angers it).
  h.dead = false;
  h.respawnT = 0;
  h.hp = h.maxHp;
  const hp0 = (e.hp = e.maxHp);
  e.threat = 0;
  damageEnemy(sim, e, ABILITIES.nova.damage!, 'frost', h.id, false);
  const lost = hp0 - e.hp;
  if (!(lost > 0) || lost > 3) fail(`a hero's spell should barely scratch the dead on the road (took ${lost.toFixed(2)})`);
  // It feels the whole blow (that's what angers the dead), though only a scratch lands.
  if (e.threat < ((lost / LANE_DEAD.heroDamage) / e.maxHp) * 100 * 0.9) fail(`the dead should feel the whole blow (threat ${e.threat.toFixed(1)})`);
  // A camp warrior: a fair fight — its blow hurts, it doesn't kill.
  const sim2 = new Sim({ seed: 19 });
  const h2 = sim2.state.heroes[0];
  const camp = sim2.state.camps[0];
  const c = spawnCampEnemy(sim2, 'warrior', camp.id, camp.x, camp.z);
  c.spawnT = 0;
  h2.x = c.x + 0.6;
  h2.z = c.z;
  let hurt = 0;
  sim2.events.on('heroHit', (ev) => (hurt = ev.amount));
  sim2.apply({ t: 'attack', hero: h2.id, target: c.id });
  for (let i = 0; i < 20 * 4 && !hurt; i++) sim2.step();
  if (!hurt || h2.dead || hurt >= h2.maxHp * 0.2) fail(`a camp warrior should hurt a hero, not crush him (${hurt.toFixed(0)} of ${h2.maxHp})`);
  console.log(`lane dead ✓ (from the wall above, they and the hero leave each other be; no attacking or targeting them; a blow of theirs kills a walled Knight; a frost nova takes ${lost.toFixed(1)} hp but is felt in full; a camp warrior hits for ${hurt.toFixed(0)})`);
}
// Esc stops a fight: no swinging at the dead in reach until the player attacks again.
{
  const sim = new Sim({ seed: 17 });
  const h = sim.state.heroes[0];
  const camp = sim.state.camps[0];
  const e = spawnCampEnemy(sim, 'warrior', camp.id, camp.x, camp.z);
  e.spawnT = 0;
  const at = { x: e.x, z: e.z };
  const pin = () => {
    // Hold the camp warrior still next to the hero.
    e.x = at.x;
    e.z = at.z;
    e.stunT = 1;
    h.x = e.x + 0.5;
    h.z = e.z;
  };
  pin();
  sim.apply({ t: 'attack', hero: h.id, target: e.id });
  for (let i = 0; i < 10; i++) {
    pin();
    sim.step();
  }
  if (h.task.k !== 'attack') fail('the hero did not fight');
  sim.apply({ t: 'stop', hero: h.id, peace: true });
  const hp = e.hp;
  for (let i = 0; i < 60; i++) {
    pin();
    sim.step();
  }
  if (h.task.k === 'attack' || e.hp < hp) fail('the hero went on fighting after Esc');
  sim.apply({ t: 'attack', hero: h.id, target: e.id });
  for (let i = 0; i < 40; i++) {
    pin();
    sim.step();
  }
  if (e.hp >= hp) fail('attacking again did not resume the fight');
  console.log('esc ✓ (stop fighting: no swinging at the dead in reach until you attack again)');
}

// The Warchief's scout drone: flies within range, uncovers land, runs out of battery and comes
// home, and can be shot down.
{
  const sim = new Sim({ seed: 21 });
  const st = sim.state;
  const h = st.heroes[0];
  sim.apply({ t: 'chooseClass', hero: h.id, cls: 'support' });
  sim.apply({ t: 'cast', hero: h.id, ability: 'drone' });
  if (!h.droneOn || h.task.k !== 'pilot') fail('the drone did not launch');
  const hx = h.x;
  const hz = h.z;
  sim.apply({ t: 'pose', hero: h.id, x: h.x + 1, z: h.z, facing: 0, look: 0, gait: 'fwd', moving: true });
  if (h.x !== hx) fail('the pilot walked while flying the drone');
  const explored0 = st.explored.reduce((a, b) => a + b, 0);
  // Steer it east for a long way: it stops at the edge of its range.
  for (let i = 0; i < 400; i++) {
    sim.apply({ t: 'droneMove', hero: h.id, x: (h.droneX ?? h.x) + 0.4, z: h.droneZ ?? h.z });
    sim.step();
  }
  const far = Math.hypot((h.droneX ?? 0) - hx, (h.droneZ ?? 0) - hz);
  if (far > DRONE.range + 0.01 || far < DRONE.range - 1) fail(`the drone should stop at its range (${far.toFixed(1)} m)`);
  if (st.explored.reduce((a, b) => a + b, 0) <= explored0) fail('the drone uncovered nothing');
  sim.apply({ t: 'cast', hero: h.id, ability: 'mend' });
  if (h.cds.mend > 0) fail('the pilot cast a skill with the controls in hand');
  // Battery: it comes home by itself and docks.
  for (let i = 0; i < 20 * (DRONE.battery + 10) && h.droneOn; i++) sim.step();
  if (h.droneOn || h.task.k === 'pilot') fail('the drone never came home');
  if (h.cds.drone <= 0) fail('the drone has no cooldown after docking');
  // Shot down: a wraith right under it.
  h.cds.drone = 0;
  sim.apply({ t: 'cast', hero: h.id, ability: 'drone' });
  const lane = sim.world.lanes[0];
  const wraith = spawnEnemy(sim, 'wraith', 0, 0, { d: lane.length * 0.6, lat: 0 });
  wraith.spawnT = 0;
  h.droneX = wraith.x;
  h.droneZ = wraith.z;
  h.x = wraith.x + 20;
  h.z = wraith.z;
  let downs = 0;
  sim.events.on('droneDown', () => downs++);
  for (let i = 0; i < 20 * 15 && h.droneOn; i++) {
    h.droneX = wraith.x;
    h.droneZ = wraith.z;
    sim.step();
  }
  if (h.droneOn || downs !== 1) fail('a wraith did not bring the drone down');
  if (h.cds.drone < DRONE.downCooldown - 1) fail('a downed drone should be out for a long while');
  console.log(`drone ✓ (flies to its ${DRONE.range} m range and stops; uncovers land; pilot stands, no skills; battery brings it home; a wraith shoots it down)`);
}
// The home ring: wood, stone, scrap, ore, crystal and a mine head a short walk from the gate, the
// wilds further out richer; down the mine (the Ashdeep): the lift station sends its lines out, a
// wagon waiting at every platform, only the Copper Line open; rock all round and overhead; every
// item of the underground in its rock, and the minerals showing in the walls; a ride to the Copper
// Face, its wall hacked at with the pickaxe — pieces break away, the wall gives, copper in the bag,
// on along the vein — plain rock giving stone now and then, deeper rock harder, and the rock only so
// deep (the mine stays a mine: nothing dug round a cave-in); the line on caved in until dynamite
// blows it open (for good); on to the Ruby Gallery, richer, where its guardians come for you and
// leave their spoils; dynamite on a wall brings a stretch of it down; saves keep it all, and a game
// from before the rework comes into this mine with everyone's things; back to the station by wagon
// and out of the mine head's door.
{
  const sim = new Sim({ seed: 5 });
  const st = sim.state;
  const h = st.heroes[0];
  const from = (x: number, z: number) => Math.hypot(x - h.x, z - h.z);
  const near = (kind: string) => Math.min(...st.nodes.filter((n) => n.kind === kind).map((n) => from(n.x, n.z)));
  for (const [kind, most] of [['tree', 12], ['rock', 12], ['scrap', 10], ['ore', 20], ['crystal', 22]] as const) {
    if (near(kind) > most) fail(`the nearest ${kind} is ${near(kind).toFixed(1)} m from the start (want ${most} m at most)`);
  }
  const head = st.pois.find((p) => p.kind === 'mine' && p.mine === 0)!;
  if (from(head.x, head.z) > 22) fail(`the home mine head is ${from(head.x, head.z).toFixed(1)} m from the start`);
  if (st.pois.filter((p) => p.kind === 'mine').length !== 1) fail('there should be one mine head (the old shafts are no mines any more)');
  const ring = (['tree', 'rock', 'scrap', 'ore'] as const).map((k) => `${k} ${near(k).toFixed(0)} m`).join(', ') + `, mine head ${from(head.x, head.z).toFixed(0)} m`;
  // Rocks, ore and crystal (no kinds within a kind): how full they are against the usual amount. The
  // home ring is by the gate (the start), so "far out" is far from it — deep in the vale, up the hills.
  const amount = (far: boolean) => {
    const list = st.nodes.filter((n) => (n.kind === 'rock' || n.kind === 'ore' || n.kind === 'crystal') && (far ? from(n.x, n.z) > 70 : from(n.x, n.z) < 40));
    return list.reduce((a, n) => a + n.max / NODES[n.kind].amount, 0) / list.length;
  };
  if (amount(true) < amount(false) * 1.25) fail(`the wilds far out should be richer (${amount(true).toFixed(2)}× vs ${amount(false).toFixed(2)}×)`);
  // Walk over and ride down.
  let rides = 0;
  sim.events.on('rideLift', () => rides++);
  const door = st.mines[0].exit;
  sim.apply({ t: 'move', hero: h.id, x: door.x, z: door.z });
  let walked = 0;
  for (; walked < 30 && h.task.k === 'move'; walked += DT) sim.step();
  sim.apply({ t: 'interact', hero: h.id, target: head.id });
  for (let i = 0; i < 20 * 3 && !rides; i++, walked += DT) sim.step();
  const m = st.mines[0];
  if (!rides || Math.hypot(h.x - m.lift.x, h.z - m.lift.z) > 3) fail('could not walk to the home mine head and ride the lift down');
  const plan = mineLayout();
  // The lift station: its lines leave in 3–4 directions, a wagon waiting at every platform.
  if (plan.lines.length < 3 || plan.lines.length > 4) fail(`the station should send 3–4 lines out (${plan.lines.length})`);
  const heading = plan.lines.map((l) => pathAt(l, 3)).map((p) => Math.atan2(p.x - m.lift.x, p.z - m.lift.z));
  for (let i = 0; i < heading.length; i++) {
    for (let j = i + 1; j < heading.length; j++) {
      if (Math.abs(Math.atan2(Math.sin(heading[i] - heading[j]), Math.cos(heading[i] - heading[j]))) < Math.PI / 3) fail('two lines leave the station the same way');
    }
  }
  const platform = plan.wagons.filter((w) => w.leg === 0 && w.dir > 0);
  if (platform.length !== plan.lines.length || platform.some((w) => Math.hypot(w.x - m.lift.x, w.z - m.lift.z) > STATION.r - 1)) fail('a wagon should wait at every platform in the station');
  // Copper is the first line, open from the start; every other line (and every Grade II) is caved in.
  if (plan.lines[0].mineral !== 'Copper' || legBlocked(m, platform[0])) fail('the Copper Line should be open from the start');
  if (platform.slice(1).some((w) => !legBlocked(m, w))) fail('the other lines should start caved in');
  if (plan.wagons.filter((w) => w.leg === 1).some((w) => !legBlocked(m, w))) fail('every Grade II should start caved in');
  // Rock all round and overhead: roofs of 3–5½ person-heights, lower in the drifts than in the chambers.
  const roofs = plan.chambers.map((c) => mineRoof(m, c.x, c.z));
  const driftAt = pathAt(plan.lines[0], 6.6);
  const drift = mineRoof(m, driftAt.x, driftAt.z);
  if (roofs.some((r) => r < 1.9 || r > 2.8) || drift < 1.45 || drift >= Math.min(...roofs)) fail(`roofs: chambers ${roofs.map((r) => r.toFixed(2)).join(' ')}, drift ${drift.toFixed(2)}`);
  if (mineOpen(m, m.lift.x + 30, m.lift.z + 30) || mineSdf(m, m.lift.x + 30, m.lift.z + 30) < 0) fail('the rock should close in round the mine');
  // Every item of the underground is in the mine's rock (all five raw gems too) — and every mineral of
  // every chamber shows in its walls as the mine is found (you see where to dig).
  const items = mineItems();
  const want: ItemId[] = ['coal', 'copper', 'ore', 'silver', 'nugget', 'quartz', 'sulfur', 'stone', ...COLOR_ORDER];
  const missing = want.filter((i) => !items.has(i));
  if (missing.length) fail(`the mine's rock gives no ${missing.join(', ')}`);
  const showing = (zone: number) => {
    const out = new Set<number>();
    for (let k = 0; k < plan.dig.zone.length; k++) if (plan.dig.zone[k] === zone && !digBlocker(m, k)) out.add(plan.dig.mineral[k]);
    return out;
  };
  plan.zones.forEach((z, zi) => {
    const show = showing(zi);
    const hidden = Object.keys(z.holds).map(Number).filter((min) => !show.has(min));
    if (hidden.length) fail(`${z.name}: ${hidden.map((x) => MINERALS[x as MineralId].name).join(', ')} nowhere in its walls`);
  });
  // Copper and coal (and the first topaz, for the first gem) are a short ride — or walk — from the lift.
  const giZone = plan.zones.findIndex((z) => z.chamber === plan.lines[0].chambers[0]);
  const gi = plan.chambers[plan.lines[0].chambers[0]];
  const giHolds = plan.zones[giZone].holds;
  if (!giHolds[MIN.copper] || !giHolds[MIN.coal] || !giHolds[MIN.topaz] || Math.hypot(gi.x - m.lift.x, gi.z - m.lift.z) > 18) fail('copper, coal and topaz should be in the Copper Face, close to the lift');
  // The mine stays a mine: with all its workable rock dug out, nothing beyond a shut cave-in is reached.
  {
    const all: Mine = { ...m, dug: [], dmg: {}, open: m.open.map(() => false) };
    for (let k = 0; k < plan.dig.zone.length; k++) if (plan.dig.zone[k] >= 0 && plan.dig.depth[k] >= 0) all.dug.push(k);
    const seen = new Set<string>();
    const queue: [number, number][] = [[m.lift.x, m.lift.z]];
    const key = (x: number, z: number) => `${Math.round(x * 2)},${Math.round(z * 2)}`;
    seen.add(key(m.lift.x, m.lift.z));
    while (queue.length) {
      const [x, z] = queue.pop()!;
      for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
        const nx = x + dx;
        const nz = z + dz;
        const k = key(nx, nz);
        if (seen.has(k) || !mineOpen(all, nx, nz)) continue;
        seen.add(k);
        queue.push([nx, nz]);
      }
    }
    const reached = (x: number, z: number) => seen.has(key(Math.round(x * 2) / 2, Math.round(z * 2) / 2)) || [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].some(([dx, dz]) => seen.has(key(Math.round((x + dx) * 2) / 2, Math.round((z + dz) * 2) / 2)));
    const beyond = plan.wagons.filter((w) => w.leg === 1 && w.dir < 0).concat(platform.slice(1).map((w) => plan.wagons[w.to]));
    if (beyond.some((w) => reached(w.ax, w.az))) fail('digging the rock out should never get round a cave-in');
    if (!reached(plan.wagons[platform[0].to].ax, plan.wagons[platform[0].to].az)) fail('the Copper Face should be reached on foot');
  }
  // A ride: in at the platform, rolled along the line (no walking meanwhile), out at the Copper Face.
  let ends = 0;
  sim.events.on('rideEnd', () => ends++);
  h.x = h.px = platform[0].ax;
  h.z = h.pz = platform[0].az;
  sim.apply({ t: 'ride', hero: h.id, wagon: platform[0].id });
  if (!h.ride) fail('climbing into the waiting wagon');
  sim.apply({ t: 'pose', hero: h.id, x: h.x + 1, z: h.z, facing: 0, look: 0, gait: 'fwd', moving: true });
  let rode = 0;
  for (; rode < 20 && h.ride; rode += DT) sim.step();
  if (h.ride || ends !== 1 || rode < 1.5 || rode > 6 || Math.hypot(h.x - gi.x, h.z - gi.z) > gi.r || !walkableAt(sim, h.x, h.z)) {
    fail(`the ride to the Copper Face (${rode.toFixed(1)} s, ${Math.hypot(h.x - gi.x, h.z - gi.z).toFixed(1)} m from its middle)`);
  }
  // Hacking at the Copper Face: the nearest copper showing in the wall.
  h.tools.push('pickaxe');
  /** Where a hero stands to hack at piece k: out from its middle to open ground. */
  const standBy = (k: number) => {
    const c = digCenter(k);
    for (let r = 0.6; r < 2; r += 0.1) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        const x = c.x + Math.sin(a) * r;
        const z = c.z + Math.cos(a) * r;
        if (bodyFree(sim, x, z)) return { x, z };
      }
    }
    return null;
  };
  const showingOf = (min: number, zone: number) => {
    const out: number[] = [];
    for (let k = 0; k < plan.dig.zone.length; k++) if (plan.dig.zone[k] === zone && plan.dig.mineral[k] === min && !digBlocker(m, k)) out.push(k);
    return out.sort((a, b) => from(digCenter(a).x, digCenter(a).z) - from(digCenter(b).x, digCenter(b).z));
  };
  const vein = showingOf(MIN.copper, giZone).find((k) => standBy(k));
  if (vein === undefined) fail('no copper showing in the Copper Face to stand by');
  const spot = standBy(vein!)!;
  h.x = h.px = spot.x;
  h.z = h.pz = spot.z;
  let hits = 0;
  let broke = 0;
  sim.events.on('digHit', () => hits++);
  sim.events.on('cellDug', (e) => !e.blasted && broke++);
  const copper0 = h.bag.copper ?? 0;
  const before = mineSdf(m, digCenter(vein!).x, digCenter(vein!).z);
  sim.apply({ t: 'dig', hero: h.id, x: digCenter(vein!).x, z: digCenter(vein!).z });
  if (h.task.k !== 'dig') fail('hacking at the copper in the wall');
  for (let i = 0; i < 20 * 6 && !m.dug.includes(vein!); i++) sim.step();
  if (!m.dug.includes(vein!) || (h.bag.copper ?? 0) <= copper0) fail(`a piece of the copper vein should break away into the bag (${hits} strikes)`);
  if (hits !== cellHits(vein!)) fail(`a piece breaks after its strikes (${hits} of ${cellHits(vein!)})`);
  if (!(before >= 0 && mineSdf(m, digCenter(vein!).x, digCenter(vein!).z) < 0)) fail('the wall should give where the piece came away');
  // On along the vein: the pickaxe keeps at it while there's copper in reach.
  for (let i = 0; i < 20 * 12; i++) sim.step();
  if ((h.bag.copper ?? 0) < copper0 + 3 || broke < 3) fail(`hacking on along the copper vein (${(h.bag.copper ?? 0) - copper0} copper, ${broke} pieces)`);
  // Plain rock gives stone now and then; deeper rock takes more strikes; the rock's limits hold.
  const rockKs = [...Array(plan.dig.zone.length).keys()].filter((k) => plan.dig.zone[k] === giZone && plan.dig.mineral[k] === MIN.rock);
  const stones = rockKs.filter((k) => cellYield(k) === 'stone').length;
  if (stones < rockKs.length * 0.3 || stones > rockKs.length * 0.7) fail(`plain rock should give stone about every other piece (${stones} of ${rockKs.length})`);
  const deepK = [...Array(plan.dig.zone.length).keys()].find((k) => plan.dig.zone[k] === giZone && plan.dig.depth[k] > 2.2 && plan.dig.mineral[k] === MIN.copper);
  if (deepK === undefined || cellHits(deepK) <= MINERALS[MIN.copper].hits) fail('deeper rock should take more strikes');
  const station = digCellAt(m.lift.x + STATION.r + 0.2, m.lift.z + 0.5);
  if (!digBlocker(m, station)) fail("the station's walls should not give");
  h.task = { k: 'idle' };
  // On to Grade II: caved in.
  const on = plan.wagons.find((w) => w.line === 0 && w.leg === 1 && w.dir > 0)!;
  h.x = h.px = on.ax;
  h.z = h.pz = on.az;
  let denied = '';
  const unDeny = sim.events.on('denied', (e) => (denied = e.reason));
  sim.apply({ t: 'ride', hero: h.id, wagon: on.id });
  if (h.ride || !/caved in/i.test(denied)) fail(`the line beyond the Copper Face should be caved in (${denied})`);
  // Dynamite: lit at the rubble's edge, facing it; then run. It blows the cave-in open for good.
  const ci = plan.caveins.findIndex((c) => c.line === 0 && c.d > plan.lines[0].stopI);
  const cave = plan.caveins[ci];
  let d = on.d + 1;
  while (d < cave.d && walkableAt(sim, pathAt(plan.lines[0], d + 0.3).x, pathAt(plan.lines[0], d + 0.3).z)) d += 0.1;
  const edge = pathAt(plan.lines[0], d);
  h.x = h.px = edge.x;
  h.z = h.pz = edge.z;
  h.facing = Math.atan2(cave.x - h.x, cave.z - h.z);
  h.bag.dynamite = 1;
  let cleared = 0;
  sim.events.on('caveInCleared', () => cleared++);
  sim.apply({ t: 'blast', hero: h.id });
  if (h.bag.dynamite || st.bombs.length !== 1) fail('the dynamite should be lit');
  h.x = h.px = on.ax;
  h.z = h.pz = on.az;
  for (let i = 0; i < 20 * 4; i++) sim.step();
  if (!m.open[ci] || cleared !== 1) fail('dynamite did not blow the cave-in open');
  if (!walkableAt(sim, cave.x, cave.z)) fail('the rubble should be cleared off the line');
  // Ride on to Grade II.
  denied = '';
  sim.apply({ t: 'ride', hero: h.id, wagon: on.id });
  if (!h.ride) fail(`riding on to the Ruby Gallery (${denied})`);
  rode = 0;
  for (; rode < 20 && h.ride; rode += DT) sim.step();
  const gii = plan.chambers[plan.lines[0].chambers[1]];
  if (h.ride || Math.hypot(h.x - gii.x, h.z - gii.z) > gii.r) fail('the ride on to the Ruby Gallery');
  // Grade II is richer: more of its rock is mineral than Grade I's, and it holds rubies.
  const giiZone = plan.zones.findIndex((z) => z.chamber === plan.lines[0].chambers[1]);
  const share = (zi: number) => {
    const hold = plan.zones[zi].holds;
    const all = Object.values(hold).reduce((a, b) => a + (b ?? 0), 0);
    return 1 - (hold[MIN.rock] ?? 0) / all;
  };
  if (share(giiZone) <= share(giZone) || !plan.zones[giiZone].holds[MIN.ruby]) fail(`Grade II should be richer than Grade I (${share(giiZone).toFixed(2)} vs ${share(giZone).toFixed(2)}) and hold rubies`);
  // Its guardians: a lair, and they come for you; cleared, they leave what they sat on — and come back in time.
  const guard = st.camps.find((c) => c.lair && sim.campDef(c).name.includes('Ruby Gallery'));
  if (!guard) fail('the Ruby Gallery should have guardians');
  const guards = () => st.enemies.filter((e) => e.camp === guard!.id && e.hp > 0);
  if (!guards().length || guards().some((e) => !e.camp || ENEMIES[e.kind].boss)) fail('the guardians should be creatures of the camps (a fair fight)');
  for (let i = 0; i < 20 * 3 && !guards().some((e) => e.aggro === h.id); i++) sim.step();
  if (!guards().some((e) => e.aggro === h.id)) fail('the guardians should come for a hero in their chamber');
  const hurt = h.hp;
  for (let i = 0; i < 20 * 3 && h.hp >= hurt; i++) sim.step();
  if (h.hp >= hurt || h.dead) fail('the guardians should hit at a hero’s measure (hurt, not dead)');
  let looted = 0;
  sim.events.on('lairLooted', () => looted++);
  const drops0 = st.drops.length;
  for (const e of guards()) damageEnemy(sim, e, 1e5, 'slash', h.id, false);
  for (let i = 0; i < 3; i++) sim.step();
  if (guards().length || !looted || st.drops.length <= drops0 || !st.drops.some((x) => x.item === 'ruby')) fail('cleared guardians should leave their spoils');
  for (let i = 0; i < 20 * (sim.campDef(guard!).respawn + 3) && !guards().length; i++) sim.step();
  if (!guards().length) fail('a lair should fill again in time');
  for (const e of guards()) damageEnemy(sim, e, 1e5, 'slash', h.id, false);
  // Harder further out: the lairs of the far lines outweigh the first one's.
  const weight = (c: (typeof st.camps)[number]) => sim.campDef(c).members.reduce((n, x) => n + ENEMIES[x.kind].hp * x.count, 0);
  const lairs = st.camps.filter((c) => c.lair);
  const first = lairs.find((c) => sim.campDef(c).name.includes('Old Working'))!;
  const last = lairs.find((c) => sim.campDef(c).name.includes('Vault'))!;
  if (lairs.length < 5 || !first || !last || weight(last) < weight(first) * 3) fail('the lairs should get harder the further out they are');
  // Dynamite on a wall: a whole stretch of it comes down, what it held on the floor.
  const wallK = showingOf(MIN.copper, giiZone).find((k) => standBy(k))!;
  const wallSpot = standBy(wallK)!;
  h.x = h.px = wallSpot.x;
  h.z = h.pz = wallSpot.z;
  h.facing = Math.atan2(digCenter(wallK).x - h.x, digCenter(wallK).z - h.z);
  h.bag.dynamite = 1;
  const dug0 = m.dug.length;
  const floor0 = st.drops.length;
  sim.apply({ t: 'blast', hero: h.id });
  h.x = h.px = on.ax;
  h.z = h.pz = on.az;
  for (let i = 0; i < 20 * 4; i++) sim.step();
  const blasted = m.dug.length - dug0;
  if (blasted < 6 || st.drops.length - floor0 < 3) fail(`dynamite on a wall should bring a stretch of it down (${blasted} pieces, ${st.drops.length - floor0} on the floor)`);
  // The game keeps what's been dug, the open cave-in, the lairs.
  unDeny();
  const copy = new Sim({ seed: 5 });
  restore(copy, JSON.parse(JSON.stringify(snapshot(sim))));
  const cm = copy.state.mines[0];
  if (!cm.open[ci] || cm.dug.length !== m.dug.length || copy.state.camps.length !== st.camps.length) fail('a save lost part of the mine');
  if (mineSdf(cm, digCenter(vein!).x, digCenter(vein!).z) >= 0) fail("a restored mine should keep the rock that's been dug out");
  if (copy.state.camps.some((c) => !copy.campDef(c).members.length)) fail('a restored camp lost its lair');
  // A game from before the rework (four mines of dug-out cells, their lairs, a hero down one) comes
  // into this mine: one mine, its places and lairs; the hero at the lift, his things kept.
  const old = JSON.parse(JSON.stringify(snapshot(sim)));
  const oldMine = (id: number) => ({ id, name: `Old ${id}`, seed: 9, x0: 1600 + id * 200, z0: -36, cells: [0, 2, 2, 0], dmg: {}, lift: { x: 1632, z: -31 }, head: { x: 0, z: 0 }, exit: { x: 0, z: 0 }, lairs: [{ x: 1640, z: 0 }], torches: [], props: [] });
  old.state.mines = [0, 1, 2, 3].map(oldMine);
  old.state.pois = old.state.pois.filter((p: { kind: string }) => p.kind !== 'mine' && p.kind !== 'lift');
  old.state.pois.push({ id: 900001, kind: 'mine', mine: 2, x: 10, z: 50, r: 3.2 }, { id: 900002, kind: 'lift', mine: 2, x: 2032, z: -31, r: 1.4 });
  old.state.camps = old.state.camps.filter((c: { lair?: unknown }) => !c.lair);
  old.state.camps.push({ id: 900003, def: -1, lair: [3, 0], x: 2240, z: 0, alive: 0, respawnT: 100 });
  const oh = old.state.heroes[0];
  oh.x = oh.px = 1810;
  oh.z = oh.pz = 40;
  oh.task = { k: 'dig', mine: 1, cell: 3 };
  oh.bag = { copper: 7, ruby: 2, dynamite: 1 };
  delete oh.ride;
  const v = new Sim({ seed: 5 });
  restore(v, old);
  const vh = v.state.heroes[0];
  const vm = v.state.mines[0];
  if (v.state.mines.length !== 1 || vm.open.some(Boolean) || vm.dug.length || 'cells' in vm) fail('an old game should get the new mine');
  if (Math.hypot(vh.x - vm.lift.x, vh.z - vm.lift.z) > 1 || vh.task.k !== 'idle' || vh.bag.copper !== 7 || vh.bag.ruby !== 2 || vh.bag.dynamite !== 1 || vh.ride !== null) fail('a hero down an old mine should stand at the lift, everything they carried kept');
  if (v.state.pois.filter((p) => p.kind === 'mine').length !== 1 || v.state.pois.filter((p) => p.kind === 'lift').length !== 1) fail('an old game should have one mine head and one lift');
  if (v.state.camps.filter((c) => c.lair).length !== plan.lairs.length || v.state.camps.some((c) => c.lair && !lairDef(c.lair[1]))) fail("an old game should get the mine's lairs");
  for (let i = 0; i < 20; i++) v.step();
  // Back by wagon: the Ruby Gallery → the Copper Face → the station.
  h.task = { k: 'idle' };
  const back2 = plan.wagons.find((w) => w.line === 0 && w.leg === 1 && w.dir < 0)!;
  const back1 = plan.wagons.find((w) => w.line === 0 && w.leg === 0 && w.dir < 0)!;
  h.x = h.px = back2.ax;
  h.z = h.pz = back2.az;
  sim.apply({ t: 'ride', hero: h.id, wagon: back2.id });
  for (let i = 0; i < 20 * 12 && h.ride; i++) sim.step();
  sim.apply({ t: 'ride', hero: h.id, wagon: back1.id });
  for (let i = 0; i < 20 * 12 && h.ride; i++) sim.step();
  if (h.ride || Math.hypot(h.x - platform[0].ax, h.z - platform[0].az) > 0.2) fail('riding back to the station');
  // And up again, out of the mine head's door (on the side facing the gate).
  h.x = m.lift.x + 0.5;
  h.z = m.lift.z + 1.8;
  const lift = st.pois.find((p) => p.kind === 'lift' && p.mine === 0)!;
  sim.apply({ t: 'interact', hero: h.id, target: lift.id });
  for (let i = 0; i < 20 * 5 && rides < 2; i++) sim.step();
  if (rides < 2 || h.x > MAP.maxX) fail('could not ride the lift back up');
  const out = Math.hypot(h.x - head.x, h.z - head.z);
  const front = (h.x - head.x) * (MAP.heroStart.x - head.x) + (h.z - head.z) * (MAP.heroStart.z - head.z);
  if (out > 8 || front <= 0 || !walkableAt(sim, h.x, h.z)) fail(`stepped out of the mine head at the wrong spot (${out.toFixed(1)} m, ${front > 0 ? 'door side' : 'back side'})`);
  console.log(`home ring ✓ (from the start: ${ring} — walked to the mine and rode down in ${walked.toFixed(1)} s; rocks and veins far out hold ${(amount(true) / amount(false)).toFixed(1)}× as much)`);
  console.log(`mines ✓ (the lift station sends ${plan.lines.length} lines out, a wagon at each platform, only copper open; roofs ${drift.toFixed(1)}–${Math.max(...roofs).toFixed(1)} m; every item and all ${COLOR_ORDER.length} gems in the rock, every mineral showing in its chamber's walls; the mine can't be dug round a cave-in; rode to the Copper Face and hacked copper out of its wall (${broke} pieces, the wall giving way, on along the vein), stone from plain rock now and then, deeper rock harder; dynamite opened the cave-in; on to the Ruby Gallery (${(share(giiZone) * 100).toFixed(0)}% ore vs ${(share(giZone) * 100).toFixed(0)}%), its guardians fought and looted, back in time; ${lairs.length} lairs, harder further out; a charge on a wall brought ${blasted} pieces down; saves keep it; an old game comes into the new mine, things kept; back by wagon and out of the door)`);
}
// The wall-walk is a hero's battle post: up there within reach of a tower they crew it — its archer
// shoots faster and further (the Warchief drives him harder, the Mage's bolts hit harder, a Knight's
// shield halves what the tower takes); down in town, or too far along the walk, nobody crews it. The
// dead below can't touch them, and a Battle Cry from up there holds them at the wall's foot, under the
// towers' fire; Shield Bash doesn't reach down. A fallen tower frees the post.
{
  const sim = new Sim({ seed: 31 });
  const st = sim.state;
  st.explored.fill(1);
  st.nextWaveAt = 1e9;
  const h = st.heroes[0];
  const lane = sim.world.lanes[0];
  // A spot 4–7 m off the North Road a little way out from the gate, as a player would pick.
  let c: { cx: number; cz: number } | null = null;
  for (let d = lane.length - 16; d < lane.length - 6 && !c; d += 1) {
    for (const lat of [6, -6]) {
      const p = lanePos(lane, d, lat);
      const f = findSpot(sim, p.x, p.z, 2, sizeOf('tower'), 'tower');
      if (!f) continue;
      const at = cellCenter(f.cx, f.cz);
      if (Math.abs(laneProject(lane, at.x, at.z).lat) <= 7) {
        c = f;
        break;
      }
    }
  }
  if (!c) fail('no room for a tower by the road');
  sim.apply({ t: 'place', hero: h.id, plan: 'tower', cx: c!.cx, cz: c!.cz });
  forceCompleteSite(sim, st.sites[st.sites.length - 1]);
  const tower = st.buildings[st.buildings.length - 1];
  if (tower.kind !== 'tower') fail('no tower to crew');
  // Down in town: nobody crews it.
  h.x = h.px = MAP.heroStart.x;
  h.z = h.pz = MAP.heroStart.z;
  sim.step();
  if (h.post || crewOf(sim, tower)) fail('a hero down in town should crew no tower');
  // Up on the wall-walk beside it: their post.
  let crewed = 0;
  sim.events.on('crewed', (e) => e.hero === h.id && (crewed = e.building));
  const post = walkSpot(tower.x, tower.z);
  h.x = h.px = post.x;
  h.z = h.pz = post.z;
  sim.step();
  if (h.post !== tower.id || crewed !== tower.id || crewOf(sim, tower) !== h) fail(`a hero on the wall-walk ${Math.hypot(tower.x - h.x, tower.z - h.z).toFixed(1)} m from a tower should crew it`);
  // The crew works faster with a hero at their post.
  const rateOf = () => {
    tower.cooldown = 5;
    tower.hasteT = 0;
    for (let i = 0; i < 20; i++) sim.step();
    return (5 - tower.cooldown) / 1;
  };
  const knight = rateOf();
  if (Math.abs(knight - crewBoost(h).rate) > 0.02 || crewBoost(h).rate < 1.2 || crewBoost(h).range <= 0) fail(`the crew should shoot faster with a hero crewing it (${knight.toFixed(2)}×)`);
  const hp0 = tower.hp;
  damageBuilding(sim, tower, 100, 0);
  if (Math.abs(hp0 - tower.hp - 50) > 0.01) fail(`a Knight crewing it should halve the damage (took ${(hp0 - tower.hp).toFixed(0)} of 100)`);
  // Too far along the walk from it: no longer.
  const ends = [walkSpot(WALL.x, WALL.walkEnd), walkSpot(WALL.x, -WALL.walkEnd), walkSpot(WALL.x, WALL.gatePiece), walkSpot(WALL.x, -WALL.gatePiece)];
  const away = ends.find((q) => Math.hypot(q.x - tower.x, q.z - tower.z) > OVER_WALL.crew + 1);
  if (away) {
    h.x = h.px = away.x;
    h.z = h.pz = away.z;
    sim.step();
    if (h.post) fail(`a hero ${Math.hypot(away.x - tower.x, away.z - tower.z).toFixed(1)} m along the walk should crew nothing`);
  }
  // The dead below can't get at them — a Battle Cry from up there holds them at the wall's foot.
  const e = spawnEnemy(sim, 'minion', 0, 0, { d: lane.length - 5, lat: 0 });
  e.spawnT = 0;
  e.hp = e.maxHp = 1e6;
  const near = walkSpot(e.x, e.z);
  h.x = h.px = near.x;
  h.z = h.pz = near.z;
  h.task = { k: 'idle' };
  const heroHp = h.hp;
  h.cds.cry = 0;
  sim.apply({ t: 'cast', hero: h.id, ability: 'cry' });
  if (e.tauntT <= 0) fail(`Battle Cry from the wall-walk did not reach the dead below (${Math.hypot(e.x - h.x, e.z - h.z).toFixed(1)} m)`);
  const d0 = e.d;
  for (let i = 0; i < 20 * 2; i++) sim.step();
  if (Math.abs(e.d - d0) > 0.05) fail(`a taunted creature should stand below the wall (moved ${(e.d - d0).toFixed(2)} m)`);
  if (h.hp < heroHp || h.dead) fail('the dead hurt a hero up on the wall-walk');
  sim.apply({ t: 'cast', hero: h.id, ability: 'slam', target: e.id });
  if (h.cds.slam > 0) fail('Shield Bash reached the ground from the wall-walk');
  // On the ground the cry leaves the dead be (one blow of theirs kills).
  e.tauntT = 0;
  h.cds.cry = 0;
  h.x = h.px = MAP.heroStart.x;
  h.z = h.pz = MAP.heroStart.z;
  e.d = laneProject(lane, h.x + 4, h.z).d;
  sim.apply({ t: 'cast', hero: h.id, ability: 'cry' });
  if (e.tauntT > 0) fail('a Battle Cry on the ground should leave the dead on the road be');
  // Classes: the Warchief drives the crew harder, the Mage's bolts hit harder.
  const sup = crewBoost({ ...h, cls: 'support' });
  const mag = crewBoost({ ...h, cls: 'magic' });
  if (sup.rate <= crewBoost(h).rate || mag.damage <= 1) fail('the Warchief and the Mage should each lift the crew their own way');
  // A fallen tower frees the post.
  e.hp = 0;
  sim.remove(e.id);
  h.x = h.px = post.x;
  h.z = h.pz = post.z;
  sim.step();
  destroyBuilding(sim, tower);
  sim.step();
  if (h.post || h.dead || !onWall(h.x, h.z)) fail('a fallen tower should free its post (the hero stays up on the walk)');
  console.log(`towers ✓ (crewed from the wall-walk within ${OVER_WALL.crew} m: crew ×${knight.toFixed(2)} speed +${crewBoost(h).range} m; Knight halves the damage; nobody crews from town${away ? ' or too far along the walk' : ''}; the dead below can't reach, a Battle Cry from the walk holds them at its foot (on the ground it leaves them be); Shield Bash can't reach down; a fallen tower frees the post)`);
}
// One tower, an archer on top from the start; its four windows are gem sockets. A raw gem from the
// mines is melted into a learned variant: an element (one per tower) changes the bolts; others add
// speed, range, sight, radar or an aura. Gems come out again (the raw gem back), and a tower stands
// on just its own cells, square to the grid.
{
  const sim = new Sim({ seed: 41 });
  const st = sim.state;
  st.explored.fill(1);
  const h = st.heroes[0];
  for (const id of Object.keys(PLANS) as PlanId[]) if (!h.known.includes(id)) h.known.push(id);
  const lane = sim.world.lanes[0];
  const roadside = (d: number) => {
    const p = lanePos(lane, d, 5.5);
    return findSpot(sim, p.x, p.z, 4)!;
  };
  const raise = (cx: number, cz: number): Building => {
    sim.apply({ t: 'place', hero: h.id, plan: 'tower', cx, cz });
    forceCompleteSite(sim, st.sites[st.sites.length - 1]);
    return st.buildings[st.buildings.length - 1];
  };
  const set = (b: Building, id: GemId): string | null => {
    const why = gemBlocker(b.gems, id);
    const n = st.sites.length;
    sim.apply({ t: 'placeGem', hero: h.id, plan: id, building: b.id });
    if (st.sites.length === n) return why ?? 'refused';
    const site = st.sites[st.sites.length - 1];
    if (!(site.need[(PLANS[id] as GemPlan).color] ?? 0)) fail(`a ${PLANS[id].name} should need a raw ${(PLANS[id] as GemPlan).color}`);
    forceCompleteSite(sim, site);
    return null;
  };
  const c0 = roadside(lane.length - 40);
  const t = raise(c0.cx, c0.cz);
  if (!(t.stats!.range > 0) || t.stats!.shooters !== 1 || t.stats!.damageType !== 'pierce') fail('a new tower should come with an archer');
  if (st.firstTowerAt < 0) fail('the first tower should start the clock on the first wave');
  // It stands on its own 3×3 cells: the next one can go right beside it.
  const beside = [[3, 0], [-3, 0], [0, 3], [0, -3]].find(([dx, dz]) => !placementBlocker(sim, c0.cx + dx, c0.cz + dz, sizeOf('tower')));
  if (!beside) fail('a tower should leave the cells next to it free');
  if (!placementBlocker(sim, c0.cx + 2, c0.cz, sizeOf('tower'))) fail('two towers overlapped');
  if (Math.abs(Math.sin(2 * t.rot)) > 1e-9) fail('a tower should stand square to the grid');
  // Gems: one window for each colour. An element each, speed, multishot; no doubles.
  const rate0 = t.stats!.rate;
  if (set(t, 'swift') || !(t.stats!.rate > rate0 * 1.2)) fail('a swift topaz should speed the archer up');
  if (gemLevel(t, 'swift') !== 1) fail('a new gem should go in rough');
  const swiftRough = t.stats!.rate / rate0;
  if (set(t, 'frost') || t.stats!.damageType !== 'frost' || !(t.stats!.slow > 0)) fail('a frost sapphire should make frost bolts');
  if (towerName(t.gems) !== 'Frost Tower') fail(`a tower is named after its element (${towerName(t.gems)})`);
  if (!set(t, 'ember')?.startsWith('It already holds an element')) fail('two elements went into one tower');
  if (!set(t, 'swift')?.startsWith('Already set in this tower')) fail('the same gem went in twice');
  if (set(t, 'sun') !== 'Its topaz window holds the Swift Topaz') fail('two topazes went into one tower');
  // A twin amethyst adds a second archer: rough, he shoots half as often; radiant, as often as the first.
  if (set(t, 'twin') || !(t.stats!.shooters > 1 && t.stats!.shooters < 2)) fail(`a rough twin amethyst should add a slower second archer (${t.stats!.shooters})`);
  const twins = ([1, 2, 3] as const).map((lv) => computeTowerStats(['twin'], [], [lv]).shooters);
  if (!(twins[0] < twins[1] && twins[1] < twins[2] && twins[2] === 2)) fail(`a twin amethyst cut finer should bring its second archer up to pace (${twins.join(' → ')})`);
  // Five windows, one per colour: all five filled, nothing more goes in.
  if (set(t, 'warheart') || set(t, 'seer')) fail('a warheart ruby and a seer emerald should fill the ruby and emerald windows');
  if (t.gems.length !== SOCKETS || SOCKETS !== COLOR_ORDER.length) fail(`a tower should take one gem of each colour (${t.gems.length}/${SOCKETS})`);
  for (const g of ['fury', 'rime', 'far', 'scry', 'storm'] as GemId[]) if (!set(t, g)) fail(`a ${g} went into a window already holding its colour`);
  for (const g of ['warheart', 'seer'] as GemId[]) sim.apply({ t: 'removeGem', hero: h.id, building: t.id, gem: g });
  // Out again: the raw gem comes back (mined gems are precious), the stats go with it.
  const drops0 = st.drops.length;
  sim.apply({ t: 'removeGem', hero: h.id, building: t.id, gem: 'frost' });
  for (let i = 0; i < 2; i++) sim.step();
  if (t.gems.includes('frost') || t.stats!.damageType !== 'pierce') fail('taking the frost sapphire out should take the frost with it');
  if (!st.drops.slice(drops0).some((d) => d.item === 'sapphire')) fail('the raw sapphire did not come back');
  // The sun needs the topaz window: the swift comes out for it.
  sim.apply({ t: 'removeGem', hero: h.id, building: t.id, gem: 'swift' });
  if (set(t, 'sun')) fail('a sun topaz');
  // Auras. The sun lights it (and a neighbour) at night; a warheart hastens towers near it; rime slows the dead.
  const c1 = cellOf(t.x + 6.2, t.z);
  const n = findSpot(sim, cellCenter(c1.cx, c1.cz).x, cellCenter(c1.cx, c1.cz).z, 3)!;
  const t2 = raise(n.cx, n.cz);
  for (let i = 0; i < 12; i++) sim.step();
  const gap = Math.hypot(t2.x - t.x, t2.z - t.z);
  if (!t.lit || (gap <= AURA.sun && !t2.lit)) fail(`a sun topaz should light its tower and those within ${AURA.sun} m (${gap.toFixed(1)} m: ${t2.lit})`);
  const speed = (b: Building) => {
    b.cooldown = 5;
    for (let i = 0; i < 20; i++) sim.step();
    return 5 - b.cooldown;
  };
  sim.apply({ t: 'removeGem', hero: h.id, building: t.id, gem: 'twin' });
  const before = speed(t2);
  if (set(t, 'warheart')) fail('a warheart ruby');
  const after = speed(t2);
  // (A rough one: the haste at 70%.)
  const haste = 1 + AURA.haste * GEM_LEVELS[1].k;
  if (gap <= AURA.warheart && Math.abs(after / before - haste) > 0.02) fail(`a rough warheart should hasten its neighbours ×${haste.toFixed(3)} (×${(after / before).toFixed(2)})`);
  sim.apply({ t: 'removeGem', hero: h.id, building: t.id, gem: 'warheart' });
  if (set(t, 'rime')) fail('a rime sapphire');
  const along = laneProject(lane, t.x, t.z).d;
  const e = spawnEnemy(sim, 'warrior', 0, 0, { d: along, lat: 0 });
  e.spawnT = 0;
  e.hp = e.maxHp = 1e6;
  for (let i = 0; i < 6; i++) sim.step();
  if (e.slowMul > 1 - AURA.slow * GEM_LEVELS[1].k + 0.01) fail(`the dead by a rough rime sapphire should drag their feet (×${e.slowMul.toFixed(2)})`);
  e.hp = 0;
  // A seer's emerald makes the tower a lookout: intel, and burrowers forced up.
  if (st.intel !== 0) fail('no intel without a watch gem');
  if (set(t2, 'seer')) fail("a seer's emerald");
  for (let i = 0; i < 3; i++) sim.step();
  if (st.intel < 1) fail("a seer's emerald should give wave intel");
  const dig = spawnEnemy(sim, 'digger', 0, 0, { d: laneProject(lane, t2.x, t2.z).d, lat: 0 });
  dig.spawnT = 0;
  dig.burrowed = true;
  for (let i = 0; i < 3; i++) sim.step();
  if (dig.burrowed) fail("a seer's emerald should force burrowers up");
  // Blast: bolts burst on the target.
  const t3c = findSpot(sim, t2.x + 6, t2.z, 4)!;
  const t3 = raise(t3c.cx, t3c.cz);
  if (set(t3, 'blast') || !(t3.stats!.splash > 0) || t3.stats!.damageType !== 'impact') fail('a blast ruby should make bursting impact bolts');
  // A gem grows by being cut finer: rough → polished → radiant, each level more of its raw gem
  // (and its other parts again), each doing more. Taken out, every raw gem melted in comes back.
  const t4c = findSpot(sim, t3.x + 6, t3.z, 4)!;
  const t4 = raise(t4c.cx, t4c.cz);
  if (set(t4, 'swift')) fail('a swift topaz on the fourth tower');
  const up = (b: Building, id: GemId): string | null => {
    const n = st.sites.length;
    let why = '';
    const off = sim.events.on('denied', (ev) => (why = ev.reason));
    sim.apply({ t: 'upgradeGem', hero: h.id, building: b.id, gem: id });
    off();
    if (st.sites.length === n) return why || 'refused';
    const site = st.sites[st.sites.length - 1];
    const lv = gemLevel(b, id);
    if (site.need[(PLANS[id] as GemPlan).color] !== lv + 1) fail(`cutting a level-${lv} ${id} finer should take ${lv + 1} raw gems (${site.need[(PLANS[id] as GemPlan).color]})`);
    forceCompleteSite(sim, site);
    return null;
  };
  const rates = [t4.stats!.rate];
  for (const lv of [2, 3]) {
    if (up(t4, 'swift') || gemLevel(t4, 'swift') !== lv) fail(`the swift topaz should be cut to level ${lv}`);
    rates.push(t4.stats!.rate);
  }
  if (!(rates[0] < rates[1] && rates[1] < rates[2])) fail(`each level should do more (${rates.map((r) => r.toFixed(2)).join(' < ')})`);
  if (!up(t4, 'swift')) fail('a radiant gem was cut finer still');
  // Only someone who knows its plan can cut it.
  h.known = h.known.filter((k) => k !== 'twin');
  st.dev = true;
  if (set(t4, 'twin')) fail('a twin in dev mode');
  st.dev = false;
  if (!up(t4, 'twin')?.startsWith('Learn the')) fail('a gem was cut finer by someone who never learned its plan');
  h.known.push('twin');
  const base = computeTowerStats(['swift'], [], [2]).rate;
  if (!(computeTowerStats(['swift'], [], [3]).rate > base && computeTowerStats(['swift'], [], [1]).rate < base)) fail('a radiant gem should do more than a polished one, a rough one less');
  // A save keeps every gem (and the stats they make).
  const copy = new Sim({ seed: 41 });
  restore(copy, JSON.parse(JSON.stringify(snapshot(sim))));
  const ct = copy.getAs(t.id, 'building')!;
  if (ct.gems.join() !== t.gems.join() || ct.stats!.rate !== t.stats!.rate || gemLevel(copy.getAs(t4.id, 'building')!, 'swift') !== 3) fail('a save lost the tower gems (or their levels)');
  // A save from the vale before the wall moved out (v5 and older) starts again in the new vale:
  // nothing built there carries over, but the heroes keep what they carry and know.
  const old = JSON.parse(JSON.stringify(snapshot(sim)));
  old.v = 5;
  const v5 = new Sim({ seed: 41 });
  restore(v5, old);
  const oh = v5.state.heroes[0];
  if (v5.state.buildings.some((b) => b.kind === 'tower') || oh.known.join() !== h.known.join() || v5.heroRemap.get(h.id) !== oh.id) fail('a save from the old vale should start again in the new one, the heroes kept');
  // Out of the radiant swift: all six topazes melted into it come back.
  const drops1 = st.drops.length;
  sim.apply({ t: 'removeGem', hero: h.id, building: t4.id, gem: 'swift' });
  for (let i = 0; i < 2; i++) sim.step();
  const topaz = st.drops.slice(drops1).filter((d) => d.item === 'topaz').length;
  if (topaz !== 6) fail(`a radiant swift taken out should give back all six topazes (${topaz})`);
  // Everything the world hands out is a real plan, and every raw gem can be dug up.
  const handed: string[] = [...WAVES.flatMap((w) => w.reward.scrolls ?? []), ...MAP.chests.flatMap((c) => c.loot.scrolls ?? []), ...Object.values(STORES).flatMap((x) => x.scrolls)];
  const bad = handed.filter((p) => !(p in PLANS));
  if (bad.length) fail(`scrolls that are no plan: ${bad.join(', ')}`);
  const inRock = mineItems();
  const unmined = COLOR_ORDER.filter((c) => !inRock.has(c));
  if (unmined.length) fail(`no ${unmined.join(', ')} in the mine's rock`);
  console.log(`gems ✓ (archer from the start; a rough swift ×${swiftRough.toFixed(2)}; frost makes a Frost Tower, one element only, one window per colour, no doubles; cut finer rough → polished → radiant (rate ${rates.map((r) => r.toFixed(2)).join(' → ')}), only by who knows the plan, all six topazes back out; twin = a second archer (×${twins.map((x) => x.toFixed(2)).join(' → ×')} bolts); the raw gem comes back out; sun lights ${gap.toFixed(1)} m over, a warheart hastens ×${(after / before).toFixed(2)}, rime slows ×${e.slowMul.toFixed(2)}; a seer gives intel and forces burrowers up; blast bursts; 3×3 footprint, square to the grid; saves keep it; every scroll handed out is a plan, every colour can be mined)`);
}
// Dev mode: any plan, learned or not, stands as soon as it's placed; gems go straight in; no tools,
// parts or gold needed; repairs are instant — and off again, it's the normal game.
{
  const sim = new Sim({ seed: 51 });
  const st = sim.state;
  st.explored.fill(1);
  const h = st.heroes[0];
  h.tools = [];
  st.gold = 0;
  const c = townSpot(sim, 'forge');
  sim.apply({ t: 'place', hero: h.id, plan: 'forge', cx: c.cx, cz: c.cz });
  if (st.sites.some((x) => x.plan === 'forge')) fail('an unlearned plan went down without dev mode');
  sim.apply({ t: 'devMode', on: true });
  if (!st.dev) fail('dev mode did not turn on');
  // (Dev mode or not, the wall's rule holds: towers out, the rest in.)
  const out = roadSpot(sim, 40, 6);
  sim.apply({ t: 'place', hero: h.id, plan: 'forge', cx: out.cx, cz: out.cz });
  if (st.buildings.some((b) => b.kind === 'forge')) fail('dev mode: a forge went up beyond the wall');
  sim.apply({ t: 'place', hero: h.id, plan: 'tower', cx: out.cx, cz: out.cz });
  const t = st.buildings.find((b) => b.kind === 'tower') ?? fail('dev mode: a tower should stand as soon as it is placed');
  sim.apply({ t: 'placeGem', hero: h.id, plan: 'storm', building: t.id });
  if (!t.gems.includes('storm')) fail('dev mode: a gem should go straight in, raw gem or not');
  sim.apply({ t: 'place', hero: h.id, plan: 'forge', cx: c.cx, cz: c.cz });
  if (!st.buildings.some((b) => b.kind === 'forge')) fail('dev mode: any plan, learned or not');
  // Chop without an axe.
  const tree = st.nodes.filter((n) => n.kind === 'tree' && n.amount > 0).sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z))[0];
  h.x = tree.x + tree.radius + 0.4;
  h.z = tree.z;
  sim.apply({ t: 'interact', hero: h.id, target: tree.id });
  for (let i = 0; i < 20 * 4 && !(h.bag.wood ?? 0); i++) sim.step();
  if (!(h.bag.wood ?? 0)) fail('dev mode: chopping should not need an axe');
  // Shops are free.
  const m = MAP.stores.market;
  h.x = m.x + 3;
  h.z = m.z;
  enterBuilding(sim, h, st.buildings.find((b) => b.kind === 'shop')!);
  sim.apply({ t: 'buyCrafterKit', hero: h.id, store: 'market' });
  leaveBuilding(sim, h);
  if (!h.tools.includes('axe') || st.gold !== 0) fail(`dev mode: shopping should be free (gold ${st.gold})`);
  // Unlimited health and keep lives.
  const hp0 = h.hp;
  damageHero(sim, h, 1e6);
  if (h.dead || h.hp < hp0) fail('dev mode: heroes should not be hurt');
  const lives0 = st.lives;
  sim.loseLives(5);
  if (st.lives !== lives0) fail('dev mode: the keep should not lose lives');
  // Repairs are instant (a tower: from the wall-walk).
  damageBuilding(sim, t, 150, 0);
  const up = walkSpot(t.x, t.z);
  h.x = h.px = up.x;
  h.z = h.pz = up.z;
  sim.apply({ t: 'interact', hero: h.id, target: t.id });
  for (let i = 0; i < 20 && t.hp < t.maxHp; i++) sim.step();
  if (t.hp < t.maxHp) fail('dev mode: a repair should be instant');
  // The clock: set to any time of day; held, it stays there; let go, it runs on from it.
  const near = (a: number, b: number) => Math.abs(((a - b + 1.5) % 1) - 0.5) < 0.002;
  sim.apply({ t: 'setTime', tod: 0.95, hold: false });
  if (!near(todNow(st), 0.95)) fail(`dev mode: the clock should go to the time set (${todNow(st).toFixed(3)})`);
  sim.apply({ t: 'setTime', tod: 0.5, hold: true });
  for (let i = 0; i < 20 * 30; i++) sim.step();
  if (todNow(st) !== 0.5 || darkness(sim) > 0) fail(`dev mode: a held noon should stay noon (${todNow(st).toFixed(3)})`);
  sim.apply({ t: 'setTime', tod: 0, hold: true });
  if (!(darkness(sim) > 0.99)) fail('dev mode: midnight should be dark');
  // A save keeps it; off again, plans must be learned and the clock runs on from where it was held.
  const copy = new Sim({ seed: 51 });
  restore(copy, JSON.parse(JSON.stringify(snapshot(sim))));
  if (!copy.state.dev || todNow(copy.state) !== 0) fail('a save lost dev mode (or its clock)');
  sim.apply({ t: 'devMode', on: false });
  if (st.dayHold != null || !near(todNow(st), 0)) fail('dev mode off: the clock should run on from where it was held');
  for (let i = 0; i < 20 * 24; i++) sim.step();
  if (!(todNow(st) > 0.04 && todNow(st) < 0.06)) fail(`dev mode off: the clock should run again (${todNow(st).toFixed(3)})`);
  sim.apply({ t: 'setTime', tod: 0.5, hold: true });
  if (st.dayHold != null) fail('the clock can only be set in dev mode');
  const c3 = townSpot(sim, 'anvil');
  sim.apply({ t: 'place', hero: h.id, plan: 'anvil', cx: c3.cx, cz: c3.cz });
  if (st.sites.some((x) => x.plan === 'anvil') || st.buildings.some((b) => b.kind === 'anvil')) fail('dev mode off: unlearned plans should be closed again');
  console.log('dev mode ✓ (unlearned plans build at once with no parts or hammer; gems straight in; chop without an axe; free shops; unhurt heroes, no lives lost; instant repairs; the clock set and held — noon stays noon, midnight is dark; saved with the game; off again, the normal rules and the day runs on)');
}
// The Road of Invention: a milestone is invented at its workshop by a good or perfect minigame
// (reported by the client); a failed try costs nothing; what comes first must come first; the vale's
// age moves on once half an age is invented; a save keeps the road.
{
  const sim = new Sim({ seed: 67 });
  const st = sim.state;
  st.explored.fill(1);
  const h = st.heroes[0];
  for (const id of ['forge', 'anvil'] as PlanId[]) if (!h.known.includes(id)) h.known.push(id);
  const lane = sim.world.lanes[0];
  // (The workshops stand in town, in the workshop quarter.)
  const build = (plan: 'forge' | 'anvil', d: number) => {
    const c = townSpot(sim, plan, { x: MAP.workshops.x + d - 47, z: MAP.workshops.z });
    sim.apply({ t: 'place', hero: h.id, plan, cx: c.cx, cz: c.cz });
    forceCompleteSite(sim, st.sites[st.sites.length - 1]);
    return st.buildings[st.buildings.length - 1];
  };
  const forge = build('forge', 40);
  const anvil = build('anvil', 55);
  void lane;
  let got: { milestone: string; quality: number } | null = null;
  sim.events.on('invented', (e) => (got = e));
  const invent = (id: MilestoneId, quality: number) => {
    got = null;
    sim.apply({ t: 'invent', hero: h.id, milestone: id, quality });
    return got as { milestone: string; quality: number } | null;
  };
  h.bag = { ingot: 5, copper: 4, coal: 2 };
  h.x = forge.x + 30;
  h.z = forge.z;
  if (invent('bronze', 2)) fail('a milestone should only be invented at its workshop');
  h.x = forge.x + 2.4;
  h.z = forge.z;
  if (invent('steel', 2)) fail('steel should wait for bronze');
  if (invent('bronze', 0)?.quality !== 0 || roadOf(sim).done.length || h.bag.copper !== 4) fail('a failed try should cost nothing and invent nothing');
  if (invent('bronze', 2)?.quality !== 2 || !roadOf(sim).done.includes('bronze') || h.bag.copper !== 2) fail('a perfect try at the forge should invent bronze (and use its copper)');
  if (valeAge(roadOf(sim)) !== 'fire') fail('one milestone of three should not make an age');
  h.x = anvil.x + 2.4;
  h.z = anvil.z;
  if (invent('steel', 1)?.quality !== 1) fail('steel at the anvil');
  if (valeAge(roadOf(sim)) !== 'metal') fail(`two of the Metal age's three should make it the Metal age (${valeAge(roadOf(sim))})`);
  const copy = new Sim({ seed: 67 });
  restore(copy, JSON.parse(JSON.stringify(snapshot(sim))));
  if (roadOf(copy).done.join() !== 'bronze,steel' || roadOf(copy).best.bronze !== 2) fail('a save lost the road');
  console.log('road ✓ (invented only at its workshop; a failed try costs nothing; bronze before steel; half an age makes the age; saved)');
}
// Tower tops: the open platform, then a roofed turret, then a gallery under a wide roof — each a plan
// placed on the tower, its parts brought, then built. Open, a wraith diving past makes the archer duck
// (no shots); roofed, he shoots on; the gallery sees further.
{
  const sim = new Sim({ seed: 63 });
  const st = sim.state;
  st.explored.fill(1);
  const h = st.heroes[0];
  for (const id of ['tower', 'turret', 'gallery'] as PlanId[]) if (!h.known.includes(id)) h.known.push(id);
  const lane = sim.world.lanes[0];
  const p = lanePos(lane, lane.length - 36, 5);
  const c = findSpot(sim, p.x, p.z, 4, sizeOf('tower'), 'tower')!;
  sim.apply({ t: 'place', hero: h.id, plan: 'tower', cx: c.cx, cz: c.cz });
  forceCompleteSite(sim, st.sites[st.sites.length - 1]);
  const t = st.buildings.find((b) => b.kind === 'tower') ?? fail('no tower');
  if (topOf(t) !== 1 || TOWER_TOPS[1].covered) fail('a new tower should have an open top');
  const range0 = t.stats!.range;
  // A wraith over it: the archer ducks.
  const along = laneProject(lane, t.x, t.z).d;
  // (Held on the road beside the tower: stunned, it hovers where it is.)
  const w = spawnEnemy(sim, 'wraith', 0, 0, { d: along, lat: 0 });
  w.spawnT = 0;
  w.hp = w.maxHp = 1e6;
  const shots = () => {
    const n0 = t.shots;
    for (let i = 0; i < 20; i++) {
      w.stunT = 99;
      sim.step();
    }
    return t.shots - n0;
  };
  // Something to shoot at, in range.
  const target = spawnEnemy(sim, 'warrior', 0, 0, { d: along, lat: 0 });
  target.spawnT = 0;
  target.hp = target.maxHp = 1e6;
  const near = () => {
    target.stunT = 99;
  };
  near();
  sim.step();
  if (Math.hypot(w.x - t.x, w.z - t.z) > DIVE.reach) fail(`the test wraith should be within diving reach (${Math.hypot(w.x - t.x, w.z - t.z).toFixed(2)} m)`);
  const open = shots();
  if (open !== 0 || !t.harried) fail(`an open-topped archer should duck a diving wraith (${open} shots)`);
  // The turret: roofed — the archer shoots on.
  sim.apply({ t: 'upgradeTop', hero: h.id, building: t.id });
  const site = st.sites.find((x) => x.plan === 'turret') ?? fail('the turret plan did not go onto the tower');
  if (!(site.need.planks ?? 0)) fail('a turret should need planks');
  forceCompleteSite(sim, site);
  if (topOf(t) !== 2 || t.site) fail(`the turret should be built (${t.top})`);
  near();
  const roofed = shots();
  if (!(roofed > 0) || t.harried) fail(`a roofed archer should shoot on with a wraith overhead (${roofed} shots)`);
  // The gallery: further.
  sim.apply({ t: 'upgradeTop', hero: h.id, building: t.id });
  forceCompleteSite(sim, st.sites.find((x) => x.plan === 'gallery') ?? fail('no gallery plan'));
  if (topOf(t) !== 3 || Math.abs(t.stats!.range - range0 - TOWER_TOPS[3].rangeAdd) > 1e-9) fail(`the gallery should see ${TOWER_TOPS[3].rangeAdd} m further (${range0} → ${t.stats!.range})`);
  sim.apply({ t: 'upgradeTop', hero: h.id, building: t.id });
  if (st.sites.some((x) => x.building === t.id && sim.alive(x.id)) || t.site) fail('nothing should go above the gallery');
  const copy = new Sim({ seed: 63 });
  restore(copy, JSON.parse(JSON.stringify(snapshot(sim))));
  if (topOf(copy.getAs(t.id, 'building')!) !== 3) fail('a save lost the tower top');
  console.log(`tops ✓ (open → turret → gallery, each a plan on the tower; open: a wraith makes the archer duck (${open} shots); roofed: ${roofed} shots; the gallery +${TOWER_TOPS[3].rangeAdd} m; saved)`);
}
// Turning a plan before it is built: a pole to any angle, a building in quarter turns (it fills its
// cells either way); a blueprint turns until it is built, and the building keeps the way it was turned.
{
  const sim = new Sim({ seed: 57 });
  const st = sim.state;
  st.explored.fill(1);
  const h = st.heroes[0];
  for (const id of ['pole', 'tower'] as PlanId[]) if (!h.known.includes(id)) h.known.push(id);
  // (A pole in town, a tower out beyond the wall.)
  const c = townSpot(sim, 'pole');
  sim.apply({ t: 'place', hero: h.id, plan: 'pole', cx: c.cx, cz: c.cz, rot: 0.6 });
  const pole = st.sites.find((x) => x.plan === 'pole') ?? fail('no pole planned');
  if (Math.abs(pole.rot - 0.6) > 1e-9 || !pole.turned) fail(`a pole should stand at the angle it was given (${pole.rot})`);
  sim.apply({ t: 'turnSite', site: pole.id, rot: 1.1 });
  if (Math.abs(pole.rot - 1.1) > 1e-9) fail('a planned pole should turn until it is built');
  const c2 = roadSpot(sim, 50, 6);
  sim.apply({ t: 'place', hero: h.id, plan: 'tower', cx: c2.cx, cz: c2.cz, rot: 1.3 });
  const tw = st.sites.find((x) => x.plan === 'tower') ?? fail('no tower planned');
  if (Math.abs(tw.rot - Math.PI / 2) > 1e-9) fail(`a tower should turn in quarter turns (${tw.rot})`);
  forceCompleteSite(sim, pole);
  const built = st.buildings.find((b) => b.kind === 'pole') ?? fail('the pole was not built');
  if (Math.abs(built.rot - 1.1) > 1e-9 || !built.turned) fail('a built pole should keep the way it was turned');
  sim.apply({ t: 'turnSite', site: pole.id, rot: 0 });
  if (Math.abs(built.rot - 1.1) > 1e-9) fail('a built pole should not turn any more');
  console.log('turning ✓ (a pole to any angle, a tower in quarter turns; a blueprint turns until built; built, it keeps the way it was turned)');
}
// Walking into a building: the Blacksmith (Anvil) has a room of its own. Using it from outside takes
// you in at its door; inside, walls and furniture are solid; the anvil is the bench — ingots in,
// hammer and weld, gears out; the door takes you back out; pulling the building down puts you out.
{
  const sim = new Sim({ seed: 61 });
  const st = sim.state;
  st.explored.fill(1);
  const h = st.heroes[0];
  h.tools = ['hammer'];
  if (!h.known.includes('anvil')) h.known.push('anvil');
  const c = townSpot(sim, 'anvil');
  sim.apply({ t: 'place', hero: h.id, plan: 'anvil', cx: c.cx, cz: c.cz });
  forceCompleteSite(sim, st.sites[st.sites.length - 1]);
  const smithy = st.buildings.find((b) => b.kind === 'anvil') ?? fail('no anvil built');
  if (smithy.interior === undefined) fail('a Blacksmith should get a room');
  // Walking it like a player: the client moves its hero (sliding along walls) and poses it.
  const walk = (tx: number, tz: number, frames = 240): void => {
    const was = indoors(h.x);
    for (let i = 0; i < frames && indoors(h.x) === was; i++) {
      const dx = tx - h.x;
      const dz = tz - h.z;
      const l = Math.hypot(dx, dz);
      if (l < 0.05) break;
      const look = Math.atan2(dx, dz);
      const step = Math.min(l, heroSpeed(sim, h) / 60);
      const q = slide(sim, h.x, h.z, (dx / l) * step, (dz / l) * step);
      sim.apply({ t: 'pose', hero: h.id, x: q.x, z: q.z, facing: look, look, gait: 'fwd', moving: true });
      if (i % 3 === 0) sim.step();
    }
  };
  let turned = NaN;
  sim.events.on('entered', (e) => (turned = e.turn));
  // Run at its door: inside, no key pressed, still heading on into the room.
  const door = frontDoor(smithy);
  h.x = door.x + Math.sin(smithy.rot) * 1.5;
  h.z = door.z + Math.cos(smithy.rot) * 1.5;
  const inward = Math.atan2(-Math.sin(smithy.rot), -Math.cos(smithy.rot));
  walk(door.x - Math.sin(smithy.rot) * 1.2, door.z - Math.cos(smithy.rot) * 1.2);
  if (!indoors(h.x) || !insideOf(sim, h, smithy)) fail(`running at the Blacksmith's door should take you in (at ${h.x.toFixed(1)}, ${h.z.toFixed(1)})`);
  const into = Math.atan2(Math.sin(h.facing - Math.PI), Math.cos(h.facing - Math.PI));
  if (Math.abs(into) > 0.3 || Math.abs(Math.atan2(Math.sin(turned + smithy.rot), Math.cos(turned + smithy.rot))) > 1e-6) fail(`through the door the hero should head on into the room (facing ${h.facing.toFixed(2)}, turned ${turned.toFixed(2)}, came in heading ${inward.toFixed(2)})`);
  const def = INTERIORS.anvil!;
  const o = interiorOrigin('anvil', smithy.interior!);
  if (walkableAt(sim, o.x + def.hx + 0.05, o.z)) fail('the room walls should be solid');
  if (walkableAt(sim, o.x + def.bench.x, o.z + def.bench.z - 0.45)) fail('the anvil should be solid');
  if (!walkableAt(sim, o.x, o.z + 0.9)) fail('the floor should be walkable');
  // The loft: straight at its edge from below gets nowhere; up the stair it is a storey up.
  const loft = def.levels[0];
  const stair = def.ramps[0];
  walk(o.x + 0, o.z + loft.z1 - 0.6);
  if (groundHeight(sim.world, h.x, h.z) > 0.01 || h.z < o.z + loft.z1) fail('the loft should not be climbed from below');
  walk(o.x + (stair.x0 + stair.x1) / 2, o.z + stair.z1 + 0.3);
  walk(o.x + (stair.x0 + stair.x1) / 2, o.z + (stair.z0 + stair.z1) / 2);
  const mid = groundHeight(sim.world, h.x, h.z);
  walk(o.x + (stair.x0 + stair.x1) / 2, o.z + loft.z0 + 2);
  walk(o.x + 0, o.z + loft.z1 - 0.45);
  const up = groundHeight(sim.world, h.x, h.z);
  if (!(mid > 0.2 && mid < STOREY - 0.2) || Math.abs(up - STOREY) > 0.01 || !roomWalkable(sim, h.x, h.z)) fail(`up the stair to the loft (halfway ${mid.toFixed(2)} m, on the loft ${up.toFixed(2)} m at ${(h.x - o.x).toFixed(2)}, ${(h.z - o.z).toFixed(2)})`);
  // Down again, and work at the anvil: an ingot in, gears out.
  walk(o.x + (stair.x0 + stair.x1) / 2, o.z + loft.z0 + 2);
  walk(o.x + (stair.x0 + stair.x1) / 2, o.z + stair.z1 + 0.4);
  walk(o.x, o.z + 0.6);
  h.bag = { ingot: 1 };
  sim.apply({ t: 'interact', hero: h.id, target: smithy.id });
  for (let i = 0; i < 20 * 25 && !(smithy.output.gears ?? 0); i++) {
    if (h.task.k === 'work') sim.apply({ t: 'beat', hero: h.id, quality: 2 });
    sim.step();
  }
  const bench = benchOf(smithy)!;
  if (!(smithy.output.gears ?? 0)) fail(`working the anvil inside should make gears (task ${h.task.k}, busy ${smithy.busy}, at ${Math.hypot(h.x - bench.x, h.z - bench.z).toFixed(2)} m from the bench)`);
  // Out through the doorway: back in front of the building's door, heading on out — and not straight back in.
  const exit = roomDoor(smithy)!;
  walk(exit.x, exit.z - 0.5);
  walk(exit.x, exit.z + 1);
  if (indoors(h.x) || Math.hypot(h.x - door.x, h.z - door.z) > 0.3) fail(`walking out of the doorway should put you in front of the building's door (${h.x.toFixed(2)}, ${h.z.toFixed(2)} vs ${door.x.toFixed(2)}, ${door.z.toFixed(2)})`);
  const outward = Math.atan2(Math.sin(h.facing - smithy.rot), Math.cos(h.facing - smithy.rot));
  if (Math.abs(outward) > 0.3) fail(`out of the door the hero should head on away from it (facing ${h.facing.toFixed(2)}, the door faces ${smithy.rot.toFixed(2)})`);
  for (let i = 0; i < 10; i++) sim.step();
  if (indoors(h.x)) fail('stepping out should not take you straight back in');
  // F (or "Go in") from anywhere outside walks you to its door and in.
  h.x = smithy.x + Math.cos(smithy.rot) * 3;
  h.z = smithy.z - Math.sin(smithy.rot) * 3;
  sim.apply({ t: 'interact', hero: h.id, target: smithy.id });
  for (let i = 0; i < 20 * 12 && !indoors(h.x); i++) sim.step();
  if (!insideOf(sim, h, smithy)) fail('using the Blacksmith from its side should walk you round to its door and in');
  // A save keeps the room; pulling the building down with you inside puts you out.
  const copy = new Sim({ seed: 61 });
  restore(copy, JSON.parse(JSON.stringify(snapshot(sim))));
  if (copy.getAs(smithy.id, 'building')!.interior !== smithy.interior || !insideOf(copy, copy.state.heroes[0], copy.getAs(smithy.id, 'building')!)) fail('a save lost the room (or the hero in it)');
  sim.apply({ t: 'demolish', building: smithy.id });
  if (indoors(h.x)) fail('demolishing a building with you inside should put you out');
  // Anyone left in the dark where no room is goes home.
  h.x = -2600;
  h.z = 7;
  sim.step();
  if (indoors(h.x)) fail('a hero lost in the dark should be brought home');
  console.log(`rooms ✓ (the Blacksmith has a room; run at its door and you're in, heading on; walls and anvil solid; the loft only up the stair (${mid.toFixed(2)} m halfway, ${up.toFixed(2)} m on top); ingots worked into gears at the anvil; out through the doorway, heading on, not straight back in; F walks you round to the door; saved; pulled down with you inside, you're put out; lost heroes go home)`);
}
// Rails: once invented, a line of track runs from the home mine head to a forge, round buildings,
// water and the roads; ore brought up the lift rides it into the forge's input tray (what fits — the
// rest stays in the bag) and the forge smelts it; ore that didn't come up the lift stays in the bag; a plan
// put in the way sends the line round it; the same state lays the same line, saved or not.
{
  const sim = new Sim({ seed: 7 });
  const st = sim.state;
  const h = st.heroes[0];
  st.explored.fill(1);
  const m = st.mines[0];
  // A forge in the workshop quarter, a walk from the home mine head's door (both in town).
  const spot = townSpot(sim, 'forge', { x: MAP.workshops.x - 4, z: MAP.workshops.z + 2 });
  if (!h.known.includes('forge')) h.known.push('forge');
  sim.apply({ t: 'place', hero: h.id, plan: 'forge', cx: spot!.cx, cz: spot!.cz });
  forceCompleteSite(sim, st.sites[st.sites.length - 1]);
  const forge = st.buildings.find((b) => b.kind === 'forge');
  if (!forge) fail('the forge did not go up');
  const f = forge!;
  let loaded = 0;
  sim.events.on('railLoaded', (e) => (loaded += e.count));
  const up = (mine: number, ore: number) => {
    h.bag.ore = ore;
    rideLift(sim, h, mine, false);
  };
  // Not invented yet: no line, and the ore stays in the bag.
  up(0, 6);
  if (railLine(sim) || h.bag.ore !== 6 || (f.input.ore ?? 0) || loaded) fail('ore rode rails nobody has invented');
  roadOf(sim).done.push('steam', 'rails');
  const t0 = performance.now();
  const line = railLine(sim);
  const ms = performance.now() - t0;
  if (!line || !line.reaches || line.mine !== 0 || line.forge !== f.id) fail(`no rail line from the home mine head to the forge (${JSON.stringify(line && { mine: line.mine, reaches: line.reaches })})`);
  const L = line!;
  // Clear of buildings and plans, water, the wall and the dead's roads all the way (a town street it
  // may cross, level); from beside the door to beside the forge — all of it inside the walls.
  const clear = (l: RailLine) =>
    railPoints(l, 0.2).every((p) => {
      const k = Math.floor(p.z - MAP.minZ) * GRID_W + Math.floor(p.x - MAP.minX);
      return !(sim.world.cells[k] & (GROUND.WATER | GROUND.WALL)) && sim.world.laneDist[k] > MAP.roadHalf + 1 && !st.occupied[k] && insideWalls(p.x, p.z);
    });
  if (!clear(L)) fail('the rail line crosses a building, water, the wall or a road (or runs outside the walls)');
  const pts = railPoints(L);
  const a = pts[0];
  const z = pts[pts.length - 1];
  if (Math.hypot(a.x - m.exit.x, a.z - m.exit.z) > RAIL.startFar + 0.1) fail('the rail line should start by the mine head door');
  if (Math.max(Math.abs(z.x - f.x), Math.abs(z.z - f.z)) > RAIL.reach + 0.1) fail('the rail line should end beside the forge');
  // Up the lift with ore: it rides into the forge's tray — as much as fits, the rest stays in the bag.
  up(0, 7);
  if (h.bag.ore || f.input.ore !== 7 || loaded !== 7) fail(`7 ore up the lift should ride into the forge (bag ${h.bag.ore}, tray ${f.input.ore})`);
  up(0, 9);
  if (h.bag.ore !== 4 || f.input.ore !== 12 || loaded !== 12) fail(`a full tray takes only what fits (bag ${h.bag.ore}, tray ${f.input.ore})`);
  // Ore that didn't come up the lift — carried by, right past the rails' start — stays in the bag.
  h.bag.ore = 5;
  h.x = h.px = a.x;
  h.z = h.pz = a.z;
  for (let i = 0; i < 20; i++) sim.step();
  if (h.bag.ore !== 5 || loaded !== 12) fail(`ore carried past the rails' start (not up the lift) should stay in the bag (bag ${h.bag.ore}, loaded ${loaded})`);
  // The forge smelts what the carts brought.
  for (let i = 0; i < 20 * 45; i++) sim.step();
  const ingots = f.output.ingot ?? 0;
  if (ingots < 3 || (f.input.ore ?? 0) >= 12) fail(`the forge should smelt the ore the rails brought (${ingots} ingots, ${f.input.ore ?? 0} ore left)`);
  // The same state lays the same line, saved or not.
  const copy = new Sim({ seed: 7 });
  restore(copy, JSON.parse(JSON.stringify(snapshot(sim))));
  if (JSON.stringify(railLine(copy)) !== JSON.stringify(railLine(sim))) fail('a restored game laid a different rail line');
  // A plan put down on the line: it goes round (or stops short), never through it.
  // (Somewhere along its middle where a pole may stand: not where it crosses a street.)
  const order = pts.map((_, i) => i).sort((i, j) => Math.abs(i - pts.length / 2) - Math.abs(j - pts.length / 2));
  const midAt = order.find((i) => !placementBlocker(sim, cellOf(pts[i].x, pts[i].z).cx, cellOf(pts[i].x, pts[i].z).cz, 1, 'pole')) ?? Math.floor(pts.length / 2);
  const mid = pts[midAt];
  const c = cellOf(mid.x, mid.z);
  if (!h.known.includes('pole')) h.known.push('pole');
  const sites = st.sites.length;
  sim.apply({ t: 'place', hero: h.id, plan: 'pole', cx: c.cx, cz: c.cz });
  if (st.sites.length === sites) fail(`could not plan a pole on the rail line (${placementBlocker(sim, c.cx, c.cz, 1)})`);
  const round = railLine(sim);
  if (!round || !clear(round) || JSON.stringify(round.steps) === JSON.stringify(L.steps)) fail('a pole planned on the rail line should send the line round it');
  console.log(`rails ✓ (the home mine head → the forge: ${L.length.toFixed(0)} m of track, ${L.steps.filter((s) => s.turn).length} turn(s), laid in ${ms.toFixed(1)} ms, clear of buildings, water and roads; ore up the lift rides into the forge's tray (7, then 5 of 9 — the rest stays in the bag) and is smelted into ${ingots} ingots; ore carried past (not up the lift) stays in the bag; the same line after a save; a pole planned on it sends it round${round!.reaches ? '' : ' (stopping short)'})`);
}
// Weapon tiers: a hero's class weapon is reforged at the Blacksmith's anvil, one tier at a time — its
// parts from the bag (and the anvil's tray), worked like a batch (heat it, hammer it out); each tier
// hits WEAPON_DAMAGE harder. As many tiers as the models allow per class; a weapon comes first (a
// gears batch under way waits); saves and class changes keep it.
{
  const sim = new Sim({ seed: 67 });
  const st = sim.state;
  st.explored.fill(1);
  st.nextWaveAt = 1e9;
  const h = st.heroes[0];
  if (h.weaponTier !== 0 || weaponTier(h) !== 0) fail('a new hero should carry its first weapon (tier 0)');
  if (maxWeaponTier('tank') !== 6 || maxWeaponTier('support') !== 3 || maxWeaponTier('magic') !== 3) fail('the tiers should follow the models: seven swords, four axes, four staffs');
  for (const cls of ['tank', 'support', 'magic'] as const) {
    if (Object.keys(WEAPONS[cls].tiers[0].cost).length) fail('the first weapon should cost nothing');
    WEAPONS[cls].tiers.slice(1).forEach((t, i) => (Object.keys(t.cost).length && (t.cost.ingot ?? 0) > 0) || fail(`${cls} tier ${i + 1} should take iron bars`));
    if (!Object.keys(WEAPONS[cls].tiers[maxWeaponTier(cls)].cost).some((k) => ['ruby', 'sapphire', 'topaz', 'amethyst', 'emerald'].includes(k))) fail(`the top ${cls} weapon should take gems`);
  }
  // Damage: ×(1 + 0.12 · tier), melee and bolts alike.
  h.tools = ['axe', 'hammer'];
  const base = heroDamage(h);
  h.weaponTier = 3;
  if (Math.abs(heroDamage(h) / base - (1 + 3 * WEAPON_DAMAGE)) > 1e-9) fail(`tier 3 should hit ${1 + 3 * WEAPON_DAMAGE}× (${(heroDamage(h) / base).toFixed(3)}×)`);
  h.cls = 'magic';
  const bolt0 = heroDamage({ ...h, weaponTier: 0 });
  if (Math.abs(heroDamage(h) / bolt0 - 1.36) > 1e-9) fail('a Mage\'s bolts should grow with the staff too');
  h.cls = 'tank';
  h.weaponTier = 0;
  // The anvil (in town, in the workshop quarter), and the way in.
  const c = townSpot(sim, 'anvil');
  if (!h.known.includes('anvil')) h.known.push('anvil');
  sim.apply({ t: 'place', hero: h.id, plan: 'anvil', cx: c.cx, cz: c.cz });
  forceCompleteSite(sim, st.sites[st.sites.length - 1]);
  const anvil = st.buildings.find((b) => b.kind === 'anvil') ?? fail('no anvil');
  const denials: string[] = [];
  sim.events.on('denied', (e) => denials.push(e.reason));
  const tryReforge = () => {
    denials.length = 0;
    sim.apply({ t: 'reforge', hero: h.id, building: anvil.id });
    return denials[0] ?? null;
  };
  h.bag = { ingot: 2 };
  h.x = h.px = anvil.x + Math.cos(anvil.rot) * 3;
  h.z = h.pz = anvil.z - Math.sin(anvil.rot) * 3;
  if (!tryReforge()?.includes('inside')) fail(`reforging from outside the smithy should be refused (${denials[0]})`);
  sim.apply({ t: 'interact', hero: h.id, target: anvil.id });
  for (let i = 0; i < 20 * 12 && !insideOf(sim, h, anvil); i++) sim.step();
  if (!insideOf(sim, h, anvil)) fail('the hero should get into the smithy');
  h.bag = { ingot: 1 };
  if (!tryReforge()?.includes('Iron Ingot')) fail(`a reforge without its bars should be refused (${denials[0]})`);
  // A gears batch is under way: the weapon comes first, the batch waits (its ingot back on the tray).
  anvil.input = { ingot: 2 };
  sim.step();
  if (!anvil.busy || anvil.forgeFor) fail('the anvil should be making gears');
  h.bag = { ingot: 1 };
  if (tryReforge()) fail(`one bar in the bag and the batch's on the anvil should do (${denials[0]})`);
  if (anvil.forgeFor !== h.id || h.task.k !== 'work' || h.bag.ingot) fail(`the weapon should be on the anvil, its bars paid, the hero at work (forgeFor ${anvil.forgeFor}, task ${h.task.k}, bag ${JSON.stringify(h.bag)})`);
  if (tryReforge() !== 'Your weapon is on the anvil already') fail(`one weapon at a time (${denials[0]})`);
  let reforged = -1;
  sim.events.on('reforged', (e) => (reforged = e.tier));
  for (let i = 0; i < 20 * 30 && reforged < 0; i++) {
    if (h.task.k === 'work') sim.apply({ t: 'beat', hero: h.id, quality: 1 });
    sim.step();
  }
  if (reforged !== 1 || h.weaponTier !== 1 || weaponTier(h) !== 1) fail(`the weapon should come off the anvil a tier up (event ${reforged}, tier ${h.weaponTier})`);
  if (anvil.forgeFor) fail('the anvil should be free again');
  for (let i = 0; i < 20 * 25 && !(anvil.output.gears ?? 0); i++) sim.step();
  if (!(anvil.output.gears ?? 0)) fail(`the set-aside gears should be made after (tray ${JSON.stringify(anvil.input)}, busy ${anvil.busy})`);
  // Left alone, the anvil finishes a reforge by itself (slowly) — and the weapon is its owner's.
  h.bag = { ...WEAPONS.tank.tiers[2].cost };
  anvil.busy = false;
  anvil.input = {};
  if (tryReforge()) fail(`tier 2 should go on the anvil (${denials[0]})`);
  sim.apply({ t: 'stop', hero: h.id });
  for (let i = 0; i < 20 * 40 && h.weaponTier < 2; i++) sim.step();
  if (h.weaponTier !== 2) fail('an anvil left alone should finish the reforge in time');
  // A save keeps it; an old save without tiers carries the first weapon.
  const copy = new Sim({ seed: 67 });
  restore(copy, JSON.parse(JSON.stringify(snapshot(sim))));
  if (copy.state.heroes[0].weaponTier !== 2) fail('a save should keep the weapon tier');
  const old = JSON.parse(JSON.stringify(snapshot(sim)));
  for (const oh of old.state.heroes as Record<string, unknown>[]) delete oh.weaponTier;
  const older = new Sim({ seed: 67 });
  restore(older, old);
  if (older.state.heroes[0].weaponTier !== 0) fail('an old save should carry tier 0');
  // Class changes keep the tier, counted for the class (a Knight's tier 6 is a Mage's 3); the top is the top.
  h.weaponTier = 6;
  if (tryReforge()?.includes('fine') !== true) fail(`a Crystal Blade can't be bettered (${denials[0]})`);
  sim.apply({ t: 'chooseClass', hero: h.id, cls: 'magic' });
  if ((h.cls as string) !== 'magic' || weaponTier(h) !== 3 || h.weaponTier !== 6 || Math.abs(tierMul(h) - 1.36) > 1e-9) fail(`a Knight's tier 6 should count 3 for a Mage (${weaponTier(h)})`);
  sim.apply({ t: 'chooseClass', hero: h.id, cls: 'tank' });
  if (weaponTier(h) !== 6) fail('back to a Knight, the Crystal Blade again');
  // Dev mode: free.
  h.weaponTier = 2;
  h.bag = {};
  sim.apply({ t: 'devMode', on: true });
  if (tryReforge()) fail(`dev mode should reforge for free (${denials[0]})`);
  console.log(`weapons ✓ (tiers 7/4/4 as the models allow; ×${(1 + WEAPON_DAMAGE).toFixed(2)} a tier, bolts too; reforged only inside at the anvil, with its bars (bag + tray); a gears batch waits; worked like a batch, or slowly alone; one at a time; saved, old saves tier 0; class changes count it for the class; the top can't be bettered; free in dev mode)`);
}
// The wall across the pass: everything we own stands inside it, beyond it only towers (and what is
// built onto them). Every workshop is refused beyond the wall — saying why — and goes up in town, not
// on the wall itself; a tower the other way round; lights and poles up on the wall-walk too. The walk
// is reached by its stairs, never straight from the ground; up there the dead below can't reach you.
// The gate stands shut from the start (nobody opens it) and holds the walkers at its doors — they
// batter it till it breaks (fliers go over) — and lets nobody through; heroes mend it from inside and
// it swings shut again; saves keep it. By night the wall's
// torches light the towers near it, and a brazier up on the walk lights them further out.
{
  const sim = new Sim({ seed: 83 });
  const st = sim.state;
  st.explored.fill(1);
  st.nextWaveAt = 1e9;
  const h = st.heroes[0];
  h.tools = ['hammer', 'axe', 'pickaxe'];
  for (const id of Object.keys(PLANS) as PlanId[]) if (!h.known.includes(id)) h.known.push(id);
  let why = '';
  sim.events.on('denied', (e) => (why = e.reason));
  const tryPlace = (plan: PlanId, c: { cx: number; cz: number }): boolean => {
    why = '';
    const n = st.sites.length;
    sim.apply({ t: 'place', hero: h.id, plan, cx: c.cx, cz: c.cz });
    return st.sites.length > n;
  };
  const cancel = () => sim.apply({ t: 'cancelSite', site: st.sites[st.sites.length - 1].id });
  // Every workshop (and anything else of ours): refused beyond the wall, saying why; in town it goes down.
  const out3 = roadSpot(sim, 30, 7);
  const kinds = Object.keys(STATIONS) as StationKind[];
  for (const k of kinds) {
    if (tryPlace(k, out3)) fail(`a ${k} went down beyond the wall`);
    if (!why.startsWith('Workshops stand inside the walls')) fail(`refusing a ${k} beyond the wall should say why (${why})`);
    if (!tryPlace(k, townSpot(sim, k))) fail(`a ${k} should go down in town (${why})`);
    cancel();
  }
  if (tryPlace('port', roadSpot(sim, 40, 9)) || !why.startsWith('Beyond the wall only towers stand')) fail(`the Port went down beyond the wall (${why})`);
  if (tryPlace('pole', roadSpot(sim, 20, 6)) || !why.includes('up on the wall-walk')) fail(`a pole went down beyond the wall (${why})`);
  // A tower: refused in town, standing beyond the wall.
  if (tryPlace('tower', townSpot(sim, 'sawmill')) || !why.startsWith('Towers stand beyond the wall')) fail(`a tower went down in town (${why})`);
  if (!tryPlace('tower', out3)) fail(`a tower should go down beyond the wall (${why})`);
  cancel();
  // Up on the wall-walk: a brazier yes, a workshop no.
  const walk = wallSpot(sim, 'brazier', WALL.x, -14) ?? fail('no room on the wall-walk');
  const top = cellCenter(walk.cx, walk.cz);
  if (tryPlace('sawmill', { cx: walk.cx, cz: walk.cz })) fail('a sawmill went up on the wall');
  if (!tryPlace('brazier', walk)) fail(`a brazier should go up on the wall-walk (${why})`);
  cancel();
  // The walk is a storey up; its battlements and railing are solid.
  if (Math.abs(groundHeight(sim.world, top.x, top.z) - (sim.world.wallY + WALL.walkH)) > 0.01) fail('the wall-walk should be a storey up');
  if (!walkableAt(sim, top.x, top.z) || !onWall(top.x, top.z)) fail('the wall-walk should be walked');
  if (walkableAt(sim, WALL.x + WALL.half - 0.2, top.z) || wallAt(WALL.x + WALL.half - 0.2, top.z) !== 'solid') fail('the battlements should be solid');
  if (walkableAt(sim, WALL.x - WALL.half + 0.15, top.z)) fail('the railing should be solid');
  // Up by the stairs: the way there climbs, never jumps.
  const path = sim.pf.find(MAP.heroStart.x, MAP.heroStart.z, top.x, top.z) ?? fail('no way up onto the wall-walk');
  let [px, pz] = [MAP.heroStart.x, MAP.heroStart.z];
  let prev = groundHeight(sim.world, px, pz);
  let rise = 0;
  for (let i = 0; i < path.length; i += 2) {
    const d = Math.hypot(path[i] - px, path[i + 1] - pz);
    for (let s = 0.25; s <= d; s += 0.25) {
      const g = groundHeight(sim.world, px + ((path[i] - px) * s) / d, pz + ((path[i + 1] - pz) * s) / d);
      if (Math.abs(g - prev) > 0.6) fail(`the way up the wall jumps ${(g - prev).toFixed(2)} m (at ${px.toFixed(1)}, ${pz.toFixed(1)})`);
      rise = Math.max(rise, g - groundHeight(sim.world, MAP.heroStart.x, MAP.heroStart.z));
      prev = g;
    }
    [px, pz] = [path[i], path[i + 1]];
  }
  h.x = h.px = MAP.heroStart.x;
  h.z = h.pz = MAP.heroStart.z;
  sim.apply({ t: 'move', hero: h.id, x: top.x, z: top.z });
  for (let i = 0; i < 20 * 30 && h.task.k === 'move'; i++) sim.step();
  if (!onWall(h.x, h.z)) fail(`walking to the wall-walk should take the hero up the stair (at ${h.x.toFixed(1)}, ${h.z.toFixed(1)})`);
  // Straight up from the ground beside it: no.
  const below = { x: WALL.x - WALL.half - 0.5, z: top.z };
  h.x = h.px = below.x;
  h.z = h.pz = below.z;
  sim.apply({ t: 'pose', hero: h.id, x: WALL.x - 0.6, z: top.z, facing: Math.PI / 2, look: Math.PI / 2, gait: 'fwd', moving: true });
  if (onWall(h.x, h.z)) fail('a hero on the ground hopped straight up onto the wall-walk');
  // Up there the dead can't touch you: a walker at the gate, angry at you, doesn't get you.
  const stand = { x: WALL.x - 0.4, z: -(WALL.gatePiece + 0.8) };
  h.x = h.px = stand.x;
  h.z = h.pz = stand.z;
  h.task = { k: 'idle' };
  const north = sim.world.lanes[0];
  const angry = spawnEnemy(sim, 'warrior', 0, 0, { d: north.length - 3, lat: 0 });
  angry.spawnT = 0;
  angry.tauntT = 99;
  angry.threat = 999;
  angry.hp = angry.maxHp = 1e6;
  angry.stunT = 0;
  const hp0 = h.hp;
  for (let i = 0; i < 20 * 3; i++) {
    angry.d = Math.min(angry.d, north.length - 3);
    sim.step();
  }
  if (h.dead || h.hp < hp0) fail('a hero up on the wall-walk should be out of reach of the dead below');
  angry.hp = 0;
  sim.remove(angry.id);
  // The gate stands shut from the start, and nobody opens it (not even at its winch).
  const winch = st.pois.find((p) => p.kind === 'gate') ?? fail('no gate to work');
  if (!st.gate.shut || st.gate.hp !== st.gate.maxHp) fail('a new game should start with the gate shut and whole');
  h.x = h.px = winch.x - 1.5;
  h.z = h.pz = winch.z;
  h.task = { k: 'idle' };
  sim.apply({ t: 'gate', hero: h.id, shut: false });
  if (!st.gate.shut || !why.startsWith('The gate stays shut')) fail(`nobody should open the gate (${why})`);
  // Shut or open, no hero goes out through it (the way out there, if any is found, stops inside).
  const leaves = () => {
    const way = sim.pf.find(MAP.heroStart.x, MAP.heroStart.z, GATE.x + WALL.half + 3, 0) ?? [];
    for (let i = 0; i < way.length; i += 2) if (outsideWalls(way[i], way[i + 1])) return true;
    return walkableAt(sim, GATE.x, GATE.z);
  };
  if (leaves()) fail('a shut gate should let nobody through');
  st.gate.shut = false;
  if (leaves()) fail('no hero should go out through the open gate either');
  st.gate.shut = true;
  // (An old game saved with it open: shut at its winch — not from far off.)
  st.gate.shut = false;
  h.x = h.px = MAP.keep.x + 15;
  sim.apply({ t: 'gate', hero: h.id, shut: true });
  if (st.gate.shut || why !== 'Go to the gate first') fail(`the gate should only be worked at the gate (${why})`);
  h.x = h.px = winch.x - 1.5;
  sim.apply({ t: 'gate', hero: h.id, shut: true });
  if (!st.gate.shut) fail(`a gate left open should shut at its winch (${why})`);
  // Walkers stop at its doors and batter it; a flier goes over the wall; no lives lost to the walkers.
  const lives0 = st.lives;
  const walkers = [0, 1, 2].map((i) => {
    const e = spawnEnemy(sim, 'minion', 0, 0, { d: north.length - 7 - i, lat: 0 });
    e.spawnT = 0;
    return e;
  });
  const hp1 = st.gate.hp;
  for (let i = 0; i < 20 * 12; i++) sim.step();
  if (st.lives !== lives0 || walkers.some((e) => !sim.alive(e.id))) fail('walkers broke in through the shut gate');
  if (walkers.some((e) => e.d > north.length - GATE_STOP + 0.01)) fail('the walkers should stop at the gate\'s doors');
  if (!(st.gate.hp < hp1)) fail('the walkers at the gate should batter it');
  const battered = hp1 - st.gate.hp;
  const wraith = spawnEnemy(sim, 'wraith', 0, 0, { d: north.length - 4, lat: 0 });
  wraith.spawnT = 0;
  for (let i = 0; i < 20 * 6 && sim.alive(wraith.id); i++) sim.step();
  if (sim.alive(wraith.id) || st.lives >= lives0) fail('a flier should go over the wall, gate or no gate');
  // Battered down, it breaks open — and they come through.
  const lives1 = st.lives;
  let broke = false;
  sim.events.on('gateMoved', (e) => (broke ||= e.broken));
  st.gate.hp = 4;
  for (let i = 0; i < 20 * 15 && walkers.some((e) => sim.alive(e.id)); i++) sim.step();
  if (!broke || st.gate.shut || st.gate.hp !== 0 || st.lives >= lives1) fail(`a battered-down gate should break open and let them in (hp ${st.gate.hp}, lives ${lives1} → ${st.lives})`);
  // Mended at the winch (planks and a hammer): a third of the way, it swings shut again by itself.
  h.x = h.px = winch.x - 1.5;
  h.z = h.pz = winch.z;
  sim.apply({ t: 'gate', hero: h.id, shut: true });
  if (st.gate.shut || !why.startsWith('The gate is broken')) fail(`a broken gate shouldn't shut (${why})`);
  h.bag = { planks: 8 };
  sim.apply({ t: 'interact', hero: h.id, target: winch.id });
  let shutAt = -1;
  for (let i = 0; i < 20 * 40 && st.gate.hp < st.gate.maxHp; i++) {
    if ((h.task as { k: string }).k === 'work') sim.apply({ t: 'beat', hero: h.id, quality: 2 });
    sim.step();
    if (shutAt < 0 && st.gate.shut) shutAt = st.gate.hp;
  }
  if (st.gate.hp < st.gate.maxHp * 0.5) fail(`mending the gate (${st.gate.hp.toFixed(0)}/${st.gate.maxHp}, task ${h.task.k}, planks left ${h.bag.planks ?? 0})`);
  if (shutAt < 0 || shutAt > st.gate.maxHp * (GATE_MEND + 0.1)) fail(`a broken gate mended a third of the way should swing shut by itself (shut at ${shutAt.toFixed(0)}/${st.gate.maxHp})`);
  h.task = { k: 'idle' };
  // Mending goes quickly between the waves, slowly while the dead are ramming it.
  const mendFor = (secs: number) => {
    st.gate.hp = st.gate.maxHp * 0.5;
    st.gate.repairBuf = 0;
    h.bag = { planks: 8 };
    h.task = { k: 'idle' };
    sim.apply({ t: 'interact', hero: h.id, target: winch.id });
    const hp0 = st.gate.hp;
    for (let i = 0; i < 20 * secs; i++) {
      if ((h.task as { k: string }).k === 'work') sim.apply({ t: 'beat', hero: h.id, quality: 1 });
      sim.step();
    }
    h.task = { k: 'idle' };
    return st.gate.hp - hp0;
  };
  const calm = mendFor(3);
  const ram = spawnEnemy(sim, 'warrior', 0, 0, { d: north.length - GATE_STOP, lat: 0 });
  ram.spawnT = 0;
  ram.hp = ram.maxHp = 1e6;
  const rammed = mendFor(3);
  ram.hp = 0;
  sim.remove(ram.id);
  if (!(calm > rammed * 3) || !(rammed > 0)) fail(`mending the gate should be quick between the waves and slow under the ram (${calm.toFixed(0)} vs ${rammed.toFixed(0)} in 3 s)`);
  st.gate.hp = st.gate.maxHp;
  const copy = new Sim({ seed: 83 });
  restore(copy, JSON.parse(JSON.stringify(snapshot(sim))));
  if (JSON.stringify(copy.state.gate) !== JSON.stringify(st.gate)) fail('a save lost the gate');
  // Night: the wall's torches light a tower by the wall; one further out stays dark — until a brazier
  // burns up on the wall-walk near it (a brazier down in town doesn't reach that far).
  st.dev = true;
  sim.apply({ t: 'setTime', tod: 0.02, hold: true });
  st.dev = false;
  const raise = (plan: PlanId, c: { cx: number; cz: number }) => {
    if (!tryPlace(plan, c)) fail(`could not place a ${plan} (${why})`);
    forceCompleteSite(sim, st.sites[st.sites.length - 1]);
    return st.buildings[st.buildings.length - 1];
  };
  let nearC: { cx: number; cz: number } | null = null;
  let farC: { cx: number; cz: number } | null = null;
  for (let d = 6; d < 40 && !(nearC && farC); d += 0.5) {
    const c = findSpot(sim, lanePos(north, north.length - d, 5.6).x, lanePos(north, north.length - d, 5.6).z, 1, sizeOf('tower'), 'tower');
    if (!c) continue;
    const at = cellCenter(c.cx, c.cz);
    const wd = wallDist(at.x, at.z);
    if (!nearC && wd < NIGHT.town - 2) nearC = c;
    else if (!farC && wd > NIGHT.town + 1 && wd < NIGHT.beacon - 2.5) farC = c;
  }
  const lit = raise('tower', nearC ?? fail('no room for a tower by the wall'));
  const dark = raise('tower', farC ?? fail('no room for a tower a little way out'));
  for (let i = 0; i < 12; i++) sim.step();
  if (!lit.lit) fail(`the wall's torches should light a tower ${wallDist(lit.x, lit.z).toFixed(1)} m from the wall`);
  if (dark.lit) fail(`a tower ${wallDist(dark.x, dark.z).toFixed(1)} m out should be dark by night`);
  // (Down in town at the wall's foot — not up on the walk.)
  let inTown: { cx: number; cz: number } | null = null;
  for (let r = 0; r < 12 && !inTown; r++) {
    for (const dz of [r, -r]) {
      const c = cellOf(WALL.x - WALL.half - 1.5, dark.z + dz);
      if (!inTown && !(sim.world.cells[c.cz * GRID_W + c.cx] & GROUND.WALL) && !placementBlocker(sim, c.cx, c.cz, 1, 'brazier')) inTown = c;
    }
  }
  raise('brazier', inTown ?? fail('no room for a brazier by the wall in town'));
  for (let i = 0; i < 12; i++) sim.step();
  if (dark.lit) fail('a brazier down in town should not reach a tower out beyond the wall');
  raise('brazier', wallSpot(sim, 'brazier', dark.x, dark.z) ?? fail('no room for a brazier on the wall-walk'));
  for (let i = 0; i < 12; i++) sim.step();
  if (!dark.lit) fail(`a brazier up on the wall-walk should light the tower ${wallDist(dark.x, dark.z).toFixed(1)} m out`);
  console.log(`wall ✓ (every workshop refused beyond the wall ("${kinds.length} kinds: Workshops stand inside the walls…") and standing in town, not on the wall; towers only out, lights and poles also on the wall-walk; the walk a storey up (${rise.toFixed(2)} m), solid battlements and railing, reached by the stair, never from the ground; the dead can't reach you up there; the gate stands shut from the start (nobody opens it) and holds the walkers at its doors (3 minions battered ${battered.toFixed(0)} of its ${st.gate.maxHp} in 12 s), fliers go over, battered down it breaks open; mended with planks it swings shut again by itself, quickly between the waves (${calm.toFixed(0)} hp in 3 s) and slowly under the ram (${rammed.toFixed(0)}); saved; the wall's torches light the towers by it, a brazier on the walk those ${NIGHT.beacon} m out)`);
}
// Over the wall: heroes never leave the walls. A tower goes down only within reach of the wall; a hero
// in town who sends for a tower's plan out on the field walks up the stairs onto the wall-walk (never
// out of the gate), sends its parts over, raises it with the hammer beats, sets its gem and an
// enchanted part from up there; no walking, stepping or pathing takes them out onto the field. The
// dead's spoils out there come up to a hero walking the wall within reach (the far ones by F), not to
// one down in town; from the walk the field is seen far out (but not the town behind any further); and
// a hero found out there (a game saved on a tower top, before) is brought back in.
{
  const sim = new Sim({ seed: 87 });
  const st = sim.state;
  st.nextWaveAt = 1e9;
  const h = st.heroes[0];
  h.tools = ['hammer', 'axe', 'pickaxe'];
  for (const id of ['tower', 'swift'] as PlanId[]) if (!h.known.includes(id)) h.known.push(id);
  let why = '';
  sim.events.on('denied', (e) => (why = e.reason));
  // From the wall-walk the field beyond is seen far out — the town behind no further than on the ground.
  const lane = sim.world.lanes[0];
  let far: { x: number; z: number } | null = null;
  for (let x = WALL.x + 40; x > WALL.x + 12 && !far; x -= 1) {
    for (let z = -20; z <= 20 && !far; z += 1) {
      const q = walkSpot(x, z);
      if (!sim.isExplored(x, z) && Math.hypot(q.x - x, q.z - z) < OVER_WALL.sight - 2) far = { x, z };
    }
  }
  if (!far) fail('the whole field within sight of the wall starts uncovered: nothing to see from up there');
  const look = walkSpot(far!.x, far!.z);
  h.x = h.px = look.x;
  h.z = h.pz = look.z;
  sim.step();
  if (!sim.isExplored(far!.x, far!.z)) fail(`a hero on the wall-walk should see the field ${wallDist(far!.x, far!.z).toFixed(0)} m out`);
  if (sim.isExplored(look.x - OVER_WALL.sight + 4, look.z)) fail('the wall-walk should not show the town behind any further than the ground does');
  st.explored.fill(1);
  // A tower only within reach of the wall.
  const tooFar = (() => {
    for (let d = OVER_WALL.reach + 6; d < 120; d += 2) {
      const q = lanePos(lane, lane.length - d, 7);
      const f = findSpot(sim, q.x, q.z, 3);
      if (f && wallDist(cellCenter(f.cx, f.cz).x, cellCenter(f.cx, f.cz).z) > OVER_WALL.reach + 2) return f;
    }
    return fail('no spot out of reach of the wall');
  })();
  sim.apply({ t: 'place', hero: h.id, plan: 'tower', cx: tooFar.cx, cz: tooFar.cz });
  if (st.sites.some((x) => x.plan === 'tower') || !why.startsWith('Too far out')) fail(`a tower out of reach of the wall went down (${why})`);
  const c = roadSpot(sim, 22, 6);
  sim.apply({ t: 'place', hero: h.id, plan: 'tower', cx: c.cx, cz: c.cz });
  const site = st.sites.find((x) => x.plan === 'tower') ?? fail(`a tower within reach should go down (${why})`);
  // Sent for from town (beyond the usual interact reach): up the stairs, along the walk — never outside.
  h.x = h.px = MAP.stores.market.x + 3;
  h.z = h.pz = MAP.stores.market.z;
  h.bag = { ...site.need };
  sim.apply({ t: 'interact', hero: h.id, target: site.id });
  let out = false;
  let up = false;
  for (let i = 0; i < 20 * 60 && h.task.k !== 'work'; i++) {
    sim.step();
    out ||= outsideWalls(h.x, h.z);
    up ||= onWall(h.x, h.z);
  }
  if (out) fail('a hero sent to a tower plan set foot out on the field');
  if (h.task.k !== 'work' || !up || !onWall(h.x, h.z)) fail(`the hero should work the plan from the wall-walk (task ${h.task.k}, at ${h.x.toFixed(1)}, ${h.z.toFixed(1)}: ${why})`);
  if (Object.keys(site.need).some((k) => (site.have[k as ItemId] ?? 0) < (site.need[k as ItemId] ?? 0))) fail('the parts should have gone over the wall into the plan');
  const facing = Math.abs(Math.atan2(Math.sin(h.facing - Math.atan2(site.x - h.x, site.z - h.z)), Math.cos(h.facing - Math.atan2(site.x - h.x, site.z - h.z))));
  if (facing > 0.2) fail('the hero should face the plan out on the field while raising it');
  for (let i = 0; i < 20 * 40 && !st.buildings.some((b) => b.kind === 'tower'); i++) {
    if (h.task.k === 'work') sim.apply({ t: 'beat', hero: h.id, quality: 2 });
    sim.step();
  }
  const tower = st.buildings.find((b) => b.kind === 'tower') ?? fail('the tower was not raised from the wall-walk');
  if (!onWall(h.x, h.z)) fail('raising the tower should leave the hero up on the walk');
  // A gem from up there too.
  sim.apply({ t: 'placeGem', hero: h.id, plan: 'swift', building: tower.id });
  const gem = st.sites.find((x) => x.plan === 'swift' && x.building === tower.id) ?? fail('no swift gem site');
  h.bag = { ...gem.need };
  // (An enchanted part set in by hand, from the walk.)
  const part = (Object.keys(gem.need) as ItemId[]).find((k) => LOOT_BASES.some((l) => l.base === k)) ?? fail('the swift gem takes no part that comes enchanted');
  h.bag[part] = (h.bag[part] ?? 1) - 1;
  const inst = sim.rollGear(1, part);
  h.gear.push(inst);
  sim.apply({ t: 'socket', hero: h.id, site: gem.id, uid: inst.uid });
  if (!gem.sockets.length) fail(`an enchanted part should go in from the wall-walk (${why})`);
  sim.apply({ t: 'interact', hero: h.id, target: tower.id });
  for (let i = 0; i < 20 * 40 && !tower.gems.includes('swift'); i++) {
    if (h.task.k === 'work') sim.apply({ t: 'beat', hero: h.id, quality: 2 });
    sim.step();
  }
  if (!tower.gems.includes('swift') || !onWall(h.x, h.z)) fail(`the gem should be melted in from the wall-walk (${tower.gems.join()}, ${why})`);
  // No way out onto the field: a move refused (saying why), a step over the battlements or through
  // the gateway (even broken open) refused, no path.
  st.gate.shut = false;
  why = '';
  sim.apply({ t: 'move', hero: h.id, x: tower.x, z: tower.z });
  if (h.task.k === 'move' || !why.startsWith('Heroes never go beyond the wall')) fail(`a move out onto the field should be refused (${why})`);
  const x0 = h.x;
  sim.apply({ t: 'pose', hero: h.id, x: WALL.x + WALL.half + 0.4, z: h.z, facing: Math.PI / 2, look: Math.PI / 2, gait: 'fwd', moving: true });
  if (h.x !== x0) fail('a step over the battlements should be refused');
  h.x = h.px = GATE.x - WALL.half - 0.6;
  h.z = h.pz = 0;
  sim.apply({ t: 'pose', hero: h.id, x: GATE.x - WALL.half + 0.4, z: 0, facing: Math.PI / 2, look: Math.PI / 2, gait: 'fwd', moving: true });
  if (h.x > GATE.x - WALL.half) fail('a step into the open gateway should be refused');
  // Spoils on the field: up to a hero on the walk within reach by themselves; not to one in town.
  const g0 = st.gold;
  const near = { x: WALL.x + 6, z: tower.z };
  sim.spawnGold(20, near.x, near.z);
  for (let i = 0; i < 20; i++) sim.step();
  if (st.gold !== g0) fail('spoils out on the field came to a hero down in town');
  const spot = walkSpot(near.x, near.z);
  h.x = h.px = spot.x;
  h.z = h.pz = spot.z;
  for (let i = 0; i < 20; i++) sim.step();
  if (st.gold < g0 + 20) fail(`spoils within ${OVER_WALL.haul} m should come up to a hero on the walk (${st.gold - g0} of 20)`);
  // Further out: hauled up by F (interact) from the walk.
  const loot = sim.rollGear(2);
  const drop = sim.spawnDrop(loot.base, WALL.x + OVER_WALL.haul + 12, tower.z, WALL.x + OVER_WALL.haul + 12, tower.z, 0, loot);
  for (let i = 0; i < 20; i++) sim.step();
  if (!sim.alive(drop.id)) fail('spoils out of hauling reach should wait to be fetched');
  sim.apply({ t: 'interact', hero: h.id, target: drop.id });
  for (let i = 0; i < 20 * 10 && sim.alive(drop.id); i++) sim.step();
  if (sim.alive(drop.id) || !h.gear.some((g) => g.uid === loot.uid) || !onWall(h.x, h.z)) fail(`F on far spoils should haul them up over the wall (${why})`);
  // A hero found out on the field is brought back in.
  h.x = h.px = tower.x + 3;
  h.z = h.pz = tower.z;
  sim.step();
  if (outsideWalls(h.x, h.z) || !walkableAt(sim, h.x, h.z)) fail(`a hero out on the field should be brought back in (at ${h.x.toFixed(1)}, ${h.z.toFixed(1)})`);
  console.log(`over the wall ✓ (the field seen ${OVER_WALL.sight} m out from the walk; towers only within ${OVER_WALL.reach} m of the wall; sent from the market, up the stairs to the walk — never outside — parts over, raised, a gem and an enchanted part set from up there; no move, step or gateway out; spoils within ${OVER_WALL.haul} m come up by themselves, further out by F; a hero out there is brought back in)`);
}
// Every workshop is a walk-in room in town: the sawyer's shed, the mason's workshop, the forge house,
// the arcanist's study (and the Blacksmith's smithy above). In at the door like a player, the tray
// loaded at the bench, its beats worked there, what it made collected, and out through the doorway.
{
  const sim = new Sim({ seed: 89 });
  const st = sim.state;
  st.explored.fill(1);
  st.nextWaveAt = 1e9;
  const h = st.heroes[0];
  h.tools = ['hammer', 'axe', 'pickaxe'];
  const walk = (tx: number, tz: number, frames = 300): void => {
    const was = indoors(h.x);
    for (let i = 0; i < frames && indoors(h.x) === was; i++) {
      const dx = tx - h.x;
      const dz = tz - h.z;
      const l = Math.hypot(dx, dz);
      if (l < 0.05) break;
      const look = Math.atan2(dx, dz);
      const step = Math.min(l, heroSpeed(sim, h) / 60);
      const q = slide(sim, h.x, h.z, (dx / l) * step, (dz / l) * step);
      sim.apply({ t: 'pose', hero: h.id, x: q.x, z: q.z, facing: look, look, gait: 'fwd', moving: true });
      if (i % 3 === 0) sim.step();
    }
  };
  const jobs: [StationKind, Partial<Record<ItemId, number>>, ItemId][] = [
    ['sawmill', { wood: 2 }, 'planks'], ['stonecutter', { stone: 2 }, 'blocks'], ['forge', { ore: 2 }, 'ingot'], ['arcanist', { crystal: 1, gears: 1, copper: 2 }, 'rune'],
  ];
  const rooms: string[] = [];
  for (const [kind, input, made] of jobs) {
    if (!h.known.includes(kind)) h.known.push(kind);
    const c = townSpot(sim, kind);
    sim.apply({ t: 'place', hero: h.id, plan: kind, cx: c.cx, cz: c.cz });
    forceCompleteSite(sim, st.sites[st.sites.length - 1]);
    const b = st.buildings[st.buildings.length - 1];
    if (b.kind !== kind || b.interior === undefined || !INTERIORS[kind]) fail(`a ${kind} should have a room`);
    // In at its door, running at it.
    const door = frontDoor(b);
    h.x = h.px = door.x + Math.sin(b.rot) * 1.5;
    h.z = h.pz = door.z + Math.cos(b.rot) * 1.5;
    h.task = { k: 'idle' };
    walk(door.x - Math.sin(b.rot) * 1.2, door.z - Math.cos(b.rot) * 1.2);
    if (!insideOf(sim, h, b)) fail(`running at the ${kind}'s door should take you in (at ${h.x.toFixed(1)}, ${h.z.toFixed(1)})`);
    const def = INTERIORS[kind]!;
    const o = interiorOrigin(kind, b.interior!);
    if (walkableAt(sim, o.x + def.hx + 0.05, o.z) || !walkableAt(sim, o.x, o.z + def.hz - 0.6)) fail(`the ${kind}'s room: walls solid, floor walkable`);
    // To the bench with what it takes: loaded, worked (beats), made.
    const bench = benchOf(b)!;
    walk(bench.x, bench.z + 0.4);
    h.bag = { ...input };
    sim.apply({ t: 'interact', hero: h.id, target: b.id });
    for (let i = 0; i < 20 * 40 && !(b.output[made] ?? 0); i++) {
      if ((h.task as { k: string }).k === 'work') sim.apply({ t: 'beat', hero: h.id, quality: 2 });
      sim.step();
    }
    if (!(b.output[made] ?? 0)) fail(`working the ${kind} inside should make ${made} (task ${h.task.k}, busy ${b.busy}, tray ${JSON.stringify(b.input)}, ${Math.hypot(h.x - bench.x, h.z - bench.z).toFixed(2)} m from the bench)`);
    if (Math.hypot(h.x - bench.x, h.z - bench.z) > 1.2) fail(`the ${kind}'s work should be done at its bench`);
    h.task = { k: 'idle' };
    sim.apply({ t: 'interact', hero: h.id, target: b.id });
    for (let i = 0; i < 20 * 4 && !(h.bag[made] ?? 0); i++) sim.step();
    if (!(h.bag[made] ?? 0)) fail(`collecting the ${made} from the ${kind}`);
    // Out through the doorway, back in front of its door.
    h.task = { k: 'idle' };
    const exit = roomDoor(b)!;
    walk(exit.x, exit.z - 0.5);
    walk(exit.x, exit.z + 1);
    if (indoors(h.x) || Math.hypot(h.x - door.x, h.z - door.z) > 0.4) fail(`out of the ${kind}'s doorway you should be in front of its door`);
    rooms.push(`${def.name} (${made})`);
  }
  console.log(`workshops ✓ (each a walk-in room in town — ${rooms.join(', ')}: in at the door, loaded and worked at the bench, collected, out through the doorway)`);
}
console.log('PASS');
