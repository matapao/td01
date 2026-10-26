/**
 * Rails (the Road of Invention's `rails` milestone): once invented, a line of track runs from a mine
 * head toward the nearest forge, and ore carts ride it — ore brought up the lift goes into the
 * forge's input tray by itself (systems/rails.ts). By hand first, then by machine.
 *
 * The line is laid like a toy train set: on a grid of squares two track units across, a straight
 * stretch crosses one square (two straight pieces), a turn is one curve piece — a quarter circle of
 * radius two from the middle of one square to the middle of the next but one, round the corner
 * square between. It keeps off buildings and blueprints, water, steep ground, scenery and the roads,
 * and is worked out again from the state whenever asked: plain, deterministic data, the same for the
 * simulation (does it reach a forge?) and the view (where the pieces go).
 */
import type { Sim } from './sim.ts';
import { CELL, GRID_H, GRID_W, MAP, sampleHeights } from './map.ts';
import type { Building } from './types.ts';
import { roadOf } from './systems/road.ts';

export const RAIL = {
  /** Length of a straight piece (world units, the toy set's at scale 1); a curve's radius is two of these. */
  unit: 1,
  /** The track keeps this far from the middle of any road. */
  roadGap: MAP.roadHalf + 1.3,
  /** The most the ground may rise across one square. */
  maxRise: 0.5,
  /** The line starts this far from a mine head's door (beside it, out of the way of whoever steps out). */
  startNear: 1.8,
  startFar: 6.5,
  /** It ends beside a forge: the last square's middle within this (either way) of the forge's middle. */
  reach: 3.6,
  /** A turn costs a little more than its length, so the line runs straight where it can. */
  turnPenalty: 1.2,
};

/** One stretch of the line: across a square (straight), or a quarter turn round the corner square. */
export interface RailStep {
  turn: boolean;
  /** Where it starts (a square's middle) and the heading there (a unit vector along x or z). */
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** The heading where it ends (the same as h for a straight). */
  nx: number;
  nz: number;
}

export interface RailLine {
  /** The mine (index into state.mines) whose head it starts by. */
  mine: number;
  /** The forge it runs to (building id). */
  forge: number;
  /** Does it get there? (Roads, water or buildings in the way: it runs as near as it can.) */
  reaches: boolean;
  steps: RailStep[];
  /** Length of track (world units). */
  length: number;
}

const SQ = 2 * RAIL.unit;
const GW = Math.floor((MAP.maxX - MAP.minX) / SQ);
const GH = Math.floor((MAP.maxZ - MAP.minZ) / SQ);
const DX = [1, 0, -1, 0];
const DZ = [0, 1, 0, -1];
const sqX = (i: number): number => MAP.minX + (i + 0.5) * SQ;
const sqZ = (j: number): number => MAP.minZ + (j + 0.5) * SQ;

/** Has the vale invented rails? */
export function railsInvented(sim: Sim): boolean {
  return roadOf(sim).done.includes('rails');
}

/** The forges standing (in id order). */
function forges(sim: Sim): Building[] {
  return sim.state.buildings.filter((b) => b.kind === 'forge' && b.hp > 0);
}

/**
 * The rail line from a mine head toward the nearest forge (by track), or null: not invented yet, no
 * forge, or no way out from any mine head. The shortest line that reaches a forge wins; if none can,
 * the one that gets nearest to one.
 */
// All search-state buffers use N entries; states originate from in-bounds squares and
// headings 0–3. Reconstructed chain indices and parallel heap slots are length-bounded.
export function railLine(sim: Sim): RailLine | null {
  if (!railsInvented(sim)) return null;
  const smithies = forges(sim);
  if (!smithies.length) return null;
  const w = sim.world;
  const st = sim.state;

  // Which squares the track may cross.
  const free = new Uint8Array(GW * GH); // 0 unknown, 1 free, 2 blocked
  const isFree = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= GW || j >= GH) return false;
    const q = j * GW + i;
    if (free[q]) return free[q] === 1;
    let ok = true;
    const x0 = i * SQ;
    const z0 = j * SQ;
    for (let cz = Math.floor(z0); ok && cz < Math.ceil(z0 + SQ); cz++) {
      for (let cx = Math.floor(x0); ok && cx < Math.ceil(x0 + SQ); cx++) {
        if (cx < 0 || cz < 0 || cx >= GRID_W || cz >= GRID_H) ok = false;
        else {
          const k = cz * GRID_W + cx;
          if (w.cells[k]! & (CELL.WATER | CELL.STEEP | CELL.BORDER)) ok = false;
          else if (w.laneDist[k]! < RAIL.roadGap) ok = false;
          else if (!sim.walkStatic[k] || st.occupied[k]) ok = false;
        }
      }
    }
    if (ok) {
      // Gentle ground only.
      let lo = Infinity;
      let hi = -Infinity;
      for (const [ox, oz] of [
        [0, 0],
        [SQ, 0],
        [0, SQ],
        [SQ, SQ],
        [SQ / 2, SQ / 2],
      ] as const) {
        const h = sampleHeights(w.heights, MAP.minX + x0 + ox, MAP.minZ + z0 + oz);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      if (hi - lo > RAIL.maxRise) ok = false;
    }
    free[q] = ok ? 1 : 2;
    return ok;
  };

  // The squares beside each forge (the line's possible ends).
  const goal = new Int16Array(GW * GH).fill(-1);
  smithies.forEach((b, fi) => {
    const i0 = Math.floor((b.x - RAIL.reach - MAP.minX) / SQ);
    const j0 = Math.floor((b.z - RAIL.reach - MAP.minZ) / SQ);
    for (let j = j0; j <= j0 + Math.ceil((2 * RAIL.reach) / SQ) + 1; j++) {
      for (let i = i0; i <= i0 + Math.ceil((2 * RAIL.reach) / SQ) + 1; i++) {
        if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
        if (Math.max(Math.abs(sqX(i) - b.x), Math.abs(sqZ(j) - b.z)) > RAIL.reach) continue;
        if (goal[j * GW + i]! < 0) goal[j * GW + i] = fi;
      }
    }
  });
  const nearestForge = (x: number, z: number): { fi: number; d: number } => {
    let fi = 0;
    let d = Infinity;
    smithies.forEach((b, k) => {
      const dd = Math.hypot(b.x - x, b.z - z);
      if (dd < d) {
        d = dd;
        fi = k;
      }
    });
    return { fi, d };
  };

  // Dijkstra over (square, heading), from beside every mine head's door.
  const N = GW * GH * 4;
  const cost = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const turned = new Uint8Array(N);
  const startOf = new Int8Array(N).fill(-1);
  const origin = new Int32Array(N).fill(-1);
  const heap = new Heap();
  st.mines.forEach((m, mi) => {
    for (
      let j = Math.floor((m.exit.z - RAIL.startFar - MAP.minZ) / SQ);
      j <= Math.floor((m.exit.z + RAIL.startFar - MAP.minZ) / SQ);
      j++
    ) {
      for (
        let i = Math.floor((m.exit.x - RAIL.startFar - MAP.minX) / SQ);
        i <= Math.floor((m.exit.x + RAIL.startFar - MAP.minX) / SQ);
        i++
      ) {
        const d = Math.hypot(sqX(i) - m.exit.x, sqZ(j) - m.exit.z);
        if (d < RAIL.startNear || d > RAIL.startFar || !isFree(i, j)) continue;
        for (let dir = 0; dir < 4; dir++) {
          const s = (j * GW + i) * 4 + dir;
          const c = Math.abs(d - 2.6) * 0.5;
          if (c < cost[s]!) {
            cost[s] = c;
            startOf[s] = mi;
            origin[s] = s;
            heap.push(c, s);
          }
        }
      }
    }
  });
  let end = -1;
  let best = -1;
  let bestD = Infinity;
  const seen = new Uint8Array(N);
  while (heap.size) {
    const s = heap.pop();
    if (seen[s]) continue;
    seen[s] = 1;
    const q = s >> 2;
    const dir = s & 3;
    const i = q % GW;
    const j = (q / GW) | 0;
    if (goal[q]! >= 0 && prev[s]! >= 0) {
      end = s;
      break;
    }
    // In case no forge can be reached: the nearest the line gets without winding round about.
    const o = origin[s]! >> 2;
    const run = Math.hypot(sqX(i) - sqX(o % GW), sqZ(j) - sqZ((o / GW) | 0));
    const near = nearestForge(sqX(i), sqZ(j)).d;
    if (near < bestD - 1e-9 && cost[s]! <= 1.5 * run + 2 * SQ) {
      bestD = near;
      best = s;
    }
    const relax = (t: number, c: number, turn: boolean): void => {
      if (c < cost[t]! - 1e-9) {
        cost[t] = c;
        prev[t] = s;
        turned[t] = turn ? 1 : 0;
        startOf[t] = startOf[s]!;
        origin[t] = origin[s]!;
        heap.push(c, t);
      }
    };
    // Straight on, across the next square.
    const ai = i + DX[dir]!;
    const aj = j + DZ[dir]!;
    if (isFree(ai, aj)) relax((aj * GW + ai) * 4 + dir, cost[s]! + SQ, false);
    // A quarter turn either way: round the next square into the one beside it.
    if (isFree(ai, aj)) {
      for (const nd of [(dir + 1) & 3, (dir + 3) & 3]) {
        const bi = ai + DX[nd]!;
        const bj = aj + DZ[nd]!;
        if (isFree(bi, bj))
          relax((bj * GW + bi) * 4 + nd, cost[s]! + (Math.PI / 2) * SQ + RAIL.turnPenalty, true);
      }
    }
  }
  const reaches = end >= 0;
  if (!reaches) {
    // Nowhere to get to: as near as it can, if that's anywhere near at all.
    if (best < 0 || prev[best]! < 0 || prev[prev[best]!]! < 0) return null;
    end = best;
  }

  // Back from the end to the start: the stretches in order.
  const chain: number[] = [];
  for (let s = end; s >= 0; s = prev[s]!) chain.push(s);
  chain.reverse();
  const steps: RailStep[] = [];
  let length = 0;
  for (let k = 1; k < chain.length; k++) {
    const a = chain[k - 1]!;
    const b = chain[k]!;
    const qa = a >> 2;
    const da = a & 3;
    const db = b & 3;
    const turn = turned[b] === 1;
    steps.push({
      turn,
      x: sqX(qa % GW),
      z: sqZ((qa / GW) | 0),
      hx: DX[da]!,
      hz: DZ[da]!,
      nx: DX[db]!,
      nz: DZ[db]!,
    });
    length += turn ? (Math.PI / 2) * SQ : SQ;
  }
  const q = end >> 2;
  const fi = reaches ? goal[q]! : nearestForge(sqX(q % GW), sqZ((q / GW) | 0)).fi;
  const forge = smithies[fi];
  if (!forge) throw new Error(`Rail route references missing forge ${fi}`);
  return { mine: startOf[end]!, forge: forge.id, reaches, steps, length };
}

/** A point on the line: where, and which way it runs there. */
export interface RailPoint {
  x: number;
  z: number;
  hx: number;
  hz: number;
}

/** The track's middle line from the mine head to the end, a point every `step` or so (for the carts). */
export function railPoints(line: RailLine, step = 0.25): RailPoint[] {
  const out: RailPoint[] = [];
  for (const s of line.steps) {
    if (!s.turn) {
      const n = Math.max(1, Math.round(SQ / step));
      for (let k = 0; k < n; k++)
        out.push({ x: s.x + s.hx * SQ * (k / n), z: s.z + s.hz * SQ * (k / n), hx: s.hx, hz: s.hz });
      continue;
    }
    // Round the turn's centre (a square to the inside): from the start, a quarter circle of radius SQ.
    const ox = s.x + s.nx * SQ;
    const oz = s.z + s.nz * SQ;
    const n = Math.max(2, Math.round(((Math.PI / 2) * SQ) / step));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * (Math.PI / 2);
      const c = Math.cos(a);
      const sn = Math.sin(a);
      out.push({
        x: ox - s.nx * SQ * c + s.hx * SQ * sn,
        z: oz - s.nz * SQ * c + s.hz * SQ * sn,
        hx: s.hx * c + s.nx * sn,
        hz: s.hz * c + s.nz * sn,
      });
    }
  }
  const last = line.steps[line.steps.length - 1];
  if (last) {
    const ex = last.turn ? last.x + (last.hx + last.nx) * SQ : last.x + last.hx * SQ;
    const ez = last.turn ? last.z + (last.hz + last.nz) * SQ : last.z + last.hz * SQ;
    out.push({ x: ex, z: ez, hx: last.nx, hz: last.nz });
  }
  return out;
}

/** A small binary min-heap of (cost, state); ties go to the lower state, so the search is deterministic. */
// The two heap arrays grow, swap and shrink together; all comparisons use existing slots.
class Heap {
  private c: number[] = [];
  private s: number[] = [];
  get size(): number {
    return this.c.length;
  }
  private less(a: number, b: number): boolean {
    return this.c[a]! < this.c[b]! || (this.c[a]! === this.c[b]! && this.s[a]! < this.s[b]!);
  }
  private swap(a: number, b: number): void {
    [this.c[a]!, this.c[b]!] = [this.c[b]!, this.c[a]!];
    [this.s[a]!, this.s[b]!] = [this.s[b]!, this.s[a]!];
  }
  push(cost: number, state: number): void {
    this.c.push(cost);
    this.s.push(state);
    let i = this.c.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    // The caller pops only while size is nonzero; cost/state heaps stay aligned.
    const top = this.s[0]!;
    const lastC = this.c.pop()!;
    const lastS = this.s.pop()!;
    if (this.c.length) {
      this.c[0] = lastC;
      this.s[0] = lastS;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.c.length && this.less(l, m)) m = l;
        if (r < this.c.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
}
