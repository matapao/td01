/** Stable, nonoverlapping tower locations for offline balance probes. */
import { Sim } from '../../src/game/sim.ts';
import { placementBlocker } from '../../src/game/systems/craft.ts';
import { GATE, GRID_H, GRID_W, cellCenter, lanePos, wallDist } from '../../src/game/map.ts';
import { sizeOf } from '../../src/game/content.ts';
import { GATE_STOP } from '../../src/game/systems/wall.ts';
// ---- Spots beyond the wall -------------------------------------------------------------------------

export interface Spot {
  cx: number;
  cz: number;
  x: number;
  z: number;
  /** Distance to where the walkers stand battering the gate. */
  gd: number;
  wd: number;
  /** Road samples (every 1 m) within 10 m, per lane. */
  cov: number[];
}

let SPOTS: Spot[] | null = null;
export let BATTER = { x: GATE.x + 2.6, z: 0 };

/**
 * Tower spots beyond the wall, packed so no two overlap (3×3 cells each), nearest the gate's doors
 * first — where the walkers stop to batter it, and where the three roads come together.
 */
export function spots(): Spot[] {
  if (SPOTS) return SPOTS;
  const sim = new Sim({ seed: 1 });
  sim.state.explored.fill(1);
  const ends = sim.world.lanes.map((l) => lanePos(l, l.length - GATE_STOP, 0));
  BATTER = {
    x: ends.reduce((a, p) => a + p.x, 0) / ends.length,
    z: ends.reduce((a, p) => a + p.z, 0) / ends.length,
  };
  const cand: Spot[] = [];
  for (let cz = 0; cz < GRID_H; cz++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      const c = cellCenter(cx, cz);
      if (c.x < GATE.x || c.x > GATE.x + 52) continue;
      if (placementBlocker(sim, cx, cz, sizeOf('tower'), 'tower')) continue;
      const cov = sim.world.lanes.map((l) => {
        let n = 0;
        for (let i = 0; i < l.xs.length; i += 2) if (Math.hypot(l.xs[i]! - c.x, l.zs[i]! - c.z) <= 10) n++;
        return n;
      });
      cand.push({
        cx,
        cz,
        x: c.x,
        z: c.z,
        gd: Math.hypot(c.x - BATTER.x, c.z - BATTER.z),
        wd: wallDist(c.x, c.z),
        cov,
      });
    }
  }
  cand.sort((a, b) => a.gd - b.gd || a.z - b.z);
  const out: Spot[] = [];
  for (const c of cand)
    if (!out.some((o) => Math.abs(o.cx - c.cx) < 3 && Math.abs(o.cz - c.cz) < 3)) out.push(c);
  SPOTS = out;
  return out;
}

/** Spot orders a strategy can be laid out by. */
export function spotOrder(style: string): number[] {
  const S = spots();
  const idx = S.map((_, i) => i);
  const laneCov = (s: Spot) => s.cov.reduce((a, b) => a + b, 0);
  if (style === 'gate') return idx;
  if (style === 'lane') {
    // Along the roads: most road in reach, beyond the gate cluster, spread out.
    return idx
      .filter((i) => S[i]!.gd > 9)
      .sort((a, b) => laneCov(S[b]!) - laneCov(S[a]!) || S[a]!.gd - S[b]!.gd);
  }
  if (style === 'north' || style === 'south') {
    const sign = style === 'north' ? -1 : 1;
    return idx
      .filter((i) => Math.sign(S[i]!.z) === sign || Math.abs(S[i]!.z) < 1)
      .sort((a, b) => S[a]!.gd - S[b]!.gd);
  }
  if (style === 'deep') {
    // Out along the roads first (catch them early), then back to the gate.
    return [...idx].sort(
      (a, b) => laneCov(S[b]!) * (1 + S[b]!.gd / 20) - laneCov(S[a]!) * (1 + S[a]!.gd / 20),
    );
  }
  // mix: the gate cluster, then the roads.
  const gate = idx.filter((i) => S[i]!.gd <= 12);
  const rest = idx.filter((i) => S[i]!.gd > 12).sort((a, b) => laneCov(S[b]!) - laneCov(S[a]!));
  return [...gate, ...rest];
}
