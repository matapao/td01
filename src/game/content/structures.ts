/** Building footprints, durability, power and repair rules. */
import type { BuildingKind } from '../content-types.ts';
import type { ItemId } from '../item-data.ts';

/**
 * There is one tower: a stone tower with an archer on top. Its five lower windows are gem sockets,
 * one per colour — the gems set in them (see Plans) enchant and buff the archer; its four upper
 * windows take devices. Workshops, power and fire are buildings of their own.
 */

/**
 * Cells a building stands on (square, odd): no more ground than its model covers. Buildings stand
 * square to the grid (quarter turns), so their neighbours can go right up against them.
 */
export const BUILDING_SIZE: Record<BuildingKind, number> = {
  shop: 3,
  tower: 3,
  sawmill: 3,
  stonecutter: 3,
  forge: 3,
  anvil: 3,
  arcanist: 3,
  hydro: 3,
  pole: 1,
  lamp: 1,
  brazier: 1,
  port: 5,
};
export const sizeOf = (kind: BuildingKind): number => BUILDING_SIZE[kind];

/** The grid: poles reach the next pole (or the generator) within `link` m; buildings within `reach` m are on it. */
export const POWER = { link: 14, reach: 7, stationBoost: 1.5 };

/**
 * Night: in the dark a tower sees up to `rangeLoss` less far — unless it is lit: a brazier within
 * `brazier` m, a lamp on the grid within `lamp` m, or the torches along the wall (within `town` m of
 * it). A brazier or a lamp up on the wall-walk burns high: it lights everything within `beacon` m.
 */
export const NIGHT = { rangeLoss: 0.2, brazier: 7, lamp: 10, town: 12, beacon: 16 };

/** Building durability (siege mobs and boss stomps damage buildings). */
export const BUILDING_HP: Record<BuildingKind, number> = {
  shop: 320,
  tower: 450,
  sawmill: 300,
  stonecutter: 300,
  forge: 340,
  anvil: 320,
  arcanist: 300,
  hydro: 640,
  pole: 120,
  lamp: 160,
  brazier: 240,
  port: 800,
};

/** Hurt buildings work slower; repair restores HP per material unit. */
export const REPAIR = {
  /** HP restored per raw (wood/stone) or processed (planks/blocks) unit. */
  raw: 45,
  processed: 110,
  /**
   * Hammering it back: a second's passive work and a beat's work count this many times over — a
   * building's quickly, and the gate's too between the waves; while the dead are ramming it, the
   * gate's slowly (gatePassive, gateBeat: it only slows a breach — see wall.gateRammed).
   */
  passive: 1.3,
  beat: 1.4,
  gatePassive: 0.25,
  gateBeat: 0.25,
  materials: ['planks', 'blocks', 'wood', 'stone'] as ItemId[],
  /** Below this fraction a tower fires slower. */
  hurt: 0.5,
  hurtRate: 0.7,
};

/** Fraction of a building's parts dropped back when it is demolished (or a gem's extra parts when it is taken out). */
export const SALVAGE = 0.5;

export function isTower(k: BuildingKind): k is 'tower' {
  return k === 'tower';
}
