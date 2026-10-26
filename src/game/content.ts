/**
 * Compatibility entry for gameplay content. Import focused leaves for new internal dependencies.
 * Catalogues own authored values; rules own pure calculations. Neither imports this barrel.
 */
export type * from './content-types.ts';
export type { ItemId, ItemDef } from './item-data.ts';
export { ITEMS, ITEM_ORDER } from './item-data.ts';
export * from './content/workshop.ts';
export * from './content/structures.ts';
export * from './content/combat.ts';
export * from './content/tower-data.ts';
export * from './content/plans.ts';
export * from './content/tower-rules.ts';
export * from './content/shops.ts';
export * from './content/equipment.ts';
export * from './content/enemies.ts';
export * from './content/heroes.ts';
export * from './content/world-rules.ts';
