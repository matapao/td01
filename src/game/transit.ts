export { beginTransit } from './transit-start.ts';
/** Short, saved travel sequences. World coordinates change only under the fade at mid-journey. */
import type { Hero } from './types.ts';
import type { Sim } from './sim.ts';
import { enterBuilding, leaveBuilding } from './systems/rooms.ts';
import { rideLift } from './systems/mining.ts';
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => {
  v = clamp(v);
  return v * v * (3 - 2 * v);
};
export function updateTransit(sim: Sim, h: Hero, dt: number): boolean {
  const trip = h.transit;
  if (!trip) return false;
  if (h.dead) {
    h.transit = undefined;
    return false;
  }
  trip.t += dt;
  if (!trip.switched && trip.t / trip.duration >= 0.52) {
    trip.switched = true;
    if (trip.kind === 'lift') rideLift(sim, h, trip.mine ?? 0, !!trip.down);
    else {
      const b = sim.getAs(trip.building ?? 0, 'building');
      if (!b) {
        h.transit = undefined;
        return false;
      }
      if (trip.inside) enterBuilding(sim, h, b);
      else leaveBuilding(sim, h);
    }
  }
  h.px = h.x;
  h.pz = h.z;
  h.anim = 'idle';
  h.moveT = 0;
  h.steer.mx = h.steer.mz = 0;
  if (trip.t >= trip.duration) h.transit = undefined;
  return true;
}
/** Shared by the character, its camera and the lift platform. No lights or postprocessing. */
export function transitPose(h: Hero): {
  x: number;
  z: number;
  y: number;
  alpha: number;
  walking: boolean;
  boarding: boolean;
} {
  const t = h.transit;
  if (!t) return { x: h.x, z: h.z, y: 0, alpha: 1, walking: false, boarding: false };
  const p = clamp(t.t / t.duration),
    boarding = t.kind === 'lift' && p < 0.25;
  const k = ease(p / (t.kind === 'lift' ? 0.24 : 0.44));
  const x = t.switched ? h.x : t.from.x + (t.edge.x - t.from.x) * k,
    z = t.switched ? h.z : t.from.z + (t.edge.z - t.from.z) * k;
  let y = 0,
    alpha = 1;
  if (t.kind === 'lift') {
    if (boarding) y = Math.sin((p / 0.25) * Math.PI) * 0.2;
    else if (!t.switched) y = (t.down ? -1 : 1) * 1.25 * ease((p - 0.25) / 0.27);
    else y = (t.down ? 1 : -1) * 1.25 * (1 - ease((p - 0.55) / 0.38));
  } else alpha = t.switched ? ease((p - 0.6) / 0.28) : 1 - ease((p - 0.24) / 0.24);
  return { x, z, y, alpha, walking: t.kind === 'door' && p < 0.42, boarding };
}
export function transitFade(h: Hero | undefined): number {
  const t = h?.transit;
  if (!t) return 0;
  const p = t.t / t.duration,
    start = t.kind === 'lift' ? 0.36 : 0.2;
  return p < 0.48 ? ease((p - start) / (0.48 - start)) : 1 - ease((p - 0.64) / 0.36);
}
