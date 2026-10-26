export * from './map-data.ts';
import { MAP, MINE_REGION_X, WORLD, w, type LaneDef } from './map-data.ts';
export type { Vec2 } from './path-resampling.ts';
export { resamplePath } from './path-resampling.ts';
import { resamplePath } from './path-resampling.ts';
import type { Vec2 } from './path-resampling.ts';
/**
 * Hollowmere Vale — the single MVP map. Pure data + deterministic generation, shared by
 * the simulation (grids, lanes) and the view (terrain mesh, scenery).
 */
import { Noise2D } from '../core/noise.ts';
import { clamp, dist, lerp, smoothstep } from '../core/math.ts';
import { INTERIOR_REGION_X, roomFloorAt } from './interiors.ts';
import { inSpace, spaceHeight } from './space.ts';

// ---------------------------------------------------------------------------------------------
// The wall across the pass

/**
 * The wall (world units): a straight north–south line at `x` across the pass, of the hex kit's
 * wall_straight pieces (2 units long, drawn at `scale`), the gate piece in the middle. Along its
 * inner (west) side runs a wooden wall-walk `walkH` above its foot, under the battlements that face
 * out; a railing keeps you from the inner edge, and stone stairs climb the inner face either side of
 * the gate. Offsets across the wall are from `x` (+ is out). The walk does not cross the gatehouse:
 * north and south of it are two walks, each with its stair.
 */
export const WALL = (() => {
  const s = 4.6;
  const x = MAP.wallX;
  const half = 0.4 * s;
  const gatePiece = s;
  const walkEnd = MAP.passHalf + 1.5;
  /** A stair along the inner face: from its foot (on the ground) up to its head beside the gate. */
  const stair = (dir: 1 | -1) => ({
    x0: x - half - 2.07,
    x1: x - half,
    /** Where it starts on the ground and where it meets the walk (z): `dir` is the side of the gate it is on. */
    foot: dir * (gatePiece + 2 + 8.3),
    head: dir * (gatePiece + 2),
    dir,
    /** Its length, foot to head (m). */
    run: 8.3,
  });
  return {
    x,
    scale: s,
    /** One piece's length. */
    piece: 2 * s,
    /** Half the wall's thickness at its foot. */
    half,
    /** The wall-walk across the wall: from the inner railing to the battlements. */
    walk0: -0.36 * s + 0.25,
    walk1: 0.09 * s,
    /** The inner railing (between the wall's inner face and the walk). */
    rail0: -half,
    /** How high the walk is above the wall's foot. */
    walkH: 0.9 * s,
    /** The walks run out to here either side (|z|), into the rock. */
    walkEnd,
    /** The wall's pieces run on into the mountain to here (|z|). */
    reach: walkEnd + 8,
    /** The gate: half its doorway and half the gate piece (its jambs). */
    gateHalf: 0.45 * s,
    gatePiece,
    stairs: [stair(-1), stair(1)] as const,
    /** The stair's last stretch is a landing level with the walk (m). */
    landing: 1.6,
  };
})();

/** The gate in the wall, where the dead's roads end and the high street begins. */
export const GATE = { x: MAP.gate.x, z: MAP.gate.z, half: WALL.gateHalf };

/** The wall's line: from (x, z0) to (x, z1). */
export const WALL_LINE = { x: WALL.x, z0: -WALL.walkEnd, z1: WALL.walkEnd };

/** Our side of the wall (west of its inner face), on the map. */
export function insideWalls(x: number, z: number): boolean {
  return x < WALL.x - WALL.half && x > MAP.minX && z > MAP.minZ && z < MAP.maxZ;
}

/** Beyond the wall (east of its outer face): the dead's side, where only towers stand. */
export function outsideWalls(x: number, z: number): boolean {
  return x > WALL.x + WALL.half && x < MAP.maxX && z > MAP.minZ && z < MAP.maxZ;
}

/** How far (m) a point is from the wall's line (0 on it). */
export function wallDist(x: number, z: number): number {
  const dz = Math.max(0, Math.abs(z) - WALL.walkEnd);
  return Math.hypot(x - WALL.x, dz);
}

/**
 * What the wall is at (x, z), if anything: the walk or a stair you stand on, the doorway of the gate
 * (walked through on the ground, while it is open), or solid masonry (battlements, railing, the
 * gatehouse, a stair's side). Null: not the wall.
 */
export function wallAt(x: number, z: number): 'walk' | 'stair' | 'gate' | 'solid' | null {
  const dx = x - WALL.x;
  if (dx < -WALL.half) {
    // A stair against the inner face: its flight and landing; a wall at its head's end (towards the
    // gate) and along its outer side (all but the first steps up from its foot).
    const s = stairOf(x, z);
    if (!s) return null;
    const u = stairU(s, z);
    if (u > s.run) return 'solid';
    if (x < s.x0) return u > 1.2 ? 'solid' : null;
    return 'stair';
  }
  if (dx > WALL.half) return null;
  const az = Math.abs(z);
  if (az > WALL.reach) return null;
  if (az < WALL.gateHalf) return 'gate';
  if (az < WALL.gatePiece + 0.2 || az > WALL.walkEnd) return 'solid';
  if (dx >= WALL.walk0 && dx <= WALL.walk1) return 'walk';
  // The railing is open where a stair's landing meets the walk.
  if (dx < WALL.walk0)
    for (const s of WALL.stairs)
      if (stairU(s, z) >= s.run - WALL.landing && stairU(s, z) <= s.run) return 'walk';
  return 'solid';
}

type Stair = (typeof WALL.stairs)[number];

/** How far along a stair (m) from its foot towards its head a point at `z` is. */
function stairU(s: Stair, z: number): number {
  return (z - s.foot) * -s.dir;
}

/** The stair whose flight (or the masonry round it) is at (x, z). */
function stairOf(x: number, z: number): Stair | null {
  for (const s of WALL.stairs) {
    const u = stairU(s, z);
    if (x >= s.x0 - 0.3 && x < s.x1 && u >= 0 && u <= s.run + 0.35) return s;
  }
  return null;
}

/** How high up its stair (m above the wall's foot) a point is: rising from the foot, level on the landing. */
function stairHeight(s: Stair, z: number): number {
  return WALL.walkH * clamp(stairU(s, z) / (s.run - WALL.landing), 0, 1);
}

/** Is (x, z) up on the wall — on its walk or high up a stair, out of reach of anything below? */
export function onWall(x: number, z: number): boolean {
  const w = wallAt(x, z);
  if (w === 'walk') return true;
  if (w !== 'stair') return false;
  const s = stairOf(x, z);
  return !!s && stairHeight(s, z) > 2;
}

/** The height of the wall-walk (or of the stair at that point) over the wall's foot, where wallAt says walk or stair. */
export function wallFloor(x: number, z: number): number {
  const s = wallAt(x, z) === 'stair' ? stairOf(x, z) : null;
  return s ? stairHeight(s, z) : WALL.walkH;
}

/**
 * The point on the wall-walk nearest (x, z), along its middle: where a hero stands to work on
 * something out on the field (heroes never go out there — see OVER_WALL). Clear of the gatehouse
 * and of the walks' ends in the rock.
 */
export function wallSpot(_x: number, z: number): Vec2 {
  const az = clamp(Math.abs(z), WALL.gatePiece + 0.8, WALL.walkEnd - 0.6);
  return { x: WALL.x + (WALL.walk0 + WALL.walk1) / 2, z: z < 0 ? -az : az };
}

/**
 * How far from the middle (|z|) the walkable vale reaches at `x`: the mountain frame, closing in to
 * the pass at the wall — steeply on our side (the town opens out behind it), gently outside (a funnel
 * the roads come up).
 */
export function passHalfAt(x: number): number {
  const d = x - MAP.wallX;
  // Our side: a narrow ward, the mountains close either side, a little wider up to the wall.
  if (d < 0) return MAP.innerHalf + (MAP.passHalf + 0.6 - MAP.innerHalf) * smoothstep(-8, 0, d);
  // Beyond the wall the land opens out wide.
  const open = MAP.maxZ - MAP.border;
  return open - smoothstep(30, 3, d) * (open - MAP.passHalf - 0.6);
}

/** Distance into the vale from its mountain frame (0 or less: in the mountains), with the pass's shoulders. */
export function edgeDist(x: number, z: number): number {
  return Math.min(x - MAP.minX, MAP.maxX - x, passHalfAt(x) + MAP.border - Math.abs(z));
}

/** Which way a mine head's mouth faces (a y rotation: the model's front is its local +z). */
export function caveFacing(c: Vec2 & { front?: Vec2 }): number {
  return c.front ? Math.atan2(c.front.x - c.x, c.front.z - c.z) : Math.atan2(-c.x, -c.z * 0.4);
}

/** Heightfield resolution (metres per sample). */
export const HF_STEP = 0.5;
export const HF_W = Math.round((MAP.maxX - MAP.minX) / HF_STEP) + 1;
export const HF_H = Math.round((MAP.maxZ - MAP.minZ) / HF_STEP) + 1;

/** Simulation grid: 1 m cells. */
export const GRID_W = MAP.maxX - MAP.minX;
export const GRID_H = MAP.maxZ - MAP.minZ;

export const CELL = {
  WATER: 1,
  ROAD: 2,
  STEEP: 4,
  BORDER: 8,
  BLOCKED: 16,
  NOBUILD: 32,
  /** The wall and its stairs (nothing is built in it, no tree grows there). */
  WALL: 64,
  /** The wall-walk itself: lights and poles may stand up there. */
  WALK: 128,
} as const;

export interface Lane {
  index: number;
  def: LaneDef;
  /** Resampled every LANE_STEP metres. */
  xs: Float32Array;
  zs: Float32Array;
  /** Unit tangent. */
  tx: Float32Array;
  tz: Float32Array;
  /** Walking height of the road surface (continuous across bridges). */
  ys: Float32Array;
  length: number;
}

/** Resolve a route from validated world topology; stale indices are programmer/state errors. */
export function laneAt(world: World, index: number): Lane {
  const lane = world.lanes[index];
  if (!lane) throw new Error(`Unknown world lane ${index}`);
  return lane;
}

export const LANE_STEP = 0.5;

export interface Ford {
  x: number;
  z: number;
  r: number;
}

export interface Bridge {
  x: number;
  z: number;
  /** Angle of the road direction (radians, atan2(dx, dz)). */
  angle: number;
  deckY: number;
  length: number;
}

export interface World {
  excavatedFloor?: (x: number, z: number) => number;
  heights: Float32Array;
  /** 0..1 road weight per heightfield sample (for the terrain shader). */
  road: Float32Array;
  /** 0..1 blight (corruption near the crypts). */
  blight: Float32Array;
  lanes: Lane[];
  river: { xs: Float32Array; zs: Float32Array };
  /** The stream out beyond the wall. */
  brook: { xs: Float32Array; zs: Float32Array };
  /** The town's streets (not the dead's roads): resampled like lanes, with their walking height. */
  streets: { xs: Float32Array; zs: Float32Array; ys: Float32Array; half: number }[];
  bridges: Bridge[];
  fords: Ford[];
  cells: Uint8Array;
  /** Nearest lane distance per cell (metres). */
  laneDist: Float32Array;
  /** Nearest street distance per cell (metres). */
  streetDist: Float32Array;
  /** Height of the wall's foot (the ground along it is levelled for it); the walk is WALL.walkH above. */
  wallY: number;
}

// ---------------------------------------------------------------------------------------------
// Heightfield

const hfIndex = (ix: number, iz: number) => iz * HF_W + ix;
export const hfX = (ix: number) => MAP.minX + ix * HF_STEP;
export const hfZ = (iz: number) => MAP.minZ + iz * HF_STEP;

/** Natural terrain before roads/water are cut in. */
function naturalHeight(noise: Noise2D, x: number, z: number): number {
  let h = 1.0 + 0.5 * noise.fbm(x / (24 * WORLD), z / (24 * WORLD), 3) + 0.12 * noise.fbm(x / 6, z / 6, 2);
  // Rolling ground: gentle rises and dips, with calmer flat stretches in between.
  const calm = smoothstep(-0.25, 0.35, noise.noise(x / 55 + 9, z / 55 - 4));
  h += (0.25 + 0.75 * calm) * (0.85 * noise.fbm(x / 13 + 31, z / 13 + 17, 3) + 0.35);
  // Keep plateau.
  h += 1.5 * smoothstep(MAP.keepRadius + 5, MAP.keepRadius, dist(x, z, MAP.keep.x, MAP.keep.z));
  for (const hl of MAP.hills) {
    const d = dist(x, z, hl.x, hl.z) / hl.r;
    h += hl.h * Math.exp(-d * d * 2.2);
  }
  // Mountain frame: cliffs rising towards the map edge (and closing in on the pass at the wall).
  const e = edgeDist(x, z);
  const ridge = smoothstep(MAP.border, 1.5, e);
  // Mountains: steep, ragged ridges many times a person's height.
  const peaks = 0.5 + 0.5 * noise.fbm(x / (9 * WORLD) + 40, z / (9 * WORLD), 4);
  h += ridge * ridge * (9 + 26 * peaks);
  return h;
}

/** Stamp a polyline into a distance field over the heightfield, keeping the nearest sample index. */
/** All sample buffers share the heightfield extent; each nested loop clamps its cell indices. */
function stampDistance(
  xs: Float32Array,
  zs: Float32Array,
  radius: number,
  outDist: Float32Array,
  outIdx: Int32Array,
): void {
  const r = Math.ceil(radius / HF_STEP);
  for (let i = 0; i < xs.length; i++) {
    const cx = Math.round((xs[i]! - MAP.minX) / HF_STEP);
    const cz = Math.round((zs[i]! - MAP.minZ) / HF_STEP);
    for (let iz = Math.max(0, cz - r); iz <= Math.min(HF_H - 1, cz + r); iz++) {
      for (let ix = Math.max(0, cx - r); ix <= Math.min(HF_W - 1, cx + r); ix++) {
        const d = dist(hfX(ix), hfZ(iz), xs[i]!, zs[i]!);
        const k = hfIndex(ix, iz);
        if (d < outDist[k]!) {
          outDist[k] = d;
          outIdx[k] = i;
        }
      }
    }
  }
}

/** `heights` is the complete HF_W × HF_H field; clamping leaves room for all four corners. */
export function sampleHeights(heights: Float32Array, x: number, z: number): number {
  const fx = clamp((x - MAP.minX) / HF_STEP, 0, HF_W - 1.001);
  const fz = clamp((z - MAP.minZ) / HF_STEP, 0, HF_H - 1.001);
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const u = fx - ix;
  const v = fz - iz;
  const a = heights[hfIndex(ix, iz)]!;
  const b = heights[hfIndex(ix + 1, iz)]!;
  const c = heights[hfIndex(ix, iz + 1)]!;
  const d = heights[hfIndex(ix + 1, iz + 1)]!;
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function segmentIntersect(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): Vec2 | null {
  const r1x = bx - ax;
  const r1z = bz - az;
  const r2x = dx - cx;
  const r2z = dz - cz;
  const den = r1x * r2z - r1z * r2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * r2z - (cz - az) * r2x) / den;
  const u = ((cx - ax) * r1z - (cz - az) * r1x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + r1x * t, z: az + r1z * t };
}

let cached: World | null = null;

// Generation arrays below have identical N-sized allocations. Resampled coordinate/height arrays
// share their sample counts; every interpolation or neighbor read is clamped within those counts.
export function buildWorld(): World {
  if (cached) return cached;
  const noise = new Noise2D(MAP.seed);
  const N = HF_W * HF_H;
  const heights = new Float32Array(N);
  for (let iz = 0; iz < HF_H; iz++)
    for (let ix = 0; ix < HF_W; ix++) heights[hfIndex(ix, iz)] = naturalHeight(noise, hfX(ix), hfZ(iz));

  // Lanes: resample, then derive a smoothed road height profile from the natural terrain.
  const lanes: Lane[] = MAP.lanes.map((def, index) => {
    const { xs, zs } = resamplePath(def.points, LANE_STEP);
    const n = xs.length;
    const tx = new Float32Array(n);
    const tz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      const dx = xs[b]! - xs[a]!;
      const dz = zs[b]! - zs[a]!;
      const l = Math.hypot(dx, dz) || 1;
      tx[i] = dx / l;
      tz[i] = dz / l;
    }
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) raw[i] = sampleHeights(heights, xs[i]!, zs[i]!);
    const ys = new Float32Array(n);
    const win = 14;
    for (let i = 0; i < n; i++) {
      let s = 0;
      let c = 0;
      for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) {
        s += raw[j]!;
        c++;
      }
      ys[i] = Math.max(0.7, s / c);
    }
    return { index, def, xs, zs, tx, tz, ys, length: (n - 1) * LANE_STEP };
  });

  // The wall's foot: the ground along it is levelled to where the roads come in at the gate, and the
  // roads come in level with it.
  const wallY = lanes.reduce((s, l) => s + l.ys[l.ys.length - 1]!, 0) / lanes.length;
  for (const lane of lanes) {
    for (let i = 0; i < lane.ys.length; i++)
      lane.ys[i] = lerp(lane.ys[i]!, wallY, smoothstep(lane.length - 14, lane.length - 2, i * LANE_STEP));
  }
  for (let iz = 0; iz < HF_H; iz++) {
    const along = smoothstep(WALL.walkEnd + 5, WALL.walkEnd + 1, Math.abs(hfZ(iz)));
    if (along <= 0) continue;
    for (let ix = 0; ix < HF_W; ix++) {
      const d = Math.abs(hfX(ix) - WALL.x);
      if (d > 9) continue;
      const k = hfIndex(ix, iz);
      heights[k] = lerp(heights[k]!, wallY, smoothstep(9, WALL.half + 2.5, d) * along);
    }
  }

  // The town's streets: resampled like the roads, their walking height smoothed from the ground; the
  // high street leaves the gate level with the wall's foot.
  const streets = MAP.streets.map((st, si) => {
    const { xs, zs } = resamplePath(st.points, LANE_STEP);
    const n = xs.length;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) raw[i] = sampleHeights(heights, xs[i]!, zs[i]!);
    const ys = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      let c = 0;
      for (let j = Math.max(0, i - 10); j <= Math.min(n - 1, i + 10); j++) {
        s += raw[j]!;
        c++;
      }
      ys[i] = Math.max(0.7, s / c);
      if (si === 0) ys[i] = lerp(wallY, ys[i]!, smoothstep(2, 14, i * LANE_STEP));
    }
    return { xs, zs, ys, half: st.half };
  });

  // Flatten roads.
  const roadDist = new Float32Array(N).fill(1e9);
  const roadIdx = new Int32Array(N).fill(-1);
  const roadLane = new Int8Array(N).fill(-1);
  const tmpD = new Float32Array(N);
  const tmpI = new Int32Array(N);
  const reach = MAP.roadHalf + 4;
  for (const lane of lanes) {
    tmpD.fill(1e9);
    tmpI.fill(-1);
    stampDistance(lane.xs, lane.zs, reach, tmpD, tmpI);
    for (let k = 0; k < N; k++) {
      if (tmpD[k]! < roadDist[k]!) {
        roadDist[k] = tmpD[k]!;
        roadIdx[k] = tmpI[k]!;
        roadLane[k] = lane.index;
      }
    }
  }
  const road = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    if (roadIdx[k]! < 0) continue;
    const d = roadDist[k]!;
    const lane = lanes[roadLane[k]!]!;
    const half = lane.def.half;
    const target = lane.ys[roadIdx[k]!]! - 0.06;
    const w = smoothstep(half + 3.2, half - 0.2, d) * (lane.def.trail ? 0.55 : 1);
    heights[k] = lerp(heights[k]!, target, w);
    const ix = k % HF_W;
    const iz = (k / HF_W) | 0;
    const edge = half + 0.35 * noise.noise(hfX(ix) * 0.35, hfZ(iz) * 0.35);
    road[k] = Math.max(road[k]!, smoothstep(edge + 0.6, edge - 0.5, d) * (lane.def.trail ? 0.7 : 1));
  }
  // The streets, the same way (a touch narrower).
  for (const st of streets) {
    tmpD.fill(1e9);
    tmpI.fill(-1);
    stampDistance(st.xs, st.zs, st.half + 4, tmpD, tmpI);
    for (let k = 0; k < N; k++) {
      if (tmpI[k]! < 0) continue;
      const d = tmpD[k]!;
      heights[k] = lerp(heights[k]!, st.ys[tmpI[k]!]! - 0.06, smoothstep(st.half + 2.6, st.half - 0.2, d));
      const ix = k % HF_W;
      const iz = (k / HF_W) | 0;
      const edge = st.half + 0.3 * noise.noise(hfX(ix) * 0.35 + 11, hfZ(iz) * 0.35);
      road[k] = Math.max(road[k]!, smoothstep(edge + 0.5, edge - 0.45, d) * 0.92);
    }
  }

  // The river through our lands and the stream beyond the wall, and the lake.
  const carve = (path: { xs: Float32Array; zs: Float32Array }, base: number, bed: number, seed: number) => {
    const rDist = new Float32Array(N).fill(1e9);
    const rIdx = new Int32Array(N).fill(-1);
    stampDistance(path.xs, path.zs, base + 4, rDist, rIdx);
    for (let k = 0; k < N; k++) {
      if (rIdx[k]! < 0) continue;
      const ix = k % HF_W;
      const iz = (k / HF_W) | 0;
      const half =
        base +
        0.6 * (base / MAP.riverHalf) * noise.noise((hfX(ix) * 0.08) / WORLD + seed, (hfZ(iz) * 0.08) / WORLD);
      const w = smoothstep(half + 2.6, half - 0.8, rDist[k]!);
      heights[k] = lerp(heights[k]!, bed, w);
    }
  };
  const river = resamplePath(MAP.river, 0.5);
  carve(river, MAP.riverHalf, -1.3, 7);
  const brook = resamplePath(MAP.brook, 0.5);
  carve(brook, MAP.brookHalf, -1.1, 19);
  const L = MAP.lake;
  if (L.rx > 0 && L.rz > 0)
    for (let iz = 0; iz < HF_H; iz++) {
      for (let ix = 0; ix < HF_W; ix++) {
        const x = hfX(ix);
        const z = hfZ(iz);
        const e = Math.hypot((x - L.x) / L.rx, (z - L.z) / L.rz) + 0.12 * noise.noise(x * 0.3, z * 0.3);
        const w = smoothstep(1.35, 0.75, e);
        const k = hfIndex(ix, iz);
        heights[k] = lerp(heights[k]!, -1.1, w);
      }
    }

  // Bridges (roads and streets) and fords (trails) where they cross the water.
  const bridges: Bridge[] = [];
  const fords: Ford[] = [];
  const paths = [
    ...lanes.map((l) => ({ xs: l.xs, zs: l.zs, ys: l.ys, trail: !!l.def.trail })),
    ...streets.map((s) => ({ xs: s.xs, zs: s.zs, ys: s.ys, trail: false })),
  ];
  for (const [water, half] of [
    [river, MAP.riverHalf],
    [brook, MAP.brookHalf],
  ] as const) {
    for (const path of paths) {
      for (let i = 1; i < path.xs.length; i++) {
        for (let j = 1; j < water.xs.length; j++) {
          const p = segmentIntersect(
            path.xs[i - 1]!,
            path.zs[i - 1]!,
            path.xs[i]!,
            path.zs[i]!,
            water.xs[j - 1]!,
            water.zs[j - 1]!,
            water.xs[j]!,
            water.zs[j]!,
          );
          if (!p) continue;
          if (path.trail) {
            if (!fords.some((f) => dist(f.x, f.z, p.x, p.z) < 3))
              fords.push({ x: p.x, z: p.z, r: half + 2.2 });
          } else if (!bridges.some((b) => dist(b.x, b.z, p.x, p.z) < 3)) {
            const angle = Math.atan2(path.xs[i]! - path.xs[i - 1]!, path.zs[i]! - path.zs[i - 1]!);
            bridges.push({ x: p.x, z: p.z, angle, deckY: path.ys[i]!, length: half * 2 + 4 });
          }
        }
      }
    }
  }
  // Fords: a shallow, walkable riverbed.
  for (const f of fords) {
    for (let iz = 0; iz < HF_H; iz++) {
      for (let ix = 0; ix < HF_W; ix++) {
        const k = hfIndex(ix, iz);
        const d = dist(hfX(ix), hfZ(iz), f.x, f.z);
        if (d > f.r + 1) continue;
        heights[k] = Math.max(heights[k]!, lerp(-0.32, heights[k]!, smoothstep(f.r * 0.6, f.r + 1, d)));
      }
    }
  }
  // Trails follow the real ground (they wade through fords).
  for (const lane of lanes) {
    if (!lane.def.trail) continue;
    const n = lane.xs.length;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) raw[i] = sampleHeights(heights, lane.xs[i]!, lane.zs[i]!);
    for (let i = 0; i < n; i++) {
      let s2 = 0;
      let c = 0;
      for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) {
        s2 += raw[j]!;
        c++;
      }
      lane.ys[i] = s2 / c;
    }
  }

  // Blight: corruption spreading from the crypts.
  const blight = new Float32Array(N);
  for (let iz = 0; iz < HF_H; iz++) {
    for (let ix = 0; ix < HF_W; ix++) {
      const x = hfX(ix);
      const z = hfZ(iz);
      let b = 0;
      for (const lane of lanes) {
        const d = dist(x, z, lane.xs[0]!, lane.zs[0]!);
        b = Math.max(b, smoothstep(22, 5, d + 5 * noise.noise(x * 0.12, z * 0.12)));
      }
      b = Math.max(
        b,
        0.55 * smoothstep(w(68), w(86), x + 7 * noise.noise((x * 0.07) / WORLD, (z * 0.07) / WORLD + 3)),
      );
      blight[hfIndex(ix, iz)] = clamp(b, 0, 1);
    }
  }

  // Simulation cells.
  const cells = new Uint8Array(GRID_W * GRID_H);
  const laneDist = new Float32Array(GRID_W * GRID_H);
  const streetDist = new Float32Array(GRID_W * GRID_H);
  for (let cz = 0; cz < GRID_H; cz++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      const x = MAP.minX + cx + 0.5;
      const z = MAP.minZ + cz + 0.5;
      const k = cz * GRID_W + cx;
      let f = 0;
      let hmin = Infinity;
      let hmax = -Infinity;
      for (const [ox, oz] of [
        [-0.5, -0.5],
        [0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
        [0, 0],
      ] as const) {
        const h = sampleHeights(heights, x + ox, z + oz);
        hmin = Math.min(hmin, h);
        hmax = Math.max(hmax, h);
      }
      if (hmin < MAP.waterLevel + 0.25) f |= CELL.WATER;
      if (hmax - hmin > 0.55) f |= CELL.STEEP;
      if (edgeDist(x, z) < MAP.border - 1.5) f |= CELL.BORDER;
      let ld = Infinity;
      for (const lane of lanes) {
        for (let i = 0; i < lane.xs.length; i += 2) {
          const d = dist(x, z, lane.xs[i]!, lane.zs[i]!);
          if (d < ld) ld = d;
        }
      }
      laneDist[k] = ld;
      if (ld < MAP.roadHalf + 0.6) f |= CELL.ROAD;
      let sd = Infinity;
      for (const st of streets) {
        for (let i = 0; i < st.xs.length; i += 2) {
          const d = dist(x, z, st.xs[i]!, st.zs[i]!);
          if (d < sd) sd = d;
          if (d < st.half + 0.6) f |= CELL.ROAD;
        }
      }
      streetDist[k] = sd;
      if (fords.some((fd) => dist(x, z, fd.x, fd.z) < fd.r)) f &= ~CELL.WATER;
      if (dist(x, z, MAP.keep.x, MAP.keep.z) < MAP.keepRadius + 2) f |= CELL.NOBUILD;
      for (const lane of lanes) if (dist(x, z, lane.xs[0]!, lane.zs[0]!) < 12) f |= CELL.NOBUILD;
      for (const c of MAP.chests) if (dist(x, z, c.x, c.z) < 2.5) f |= CELL.NOBUILD;
      // The wall, its gate and its stairs; the walk on top of it.
      const wa = wallAt(x, z);
      if (wa) f |= CELL.WALL;
      if (wa === 'walk') f |= CELL.WALK;
      cells[k] = f;
    }
  }

  cached = {
    heights,
    road,
    blight,
    lanes,
    river,
    brook,
    streets,
    bridges,
    fords,
    cells,
    laneDist,
    streetDist,
    wallY,
  };
  return cached;
}

export function cellOf(x: number, z: number): { cx: number; cz: number } {
  return { cx: Math.floor(x - MAP.minX), cz: Math.floor(z - MAP.minZ) };
}

export function cellCenter(cx: number, cz: number): Vec2 {
  return { x: MAP.minX + cx + 0.5, z: MAP.minZ + cz + 0.5 };
}

export function inGrid(cx: number, cz: number): boolean {
  return cx >= 0 && cz >= 0 && cx < GRID_W && cz < GRID_H;
}

/** Position on a lane at arc distance d, offset sideways by `lat` metres. */
// Built lanes have at least two points and equally sized x/z/tangent/height buffers.
export function lanePos(
  lane: Lane,
  d: number,
  lat = 0,
): { x: number; z: number; y: number; tx: number; tz: number } {
  const f = clamp(d / LANE_STEP, 0, lane.xs.length - 1.001);
  const i = Math.floor(f);
  const k = f - i;
  const tx = lerp(lane.tx[i]!, lane.tx[i + 1]!, k);
  const tz = lerp(lane.tz[i]!, lane.tz[i + 1]!, k);
  const l = Math.hypot(tx, tz) || 1;
  // Normal = tangent rotated 90° (pointing to the lane's right).
  const nx = -tz / l;
  const nz = tx / l;
  return {
    x: lerp(lane.xs[i]!, lane.xs[i + 1]!, k) + nx * lat,
    z: lerp(lane.zs[i]!, lane.zs[i + 1]!, k) + nz * lat,
    y: lerp(lane.ys[i]!, lane.ys[i + 1]!, k),
    tx: tx / l,
    tz: tz / l,
  };
}

/** Arc distance along the lane and signed sideways offset (lanePos's `lat`) of a point. */
export function laneProject(lane: Lane, x: number, z: number): { d: number; lat: number } {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < lane.xs.length; i++) {
    const dx = lane.xs[i]! - x;
    const dz = lane.zs[i]! - z;
    const d = dx * dx + dz * dz;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return {
    d: best * LANE_STEP,
    lat: (x - lane.xs[best]!) * -lane.tz[best]! + (z - lane.zs[best]!) * lane.tx[best]!,
  };
}

/** Ground height for free-moving units (accounts for bridge decks; mines have a flat floor). */
/**
 * Stone bridges (see procmodels.stoneBridge): a deck `deckHalf` wide either side of the road's
 * middle, running `ends` past the river onto both banks, between parapets `rail` thick.
 */
export const BRIDGE = { deckHalf: MAP.roadHalf + 0.2, rail: 0.5, ends: 1.6 };

/** Bridge-local coordinates of (x, z): along the road and across it. */
function bridgeLocal(b: Bridge, x: number, z: number): { along: number; across: number } {
  const dx = x - b.x;
  const dz = z - b.z;
  return {
    along: dx * Math.sin(b.angle) + dz * Math.cos(b.angle),
    across: dx * Math.cos(b.angle) - dz * Math.sin(b.angle),
  };
}

/**
 * Is (x, z) on a bridge? 'deck': the one walking surface between the parapets; 'rail': the
 * parapets themselves (solid). `body` keeps a body of that radius off the parapets.
 */
export function deckAt(world: World, x: number, z: number, body = 0.13): 'deck' | 'rail' | null {
  for (const b of world.bridges) {
    const { along, across } = bridgeLocal(b, x, z);
    if (Math.abs(along) > b.length / 2 + BRIDGE.ends) continue;
    const a = Math.abs(across);
    if (a <= BRIDGE.deckHalf - body) return 'deck';
    if (a <= BRIDGE.deckHalf + BRIDGE.rail + body) return 'rail';
  }
  return null;
}

export function groundHeight(world: World, x: number, z: number): number {
  if (x > MINE_REGION_X) return world.excavatedFloor?.(x, z) ?? 0;
  // In Space: its own dunes and craters.
  if (inSpace(z)) return spaceHeight(x, z);
  // Indoors: the room's floor (up the stairs, on the loft).
  if (x < INTERIOR_REGION_X) return roomFloorAt(x, z);
  // Up on the wall: its walk, or a stair up to it.
  if (Math.abs(x - WALL.x) < WALL.half + 2.5) {
    const wa = wallAt(x, z);
    if (wa === 'walk' || wa === 'stair') return world.wallY + wallFloor(x, z);
  }
  let h = world.excavatedFloor?.(x, z) ?? sampleHeights(world.heights, x, z);
  for (const b of world.bridges) {
    const { along, across } = bridgeLocal(b, x, z);
    if (Math.abs(along) <= b.length / 2 + BRIDGE.ends && Math.abs(across) <= BRIDGE.deckHalf + BRIDGE.rail)
      h = Math.max(h, b.deckY);
  }
  return h;
}

/** How deep the water is at (x, z): 0 on land and on bridges. */
export function waterDepth(world: World, x: number, z: number): number {
  if (x > MINE_REGION_X || x < INTERIOR_REGION_X || inSpace(z)) return 0;
  return Math.max(0, MAP.waterLevel - groundHeight(world, x, z));
}
