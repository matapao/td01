/** Gathering, disciplines and station work: shared data and pure helpers. */
import type {
  Parts,
  ActionKind,
  ActionDef,
  NodeKind,
  NodeDef,
  Discipline,
  StationKind,
  StationDef,
} from '../content-types.ts';
import type { ItemId } from '../item-data.ts';

export function partsCount(parts: Parts): number {
  let n = 0;
  for (const k in parts) n += parts[k as ItemId] ?? 0;
  return n;
}

// ---- Hands-on actions -------------------------------------------------------------------------

export const ACTIONS: Record<ActionKind, ActionDef> = {
  hammer: { kind: 'hammer', verb: 'Hammering', hint: 'Strike when the ring meets the mark' },
  saw: { kind: 'saw', verb: 'Sawing', hint: 'Click as the saw passes the centre' },
  cut: { kind: 'cut', verb: 'Cutting', hint: 'Chisel the glowing marks' },
  smelt: {
    kind: 'smelt',
    verb: 'Smelting',
    hint: 'Hold to pump the bellows — keep the heat in the gold band',
  },
  weld: { kind: 'weld', verb: 'Welding', hint: 'Hold and follow the spark along the seam' },
  wire: { kind: 'wire', verb: 'Wiring', hint: 'Connect each terminal to its matching colour' },
  code: { kind: 'code', verb: 'Coding runes', hint: 'Repeat the rune sequence' },
};

/** Work units added per hands-on result. Passive work also progresses slowly. */
export const WORK = {
  heroPassive: 17,
  stationIdle: 8,
  good: 40,
  perfect: 62,
  miss: 0,
};

export const NODES: Record<NodeKind, NodeDef> = {
  tree: { kind: 'tree', item: 'wood', amount: 5, hitTime: 0.42, regrow: 60, verb: 'Chop' },
  rock: { kind: 'rock', item: 'stone', amount: 5, hitTime: 0.5, regrow: 85, verb: 'Mine' },
  ore: { kind: 'ore', item: 'ore', amount: 4, hitTime: 0.6, regrow: 100, verb: 'Mine' },
  crystal: { kind: 'crystal', item: 'crystal', amount: 3, hitTime: 0.72, regrow: 130, verb: 'Harvest' },
  // In Space.
  metalrock: { kind: 'metalrock', item: 'nickeliron', amount: 6, hitTime: 0.62, regrow: 140, verb: 'Mine' },
  icefield: { kind: 'icefield', item: 'ice', amount: 5, hitTime: 0.55, regrow: 160, verb: 'Dig' },
  raremound: { kind: 'raremound', item: 'rareearth', amount: 4, hitTime: 0.9, regrow: 220, verb: 'Mine' },
};

export const DISCIPLINES: Record<Discipline, { name: string; color: string; blurb: string }> = {
  carpentry: { name: 'Carpentry', color: '#d39b5a', blurb: 'Sawmills, braziers, sun topaz.' },
  masonry: { name: 'Masonry', color: '#b8c2cf', blurb: 'Towers, forges, emeralds cut for sight.' },
  smithing: { name: 'Smithing', color: '#e3bb57', blurb: 'Iron, gears; swift, fury and blast gems.' },
  arcana: { name: 'Arcana', color: '#a77bff', blurb: 'Crystals, rune cores; elemental and aura gems.' },
};

/** Mastery in a discipline = plans learned in it. Each level: faster work, cheaper learning. */
export const MASTERY = {
  workBonus: 0.12,
  learnDiscount: 0.12,
  /** Learning outside your strongest discipline costs a bit more. */
  crossPenalty: 0.1,
};

export const STATIONS: Record<StationKind, StationDef> = {
  sawmill: {
    kind: 'sawmill',
    name: 'Sawmill',
    recipes: [{ input: { wood: 2 }, output: { planks: 2 } }],
    steps: [{ action: 'saw', label: 'Saw planks', work: 60 }],
  },
  stonecutter: {
    kind: 'stonecutter',
    name: 'Stonecutter',
    recipes: [{ input: { stone: 2 }, output: { blocks: 1 } }],
    steps: [{ action: 'cut', label: 'Dress the block', work: 60 }],
  },
  forge: {
    kind: 'forge',
    name: 'Forge',
    recipes: [{ input: { ore: 2 }, output: { ingot: 1 } }],
    steps: [{ action: 'smelt', label: 'Smelt it down', work: 70 }],
  },
  anvil: {
    kind: 'anvil',
    name: 'Anvil',
    recipes: [
      { input: { ingot: 1 }, output: { gears: 2 } },
      { input: { rareearth: 1, ingot: 1 }, output: { magnet: 1 } },
    ],
    steps: [
      { action: 'hammer', label: 'Forge the teeth', work: 40 },
      { action: 'weld', label: 'Weld the hubs', work: 40 },
    ],
  },
  arcanist: {
    kind: 'arcanist',
    name: "Arcanist's Bench",
    recipes: [{ input: { crystal: 1, gears: 1, copper: 2 }, output: { rune: 1 } }],
    steps: [
      { action: 'wire', label: 'Wire the core', work: 45 },
      { action: 'code', label: 'Code the runes', work: 45 },
    ],
  },
};

/** Every item a station accepts into its input tray. */
export function stationInputs(kind: StationKind): ItemId[] {
  const set = new Set<ItemId>();
  for (const r of STATIONS[kind].recipes) for (const k in r.input) set.add(k as ItemId);
  return [...set];
}

/** Perfect bonus: chance of one extra output item. */
export const PERFECT_BONUS_CHANCE = 0.35;
/** Max items waiting in a station's input / output trays. */
export const STATION_TRAY = 12;
