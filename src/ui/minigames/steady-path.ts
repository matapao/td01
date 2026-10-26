import type { SteadyParams } from './steady-data.ts';
const TAU = Math.PI * 2;
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The path, resampled every STEP px: its points and its length. */
export interface Path {
  xs: Float32Array;
  ys: Float32Array;
  n: number;
  len: number;
}

export const STEP = 2;

/** The path's corner points in px: a named shape (turned on end for upright work) or the given points. */
export function corners(p: SteadyParams, r: Rect, upright: boolean): number[] {
  const pts: number[] = [];
  const at = (u: number, v: number): void => {
    if (upright) pts.push(r.x + v * r.w, r.y + u * r.h);
    else pts.push(r.x + u * r.w, r.y + v * r.h);
  };
  const shape = p.path;
  if (Array.isArray(shape) && shape.length >= 2) {
    for (const [x, y] of shape) pts.push(r.x + x * r.w, r.y + y * r.h);
    return pts;
  }
  if (shape === 'circle') {
    // A true circle, whatever the work's shape: from the left, round clockwise.
    const rad = 0.42 * Math.min(r.w, r.h);
    for (let i = 0; i <= 96; i++) {
      const a = Math.PI + (i / 96) * TAU;
      pts.push(r.x + r.w / 2 + Math.cos(a) * rad, r.y + r.h / 2 + Math.sin(a) * rad);
    }
    return pts;
  }
  if (shape === 'line' || Array.isArray(shape)) {
    at(0.03, 0.5);
    at(0.97, 0.5);
  } else if (shape === 'zigzag') {
    const n = Math.max(1, Math.round(p.turns ?? 4));
    for (let i = 0; i <= n * 2; i++) at(0.03 + (0.94 * i) / (n * 2), i % 2 ? 0.2 : 0.8);
  } else if (shape === 'wave') {
    const n = p.turns ?? 2;
    for (let i = 0; i <= 120; i++) at(0.03 + (0.94 * i) / 120, 0.5 - 0.32 * Math.sin((TAU * n * i) / 120));
  } else {
    const b = p.turns ?? 0.35;
    for (let i = 0; i <= 60; i++) {
      const u = i / 60;
      at(0.03 + 0.94 * u, 0.5 + b / 2 - b * 4 * u * (1 - u));
    }
  }
  return pts;
}

/** Points every STEP px along the corners. */
export function resample(c: number[]): Path {
  if (c.length < 4 || c.length % 2 !== 0 || c.some((v) => !Number.isFinite(v)))
    throw new Error('Tracing needs at least two complete finite points');
  // Packed x/y pairs: i steps by two and remains below the even input/output lengths.
  const out: number[] = [c[0]!, c[1]!];
  let rem = STEP;
  let len = 0;
  for (let i = 2; i < c.length; i += 2) {
    const ax = c[i - 2]!;
    const ay = c[i - 1]!;
    const seg = Math.hypot(c[i]! - ax, c[i + 1]! - ay);
    if (seg < 1e-6) continue;
    len += seg;
    let pos = 0;
    while (seg - pos >= rem) {
      pos += rem;
      out.push(ax + ((c[i]! - ax) * pos) / seg, ay + ((c[i + 1]! - ay) * pos) / seg);
      rem = STEP;
    }
    rem -= seg - pos;
  }
  if (rem < STEP - 0.5) out.push(c[c.length - 2]!, c[c.length - 1]!);
  const n = out.length / 2;
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = out[i * 2]!;
    ys[i] = out[i * 2 + 1]!;
  }
  return { xs, ys, n, len };
}

/** Strokes the path from sample `a` to `b`. */
export function tracePath(g: CanvasRenderingContext2D, path: Path, a = 0, b = path.n - 1): void {
  g.beginPath();
  g.moveTo(path.xs[a]!, path.ys[a]!);
  for (let i = a + 1; i <= b; i++) g.lineTo(path.xs[i]!, path.ys[i]!);
}
