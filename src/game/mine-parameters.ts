/** Shared dimensions and deterministic numeric rules for the authored mine. */
import { MINE_REGION_X } from './map-data.ts';
import type { Vec2 } from './path-resampling.ts';
import { MIN } from './mine-line-data.ts';
import type { MineralId } from './mine-line-data.ts';
import type { Mineral } from './mine-types.ts';
/** The lift station's middle, in the world (the mine's own region, well clear of the map's grids). */
export const MINE_AT: Vec2 = { x: MINE_REGION_X + 260, z: -420 };
export const MINE_NAME = 'Ashdeep';

/** The toy train set's pieces at the mine's scale: a straight's length, a curve's radius, the station piece. */
export const TRACK = { scale: 1.25, straight: 1.25, radius: 2.5, station: 3.75 };
/** A wagon (the train set's tender at TRACK.scale): its length and width. */
export const WAGON = { len: 0.8, wide: 0.56 };

/** How a ride runs: top speed (m/s) and how hard it speeds up and slows down (m/s²). */
export const RIDE = { speed: 6, accel: 5 };

export const MINERALS: Record<MineralId, Mineral> = {
  [MIN.rock]: { name: 'Rock', item: 'stone', hits: 2, ore: '#8c8780', stain: '#8c8780' },
  [MIN.coal]: { name: 'Coal seam', item: 'coal', hits: 2, ore: '#161517', stain: '#2a2624' },
  [MIN.copper]: { name: 'Copper vein', item: 'copper', hits: 3, ore: '#e07a3c', stain: '#3f8a6a' },
  [MIN.iron]: { name: 'Iron vein', item: 'ore', hits: 3, ore: '#b5643a', stain: '#8a4a2c' },
  [MIN.sulfur]: { name: 'Sulfur', item: 'sulfur', hits: 2, ore: '#eadb3e', stain: '#a89a3a' },
  [MIN.silver]: { name: 'Silver vein', item: 'silver', hits: 3, ore: '#e0e8f2', stain: '#8a96a8' },
  [MIN.quartz]: { name: 'Quartz', item: 'quartz', hits: 3, ore: '#f2f8ff', stain: '#c2c6cc' },
  [MIN.gold]: { name: 'Gold vein', item: 'nugget', hits: 4, ore: '#ffd24a', stain: '#a88a3a' },
  [MIN.ruby]: { name: 'Ruby pocket', item: 'ruby', hits: 4, ore: '#e8364f', stain: '#7a3040', gem: true },
  [MIN.topaz]: { name: 'Topaz pocket', item: 'topaz', hits: 4, ore: '#ffc331', stain: '#a07a30', gem: true },
  [MIN.sapphire]: {
    name: 'Sapphire pocket',
    item: 'sapphire',
    hits: 4,
    ore: '#3d7dff',
    stain: '#34508a',
    gem: true,
  },
  [MIN.emerald]: {
    name: 'Emerald pocket',
    item: 'emerald',
    hits: 4,
    ore: '#2fd27a',
    stain: '#2f7a52',
    gem: true,
  },
  [MIN.amethyst]: {
    name: 'Amethyst pocket',
    item: 'amethyst',
    hits: 5,
    ore: '#a65cff',
    stain: '#5a3a8a',
    gem: true,
  },
};

// ---- The plan -----------------------------------------------------------------------------------

/** Spacing of the points along a line's middle. */
export const PATH_STEP = 0.1;

/** The lift station: its rock reaches this far from the lift, its roof this high; platforms start here. */
export const STATION = { r: 6.4, roof: 2.75, platform: 2.2, shaft: 1.05 };
export const DRIFT = { half: 1.15, roof: 1.75, oldHalf: 1.0, oldRoof: 1.6, denRoof: 2.1 };
/** Wagons wait this far either side of the Grade I stop, and this far short of the line's end. */
export const STOP_GAP = 0.55;
export const END_GAP = 0.6;
export const ALIGHT = 0.95;
/** How far into the rock round a chamber it can be worked. */
export const DIG_DEPTH = 2.6;
/** No working within this of a cave-in (so nobody digs round one). */
export const CAVE_CLEAR = 3.4;

// ---- The field ----------------------------------------------------------------------------------

export const FIELD_STEP = 0.25;
export const DIG = FIELD_STEP * 2;
/** How far either side of the line a cave-in's rubble reaches (the drift's width and its wandering walls). */
export const CAVE_WIDE = 1.9;
/** A body stands where the rock is at least this far off (and its body's edges too: see bodyFree). */
export const WALK = -0.12;
/** How far the walls wander from the plan (m). */
export const WOBBLE = 0.34;
/** A piece dug out leaves a hollow this wide (m, radius) round its middle. */
export const CARVE = 0.36;

export const smin = (a: number, b: number, k: number): number => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/** A deterministic hash in [0, 1) for a cell. */
export const hashCell = (k: number, salt = 0): number => {
  let h = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 7, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
