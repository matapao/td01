// Lattice reads use W³ allocated samples; tetrahedron tables address eight corners and 3/4-point branches validate intersections.
/** Smooth surface excavation; the underground mine uses small exposed building-block faces. */
import * as THREE from 'three';
import { ROCK_STEP, ROCK_CHUNK, type RockField } from '../game/excavation.ts';
import { MINERALS, MINE_AT } from '../game/mines.ts';
import { MINE_REGION_X } from '../game/map.ts';
import { mineBlockGeometryWork } from './mine-block-mesh.ts';
type Vec3 = [number, number, number];
type SurfacePoint = [number, number, number, number, number, number];
const TETS = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
] as const;
const CORNERS = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
] as const;
const EDGES = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
] as const;
const base = new THREE.Color('#a09583'),
  layer = new THREE.Color('#706d64'),
  mineralColor = new THREE.Color();
const oreColors = Object.values(MINERALS).map((m) => new THREE.Color(m.stain));
/** Shared lattice coordinates make adjacent chunks meet exactly, including their painted colours. */
export function* rockGeometryWork(
  field: RockField,
  cx: number,
  cy: number,
  cz: number,
): Generator<void, THREE.BufferGeometry | null> {
  if (cx * ROCK_CHUNK > MINE_REGION_X) return yield* mineBlockGeometryWork(field, cx, cy, cz);
  field.sync();
  const n = Math.round(ROCK_CHUNK / ROCK_STEP),
    W = n + 1;
  const ox = cx * ROCK_CHUNK,
    oy = cy * ROCK_CHUNK,
    oz = cz * ROCK_CHUNK;
  const values = new Float32Array(W * W * W);
  let low = Infinity,
    high = -Infinity;
  const at = (i: number, j: number, k: number) => i + W * (j + W * k);
  for (let k = 0; k <= n; k++) {
    const columns = Array.from({ length: W }, (_, i) =>
      field.columnSampler(ox + i * ROCK_STEP, oz + k * ROCK_STEP),
    );
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const v = columns[i]!(oy + j * ROCK_STEP);
        values[at(i, j, k)] = v;
        low = Math.min(low, v);
        high = Math.max(high, v);
      }
    yield;
  }
  if (low > 0 || high <= 0) return null;
  // Lattice gradients give continuous painted normals without six extra density queries per
  // triangle. Shared boundary samples keep positions identical between neighbouring chunks.
  const gradients = new Map<number, Vec3>();
  const sample = (i: number, j: number, k: number) =>
    i < 0 || i > n || j < 0 || j > n || k < 0 || k > n
      ? Math.fround(field.density(ox + i * ROCK_STEP, oy + j * ROCK_STEP, oz + k * ROCK_STEP))
      : values[at(i, j, k)]!;
  const gradient = (i: number, j: number, k: number) => {
    const id = at(i, j, k),
      cached = gradients.get(id);
    if (cached) return cached;
    // One sample outside the chunk gives both sides the same centred derivative: no painted
    // tile seams where a one-sided boundary normal would otherwise change abruptly.
    const g: Vec3 = [
      sample(i - 1, j, k) - sample(i + 1, j, k),
      sample(i, j - 1, k) - sample(i, j + 1, k),
      sample(i, j, k - 1) - sample(i, j, k + 1),
    ];
    gradients.set(id, g);
    return g;
  };
  const pos: number[] = [],
    nor: number[] = [],
    col: number[] = [];
  const paint = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    const band = 0.5 + 0.5 * Math.sin(y * 3.1 + (x - MINE_AT.x) * 0.28 + (z - MINE_AT.z) * 0.19);
    const grain = 0.5 + 0.5 * Math.sin(x * 7.1 + y * 9.9 + z * 8.7) * Math.sin(x * 5.7 - z * 4.3 + y * 3.1);
    mineralColor
      .copy(base)
      .lerp(layer, band * 0.32)
      .multiplyScalar(0.88 + grain * 0.1 + Math.max(0, ny) * 0.12);
    const ore = field.mineral(x, y, z);
    if (ore) mineralColor.lerp(oreColors[ore]!, 0.55 + 0.2 * band);
    // Painted creases and warm face highlights, not real-time illumination or neon veins.
    mineralColor.multiplyScalar(0.87 + 0.13 * Math.max(0, nx * 0.4 + ny * 0.7 + nz * 0.5));
    col.push(mineralColor.r, mineralColor.g, mineralColor.b);
  };
  const tri = (a: SurfacePoint, b: SurfacePoint, c: SurfacePoint) => {
    let ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2],
      vx = c[0] - a[0],
      vy = c[1] - a[1],
      vz = c[2] - a[2];
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    nx /= len;
    ny /= len;
    nz /= len;
    const outward = { x: a[3] + b[3] + c[3], y: a[4] + b[4] + c[4], z: a[5] + b[5] + c[5] };
    if (nx * outward.x + ny * outward.y + nz * outward.z < 0) {
      const swap = b;
      b = c;
      c = swap;
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    for (const p of [a, b, c]) {
      const l = Math.hypot(p[3], p[4], p[5]) || 1;
      pos.push(p[0], p[1], p[2]);
      nor.push(p[3] / l, p[4] / l, p[5] / l);
      paint(p[0], p[1], p[2], p[3] / l, p[4] / l, p[5] / l);
    }
  };
  for (let k = 0; k < n; k++)
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const vs = CORNERS.map(([x, y, z]) => values[at(i + x, j + y, k + z)]!);
        if (vs.every((v) => v > 0) || vs.every((v) => v <= 0)) continue;
        const ps = CORNERS.map(([x, y, z]): Vec3 => [
          ox + (i + x) * ROCK_STEP,
          oy + (j + y) * ROCK_STEP,
          oz + (k + z) * ROCK_STEP,
        ]);
        const normals = CORNERS.map(([x, y, z]) => gradient(i + x, j + y, k + z));
        for (const tet of TETS) {
          const points: SurfacePoint[] = [];
          for (const [u, v] of EDGES) {
            const a = tet[u],
              b = tet[v];
            if (vs[a]! > 0 === vs[b]! > 0) continue;
            const t = vs[a]! / (vs[a]! - vs[b]!);
            const pa = ps[a]!,
              pb = ps[b]!,
              na = normals[a]!,
              nb = normals[b]!;
            points.push([
              pa[0] + (pb[0] - pa[0]) * t,
              pa[1] + (pb[1] - pa[1]) * t,
              pa[2] + (pb[2] - pa[2]) * t,
              na[0] + (nb[0] - na[0]) * t,
              na[1] + (nb[1] - na[1]) * t,
              na[2] + (nb[2] - na[2]) * t,
            ]);
          }
          if (points.length === 3) tri(points[0]!, points[1]!, points[2]!);
          else if (points.length === 4) {
            const mid: Vec3 = [0, 0, 0];
            for (const p of points) {
              mid[0] += p[0];
              mid[1] += p[1];
              mid[2] += p[2];
            }
            mid[0] /= 4;
            mid[1] /= 4;
            mid[2] /= 4;
            const N = new THREE.Vector3();
            for (const p of points) {
              N.x += p[3];
              N.y += p[4];
              N.z += p[5];
            }
            N.normalize();
            const U = new THREE.Vector3(points[0]![0], points[0]![1], points[0]![2])
              .sub(new THREE.Vector3(...mid))
              .normalize();
            const V = new THREE.Vector3().crossVectors(N, U);
            points.sort(
              (a, b) =>
                Math.atan2(
                  (a[0] - mid[0]) * V.x + (a[1] - mid[1]) * V.y + (a[2] - mid[2]) * V.z,
                  (a[0] - mid[0]) * U.x + (a[1] - mid[1]) * U.y + (a[2] - mid[2]) * U.z,
                ) -
                Math.atan2(
                  (b[0] - mid[0]) * V.x + (b[1] - mid[1]) * V.y + (b[2] - mid[2]) * V.z,
                  (b[0] - mid[0]) * U.x + (b[1] - mid[1]) * U.y + (b[2] - mid[2]) * U.z,
                ),
            );
            tri(points[0]!, points[1]!, points[2]!);
            tri(points[0]!, points[2]!, points[3]!);
          }
        }
      }
      yield;
    }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

/** Synchronous adapter for offline checks; the game advances the generator within its frame budget. */
export function rockGeometry(
  field: RockField,
  cx: number,
  cy: number,
  cz: number,
): THREE.BufferGeometry | null {
  const work = rockGeometryWork(field, cx, cy, cz);
  let next = work.next();
  while (!next.done) next = work.next();
  return next.value;
}
