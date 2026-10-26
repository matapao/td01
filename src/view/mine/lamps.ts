import { MINE_AT, mineSdf, pathAt, type MineLayout } from '../../game/mines.ts';
import { lampAt, type Lamp } from '../mine-paint.ts';
/** Station, drift, chamber and den lamps in their established paint/build order. */
export function planLamps(L: MineLayout): Lamp[] {
  const lamps: Lamp[] = [];
  const at = MINE_AT;
  // The station: one on each post between the platforms, and over each portal.
  for (let q = 0; q < 4; q++) {
    const a = (q + 0.5) * (Math.PI / 2);
    lamps.push({ x: at.x + Math.cos(a) * 3.3, y: 1.55, z: at.z + Math.sin(a) * 3.3, r: 5.4, k: 0.9 });
  }
  for (const line of L.lines) {
    const p = pathAt(line, 4.6);
    lamps.push({ x: p.x, y: 1.4, z: p.z, r: 4.4, k: 0.78 });
    // Down the drift, one every so often — long dark stretches between — but not in the chambers
    // (they have their own).
    for (let d = 13; d < line.length; d += 11) {
      const q = pathAt(line, d);
      if (L.chambers.some((c) => c.grade > 0 && Math.hypot(q.x - c.x, q.z - c.z) < c.r - 0.6)) continue;
      lamps.push({ x: q.x, y: 1.35, z: q.z, r: 3.6, k: 0.7 });
    }
  }
  for (const c of L.chambers) {
    if (c.grade === 0) continue;
    // Two in each chamber, near its walls — the deeper grade gets one, guttering.
    for (let k = 0; k < (c.grade > 1 ? 1 : 2); k++) {
      const a = k * 2.6 + c.x * 0.37;
      const r = c.r * 0.45;
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      if (mineSdf(undefined, x, z) > -0.4) continue;
      lamps.push({ x, y: 1.55, z, r: c.grade > 1 ? 4.2 : 5, k: c.grade > 1 ? 0.62 : 0.8 });
    }
  }
  // The dens: barely lit (the raiders' fire is brighter) — what lairs there is in the dark.
  for (const d of L.dens) {
    const den = L.lairs[d.lair]?.den;
    if (!den) throw new Error(`Missing mine lair ${d.lair}`);
    lamps.push({
      x: d.x,
      y: den === 'raiders' ? 0.5 : 1.3,
      z: d.z,
      r: den === 'raiders' ? 4.6 : 3.4,
      k: den === 'raiders' ? 0.95 : 0.45,
    });
  }
  return lamps;
}

/** Steady readable model colour, with a little baked lantern warmth. */
export function mineLight(lamps: Lamp[], x: number, y: number, z: number): number {
  return Math.min(1.1, 0.9 + lampAt(lamps, x, y, z) * 0.1);
}
