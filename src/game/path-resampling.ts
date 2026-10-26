import { dist, lerp } from '../core/math.ts';

export interface Vec2 {
  x: number;
  z: number;
}

// ---------------------------------------------------------------------------------------------
// Splines

/** Centripetal Catmull-Rom through the points, resampled at a fixed arc-length step. */
export function resamplePath(points: Vec2[], step: number): { xs: Float32Array; zs: Float32Array } {
  const first = points[0];
  if (!first) return { xs: new Float32Array(), zs: new Float32Array() };
  // The nonempty input and the bounded loops below establish every indexed point.
  const last = points[points.length - 1]!;
  if (points.length === 1) return { xs: Float32Array.of(first.x), zs: Float32Array.of(first.z) };
  const dense: Vec2[] = [];
  const P = [first, ...points, last];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1]!, P[i]!, P[i + 1]!, P[i + 2]!];
    const segs = Math.max(4, Math.ceil(dist(p1.x, p1.z, p2.x, p2.z) / 0.25));
    for (let s = 0; s < segs; s++) dense.push(catmull(p0, p1, p2, p3, s / segs));
  }
  dense.push(last);
  const xs: number[] = [dense[0]!.x];
  const zs: number[] = [dense[0]!.z];
  let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1]!;
    const b = dense[i]!;
    const segLen = dist(a.x, a.z, b.x, b.z);
    let t = step - carry;
    while (t <= segLen) {
      const k = t / segLen;
      xs.push(lerp(a.x, b.x, k));
      zs.push(lerp(a.z, b.z, k));
      t += step;
    }
    carry = segLen - (t - step);
  }
  if (dist(xs[xs.length - 1]!, zs[zs.length - 1]!, last.x, last.z) > step * 0.25) {
    xs.push(last.x);
    zs.push(last.z);
  }
  return { xs: Float32Array.from(xs), zs: Float32Array.from(zs) };
}

export function catmull(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const alpha = 0.5;
  const tj = (ti: number, a: Vec2, b: Vec2) => ti + Math.pow(Math.max(1e-4, dist(a.x, a.z, b.x, b.z)), alpha);
  const t0 = 0;
  const t1 = tj(t0, p0, p1);
  const t2 = tj(t1, p1, p2);
  const t3 = tj(t2, p2, p3);
  const u = lerp(t1, t2, t);
  const mix = (a: Vec2, b: Vec2, ta: number, tb: number): Vec2 => {
    const k = (u - ta) / (tb - ta);
    return { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k) };
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}
