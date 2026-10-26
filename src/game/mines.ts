export {
  MINE_AT,
  MINE_NAME,
  TRACK,
  WAGON,
  RIDE,
  MINERALS,
  PATH_STEP,
  STATION,
  FIELD_STEP,
  DIG,
} from './mine-parameters.ts';
export { pathAt } from './mine-track.ts';
import {
  MINE_AT,
  MINE_NAME,
  RIDE,
  MINERALS,
  STATION,
  WAGON,
  DIG,
  DRIFT,
  STOP_GAP,
  ALIGHT,
  DIG_DEPTH,
  WALK,
  CARVE,
  smin,
  hashCell,
} from './mine-parameters.ts';
import { layLine, pathAt, offset } from './mine-track.ts';
import { buildField, sample, layRock } from './mine-generation.ts';
import type { Shape } from './mine-types.ts';
export type {
  Mine,
  Mineral,
  TrackPoint,
  TrackPiece,
  Chamber,
  CaveIn,
  Wagon,
  MineLine,
  Drift,
  DigZone,
  MineLayout,
  MineField,
  DigGrid,
  MineNow,
} from './mine-types.ts';
import type { Mine, Chamber, CaveIn, Wagon, Drift, DigZone, MineLayout, MineNow } from './mine-types.ts';
export { MIN } from './mine-line-data.ts';
export type { MineralId } from './mine-line-data.ts';
export type { LairDef } from './mine-line-data.ts';
import { MIN, LINE_SPECS } from './mine-line-data.ts';
import type { MineralId, LairDef, Ore, ChamberSpec } from './mine-line-data.ts';
/**
 * Underground: the Ashdeep. One mine, blasted out of the mountain by the gate over the years — you
 * ride the lift down from the mine head into the lift station, a hall in the rock where rail lines
 * leave in four directions through timbered portals, a wagon waiting at each platform. Each line runs
 * to one mineral: a Grade I chamber along it, and further on a Grade II chamber, richer. Copper is the
 * first line, open from the start; the other lines, and every Grade II, lie beyond a cave-in that only
 * dynamite opens (once — then it stays open). Creatures den in old workings off the lines and guard
 * the Grade II chambers: harder the further out.
 *
 * In the chambers you mine the mountain itself: hack at the rock anywhere and pieces of it come off;
 * the wall gives way and the chamber grows into the rock (so far: each chamber's rock is worked to a
 * depth, then it is the mountain's hard core). The minerals run through the rock where they lie —
 * copper's veins, coal's seams, pockets of gems — so you see at a glance where there is a lot to dig,
 * and the deeper you dig the richer (and harder) it gets. Plain rock gives stone now and then.
 *
 * Everything here is plain data, the same for the simulation and the view, built once: the plan of
 * the mine (lines, track, stops and wagons, chambers and the minerals in their rock, cave-ins, lairs)
 * and a field over it, sampled on a grid — how far each point is from the rock (walls are where it is
 * 0), how high the roof is — from which the sim knows where a body can stand and the view builds the
 * rock. What changes is in Mine: which cave-ins are open, which pieces of rock have been dug out (and
 * the strikes on those being dug); each mine carries the field with its dug pieces carved in (mineState).
 * The mine lies in its own region far off the map (east of MINE_REGION_X), so nothing on the surface
 * can see or reach it.
 */
import type { ItemId } from './content.ts';
import { caveFacing, MINE_REGION_X, type Vec2 } from './map.ts';

export { MINE_REGION_X };

// ---- Building the plan --------------------------------------------------------------------------

let built: MineLayout | null = null;

/** The plan of the mine (built once: it is the same in every game). */
export function mineLayout(): MineLayout {
  if (built) return built;
  const lines = LINE_SPECS.map((s, i) => layLine(i, s));
  const shapes: Shape[] = [];
  const chambers: Chamber[] = [];
  const caveins: CaveIn[] = [];
  const wagons: Wagon[] = [];
  const lairs: LairDef[] = [];
  const drifts: Drift[] = [];
  const dens: MineLayout['dens'] = [];
  const solids: MineLayout['solids'] = [];
  /** The workable rock to lay out once the field is there: each zone's test and its minerals. */
  const zoneSpecs: {
    zone: DigZone;
    inside: (x: number, z: number, depth: number) => boolean;
    ores: Ore[];
  }[] = [];
  // The lift station.
  shapes.push({ circles: [[MINE_AT.x, MINE_AT.z, STATION.r]], lines: [], roof: STATION.roof });
  chambers.push({
    line: -1,
    grade: 0,
    name: 'the lift station',
    x: MINE_AT.x,
    z: MINE_AT.z,
    r: STATION.r,
    roof: STATION.roof,
  });
  LINE_SPECS.forEach((spec, li) => {
    // lines is produced by mapping this same LINE_SPECS array in index order.
    const line = lines[li]!;
    // The haulage drift along the whole line (from inside the station on).
    const pts: Vec2[] = [];
    for (let d = 0; d <= line.length + 1e-6; d += 0.5) pts.push(pathAt(line, d));
    pts.push(pathAt(line, line.length + 0.9));
    shapes.push({ circles: [], lines: [{ pts, half: DRIFT.half }], roof: DRIFT.roof });
    drifts.push({ pts, half: DRIFT.half, roof: DRIFT.roof, line: li, old: false });
    const room = (c: ChamberSpec, d: number, grade: number): number => {
      const blobs = c.blobs.map(([a, s, r]) => {
        const p = offset(line, d, a, s);
        return [p.x, p.z, r] as [number, number, number];
      });
      shapes.push({ circles: blobs, lines: [], roof: c.roof });
      const mid = offset(line, d, 0, 0);
      let r = 0;
      for (const [x, z, rr] of blobs) r = Math.max(r, Math.hypot(x - mid.x, z - mid.z) + rr);
      chambers.push({ line: li, grade, name: c.name, x: mid.x, z: mid.z, r, roof: c.roof });
      const ci = chambers.length - 1;
      // Its rock can be worked, a few metres in.
      zoneSpecs.push({
        zone: { name: c.name, chamber: ci, line: li, holds: {} },
        inside: (x, z) => blobs.some(([bx, bz, br]) => Math.hypot(x - bx, z - bz) < br + DIG_DEPTH),
        ores: c.ores,
      });
      return ci;
    };
    const gi = room(spec.gradeI, spec.stopI, 1);
    const gii = room(spec.gradeII, line.stopII, 2);
    line.chambers = [gi, gii];
    // Cave-ins: the first shuts the line beyond the station (if it comes before Grade I), the next Grade II.
    for (const d of spec.caves) {
      const p = pathAt(line, d);
      caveins.push({ line: li, d, half: 1.2, x: p.x, z: p.z, hx: p.tx, hz: p.tz });
    }
    // Wagons: the station's and Grade I's (leg 0), Grade I's and Grade II's (leg 1).
    const base = wagons.length;
    const wagon = (leg: number, dir: 1 | -1, d: number, to: number, side: number, dest: string) => {
      const p = pathAt(line, d);
      const a = offset(line, d, 0, side * ALIGHT);
      wagons.push({
        id: wagons.length,
        line: li,
        leg,
        dir,
        d,
        to,
        x: p.x,
        z: p.z,
        hx: p.tx,
        hz: p.tz,
        ax: a.x,
        az: a.z,
        dest,
      });
      solids.push(
        { x: p.x, z: p.z, r: WAGON.wide * 0.55 },
        { x: p.x + p.tx * WAGON.len * 0.28, z: p.z + p.tz * WAGON.len * 0.28, r: WAGON.wide * 0.5 },
        { x: p.x - p.tx * WAGON.len * 0.28, z: p.z - p.tz * WAGON.len * 0.28, r: WAGON.wide * 0.5 },
      );
    };
    wagon(0, 1, 1.0, base + 1, 1, spec.gradeI.name);
    wagon(0, -1, spec.stopI - STOP_GAP, base, -1, 'the lift station');
    wagon(1, 1, spec.stopI + STOP_GAP, base + 3, -1, spec.gradeII.name);
    wagon(1, -1, line.stopII, base + 2, -1, spec.gradeI.name);
    // The Grade II chamber's guardians.
    if (spec.gradeII.guard) {
      const g = offset(line, line.stopII, spec.gradeII.guard[0], spec.gradeII.guard[1]);
      lairs.push({ ...spec.guardII, x: g.x, z: g.z, line: li });
    }
    // An old working off Grade I, where something has made its den.
    if (spec.den) {
      const dpts = spec.den.drift.map(([a, s]) => offset(line, spec.stopI, a, s));
      const den = offset(line, spec.stopI, spec.den.den[0], spec.den.den[1]);
      dpts.push(den);
      shapes.push({ circles: [], lines: [{ pts: dpts, half: DRIFT.oldHalf }], roof: DRIFT.oldRoof });
      shapes.push({ circles: [[den.x, den.z, spec.den.den[2]]], lines: [], roof: DRIFT.denRoof });
      drifts.push({ pts: dpts, half: DRIFT.oldHalf, roof: DRIFT.oldRoof, line: li, old: true });
      lairs.push({ ...spec.den.lair, x: den.x, z: den.z, line: li });
      dens.push({ x: den.x, z: den.z, r: spec.den.den[2], lair: lairs.length - 1 });
    }
    // Patches of workable rock along the drift.
    for (const p of spec.patches ?? []) {
      zoneSpecs.push({
        zone: { name: p.name, chamber: -1, line: li, holds: {} },
        inside: (x, z, depth) => {
          if (depth > p.depth) return false;
          for (let d = p.from; d <= p.to; d += 0.25) {
            const q = pathAt(line, d);
            const side = (x - q.x) * -q.tz + (z - q.z) * q.tx;
            if (Math.hypot(x - q.x, z - q.z) < DRIFT.half + p.depth + 0.6 && side * p.side > 0.4) return true;
          }
          return false;
        },
        ores: p.ores,
      });
    }
  });
  // The station's stores: crates and barrels against its wall between the platforms (solid).
  for (let q = 0; q < 4; q++) {
    const a = (q + 0.5) * (Math.PI / 2);
    solids.push({
      x: MINE_AT.x + Math.cos(a) * (STATION.r - 1.0),
      z: MINE_AT.z + Math.sin(a) * (STATION.r - 1.0),
      r: 0.55,
    });
  }
  const field = buildField(shapes, caveins, lines, solids);
  const zones = zoneSpecs.map((z) => z.zone);
  const dig = layRock(field, zoneSpecs, caveins);
  built = { lines, chambers, caveins, wagons, lairs, drifts, zones, dens, solids, field, dig };
  return built;
}

/**
 * The workable rock: which zone each piece lies in, and what it is — the zone's minerals laid through
 * it as veins (winding bands), seams (layers) and pockets (blobs), each taking its share of the rock,
 * the share growing the deeper in (richer further in), and every mineral showing in the wall as the
 * mine is found (so you see where to dig).
 */
// ---- The mine as it is now: its field with what has been dug carved in ---------------------------

const nows = new WeakMap<Mine, MineNow>();

/** The mine as it is now (carves in whatever has been dug since it was last asked). */
export function mineNow(m: Mine): MineNow {
  const L = mineLayout();
  let c = nows.get(m);
  if (!c || m.dug.length < c.applied) {
    c = {
      sdf: L.field.sdf.slice(),
      dug: new Uint8Array(L.dig.nx * L.dig.nz),
      applied: 0,
      version: 1,
      changes: [],
    };
    nows.set(m, c);
  }
  while (c.applied < m.dug.length) carve(L, c, m.dug[c.applied++]!);
  return c;
}

function carve(L: MineLayout, c: MineNow, k: number): void {
  if (k < 0 || k >= c.dug.length || c.dug[k]) return;
  c.dug[k] = 1;
  const f = L.field;
  const { x, z } = digCenter(k);
  const r = CARVE * (0.92 + 0.18 * hashCell(k, 3));
  const reach = r + 0.5;
  const i0 = Math.max(0, Math.floor((x - reach - f.x0) / f.step));
  const i1 = Math.min(f.nx - 1, Math.ceil((x + reach - f.x0) / f.step));
  const j0 = Math.max(0, Math.floor((z - reach - f.z0) / f.step));
  const j1 = Math.min(f.nz - 1, Math.ceil((z + reach - f.z0) / f.step));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const fk = j * f.nx + i;
      const d = Math.hypot(f.x0 + i * f.step - x, f.z0 + j * f.step - z) - r;
      c.sdf[fk] = smin(c.sdf[fk]!, d, 0.3);
    }
  }
  c.version++;
  c.changes.push({ version: c.version, x0: x - reach, z0: z - reach, x1: x + reach, z1: z + reach });
}

const fieldOf = (m: Mine | undefined): Float32Array => (m ? mineNow(m).sdf : mineLayout().field.sdf);

// ---- Asking the field ---------------------------------------------------------------------------

/** How far (x, z) is from the rock (negative in the open; outside the mine: deep in rock). */
export function mineSdf(m: Mine | undefined, x: number, z: number): number {
  return sample(mineLayout().field, fieldOf(m), x, z, 9);
}

/** The roof's height over (x, z): flat over a chamber's middle, arching down to the walls. */
export function mineRoof(m: Mine | undefined, x: number, z: number): number {
  const f = mineLayout().field;
  const top = sample(f, f.roof, x, z, DRIFT.roof);
  const s = -sample(f, fieldOf(m), x, z, 9);
  const wall = top * 0.6;
  const arch = Math.min(1.5, Math.max(0.75, top * 0.55));
  const t = Math.max(0, Math.min(1, s / arch));
  return wall + (top - wall) * Math.sqrt(1 - (1 - t) * (1 - t));
}

/** How much room there is over (x, z): the roof — or, over the lift, its shaft going up into the dark. */
export function mineHeadroom(m: Mine | undefined, x: number, z: number): number {
  return Math.hypot(x - MINE_AT.x, z - MINE_AT.z) < STATION.shaft - 0.1 ? 9 : mineRoof(m, x, z);
}

/** Can a body stand at (x, z) in the mine? (Cave-ins block until they are blasted open.) */
export function mineOpen(m: Mine | undefined, x: number, z: number): boolean {
  const f = mineLayout().field;
  if (sample(f, fieldOf(m), x, z, 9) >= WALK) return false;
  const i = Math.round((x - f.x0) / f.step);
  const j = Math.round((z - f.z0) / f.step);
  if (i < 0 || j < 0 || i >= f.nx || j >= f.nz) return false;
  const k = j * f.nx + i;
  if (f.solid[k]) return false;
  const p = f.plug[k];
  return !p || !!m?.open[p - 1];
}

/** The cave-in (index) whose rubble fills (x, z), if it is still shut (else −1). */
export function caveInAt(m: Mine | undefined, x: number, z: number): number {
  const f = mineLayout().field;
  const i = Math.round((x - f.x0) / f.step);
  const j = Math.round((z - f.z0) / f.step);
  if (i < 0 || j < 0 || i >= f.nx || j >= f.nz) return -1;
  const p = f.plug[j * f.nx + i];
  return p && !m?.open[p - 1] ? p - 1 : -1;
}

// ---- The rock's pieces --------------------------------------------------------------------------

/** The dig-grid cell holding (x, z) (−1 outside the mine). */
export function digCellAt(x: number, z: number): number {
  const L = mineLayout();
  const I = Math.floor((x - L.field.x0) / DIG);
  const J = Math.floor((z - L.field.z0) / DIG);
  return I < 0 || J < 0 || I >= L.dig.nx || J >= L.dig.nz ? -1 : J * L.dig.nx + I;
}

/** A dig cell's middle. */
export function digCenter(k: number): Vec2 {
  const L = mineLayout();
  return {
    x: L.field.x0 + ((k % L.dig.nx) + 0.5) * DIG,
    z: L.field.z0 + (Math.floor(k / L.dig.nx) + 0.5) * DIG,
  };
}

/** What a piece of the mine's rock is. */
export const cellMineral = (k: number): MineralId => mineLayout().dig.mineral[k] as MineralId;

/** Strikes to break a piece off: the mineral's, and more the deeper into the rock. */
export function cellHits(k: number): number {
  const L = mineLayout();
  const d = L.dig.depth[k];
  if (d === undefined) throw new Error(`Unknown dig cell ${k}`);
  return MINERALS[cellMineral(k)].hits + (d > 1.2 ? 1 : 0) + (d > 2.1 ? 1 : 0);
}

/** Is cell k still rock (not dug, and rock as the mine was found)? */
export function cellRock(m: Mine, k: number): boolean {
  const L = mineLayout();
  return (
    Number.isInteger(k) && k >= 0 && k < L.dig.depth.length && L.dig.depth[k]! >= 0 && !mineNow(m).dug[k]
  );
}

/**
 * Can piece k be dug now: in workable rock, and at the surface (the open mine beside it)? Returns
 * null if so, else why not.
 */
export function digBlocker(m: Mine, k: number): string | null {
  const L = mineLayout();
  if (k < 0 || !cellRock(m, k)) return 'Nothing to dig there';
  if (L.dig.zone[k]! < 0) return "This rock won't give — dig in the chambers' walls";
  const { x, z } = digCenter(k);
  // At the surface: open ground within a piece's width of its middle.
  const now = mineNow(m);
  const f = L.field;
  let exposed = false;
  for (const [dx, dz] of [
    [DIG, 0],
    [-DIG, 0],
    [0, DIG],
    [0, -DIG],
  ] as const) {
    if (sample(f, now.sdf, x + dx, z + dz, 9) < 0) exposed = true;
  }
  return exposed ? null : 'Dig your way to it from the open rock face';
}

/** What a piece gives when it breaks: its mineral — or, for plain rock, stone every other piece. */
export function cellYield(k: number): ItemId | null {
  const min = cellMineral(k);
  if (min !== MIN.rock) return MINERALS[min].item;
  return hashCell(k, 11) < 0.5 ? 'stone' : null;
}

// ---- The mine's state ---------------------------------------------------------------------------

/** The mine as a new game finds it: the Copper Line open, every other line and Grade II caved in. */
export function newMine(cave: Vec2 & { front?: Vec2 }): Mine {
  const m: Mine = {
    id: 0,
    name: MINE_NAME,
    head: { x: 0, z: 0 },
    exit: { x: 0, z: 0 },
    lift: { ...MINE_AT },
    open: mineLayout().caveins.map(() => false),
    dug: [],
    dmg: {},
  };
  placeHead(m, cave);
  return m;
}

/** The mine head above (read from the map, so a mine head that moves takes its mine along). */
export function placeHead(m: Mine, cave: Vec2 & { front?: Vec2 }): void {
  const face = caveFacing(cave);
  m.head = { x: cave.x, z: cave.z };
  m.exit = { x: cave.x + Math.sin(face) * 5.8, z: cave.z + Math.cos(face) * 5.8 };
}

/** Is the leg a wagon rides along free of cave-ins? (Null if so; else the cave-in that shuts it.) */
export function legBlocked(m: Mine, w: Wagon): CaveIn | null {
  const L = mineLayout();
  const other = L.wagons[w.to];
  if (!other) throw new Error(`Unknown destination wagon ${w.to}`);
  const lo = Math.min(w.d, other.d);
  const hi = Math.max(w.d, other.d);
  for (let i = 0; i < L.caveins.length; i++) {
    const c = L.caveins[i]!;
    if (c.line === w.line && !m.open[i] && c.d + c.half > lo && c.d - c.half < hi) return c;
  }
  return null;
}

/** How long a ride from wagon w to the next stop takes (s). */
export function rideTime(w: Wagon): number {
  const L = mineLayout();
  const destination = L.wagons[w.to];
  if (!destination) throw new Error(`Unknown destination wagon ${w.to}`);
  const len = Math.abs(destination.d - w.d);
  const { speed: v, accel: a } = RIDE;
  const ramp = (v * v) / a;
  return len >= ramp ? len / v + v / a : 2 * Math.sqrt(len / a);
}

/** How far along the line a ride from wagon w is, t s in. */
export function rideAlong(w: Wagon, t: number): number {
  const L = mineLayout();
  const destination = L.wagons[w.to];
  if (!destination) throw new Error(`Unknown destination wagon ${w.to}`);
  const len = Math.abs(destination.d - w.d);
  const { speed: v, accel: a } = RIDE;
  const T = rideTime(w);
  t = Math.max(0, Math.min(T, t));
  let s: number;
  if (len >= (v * v) / a) {
    const ta = v / a;
    if (t < ta) s = 0.5 * a * t * t;
    else if (t > T - ta) s = len - 0.5 * a * (T - t) * (T - t);
    else s = 0.5 * a * ta * ta + v * (t - ta);
  } else {
    const h = T / 2;
    s = t < h ? 0.5 * a * t * t : len - 0.5 * a * (T - t) * (T - t);
  }
  return w.d + w.dir * Math.max(0, Math.min(len, s));
}

// ---- Lairs and places ---------------------------------------------------------------------------

/** Who lairs in the mine's lair i (see MineLayout.lairs). */
export function lairDef(i: number): LairDef | undefined {
  return mineLayout().lairs[i];
}

/** The mine whose region holds world point x (or undefined on the surface). */
export function mineAtX(mines: readonly Mine[], x: number): Mine | undefined {
  return x > MINE_REGION_X ? mines[0] : undefined;
}

/** The chamber (index) a point is in, or −1 − line for a point in a line's drift (or −1). */
export function chamberAt(x: number, z: number): number {
  const L = mineLayout();
  let best = 0;
  let bd = Infinity;
  L.chambers.forEach((c, i) => {
    const d = Math.hypot(x - c.x, z - c.z) - c.r;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  if (bd < 0.5) return best;
  let line = -1;
  let ld = Infinity;
  for (const dr of L.drifts) {
    for (const p of dr.pts) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < ld) {
        ld = d;
        line = dr.line;
      }
    }
  }
  if (line < 0 || ld > 3) return best;
  return -1 - line;
}

/** Everything the mine's rock gives (for tests and the guide). */
export function mineItems(): Set<ItemId> {
  const out = new Set<ItemId>();
  for (const z of mineLayout().zones)
    for (const k of Object.keys(z.holds))
      if ((z.holds[Number(k) as MineralId] ?? 0) > 0) out.add(MINERALS[Number(k) as MineralId].item);
  return out;
}
