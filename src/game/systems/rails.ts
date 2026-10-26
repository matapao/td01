/**
 * Ore carts on the rails (game/rails.ts): whoever comes up the lift at the mine head the line starts
 * by tips their iron ore into the carts, and it goes into the forge's input tray — as much as the
 * tray has room for (the rest stays in the bag). The forge smelts it like any other: the rails carry,
 * people collect the ingots.
 */
import type { Sim } from '../sim.ts';
import type { Hero } from '../types.ts';
import { STATION_TRAY } from '../content.ts';
import { railLine, railsInvented } from '../rails.ts';

export function railLoad(sim: Sim, h: Hero, mine: number): void {
  const ore = h.bag.ore ?? 0;
  if (ore <= 0 || !railsInvented(sim)) return;
  const line = railLine(sim);
  if (!line || !line.reaches || line.mine !== mine) return;
  const forge = sim.getAs(line.forge, 'building');
  if (!forge) return;
  const room = STATION_TRAY - (forge.input.ore ?? 0);
  if (room <= 0) return;
  const n = sim.takeFromBag(h, 'ore', Math.min(ore, room));
  forge.input.ore = (forge.input.ore ?? 0) + n;
  sim.emit('railLoaded', { hero: h.id, mine, forge: forge.id, count: n });
}
