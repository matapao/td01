import { geometryAttribute } from './geometry-attributes.ts';
/** Small procedural models for things the asset packs don't have. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../core/rng.ts';
import type { Assets } from './assets.ts';
import { patchMaterial } from './assets.ts';

const mats = {
  crystal: patchMaterial(
    new THREE.MeshLambertMaterial({
      color: '#a77bff',
      emissive: '#6a2cff',
      emissiveIntensity: 0.9,
      flatShading: true,
    }),
  ),
  crystalBase: patchMaterial(new THREE.MeshLambertMaterial({ color: '#4d4a5c', flatShading: true })),
  ore: patchMaterial(
    new THREE.MeshLambertMaterial({
      color: '#d9813f',
      emissive: '#7a2e08',
      emissiveIntensity: 0.35,
      flatShading: true,
    }),
  ),
  iron: patchMaterial(new THREE.MeshLambertMaterial({ color: '#7d8590', flatShading: true })),
  pot: patchMaterial(new THREE.MeshLambertMaterial({ color: '#2b2b33' })),
  brew: new THREE.MeshLambertMaterial({ color: '#7dff6a', emissive: '#38ff3a', emissiveIntensity: 1.4 }),
};

export function crystalCluster(seed: number): THREE.Group {
  const rng = new RNG(seed);
  const g = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const n = rng.int(5, 8);
  for (let i = 0; i < n; i++) {
    const h = rng.range(0.7, 1.9) * (i === 0 ? 1.4 : 1);
    const r = rng.range(0.12, 0.24) * (i === 0 ? 1.3 : 1);
    const body = new THREE.CylinderGeometry(r * 0.85, r, h, 6, 1);
    body.translate(0, h / 2, 0);
    const tip = new THREE.ConeGeometry(r * 0.85, r * 2.2, 6);
    tip.translate(0, h + r * 1.1, 0);
    const shard = mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()])!;
    const a = rng.range(0, Math.PI * 2);
    const tilt = i === 0 ? 0.05 : rng.range(0.25, 0.65);
    shard.rotateZ(tilt);
    shard.rotateY(a);
    shard.translate(Math.cos(a) * rng.range(0.05, 0.35), 0, Math.sin(a) * rng.range(0.05, 0.35));
    geos.push(shard);
  }
  const crystal = new THREE.Mesh(mergeGeometries(geos)!, mats.crystal);
  crystal.castShadow = true;
  const base = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), mats.crystalBase);
  base.scale.set(1.2, 0.45, 1);
  base.castShadow = base.receiveShadow = true;
  g.add(base, crystal);
  return g;
}

export function oreVein(assets: Assets, seed: number): THREE.Group {
  const rng = new RNG(seed);
  const g = new THREE.Group();
  const rock = assets.model('medieval', rng.pick(['rock_single_C', 'rock_single_E', 'rock_single_B']));
  rock.scale.setScalar(6.5);
  assets.patchTree(rock);
  g.add(rock);
  const nug = new THREE.IcosahedronGeometry(0.16, 0);
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(nug, mats.ore);
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0.25, 0.8);
    m.position.set(Math.cos(a) * r, rng.range(0.25, 0.85), Math.sin(a) * r);
    m.scale.setScalar(rng.range(0.7, 1.5));
    m.rotation.set(rng.next() * 3, rng.next() * 3, 0);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

export function gearMesh(
  radius = 0.3,
  teeth = 10,
  thickness = 0.08,
  material: THREE.Material = mats.iron,
): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const ring = new THREE.CylinderGeometry(radius, radius, thickness, 18, 1, false);
  parts.push(ring.toNonIndexed());
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const t = new THREE.BoxGeometry(radius * 0.32, thickness, radius * 0.3);
    t.translate(0, 0, radius + radius * 0.12);
    t.rotateY(a);
    parts.push(t.toNonIndexed());
  }
  const hub = new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, thickness * 1.6, 10);
  parts.push(hub.toNonIndexed());
  const m = new THREE.Mesh(mergeGeometries(parts)!, material);
  m.castShadow = true;
  return m;
}

export function cauldron(): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(0.15 + Math.sin(t * Math.PI * 0.9) * 0.55, t * 0.85));
  }
  const pot = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), mats.pot);
  pot.position.y = 0.2;
  pot.castShadow = true;
  const brew = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), mats.brew);
  brew.rotation.x = -Math.PI / 2;
  brew.position.y = 0.92;
  brew.name = 'brew';
  g.add(pot, brew);
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.35, 6), mats.pot);
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 0.45, 0.15, Math.sin(a) * 0.45);
    g.add(leg);
  }
  return g;
}

export const procMaterials = mats;

/**
 * A cave mouth at the foot of the mountains: a ring of boulders around a dark, receding hollow.
 * Opens towards +Z. Roughly 5 m wide and 3.5 m tall (a person is half a unit).
 */
export function caveMouth(assets: Assets, seed: number): THREE.Group {
  const g = new THREE.Group();
  const dark = new THREE.MeshBasicMaterial({ color: '#07070a', side: THREE.DoubleSide });
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.4, 3.4, 18, 1, true, Math.PI / 2, Math.PI),
    dark,
  );
  shell.position.set(0, 1.5, -0.4);
  g.add(shell);
  const roof = new THREE.Mesh(
    new THREE.SphereGeometry(2.3, 18, 8, Math.PI / 2, Math.PI, 0, Math.PI / 2),
    dark,
  );
  roof.position.set(0, 3.1, -0.4);
  g.add(roof);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(2.3, 18, 0, Math.PI),
    new THREE.MeshBasicMaterial({ color: '#141210' }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.rotation.z = Math.PI;
  floor.position.set(0, 0.04, -0.4);
  g.add(floor);
  // Boulders framing the opening: two pillars and a lintel, plus rubble.
  const rocks: [string, number, number, number, number, number][] = [
    ['rock_single_E', -2.6, 0.9, 0.2, 9, 0.3],
    ['rock_single_C', 2.6, 0.9, 0.3, 9.5, 2.4],
    ['rock_single_D', 0, 3.4, -0.2, 12, 1.2],
    ['rock_single_B', -1.6, 3.0, 0.1, 8, 4.1],
    ['rock_single_B', 1.8, 3.1, 0.1, 8, 0.7],
    ['rock_single_A', -3.4, 0.1, 1.0, 6, 5.2],
    ['rock_single_A', 3.3, 0.1, 1.2, 5.5, 2.9],
  ];
  let k = seed;
  for (const [name, x, y, z, scale, rot] of rocks) {
    const r = assets.model('medieval', name);
    r.scale.setScalar(scale * (0.9 + ((k = (k * 9301 + 49297) % 233280) / 233280) * 0.2));
    r.position.set(x, y, z);
    r.rotation.y = rot;
    g.add(r);
  }
  assets.patchTree(g);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = m.material !== dark;
  });
  return g;
}

/**
 * A mighty stone bridge, built block by block: two flattened arches with dressed voussoirs over a
 * pier with cutwaters, spandrel walls of uneven stones, a cobbled deck, parapets with capstones and
 * abutments into the banks. Base (riverbed) at y = 0, deck top at y = depth, long axis along +Z,
 * `width` between the parapets.
 */
export function stoneBridge(length: number, width: number, depth: number, seed: number): THREE.Group {
  let k = seed * 7 + 3;
  const rnd = () => (k = (k * 16807 + 11) % 2147483647) / 2147483647;
  const blocks: THREE.BufferGeometry[] = [];
  const stone = new THREE.Color('#aaa396');
  const tint = new THREE.Color();
  const colour = (g: THREE.BufferGeometry, shade: number) => {
    tint
      .copy(stone)
      .multiplyScalar(shade * (0.84 + rnd() * 0.26))
      .offsetHSL((rnd() - 0.5) * 0.03, 0, 0);
    const c = new Float32Array(geometryAttribute(g, 'position').count * 3);
    for (let j = 0; j < c.length; j += 3) c.set([tint.r, tint.g, tint.b], j);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    blocks.push(g);
  };
  const block = (x: number, y: number, z: number, sx: number, sy: number, sz: number, shade = 1) => {
    const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
    g.translate(x, y, z);
    colour(g, shade);
  };
  const half = length / 2 + 1.6;
  const wallT = 0.5;
  const w = width / 2 + wallT / 2;
  const span = length / 2;
  const arches = [-span / 2, span / 2];
  const hw = span / 2 - 0.3;
  const spring = depth * 0.25;
  const rise = Math.max(0.8, depth - spring - 0.75);
  const intrados = (z: number): number => {
    for (const cz of arches) {
      const d = Math.abs(z - cz) / hw;
      if (d < 1) return spring + rise * Math.sqrt(1 - d * d);
    }
    return 0;
  };
  // Spandrel walls: courses of stones, cut away where the arches open.
  const course = 0.36;
  for (const side of [-1, 1]) {
    for (let y = 0; y < depth - 0.12; y += course) {
      let z = -half + rnd() * 0.3;
      while (z < half) {
        const len = 0.45 + rnd() * 0.5;
        const zc = Math.min(half, z + len / 2);
        if (y > intrados(zc) - 0.05)
          block(side * w, y + course / 2, zc, wallT, course * 0.96, len * 0.97, 0.96);
        z += len;
      }
    }
  }
  // Arch rings (voussoirs, radial along the ellipse) and the dark barrel underneath.
  for (const cz of arches) {
    const n = 15;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI;
      const nz = Math.cos(a) / hw;
      const ny = Math.sin(a) / rise;
      const nl = Math.hypot(nz, ny);
      const ang = Math.atan2(ny / nl, nz / nl);
      const zc = cz + Math.cos(a) * hw + (nz / nl) * 0.22;
      const yc = spring + Math.sin(a) * rise + (ny / nl) * 0.22;
      for (const side of [-1, 1]) {
        const g = new THREE.BoxGeometry(wallT + 0.08, 0.44, 0.3).toNonIndexed();
        g.rotateX(-(ang - Math.PI / 2));
        g.translate(side * w, yc, zc);
        colour(g, 1.12);
      }
      if (i < n) {
        const a2 = ((i + 0.5) / n) * Math.PI;
        const g = new THREE.BoxGeometry(
          width + wallT,
          0.16,
          (Math.PI * (hw + rise)) / (2 * n) + 0.05,
        ).toNonIndexed();
        const n2 = Math.atan2(Math.sin(a2) / rise, Math.cos(a2) / hw);
        g.rotateX(-(n2 - Math.PI / 2));
        g.translate(0, spring + Math.sin(a2) * rise + 0.08, cz + Math.cos(a2) * hw);
        colour(g, 0.5);
      }
    }
  }
  // The middle pier, with pointed cutwaters both ways.
  block(0, spring / 2, 0, width + wallT * 2, spring + 0.05, 0.9, 0.9);
  for (const side of [-1, 1]) {
    const g = new THREE.ConeGeometry((width + wallT * 2) * 0.36, 1.4, 4, 1).toNonIndexed();
    g.rotateY(Math.PI / 4);
    g.rotateZ((-side * Math.PI) / 2);
    g.scale(1, (spring + 0.4) / ((width + wallT * 2) * 0.72), 1);
    g.translate(side * (w + 0.75), (spring + 0.4) / 2, 0);
    colour(g, 0.88);
  }
  // Cobbled deck on a slab.
  for (let z = -half; z < half; z += 0.42) {
    for (let x = -width / 2 + 0.2; x < width / 2; x += 0.42)
      block(x + (rnd() - 0.5) * 0.04, depth - 0.07, z + 0.21, 0.4, 0.14, 0.4, 0.8 + rnd() * 0.12);
  }
  block(0, depth - 0.32, 0, width, 0.36, half * 2, 0.7);
  // Parapets with capstones, chest-high to a person.
  for (const side of [-1, 1]) {
    for (let z = -half; z < half;) {
      const len = 0.5 + rnd() * 0.4;
      block(side * w, depth + 0.2, Math.min(half, z + len / 2), wallT, 0.42, len * 0.97, 1);
      z += len;
    }
    for (let z = -half; z < half; z += 0.7)
      block(side * w, depth + 0.47, z + 0.35, wallT + 0.14, 0.12, 0.68, 1.18);
  }
  // Abutments where the bridge meets the banks.
  for (const end of [-1, 1])
    for (const side of [-1, 1])
      block(side * (w + 0.15), depth / 2, end * (half - 0.4), wallT + 0.4, depth + 0.3, 1.2, 0.9);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(mergeGeometries(blocks), mat);
  mesh.castShadow = mesh.receiveShadow = true;
  patchMaterial(mat, {});
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

/** Where the wires sit on a power pole (model space): the tops of the three insulators. */
export const POLE_WIRES = { y: 2.97, x: [-0.4, 0, 0.4] };

/** A timber power pole with a crossarm and glass insulators (about six people tall). */
export function powerPole(): THREE.Group {
  const g = new THREE.Group();
  const wood = patchMaterial(new THREE.MeshLambertMaterial({ color: '#6b4a2b' }), {});
  const glass = patchMaterial(
    new THREE.MeshLambertMaterial({ color: '#7fd4b8', emissive: '#2a6b58', emissiveIntensity: 0.25 }),
    {},
  );
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 3, 7), wood);
  pole.position.y = 1.5;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.08), wood);
  arm.position.y = 2.85;
  // Two braces under the crossarm.
  for (const side of [-1, 1]) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.035), wood);
    brace.position.set(side * 0.16, 2.68, 0);
    brace.rotation.z = side * 0.75;
    g.add(brace);
  }
  g.add(pole, arm);
  for (const x of POLE_WIRES.x) {
    const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.12, 6), glass);
    ins.position.set(x, 2.95, 0);
    g.add(ins);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** A tall iron lamp post with a glass lamp; `head` glows when it is on the grid. */
export function electricLamp(): { root: THREE.Group; head: THREE.Mesh } {
  const g = new THREE.Group();
  const iron = patchMaterial(new THREE.MeshLambertMaterial({ color: '#2d2f36' }), {});
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 1.9, 8), iron);
  post.position.y = 0.95;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.12, 8), iron);
  foot.position.y = 0.06;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.04), iron);
  arm.position.set(0.19, 1.87, 0);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.12, 8), iron);
  cap.position.set(0.38, 1.84, 0);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 10, 8),
    new THREE.MeshLambertMaterial({ color: '#fff4d6', emissive: '#ffd27a', emissiveIntensity: 0 }),
  );
  head.position.set(0.38, 1.73, 0);
  g.add(post, foot, arm, cap, head);
  g.traverse((o) => (o.castShadow = o !== head));
  return { root: g, head };
}

/** An iron fire bowl on three legs (a person tall), glowing coals in it; `flame` is where the fire burns. */
export function brazier(): { root: THREE.Group; flame: THREE.Vector3 } {
  const g = new THREE.Group();
  const iron = patchMaterial(new THREE.MeshLambertMaterial({ color: '#34302c', side: THREE.DoubleSide }), {});
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.48, 5), iron);
    leg.position.set(Math.sin(a) * 0.13, 0.24, Math.cos(a) * 0.13);
    g.add(leg);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 4, 14).rotateX(Math.PI / 2), iron);
  ring.position.y = 0.16;
  const bowl = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.001, 0),
        new THREE.Vector2(0.1, 0.01),
        new THREE.Vector2(0.2, 0.07),
        new THREE.Vector2(0.25, 0.15),
        new THREE.Vector2(0.27, 0.16),
      ],
      14,
    ),
    iron,
  );
  bowl.position.y = 0.44;
  // A heap of coals, lumpy, glowing from within.
  const heap = new THREE.SphereGeometry(0.21, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = geometryAttribute(heap, 'position');
  for (let i = 0; i < p.count; i++)
    p.setY(i, p.getY(i) * 0.45 + Math.sin(p.getX(i) * 40) * Math.cos(p.getZ(i) * 37) * 0.012);
  heap.computeVertexNormals();
  const coals = new THREE.Mesh(
    heap,
    new THREE.MeshLambertMaterial({
      color: '#2e0e04',
      emissive: '#ff4a0a',
      emissiveIntensity: 0.85,
      flatShading: true,
    }),
  );
  coals.position.y = 0.53;
  g.add(ring, bowl, coals);
  g.traverse((o) => (o.castShadow = o !== coals));
  return { root: g, flame: new THREE.Vector3(0, 0.56, 0) };
}

/**
 * The Warchief's scout drone: a stubby quadcopter (half a person across) with a camera eye,
 * running lights and four rotors (`rotors`, spun by the view); `blink` is the white top light.
 */
export function droneModel(): { root: THREE.Group; rotors: THREE.Object3D[]; blink: THREE.Mesh } {
  const g = new THREE.Group();
  const shell = patchMaterial(new THREE.MeshLambertMaterial({ color: '#3b4250' }), {});
  const accent = patchMaterial(new THREE.MeshLambertMaterial({ color: '#ffc23d' }), {});
  const dark = patchMaterial(new THREE.MeshLambertMaterial({ color: '#1c1f26' }), {});
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.26), shell);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.18), accent);
  top.position.y = 0.05;
  g.add(body, top);
  // The camera eye looks forward (+z).
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 10, 8),
    new THREE.MeshBasicMaterial({ color: '#7fe8ff' }),
  );
  eye.position.set(0, -0.01, 0.14);
  g.add(eye);
  const rotors: THREE.Object3D[] = [];
  const disc = new THREE.MeshBasicMaterial({
    color: '#d8dde6',
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.2), dark);
    arm.position.set(sx * 0.1, 0.01, sz * 0.1);
    arm.rotation.y = Math.atan2(sx, sz);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.05, 8), dark);
    motor.position.set(sx * 0.17, 0.03, sz * 0.17);
    const rotor = new THREE.Group();
    rotor.position.set(sx * 0.17, 0.065, sz * 0.17);
    const blur = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16).rotateX(-Math.PI / 2), disc);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.006, 0.025), dark);
    rotor.add(blur, blade);
    rotors.push(rotor);
    g.add(arm, motor, rotor);
  }
  // Running lights: red to port, green to starboard, a white blink on top.
  for (const [x, c] of [
    [-0.11, '#ff3b30'],
    [0.11, '#3dff6a'],
  ] as const) {
    const l = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 6, 5),
      new THREE.MeshBasicMaterial({ color: c }),
    );
    l.position.set(x, 0, -0.12);
    g.add(l);
  }
  const blink = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 6, 5),
    new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  );
  blink.position.set(0, 0.08, 0);
  g.add(blink);
  return { root: g, rotors, blink };
}

/** The drone's controller: a little box with two sticks and an aerial, held in the hand. */
export function droneController(): THREE.Group {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: '#23262e' });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.07), dark);
  g.add(box);
  for (const x of [-0.03, 0.03]) {
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.025, 5),
      new THREE.MeshLambertMaterial({ color: '#c8ccd4' }),
    );
    stick.position.set(x, 0.022, 0);
    g.add(stick);
  }
  const aerial = new THREE.Mesh(
    new THREE.CylinderGeometry(0.003, 0.003, 0.09, 4),
    new THREE.MeshLambertMaterial({ color: '#c8ccd4' }),
  );
  aerial.position.set(0.045, 0.05, -0.03);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.05, 0.03),
    new THREE.MeshBasicMaterial({ color: '#7fe8ff' }),
  );
  screen.rotation.x = -Math.PI / 2;
  screen.position.set(0, 0.014, 0.012);
  g.add(aerial, screen);
  return g;
}

/**
 * A stone stair up the inner face of the wall (model space: across x, rising along +z from its foot
 * at z = −run/2 to its landing, `landing` m long, `height` up at the head): steps on solid masonry,
 * a parapet with a coping along its open side (−x; none for its first steps up from the foot), a
 * stone end at its head. Blue-grey stone like the wall's, each block a little different.
 */
export function wallStair(
  run: number,
  width: number,
  height: number,
  landing: number,
  seed: number,
): THREE.Group {
  let k = seed * 13 + 5;
  const rnd = () => (k = (k * 16807 + 11) % 2147483647) / 2147483647;
  const blocks: THREE.BufferGeometry[] = [];
  const stone = new THREE.Color('#8e96a2');
  const tint = new THREE.Color();
  const block = (x: number, y: number, z: number, sx: number, sy: number, sz: number, shade = 1) => {
    const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
    g.translate(x, y, z);
    tint
      .copy(stone)
      .multiplyScalar(shade * (0.86 + rnd() * 0.22))
      .offsetHSL((rnd() - 0.5) * 0.02, 0, 0);
    const c = new Float32Array(geometryAttribute(g, 'position').count * 3);
    for (let j = 0; j < c.length; j += 3) c.set([tint.r, tint.g, tint.b], j);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    blocks.push(g);
  };
  const flight = run - landing;
  const steps = Math.max(4, Math.ceil(height / 0.27));
  const tread = flight / steps;
  const z0 = -run / 2;
  for (let i = 0; i < steps; i++) {
    const top = (height * (i + 1)) / steps;
    // The step and the masonry under it; its nosing a shade lighter.
    block(0, top / 2, z0 + tread * (i + 0.5), width, top, tread, 0.92);
    block(0, top - 0.03, z0 + tread * (i + 0.95), width + 0.02, 0.06, tread * 0.12, 1.12);
  }
  block(0, height / 2, z0 + flight + landing / 2, width, height, landing, 0.95);
  // The parapet up its open side, coping on top; and the stone end at its head.
  const px = -width / 2 - 0.16;
  for (let z = z0 + 1.2; z < run / 2;) {
    const len = 0.55 + rnd() * 0.35;
    const zc = Math.min(run / 2 - 0.01, z + len / 2);
    const floor = height * Math.min(1, Math.max(0, (zc - z0) / flight));
    block(px, (floor + 0.5) / 2, zc, 0.32, floor + 0.5, len * 0.97, 1);
    block(px, floor + 0.53, zc, 0.42, 0.1, len * 0.97, 1.18);
    z += len;
  }
  block(0, (height + 0.5) / 2, run / 2 + 0.17, width + 0.64, height + 0.5, 0.34, 0.9);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(mergeGeometries(blocks), mat);
  patchMaterial(mat, {});
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}
