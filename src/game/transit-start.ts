/** Begin saved travel without depending on arrival handlers. */
import type { Hero, Transit } from './entity-types.ts';
import { dismount } from './maintenance.ts';

export function beginTransit(h: Hero, trip: Omit<Transit, 't' | 'from' | 'switched'>): void {
  if (h.transit || h.dead) return;
  dismount(h);
  h.transit = { ...trip, t: 0, from: { x: h.x, z: h.z }, switched: false };
  h.task = { k: 'idle' };
  h.path = [];
  h.pathGoal = null;
  h.moveT = 0;
  h.steer = { mx: 0, mz: 0 };
  h.gait = 'idle';
}
