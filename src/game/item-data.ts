export type ItemId =
  | 'wood'
  | 'stone'
  | 'ore'
  | 'crystal'
  | 'scrap'
  | 'planks'
  | 'blocks'
  | 'ingot'
  | 'gears'
  | 'rune'
  // From the mines: the stuff complex parts are made of.
  | 'coal'
  | 'copper'
  | 'silver'
  | 'nugget'
  | 'quartz'
  | 'sulfur'
  | 'dynamite'
  // Raw gems, by colour (see GEM_COLORS): melted into the variants that go into tower sockets.
  | 'ruby'
  | 'sapphire'
  | 'topaz'
  | 'amethyst'
  | 'emerald'
  // From Space: what Earth lacks (see space.ts).
  | 'nickeliron'
  | 'ice'
  | 'rareearth'
  // Made from them at home.
  | 'magnet';

export interface ItemDef {
  id: ItemId;
  name: string;
  /** 0 = raw/drop, 1 = processed, 2 = component. */
  tier: 0 | 1 | 2;
  color: string;
  /** Store price per unit (gold); stores buy back at half. */
  price: number;
  source: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  wood: { id: 'wood', name: 'Wood', tier: 0, color: '#b9783f', price: 3, source: 'Chop trees' },
  stone: { id: 'stone', name: 'Stone', tier: 0, color: '#a3acb7', price: 3, source: 'Mine rocks' },
  ore: { id: 'ore', name: 'Iron Ore', tier: 0, color: '#d07a45', price: 6, source: 'Mine ore veins' },
  crystal: {
    id: 'crystal',
    name: 'Crystal',
    tier: 0,
    color: '#b583ff',
    price: 10,
    source: 'Harvest crystal clusters',
  },
  scrap: {
    id: 'scrap',
    name: 'Scrap',
    tier: 0,
    color: '#8d7f6e',
    price: 2,
    source: 'Junk from a mystery crate; the market takes it',
  },
  planks: { id: 'planks', name: 'Planks', tier: 1, color: '#e0a564', price: 8, source: 'Sawmill · 2 Wood' },
  blocks: {
    id: 'blocks',
    name: 'Stone Block',
    tier: 1,
    color: '#cfd7e2',
    price: 9,
    source: 'Stonecutter · 2 Stone',
  },
  ingot: { id: 'ingot', name: 'Iron Ingot', tier: 1, color: '#9fb2c8', price: 16, source: 'Forge · 2 Ore' },
  gears: { id: 'gears', name: 'Gears', tier: 2, color: '#e3bb57', price: 12, source: 'Anvil · 1 Ingot → 2' },
  rune: {
    id: 'rune',
    name: 'Rune Core',
    tier: 2,
    color: '#a77bff',
    price: 45,
    source: 'Arcanist · Crystal + Gears + 2 Copper',
  },
  coal: {
    id: 'coal',
    name: 'Coal',
    tier: 0,
    color: '#2b2a2e',
    price: 4,
    source: 'Mine coal seams underground',
  },
  copper: {
    id: 'copper',
    name: 'Copper Ore',
    tier: 0,
    color: '#d9824a',
    price: 8,
    source: 'Mine copper veins underground',
  },
  silver: {
    id: 'silver',
    name: 'Silver Ore',
    tier: 0,
    color: '#d6dde6',
    price: 14,
    source: 'Mine silver veins deep underground',
  },
  nugget: {
    id: 'nugget',
    name: 'Gold Nugget',
    tier: 0,
    color: '#f2c94c',
    price: 22,
    source: 'Deep veins underground',
  },
  quartz: {
    id: 'quartz',
    name: 'Quartz',
    tier: 0,
    color: '#e8f4ff',
    price: 10,
    source: 'Quartz pockets underground (silicon)',
  },
  sulfur: {
    id: 'sulfur',
    name: 'Sulfur',
    tier: 0,
    color: '#e8d84a',
    price: 6,
    source: 'Sulfur seams underground',
  },
  ruby: {
    id: 'ruby',
    name: 'Raw Ruby',
    tier: 0,
    color: '#e8364f',
    price: 30,
    source: 'Ruby pockets in the mines',
  },
  sapphire: {
    id: 'sapphire',
    name: 'Raw Sapphire',
    tier: 0,
    color: '#3d7dff',
    price: 32,
    source: 'Sapphire pockets in the mines',
  },
  topaz: {
    id: 'topaz',
    name: 'Raw Topaz',
    tier: 0,
    color: '#ffc331',
    price: 28,
    source: 'Topaz pockets in the mines',
  },
  amethyst: {
    id: 'amethyst',
    name: 'Raw Amethyst',
    tier: 0,
    color: '#a65cff',
    price: 38,
    source: 'Amethyst pockets deep in the mines',
  },
  emerald: {
    id: 'emerald',
    name: 'Raw Emerald',
    tier: 0,
    color: '#2fd27a',
    price: 32,
    source: 'Emerald pockets in the mines',
  },
  nickeliron: {
    id: 'nickeliron',
    name: 'Nickel-Iron',
    tier: 0,
    color: '#9aa4b2',
    price: 30,
    source: 'The metal outcrops in Space',
  },
  ice: {
    id: 'ice',
    name: 'Water Ice',
    tier: 0,
    color: '#cfeeff',
    price: 26,
    source: 'The shadowed crater in Space',
  },
  magnet: {
    id: 'magnet',
    name: 'Rare-earth Magnet',
    tier: 2,
    color: '#5fd0b0',
    price: 120,
    source: 'Anvil · 1 Rare Earths + 1 Ingot — strong magnets for generators',
  },
  rareearth: {
    id: 'rareearth',
    name: 'Rare Earths',
    tier: 0,
    color: '#7fe0c0',
    price: 90,
    source: 'The rare-earth vein in Space — shipped home by the base',
  },
  dynamite: {
    id: 'dynamite',
    name: 'Dynamite',
    tier: 1,
    color: '#d4483a',
    price: 18,
    source: 'Mine preparation bench · starter training, then 1 coal + 1 sulfur makes 2 game charges',
  },
};

export const ITEM_ORDER: ItemId[] = [
  'wood',
  'stone',
  'ore',
  'coal',
  'copper',
  'silver',
  'nugget',
  'quartz',
  'sulfur',
  'ruby',
  'sapphire',
  'topaz',
  'amethyst',
  'emerald',
  'crystal',
  'scrap',
  'planks',
  'blocks',
  'ingot',
  'gears',
  'rune',
  'dynamite',
  'nickeliron',
  'ice',
  'rareearth',
  'magnet',
];
