import type { PlanId, StoreId } from './content-types.ts';
import type {
  Building,
  Camp,
  Chest,
  Corpse,
  Drop,
  Enemy,
  Fire,
  Hero,
  Id,
  Proj,
  ResourceNode,
  Site,
  Unit,
} from './entity-types.ts';

/** Interactable fixed places: the keep (storehouse) and the stores. */
export interface Poi {
  id: Id;
  /** keep (storehouse), store, mine (a mine head: lift down), lift (the lift below: ride up), gate (shut or open it, mend it). */
  kind: 'keep' | 'store' | 'mine' | 'lift' | 'gate' | 'fabricator' | 'oversight';
  store?: StoreId;
  mine?: number;
  x: number;
  z: number;
  r: number;
}

export interface EntMap {
  hero: Hero;
  unit: Unit;
  node: ResourceNode;
  drop: Drop;
  chest: Chest;
  site: Site;
  building: Building;
  enemy: Enemy;
  poi: Poi;
  proj: Proj;
  fire: Fire;
  corpse: Corpse;
  camp: Camp;
}

export type Ent = { [K in keyof EntMap]: { type: K; e: EntMap[K] } }[keyof EntMap];

export interface ExtraState {
  /** Team plan library: scrolls anyone can study (learning is per hero). */
  library: PlanId[];
  pois: Poi[];
}
