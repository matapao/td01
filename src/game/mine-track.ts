/** Deterministic authored rail tracks and their interpolation. */
import type { Vec2 } from './path-resampling.ts';
import type { LineSpec } from './mine-line-data.ts';
import type { MineLine, TrackPoint, TrackPiece } from './mine-types.ts';
import { MINE_AT, STATION, TRACK, PATH_STEP, END_GAP } from './mine-parameters.ts';
const DIRS: readonly [Vec2, Vec2, Vec2, Vec2] = [
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
  { x: 0, z: -1 },
];

export function layLine(id: number, spec: LineSpec): MineLine {
  const h = DIRS[spec.dir];
  let x = MINE_AT.x + h.x * STATION.platform;
  let z = MINE_AT.z + h.z * STATION.platform;
  let hx = h.x;
  let hz = h.z;
  let d = 0;
  const pieces: TrackPiece[] = [];
  const pts: TrackPoint[] = [{ x, z, tx: hx, tz: hz }];
  let carry = 0;
  const along = (len: number, at: (s: number) => TrackPoint) => {
    // A point every PATH_STEP from the line's start (carried over from piece to piece).
    let s = PATH_STEP - carry;
    for (; s <= len + 1e-9; s += PATH_STEP) pts.push(at(s));
    carry = len - (s - PATH_STEP);
  };
  for (const c of spec.track.replace(/\s+/g, '')) {
    if (c === 'P' || c === 'S') {
      const len = c === 'P' ? TRACK.station : TRACK.straight;
      pieces.push({ kind: c === 'P' ? 'station' : 'straight', x, z, hx, hz, right: false, d });
      const sx = x;
      const sz = z;
      along(len, (s) => ({ x: sx + hx * s, z: sz + hz * s, tx: hx, tz: hz }));
      x += hx * len;
      z += hz * len;
      d += len;
    } else {
      const right = c === 'R';
      const R = TRACK.radius;
      // To the right of heading (hx, hz) is (−hz, hx).
      const nx = right ? -hz : hz;
      const nz = right ? hx : -hx;
      pieces.push({ kind: 'curve', x, z, hx, hz, right, d });
      const cx = x + nx * R;
      const cz = z + nz * R;
      const shx = hx;
      const shz = hz;
      along((Math.PI / 2) * R, (s) => {
        const a = s / R;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        return {
          x: cx - nx * R * ca + shx * R * sa,
          z: cz - nz * R * ca + shz * R * sa,
          tx: shx * ca + nx * sa,
          tz: shz * ca + nz * sa,
        };
      });
      x = cx + shx * R;
      z = cz + shz * R;
      hx = nx;
      hz = nz;
      d += (Math.PI / 2) * R;
    }
  }
  return {
    id,
    name: spec.name,
    mineral: spec.mineral,
    color: spec.color,
    pieces,
    path: pts,
    length: d,
    stopI: spec.stopI,
    stopII: d - END_GAP,
    chambers: [-1, -1],
  };
}

/** The line's middle at distance d along it (clamped to the line), and which way it runs. */
export function pathAt(line: MineLine, d: number): TrackPoint {
  const p = line.path;
  const f = Math.max(0, Math.min(p.length - 1, d / PATH_STEP));
  const i = Math.min(p.length - 2, Math.floor(f));
  const t = f - i;
  if (p.length < 2) throw new Error('A mine line needs two path points');
  // Clamping above keeps both interpolation endpoints within the authored line.
  const a = p[i]!;
  const b = p[i + 1]!;
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    tx: a.tx + (b.tx - a.tx) * t,
    tz: a.tz + (b.tz - a.tz) * t,
  };
}

/** A point (along, aside) from distance d on a line, in the world (aside > 0: to the right of it, heading out). */
export function offset(line: MineLine, d: number, along: number, aside: number): Vec2 {
  const p = pathAt(line, d);
  // The frame is the line's at d (chambers sit on straight stretches, or at the line's end).
  return { x: p.x + p.tx * along - p.tz * aside, z: p.z + p.tz * along + p.tx * aside };
}
