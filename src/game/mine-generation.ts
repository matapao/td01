/** Immutable density and ore grids for the authored mine layout. */
import { Noise2D } from '../core/noise.ts';
import type { Shape, CaveIn, MineLine, MineField, DigZone, DigGrid } from './mine-types.ts';
import type { Ore, MineralId } from './mine-line-data.ts';
import { pathAt } from './mine-track.ts';
import {
  FIELD_STEP,
  DIG_DEPTH,
  WOBBLE,
  DRIFT,
  CAVE_WIDE,
  CAVE_CLEAR,
  MINE_AT,
  STATION,
  DIG,
  smin,
  hashCell,
} from './mine-parameters.ts';
// Field buffers share nx × nz and every stamping rectangle is clamped to that extent.
export function buildField(
  shapes: Shape[],
  caves: CaveIn[],
  lines: MineLine[],
  solids: { x: number; z: number; r: number }[],
): MineField {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  const grow = (x: number, z: number, r: number) => {
    minX = Math.min(minX, x - r);
    maxX = Math.max(maxX, x + r);
    minZ = Math.min(minZ, z - r);
    maxZ = Math.max(maxZ, z + r);
  };
  // Room round every shape for the rock that may be dug.
  const margin = DIG_DEPTH + 2.4;
  for (const s of shapes) {
    for (const [x, z, r] of s.circles) grow(x, z, r + margin);
    for (const l of s.lines) for (const p of l.pts) grow(p.x, p.z, l.half + margin);
  }
  const step = FIELD_STEP;
  const x0 = Math.floor(minX);
  const z0 = Math.floor(minZ);
  // An odd number of samples a side, so the dig grid's pieces cover it whole.
  const nx = Math.ceil((maxX - x0) / step / 2) * 2 + 1;
  const nz = Math.ceil((maxZ - z0) / step / 2) * 2 + 1;
  const n = nx * nz;
  const sdf = new Float32Array(n).fill(9);
  const hsum = new Float32Array(n);
  const wsum = new Float32Array(n);
  const own = new Float32Array(n);
  for (const s of shapes) {
    // The shape on its own (hard union of its parts), over its box…
    let bx0 = Infinity;
    let bz0 = Infinity;
    let bx1 = -Infinity;
    let bz1 = -Infinity;
    const box = (x: number, z: number, r: number) => {
      bx0 = Math.min(bx0, x - r);
      bx1 = Math.max(bx1, x + r);
      bz0 = Math.min(bz0, z - r);
      bz1 = Math.max(bz1, z + r);
    };
    const reach = DIG_DEPTH + 1.8;
    for (const [x, z, r] of s.circles) box(x, z, r + reach);
    for (const l of s.lines) for (const p of l.pts) box(p.x, p.z, l.half + reach);
    const i0 = Math.max(0, Math.floor((bx0 - x0) / step));
    const i1 = Math.min(nx - 1, Math.ceil((bx1 - x0) / step));
    const j0 = Math.max(0, Math.floor((bz0 - z0) / step));
    const j1 = Math.min(nz - 1, Math.ceil((bz1 - z0) / step));
    for (let j = j0; j <= j1; j++) own.fill(9, j * nx + i0, j * nx + i1 + 1);
    const stamp = (cx: number, cz: number, rad: number, d: (px: number, pz: number) => number) => {
      const a0 = Math.max(i0, Math.floor((cx - rad - x0) / step));
      const a1 = Math.min(i1, Math.ceil((cx + rad - x0) / step));
      const b0 = Math.max(j0, Math.floor((cz - rad - z0) / step));
      const b1 = Math.min(j1, Math.ceil((cz + rad - z0) / step));
      for (let j = b0; j <= b1; j++) {
        const pz = z0 + j * step;
        for (let i = a0; i <= a1; i++) {
          const k = j * nx + i;
          const v = d(x0 + i * step, pz);
          if (v < own[k]!) own[k] = v;
        }
      }
    };
    for (const [cx, cz, r] of s.circles)
      stamp(cx, cz, r + reach, (px, pz) => Math.hypot(px - cx, pz - cz) - r);
    for (const l of s.lines) {
      for (let q = 1; q < l.pts.length; q++) {
        // q starts at one and both endpoints are inside this dense path.
        const a = l.pts[q - 1]!;
        const b = l.pts[q]!;
        const vx = b.x - a.x;
        const vz = b.z - a.z;
        const l2 = vx * vx + vz * vz || 1;
        stamp((a.x + b.x) / 2, (a.z + b.z) / 2, Math.hypot(vx, vz) / 2 + l.half + reach, (px, pz) => {
          const t = Math.max(0, Math.min(1, ((px - a.x) * vx + (pz - a.z) * vz) / l2));
          return Math.hypot(px - a.x - vx * t, pz - a.z - vz * t) - l.half;
        });
      }
    }
    // …then blended into the mine: soft where shapes meet, the roof heights eased between them (and
    // on into the rock round it, for what is dug out later).
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        const v = own[k]!;
        if (v >= 8) continue;
        sdf[k] = smin(sdf[k]!, v, 0.9);
        const w = Math.max(0, reach - v) ** 2;
        hsum[k]! += w * s.roof;
        wsum[k]! += w;
      }
    }
  }
  // The walls wander: blasted rock is never where the plan put it.
  const noise = new Noise2D(9137);
  const roof = new Float32Array(n);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = x0 + i * step;
      const z = z0 + j * step;
      sdf[k]! += WOBBLE * noise.fbm(x / 2.7, z / 2.7, 3) + 0.08 * noise.noise(x * 1.3 + 40, z * 1.3);
      roof[k] = wsum[k]! > 0 ? hsum[k]! / wsum[k]! : DRIFT.roof;
    }
  }
  // Where the cave-ins choke the drifts, and where the solid things stand.
  const plug = new Uint8Array(n);
  const solid = new Uint8Array(n);
  const paint = (
    cx: number,
    cz: number,
    rad: number,
    inside: (px: number, pz: number) => boolean,
    into: Uint8Array,
    v: number,
  ) => {
    for (
      let j = Math.max(0, Math.floor((cz - rad - z0) / step));
      j <= Math.min(nz - 1, Math.ceil((cz + rad - z0) / step));
      j++
    ) {
      for (
        let i = Math.max(0, Math.floor((cx - rad - x0) / step));
        i <= Math.min(nx - 1, Math.ceil((cx + rad - x0) / step));
        i++
      ) {
        if (inside(x0 + i * step, z0 + j * step)) into[j * nx + i] = v;
      }
    }
  };
  caves.forEach((c, ci) => {
    const line = lines[c.line];
    if (!line) throw new Error(`Cave-in references missing mine line ${c.line}`);
    paint(
      c.x,
      c.z,
      c.half + 3,
      (px, pz) => {
        // Across the drift's whole width, within `half` of the cave-in along the line.
        let best = Infinity;
        let at = 0;
        for (let d = c.d - c.half - 2.5; d <= c.d + c.half + 2.5; d += 0.1) {
          const p = pathAt(line, d);
          const dd = Math.hypot(px - p.x, pz - p.z);
          if (dd < best) {
            best = dd;
            at = d;
          }
        }
        return Math.abs(at - c.d) <= c.half && best < CAVE_WIDE;
      },
      plug,
      ci + 1,
    );
  });
  for (const s of solids) paint(s.x, s.z, s.r, (px, pz) => Math.hypot(px - s.x, pz - s.z) < s.r, solid, 1);
  return { x0, z0, nx, nz, step, sdf, roof, plug, solid };
}

/** A field between its samples. */
// The four samples share f.nx × f.nz; the bounds test leaves room for each neighbor.
export function sample(f: MineField, a: Float32Array, x: number, z: number, outside: number): number {
  const fx = (x - f.x0) / f.step;
  const fz = (z - f.z0) / f.step;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= f.nx - 1 || j >= f.nz - 1) return outside;
  const u = fx - i;
  const v = fz - j;
  const k = j * f.nx + i;
  const a0 = a[k]! + (a[k + 1]! - a[k]!) * u;
  const a1 = a[k + f.nx]! + (a[k + f.nx + 1]! - a[k + f.nx]!) * u;
  return a0 + (a1 - a0) * v;
}

// Dig members are initialized one list per spec. Cell indices come from the allocated
// nx × nz loop, including the corresponding odd samples in the full-resolution field.
export function layRock(
  f: MineField,
  specs: { zone: DigZone; inside: (x: number, z: number, depth: number) => boolean; ores: Ore[] }[],
  caves: CaveIn[],
): DigGrid {
  const nx = (f.nx - 1) / 2;
  const nz = (f.nz - 1) / 2;
  const n = nx * nz;
  const zone = new Int16Array(n).fill(-1);
  const mineral = new Uint8Array(n);
  const depth = new Float32Array(n);
  const members: number[][] = specs.map(() => []);
  for (let J = 0; J < nz; J++) {
    for (let I = 0; I < nx; I++) {
      const k = J * nx + I;
      const fk = (2 * J + 1) * f.nx + 2 * I + 1;
      // The half-resolution dig grid addresses odd interior samples of the field.
      const s = f.sdf[fk]!;
      depth[k] = s;
      // Rock (not the open mine), not too deep, nowhere near a cave-in.
      if (s < 0 || s > DIG_DEPTH) continue;
      const x = f.x0 + (I + 0.5) * DIG;
      const z = f.z0 + (J + 0.5) * DIG;
      if (caves.some((c) => Math.hypot(x - c.x, z - c.z) < CAVE_CLEAR)) continue;
      if (Math.hypot(x - MINE_AT.x, z - MINE_AT.z) < STATION.r + DIG_DEPTH + 1) continue;
      const zi = specs.findIndex((sp) => sp.inside(x, z, s));
      if (zi < 0) continue;
      zone[k] = zi;
      members[zi]!.push(k);
    }
  }
  specs.forEach((sp, zi) => {
    // members is allocated once per spec, and these are spec indices.
    const list = members[zi]!;
    const left = new Set(list);
    const exposed = (k: number) => depth[k]! < DIG * 0.9;
    sp.ores.forEach(([min, style, share], oi) => {
      const noise = new Noise2D(7919 + zi * 131 + oi * 17);
      const ang = noise.noise(3.3, 7.7) * Math.PI;
      const strength = (k: number): number => {
        const I = k % nx;
        const J = Math.floor(k / nx);
        const x = f.x0 + (I + 0.5) * DIG;
        const z = f.z0 + (J + 0.5) * DIG;
        let v: number;
        if (style === 'vein') v = 1 - Math.abs(noise.fbm(x / 2.4, z / 2.4, 2));
        else if (style === 'seam') {
          const u = x * Math.cos(ang) + z * Math.sin(ang);
          v = 0.5 + 0.5 * Math.cos((u / 1.7 + noise.noise(x / 3, z / 3) * 0.9) * Math.PI * 2);
        } else v = noise.fbm(x / 1.3, z / 1.3, 2) * 0.5 + 0.5;
        // A little richer the deeper in.
        return v + 0.18 * Math.min(1, depth[k]! / DIG_DEPTH) + hashCell(k, oi) * 0.02;
      };
      const pool = [...left];
      const want = Math.round(share * list.length);
      pool.sort((a, b) => strength(b) - strength(a) || a - b);
      const take = pool.slice(0, want);
      // Every mineral shows somewhere in the wall as the mine is found.
      if (want > 0 && !take.some(exposed)) {
        const shown = pool.filter(exposed).slice(0, Math.max(2, Math.round(want * 0.15)));
        take.splice(take.length - shown.length, shown.length, ...shown);
      }
      for (const k of take) {
        mineral[k] = min;
        left.delete(k);
      }
    });
    for (const k of list)
      sp.zone.holds[mineral[k] as MineralId] = (sp.zone.holds[mineral[k] as MineralId] ?? 0) + 1;
  });
  return { nx, nz, zone, mineral, depth };
}
