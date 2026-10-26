/** Compatibility entry for combat rules. New systems import the focused leaves directly. */
export type { Building } from '../entity-types.ts';
export { damageHero } from './hero/lifecycle.ts';
export { syncSoldiers } from './soldier-spawn.ts';
export { applyBurn, applyChill, damageEnemy, killEnemy, releaseBlocker } from './combat/damage.ts';
export { crewBoost, crewOf, damageBuilding, destroyBuilding } from './combat/buildings.ts';
export { fireProjectile, updateFires, updateProjectiles } from './combat/projectiles.ts';
export type { ProjOpts } from './combat/projectiles.ts';
export { flyerNear, updateAuras, updateTowers } from './combat/towers.ts';
export { damageUnit, soldierSlot, spawnSoldiers, updateUnits } from './combat/soldiers.ts';
