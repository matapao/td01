/** A real repair break starts only when the roads are clear. Shared by movement, UI and host. */
import type { Sim } from './sim.ts';
import type { Hero } from './types.ts';
export const STABLE = { x: -5, z: 3.5, horseX: -2.5, horseZ: 1.8 };
export const REPAIR_BREAK = 100;
export function betweenWaves(sim: Sim): boolean {
  return (
    (sim.state.phase === 'build' || sim.state.phase === 'waves' || sim.state.phase === 'won') &&
    !sim.state.spawns.length &&
    !sim.state.enemies.some((e) => !e.camp && e.hp > 0)
  );
}
export function horseOf(h: Hero): { x: number; z: number; riding: boolean } {
  return (h.horse ??= { x: STABLE.horseX, z: STABLE.horseZ + h.player * 0.9, riding: false });
}
export function dismount(h: Hero): void {
  if (h.horse?.riding) {
    h.horse.x = h.x;
    h.horse.z = h.z;
    h.horse.riding = false;
  }
}
