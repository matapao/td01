export { minePath, mineWalkable } from './mining-navigation.ts';
export { lairLooted } from './mining-rewards.ts';
export { MINING } from './mining-rules.ts';
export { underground } from './mining-rules.ts';
import { MINING, underground } from './mining-rules.ts';
import { updateBlasting } from '../blasting.ts';
import { beginTransit } from '../transit-start.ts';
/**
 * The mine at work (see game/mines.ts for its plan): the lift; riding the wagons from stop to stop;
 * hacking at the rock — every strike of the pickaxe chips at a piece of it, and after a few the
 * piece breaks away (with whatever it holds) and the wall gives; dynamite — a fuse, then a blast that
 * opens a cave-in for good, brings down a whole stretch of wall at once and hurts anything close (you
 * too: stand back); the paths a hero walks through the drifts and what's been dug; the mine's lairs;
 * and bringing a game saved before the mine was reworked into this one.
 */
import type { Sim } from '../sim.ts';
import type { Command, Hero, Id } from '../types.ts';
import { dist } from '../../core/math.ts';
import { earthWalkable } from '../excavation.ts';
import { MAP } from '../map.ts';
import {
  DIG,
  cellHits,
  cellMineral,
  cellRock,
  cellYield,
  digBlocker,
  digCellAt,
  digCenter,
  legBlocked,
  mineLayout,
  mineNow,
  newMine,
  pathAt,
  placeHead,
  rideAlong,
  rideTime,
  type Mine,
} from '../mines.ts';
import { bodyFree } from './hero-movement.ts';
import { railLoad } from './rails.ts';

export function applyMiningCommand(sim: Sim, cmd: Command): boolean {
  if (cmd.t !== 'ride' && cmd.t !== 'blast' && cmd.t !== 'dig') return false;
  const h = sim.getAs(cmd.hero, 'hero');
  if (!h || h.dead) return true;
  const deny = (reason: string) => sim.emit('denied', { hero: h.id, reason });
  if (cmd.t === 'blast') {
    if (h.ride) return (deny('Not from a moving wagon'), true);
    // Dev mode: dynamite without carrying any.
    if ((h.bag.dynamite ?? 0) <= 0 && !sim.state.dev)
      return (deny('No dynamite — the Dwarven Trading Post sells it'), true);
    if (!sim.state.dev) sim.takeFromBag(h, 'dynamite', 1);
    const b = {
      id: sim.newId(),
      x: h.x + Math.sin(h.facing) * 0.5,
      z: h.z + Math.cos(h.facing) * 0.5,
      t: MINING.fuse,
      hero: h.id,
    };
    sim.state.bombs.push(b);
    sim.emit('bombLit', { hero: h.id, id: b.id, x: b.x, z: b.z });
    return true;
  }
  const m = sim.state.mines[0];
  if (!m || !underground(h.x)) {
    if (cmd.t === 'dig') deny('Aim at rock and right-click to excavate');
    return true;
  }
  if (h.ride) return true;
  if (cmd.t === 'dig') {
    const k = digCellAt(cmd.x, cmd.z);
    const why = digBlocker(m, k);
    if (why) return (deny(why), true);
    if (!h.tools.includes('pickaxe') && !sim.state.dev)
      return (deny('You need a pickaxe — buy the Crafter Kit at the counter inside the shop'), true);
    const c = digCenter(k);
    if (dist(h.x, h.z, c.x, c.z) > MINING.reach + 0.5) return (deny('Too far away'), true);
    h.task = { k: 'dig', mine: m.id, cell: k };
    h.path = [];
    h.pathGoal = null;
    return true;
  }
  const w = mineLayout().wagons[cmd.wagon];
  if (!w) return true;
  if (h.droneOn) return (deny('Bring the drone home first'), true);
  if (dist(h.x, h.z, w.x, w.z) > MINING.board + 0.4) return (deny('Walk up to the wagon first'), true);
  if (legBlocked(m, w)) return (deny(`Caved in on the way to ${w.dest} — blast it open with dynamite`), true);
  startRide(sim, h, w.id);
  return true;
}

// ---- Hacking at the rock ------------------------------------------------------------------------

/** The dig task: swing, chip, break — and on to the next piece of the same mineral, if there's one in reach. */
export function digTick(sim: Sim, h: Hero, mine: number, k: number, dt: number): void {
  const m = sim.state.mines[mine];
  const c = digCenter(k);
  if (!m || !cellRock(m, k) || dist(h.x, h.z, c.x, c.z) > MINING.reach + 0.7) {
    h.task = { k: 'idle' };
    return;
  }
  h.facing = Math.atan2(c.x - h.x, c.z - h.z);
  h.anim = 'mine';
  h.swingCd -= dt;
  if (h.swingCd > 0) return;
  h.swingCd = MINING.hitTime;
  h.animT = 0;
  m.dmg[k] = (m.dmg[k] ?? 0) + 1;
  const min = cellMineral(k);
  sim.emit('digHit', { hero: h.id, mine, cell: k, mineral: min, x: c.x, z: c.z });
  if (m.dmg[k] < cellHits(k)) return;
  breakCell(sim, m, k, h, false);
  // Carry on: the next piece in reach, the same mineral if there is one (else idle).
  const next = nextPiece(m, h, k, min);
  h.task = next >= 0 ? { k: 'dig', mine, cell: next } : { k: 'idle' };
}

/** The piece to hack at next: in reach, at the open face, the same mineral first (then the nearest). */
function nextPiece(m: Mine, h: Hero, last: number, min: number): number {
  if (min === 0) return -1;
  const L = mineLayout();
  const c = digCenter(last);
  let best = -1;
  let bd = Infinity;
  const r = Math.ceil(MINING.reach / DIG) + 1;
  const I0 = last % L.dig.nx;
  const J0 = Math.floor(last / L.dig.nx);
  for (let dj = -r; dj <= r; dj++) {
    for (let di = -r; di <= r; di++) {
      const I = I0 + di;
      const J = J0 + dj;
      if (I < 0 || J < 0 || I >= L.dig.nx || J >= L.dig.nz) continue;
      const k = J * L.dig.nx + I;
      if (cellMineral(k) !== min || digBlocker(m, k)) continue;
      const p = digCenter(k);
      if (dist(h.x, h.z, p.x, p.z) > MINING.reach) continue;
      const d = dist(p.x, p.z, c.x, c.z);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
  }
  return best;
}

/** A piece of rock breaks away: it's dug out for good, and what it holds goes into the bag (or falls). */
function breakCell(
  sim: Sim,
  m: Mine,
  k: number,
  h: Hero | null,
  blasted: boolean,
  by: Id = h?.id ?? 0,
): void {
  if (!cellRock(m, k)) return;
  m.dug.push(k);
  delete m.dmg[k];
  mineNow(m);
  const c = digCenter(k);
  const item = cellYield(k);
  if (item) {
    // Into the bag of who hacked it off; what a blast brings down falls on the floor.
    if (blasted || !h || sim.addToBag(h, item, 1) < 1) sim.spawnDrop(item, c.x, c.z, c.x, c.z, by);
    sim.state.stats.gathered++;
  }
  sim.emit('cellDug', {
    hero: by,
    mine: m.id,
    cell: k,
    mineral: cellMineral(k),
    x: c.x,
    z: c.z,
    item,
    blasted,
  });
}

// ---- Riding the wagons --------------------------------------------------------------------------

function startRide(sim: Sim, h: Hero, wagon: number): void {
  const w = mineLayout().wagons[wagon];
  if (!w) return;
  h.ride = { wagon, t: 0 };
  h.task = { k: 'idle' };
  h.path = [];
  h.pathGoal = null;
  h.moveT = 0;
  h.steer.mx = h.steer.mz = 0;
  h.gait = 'idle';
  h.x = h.px = w.x;
  h.z = h.pz = w.z;
  h.facing = Math.atan2(w.hx * w.dir, w.hz * w.dir);
  sim.emit('rideStart', { hero: h.id, wagon, x: w.x, z: w.z });
}

/** A rider rolls on along the line; at the next stop they climb out onto its platform. */
export function rideTick(sim: Sim, h: Hero, dt: number): void {
  const r = h.ride!;
  const L = mineLayout();
  const w = L.wagons[r.wagon];
  if (!w || h.dead) {
    h.ride = null;
    return;
  }
  r.t += dt;
  const line = L.lines[w.line];
  if (!line) throw new Error(`Wagon references missing line ${w.line}`);
  const p = pathAt(line, rideAlong(w, r.t));
  h.x = p.x;
  h.z = p.z;
  h.facing = Math.atan2(p.tx * w.dir, p.tz * w.dir);
  h.anim = 'idle';
  h.gait = 'idle';
  if (r.t < rideTime(w)) return;
  const to = L.wagons[w.to];
  if (!to) throw new Error(`Unknown destination wagon ${w.to}`);
  h.ride = null;
  h.x = h.px = to.ax;
  h.z = h.pz = to.az;
  // Out onto the platform, facing on the way you came.
  h.look = h.facing;
  sim.emit('rideEnd', { hero: h.id, wagon: w.to, x: h.x, z: h.z });
}

// ---- Dynamite -----------------------------------------------------------------------------------

/** Lit dynamite: count down, then blow — cave-ins, a stretch of wall, creatures and careless miners. */
export function updateBombs(sim: Sim, dt: number): void {
  updateBlasting(sim, dt);
}

// ---- The lift -----------------------------------------------------------------------------------

/** Ride the lift: down from the mine head into the lift station, or back up into the daylight. */
export function boardLift(sim: Sim, h: Hero, mine: number, down: boolean): void {
  const m = sim.state.mines[mine];
  if (!m || h.transit) return;
  const edge = down ? m.exit : m.lift;
  h.facing = h.look = down ? Math.atan2(m.head.x - m.exit.x, m.head.z - m.exit.z) : Math.PI / 2;
  beginTransit(h, { kind: 'lift', duration: 2.8, mine, down, edge: { x: edge.x, z: edge.z } });
}
export function rideLift(sim: Sim, h: Hero, mine: number, down: boolean): void {
  const m = sim.state.mines[mine];
  if (!m) return;
  if (down) h.visitedMine = true;
  let x: number;
  let z: number;
  if (down) {
    // Into the cage in the middle of the station, looking out along the Copper Line.
    x = m.lift.x;
    z = m.lift.z;
    h.facing = h.look = Math.PI / 2;
  } else {
    // Step out of the mine head's door.
    const dx = m.exit.x - m.head.x;
    const dz = m.exit.z - m.head.z;
    const l = Math.hypot(dx, dz) || 1;
    x = m.exit.x;
    z = m.exit.z;
    for (let r = 0; r < 6 && !bodyFree(sim, x, z); r++) {
      x += dx / l;
      z += dz / l;
    }
    // Facing out, away from the mine.
    h.facing = h.look = Math.atan2(dx, dz);
  }
  h.x = h.px = x;
  h.z = h.pz = z;
  h.ride = null;
  h.task = { k: 'idle' };
  h.path = [];
  h.pathGoal = null;
  h.moveT = 0;
  sim.emit('rideLift', { hero: h.id, mine, down, x, z });
  // Up with ore, where the rails start: it rides the carts to the forge.
  if (!down) railLoad(sim, h, mine);
}

// ---- Every tick ---------------------------------------------------------------------------------

/** Anyone down the mine where no one can stand (an old game, a cave-in's rubble) is brought back to the lift. */
export function updateMine(sim: Sim): void {
  const m = sim.state.mines[0];
  if (!m) return;
  for (const h of sim.state.heroes) {
    if (h.dead || h.ride || h.flight || !underground(h.x)) continue;
    // Brushing the rock is fine; only lost in it (or under a cave-in's rubble) brings you back.
    const near =
      earthWalkable(sim, h.x, h.z) ||
      (
        [
          [0.2, 0],
          [-0.2, 0],
          [0, 0.2],
          [0, -0.2],
        ] as const
      ).some(([dx, dz]) => earthWalkable(sim, h.x + dx, h.z + dz));
    if (near) continue;
    h.x = h.px = m.lift.x;
    h.z = h.pz = m.lift.z;
    h.task = { k: 'idle' };
    h.path = [];
    h.pathGoal = null;
  }
}

// ---- Setting the mine up ------------------------------------------------------------------------

/** The mine's places for a new game: the mine head, and the lift below it. */
export function addMinePlaces(sim: Sim): void {
  const m = sim.state.mines[0];
  if (!m) return;
  sim.add('poi', { id: sim.newId(), kind: 'mine', mine: m.id, x: m.exit.x, z: m.exit.z, r: 0.9 });
  sim.add('poi', { id: sim.newId(), kind: 'lift', mine: m.id, x: m.lift.x, z: m.lift.z, r: 1.0 });
}

/** Creatures in the mine's lairs (each a camp: cleared, it fills again in time). */
export function addMineLairs(sim: Sim): void {
  const m = sim.state.mines[0];
  if (!m) return;
  mineLayout().lairs.forEach((_, i) => sim.addLair(m, i));
}

/**
 * After a game is restored: a game from before the mine was reworked (the old dug-out mines, or
 * several of them) gets the Ashdeep as it is now — its places and lairs; anyone who was down an old
 * mine stands at the lift, with everything they carried, and what lay on the old floors is gathered
 * by the lift. Every game: the mine head is wherever the map has it now.
 */
export function restoreMine(sim: Sim): void {
  const s = sim.state;
  // Legacy chamber creatures do not belong in the new solid-rock mine.
  const oldLairs = new Set(s.camps.filter((c) => c.lair).map((c) => c.id));
  for (const e of s.enemies) if (oldLairs.has(e.camp)) sim.remove(e.id);
  for (const c of s.camps) if (c.lair) sim.remove(c.id);
  sim.compactNow();
  const L = mineLayout();
  const m0 = s.mines?.[0] as (Mine & { cells?: unknown }) | undefined;
  const fresh =
    !m0 ||
    s.mines.length !== 1 ||
    'cells' in m0 ||
    !Array.isArray(m0.open) ||
    m0.open.length !== L.caveins.length ||
    !Array.isArray(m0.dug);
  if (fresh) {
    s.mines = [newMine(MAP.caves[0])];
    for (const p of s.pois) if (p.kind === 'mine' || p.kind === 'lift') sim.remove(p.id);
    s.pois = s.pois.filter((p) => p.kind !== 'mine' && p.kind !== 'lift');
    const lairs = new Set(s.camps.filter((c) => c.lair).map((c) => c.id));
    for (const e of s.enemies) if (lairs.has(e.camp)) sim.remove(e.id);
    for (const c of s.camps) if (c.lair) sim.remove(c.id);
    s.camps = s.camps.filter((c) => !c.lair);
    for (const n of s.nodes) if (underground(n.x)) sim.remove(n.id);
    s.nodes = s.nodes.filter((n) => !underground(n.x));
    s.bombs = s.bombs.filter((b) => !underground(b.x));
    // Both restoration paths establish the single mine before moving any actors.
    const m = s.mines[0]!;
    for (const h of s.heroes) {
      h.ride = null;
      if (!underground(h.x)) continue;
      h.x = h.px = m.lift.x;
      h.z = h.pz = m.lift.z;
      h.task = { k: 'idle' };
      h.path = [];
      h.pathGoal = null;
    }
    s.drops.forEach((d, i) => {
      if (!underground(d.x)) return;
      const a = i * 2.39996;
      d.x = m.lift.x + Math.cos(a) * (1.4 + (i % 3) * 0.3);
      d.z = m.lift.z + Math.sin(a) * (1.4 + (i % 3) * 0.3);
    });
    addMinePlaces(sim);
    sim.ensureTunnelCamps();
    sim.compactNow();
  }
  for (const h of s.heroes) h.ride ??= null;
  // Both restoration paths establish the single mine before moving any actors.
  const m = s.mines[0]!;
  m.dmg ??= {};
  placeHead(m, MAP.caves[0]);
  const head = s.pois.find((p) => p.kind === 'mine');
  if (head) {
    head.x = m.exit.x;
    head.z = m.exit.z;
    head.r = 0.9;
  }
}
