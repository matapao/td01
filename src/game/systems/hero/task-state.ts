/** Shared task cancellation and blocker ownership; no command dispatch or frame work. */
import type { Sim } from '../../sim.ts';
import type { Hero, Id } from '../../entity-types.ts';

export function heroById(sim: Sim, id: Id): Hero | undefined {
  return sim.getAs(id, 'hero');
}

export function clearTask(h: Hero): void {
  h.task = { k: 'idle' };
  h.path = [];
  h.pathGoal = null;
}

export function releaseBlock(sim: Sim, h: Hero): void {
  if (!h.blocking) return;
  const e = sim.getAs(h.blocking, 'enemy');
  if (e && e.blocker === h.id) e.blocker = 0;
  h.blocking = 0;
}
