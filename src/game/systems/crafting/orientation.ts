/** Road-facing placement and rally geometry; sampled lanes retain their authored order. */
import type { Sim } from '../../sim.ts';
import { dist } from '../../../core/math.ts';

export function turnFor(rot: number, size: number): number {
  const a = Math.atan2(Math.sin(rot), Math.cos(rot));
  return size > 1 ? Math.round(a / (Math.PI / 2)) * (Math.PI / 2) : a;
}

export function faceRoad(sim: Sim, x: number, z: number, square: boolean): number {
  const p = nearestRoad(sim, x, z);
  const a = Math.atan2(p.x - x, p.z - z);
  return square ? Math.round(a / (Math.PI / 2)) * (Math.PI / 2) : a;
}

// Resampled lane coordinates use aligned x/z buffers and the loop bounds both reads.
export function nearestRoad(sim: Sim, x: number, z: number): { x: number; z: number } {
  let best = { x, z };
  let bd = Infinity;
  for (const lane of sim.world.lanes) {
    for (let i = 0; i < lane.xs.length; i += 2) {
      const d = dist(x, z, lane.xs[i]!, lane.zs[i]!);
      if (d < bd) {
        bd = d;
        best = { x: lane.xs[i]!, z: lane.zs[i]! };
      }
    }
  }
  return best;
}
