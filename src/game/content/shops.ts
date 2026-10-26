/** Shop inventories and pricing rules. */
import type { StoreId, StoreDef } from '../content-types.ts';
import { ITEMS } from '../item-data.ts';
import type { ItemId } from '../item-data.ts';

export const CRATE_PRICE = 45;

/** Scrolls cost their learn gold here (the studying still takes time). */
export const STORES: Record<StoreId, StoreDef> = {
  market: {
    id: 'market',
    name: 'Vale Shop',
    keeper: 'Trader Wynn',
    blurb: 'Durable utilities only. Gather materials in the world.',
    goods: [],
    scrolls: [],
    crafterKit: true,
  },
  smithy: {
    id: 'smithy',
    name: 'Smithy',
    keeper: 'Smith Hilde',
    blurb: 'Iron, gears and siege plans.',
    goods: ['ingot', 'gears'],
    crafterKit: true,
    scrolls: ['forge', 'anvil', 'swift', 'fury', 'blast', 'storm'],
  },
  arcane: {
    id: 'arcane',
    name: 'Arcane Emporium',
    keeper: 'Sister Vey',
    blurb: 'Crystals, cores and arcane plans.',
    goods: ['crystal', 'rune', 'quartz'],
    scrolls: ['arcanist', 'arcane', 'twin', 'scry', 'frost', 'rime'],
    enchanted: ['crystal', 'rune'],
  },
  guild: {
    id: 'guild',
    name: "Builders' Guild",
    keeper: 'Master Oren',
    blurb: 'Structural plans for builders.',
    goods: [],
    scrolls: ['stonecutter', 'turret', 'gallery', 'seer', 'far', 'sun', 'ember', 'warheart'],
  },
  dwarven: {
    id: 'dwarven',
    name: 'Dwarven Trading Post',
    keeper: 'Brunni Ironfoot',
    blurb: 'Metal at mountain prices — and enchanted metalwork.',
    goods: ['ore', 'ingot', 'gears', 'dynamite', 'coal'],
    scrolls: ['blast', 'fury'],
    discount: { ore: 0.6, ingot: 0.65, gears: 0.7 },
    enchanted: ['gears', 'ingot', 'blocks'],
    crates: true,
    hidden: true,
  },
};

export const STORE_ORDER: StoreId[] = ['market', 'smithy', 'arcane', 'guild', 'dwarven'];

export function storePrice(store: StoreId, item: ItemId): number {
  return Math.max(1, Math.round(ITEMS[item].price * (STORES[store].discount?.[item] ?? 1)));
}

/** Price of an enchanted part in a specialist's stock. */
export function enchantedPrice(base: ItemId, rarity: number, ilvl: number): number {
  return Math.round(ITEMS[base].price * 3 + rarity * rarity * 22 + ilvl * 4);
}
