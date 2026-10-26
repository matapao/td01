/** Mine geometry and persistent mining state. */
import type { Vec2 } from './path-resampling.ts';
import type { ItemId } from './item-data.ts';
import type { MineralId, LairDef } from './mine-line-data.ts';

/** The state that changes. */
export interface Mine {
  id: number;
  name: string;
  /** The mine head above (and where you step out of its door). */
  head: Vec2;
  exit: Vec2;
  /** The lift below: the station's middle. */
  lift: Vec2;
  /** Cave-ins blasted open, once and for good (by index into MineLayout.caveins). */
  open: boolean[];
  /** Pieces of rock dug out (dig-grid cells, in the order they came out). */
  dug: number[];
  /** Strikes taken by pieces being dug (by cell). */
  dmg: Record<number, number>;
}

// ---- What the rock is made of -------------------------------------------------------------------

export interface Mineral {
  name: string;
  /** What a piece of it gives (plain rock: stone, now and then). */
  item: ItemId;
  /** Strikes of the pickaxe to break a piece off (in the first metre or so of rock). */
  hits: number;
  /** The ore itself (lumps, crystals, glints) and the stain it leaves in the rock round it. */
  ore: string;
  stain: string;
  gem?: boolean;
}

/** A point along a line's track: where, and which way it runs (unit). */
export interface TrackPoint {
  x: number;
  z: number;
  tx: number;
  tz: number;
}

/** One piece of the track as laid (for the view): where it starts, the heading there, and a curve's turn. */
export interface TrackPiece {
  kind: 'station' | 'straight' | 'curve';
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** A curve: does it turn right (else left)? */
  right: boolean;
  /** Distance along the line where it starts. */
  d: number;
}

export interface Chamber {
  line: number;
  /** 1 or 2 (0: the lift station). */
  grade: number;
  name: string;
  /** Its middle (world) and how far its rock reaches out from there, roughly. */
  x: number;
  z: number;
  r: number;
  /** The roof's height in its middle. */
  roof: number;
}

export interface CaveIn {
  line: number;
  /** Where along the line it chokes the drift, and how far either way. */
  d: number;
  half: number;
  x: number;
  z: number;
  /** The line's heading there. */
  hx: number;
  hz: number;
}

/**
 * A wagon waiting at a stop. Rides only run between neighbouring stops (the station and Grade I,
 * Grade I and Grade II), each leg with a wagon waiting at either end.
 */
export interface Wagon {
  id: number;
  line: number;
  /** 0: station ↔ Grade I, 1: Grade I ↔ Grade II. */
  leg: number;
  /** Which way it rolls along the line (+1 out, −1 back). */
  dir: 1 | -1;
  /** Where it waits (distance along the line), and the wagon it arrives at. */
  d: number;
  to: number;
  x: number;
  z: number;
  /** The line's heading out at its spot. */
  hx: number;
  hz: number;
  /** Where its rider steps on and off, beside it on the platform. */
  ax: number;
  az: number;
  /** "the Copper Face" — where it takes you. */
  dest: string;
}

export interface MineLine {
  id: number;
  name: string;
  /** What it was driven for ("Copper"). */
  mineral: string;
  color: string;
  pieces: TrackPiece[];
  /** The track's middle line, a point every PATH_STEP (index × PATH_STEP = distance along). */
  path: TrackPoint[];
  length: number;
  /** Where the Grade I and Grade II stops are (distance along). */
  stopI: number;
  stopII: number;
  /** Index of the line's chambers in MineLayout.chambers. */
  chambers: [number, number];
}

/** A drift (for the view: timbers follow drifts). */
export interface Drift {
  /** A polyline (world), its half width and roof. */
  pts: Vec2[];
  half: number;
  roof: number;
  line: number;
  /** An old working (no track; old timbers). */
  old: boolean;
}

/** Rock that can be worked: a chamber's (to a depth), or a patch along a drift. */
export interface DigZone {
  name: string;
  /** The chamber it belongs to (−1: a patch along a line). */
  chamber: number;
  line: number;
  /** How many pieces of each mineral it holds (for tests and the guide). */
  holds: Partial<Record<MineralId, number>>;
}

export interface MineLayout {
  lines: MineLine[];
  chambers: Chamber[];
  caveins: CaveIn[];
  wagons: Wagon[];
  lairs: LairDef[];
  drifts: Drift[];
  zones: DigZone[];
  /** The old workings' dens (world middles), for the view's dressing. */
  dens: { x: number; z: number; r: number; lair: number }[];
  /** Solid things on the floor (parked wagons, the station's stores): circles. */
  solids: { x: number; z: number; r: number }[];
  field: MineField;
  dig: DigGrid;
}

/**
 * The mine sampled on a grid: `sdf` how far each point is from the rock (negative in the open,
 * 0 on the walls) as the mine was found, `roof` the roof's height there before its arch down to the
 * walls, `plug` which cave-in (index + 1) chokes it, `solid` what stands on the floor.
 */
export interface MineField {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  step: number;
  sdf: Float32Array;
  roof: Float32Array;
  plug: Uint8Array;
  solid: Uint8Array;
}

/**
 * The rock as pieces that can be dug (DIG m square, two field steps a side, their middles on field
 * points): which zone each lies in (−1: the mountain's core, not to be worked), what it is, and how
 * deep into the rock it lies (m beyond the wall as the mine was found).
 */
export interface DigGrid {
  nx: number;
  nz: number;
  zone: Int16Array;
  mineral: Uint8Array;
  depth: Float32Array;
}

export interface Shape {
  /** Circles (x, z, r) and capsules (polyline, half width) that make it, hard-unioned. */
  circles: [number, number, number][];
  lines: { pts: Vec2[]; half: number }[];
  roof: number;
}

/** Each mine's field as it is now (what's been dug carved in), kept beside it (not in the state). */
export interface MineNow {
  sdf: Float32Array;
  dug: Uint8Array;
  /** How many of the mine's `dug` have been carved in. */
  applied: number;
  /** Bumped by every piece carved; and the boxes carved since the start (for the view). */
  version: number;
  changes: { version: number; x0: number; z0: number; x1: number; z1: number }[];
}
