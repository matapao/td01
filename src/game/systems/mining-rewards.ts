/** Mine camp rewards, shared with combat without importing mining commands. */
import type { Sim } from '../sim.ts';
import type { Camp, Id } from '../types.ts';
import { lairDef } from '../mines.ts';

/** A mine lair was cleared: what its creatures sat on spills out at its middle. */
export function lairLooted(sim: Sim, camp: Camp, hero: Id): void {
  const def = camp.lair ? lairDef(camp.lair[1]) : undefined;
  if (!def) return;
  sim.grantLoot({ gold: def.gold, parts: def.spoils }, def.x, def.z, hero);
  sim.emit('lairLooted', { camp: camp.id, name: def.name, x: def.x, z: def.z });
}
