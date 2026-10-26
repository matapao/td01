/** Enchanted item and affix contracts. */
import type { ItemId } from './item-data.ts';

export type Rarity = 1 | 2 | 3;

export type AffixId =
  | 'haste'
  | 'keen'
  | 'reach'
  | 'brutal'
  | 'frost'
  | 'blaze'
  | 'storm'
  | 'sunder'
  | 'gilded'
  | 'bounty'
  | 'sturdy'
  | 'swift'
  | 'arcane';

export interface Affix {
  id: AffixId;
  v: number;
}

export interface ItemInstance {
  uid: number;
  base: ItemId;
  rarity: Rarity;
  ilvl: number;
  affixes: Affix[];
  name: string;
}
