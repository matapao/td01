/** Crafting compatibility entry and command routing. Rules live in focused crafting modules. */
import type { Sim } from '../sim.ts';
import type { Command } from '../command-types.ts';
export { reforgeCost, reforgeMissing, reforgeBlocker } from './reforge-rules.ts';
export { buildZone, zoneBlocker, placementBlocker } from './placement-rules.ts';
export {
  STATION_DISCIPLINE,
  BUYOUT_MARKUP,
  partPrice,
  buyoutCost,
  planCost,
  needOf,
  siteMissing,
  siteComplete,
  siteSteps,
  studyTime,
  scrollPrice,
} from './crafting/site-rules.ts';
export { turnFor, faceRoad, nearestRoad } from './crafting/orientation.ts';
export { forceCompleteSite, removeGems } from './crafting/site-completion.ts';
export { stationSteps, updateStations } from './crafting/stations.ts';
export { interactArrive } from './crafting/interactions.ts';
export { workTick, applyBeat, workAction } from './crafting/work.ts';
export { pickUp, updateDrops, updateNodes } from './crafting/resources.ts';
export { repairMaterial } from './crafting/repair.ts';
export function updateSites(_sim: Sim, _dt: number): void {
  // Sites only progress through hands-on work.
}
import { applySiteCommand } from './crafting/site-commands.ts';
import { applyBuildingCommand } from './crafting/building-commands.ts';
import { applyTradeCommand } from './crafting/trade.ts';
import { applyStorageCommand } from './crafting/storage.ts';
import { startReforge } from './crafting/stations.ts';

export function applyCraftCommand(sim: Sim, cmd: Command): void {
  switch (cmd.t) {
    case 'place':
    case 'buyout':
    case 'placeGem':
    case 'upgradeGem':
    case 'upgradeBuilding':
    case 'placeDevice':
    case 'upgradeTop':
    case 'turnSite':
    case 'cancelSite':
    case 'socket':
      return applySiteCommand(sim, cmd);
    case 'removeDevice':
    case 'demolish':
    case 'removeGem':
    case 'mode':
    case 'rally':
      return applyBuildingCommand(sim, cmd);
    case 'buy':
    case 'toggleTorch':
    case 'buyTorch':
    case 'buyCrafterKit':
    case 'buyGear':
    case 'buyCrate':
    case 'sell':
    case 'sellGear':
      return applyTradeCommand(sim, cmd);
    case 'deposit':
    case 'withdraw':
    case 'depositGear':
    case 'withdrawGear':
    case 'dropItem':
    case 'dropGear':
      return applyStorageCommand(sim, cmd);
    case 'reforge': {
      const h = sim.getAs(cmd.hero, 'hero');
      const b = sim.getAs(cmd.building, 'building');
      if (h && b) startReforge(sim, h, b);
      return;
    }
  }
}
