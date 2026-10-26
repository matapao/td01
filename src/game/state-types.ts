/** World state and construction shipment contracts. */
import type {
  Id,
  Camp,
  Hero,
  Unit,
  ResourceNode,
  Drop,
  Chest,
  Site,
  Building,
  Enemy,
  Proj,
  Fire,
  Corpse,
  SpawnEntry,
} from './entity-types.ts';
import type { EarthState } from './excavation-types.ts';
import type { Parts, StoreId } from './content-types.ts';
import type { ItemInstance } from './loot-types.ts';
import type { SpaceState } from './space-types.ts';
import type { RoadState } from './road.ts';
import type { Mine } from './mine-types.ts';

// ---- State ------------------------------------------------------------------------------------

export type Phase = 'build' | 'waves' | 'won' | 'lost';

/** The gate in the wall (see GameState.gate). */
export interface GateState {
  hp: number;
  maxHp: number;
  /** Shut (the doors closed) — or standing open. A broken gate (hp 0) stands open until it is mended. */
  shut: boolean;
  /** Repair material hammered in but not yet worked (like a building's). */
  repairBuf: number;
}

export interface TowerCrate {
  id: Id;
  owner: Id;
  work: number;
  ready: boolean;
  shipment?: { site: Id; t: number; duration: number; path: number[] } | undefined;
}

export interface GameState {
  towerCrates?: TowerCrate[];
  earth?: EarthState;
  tick: number;
  time: number;
  phase: Phase;
  gold: number;
  lives: number;
  maxLives: number;
  /** Shared storehouse in the keep. */
  storage: Parts;
  storageGear: ItemInstance[];
  /** Keyed difficulty (0 = Normal). */
  sigil: number;
  /** Dev mode: everything free and at once — any plan builds as soon as it's placed, no parts, no tools; unlimited gold, hero health and keep lives. */
  dev?: boolean;
  /** Dev mode only: freeze wave starts and queued reinforcements. */
  wavesOff?: boolean;
  /** Dev mode's clock: seconds added to the game time for the time of day, and the time of day it is held at (null: running). */
  dayShift?: number;
  dayHold?: number | null;
  /** Space: the base (its landed modules), flights under way, and the depot of minerals waiting to go home. */
  space?: SpaceState;
  /** The grid now: watts the generators (and solar roofs) make, and watts asked of them. */
  grid?: { supply: number; demand: number };
  /** The Road of Invention: what the team has invented (see road.ts). */
  road?: RoadState;
  /** Rooms handed out so far (each building you can walk into gets the next). */
  rooms?: number;
  /**
   * The gate in the wall: shut, it holds the dead outside (they batter it until it breaks), and
   * nobody walks through; open, they break in at once. Repaired like any building.
   */
  gate: GateState;
  camps: Camp[];
  /** Specialist stock (enchanted parts), refreshed every wave. */
  stock: Partial<Record<StoreId, ItemInstance[]>>;
  discovered: StoreId[];
  heroes: Hero[];
  units: Unit[];
  nodes: ResourceNode[];
  drops: Drop[];
  chests: Chest[];
  sites: Site[];
  buildings: Building[];
  enemies: Enemy[];
  projs: Proj[];
  fires: Fire[];
  corpses: Corpse[];
  spawns: SpawnEntry[];
  /** Number of waves started so far. */
  wave: number;
  /** Time the next wave starts (-1 = none scheduled). */
  nextWaveAt: number;
  waveCleared: boolean[];
  /** Keep lives lost to each wave (the dead that broke in). */
  waveLeaks?: number[];
  lanesOpen: boolean[];
  /** Highest surveillance level you own (0 none, 1 lookout, 2+ radar). */
  intel: number;
  firstTowerAt: number;
  explored: Uint8Array;
  /** Cell → building/site id occupying it (0 = free). */
  occupied: Int32Array;
  nextId: number;
  stats: { kills: number; leaks: number; gathered: number; crafted: number; built: number; perfects: number };
  /** The mines below the mine heads (see game/mines.ts). */
  mines: Mine[];
  /** Lit dynamite: blows after `t` seconds. */
  bombs: { id: number; x: number; y?: number; z: number; t: number; hero: Id; level?: number }[];
}
