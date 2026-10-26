// Both leaf palettes contain TREE_VARIANTS entries, indexed by the variant loop.
import { geometryAttribute } from './geometry-attributes.ts';
// Tube indices clamp to a checked nonempty spine; generated trunks/branches contain n + 1 points (n >= 3).
/**
 * Stylized trees generated in code (no downloads): oaks with crooked trunks, branches and lumpy
 * leaf clumps; layered, drooping pines; slender birches; bare dead trees; stumps. Vertex colours
 * carry the painted look (dark undersides, sunlit tops, colour drift per clump). Each tree is about
 * one unit tall and two meshes (bark + leaves), so the scenery instances them like any kit model.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

function rngOf(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tmp = new THREE.Color();

function paint(
  geo: THREE.BufferGeometry,
  color: (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color,
  keepNormals = false,
): THREE.BufferGeometry {
  const pos = geometryAttribute(geo, 'position');
  if (!keepNormals || !geo.attributes['normal']) geo.computeVertexNormals();
  const nor = geometryAttribute(geo, 'normal');
  const cols = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const c = color(p, n);
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

/** A tapered tube along a list of spine points (rings of `sides` vertices). */
function tube(
  spine: THREE.Vector3[],
  r0: number,
  r1: number,
  sides: number,
  flare = 0,
): THREE.BufferGeometry {
  if (spine.length < 2) throw new Error('A tree tube needs at least two spine points');
  const pos: number[] = [];
  const idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < spine.length; i++) {
    const t = i / (spine.length - 1);
    const dir = spine[Math.min(spine.length - 1, i + 1)]!.clone()
      .sub(spine[Math.max(0, i - 1)]!)
      .normalize();
    const side =
      Math.abs(dir.y) > 0.95
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3().crossVectors(dir, up).normalize();
    const fwd = new THREE.Vector3().crossVectors(side, dir).normalize();
    let r = r0 + (r1 - r0) * t;
    if (flare && i === 0) r *= 1 + flare;
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const o = side
        .clone()
        .multiplyScalar(Math.cos(a) * r)
        .addScaledVector(fwd, Math.sin(a) * r);
      pos.push(spine[i]!.x + o.x, spine[i]!.y + o.y, spine[i]!.z + o.z);
    }
  }
  for (let i = 0; i < spine.length - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * sides + k;
      const b = i * sides + ((k + 1) % sides);
      const c = (i + 1) * sides + k;
      const d = (i + 1) * sides + ((k + 1) % sides);
      idx.push(a, c, b, b, c, d);
    }
  }
  // Cap the top.
  const top = pos.length / 3;
  const e = spine[spine.length - 1]!;
  pos.push(e.x, e.y, e.z);
  for (let k = 0; k < sides; k++)
    idx.push((spine.length - 1) * sides + k, top, (spine.length - 1) * sides + ((k + 1) % sides));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g.toNonIndexed();
}

/** A bent spine from `from` heading `dir`, `n` segments. */
function spine(
  from: THREE.Vector3,
  dir: THREE.Vector3,
  len: number,
  n: number,
  bend: number,
  rnd: () => number,
): THREE.Vector3[] {
  const pts = [from.clone()];
  const d = dir.clone().normalize();
  const p = from.clone();
  for (let i = 1; i <= n; i++) {
    d.x += (rnd() - 0.5) * bend;
    d.z += (rnd() - 0.5) * bend;
    d.normalize();
    p.addScaledVector(d, len / n);
    pts.push(p.clone());
  }
  return pts;
}

/** A lumpy leaf clump (an icosphere pushed about), coloured dark below and sunlit on top. */
function clump(center: THREE.Vector3, r: number, base: THREE.Color, rnd: () => number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const pos = geometryAttribute(g, 'position');
  const v = new THREE.Vector3();
  // Push vertices in and out, consistently for shared corners (hash by position).
  const bumps = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let b = bumps.get(key);
    if (b === undefined) bumps.set(key, (b = 0.82 + rnd() * 0.36));
    v.multiplyScalar(b);
    v.y *= 0.78;
    pos.setXYZ(i, v.x + center.x, v.y + center.y, v.z + center.z);
  }
  const hue = (rnd() - 0.5) * 0.05;
  const lit = 0.85 + rnd() * 0.3;
  // Weld the corners so the clump shades smooth and painterly, not faceted.
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const smooth = mergeVertices(g, 1e-4);
  smooth.computeVertexNormals();
  return paint(
    smooth.toNonIndexed(),
    (_p, n) => {
      const up = Math.max(0, n.y);
      const below = Math.max(0, -n.y);
      return tmp
        .copy(base)
        .offsetHSL(hue, 0, 0)
        .multiplyScalar(lit * (0.72 + 0.45 * up - 0.25 * below));
    },
    true,
  );
}

const BARK = new THREE.Color('#5a3d26');

function barkPaint(
  g: THREE.BufferGeometry,
  color: THREE.Color,
  rnd: () => number,
  bands = false,
): THREE.BufferGeometry {
  const v = 0.85 + rnd() * 0.25;
  return paint(g, (p, n) => {
    const stripe = bands && Math.sin(p.y * 60 + p.x * 9) > 0.82 ? 0.35 : 1;
    return tmp.copy(color).multiplyScalar(v * stripe * (0.8 + 0.25 * Math.max(0, n.y)));
  });
}

function oak(seed: number, leaf: string): THREE.Group {
  const rnd = rngOf(seed);
  const bark: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const h = 0.38 + rnd() * 0.08;
  const trunk = spine(
    new THREE.Vector3(),
    new THREE.Vector3((rnd() - 0.5) * 0.15, 1, (rnd() - 0.5) * 0.15),
    h,
    5,
    0.25,
    rnd,
  );
  bark.push(barkPaint(tube(trunk, 0.052, 0.03, 9, 0.7), BARK, rnd));
  const top = trunk[trunk.length - 1]!;
  const base = new THREE.Color(leaf);
  const tips: THREE.Vector3[] = [top.clone()];
  const nb = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + rnd() * 0.8;
    const from = trunk[3 + Math.floor(rnd() * 2)]!;
    const dir = new THREE.Vector3(Math.cos(a), 0.55 + rnd() * 0.5, Math.sin(a));
    const br = spine(from, dir, 0.16 + rnd() * 0.14, 3, 0.4, rnd);
    bark.push(barkPaint(tube(br, 0.024, 0.01, 6), BARK, rnd));
    tips.push(br[br.length - 1]!);
  }
  // The crown sits up on the trunk: you see the trunk, and walk under the leaves.
  for (const t of tips) {
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const r = 0.1 + rnd() * 0.08;
      const c = t
        .clone()
        .add(new THREE.Vector3((rnd() - 0.5) * 0.16, 0.03 + rnd() * 0.12, (rnd() - 0.5) * 0.16));
      c.y = Math.max(c.y, 0.3 + r);
      leaves.push(clump(c, r, base, rnd));
    }
  }
  // Crown top.
  for (let i = 0; i < 4; i++)
    leaves.push(
      clump(
        top.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.2, 0.16 + rnd() * 0.12, (rnd() - 0.5) * 0.2)),
        0.12 + rnd() * 0.06,
        base,
        rnd,
      ),
    );
  return assemble(bark, leaves);
}

function pine(seed: number): THREE.Group {
  const rnd = rngOf(seed);
  const h = 0.92 + rnd() * 0.12;
  const bark = [
    barkPaint(
      tube(spine(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), h, 4, 0.05, rnd), 0.035, 0.008, 7, 0.6),
      new THREE.Color('#4e3524'),
      rnd,
    ),
  ];
  const leaves: THREE.BufferGeometry[] = [];
  const tiers = 6 + Math.floor(rnd() * 3);
  const deep = new THREE.Color('#1f4a2c');
  const light = new THREE.Color('#3f7a3a');
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = 0.27 * (1 - t * 0.8) * (0.9 + rnd() * 0.2);
    // The lowest boughs start well up the trunk, so it shows.
    const y = 0.42 + t * (h - 0.46);
    const cone = new THREE.ConeGeometry(r, 0.2 + (1 - t) * 0.08, 10, 2).toNonIndexed();
    const pos = geometryAttribute(cone, 'position');
    const v = new THREE.Vector3();
    const droop = new Map<string, number>();
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      const rim = Math.hypot(v.x, v.z) / r;
      if (rim > 0.6) {
        // A ragged, drooping lower edge: each corner hangs a different amount.
        const key = `${v.x.toFixed(3)},${v.z.toFixed(3)}`;
        let d = droop.get(key);
        if (d === undefined) droop.set(key, (d = rnd()));
        v.y -= d * 0.07 * rim;
        v.x *= 1 + (d - 0.5) * 0.25;
        v.z *= 1 + (d - 0.5) * 0.25;
      }
      pos.setXYZ(k, v.x, v.y + y, v.z);
    }
    cone.rotateY(rnd() * Math.PI);
    leaves.push(
      paint(cone, (p, n) =>
        tmp
          .copy(deep)
          .lerp(light, Math.min(1, 0.25 + Math.max(0, n.y) * 0.6 + Math.hypot(p.x, p.z) * 1.2))
          .multiplyScalar(0.9 + t * 0.15),
      ),
    );
  }
  return assemble(bark, leaves);
}

function birch(seed: number, leaf: string): THREE.Group {
  const rnd = rngOf(seed);
  const h = 0.55 + rnd() * 0.1;
  const trunk = spine(
    new THREE.Vector3(),
    new THREE.Vector3((rnd() - 0.5) * 0.1, 1, (rnd() - 0.5) * 0.1),
    h,
    5,
    0.12,
    rnd,
  );
  const bark = [barkPaint(tube(trunk, 0.03, 0.012, 7, 0.4), new THREE.Color('#e8e2d4'), rnd, true)];
  const leaves: THREE.BufferGeometry[] = [];
  const base = new THREE.Color(leaf);
  for (let i = 0; i < 9; i++) {
    const t = trunk[3 + Math.floor(rnd() * 3)]!;
    const r = 0.07 + rnd() * 0.05;
    const c = t
      .clone()
      .add(new THREE.Vector3((rnd() - 0.5) * 0.22, 0.05 + rnd() * 0.15, (rnd() - 0.5) * 0.22));
    c.y = Math.max(c.y, 0.3 + r);
    leaves.push(clump(c, r, base, rnd));
  }
  return assemble(bark, leaves);
}

function dead(seed: number): THREE.Group {
  const rnd = rngOf(seed);
  const grey = new THREE.Color('#6b5c50');
  const trunk = spine(
    new THREE.Vector3(),
    new THREE.Vector3((rnd() - 0.5) * 0.3, 1, (rnd() - 0.5) * 0.3),
    0.55,
    5,
    0.5,
    rnd,
  );
  const bark = [barkPaint(tube(trunk, 0.045, 0.01, 7, 0.6), grey, rnd)];
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2;
    const from = trunk[2 + Math.floor(rnd() * 3)]!;
    bark.push(
      barkPaint(
        tube(
          spine(
            from,
            new THREE.Vector3(Math.cos(a), 0.4 + rnd() * 0.6, Math.sin(a)),
            0.15 + rnd() * 0.15,
            3,
            0.6,
            rnd,
          ),
          0.016,
          0.004,
          5,
        ),
        grey,
        rnd,
      ),
    );
  }
  return assemble(bark, []);
}

function stump(seed: number): THREE.Group {
  const rnd = rngOf(seed);
  const s = spine(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 0.05, 1, 0, rnd);
  return assemble([barkPaint(tube(s, 0.055, 0.05, 9, 0.6), BARK, rnd)], []);
}

const barkMat = new THREE.MeshLambertMaterial({ vertexColors: true, name: 'treeBark' });
const leafMat = new THREE.MeshLambertMaterial({ vertexColors: true, name: 'treeLeaves' });

function assemble(bark: THREE.BufferGeometry[], leaves: THREE.BufferGeometry[]): THREE.Group {
  const g = new THREE.Group();
  const b = new THREE.Mesh(mergeGeometries(bark), barkMat);
  b.castShadow = b.receiveShadow = true;
  g.add(b);
  if (leaves.length) {
    const l = new THREE.Mesh(mergeGeometries(leaves), leafMat);
    l.castShadow = l.receiveShadow = true;
    g.add(l);
  }
  return g;
}

export const TREE_VARIANTS = 5;

/** The generated "trees" kit: oak_0…, pine_0…, birch_0…, autumn_0…, dead_0…, stump_0. */
export function buildTreeKit(): Map<string, THREE.Object3D> {
  const kit = new Map<string, THREE.Object3D>();
  const oakLeaves = ['#4d8a34', '#3f7d2f', '#5a9438', '#467f33', '#538c2f'];
  const autumn = ['#c9862f', '#d6a33a', '#b8612a', '#cf9a2d', '#a85a26'];
  for (let i = 0; i < TREE_VARIANTS; i++) {
    kit.set(`oak_${i}`, oak(101 + i * 17, oakLeaves[i]!));
    kit.set(`pine_${i}`, pine(303 + i * 29));
    kit.set(`birch_${i}`, birch(505 + i * 13, i % 2 ? '#8fb84a' : '#a8c25a'));
    kit.set(`autumn_${i}`, oak(707 + i * 11, autumn[i]!));
    kit.set(`dead_${i}`, dead(909 + i * 7));
  }
  kit.set('stump_0', stump(42));
  for (const [name, o] of kit) o.name = name;
  return kit;
}
