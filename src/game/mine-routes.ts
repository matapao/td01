/** Three old hand-cut workings. Geometry is continuous; these are paths, never visible cells. */
import { MINE_AT } from './mines.ts';
export type TunnelPoint = readonly [number, number, number]; // x, floor depth, z, relative to lift
export const TUNNELS: { name: string; points: TunnelPoint[]; branch: TunnelPoint[]; radius: number }[] = [
  {
    name: 'Old Copper Cut',
    radius: 0.95,
    points: [
      [0, 0, -1.6],
      [1, -0.1, -3.8],
      [3, -0.35, -6.5],
      [4, -0.7, -9.5],
      [6, -1.05, -12],
    ],
    branch: [
      [3, -0.35, -6.5],
      [0.7, -0.55, -8.2],
      [-1.4, -0.8, -9.5],
    ],
  },
  {
    name: 'Coal Drift',
    radius: 1.05,
    points: [
      [1.6, 0, 0],
      [4, -0.45, 0.5],
      [7, -1.2, 1.2],
      [10, -2.1, 0.5],
      [13, -2.8, -1.2],
    ],
    branch: [
      [7, -1.2, 1.2],
      [8, -1.4, 3.2],
      [9.5, -1.7, 4.8],
    ],
  },
  {
    name: 'Deep Sulfur',
    radius: 1.0,
    points: [
      [0, 0, 1.6],
      [-1, -0.5, 4],
      [0.4, -1.1, 6.5],
      [-0.5, -2.0, 9],
      [1.5, -3.2, 12],
      [-0.5, -4.2, 15],
    ],
    branch: [
      [-0.5, -2, 9],
      [-2.7, -2.4, 10.4],
      [-4.8, -2.9, 11.5],
    ],
  },
];
export const tunnelWorld = (p: TunnelPoint) => ({ x: MINE_AT.x + p[0], y: p[1], z: MINE_AT.z + p[2] });
// slice(1) starts at the second point, so its index always has a preceding point.
const segments = TUNNELS.flatMap((t, lane) =>
  [t.points, t.branch].flatMap((points) =>
    points.slice(1).map((b, i) => ({ a: points[i]!, b, r: t.radius, lane })),
  ),
);
const bins = new Map<string, typeof segments>();
for (const s of segments)
  for (
    let z = Math.floor((Math.min(s.a[2], s.b[2]) - s.r - 1) / 2);
    z <= Math.floor((Math.max(s.a[2], s.b[2]) + s.r + 1) / 2);
    z++
  )
    for (
      let x = Math.floor((Math.min(s.a[0], s.b[0]) - s.r - 1) / 2);
      x <= Math.floor((Math.max(s.a[0], s.b[0]) + s.r + 1) / 2);
      x++
    ) {
      const key = `${x},${z}`,
        list = bins.get(key) ?? [];
      list.push(s);
      bins.set(key, list);
    }
export function tunnelSample(
  x: number,
  z: number,
): { floor: number; distance: number; radius: number; lane: number } {
  x -= MINE_AT.x;
  z -= MINE_AT.z;
  let best = Infinity,
    floor = 0,
    radius = 1,
    lane = -1;
  for (const s of bins.get(`${Math.floor(x / 2)},${Math.floor(z / 2)}`) ?? []) {
    const dx = s.b[0] - s.a[0],
      dz = s.b[2] - s.a[2],
      t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[2]) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - s.a[0] - dx * t, z - s.a[2] - dz * t);
    if (d - s.r < best) {
      best = d - s.r;
      floor = s.a[1] + (s.b[1] - s.a[1]) * t;
      radius = s.r;
      lane = s.lane;
    }
  }
  return { floor, distance: best, radius, lane };
}
/** Broad bedding ledges and persistent joints, rather than equally noisy bumps on every axis. */
export function rockRelief(x: number, y: number, z: number): number {
  x -= MINE_AT.x;
  z -= MINE_AT.z;
  const bed = Math.abs(Math.sin(y * 3.1 + x * 0.28 + z * 0.19));
  const joint = Math.abs(Math.sin(x * 1.25 + z * 0.74 - y * 0.22));
  return (bed - 0.5) * 0.13 + (joint - 0.5) * 0.19;
}
/** Sloping walking strips, leaning sides, worked ledges and asymmetric bevelled shoulders. */
export function tunnelDensity(x: number, y: number, z: number, q = tunnelSample(x, z)): number {
  if (q.distance > 0.45) return q.distance;
  const lx = x - MINE_AT.x,
    lz = z - MINE_AT.z,
    up = y - q.floor;
  const relief = rockRelief(x, y, z),
    lean = 0.075 * Math.sin(lx * 0.9 + lz * 0.65) * (up - 0.45);
  const roof = 1.62 + 0.17 * Math.sin(lx * 0.8 + lz * 0.55);
  const shoulder = Math.max(0, (q.distance + q.radius) / q.radius - 0.35) * 0.65;
  return Math.max(
    q.distance + relief + lean,
    q.floor - y + 0.012 * Math.sin(lx * 2 + lz * 1.4),
    up - roof + shoulder + relief * 0.65,
  );
}
export const TUNNEL_POCKETS = TUNNELS.flatMap((t, lane) =>
  // Each authored tunnel has at least three points; its pockets use the middle and final point.
  [t.points[2]!, t.points[t.points.length - 1]!].map((p, pocket) => ({
    lane,
    pocket,
    name: t.name,
    ...tunnelWorld(p),
    kind: lane === 2 && pocket === 1 ? ('golem' as const) : ('orc' as const),
  })),
);
export const MINE_SEAMS = [
  { x: MINE_AT.x + 1.8, y: 0.75, z: MINE_AT.z - 4.9, r: 0.65, mineral: 1 as const },
  { x: MINE_AT.x + 4.9, y: 0.3, z: MINE_AT.z + 1.4, r: 0.75, mineral: 2 as const },
  { x: MINE_AT.x - 1.8, y: 0.1, z: MINE_AT.z + 4.7, r: 0.75, mineral: 4 as const },
];
