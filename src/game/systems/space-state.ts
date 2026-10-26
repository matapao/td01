/** Space state and spatial queries shared without loading the command dispatcher. */
import type { Sim } from '../sim.ts';
import type { SpaceState } from '../space-types.ts';
import { spaceOpen, type PayloadId } from '../space.ts';

/** The base and its flights (made the first time they're needed). */
export function spaceOf(sim: Sim): SpaceState {
  return (sim.state.space ??= { modules: [], flights: [], depot: {}, workT: {} });
}

export const hasModule = (sim: Sim, kind: PayloadId): boolean =>
  spaceOf(sim).modules.some((m) => m.kind === kind);

/** Why payload `id` can't be stacked at the Port now (null: it can). */
export function payloadBlocker(sim: Sim, id: PayloadId): string | null {
  const s = spaceOf(sim);
  const landed = (k: PayloadId) =>
    s.modules.some((m) => m.kind === k) || s.flights.some((f) => f.payload === k && !f.home);
  if (id !== 'lander' && !landed('lander')) return 'The first lander must mark the site';
  if (id === 'crew' && !landed('habitat')) return 'A crew needs a habitat to land at';
  if (id === 'drill' && !landed('rover')) return 'The rover must find the rare earths first';
  if (id === 'ascent' && !landed('oxygen')) return 'The ascent vehicle needs the oxygen plant for its fuel';
  if (id !== 'crew' && landed(id)) return 'Already at the base';
  return null;
}

/** Can one stand at (x, z) in Space? */
export function spaceWalkable(sim: Sim, x: number, z: number): boolean {
  return spaceOpen(x, z, spaceOf(sim).modules);
}
