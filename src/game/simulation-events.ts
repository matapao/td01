/** Simulation event payloads. */
import type { Id } from './entity-types.ts';
import type { ItemId } from './item-data.ts';
import type {
  NodeKind,
  StoreId,
  Parts,
  PlanId,
  BuildingKind,
  GemId,
  DeviceId,
  Loot,
  EnemyKind,
  DamageType,
  HeroClass,
  AbilityId,
} from './content-types.ts';
import type { ItemInstance } from './loot-types.ts';
import type { PayloadId, FlightPhase } from './space-types.ts';

// ---- Events -----------------------------------------------------------------------------------

export interface SimEvents {
  earthHit: {
    hero: Id;
    x: number;
    y: number;
    z: number;
    r: number;
    soil: boolean;
    mineral: number;
    item: ItemId;
    volume: number;
    nx?: number;
    ny?: number;
    nz?: number;
  };
  /** Feedback for a refused command (shown near the cursor). */
  denied: { hero: Id; reason: string; x?: number; z?: number };
  /** The gate: shut or opened (hero 0: it broke open), battered by the dead, mended. */
  gateMoved: { hero: Id; shut: boolean; broken: boolean };
  gateHit: { amount: number; by: Id; hp: number };
  gateRepaired: { hero: Id; amount: number; hp: number };
  heroArrived: { hero: Id; target: Id };
  gatherHit: { hero: Id; node: Id; kind: NodeKind; x: number; z: number; left: number };
  nodeDepleted: { node: Id; kind: NodeKind };
  nodeRegrown: { node: Id };
  dropSpawned: {
    id: Id;
    item: ItemId | 'gold';
    amount: number;
    inst: ItemInstance | null;
    x: number;
    z: number;
    fromX: number;
    fromZ: number;
  };
  pickedUp: {
    hero: Id;
    drop: Id;
    item: ItemId | 'gold';
    amount: number;
    inst: ItemInstance | null;
    x: number;
    z: number;
  };
  socketed: { hero: Id; site: Id; inst: ItemInstance };
  storeDiscovered: { store: StoreId; x: number; z: number };
  stockRefreshed: { store: StoreId };
  campCleared: { camp: Id; name: string };
  campRespawned: { camp: Id };
  crateOpened: { hero: Id; inst: ItemInstance };
  bagFull: { hero: Id };
  delivered: { hero: Id; target: Id; item: ItemId; count: number };
  collected: { hero: Id; station: Id; item: ItemId; count: number };
  deposited: { hero: Id; parts: Parts };
  sitePlaced: { site: Id; plan: PlanId; x: number; z: number };
  siteReady: { site: Id };
  workStarted: { hero: Id; target: Id; action: string };
  workBeat: { hero: Id; target: Id; quality: 0 | 1 | 2; action: string };
  stepDone: { target: Id; step: number; of: number };
  siteCancelled: { site: Id; refund: Parts };
  buildingDone: { building: Id; kind: BuildingKind; x: number; z: number };
  devMode: { on: boolean };
  /** Through a building's door, in or out; `turn`: how far the hero's heading (and the camera) turned with it. */
  entered: { hero: Id; building: Id; inside: boolean; x: number; z: number; turn: number };
  gemSet: { building: Id; gem: GemId; lv: number };
  /** A milestone tried: invented (quality 1–2) or a failed try (0). */
  invented: { hero: Id; milestone: string; quality: number };
  /** Space: a launch, each phase of a flight (ascent, cruise, entry, parachute, powered descent, touchdown), a landing. */
  launched: { flight: Id; payload: PayloadId; x: number; z: number; home: boolean };
  flightPhase: { flight: Id; payload: PayloadId; phase: FlightPhase; home: boolean };
  landed: { flight: Id; payload: PayloadId; x: number; z: number; crew: Id; home: boolean; cargo: Parts };
  /** A device is in (or out of) a tower's upper window. */
  deviceSet: { building: Id; device: DeviceId; x: number; z: number };
  devicesRemoved: { building: Id; devices: DeviceId[]; x: number; z: number };
  /** A tower's new top is up (TopLevel). */
  topBuilt: { building: Id; top: number; x: number; z: number };
  gemsRemoved: { building: Id; gems: GemId[]; x: number; z: number };
  demolished: { building: Id; kind: BuildingKind; x: number; z: number };
  crafted: { station: Id; output: Parts; perfect: boolean; bonus: boolean };
  /** A weapon went onto the anvil to be reforged (its parts paid)… */
  reforgeStarted: { hero: Id; station: Id; tier: number };
  /** …and came off it a tier up. */
  reforged: { hero: Id; station: Id; tier: number; x: number; z: number };
  batchStarted: { station: Id };
  studyStarted: { hero: Id; plan: PlanId };
  learned: { hero: Id; plan: PlanId };
  scrollFound: { hero: Id; plan: PlanId };
  /** Porters delivered every missing part of a plan, for gold. */
  boughtOut: { hero: Id; site: Id; cost: number; x: number; z: number };
  rideLift: { hero: Id; mine: number; down: boolean; x: number; z: number };
  /** Rails: ore brought up a mine head went onto the line, into the forge's input tray (game/rails.ts). */
  railLoaded: { hero: Id; mine: number; forge: Id; count: number };
  powerOn: { building: Id; x: number; z: number };
  /** Down the mine: a hero set off in a wagon, or got out of one at the next stop. */
  rideStart: { hero: Id; wagon: number; x: number; z: number };
  rideEnd: { hero: Id; wagon: number; x: number; z: number };
  /** Dynamite blew a cave-in open (index into the mine's caveins): the way beyond is open for good. */
  caveInCleared: { hero: Id; cave: number; x: number; z: number };
  /** A strike of the pickaxe on the mine's rock (`mineral`: what the piece is, see game/mines.ts). */
  digHit: { hero: Id; mine: number; cell: number; mineral: number; x: number; z: number };
  /** A piece of the rock broke away (by pickaxe or dynamite) and what it gave, if anything. */
  cellDug: {
    hero: Id;
    mine: number;
    cell: number;
    mineral: number;
    x: number;
    z: number;
    item: ItemId | null;
    blasted: boolean;
  };
  /** A lair in the mine was cleared: what its creatures sat on spilled out. */
  lairLooted: { camp: Id; name: string; x: number; z: number };
  bombLit: { hero: Id; id: number; x: number; z: number };
  blast: { x: number; y?: number; z: number; r: number; mine: number };
  bought: {
    hero: Id;
    store: StoreId;
    item?: ItemId;
    scroll?: PlanId;
    inst?: ItemInstance;
    kit?: boolean;
    torch?: boolean;
    count: number;
    cost: number;
  };
  sold: { hero: Id; store: StoreId; item?: ItemId; inst?: ItemInstance; count: number; gain: number };
  shopOpen: { hero: Id; store: StoreId };
  storageOpen: { hero: Id };
  chestOpened: { chest: Id; hero: Id; loot: Loot; x: number; z: number };
  gold: { amount: number; x?: number; z?: number; reason: string };
  // Combat
  towerFired: { building: Id; target: Id; proj: Id; kind: string; shooter: number };
  projHit: { proj: Id; kind: string; x: number; z: number; target: Id };
  explosion: { x: number; z: number; r: number; kind: string };
  chainArc: { from: Id; to: Id; fx: number; fz: number; tx: number; tz: number };
  enemySpawned: { id: Id; kind: EnemyKind; lane: number };
  enemyHit: {
    id: Id;
    amount: number;
    type: DamageType;
    crit: boolean;
    x: number;
    z: number;
    shielded: boolean;
    shatter: boolean;
    mult: number;
  };
  status: { id: Id; kind: 'freeze' | 'shatter' | 'chill' | 'burn'; x: number; z: number };
  buildingHit: { building: Id; amount: number; by: Id };
  buildingDestroyed: { building: Id; kind: BuildingKind; x: number; z: number };
  repaired: { building: Id; amount: number; hero: Id };
  burrowed: { id: Id };
  surfaced: { id: Id; x: number; z: number; detected: boolean };
  radarPulse: { building: Id; x: number; z: number; r: number; found: Id[] };
  bolstered: { id: Id; x: number; z: number; targets: Id[] };
  routeChosen: { id: Id; lane: number; smart: boolean };
  enemyDied: { id: Id; kind: EnemyKind; x: number; z: number; gold: number; by: Id; corpse: Id };
  enemyLeaked: { id: Id; kind: EnemyKind; damage: number };
  enemyAbility: {
    id: Id;
    ability: 'dash' | 'raise' | 'shield' | 'summon' | 'stomp' | 'enrage';
    x: number;
    z: number;
    targets: Id[];
  };
  corpseRaised: { corpse: Id; enemy: Id };
  unitSpawned: { id: Id; tower: Id };
  unitAttack: { id: Id; target: Id };
  unitHit: { id: Id; amount: number };
  unitDied: { id: Id };
  /** A hero's basic attack. */
  heroAttack: { hero: Id; target: Id };
  /** A hero up on the wall-walk took a tower as their post: they crew it from there (see OVER_WALL). */
  crewed: { hero: Id; building: Id; x: number; z: number };
  /** `lethal`: one of the dead on the roads struck (a hero doesn't survive that). */
  heroHit: { hero: Id; amount: number; lethal?: boolean };
  /** `by`: the enemy that struck the last blow (0: a fall, a blast…). */
  heroDied: { hero: Id; by?: Id };
  heroRespawned: { hero: Id };
  heroLevel: { hero: Id; level: number };
  classChosen: { hero: Id; cls: HeroClass };
  droneLaunched: { hero: Id; x: number; z: number };
  droneDocked: { hero: Id };
  droneDown: { hero: Id; x: number; z: number };
  droneHit: { hero: Id; by: Id; x: number; z: number; amount: number };
  healed: { id: Id; x: number; z: number; amount: number };
  heroCast: { hero: Id; ability: AbilityId; x: number; z: number; target: Id; proj?: Id };
  waveStarted: { wave: number; crypts: number[]; early: boolean; bonus: number };
  waveCleared: { wave: number; bonus: number; loot: Loot; leaked: number };
  laneOpened: { lane: number };
  livesLost: { amount: number; lives: number };
  gameOver: { won: boolean };
}
