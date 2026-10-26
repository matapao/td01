/** Cached mine navigation, independent of tools, combat and travel commands. */
import type { Sim } from '../sim.ts';
import { earthWalkable } from '../excavation.ts';
import { caveInAt, type Mine } from '../mines.ts';

/** Underground, a body stands only in the open (never in the rock, nor in a cave-in's rubble). */
export function mineWalkable(sim: Sim, x: number, z: number): boolean {
  return earthWalkable(sim, x, z);
}

/** A coarse walk grid of the mine as it is now (redone when rock has been dug out). */
const grids = new WeakMap<
  Mine,
  { version: number; x0: number; z0: number; nx: number; nz: number; step: number; open: Uint8Array }
>();

function walkGrid(
  sim: Sim,
  m: Mine,
): { x0: number; z0: number; nx: number; nz: number; step: number; open: Uint8Array } {
  const version = sim.state.earth?.cuts.length ?? 0,
    g = grids.get(m);
  if (g && g.version === version) return g;
  const cuts = sim.state.earth?.cuts ?? [],
    step = 0.5;
  const x0 = Math.min(1752, ...cuts.filter((c) => c.x > 1500).map((c) => c.x - c.r - 1)),
    z0 = Math.min(-437, ...cuts.filter((c) => c.x > 1500).map((c) => c.z - c.r - 1));
  const x1 = Math.max(1776, ...cuts.filter((c) => c.x > 1500).map((c) => c.x + c.r + 1)),
    z1 = Math.max(-402, ...cuts.filter((c) => c.x > 1500).map((c) => c.z + c.r + 1));
  const nx = Math.ceil((x1 - x0) / step),
    nz = Math.ceil((z1 - z0) / step),
    open = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * step,
        z = z0 + (j + 0.5) * step;
      open[j * nx + i] =
        earthWalkable(sim, x, z) &&
        (
          [
            [0.12, 0],
            [-0.12, 0],
            [0, 0.12],
            [0, -0.12],
          ] as const
        ).every(([dx, dz]) => earthWalkable(sim, x + dx, z + dz))
          ? 1
          : 0;
    }
  const out = { version, x0, z0, nx, nz, step, open };
  grids.set(m, out);
  return out;
}

/**
 * A path through the mine from (x0, z0) to (x1, z1) as waypoints [x, z, x, z, …] (A* on a half-metre
 * grid, round shut cave-ins, then pulled tight), or null if there is none.
 */
export function minePath(sim: Sim, x0: number, z0: number, x1: number, z1: number): number[] | null {
  const m = sim.state.mines[0];
  if (!m) return null;
  const g = walkGrid(sim, m);
  const cellOf = (x: number, z: number) => {
    const i = Math.floor((x - g.x0) / g.step);
    const j = Math.floor((z - g.z0) / g.step);
    return i < 0 || j < 0 || i >= g.nx || j >= g.nz ? -1 : j * g.nx + i;
  };
  const cx = (k: number) => g.x0 + ((k % g.nx) + 0.5) * g.step;
  const cz = (k: number) => g.z0 + (Math.floor(k / g.nx) + 0.5) * g.step;
  const free = (k: number) => g.open[k] === 1 && caveInAt(m, cx(k), cz(k)) < 0;
  const near = (x: number, z: number): number => {
    const k = cellOf(x, z);
    if (k >= 0 && free(k)) return k;
    let best = -1;
    let bd = Infinity;
    for (let dj = -4; dj <= 4; dj++) {
      for (let di = -4; di <= 4; di++) {
        const kk = cellOf(x + di * g.step, z + dj * g.step);
        if (kk < 0 || !free(kk)) continue;
        const d = Math.hypot(cx(kk) - x, cz(kk) - z);
        if (d < bd) {
          bd = d;
          best = kk;
        }
      }
    }
    return best;
  };
  const start = near(x0, z0);
  const goal = near(x1, z1);
  if (start < 0 || goal < 0) return null;
  if (start === goal) return [x1, z1];
  const N = g.nx * g.nz;
  const gs = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  // Dense heap slots are compared only within length; search/predecessor buffers share N.
  const heap: [number, number][] = [];
  const less = (a: [number, number], b: [number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const push = (f: number, k: number) => {
    heap.push([f, k]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i]!, heap[p]!)) break;
      [heap[p]!, heap[i]!] = [heap[i]!, heap[p]!];
      i = p;
    }
  };
  const pop = (): number => {
    const top = heap[0]![1];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        if (l < heap.length && less(heap[l]!, heap[s]!)) s = l;
        if (r < heap.length && less(heap[r]!, heap[s]!)) s = r;
        if (s === i) break;
        [heap[s]!, heap[i]!] = [heap[i]!, heap[s]!];
        i = s;
      }
    }
    return top;
  };
  const gx = goal % g.nx;
  const gz = Math.floor(goal / g.nx);
  const hcost = (k: number) => {
    const dx = Math.abs((k % g.nx) - gx);
    const dz = Math.abs(Math.floor(k / g.nx) - gz);
    return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
  };
  gs[start] = 0;
  push(hcost(start), start);
  let found = false;
  for (let it = 0; heap.length && it < 40000; it++) {
    const k = pop();
    if (k === goal) {
      found = true;
      break;
    }
    if (closed[k]) continue;
    closed[k] = 1;
    const i = k % g.nx;
    const j = Math.floor(k / g.nx);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= g.nx || nj >= g.nz) continue;
        const nk = nj * g.nx + ni;
        if (closed[nk] || !free(nk)) continue;
        // No cutting corners past the rock.
        if (di && dj && (!free(j * g.nx + ni) || !free(nj * g.nx + i))) continue;
        const c = gs[k]! + (di && dj ? Math.SQRT2 : 1);
        if (c < gs[nk]!) {
          gs[nk] = c;
          from[nk] = k;
          push(c + hcost(nk), nk);
        }
      }
    }
  }
  if (!found) return null;
  const cells: number[] = [];
  for (let k = goal; k >= 0; k = from[k]!) cells.push(k);
  cells.reverse();
  // Pulled tight: skip every waypoint the next can be seen (walked straight to) from.
  const clear = (ax: number, az: number, bx: number, bz: number) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.2);
    for (let q = 1; q < n; q++) {
      const k = cellOf(ax + ((bx - ax) * q) / n, az + ((bz - az) * q) / n);
      if (k < 0 || !free(k)) return false;
    }
    return true;
  };
  const out: number[] = [];
  let ax = x0;
  let az = z0;
  let q = 0;
  while (q < cells.length) {
    let far = q;
    for (let t = cells.length - 1; t > q; t--) {
      if (clear(ax, az, cx(cells[t]!), cz(cells[t]!))) {
        far = t;
        break;
      }
    }
    ax = cx(cells[far]!);
    az = cz(cells[far]!);
    out.push(ax, az);
    q = far + 1;
  }
  out.push(x1, z1);
  return out;
}
