/** Serialized actors and world objects. */
import type {
  PlanId,
  Parts,
  ToolId,
  Discipline,
  AbilityId,
  HeroClass,
  NodeKind,
  Loot,
  BuildingKind,
  UpgradeId,
  DeviceId,
  GemId,
  TowerStats,
  TargetMode,
  EnemyKind,
  WaveAffix,
  DamageType,
} from './content-types.ts';
import type { ItemInstance, Affix } from './loot-types.ts';
import type { ItemId } from './item-data.ts';
import type { PayloadId } from './space-types.ts';

export type Id = number;

// ---- People -----------------------------------------------------------------------------------

export type HeroTask =
  | { k: 'idle' }
  | { k: 'move'; x: number; z: number }
  | { k: 'attack'; target: Id }
  /** Walk to an entity and do the sensible thing (gather, deliver, work, collect, open, shop…). */
  | { k: 'interact'; target: Id }
  | { k: 'gather'; node: Id }
  | { k: 'work'; target: Id }
  | { k: 'study'; plan: PlanId; t: number; total: number }
  /** Hacking at the mine's rock: one piece of it (a dig-grid cell, see game/mines.ts). */
  | { k: 'dig'; mine: number; cell: number }
  /** Flying the scout drone: the hero stands still with the controls in hand. */
  | { k: 'pilot' };

/** Riding a mine wagon to the next stop (see game/mines.ts): the wagon it set off in, and seconds since. */
export interface Ride {
  wagon: number;
  t: number;
}

export interface Transit {
  kind: 'door' | 'lift';
  t: number;
  duration: number;
  from: { x: number; z: number };
  edge: { x: number; z: number };
  switched: boolean;
  building?: Id;
  inside?: boolean;
  mine?: number;
  down?: boolean;
}

export interface Hero {
  /** Explicit undefined clears an active trip without changing delta field ownership. */
  transit?: Transit | undefined;
  visitedMine?: boolean;
  fabricatingUntil?: number | undefined;
  blastSkill?: { stage: number; level: number; xp: number };
  /** A ready stable horse; when dismounted it waits where it was left. */
  horse?: { x: number; z: number; riding: boolean };
  /** Aboard a flight to or from Space (hidden, carried along). */
  flight?: Id | undefined;
  /** Riding a wagon down the mine (null: on foot). */
  ride?: Ride | null;
  id: Id;
  player: number;
  name: string;
  x: number;
  z: number;
  px: number;
  pz: number;
  facing: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  dead: boolean;
  respawnT: number;
  bag: Parts;
  /** Hand tools owned (bought at the market): they gate chopping, mining, building. */
  tools: ToolId[];
  /** A durable shop torch, separate from the Crafter Kit. */
  torchOwned?: boolean;
  torchLit?: boolean;
  earthAt?: number;
  earthTool?: 'pickaxe' | 'shovel';
  earthAimY?: number;
  /** Enchanted parts carried (count towards the bag). */
  gear: ItemInstance[];
  /** Plans this hero has learned. */
  known: PlanId[];
  /** Unread plan scrolls carried. */
  scrolls: PlanId[];
  mastery: Record<Discipline, number>;
  task: HeroTask;
  /** Flattened waypoints [x0, z0, x1, z1, …]. */
  path: number[];
  pathIdx: number;
  /** Where the current path leads (to know when to re-path). */
  pathGoal: { x: number; z: number } | null;
  attackCd: number;
  swingCd: number;
  cds: Record<AbilityId, number>;
  /** Class (Tank, Support, Magic): health, armour, basic attack and skills. */
  cls: HeroClass;
  /** How far the hero's class weapon has been reforged at the anvil (see WEAPONS; each tier hits harder). */
  weaponTier: number;
  /** Seconds of Shield Wall left. */
  wallT: number;
  /** Told to stop fighting (Esc): no swinging at the dead nearby until you attack again. */
  peace?: boolean;
  /** The scout drone (Warchief), when it is out: where it flies, its health and battery, and whether it is coming home. */
  droneOn?: boolean;
  droneX?: number;
  droneZ?: number;
  droneHp?: number;
  droneT?: number;
  droneBack?: boolean;
  /** The tower this hero crews from the wall-walk (the nearest one in reach while they stand up there); 0 or unset: none. */
  post?: Id;
  /** Animation hints for the view. */
  anim: 'idle' | 'run' | 'attack' | 'chop' | 'mine' | 'work' | 'study' | 'cast' | 'pilot' | 'dead';
  animT: number;
  /** Enemy currently blocked by this hero (melee). */
  blocking: Id;
  /** Seconds until the next hands-on beat is accepted. */
  beatCd: number;
  /** Direct movement input from the player (world space, length ≤ 1). */
  steer: { mx: number; mz: number };
  /** Facing requested by the player's camera while moving. */
  look: number;
  /** Movement relative to facing (animation). */
  gait: 'idle' | 'fwd' | 'back' | 'left' | 'right';
  /** Seconds left of player-driven movement (poses from the client); tasks wait meanwhile. */
  moveT: number;
}

export interface Unit {
  id: Id;
  kind: 'footman' | 'captain';
  tower: Id;
  slot: number;
  x: number;
  z: number;
  px: number;
  pz: number;
  facing: number;
  hp: number;
  maxHp: number;
  armor: number;
  damage: number;
  rate: number;
  attackCd: number;
  target: Id;
  dead: boolean;
  respawnT: number;
  idleT: number;
  anim: 'idle' | 'run' | 'attack' | 'dead';
  animT: number;
}

// ---- World objects ----------------------------------------------------------------------------

export interface ResourceNode {
  id: Id;
  kind: NodeKind;
  x: number;
  z: number;
  radius: number;
  amount: number;
  max: number;
  regrowT: number;
  planted?: boolean;
  prepared?: boolean;
  /** Index into the scenery prop list (view uses it to swap visuals). */
  prop: number;
}

export interface Drop {
  id: Id;
  item: ItemId | 'gold';
  /** Gold amount for coin piles, 1 for items. */
  amount: number;
  /** Set for enchanted parts. */
  inst: ItemInstance | null;
  x: number;
  z: number;
  t: number;
  /** Who it popped out for (gets first dibs for a moment). */
  owner: Id;
}

export interface Chest {
  id: Id;
  name: string;
  x: number;
  z: number;
  opened: boolean;
  loot: Loot;
  golden: boolean;
}

/** A placed plan waiting to be realised: parts are delivered, then assembly steps are worked. */
export interface Site {
  delivery?: number | undefined;
  id: Id;
  plan: PlanId;
  x: number;
  z: number;
  cx: number;
  cz: number;
  rot: number;
  /** The player turned it themselves (else it faces the road; a pole's arm follows its wires). */
  turned?: boolean;
  need: Parts;
  have: Parts;
  step: number;
  work: number;
  /** For gem sites: the tower the gem is being set into. */
  building: Id;
  placedBy: Id;
  /** Enchanted parts placed (each fills one slot of its base). */
  sockets: ItemInstance[];
  /** A gem site: the level the gem comes to (an upgrade, or set from outside in tests). */
  lv?: number;
}

export interface Building {
  id: Id;
  kind: BuildingKind;
  /** On the electric grid (see systems/power). */
  powered?: boolean;
  /** Towers: lit at night (a brazier, a lamp on the grid or the keep's torches nearby), so they see as far as by day. */
  lit?: boolean;
  x: number;
  z: number;
  cx: number;
  cz: number;
  rot: number;
  /** Turned by the player when it was planned (see Site.turned). */
  turned?: boolean;
  /** Towers: the top built on it (TopLevel: 1 the open platform, 2 a roofed turret, 3 a gallery under a roof). */
  top?: number;
  /** Towers: a wraith is diving at its open top — the archer is ducking. */
  harried?: boolean;
  /** Upgrades built into it (see UpgradePlan). */
  upgrades?: UpgradeId[];
  /** The Port: the payload stacked on its rocket, ready to launch. */
  ready?: PayloadId | undefined;
  /** Towers: the devices in its upper windows (see DEVICE), and whether they have power now. */
  devices?: DeviceId[];
  devicesOn?: boolean;
  /** Towers: the gems set in its windows (one of each colour, each in its colour's window), in the order they went in. */
  gems: GemId[];
  /** Each of those gems' level (GemLevel, same order: 1 rough, 2 polished, 3 radiant). */
  gemLv?: number[];
  /** Enchants from the parts built into it. */
  affixes: Affix[];
  /** The enchanted parts themselves (returned when it falls or is demolished). */
  gear: ItemInstance[];
  hp: number;
  maxHp: number;
  /** HP already paid for with repair materials, waiting to be hammered in. */
  repairBuf: number;
  /** Surveillance: seconds until the next radar pulse. */
  radarT: number;
  /** Names of the enchanted parts built into it. */
  relics: string[];
  /** Parts that went into it (salvage on demolish). */
  spent: Parts;
  // Towers
  stats: TowerStats | null;
  cooldown: number;
  cooldown2: number;
  mode: TargetMode;
  rallyX: number;
  rallyZ: number;
  hasteT: number;
  shots: number;
  aimX: number;
  aimZ: number;
  // Stations
  input: Parts;
  output: Parts;
  /** A batch is loaded and being worked. */
  busy: boolean;
  /** Recipe index of the current batch. */
  recipe: number;
  step: number;
  work: number;
  /** Perfect beats in the current batch (bonus roll). */
  perfects: number;
  /** Heroes that worked it this tick (passive progress pauses meanwhile). */
  workedAt: number;
  /** Buildings you can walk into: which room slot is theirs (see interiors.ts). */
  interior?: number;
  /** The anvil: whose weapon is being reforged on it now (0: none — then a batch is the usual recipe). */
  forgeFor?: Id;
  /** Gem site currently attached (0 = none). */
  site: Id;
  builtAt: number;
}

// ---- Combat -----------------------------------------------------------------------------------

export interface Enemy {
  id: Id;
  kind: EnemyKind;
  wave: number;
  lane: number;
  d: number;
  lat: number;
  latTarget: number;
  x: number;
  z: number;
  px: number;
  pz: number;
  hp: number;
  maxHp: number;
  shield: number;
  slowMul: number;
  /** In a searchlight's beam (seconds left): it takes more damage (see DEVICE). */
  spotT?: number;
  slowT: number;
  stunT: number;
  chill: number;
  chillT: number;
  frozenT: number;
  brittleT: number;
  burnT: number;
  burnDps: number;
  spawnT: number;
  blocker: Id;
  /** Attention drawn by heroes (% of its health they dealt, decaying); past THREAT.aggro it turns on them. */
  threat: number;
  /** Seconds left of a taunt (Battle Cry): it comes for the hero regardless. */
  tauntT: number;
  attackCd: number;
  dashT: number;
  dashed: boolean;
  abilityCd: number;
  enraged: boolean;
  knockT: number;
  knockV: number;
  flying: boolean;
  anim: 'spawn' | 'walk' | 'attack' | 'cast' | 'hit' | 'idle';
  animT: number;
  lastHitBy: Id;
  /** World-camp monsters (0 = lane enemy). */
  camp: Id;
  homeX: number;
  homeZ: number;
  /** Camp monsters: hero/unit they chase. */
  aggro: Id;
  facing: number;
  maxShield: number;
  /** Underground: untargetable, can't be blocked. */
  burrowed: boolean;
  /** Building being smashed (siege mobs). */
  siege: Id;
  /** Wave-affix modifiers. */
  speedMul: number;
  dmgMul: number;
  hurtT: number;
  affixes: WaveAffix[];
}

export interface Camp {
  id: Id;
  /** Index into MAP.camps (for the vale's camps)… */
  def: number;
  /** …or a lair in a mine: [mine, lair index] (see Sim.campDef). */
  lair?: [number, number];
  tunnel?: number;
  x: number;
  z: number;
  alive: number;
  respawnT: number;
}

export type ProjKind = 'bolt' | 'boulder' | 'bomblet' | 'arcane' | 'axe' | 'fireball' | 'meteor';

export interface Proj {
  id: Id;
  kind: ProjKind;
  sx: number;
  sz: number;
  sy: number;
  tx: number;
  tz: number;
  x: number;
  z: number;
  px: number;
  pz: number;
  t: number;
  dur: number;
  target: Id;
  damage: number;
  dmgType: DamageType;
  splash: number;
  burn: number;
  chain: number;
  slow: number;
  stun: number;
  cluster: number;
  crit: boolean;
  source: Id;
  arc: number;
  pierce: number;
  bonusMagic: number;
  burnHit: number;
}

export interface Fire {
  id: Id;
  x: number;
  z: number;
  r: number;
  dps: number;
  t: number;
}

export interface Corpse {
  id: Id;
  kind: EnemyKind;
  lane: number;
  d: number;
  lat: number;
  x: number;
  z: number;
  t: number;
  wave: number;
}

export interface SpawnEntry {
  at: number;
  kind: EnemyKind;
  crypt: number;
  wave: number;
}
