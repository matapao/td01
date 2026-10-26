import type { Sim } from '../sim.ts';
import { GRID_W, inGrid } from '../map.ts';
import type { Id } from '../types.ts';

/** Marks (or clears, with id 0) the cells under a building footprint. */
export function occupyFootprint(sim: Sim, cx: number, cz: number, id: Id, size: number): void {
  const half = (size - 1) / 2;
  for (let dz = -half; dz <= half; dz++) {
    for (let dx = -half; dx <= half; dx++) {
      if (inGrid(cx + dx, cz + dz)) sim.state.occupied[(cz + dz) * GRID_W + cx + dx] = id;
    }
  }
}
