/** Catalogue schemas shared by rules and presentation. */
import type { ItemId } from './item-data.ts';
import type { PayloadId } from './space-types.ts';

export type Parts = Partial<Record<ItemId, number>>;

/** Every crafting/assembly step is one of these interactions (each has its own UI + feel). */
export type ActionKind = 'hammer' | 'saw' | 'cut' | 'smelt' | 'weld' | 'wire' | 'code';

export interface ActionDef {
  kind: ActionKind;
  verb: string;
  hint: string;
}

export interface Step {
  action: ActionKind;
  label: string;
  work: number;
}

// ---- Gathering --------------------------------------------------------------------------------

export type NodeKind = 'tree' | 'rock' | 'ore' | 'crystal' | 'metalrock' | 'icefield' | 'raremound';

export interface NodeDef {
  kind: NodeKind;
  item: ItemId;
  amount: number;
  /** Seconds per swing. */
  hitTime: number;
  regrow: number;
  verb: string;
}

// ---- Disciplines & learning -------------------------------------------------------------------

export type Discipline = 'carpentry' | 'masonry' | 'smithing' | 'arcana';

// ---- Buildings --------------------------------------------------------------------------------

export type StationKind = 'sawmill' | 'stonecutter' | 'forge' | 'anvil' | 'arcanist';

/** Electricity: the hydro generator (the old watermill, repaired), poles that carry it, lamps. */
export type PowerKind = 'hydro' | 'pole' | 'lamp';

/** Fire for the nights, from the first day. */
export type LightKind = 'brazier';

/** The way to Space: a launch pad, its tower and fuel (see space.ts). */
export type SpaceKind = 'port';

export type BuildingKind = 'shop' | 'tower' | StationKind | PowerKind | LightKind | SpaceKind;

/** Surveillance: vision, burrower detection, radar pulses, wave-intel level. */
export interface WatchDef {
  sight: number;
  detect: number;
  radar: number;
  radarEvery: number;
  intel: number;
}

/** Physical types are reduced by armour grade; all types are scaled by armour class. */
export type DamageType = 'pierce' | 'impact' | 'slash' | 'fire' | 'frost' | 'lightning' | 'arcane';

export type ArmorClass = 'bone' | 'plate' | 'spectral' | 'warded' | 'colossal' | 'flesh';

export type Layer = 'ground' | 'air';

export type TargetMode = 'first' | 'last' | 'strong' | 'close';

export interface Recipe {
  input: Parts;
  output: Parts;
}

export interface StationDef {
  kind: StationKind;
  name: string;
  /** The first recipe whose inputs are loaded gets made. */
  recipes: Recipe[];
  steps: Step[];
}

export interface TowerStats {
  range: number;
  rate: number;
  damage: number;
  damageType: DamageType;
  hitsAir: boolean;
  hitsGround: boolean;
  crit: number;
  shooters: number;
  splash: number;
  burn: number;
  chain: number;
  slow: number;
  cluster: number;
  twin: boolean;
  soldiers: number;
  soldierHp: number;
  soldierDamage: number;
  soldierRate: number;
  soldierArmor: number;
  respawn: number;
  /** How far from the tower its footmen can be rallied (0: it has none). */
  rally: number;
  captain: boolean;
  banner: boolean;
  /** Fraction of armour ignored. */
  pierce: number;
  goldMul: number;
  lootMul: number;
  /** Extra magic damage per hit. */
  bonusMagic: number;
}

/**
 * Raw gems come out of the mines in five colours. A learned plan melts one into a variant of its
 * colour (with a few other parts), set straight into a tower's window socket.
 */
export type GemColor = 'ruby' | 'sapphire' | 'topaz' | 'amethyst' | 'emerald';

/** The variants a raw gem can be shaped into, colour by colour. */
export type GemId =
  | 'ember'
  | 'blast'
  | 'fury'
  | 'warheart'
  | 'frost'
  | 'rime'
  | 'swift'
  | 'storm'
  | 'sun'
  | 'arcane'
  | 'twin'
  | 'scry'
  | 'seer'
  | 'far';

export type BasePlanId = 'shop' | 'tower' | StationKind | PowerKind | LightKind | SpaceKind;

/** Tower tops: built onto a tower to cover its archer (see TOWER_TOPS). */
export type TopId = 'turret' | 'gallery';

/** Tower devices: powered machines in the upper windows — not weapons (see DEVICE). */
export type DeviceId = 'searchlight' | 'radar' | 'targeter' | 'relay' | 'solar';

/** Upgrades built into a standing building (see UpgradePlan). */
export type UpgradeId = 'dynamo';

export type PlanId = BasePlanId | GemId | TopId | DeviceId | PayloadId | UpgradeId;

/**
 * A set gem grows as it's upgraded: a small matte stone, then a polished one that glows, then a
 * radiant one too big for its window. `k` scales what it does.
 */
export type GemLevel = 1 | 2 | 3;

interface PlanCommon {
  name: string;
  blurb: string;
  discipline: Discipline;
  parts: Parts;
  steps: Step[];
  /** Seconds of study and gold to learn (before mastery modifiers). */
  learnTime: number;
  learnGold: number;
}

export interface BasePlan extends PlanCommon {
  id: BasePlanId;
  type: 'building';
  building: BuildingKind;
}

export interface GemMods {
  rateMul?: number;
  rangeAdd?: number;
  damageMul?: number;
  critAdd?: number;
  shootersAdd?: number;
  splash?: number;
  burn?: number;
  chain?: number;
  slow?: number;
}

export interface GemPlan extends PlanCommon {
  id: GemId;
  type: 'gem';
  color: GemColor;
  /** Element gems decide what the archer's bolts are: one element to a tower. */
  element?: DamageType;
  mods: GemMods;
}

/** A new top for a tower: the next step from the open platform (see TOWER_TOPS). */
export interface TopPlan extends PlanCommon {
  id: TopId;
  type: 'top';
  level: 2 | 3;
}

/** A device for a tower's upper window: what it draws from the grid (a solar roof gives instead). */
export interface DevicePlan extends PlanCommon {
  id: DeviceId;
  type: 'device';
  /** Watts drawn while it runs (a solar roof: watts it makes, by day). */
  watts: number;
}

/** A payload for the Port: stacked on the rocket there, launched in the window, landed in Space (see space.ts). */
export interface PayloadPlan extends PlanCommon {
  id: PayloadId;
  type: 'payload';
}

/** An upgrade built into a standing building of one kind (a plan placed on it, its parts brought, then built). */
export interface UpgradePlan extends PlanCommon {
  id: UpgradeId;
  type: 'upgrade';
  target: BuildingKind;
}

export type Plan = BasePlan | GemPlan | TopPlan | DevicePlan | PayloadPlan | UpgradePlan;

// ---- Tower tops ---------------------------------------------------------------------------------

export type TopLevel = 1 | 2 | 3;

// ---- Stores ---------------------------------------------------------------------------------

export type StoreId = 'market' | 'smithy' | 'arcane' | 'guild' | 'dwarven';

export interface StoreDef {
  id: StoreId;
  name: string;
  keeper: string;
  blurb: string;
  goods: ItemId[];
  scrolls: PlanId[];
  /** Price multiplier per good (specialists are cheaper in their trade). */
  discount?: Partial<Record<ItemId, number>>;
  /** Enchanted parts in stock (bases), refreshed every wave. */
  enchanted?: ItemId[];
  /** Sells mystery crates (a random enchanted part). */
  crates?: boolean;
  /** Not on the map until you find it. */
  hidden?: boolean;
  /** Sells the complete starter tool package. */
  crafterKit?: boolean;
}

/** Hand tools are bought, not given: no axe, no wood. They double as the hero's first weapons. */
export type ToolId = 'axe' | 'pickaxe' | 'hammer' | 'shovel' | 'scanner' | 'seedPouch';

export interface ToolDef {
  id: ToolId;
  name: string;
  price: number;
  use: string;
  /** Melee damage multiplier when it's the best thing in your hands. */
  weapon: number;
}

/**
 * A hero's class weapon at one tier: its name, how it looks (a model of the weapons kit, KayKit
 * Fantasy Weapons Bits — the Knight's shield too), and what reforging it up to this tier costs at the
 * Blacksmith's anvil: iron bars, then silver and gold, then raw gems from the mines.
 */
export interface WeaponTier {
  name: string;
  model: string;
  shield?: string;
  cost: Parts;
}

export interface WeaponLine {
  /** What it is ("Sword"), and what the off hand carries. */
  kind: string;
  tiers: [WeaponTier, ...WeaponTier[]];
}

// ---- Enemies ----------------------------------------------------------------------------------

export type EnemyKind =
  | 'minion'
  | 'runner'
  | 'warrior'
  | 'necromancer'
  | 'wraith'
  | 'crusher'
  | 'digger'
  | 'lich'
  | 'colossus'
  | 'wolf'
  | 'orc'
  | 'golem';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  blurb: string;
  hp: number;
  speed: number;
  /** Armour grade: fraction of physical damage removed. */
  armor: number;
  armorClass: ArmorClass;
  gold: number;
  leak: number;
  damage: number;
  attackRate: number;
  flying?: boolean;
  radius: number;
  scale: number;
  boss?: boolean;
  /** Attacks buildings near its route. */
  siege?: boolean;
  /** Travels underground until detected or deep in your land. */
  burrow?: boolean;
  /** Picks the least-defended route. */
  smart?: boolean;
  /** Short trait tags for wave intel. */
  traits: string[];
}

// ---- Wave affixes (shown in wave intel) ---------------------------------------------------------

export type WaveAffix = 'swift' | 'bolstering' | 'shielded' | 'frenzied' | 'regenerating';

// ---- Hero -------------------------------------------------------------------------------------

export type AbilityId =
  'slam' | 'cry' | 'wall' | 'mend' | 'rally' | 'repulse' | 'drone' | 'fireball' | 'nova' | 'meteor';

export type HeroClass = 'tank' | 'support' | 'magic';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  cooldown: number;
  targeted: boolean;
  blurb: string;
  radius?: number;
  range?: number;
  damage?: number;
  damagePerLevel?: number;
  knock?: number;
  slow?: number;
  slowTime?: number;
  stun?: number;
  haste?: number;
  duration?: number;
  heal?: number;
}

/** Hero classes (WoW-style roles): health, armour, the basic attack, and the three skills on 1–3. */
export interface ClassDef {
  id: HeroClass;
  role: string;
  name: string;
  blurb: string;
  /** Health at level 1 (HERO.hpPerLevel per level on top). */
  hp: number;
  armor: number;
  /** Basic attack: how far it reaches, and whether it flies (a bolt) or swings. */
  reach: number;
  ranged: boolean;
  damageMul: number;
  /** Skills on 1, 2, 3 (and 4). */
  abilities: AbilityId[];
}

export interface Loot {
  gold?: number;
  scrolls?: PlanId[];
  parts?: Parts;
}
