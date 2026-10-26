/** Durable tools, kit prices and class weapon progression. */
import type { ToolId, ToolDef, NodeKind, HeroClass, WeaponLine, WeaponTier, Step } from '../content-types.ts';

// ---- Tools ------------------------------------------------------------------------------------

export const TOOLS: Record<ToolId, ToolDef> = {
  scanner: {
    id: 'scanner',
    name: 'Mineral Scanner',
    price: 0,
    use: 'V: pulse nearby rock for estimated mineral deposits.',
    weapon: 0,
  },
  seedPouch: {
    id: 'seedPouch',
    name: 'Seed Pouch',
    price: 0,
    use: 'Reusable tree seeds: shovel once, plant once. Trees grow in 90 seconds.',
    weapon: 0,
  },
  axe: {
    id: 'axe',
    name: "Woodsman's Axe",
    price: 10,
    use: 'Chop trees for wood. A decent weapon too.',
    weapon: 1,
  },
  pickaxe: { id: 'pickaxe', name: 'Pickaxe', price: 10, use: 'Mine rock, ore and crystal.', weapon: 0.65 },
  hammer: {
    id: 'hammer',
    name: "Builder's Hammer",
    price: 8,
    use: 'Assemble plans and repair buildings.',
    weapon: 0.75,
  },
  shovel: { id: 'shovel', name: 'Shovel', price: 6, use: 'Dig ice and loose ground.', weapon: 0.5 },
};

export const TOOL_ORDER: ToolId[] = ['axe', 'pickaxe', 'hammer', 'shovel', 'scanner', 'seedPouch'];

export const TORCH = {
  name: 'Pitchwood Torch',
  price: 5,
  use: 'A resin-wrapped stick for exploring the mine. L lights or extinguishes it. Reusable; no fuel timer.',
};

/** One purchase grants every hand tool; older saves get credit for tools already owned. */
export const CRAFTER_KIT = {
  name: 'Crafter Kit',
  tools: TOOL_ORDER,
  contents: 'Axe, pickaxe, shovel, hammer, mineral scanner and reusable seed pouch.',
};
export function crafterKitPrice(owned: readonly ToolId[]): number {
  return CRAFTER_KIT.tools.reduce((sum, tool) => sum + (owned.includes(tool) ? 0 : TOOLS[tool].price), 0);
}

/** Bare-handed melee damage multiplier. */
export const FISTS = 0.35;

/** The tool each resource needs. */
export const NODE_TOOL: Record<NodeKind, ToolId> = {
  tree: 'axe',
  rock: 'pickaxe',
  ore: 'pickaxe',
  crystal: 'pickaxe',
  metalrock: 'pickaxe',
  icefield: 'shovel',
  raremound: 'pickaxe',
};

export function weaponMul(tools: readonly ToolId[]): number {
  return Math.max(FISTS, ...tools.map((t) => TOOLS[t].weapon));
}

// ---- Weapons ----------------------------------------------------------------------------------

/** Each tier adds this much to the hero's damage (tier 0 is the weapon a hero starts with). */
export const WEAPON_DAMAGE = 0.12;

/**
 * The weapons each class is seen with, tier by tier — as many tiers as the models allow: the Knight's
 * seven swords (and four shields), the Warchief's four war axes (his weapon whenever no tool is in his
 * hands), the Mage's four staffs. One tier at a time, at the anvil.
 */
export const WEAPONS: Record<HeroClass, WeaponLine> = {
  tank: {
    kind: 'Sword and shield',
    tiers: [
      { name: 'Wooden Sword', model: 'sword_A', shield: 'shield_A', cost: {} },
      { name: 'Iron Sword', model: 'sword_B', shield: 'shield_B', cost: { ingot: 2 } },
      { name: 'Sabre', model: 'sword_C', shield: 'shield_B', cost: { ingot: 3, coal: 2 } },
      { name: 'Rapier', model: 'sword_D', shield: 'shield_C', cost: { ingot: 4, silver: 2 } },
      {
        name: 'Greatsword',
        model: 'sword_E',
        shield: 'shield_C',
        cost: { ingot: 5, silver: 2, sapphire: 1 },
      },
      {
        name: 'Flamebrand',
        model: 'sword_F',
        shield: 'shield_D',
        cost: { ingot: 5, nugget: 2, sapphire: 2 },
      },
      {
        name: 'Crystal Blade',
        model: 'sword_G',
        shield: 'shield_D',
        cost: { ingot: 6, nugget: 3, sapphire: 3 },
      },
    ],
  },
  support: {
    kind: 'War axe',
    tiers: [
      { name: 'Twin Hatchet', model: 'axe_A', cost: {} },
      { name: "Butcher's Axe", model: 'axe_C', cost: { ingot: 2 } },
      { name: 'Double Axe', model: 'axe_B', cost: { ingot: 4, silver: 2 } },
      { name: "Chieftain's Axe", model: 'axe_D', cost: { ingot: 5, nugget: 2, ruby: 2 } },
    ],
  },
  magic: {
    kind: 'Staff',
    tiers: [
      { name: 'Oak Staff', model: 'staff_A', cost: {} },
      { name: 'Crystal Staff', model: 'staff_B', cost: { ingot: 1, crystal: 2 } },
      { name: 'Living Staff', model: 'staff_C', cost: { ingot: 3, quartz: 2, silver: 1 } },
      { name: "Archmage's Staff", model: 'staff_D', cost: { ingot: 4, nugget: 2, amethyst: 2 } },
    ],
  },
};

export const maxWeaponTier = (cls: HeroClass): number => WEAPONS[cls].tiers.length - 1;

/** A hero's weapon tier as it counts for the class it is now (saves from before tiers: 0). */
export function weaponTier(h: { weaponTier?: number; cls?: HeroClass }): number {
  return Math.max(0, Math.min(Math.floor(h.weaponTier ?? 0), maxWeaponTier(h.cls ?? 'tank')));
}

/** The weapon a hero carries now. */
export function weaponOf(h: { weaponTier?: number; cls?: HeroClass }): WeaponTier {
  // weaponTier clamps into this class's nonempty, configured tier list.
  return WEAPONS[h.cls ?? 'tank'].tiers[weaponTier(h)]!;
}

/** What the hero's weapon tier adds to its damage (×). */
export const tierMul = (h: { weaponTier?: number; cls?: HeroClass }): number =>
  1 + WEAPON_DAMAGE * weaponTier(h);

/** Reforging a weapon one tier up at the anvil: heat it in the forge, then hammer it out (anyone can lend a hand). */
export const REFORGE: { steps: Step[] } = {
  steps: [
    { action: 'smelt', label: 'Heat it in the forge', work: 50 },
    { action: 'hammer', label: 'Hammer out the new edge', work: 70 },
  ],
};
