/** Builds one continuous painted mine tile from the current field. */
import * as THREE from 'three';
import {
  DIG,
  MINERALS,
  cellRock,
  digBlocker,
  digCellAt,
  digCenter,
  mineNow,
  mineRoof,
  MINE_AT,
  STATION,
  type Mine,
  type MineLayout,
  type MineralId,
} from '../game/mines.ts';
import { geometryAttribute } from './geometry-attributes.ts';
import {
  vnoise,
  h01,
  lightColor,
  BALLAST,
  ROCK,
  ROCK2,
  FLOOR,
  FLOOR2,
  STAIN,
  ORE,
  METAL,
  HOLE,
  COAL_LUMP,
  FRESH,
  type Lamp,
  type Bed,
} from './mine-paint.ts';
type Vec3 = [number, number, number];
const Y = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
// Tile arrays match the mine lattice. Marching cells address four corners, paired intersections, and bounded polygon fans.
/** What a tile of rock is built from: the mine's field as it is now (dents and all) and its light. */
export interface TileJob {
  L: MineLayout;
  m: Mine | undefined;
  /** Pieces being struck now (their dents look fresh too). */
  struck: Set<number>;
  /** The field as it is now, with the dents of the strikes on it (view only). */
  sdf: Float32Array;
  i0: number;
  i1: number;
  j0: number;
  j1: number;
  lamps: Lamp[];
  beds: Bed;
}

export interface TileOut {
  rock: THREE.BufferGeometry | null;
  /** The gems' crystals (drawn unlit, in their own colours) and where they glow. */
  gems: THREE.BufferGeometry | null;
  glows: { x: number; y: number; z: number; color: THREE.Color }[];
}

const crystal = (() => {
  const body = new THREE.CylinderGeometry(0.035, 0.05, 0.2, 6, 1).translate(0, 0.1, 0);
  const tip = new THREE.ConeGeometry(0.035, 0.08, 6).translate(0, 0.24, 0);
  return [body.toNonIndexed(), tip.toNonIndexed()];
})();
const lumpGeo = new THREE.IcosahedronGeometry(1, 0);
const chunkGeo = new THREE.DodecahedronGeometry(1, 0);

/** One tile of the mine's rock (floor, walls, roof, and what shows in it), built from its field. */
export function buildTile(job: TileJob): TileOut {
  const { L, m, sdf } = job;
  const f = L.field;
  const S = 2;
  const stepM = f.step * S;
  const val = (I: number, J: number) => sdf[J * S * f.nx + I * S]!;
  const px = (I: number) => f.x0 + I * stepM;
  const pz = (J: number) => f.z0 + J * stepM;
  const at = (x: number, z: number): number => {
    const fx = (x - f.x0) / f.step;
    const fz = (z - f.z0) / f.step;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= f.nx - 1 || j >= f.nz - 1) return 9;
    const u = fx - i;
    const v = fz - j;
    const k = j * f.nx + i;
    const a0 = sdf[k]! + (sdf[k + 1]! - sdf[k]!) * u;
    const a1 = sdf[k + f.nx]! + (sdf[k + f.nx + 1]! - sdf[k + f.nx]!) * u;
    return a0 + (a1 - a0) * v;
  };
  const pos: number[] = [];
  const col: number[] = [];
  /** The light painted on each vertex (its colour is the rock's own; the shader puts the two together). */
  const lits: number[] = [];
  /** Ore that glints in the dark (1), or plain rock (0), per vertex. */
  const glints: number[] = [];
  let glint = 0;
  const grad = (x: number, z: number): [number, number] => {
    const e = 0.2;
    const gx = at(x + e, z) - at(x - e, z);
    const gz = at(x, z + e) - at(x, z - e);
    const l = Math.hypot(gx, gz) || 1;
    return [gx / l, gz / l];
  };
  /** Where a point of the rock really is: jittered, the walls pushed back in chunks, the roof up. */
  const warp = (x: number, y: number, z: number, out: Vec3) => {
    const n1 = vnoise(x * 1.9, y * 1.9, z * 1.9) - 0.5;
    const n2 = vnoise(x * 1.9 + 31, y * 1.9 + 7, z * 1.9 - 11) - 0.5;
    const n3 = vnoise(x * 1.9 - 17, y * 1.9 + 23, z * 1.9 + 5) - 0.5;
    const s = at(x, z);
    const wall = Math.max(0, Math.min(1, 1 + s / 0.6));
    const [gx, gz] = grad(x, z);
    // Blast scallops: chunky hollows pushed back into the rock.
    const ridge = Math.abs(vnoise(x * 0.9 + 3, y * 1.3, z * 0.9 - 2) - 0.5) * 2;
    const back = (0.06 + 0.24 * ridge) * wall;
    const up =
      y > 0.3
        ? (0.05 + 0.16 * Math.abs(vnoise(x * 1.1 - 5, 0.5, z * 1.1 + 9) - 0.5) * 2) *
          Math.min(1, (y - 0.3) / 0.6)
        : 0;
    const flat = y < 0.02 ? 0 : 1;
    out[0] = x + n1 * 0.22 + gx * back;
    out[1] = y + (n2 * 0.16 + up) * flat;
    out[2] = z + n3 * 0.22 + gz * back;
  };
  const roofAt = (x: number, z: number) => mineRoof(m, x, z);
  const tmp: Vec3 = [0, 0, 0];
  const lit = new THREE.Color();
  /** Has rock been broken away (or struck) right here? Fresh rock is raw and pale. */
  const dugNow = m ? mineNow(m).dug : null;
  const fresh = (x: number, z: number): number => {
    if (!dugNow && !job.struck.size) return 0;
    const k0 = digCellAt(x, z);
    if (k0 < 0) return 0;
    let best = 0;
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        const k = k0 + dj * L.dig.nx + di;
        if (k < 0 || k >= L.dig.zone.length || !(dugNow?.[k] || job.struck.has(k))) continue;
        const c = digCenter(k);
        best = Math.max(best, 1 - Math.hypot(c.x - x, c.z - z) / 0.95);
      }
    }
    return best;
  };
  /** What the rock behind a point of the wall is (the piece of it there), if workable: its mineral. */
  const mineralBehind = (x: number, z: number): number => {
    const [gx, gz] = grad(x, z);
    const k = digCellAt(x + gx * 0.22, z + gz * 0.22);
    return k >= 0 && L.dig.zone[k]! >= 0 ? L.dig.mineral[k]! : 0;
  };
  const colour = (x: number, y: number, z: number, floor: boolean, ceil: boolean) => {
    const n = vnoise(x * 0.8, y * 2.2, z * 0.8);
    const band = Math.sin(y * 5.2 + vnoise(x * 0.3, 0, z * 0.3) * 6) * 0.5 + 0.5;
    if (floor) {
      glint = 0;
      tmpC.copy(FLOOR).lerp(FLOOR2, vnoise(x * 1.3, 0, z * 1.3) * 0.8);
      // The track's bed: darker, packed ballast under the sleepers.
      if (job.beds.near(x, z) < 0.5) tmpC.lerp(BALLAST, 0.75);
    } else {
      glint = 0;
      tmpC.copy(ROCK).lerp(ROCK2, n * 0.7 + band * 0.25);
      // The mineral in the rock here: its stain in streaks through the rock, the ore glinting in it.
      const min = at(x, z) > -0.7 ? mineralBehind(x, z) : 0;
      if (min) {
        const streak =
          0.5 + 0.5 * Math.sin(y * 6.3 + x * 1.7 + z * 1.3 + vnoise(x * 1.6, y * 1.6, z * 1.6) * 4);
        tmpC.lerp(STAIN[min]!, min === 1 ? 0.8 : 0.45 + 0.35 * streak);
        if (METAL.has(min) && vnoise(x * 5.5, y * 5.5, z * 5.5) > 0.74) {
          tmpC.lerp(ORE[min]!, 0.85);
          glint = 1;
        }
      }
      // Freshly broken rock: raw and pale, so you see where the wall has given.
      const fr = at(x, z) > -0.6 ? fresh(x, z) : 0;
      if (fr > 0) tmpC.lerp(FRESH, Math.min(0.6, fr * 0.75));
    }
    if (ceil) tmpC.multiplyScalar(0.8);
    // Darker down where the walls meet the floor.
    const ao = floor ? 0.8 + 0.2 * Math.min(1, -at(x, z) / 0.8) : 1;
    lightColor(job.lamps, x, y, z, lit);
    lit.multiplyScalar(ao * 1.25);
    return tmpC;
  };
  const vert = (x: number, y: number, z: number, kind: 0 | 1 | 2) => {
    warp(x, y, z, tmp);
    pos.push(tmp[0], tmp[1], tmp[2]);
    const c = colour(tmp[0], tmp[1], tmp[2], kind === 0, kind === 2);
    col.push(c.r, c.g, c.b);
    lits.push(lit.r, lit.g, lit.b);
    glints.push(glint);
  };
  /** A triangle facing `want` (+1 up, −1 down) — or toward (nx, nz) for walls (want 0). */
  const tri = (a: Vec3, b: Vec3, c: Vec3, want: number, kind: 0 | 1 | 2, nx = 0, nz = 0) => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0]! - a[0];
    const vy = c[1]! - a[1];
    const vz = c[2]! - a[2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    const face = want !== 0 ? cy * want : cx * nx + cz * nz;
    const [p, q, r] = face >= 0 ? ([a, b, c] as const) : ([a, c, b] as const);
    vert(p[0], p[1], p[2], kind);
    vert(q[0], q[1], q[2], kind);
    vert(r[0], r[1], r[2], kind);
  };
  const cross = (Ia: number, Ja: number, Ib: number, Jb: number): [number, number] => {
    const va = val(Ia, Ja);
    const vb = val(Ib, Jb);
    const t = va / (va - vb);
    return [px(Ia) + (px(Ib) - px(Ia)) * t, pz(Ja) + (pz(Jb) - pz(Ja)) * t];
  };
  const mx = Math.floor((f.nx - 1) / S);
  const mz = Math.floor((f.nz - 1) / S);
  for (let J = job.j0; J < Math.min(job.j1, mz); J++) {
    for (let I = job.i0; I < Math.min(job.i1, mx); I++) {
      const cs: [number, number][] = [
        [I, J],
        [I + 1, J],
        [I + 1, J + 1],
        [I, J + 1],
      ];
      const v = cs.map(([a, b]) => val(a, b));
      const inn = v.map((x) => x < 0);
      const count = inn.filter(Boolean).length;
      if (count === 0) continue;
      // The open part of the cell (one polygon, or two at a saddle whose middle is rock).
      const polys: [number, number][][] = [];
      const segs: [[number, number], [number, number]][] = [];
      const e = (k: number): [number, number] => {
        const a = cs[k]!;
        const b = cs[(k + 1) % 4]!;
        return cross(a[0], a[1], b[0], b[1]);
      };
      const corner = (k: number): [number, number] => [px(cs[k]![0]), pz(cs[k]![1])];
      const saddle = count === 2 && inn[0] === inn[2];
      const midIn = (v[0]! + v[1]! + v[2]! + v[3]!) / 4 < 0;
      if (saddle && !midIn) {
        const a = inn[0] ? 0 : 1;
        const c = a + 2;
        polys.push([corner(a), e(a), e((a + 3) % 4)], [corner(c), e(c), e((c + 3) % 4)]);
        segs.push([e((a + 3) % 4), e(a)], [e((c + 3) % 4), e(c)]);
      } else {
        const poly: [number, number][] = [];
        const xs: [number, number][] = [];
        for (let k = 0; k < 4; k++) {
          if (inn[k]) poly.push(corner(k));
          if (inn[k] !== inn[(k + 1) % 4]) {
            const p = e(k);
            poly.push(p);
            xs.push(p);
          }
        }
        polys.push(poly);
        if (xs.length === 2) segs.push([xs[0]!, xs[1]!]);
        else if (xs.length === 4) {
          // A saddle whose middle is open: the rock is cut off at the two outside corners.
          const out = inn[0] ? 1 : 0;
          segs.push([e((out + 3) % 4), e(out)], [e(out + 1), e((out + 2) % 4)]);
        }
      }
      // Floor and roof (open over the lift, where its shaft goes up).
      for (const poly of polys) {
        for (let k = 1; k + 1 < poly.length; k++) {
          const a = poly[0]!;
          const b = poly[k]!;
          const c = poly[k + 1]!;
          tri([a[0], 0, a[1]], [b[0], 0, b[1]], [c[0]!, 0, c[1]!], 1, 0);
          const cx = (a[0] + b[0] + c[0]!) / 3;
          const cz = (a[1] + b[1] + c[1]!) / 3;
          if (Math.hypot(cx - MINE_AT.x, cz - MINE_AT.z) < STATION.shaft) continue;
          tri(
            [a[0], roofAt(a[0], a[1]), a[1]],
            [b[0], roofAt(b[0], b[1]), b[1]],
            [c[0]!, roofAt(c[0]!, c[1]!), c[1]!],
            -1,
            2,
          );
        }
      }
      // Walls, standing up from the floor to where the roof begins.
      for (const [a, b] of segs) {
        const ha = roofAt(a[0], a[1]);
        const hb = roofAt(b[0], b[1]);
        const rows = Math.max(3, Math.ceil(Math.max(ha, hb) / 0.34));
        const [gx, gz] = grad((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        for (let r = 0; r < rows; r++) {
          const y0a = (ha * r) / rows;
          const y1a = (ha * (r + 1)) / rows;
          const y0b = (hb * r) / rows;
          const y1b = (hb * (r + 1)) / rows;
          tri([a[0], y0a, a[1]], [b[0], y0b, b[1]], [b[0], y1b, b[1]], 0, 1, -gx, -gz);
          tri([a[0], y0a, a[1]], [b[0], y1b, b[1]], [a[0], y1a, a[1]], 0, 1, -gx, -gz);
        }
      }
    }
  }
  // What stands out of the rock where it can be worked: lumps of ore, crystals of gem, drill holes.
  const gemPos: number[] = [];
  const gemCol: number[] = [];
  const glows: TileOut['glows'] = [];
  const addMesh = (
    src: THREE.BufferGeometry,
    m4: THREE.Matrix4,
    c: THREE.Color,
    intoPos: number[],
    intoCol: number[],
    light?: THREE.Color,
    shine = 0,
  ) => {
    const p = geometryAttribute(src, 'position');
    for (let i = 0; i < p.count; i++) {
      tmpV.fromBufferAttribute(p, i).applyMatrix4(m4);
      intoPos.push(tmpV.x, tmpV.y, tmpV.z);
      intoCol.push(c.r, c.g, c.b);
      if (intoPos === pos) {
        lits.push(light?.r ?? 1, light?.g ?? 1, light?.b ?? 1);
        glints.push(shine);
      }
    }
  };
  /** A small disc on the wall at p facing (ox, oz) out of the rock (vertex coloured). */
  const disc = (p: Vec3, ox: number, oz: number, r: number, c: THREE.Color) => {
    const tx = -oz;
    const tz = ox;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const q0: Vec3 = [p[0] + tx * Math.cos(a0) * r, p[1] + Math.sin(a0) * r, p[2] + tz * Math.cos(a0) * r];
      const q1: Vec3 = [p[0] + tx * Math.cos(a1) * r, p[1] + Math.sin(a1) * r, p[2] + tz * Math.cos(a1) * r];
      // Facing out of the rock.
      const ux = q0[0] - p[0];
      const uy = q0[1] - p[1];
      const uz = q0[2] - p[2];
      const vx = q1[0] - p[0];
      const vy = q1[1] - p[1];
      const vz = q1[2] - p[2];
      const nx = uy * vz - uz * vy;
      const nz = ux * vy - uy * vx;
      const order = nx * ox + nz * oz >= 0 ? [p, q0, q1] : [p, q1, q0];
      for (const q of order) {
        pos.push(q[0], q[1], q[2]);
        col.push(c.r, c.g, c.b);
        lits.push(1, 1, 1);
        glints.push(0);
      }
    }
  };
  if (m && dugNow) {
    // What came away lies where it fell: a chunk or two of it on the floor below each broken piece.
    const k0x = Math.floor((px(job.i0) - f.x0) / DIG);
    const k1x = Math.ceil((px(job.i1) - f.x0) / DIG);
    const k0z = Math.floor((pz(job.j0) - f.z0) / DIG);
    const k1z = Math.ceil((pz(job.j1) - f.z0) / DIG);
    for (let J = Math.max(0, k0z); J < Math.min(L.dig.nz, k1z); J++) {
      for (let I = Math.max(0, k0x); I < Math.min(L.dig.nx, k1x); I++) {
        const k = J * L.dig.nx + I;
        if (!dugNow[k]) continue;
        const c = digCenter(k);
        const min = L.dig.mineral[k]! as MineralId;
        for (let q = 0; q < 2; q++) {
          if (q && h01(k, 70) < 0.5) continue;
          const a = h01(k, 71 + q) * Math.PI * 2;
          const x = c.x + Math.cos(a) * 0.22;
          const z = c.z + Math.sin(a) * 0.22;
          if (at(x, z) > -0.08) continue;
          const size = 0.05 + h01(k, 73 + q) * 0.06;
          const m4 = new THREE.Matrix4().compose(
            tmpV.set(x, size * 0.45, z),
            tmpQ.setFromEuler(new THREE.Euler(h01(k, 75 + q) * 6, h01(k, 77 + q) * 6, 0)),
            tmpS.set(size * 1.2, size * 0.75, size),
          );
          lightColor(job.lamps, x, 0.1, z, lit);
          const cc = tmpC
            .copy(min && !MINERALS[min].gem ? STAIN[min]! : FRESH)
            .lerp(ROCK2, 0.3)
            .multiplyScalar(1.15);
          addMesh(chunkGeo, m4, cc, pos, col, lit);
        }
      }
    }
  }
  if (m) {
    const k0x = Math.floor((px(job.i0) - f.x0) / DIG);
    const k1x = Math.ceil((px(job.i1) - f.x0) / DIG);
    const k0z = Math.floor((pz(job.j0) - f.z0) / DIG);
    const k1z = Math.ceil((pz(job.j1) - f.z0) / DIG);
    for (let J = Math.max(0, k0z); J < Math.min(L.dig.nz, k1z); J++) {
      for (let I = Math.max(0, k0x); I < Math.min(L.dig.nx, k1x); I++) {
        const k = J * L.dig.nx + I;
        if (L.dig.zone[k]! < 0 || !cellRock(m, k) || digBlocker(m, k)) continue;
        const c = digCenter(k);
        // Its face: from its middle back out to the open rock face.
        const [gx, gz] = grad(c.x, c.z);
        let s = 0;
        while (s < 0.8 && at(c.x - gx * s, c.z - gz * s) >= 0) s += 0.04;
        const bx = c.x - gx * s;
        const bz = c.z - gz * s;
        const min = L.dig.mineral[k]! as MineralId;
        const r = (salt: number) => h01(k, salt);
        if (MINERALS[min].gem) {
          // A cluster of crystals growing out of the rock, glowing.
          for (let q = 0; q < 3; q++) {
            const y = 0.45 + r(q) * 0.75;
            warp(bx - gz * (r(q + 9) - 0.5) * 0.3, y, bz + gx * (r(q + 9) - 0.5) * 0.3, tmp);
            const out = new THREE.Vector3(
              -gx + (r(q + 3) - 0.5) * 0.9,
              0.35 + r(q + 4) * 0.6,
              -gz + (r(q + 5) - 0.5) * 0.9,
            ).normalize();
            const m4 = new THREE.Matrix4().compose(
              tmpV.set(tmp[0] + gx * 0.05, tmp[1], tmp[2] + gz * 0.05),
              tmpQ.setFromUnitVectors(Y, out),
              tmpS.setScalar(0.9 + r(q + 6) * 0.8),
            );
            const cc = tmpC.copy(ORE[min]!).multiplyScalar(0.85 + 0.3 * r(q + 7));
            for (const part of crystal) addMesh(part, m4, cc, gemPos, gemCol);
          }
          warp(bx, 0.8, bz, tmp);
          glows.push({ x: tmp[0] - gx * 0.2, y: 0.8, z: tmp[2] - gz * 0.2, color: ORE[min]! });
        } else if (min !== 0) {
          // Lumps of the ore standing out of the face.
          for (let q = 0; q < 2; q++) {
            const y = 0.3 + r(q) * 1.0;
            warp(bx - gz * (r(q + 9) - 0.5) * 0.36, y, bz + gx * (r(q + 9) - 0.5) * 0.36, tmp);
            const size = (min === 1 ? 0.075 : 0.06) + r(q + 2) * 0.04;
            const m4 = new THREE.Matrix4().compose(
              tmpV.set(tmp[0] + gx * 0.03, tmp[1], tmp[2] + gz * 0.03),
              tmpQ.setFromEuler(new THREE.Euler(r(q + 3) * 6, r(q + 4) * 6, 0)),
              tmpS.set(size, size * 0.8, size),
            );
            lightColor(job.lamps, tmp[0], tmp[1], tmp[2], lit);
            // (Coal as charcoal-grey lumps with a sheen, so they read as lumps, not holes.)
            const cc = (min === 1 ? tmpC.copy(COAL_LUMP) : tmpC.copy(ORE[min]!)).multiplyScalar(
              min === 1 ? 1.2 : 1.45,
            );
            addMesh(min === 1 ? chunkGeo : lumpGeo, m4, cc, pos, col, lit, METAL.has(min) ? 1 : 0);
          }
        }
        // Drill holes for the next round, here and there.
        if (r(40) < 0.16) {
          for (let q = 0; q < 3; q++) {
            warp(bx, 0.4 + q * 0.38, bz, tmp);
            disc([tmp[0] - gx * 0.02, tmp[1], tmp[2] - gz * 0.02], -gx, -gz, 0.032, HOLE);
          }
        }
      }
    }
  }
  const geo = (p: number[], c: number[], l?: number[], gl?: number[]) => {
    if (!p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    if (l) g.setAttribute('aLit', new THREE.Float32BufferAttribute(l, 3));
    if (gl) g.setAttribute('aGlint', new THREE.Float32BufferAttribute(gl, 1));
    g.computeBoundingSphere();
    return g;
  };
  return { rock: geo(pos, col, lits, glints), gems: geo(gemPos, gemCol), glows };
}
