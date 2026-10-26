/** The fixed starter area revealed before normal hero sight updates. */
import { MAP, LANE_STEP, w, type World } from './map.ts';
export function revealInitialArea(
  world: World,
  discovered: readonly string[],
  reveal: (x: number, z: number, r: number) => void,
): void {
  // Our side of the gate — the market, the workshop quarter, the home ring — and the town along the
  // high street to the keep…
  reveal(MAP.heroStart.x - 8, MAP.heroStart.z, w(19));
  const high = world.streets[0];
  if (!high) throw new Error('The village needs its high street');
  for (let i = 0; i < high.xs.length; i += 8) reveal(high.xs[i]!, high.zs[i]!, w(9));
  reveal(MAP.keep.x, MAP.keep.z, w(12));
  // …and only the near end of each road beyond the wall: where it leads is for the player to find out.
  for (const lane of world.lanes) {
    const n = lane.xs.length;
    for (let i = Math.max(0, n - Math.round(w(34) / LANE_STEP)); i < n; i += 4)
      reveal(lane.xs[i]!, lane.zs[i]!, 6.5);
  }
  for (const id of discovered) {
    const p = MAP.stores[id as keyof typeof MAP.stores];
    if (p) reveal(p.x, p.z, 6);
  }
}
