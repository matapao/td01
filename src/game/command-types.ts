/** Authoritative game commands. */
import type { Id } from './entity-types.ts';
import type {
  AbilityId,
  HeroClass,
  PlanId,
  UpgradeId,
  DeviceId,
  GemId,
  TargetMode,
  StoreId,
} from './content-types.ts';
import type { PayloadId } from './space-types.ts';
import type { ItemId } from './item-data.ts';

// ---- Commands ---------------------------------------------------------------------------------

export type Command =
  | { t: 'move'; hero: Id; x: number; z: number }
  /** WASD / mouse steering: world-space direction (length ≤ 1) and the facing to keep. */
  | { t: 'queueTower'; hero: Id }
  | { t: 'hammerTower'; hero: Id; crate: Id }
  | { t: 'shipTower'; hero: Id; crate: Id; cx: number; cz: number }
  | { t: 'mount'; hero: Id }
  | { t: 'steer'; hero: Id; mx: number; mz: number; look: number }
  /** The player's own client moved the hero (WASD at frame rate); the sim checks and accepts it. */
  | {
      t: 'pose';
      hero: Id;
      x: number;
      z: number;
      facing: number;
      look: number;
      gait: 'idle' | 'fwd' | 'back' | 'left' | 'right';
      moving: boolean;
    }
  /** Pays gold for every part a placed plan still lacks. */
  | { t: 'buyout'; hero: Id; site: Id }
  /** Ride the mine wagon waiting here (index into the mine's wagons) to the next stop. */
  | { t: 'ride'; hero: Id; wagon: number }
  /** Hack at the mine's rock at world point (x, z) with the pickaxe. */
  | { t: 'dig'; hero: Id; x: number; z: number }
  /** Light a stick of dynamite at your feet (stand back!). */
  | { t: 'blast'; hero: Id; x?: number; y?: number; z?: number }
  | { t: 'prepareBlast'; hero: Id; step: number }
  | { t: 'makeCharges'; hero: Id }
  | { t: 'attack'; hero: Id; target: Id }
  | { t: 'excavate'; hero: Id; x: number; y: number; z: number; tool: 'pickaxe' | 'shovel'; wide?: boolean }
  | { t: 'plant'; hero: Id; x: number; z: number }
  | { t: 'interact'; hero: Id; target: Id }
  /** Stop what you're doing; `peace`: stop fighting, and don't swing again until you attack. */
  | { t: 'stop'; hero: Id; peace?: boolean }
  | { t: 'cast'; hero: Id; ability: AbilityId; target?: Id; x?: number; z?: number }
  | { t: 'chooseClass'; hero: Id; cls: HeroClass }
  /** Your drone flies here (sent while you steer it, like a pose). */
  | { t: 'droneMove'; hero: Id; x: number; z: number }
  /** Hands-on result while working a site or station. */
  | { t: 'beat'; hero: Id; quality: 0 | 1 | 2 }
  | { t: 'place'; hero: Id; plan: PlanId; cx: number; cz: number; rot?: number; buy?: boolean }
  /** A milestone tried at its workshop: how the minigame went (0 failed, 1 good, 2 perfect). */
  | { t: 'invent'; hero: Id; milestone: string; quality: number }
  /** Build an upgrade into a standing building (a plan to place, deliver and assemble). */
  | { t: 'upgradeBuilding'; hero: Id; building: Id; plan: UpgradeId }
  /** Stack a payload on the Port's rocket (a plan to place, deliver and assemble). */
  | { t: 'stackPayload'; hero: Id; building: Id; payload: PayloadId }
  /** Launch what's on the Port's pad (in the window); `board`: ride along (a crew capsule). */
  | { t: 'launch'; hero: Id; building: Id; board: boolean }
  /** In Space, at the ascent vehicle: send the depot's minerals home (and ride along). */
  | { t: 'launchHome'; hero: Id; board: boolean }
  /** Set a device into a tower's upper window (a plan to place, deliver and assemble). */
  | { t: 'placeDevice'; hero: Id; plan: DeviceId; building: Id }
  | { t: 'removeDevice'; hero: Id; building: Id; device: DeviceId }
  /** Build the next top onto a tower (a plan to place, deliver and assemble). */
  | { t: 'upgradeTop'; hero: Id; building: Id }
  /** Turn a planned building (a blueprint not yet built) to face another way. */
  | { t: 'turnSite'; site: Id; rot: number }
  | { t: 'placeGem'; hero: Id; plan: PlanId; building: Id }
  /** Takes a gem out of a tower's socket (the raw gem back, and half its other parts). */
  | { t: 'removeGem'; hero: Id; building: Id; gem: GemId }
  /** Grows a set gem a level (a site on the tower: more raw gems and parts, melted on). */
  | { t: 'upgradeGem'; hero: Id; building: Id; gem: GemId }
  | { t: 'cancelSite'; site: Id }
  | { t: 'demolish'; building: Id }
  | { t: 'mode'; building: Id; mode: TargetMode }
  | { t: 'rally'; building: Id; x: number; z: number }
  | { t: 'study'; hero: Id; plan: PlanId }
  | { t: 'buy'; hero: Id; store: StoreId; item?: ItemId; scroll?: PlanId; count?: number }
  | { t: 'buyCrafterKit'; hero: Id; store: StoreId }
  | { t: 'buyTorch'; hero: Id; store: StoreId }
  | { t: 'toggleTorch'; hero: Id }
  | { t: 'sell'; hero: Id; store: StoreId; item: ItemId; count: number }
  | { t: 'deposit'; hero: Id }
  | { t: 'withdraw'; hero: Id; item: ItemId; count: number }
  | { t: 'dropItem'; hero: Id; item: ItemId; count: number }
  /** Put a specific enchanted part into a site (swapping out a plain part if needed). */
  | { t: 'socket'; hero: Id; site: Id; uid: number }
  | { t: 'buyGear'; hero: Id; store: StoreId; uid: number }
  | { t: 'buyCrate'; hero: Id; store: StoreId }
  | { t: 'sellGear'; hero: Id; store: StoreId; uid: number }
  | { t: 'dropGear'; hero: Id; uid: number }
  | { t: 'depositGear'; hero: Id; uid: number }
  | { t: 'withdrawGear'; hero: Id; uid: number }
  | { t: 'callWave' }
  /** Dev mode on or off (for everyone in the game). */
  | { t: 'devMode'; on: boolean }
  | { t: 'devWaves'; on: boolean }
  /** Dev mode: set the time of day (0 midnight … 0.5 noon), and hold it there or let it run on. */
  | { t: 'setTime'; tod: number; hold: boolean }
  /** Out of the building the hero is in (at its door). */
  | { t: 'leave'; hero: Id }
  /** At the Blacksmith's anvil: reforge your class weapon one tier up (its parts from your bag and the anvil's tray). */
  | { t: 'reforge'; hero: Id; building: Id }
  /** At the gate (inside, or up on the wall beside it): shut it or open it. */
  | { t: 'gate'; hero: Id; shut: boolean };
