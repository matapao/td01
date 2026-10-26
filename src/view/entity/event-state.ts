import type { StoreId } from '../../game/content.ts';
import type { Id } from '../../game/types.ts';
import type { CharacterView } from '../characters.ts';
import type { HeroView } from './hero.ts';
import type { DroneView } from './drone.ts';
import type { UnitView } from './unit.ts';
import type { EnemyView } from './enemy.ts';
import type { BuildingView } from './building.ts';
import type { SiteView } from './site.ts';
import type { DropView } from './drop.ts';

/** Shared view collections. Event handlers animate presentation; they never apply gameplay commands. */
export interface EntityEventState {
  readonly heroes: Map<Id, HeroView>;
  readonly drones: Map<Id, DroneView>;
  readonly units: Map<Id, UnitView>;
  readonly enemies: Map<Id, EnemyView>;
  readonly dying: EnemyView[];
  readonly byCorpse: Map<Id, EnemyView>;
  readonly raisedFrom: Set<Id>;
  readonly buildings: Map<Id, BuildingView>;
  readonly sites: Map<Id, SiteView>;
  readonly drops: Map<Id, DropView>;
  readonly collecting: DropView[];
  readonly pendingDrops: Map<Id, { fromX: number; fromZ: number }>;
  readonly spawnPorter: (x: number, z: number) => void;
  readonly keeper: (store: StoreId) => { ch: CharacterView } | undefined;
}
