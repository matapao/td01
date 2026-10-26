export type { Rarity, AffixId, Affix, ItemInstance } from './loot-types.ts';
import type { Rarity, AffixId, Affix, ItemInstance } from './loot-types.ts';
/**
 * Loot: enchanted parts. An enchanted part is a normal base part (Gears, Planks…) with random
 * affixes. It fills a plan slot like its base, and the finished building inherits its affixes —
 * so two towers from the same plan can end up very different.
 */
import type { RNG } from '../core/rng.ts';
import type { EnemyKind, ItemId } from './content.ts';

export const RARITY: Record<Rarity, { name: string; color: string }> = {
  1: { name: 'Enchanted', color: '#6aa8ff' },
  2: { name: 'Rare', color: '#ffd35a' },
  3: { name: 'Legendary', color: '#ff8a2a' },
};

interface AffixDef {
  id: AffixId;
  prefix?: string;
  suffix?: string;
  bases: ItemId[];
  /** Value range at item level 1 and the growth per item level. */
  min: number;
  max: number;
  perLevel: number;
  /** Integer values (e.g. chain jumps). */
  int?: boolean;
  cap?: number;
  text: (v: number) => string;
}

export const AFFIXES: Record<AffixId, AffixDef> = {
  haste: {
    id: 'haste',
    suffix: 'of Haste',
    bases: ['gears', 'ingot', 'rune'],
    min: 6,
    max: 12,
    perLevel: 0.8,
    text: (v) => `+${v}% attack speed`,
  },
  keen: {
    id: 'keen',
    prefix: 'Keen',
    bases: ['gears', 'ingot', 'crystal'],
    min: 4,
    max: 8,
    perLevel: 0.5,
    text: (v) => `+${v}% critical chance`,
  },
  reach: {
    id: 'reach',
    suffix: 'of Reach',
    bases: ['planks', 'blocks', 'crystal'],
    min: 0.6,
    max: 1.4,
    perLevel: 0.08,
    text: (v) => `+${v} range`,
  },
  brutal: {
    id: 'brutal',
    prefix: 'Brutal',
    bases: ['blocks', 'ingot', 'gears'],
    min: 8,
    max: 15,
    perLevel: 1,
    text: (v) => `+${v}% damage`,
  },
  frost: {
    id: 'frost',
    suffix: 'of Frost',
    bases: ['crystal', 'rune'],
    min: 12,
    max: 20,
    perLevel: 0.6,
    cap: 45,
    text: (v) => `hits slow by ${v}%`,
  },
  blaze: {
    id: 'blaze',
    prefix: 'Blazing',
    bases: ['planks', 'rune', 'ingot'],
    min: 4,
    max: 8,
    perLevel: 0.7,
    text: (v) => `hits burn for ${v}/s`,
  },
  storm: {
    id: 'storm',
    suffix: 'of Storms',
    bases: ['rune', 'crystal'],
    min: 1,
    max: 1,
    perLevel: 0.05,
    int: true,
    cap: 3,
    text: (v) => `hits arc to ${v} more ${v === 1 ? 'enemy' : 'enemies'}`,
  },
  sunder: {
    id: 'sunder',
    prefix: 'Sundering',
    bases: ['ingot', 'blocks', 'gears'],
    min: 15,
    max: 25,
    perLevel: 1,
    cap: 70,
    text: (v) => `ignores ${v}% armour`,
  },
  gilded: {
    id: 'gilded',
    prefix: 'Gilded',
    bases: ['planks', 'blocks', 'gears', 'ingot'],
    min: 10,
    max: 20,
    perLevel: 1,
    text: (v) => `+${v}% gold from its kills`,
  },
  bounty: {
    id: 'bounty',
    suffix: 'of Plenty',
    bases: ['planks', 'crystal', 'rune'],
    min: 15,
    max: 30,
    perLevel: 1.2,
    text: (v) => `+${v}% loot from its kills`,
  },
  sturdy: {
    id: 'sturdy',
    prefix: 'Sturdy',
    bases: ['planks', 'blocks', 'ingot'],
    min: 12,
    max: 25,
    perLevel: 1,
    text: (v) => `footmen +${v}% health`,
  },
  swift: {
    id: 'swift',
    suffix: 'of the Drill',
    bases: ['planks', 'gears'],
    min: 10,
    max: 20,
    perLevel: 0.8,
    cap: 60,
    text: (v) => `footmen respawn ${v}% faster`,
  },
  arcane: {
    id: 'arcane',
    prefix: 'Runed',
    bases: ['rune', 'crystal', 'blocks'],
    min: 6,
    max: 12,
    perLevel: 0.8,
    text: (v) => `+${v} magic damage per hit`,
  },
};

export const LOOT_BASES: { base: ItemId; w: number }[] = [
  { base: 'gears', w: 3 },
  { base: 'planks', w: 3 },
  { base: 'blocks', w: 3 },
  { base: 'ingot', w: 2 },
  { base: 'crystal', w: 2 },
  { base: 'rune', w: 1 },
];

const BASE_NAMES: Partial<Record<ItemId, string[]>> = {
  gears: ['Cog', 'Gear Train', 'Clockwork', 'Spring Coil'],
  planks: ['Beam', 'Oak Plank', 'Timber', 'Lath'],
  blocks: ['Ashlar', 'Cornerstone', 'Keystone', 'Stone Block'],
  ingot: ['Ingot', 'Iron Bar', 'Steel Billet', 'Rivet Plate'],
  crystal: ['Shard', 'Prism', 'Geode', 'Crystal'],
  rune: ['Rune Core', 'Sigil Stone', 'Glyph', 'Ward Core'],
};

const RARE_A = [
  'Grave',
  'Storm',
  'Bone',
  'Ember',
  'Dusk',
  'Iron',
  'Wraith',
  'Hollow',
  'Rune',
  'Blight',
  'Dawn',
  'Thorn',
];
const RARE_B = [
  'Bite',
  'Song',
  'Heart',
  'Spire',
  'Fang',
  'Mark',
  'Ward',
  'Call',
  'Grasp',
  'Brand',
  'Wake',
  'Crown',
];

/** Legendaries: fixed names and boosted affixes. */
const LEGENDARIES: { name: string; base: ItemId; affixes: Affix[] }[] = [
  {
    name: "Gorrak's Gearheart",
    base: 'gears',
    affixes: [
      { id: 'haste', v: 30 },
      { id: 'brutal', v: 25 },
    ],
  },
  {
    name: 'The Frozen Choir',
    base: 'crystal',
    affixes: [
      { id: 'frost', v: 40 },
      { id: 'storm', v: 2 },
    ],
  },
  {
    name: 'Ashen Keystone',
    base: 'blocks',
    affixes: [
      { id: 'blaze', v: 18 },
      { id: 'sunder', v: 50 },
    ],
  },
  {
    name: 'Quartermaster’s Beam',
    base: 'planks',
    affixes: [
      { id: 'reach', v: 3 },
      { id: 'gilded', v: 50 },
      { id: 'bounty', v: 50 },
    ],
  },
  {
    name: 'Sigil of the Last Watch',
    base: 'rune',
    affixes: [
      { id: 'storm', v: 3 },
      { id: 'arcane', v: 25 },
    ],
  },
];

/** Chance per kill to drop an enchanted part. */
export const DROP_CHANCE: Record<EnemyKind, number> = {
  minion: 0.035,
  runner: 0.045,
  warrior: 0.1,
  necromancer: 0.16,
  wraith: 0.07,
  crusher: 0.12,
  digger: 0.06,
  lich: 1,
  colossus: 1,
  // The mine's creatures.
  wolf: 0.05,
  orc: 0.1,
  golem: 0.25,
};

function weighted<T extends { w: number }>(rng: RNG, items: T[]): T {
  let total = 0;
  for (const i of items) total += i.w;
  let r = rng.next() * total;
  for (const i of items) {
    r -= i.w;
    if (r <= 0) return i;
  }
  const last = items[items.length - 1];
  if (!last) throw new RangeError('No weighted loot entries configured');
  return last;
}

export function rollRarity(rng: RNG, luck = 0): Rarity {
  const r = rng.next();
  if (r < 0.015 + luck * 0.01) return 3;
  if (r < 0.2 + luck * 0.05) return 2;
  return 1;
}

function rollAffix(rng: RNG, def: AffixDef, ilvl: number): number {
  const raw = def.min + (def.max - def.min) * rng.next() + def.perLevel * (ilvl - 1);
  const v = def.int
    ? Math.max(1, Math.floor(raw))
    : Math.round(raw * (raw < 5 ? 10 : 1)) / (raw < 5 ? 10 : 1);
  return def.cap ? Math.min(def.cap, v) : v;
}

export function rollItem(rng: RNG, uid: number, ilvl: number, rarity: Rarity, base?: ItemId): ItemInstance {
  if (rarity === 3) {
    const leg = rng.pick(LEGENDARIES);
    return { uid, base: leg.base, rarity, ilvl, affixes: leg.affixes.map((a) => ({ ...a })), name: leg.name };
  }
  const b = base ?? weighted(rng, LOOT_BASES).base;
  const pool = (Object.values(AFFIXES) as AffixDef[]).filter((a) => a.bases.includes(b));
  const count = rarity === 1 ? 1 : rng.int(2, 3);
  const affixes: Affix[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(rng.next() * pool.length);
    // The loop checks a nonempty pool and rng.next() keeps idx within its bounds.
    const def = pool.splice(idx, 1)[0]!;
    affixes.push({ id: def.id, v: rollAffix(rng, def, ilvl) });
  }
  const baseName = rng.pick(BASE_NAMES[b] ?? [b]);
  let name: string;
  if (rarity === 2) name = `${rng.pick(RARE_A)}${rng.pick(RARE_B).toLowerCase()} ${baseName}`;
  else {
    const first = affixes[0];
    if (!first) throw new RangeError(`No affixes configured for ${b}`);
    const def = AFFIXES[first.id];
    name = def.prefix ? `${def.prefix} ${baseName}` : `${baseName} ${def.suffix}`;
  }
  return { uid, base: b, rarity, ilvl, affixes, name };
}

export function affixText(a: Affix): string {
  return AFFIXES[a.id].text(a.v);
}

/** Sum affixes by id (stacking). */
export function sumAffixes(list: readonly Affix[]): Partial<Record<AffixId, number>> {
  const out: Partial<Record<AffixId, number>> = {};
  for (const a of list) out[a.id] = (out[a.id] ?? 0) + a.v;
  return out;
}
