import { CELL, GRID_H, GRID_W, MAP, wallAt, wallFloor, type World } from './map.ts';
import type { Prop } from './scenery.ts';

/**
 * Static walkability (terrain + scenery) — dynamic blockers (buildings, sites) are layered on top.
 * The coarse grid (paths, placement) includes every prop; the fine one leaves out props with a
 * trunk collider, which the hero checks exactly instead.
 */
/**
 * Walkable cells. `fine` is the heroes' grid: tree trunks are left to the colliders, and heroes
 * can wade and swim (water is open to them, even where the bank is steep); the coarse grid keeps
 * soldiers, pathing and placement on dry land.
 */
// World cell buffers use GRID_W × GRID_H, exactly like this walk-grid allocation.
export function buildWalkGrid(world: World, props: Prop[], fine = false): Uint8Array {
  const walk = new Uint8Array(GRID_W * GRID_H);
  for (let k = 0; k < walk.length; k++) {
    const f = world.cells[k]!;
    const blocked = f & CELL.WATER; // Terrain itself is traversable; buildings, trunks and defensive walls remain solid.
    walk[k] = blocked ? 0 : 1;
  }
  // Bridges keep their deck walkable.
  for (let cz = 0; cz < GRID_H; cz++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      const x = MAP.minX + cx + 0.5;
      const z = MAP.minZ + cz + 0.5;
      for (const b of world.bridges) {
        const dx = x - b.x;
        const dz = z - b.z;
        const along = dx * Math.sin(b.angle) + dz * Math.cos(b.angle);
        const across = dx * Math.cos(b.angle) - dz * Math.sin(b.angle);
        if (Math.abs(along) < b.length / 2 + 0.6 && Math.abs(across) < MAP.roadHalf + 0.2)
          walk[cz * GRID_W + cx] = 1;
      }
    }
  }
  for (const p of props) {
    if (p.box) stampBox(walk, p.x, p.z, p.rot, p.box[0], p.box[1], 0);
    if (p.block <= 0 || (fine && p.trunk)) continue;
    stampDisc(walk, p.x, p.z, p.block, 0);
    // Something bodies bump into (a barrel, a basket, a lantern post) blocks at least the cell it
    // stands in, so that paths go round it — a small disc can miss every cell's centre.
    if (!fine && p.trunk) {
      const cx = Math.floor(p.x - MAP.minX);
      const cz = Math.floor(p.z - MAP.minZ);
      if (cx >= 0 && cz >= 0 && cx < GRID_W && cz < GRID_H) walk[cz * GRID_W + cx] = 0;
    }
  }
  return walk;
}

/**
 * The wall in the walk grids: its walk and stairs are open (at their height: see wallStep), the rest
 * of it solid, the gate's doorway open (the sim shuts it while the gate is shut). Returns each wall
 * cell's floor over the wall's foot (NaN off the wall) and the doorway's cells.
 */
// Every supplied world/walk grid has the same fixed GRID_W × GRID_H extent.
export function wallGrid(world: World, ...grids: Uint8Array[]): { level: Float32Array; gate: Uint8Array } {
  const level = new Float32Array(GRID_W * GRID_H).fill(NaN);
  const gate = new Uint8Array(GRID_W * GRID_H);
  for (let k = 0; k < level.length; k++) {
    if (!(world.cells[k]! & CELL.WALL)) continue;
    const x = MAP.minX + (k % GRID_W) + 0.5;
    const z = MAP.minZ + ((k / GRID_W) | 0) + 0.5;
    const wa = wallAt(x, z);
    const open = wa === 'walk' || wa === 'stair' || wa === 'gate';
    for (const g of grids) g[k] = open ? 1 : 0;
    if (wa === 'walk' || wa === 'stair') level[k] = wallFloor(x, z);
    if (wa === 'gate') gate[k] = 1;
  }
  return { level, gate };
}

/**
 * May a body step from cell a to the next cell b? Not more than a stair's step up or down: the
 * wall-walk is reached by its stairs, never straight from the ground beside it.
 */
export function wallStep(level: Float32Array, a: number, b: number): boolean {
  if (
    !Number.isInteger(a) ||
    !Number.isInteger(b) ||
    a < 0 ||
    b < 0 ||
    a >= level.length ||
    b >= level.length
  )
    return false;
  const la = level[a]!;
  const lb = level[b]!;
  if (la !== la && lb !== lb) return true;
  if (Math.abs((la === la ? la : 0) - (lb === lb ? lb : 0)) > 0.75) return false;
  // Nor through the wall's solid parts between them (the railing between a stair and the walk,
  // all but where the stair's landing meets it).
  const ax = MAP.minX + (a % GRID_W) + 0.5;
  const az = MAP.minZ + ((a / GRID_W) | 0) + 0.5;
  const bx = MAP.minX + (b % GRID_W) + 0.5;
  const bz = MAP.minZ + ((b / GRID_W) | 0) + 0.5;
  // A walker's shoulders too (a body's width either side): no cutting the railing's corners.
  const l = Math.hypot(bx - ax, bz - az) || 1;
  const nx = (-(bz - az) / l) * 0.3;
  const nz = ((bx - ax) / l) * 0.3;
  for (let t = 0.125; t < 0.9; t += 0.125) {
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if (wallAt(x, z) === 'solid' || wallAt(x + nx, z + nz) === 'solid' || wallAt(x - nx, z - nz) === 'solid')
      return false;
  }
  return true;
}

/** Marks cells whose centres fall inside an oriented box (half-extents across × along `rot`). */
export function stampBox(
  grid: Uint8Array,
  x: number,
  z: number,
  rot: number,
  hx: number,
  hz: number,
  value: number,
): void {
  const r = Math.hypot(hx, hz);
  const s = Math.sin(rot);
  const c = Math.cos(rot);
  const x0 = Math.max(0, Math.floor(x - r - MAP.minX));
  const x1 = Math.min(GRID_W - 1, Math.floor(x + r - MAP.minX));
  const z0 = Math.max(0, Math.floor(z - r - MAP.minZ));
  const z1 = Math.min(GRID_H - 1, Math.floor(z + r - MAP.minZ));
  for (let cz = z0; cz <= z1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      const dx = MAP.minX + cx + 0.5 - x;
      const dz = MAP.minZ + cz + 0.5 - z;
      const across = dx * c - dz * s;
      const along = dx * s + dz * c;
      if (Math.abs(across) <= hx + 0.35 && Math.abs(along) <= hz + 0.35) grid[cz * GRID_W + cx] = value;
    }
  }
}

/** Trunk-sized circles in 4 m buckets, for exact walking collision. */
export class Colliders {
  private buckets = new Map<number, number[]>();
  readonly xs: number[] = [];
  readonly zs: number[] = [];
  readonly rs: number[] = [];
  /** Resource node behind each collider (felled trees stop blocking), or 0. */
  readonly nodes: number[] = [];

  add(x: number, z: number, r: number, node = 0): void {
    const i = this.xs.length;
    this.xs.push(x);
    this.zs.push(z);
    this.rs.push(r);
    this.nodes.push(node);
    // A margin so bodies straddling a bucket edge still find it.
    const m = r + 0.4;
    const bx0 = Math.floor((x - m - MAP.minX) / 4);
    const bx1 = Math.floor((x + m - MAP.minX) / 4);
    const bz0 = Math.floor((z - m - MAP.minZ) / 4);
    const bz1 = Math.floor((z + m - MAP.minZ) / 4);
    for (let bz = bz0; bz <= bz1; bz++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const k = bz * 1000 + bx;
        let list = this.buckets.get(k);
        if (!list) this.buckets.set(k, (list = []));
        list.push(i);
      }
    }
  }

  /** First collider overlapping a circle at (x, z) of radius r, or -1. */
  // Bucket indices are inserted by add after all parallel collider arrays grow together.
  hit(x: number, z: number, r: number, skip: (i: number) => boolean): number {
    const list = this.buckets.get(Math.floor((z - MAP.minZ) / 4) * 1000 + Math.floor((x - MAP.minX) / 4));
    if (!list) return -1;
    for (const i of list) {
      const dx = x - this.xs[i]!;
      const dz = z - this.zs[i]!;
      const rr = r + this.rs[i]!;
      if (dx * dx + dz * dz < rr * rr && !skip(i)) return i;
    }
    return -1;
  }
}

export function stampDisc(
  grid: Uint8Array | Int32Array,
  x: number,
  z: number,
  r: number,
  value: number,
): void {
  const x0 = Math.max(0, Math.floor(x - r - MAP.minX));
  const x1 = Math.min(GRID_W - 1, Math.floor(x + r - MAP.minX));
  const z0 = Math.max(0, Math.floor(z - r - MAP.minZ));
  const z1 = Math.min(GRID_H - 1, Math.floor(z + r - MAP.minZ));
  for (let cz = z0; cz <= z1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      const dx = MAP.minX + cx + 0.5 - x;
      const dz = MAP.minZ + cz + 0.5 - z;
      if (dx * dx + dz * dz <= r * r) grid[cz * GRID_W + cx] = value;
    }
  }
}

/** Reusable A* over an 8-connected grid. */
// Search buffers share the fixed grid extent. Heap entries are only valid grid indices;
// predecessor and path-cell reads follow visited nodes or length-bounded dense arrays.
export class Pathfinder {
  private walkable: (k: number) => boolean;
  private step: (a: number, b: number) => boolean;

  private g = new Float32Array(GRID_W * GRID_H);
  private f = new Float32Array(GRID_W * GRID_H);
  private from = new Int32Array(GRID_W * GRID_H);
  private stamp = new Uint32Array(GRID_W * GRID_H);
  private closed = new Uint32Array(GRID_W * GRID_H);
  private run = 0;
  private heap: number[] = [];

  /**
   * `step(a, b)`: may a body go from cell a to the next cell b? (Up on the wall-walk you can't step
   * straight down to the ground beside it, nor up onto it from below — only by its stairs.)
   */
  constructor(walkable: (k: number) => boolean, step: (a: number, b: number) => boolean = () => true) {
    this.walkable = walkable;
    this.step = step;
  }

  /**
   * Nearest walkable cell to (cx, cz) within `maxR` rings, or -1. With `from` (a cell), a blocked
   * spot — a blueprint, a building — is reached on the side you come from: of the open cells in
   * its first ring (and the next), the one with the shortest way round.
   */
  nearestWalkable(cx: number, cz: number, maxR = 6, from = -1): number {
    if (from >= 0) {
      const fx = from % GRID_W;
      const fz = (from / GRID_W) | 0;
      let first = -1;
      let best = -1;
      let bestS = Infinity;
      for (let r = 0; r <= maxR && (first < 0 || r <= first + 1); r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const x = cx + dx;
            const z = cz + dz;
            if (x < 0 || z < 0 || x >= GRID_W || z >= GRID_H) continue;
            const k = z * GRID_W + x;
            if (!this.walkable(k)) continue;
            if (first < 0) first = r;
            const s = Math.hypot(x - fx, z - fz) + 2 * Math.hypot(dx, dz);
            if (s < bestS) {
              bestS = s;
              best = k;
            }
          }
        }
      }
      return best;
    }
    for (let r = 0; r <= maxR; r++) {
      let best = -1;
      let bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= GRID_W || z >= GRID_H) continue;
          const k = z * GRID_W + x;
          if (!this.walkable(k)) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Returns flattened world waypoints [x0, z0, …] (excluding the start), or null. */
  find(sx: number, sz: number, tx: number, tz: number): number[] | null {
    const scx = Math.floor(sx - MAP.minX);
    const scz = Math.floor(sz - MAP.minZ);
    let start = this.nearestWalkable(scx, scz, 3);
    const goal =
      start < 0 ? -1 : this.nearestWalkable(Math.floor(tx - MAP.minX), Math.floor(tz - MAP.minZ), 8, start);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [tx, tz];
    const run = ++this.run;
    const heap = this.heap;
    heap.length = 0;
    const gx = goal % GRID_W;
    const gz = (goal / GRID_W) | 0;
    const h = (k: number) => {
      const dx = Math.abs((k % GRID_W) - gx);
      const dz = Math.abs(((k / GRID_W) | 0) - gz);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    this.stamp[start] = run;
    this.g[start] = 0;
    this.f[start] = h(start);
    this.from[start] = -1;
    this.push(start);
    let found = false;
    let iterations = 0;
    while (heap.length && iterations++ < 20000) {
      const cur = this.pop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (this.closed[cur] === run) continue;
      this.closed[cur] = run;
      const cx = cur % GRID_W;
      const cz = (cur / GRID_W) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= GRID_W || nz >= GRID_H) continue;
          const nk = nz * GRID_W + nx;
          if (!this.walkable(nk) || this.closed[nk] === run || !this.step(cur, nk)) continue;
          if (dx && dz && (!this.walkable(cz * GRID_W + nx) || !this.walkable(nz * GRID_W + cx))) continue;
          const ng = this.g[cur]! + (dx && dz ? Math.SQRT2 : 1);
          if (this.stamp[nk] !== run || ng < this.g[nk]!) {
            this.stamp[nk] = run;
            this.g[nk] = ng;
            this.f[nk] = ng + h(nk);
            this.from[nk] = cur;
            this.push(nk);
          }
        }
      }
    }
    if (!found) return null;
    const cells: number[] = [];
    for (let k = goal; k !== -1; k = this.from[k]!) cells.push(k);
    cells.reverse();
    // String-pull with line of sight.
    const pts: number[] = [];
    let anchorX = sx;
    let anchorZ = sz;
    let i = 1;
    while (i < cells.length) {
      let j = i;
      while (j + 1 < cells.length) {
        const k = cells[j + 1]!;
        if (!this.los(anchorX, anchorZ, MAP.minX + (k % GRID_W) + 0.5, MAP.minZ + ((k / GRID_W) | 0) + 0.5))
          break;
        j++;
      }
      const k = cells[j]!;
      const wx = j === cells.length - 1 ? tx : MAP.minX + (k % GRID_W) + 0.5;
      const wz = j === cells.length - 1 ? tz : MAP.minZ + ((k / GRID_W) | 0) + 0.5;
      pts.push(wx, wz);
      anchorX = wx;
      anchorZ = wz;
      i = j + 1;
    }
    // Keep the final goal reachable even if it sits inside a blocked cell.
    if (!this.walkable(Math.floor(tz - MAP.minZ) * GRID_W + Math.floor(tx - MAP.minX))) {
      pts[pts.length - 2] = MAP.minX + (goal % GRID_W) + 0.5;
      pts[pts.length - 1] = MAP.minZ + ((goal / GRID_W) | 0) + 0.5;
    }
    return pts;
  }

  /** Grid line of sight (samples every 0.35 m with a little body width). */
  los(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 0.35);
    const px = (-(bz - az) / (d || 1)) * 0.3;
    const pz = ((bx - ax) / (d || 1)) * 0.3;
    let last = Math.floor(az - MAP.minZ) * GRID_W + Math.floor(ax - MAP.minX);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      for (const s of [-1, 1]) {
        const cx = Math.floor(x + px * s - MAP.minX);
        const cz = Math.floor(z + pz * s - MAP.minZ);
        if (cx < 0 || cz < 0 || cx >= GRID_W || cz >= GRID_H) return false;
        if (!this.walkable(cz * GRID_W + cx)) return false;
      }
      // No cutting between the wall-walk and the ground beside it.
      const k = Math.floor(z - MAP.minZ) * GRID_W + Math.floor(x - MAP.minX);
      if (k !== last && !this.step(last, k)) return false;
      last = k;
    }
    return true;
  }

  private push(k: number): void {
    const heap = this.heap;
    heap.push(k);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[heap[p]!]! <= this.f[k]!) break;
      heap[i] = heap[p]!;
      i = p;
    }
    heap[i] = k;
  }

  private pop(): number {
    const heap = this.heap;
    // pop is called only by the nonempty-heap search loop.
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      const n = heap.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < n && this.f[heap[l]!]! < this.f[m === i ? last : heap[m]!]!) m = l;
        if (r < n && this.f[heap[r]!]! < this.f[m === i ? last : heap[m]!]!) m = r;
        if (m === i) break;
        heap[i] = heap[m]!;
        i = m;
      }
      heap[i] = last;
    }
    return top;
  }
}
