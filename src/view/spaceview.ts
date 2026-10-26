import { lam, glowSprite, crystalMat, depositModel } from './space-deposits.ts';
/**
 * Space, drawn: a small rocky body adrift in the dark — grey dust and boulders, craters, its rim
 * breaking off in cliffs over the stars, teal crystals in the cliffs, asteroids drifting past; its
 * deposits (nickel-iron boulders with silver veins, ice in the shadowed crater breathing vapour, the
 * rare-earth vein glowing teal); the base as it lands — each module on the descent stage it came down
 * on (landers on their own legs), walkways between them, beacons blinking, the rover driving out to
 * dig and back, the drill at work — and every flight on its way: the rocket lifting off the Port in
 * the vale (boosters and fairing falling away); out there, with no air to slow anything, the braking
 * burn and the powered descent onto its legs; the ascent vehicle lifting off its stage; and the
 * capsule that brings the minerals home, burning into the vale's air and coming down under its
 * parachute by the keep. The base wears KayKit's Space Base pieces once they're in (built in code
 * until then).
 */
import * as THREE from 'three';
import { Noise2D } from '../core/noise.ts';
import { groundHeight } from '../game/map.ts';
import type { Sim } from '../game/sim.ts';
import {
  BASE_WORK,
  FLIGHT,
  PAYLOADS,
  SPACE,
  inSpace,
  slotOf,
  spaceHeight,
  type PayloadId,
} from '../game/space.ts';
import { flightTime, homecoming } from '../game/systems/space.ts';
import type { Flight } from '../game/types.ts';
import { patchMaterial, type Assets } from './assets.ts';
import type { Fx } from './fx.ts';
import {
  STAGE_H,
  capsuleModel,
  chuteModel,
  descentStage,
  flameModel,
  payloadModel,
  rocketModel,
} from './rockets.ts';

const noise = new Noise2D(31);

/** The body's top runs a little past where one may walk, then breaks off in a cliff over the dark. */
const TOP_R = SPACE.half + 8;
/** How far the cliff reaches out past the top (m, before the rim's jag). */
const REACH = 12;
/** How far the rim juts out (or in) at angle `a`: seamless round the body. */
const jag = (a: number) => 1 + noise.fbm(Math.cos(a) * 1.7 + 4, Math.sin(a) * 1.7 - 2, 3) * 0.9;

/** A ring of the body's profile: the top at radius `r`, the cliff `s` 0…1 down, the underside `u` 0…1 in to the bottom. */
type Ring = { k: 0; r: number } | { k: 1; s: number } | { k: 2; u: number };

/** A point of the body (local to its middle) on `ring` at angle `a`. */
function ringPoint(ring: Ring, a: number, out = new THREE.Vector3()): THREE.Vector3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  if (ring.k === 0)
    return out.set(c * ring.r, spaceHeight(SPACE.x + c * ring.r, SPACE.z + s * ring.r), s * ring.r);
  const top = spaceHeight(SPACE.x + c * TOP_R, SPACE.z + s * TOP_R);
  const reach = REACH * Math.max(0.35, jag(a));
  if (ring.k === 1) {
    // Rocky ledges: the cliff juts and steps as it drops.
    const lip = ring.s < 0.2 ? Math.sin((ring.s / 0.2) * Math.PI) * 0.5 : 0;
    const r = TOP_R + reach * ring.s + noise.noise(a * 14, ring.s * 5) * 2.4 * ring.s;
    return out.set(
      c * r,
      top + lip - Math.pow(ring.s, 1.4) * 22 + noise.noise(a * 9 + 1, ring.s * 7) * 1.4 * ring.s,
      s * r,
    );
  }
  const u = ring.u;
  const r =
    (TOP_R + reach) *
    Math.pow(1 - u, 0.8) *
    (1 + 0.1 * noise.noise(a * 6, u * 3) + 0.05 * noise.noise(a * 17, u * 9));
  return out.set(c * r, top - 22 - Math.pow(u, 1.25) * 80 + noise.noise(a * 5 + 3, u * 2) * 3, s * r);
}

/**
 * The body: its grey top (dust, craters, the levelled landing site, frost in the shadowed crater),
 * the cliff all round and the rough underside down to a point — one mesh, every side facing out.
 */
function bodyMesh(): THREE.Mesh {
  const rings: Ring[] = [];
  for (let r = 0; r < TOP_R; r += r < 18 ? 3 : 1.3) rings.push({ k: 0, r });
  rings.push({ k: 0, r: TOP_R });
  for (const s of [0.08, 0.18, 0.3, 0.45, 0.6, 0.75, 0.9, 1]) rings.push({ k: 1, s });
  for (const u of [0.06, 0.14, 0.24, 0.36, 0.48, 0.6, 0.72, 0.83, 0.92, 0.98, 1]) rings.push({ k: 2, u });
  const seg = 280;
  const pos = new Float32Array(rings.length * (seg + 1) * 3);
  const col = new Float32Array(rings.length * (seg + 1) * 3);
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  const ice = { x: 34, z: -22, r: 12 };
  rings.forEach((ring, i) => {
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      ringPoint(ring, a, p);
      const v = i * (seg + 1) + j;
      pos.set([p.x, p.y, p.z], v * 3);
      if (ring.k === 0) {
        // Grey dust: broad lighter and darker patches, darker in the hollows, lighter on the rims.
        const n = noise.fbm(p.x * 0.05, p.z * 0.05, 3) * 0.5 + 0.5;
        const plain = THREE.MathUtils.smoothstep(noise.fbm(p.x * 0.018 + 7, p.z * 0.018 - 3, 2), 0.05, 0.3);
        const fine = noise.noise(p.x * 0.45, p.z * 0.45) * 0.5 + 0.5;
        const l = 0.38 + n * 0.1 + p.y * 0.025 + fine * 0.04 - plain * 0.08 + (ring.r < 16 ? 0.03 : 0);
        c.setHSL(0.63 + n * 0.02, 0.06 + n * 0.03, THREE.MathUtils.clamp(l, 0.2, 0.56), THREE.SRGBColorSpace);
        // Frost in the shadowed crater where the ice lies.
        const q = Math.hypot(p.x - ice.x, p.z - ice.z) / ice.r;
        if (q < 1.1) c.lerp(new THREE.Color('#c4d6e6'), (1 - q / 1.1) * 0.65);
      } else if (ring.k === 1) {
        c.setHSL(
          0.63,
          0.06,
          0.36 - ring.s * 0.06 + noise.noise(a * 9, ring.s * 3) * 0.05,
          THREE.SRGBColorSpace,
        );
      } else {
        c.setHSL(
          0.66,
          0.08,
          0.3 - ring.u * 0.1 + noise.noise(a * 7, ring.u * 5) * 0.04,
          THREE.SRGBColorSpace,
        );
      }
      col.set([c.r, c.g, c.b], v * 3);
    }
  });
  const idx: number[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + seg + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Both sides: where the rough underside folds over itself it never shows a hole.
  const mesh = new THREE.Mesh(
    geo,
    patchMaterial(
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
    ),
  );
  mesh.position.set(SPACE.x, 0, SPACE.z);
  mesh.receiveShadow = true;
  mesh.name = 'space-body';
  return mesh;
}

const rand = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/** Loose grey rocks over the top (instanced), clear of the landing site. */
function rocks(): THREE.InstancedMesh {
  const n = 280;
  const mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.4, 0), lam('#ffffff'), n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  const rnd = rand(11);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 22 + Math.sqrt(rnd()) * (TOP_R - 25);
    const x = SPACE.x + Math.cos(a) * r;
    const z = SPACE.z + Math.sin(a) * r;
    const s = 0.3 + rnd() * rnd() * 2.4;
    q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
    m.compose(
      new THREE.Vector3(x, spaceHeight(x, z) + s * 0.12, z),
      q,
      new THREE.Vector3(s, s * (0.5 + rnd() * 0.4), s),
    );
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setHSL(0.63, 0.06, 0.3 + rnd() * 0.18, THREE.SRGBColorSpace));
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A soft round glow (beacons, crystals). */
function glowTexture(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

/** Teal crystals growing out of the cliffs and hanging under the body (out of reach: only to look at). */
function cliffCrystals(glow: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const n = 60;
  const mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), crystalMat(), n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const rnd = rand(5);
  const p = new THREE.Vector3();
  let i = 0;
  const cluster = (ring: Ring, a: number, out: THREE.Vector3, count: number, size: number) => {
    ringPoint(ring, a, p);
    for (let k = 0; k < count && i < n; k++, i++) {
      const dir = out
        .clone()
        .add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.8))
        .normalize();
      q.setFromUnitVectors(up, dir);
      const s = size * (0.5 + rnd() * 0.6);
      m.compose(
        p.clone().add(dir.clone().multiplyScalar(s * 0.8)),
        q,
        new THREE.Vector3(s * 0.28, s, s * 0.28),
      );
      mesh.setMatrixAt(i, m);
    }
    const sp = glowSprite(glow, '#5ff0d0', size * 3.2, 0.5);
    sp.position.copy(p).add(out.clone().multiplyScalar(size));
    g.add(sp);
  };
  for (let c = 0; c < 14; c++) {
    const a = rnd() * Math.PI * 2;
    const out = new THREE.Vector3(Math.cos(a), -0.25, Math.sin(a)).normalize();
    cluster({ k: 1, s: 0.3 + rnd() * 0.35 }, a, out, 3, 1.4 + rnd() * 1.2);
  }
  for (let c = 0; c < 5; c++) {
    const a = rnd() * Math.PI * 2;
    cluster(
      { k: 2, u: 0.45 + rnd() * 0.3 },
      a,
      new THREE.Vector3(Math.cos(a) * 0.4, -1, Math.sin(a) * 0.4).normalize(),
      3,
      3 + rnd() * 3,
    );
  }
  mesh.count = i;
  g.add(mesh);
  g.position.set(SPACE.x, 0, SPACE.z);
  return g;
}

/** Asteroids drifting round the body, each turning slowly on its own axis. */
class Asteroids {
  readonly mesh: THREE.InstancedMesh;
  private rocks: { p: THREE.Vector3; axis: THREE.Vector3; a: number; w: number; s: THREE.Vector3 }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();

  constructor() {
    const geo = new THREE.DodecahedronGeometry(1, 1);
    const pos = geo.attributes['position'] as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    // Lumpy (every copy shares the lumps; its size and turn make it its own).
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const k = 1 + noise.noise(v.x * 1.7 + 3, v.y * 1.7 + v.z * 1.3) * 0.3;
      pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
    }
    geo.computeVertexNormals();
    const n = 48;
    this.mesh = new THREE.InstancedMesh(geo, lam('#ffffff'), n);
    const rnd = rand(23);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 150 + rnd() * 320;
      const size = 1.5 + rnd() * rnd() * rnd() * 30;
      this.rocks.push({
        p: new THREE.Vector3(SPACE.x + Math.cos(a) * r, -150 + rnd() * 240, SPACE.z + Math.sin(a) * r),
        axis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
        a: rnd() * 6,
        w: (0.02 + rnd() * 0.1) * (rnd() < 0.5 ? -1 : 1),
        s: new THREE.Vector3(size, size * (0.6 + rnd() * 0.4), size * (0.7 + rnd() * 0.3)),
      });
      this.mesh.setColorAt(i, c.setHSL(0.62 + rnd() * 0.06, 0.07, 0.36 + rnd() * 0.18, THREE.SRGBColorSpace));
    }
    this.mesh.frustumCulled = false;
    this.update(0);
  }

  update(t: number): void {
    this.rocks.forEach((r, i) => {
      this.q.setFromAxisAngle(r.axis, r.a + t * r.w);
      this.mesh.setMatrixAt(i, this.m.compose(r.p, this.q, r.s));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Where the depot's crates stand (from the base's middle, m): by the ascent vehicle that lifts them home. */
const DEPOT = { x: 7, z: -14 };

/** KayKit Space Base pieces: [model, x, y, z, yaw] in the kit's units (scaled by `s`, default KIT_S). */
type Piece = [string, number, number, number, number];
interface KitLook {
  /** What stands still. */
  parts?: Piece[];
  /** What moves: drives off (the rover), works (the drill), lifts off (the ascent vehicle). */
  vehicle?: Piece[];
  /** Comes down packed (unfolds once it stands). */
  fly?: Piece[];
  /** Stands on its own legs (no descent stage under it). */
  legs?: boolean;
  s?: number;
  /** The descent stage's size (half its footprint, m) when not the payload's own. */
  stage?: number;
}
const KIT_S = 2;
const KIT_LOOK: Record<PayloadId, KitLook> = {
  lander: { parts: [['lander_A', 0, 0, 0, 0]], legs: true },
  solarfarm: {
    parts: [0, 1, 2, 3, 4, 5].map((i): Piece => {
      const a = (i / 6) * Math.PI * 2;
      return ['solarpanel', Math.cos(a) * 1.4, -STAGE_H / KIT_S, Math.sin(a) * 1.4, -a + Math.PI / 2];
    }),
    fly: [['cargo_B_stacked', 0, 0, 0, 0]],
    stage: 1.1,
  },
  habitat: { parts: [['basemodule_E', 0, 0, 0, 0]] },
  crew: { parts: [['dropship', 0, 0, 0, Math.PI / 2]], legs: true, s: 1.3 },
  rover: {
    vehicle: [
      ['spacetruck_large', 0, 0.13, 0.12, 0],
      ['spacetruck_trailer', 0, 0.14, -0.95, 0],
    ],
    s: 2.2,
  },
  drill: { vehicle: [['drill_structure', 0, 0, 0, 0]] },
  oxygen: {
    parts: [
      ['basemodule_C', 0, 0, 0, 0],
      ['roofmodule_cargo_A', 0, 1, 0, 0],
    ],
    s: 1.5,
  },
  ascent: { parts: [['lander_base', 0, 0, 0, 0]], vehicle: [['lander_B', 0, 0.5, 0, 0]], legs: true },
};

/** A module as it stands (or flies): its root, and the part of it that moves. */
interface Look {
  obj: THREE.Group;
  vehicle: THREE.Group | null;
  /** How high the vehicle stands on its stage. */
  vehicleY: number;
}

/** The looks of the payloads: KayKit's Space Base pieces once they're in, built in code until then. */
class Looks {
  private assets: Assets;

  constructor(assets: Assets) {
    this.assets = assets;
  }

  get kit(): boolean {
    return this.assets.has('space', 'lander_A');
  }

  private pieces(list: Piece[], s: number): THREE.Group {
    const g = new THREE.Group();
    for (const [name, x, y, z, yaw] of list) {
      const m = this.assets.model('space', name);
      m.position.set(x * s, y * s, z * s);
      m.rotation.y = yaw;
      m.scale.setScalar(s);
      g.add(m);
    }
    return g;
  }

  /** Payload `kind` standing at the base, or (`flying`) as it comes down. */
  build(kind: PayloadId, flying = false): Look {
    const obj = new THREE.Group();
    if (!this.kit) {
      obj.add(descentStage(PAYLOADS[kind].half));
      const vehicle = payloadModel(kind);
      vehicle.position.y = STAGE_H;
      obj.add(vehicle);
      return { obj, vehicle, vehicleY: STAGE_H };
    }
    const d = KIT_LOOK[kind];
    const s = d.s ?? KIT_S;
    const y0 = d.legs ? 0 : STAGE_H;
    if (!d.legs) obj.add(descentStage(d.stage ?? PAYLOADS[kind].half));
    const still = this.pieces(flying && d.fly ? d.fly : (d.parts ?? []), s);
    still.position.y = y0;
    obj.add(still);
    let vehicle: THREE.Group | null = null;
    if (d.vehicle && !(flying && d.fly)) {
      vehicle = this.pieces(d.vehicle, s);
      vehicle.position.y = y0;
      obj.add(vehicle);
    }
    return { obj, vehicle, vehicleY: y0 };
  }

  /** What lifts off for home: the ascent vehicle without the stage it stood on. */
  ascentVehicle(): THREE.Group {
    if (!this.kit) return payloadModel('ascent');
    const d = KIT_LOOK.ascent;
    return this.pieces(d.vehicle ?? [], d.s ?? KIT_S);
  }
}

/** One flight on its way: its pieces and what each does in each part of the flight. */
class FlightView {
  private f: Flight;
  private from: { x: number; z: number };
  private fx: Fx;
  private ground: (x: number, z: number) => number;
  private liftFrom: THREE.Vector3 | null;

  readonly root = new THREE.Group();
  private rocket = rocketModel();
  private capsule = capsuleModel();
  private chute = chuteModel();
  private craft: THREE.Group;
  private flame = flameModel();
  private zone = new THREE.Mesh(
    new THREE.RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: '#7fe0ff',
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  private shield: THREE.Object3D;
  private thumped = false;
  private lifted = false;
  /** Seconds a capsule has lain by the keep since it came down (it stays a while). */
  linger = 0;

  get home(): boolean {
    return this.f.home;
  }

  constructor(
    f: Flight,
    from: { x: number; z: number },
    scene: THREE.Scene,
    fx: Fx,
    ground: (x: number, z: number) => number,
    looks: Looks,
    /** Home flights: where the ascent vehicle stands on its stage. */
    liftFrom: THREE.Vector3 | null,
  ) {
    this.f = f;
    this.from = from;
    this.fx = fx;
    this.ground = ground;
    this.liftFrom = liftFrom;

    this.craft = new THREE.Group();
    const body = f.home ? looks.ascentVehicle() : looks.build(f.payload, true).obj;
    // The flame comes out from under it.
    this.flame.position.y = new THREE.Box3().setFromObject(body).min.y + 0.05;
    this.craft.add(body, this.flame);
    this.shield = this.capsule.getObjectByName('shield')!;
    this.root.add(this.rocket, this.capsule, this.chute, this.craft, this.zone);
    scene.add(this.root);
  }

  update(f: Flight, dt: number, t: number): void {
    this.f = f;
    for (const o of [this.rocket, this.capsule, this.chute, this.craft, this.zone]) o.visible = false;
    const k = (f.t - FLIGHT.ascent - FLIGHT.cruise) / FLIGHT.edl;
    if (f.t < FLIGHT.ascent) {
      if (f.home) this.liftOff(f.t);
      else this.ascent(f.t, dt);
    } else if (k >= 0) {
      if (f.home) this.homecoming(Math.min(1, k), t);
      else this.landing(Math.min(1, k), t);
    }
    if (!f.home && k < 0.95) {
      // Where it will come down: a ring on the ground, pulsing.
      const to = slotOf(f.payload);
      const r = PAYLOADS[f.payload].half + 1.2;
      this.zone.visible = true;
      this.zone.position.set(to.x, this.ground(to.x, to.z) + 0.06, to.z);
      this.zone.scale.setScalar(r * (1 + Math.sin(t * 3) * 0.04));
      (this.zone.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(t * 3) * 0.15;
    }
  }

  /** Off the pad in the vale: climbing faster and faster; the boosters fall away, then the fairing. */
  private ascent(t: number, dt: number): void {
    const r = this.rocket;
    r.visible = true;
    const at = this.from;
    r.position.set(at.x + t * t * 0.08, this.ground(at.x, at.z) + 0.35 + 0.9 * t * t, at.z);
    r.rotation.z = -Math.min(0.5, t * 0.03);
    for (const s of [-1, 1]) {
      const b = r.getObjectByName(`booster${s}`)!;
      if (t > 5.5) {
        b.position.x += s * dt * 1.5;
        b.position.y -= dt * 6 * (t - 5.5);
        b.rotation.z += s * dt;
      }
    }
    r.getObjectByName('fairing')!.visible = t < 10;
    const base = new THREE.Vector3(0, 0.2, 0).applyMatrix4(r.matrixWorld);
    this.fx.glow({
      x: base.x,
      y: base.y - 0.3,
      z: base.z,
      vy: -6 - Math.random() * 3,
      vx: (Math.random() - 0.5) * 1.5,
      vz: (Math.random() - 0.5) * 1.5,
      life: 0.5,
      size: 1.4,
      size1: 0.3,
      color: '#ffe08a',
      color1: '#ff5a1a',
      tex: 'dot',
      gravity: 0,
      drag: 0.4,
    });
    if (Math.random() < 0.6)
      this.fx.puff({
        x: base.x,
        y: base.y - 0.8,
        z: base.z,
        vy: -1,
        vx: (Math.random() - 0.5) * 2,
        vz: (Math.random() - 0.5) * 2,
        life: 3,
        size: 1.6,
        size1: 4,
        color: '#e8e2d8',
        alpha: 0.5,
        tex: 'smoke',
        drag: 0.6,
      });
  }

  /** Home flights start out there: the ascent vehicle lifts off the stage it stands on (no air: the dust flies straight). */
  private liftOff(t: number): void {
    const at = this.liftFrom;
    if (!at) return;
    const c = this.craft;
    c.visible = true;
    c.position.set(at.x + t * t * 0.05, at.y + 0.5 * t * t, at.z);
    c.rotation.set(0, 0, -Math.min(0.35, t * 0.025));
    this.burn(1.2 + Math.random() * 0.3);
    if (!this.lifted) {
      this.lifted = true;
      this.dust(at.x, at.y - STAGE_H, at.z, 26);
    }
  }

  /**
   * Out there (`k` 0…1 of the last part): the braking burn — in high and fast on a long slant, the
   * engine pointed the way it's going — then the powered descent: upright, sinking on its engine to
   * a hover just off the ground, and down onto its legs.
   */
  private landing(k: number, t: number): void {
    const to = slotOf(this.f.payload);
    const g = this.ground(to.x, to.z);
    const c = this.craft;
    c.visible = true;
    const upright = new THREE.Vector3(0, 1, 0);
    if (k < 0.45) {
      const e = k / 0.45;
      const from = new THREE.Vector3(to.x + 150, g + 90, to.z - 70);
      const end = new THREE.Vector3(to.x + 10, g + 24, to.z - 4);
      c.position.lerpVectors(from, end, 1 - (1 - e) * (1 - e));
      const ahead = end.clone().sub(from).normalize();
      c.quaternion.setFromUnitVectors(
        upright,
        ahead
          .negate()
          .lerp(upright, e * e)
          .normalize(),
      );
      this.burn(2.4 + Math.sin(t * 40) * 0.2);
      return;
    }
    c.quaternion.identity();
    if (k < 0.95) {
      const e = (k - 0.45) / 0.5;
      const p = THREE.MathUtils.smoothstep(e, 0, 0.75);
      const h = e < 0.75 ? 3 + 21 * Math.pow(1 - e / 0.75, 2) : 3 * Math.pow(1 - (e - 0.75) / 0.25, 1.5);
      c.position.set(to.x + 10 * (1 - p), g + h, to.z - 4 * (1 - p));
      this.burn((e < 0.75 ? 1.3 : 0.9) + Math.sin(t * 37) * 0.12);
      if (h < 7 && Math.random() < 0.9) {
        // The engine blows the dust out sideways: with no air it flies straight and far.
        const a = Math.random() * Math.PI * 2;
        const sp = 5 + Math.random() * 5;
        this.fx.puff({
          x: c.position.x,
          y: g + 0.25,
          z: c.position.z,
          vx: Math.cos(a) * sp,
          vz: Math.sin(a) * sp,
          vy: 0.2,
          life: 1.1,
          size: 0.7,
          size1: 2.2,
          color: '#a7abb8',
          alpha: 0.5 * (1 - h / 7),
          tex: 'smoke',
        });
      }
      return;
    }
    c.position.set(to.x, g, to.z);
    if (!this.thumped) {
      this.thumped = true;
      this.dust(to.x, g, to.z, 30);
      this.fx.ring(to.x, g, to.z, 0.5, PAYLOADS[this.f.payload].half + 3, '#cfd6e6', 0.7, 0.6);
    }
  }

  /**
   * Home: the capsule burns into the vale's air (heat shield first, a streak of fire), the parachute
   * opens and the heat shield drops away, and it comes down by the keep.
   */
  private homecoming(k: number, t: number): void {
    const to = homecoming();
    const g = this.ground(to.x, to.z);
    const cap = this.capsule;
    cap.visible = true;
    if (k < 0.4) {
      const e = k / 0.4;
      const from = new THREE.Vector3(to.x + 130, g + 160, to.z - 60);
      const end = new THREE.Vector3(to.x + 8, g + 38, to.z - 3);
      cap.position.lerpVectors(from, end, 1 - (1 - e) * (1 - e));
      const ahead = end.clone().sub(from).normalize();
      cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ahead.clone().negate());
      this.shield.visible = true;
      const p = cap.position;
      for (let i = 0; i < 2; i++) {
        this.fx.glow({
          x: p.x + ahead.x * 0.6,
          y: p.y + ahead.y * 0.6,
          z: p.z + ahead.z * 0.6,
          vx: -ahead.x * 12 + (Math.random() - 0.5) * 2,
          vy: -ahead.y * 12 + (Math.random() - 0.5) * 2,
          vz: -ahead.z * 12,
          life: 0.45,
          size: 2.4,
          size1: 0.4,
          color: '#fff0a0',
          color1: '#ff4a10',
          tex: 'dot',
        });
      }
      return;
    }
    cap.quaternion.identity();
    if (k < 0.95) {
      const e = (k - 0.4) / 0.55;
      cap.position.set(to.x + 8 * (1 - e), g + 0.4 + 37.6 * (1 - e), to.z - 3 * (1 - e));
      cap.rotation.z = Math.sin(t * 1.3) * 0.08 * (1 - e);
      // The heat shield drops away once the parachute has it slowed.
      if (this.shield.visible && e > 0.15) {
        this.shield.visible = false;
        this.fx.burst(cap.position.x, cap.position.y, cap.position.z, 10, {
          color: '#d9d4c8',
          size: 0.5,
          size1: 1.4,
          life: 1.2,
          speed: 1.5,
          up: 0.5,
          tex: 'smoke',
          additive: false,
          gravity: 2,
        });
      }
      this.chute.visible = true;
      this.chute.position.copy(cap.position);
      this.chute.rotation.z = cap.rotation.z;
      this.chute.scale.setScalar(Math.min(1, 0.15 + e * 8));
      return;
    }
    this.landed();
  }

  /** By the keep: the capsule on the ground, its parachute lying spread beside it. */
  private landed(): void {
    const to = homecoming();
    const g = this.ground(to.x, to.z);
    this.capsule.visible = true;
    this.capsule.position.set(to.x, g, to.z);
    this.capsule.rotation.set(0, 0, 0.12);
    this.shield.visible = false;
    this.chute.visible = true;
    this.chute.position.set(to.x + 3, g - 0.25, to.z + 0.5);
    this.chute.rotation.set(0, 0, 0);
    this.chute.scale.set(1, 0.12, 1);
    if (!this.thumped) {
      this.thumped = true;
      this.fx.burst(to.x, g + 0.3, to.z, 26, {
        color: '#b9a68a',
        size: 0.6,
        size1: 1.6,
        life: 1.6,
        speed: 3,
        up: 2,
        tex: 'smoke',
        additive: false,
      });
    }
  }

  /** Still there after its flight is over (home only): lies by the keep. */
  rest(dt: number): void {
    this.linger += dt;
    for (const o of [this.rocket, this.craft, this.zone]) o.visible = false;
    this.landed();
  }

  /** The engine burning at `throttle` (its flame's length). */
  private burn(throttle: number): void {
    this.flame.visible = true;
    this.flame.scale.set(0.9 + throttle * 0.15, throttle, 0.9 + throttle * 0.15);
  }

  /** Dust flung out round (x, z): straight and far, with no air to stop it. */
  private dust(x: number, y: number, z: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const sp = 4 + Math.random() * 6;
      this.fx.puff({
        x,
        y: y + 0.2,
        z,
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vy: 0.4 + Math.random() * 0.6,
        life: 1.4,
        size: 0.8,
        size1: 2.6,
        color: '#b4b8c4',
        alpha: 0.55,
        tex: 'smoke',
      });
    }
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}

/** A module standing at the base. */
interface ModuleView {
  id: number;
  kind: PayloadId;
  look: Look;
  beacon: THREE.Sprite;
  kit: boolean;
}

export class SpaceView {
  private sim: Sim;
  private scene: THREE.Scene;
  private fx: Fx;
  private assets: Assets;

  readonly root = new THREE.Group();
  private nodes = new Map<number, { obj: THREE.Object3D; shake: number; scale: number; target: number }>();
  private modules = new Map<number, ModuleView>();
  private flights = new Map<number, FlightView>();
  /** Capsules lying by the keep after their flights are over. */
  private resting: FlightView[] = [];
  /** Where launches go up from (the Port that launched them). */
  private origins = new Map<number, { x: number; z: number }>();
  private walkways = new THREE.Group();
  private walkKey = '';
  /** The depot's crates, stacked as the rover and drill fill it. */
  private crates = new THREE.Group();
  private crateKey = '';
  private asteroids = new Asteroids();
  private glow = glowTexture();
  private looks: Looks;
  private nodeCount = -1;
  private t = 0;
  private ventT = 0;
  private ground: (x: number, z: number) => number;

  constructor(sim: Sim, scene: THREE.Scene, fx: Fx, assets: Assets) {
    this.sim = sim;
    this.scene = scene;
    this.fx = fx;
    this.assets = assets;

    this.looks = new Looks(assets);
    this.ground = (x, z) => groundHeight(sim.world, x, z);
    this.root.add(
      bodyMesh(),
      rocks(),
      cliffCrystals(this.glow),
      this.asteroids.mesh,
      this.walkways,
      this.crates,
    );
    scene.add(this.root);
    const ev = sim.events;
    ev.on('gatherHit', (e) => {
      const v = this.nodes.get(e.node);
      if (v) v.shake = 1;
    });
    ev.on('nodeDepleted', (e) => {
      const v = this.nodes.get(e.node);
      if (v) v.target = 0.1;
    });
    ev.on('nodeRegrown', (e) => {
      const v = this.nodes.get(e.node);
      if (v) v.target = 1;
    });
    ev.on('launched', (e) => this.origins.set(e.flight, { x: e.x, z: e.z }));
  }

  /** Every frame: the base as it stands, the flights on their way, the deposits shaking as they're mined. `at`: where the camera looks. */
  update(dt: number, here: boolean, at: { x: number; z: number }): void {
    this.t += dt;
    const t = this.t;
    // The body and the base only matter while someone looks at them (flights are drawn anywhere).
    this.root.visible = here;
    this.syncNodes();
    for (const v of this.nodes.values()) {
      v.scale += (v.target - v.scale) * Math.min(1, dt * 3);
      v.shake = Math.max(0, v.shake - dt * 4);
      v.obj.scale.setScalar(v.scale);
      v.obj.rotation.z = Math.sin(v.shake * 40) * 0.05 * v.shake;
    }
    if (here) {
      this.asteroids.update(t);
      this.vents(dt, at);
    }
    const s = this.sim.state.space;
    // KayKit's pieces came in: the modules put them on.
    for (const [id, m] of this.modules) {
      if (m.kit === this.looks.kit && s?.modules.some((x) => x.id === id)) continue;
      m.look.obj.removeFromParent();
      this.modules.delete(id);
    }
    if (s) {
      for (const m of s.modules) {
        if (this.modules.has(m.id)) continue;
        const look = this.looks.build(m.kind);
        // A beacon on top (red on the first lander, which marks the site).
        const beacon = glowSprite(this.glow, m.kind === 'lander' ? '#ff4a3a' : '#7fe0ff', 0.9);
        beacon.position.y = new THREE.Box3().setFromObject(look.obj).max.y + 0.2;
        look.obj.add(beacon);
        look.obj.position.set(m.x, this.ground(m.x, m.z), m.z);
        this.root.add(look.obj);
        this.modules.set(m.id, { id: m.id, kind: m.kind, look, beacon, kit: this.looks.kit });
      }
      this.syncWalkways(s.modules);
      this.syncCrates(s.depot, s.modules.length > 0);
      const working = s.modules.some((m) => m.kind === 'solarfarm');
      const goingHome = s.flights.some((f) => f.home);
      for (const m of this.modules.values()) {
        const blink = Math.sin(t * 2.6 + m.id * 1.7) > 0.55;
        (m.beacon.material as THREE.SpriteMaterial).opacity = blink ? 1 : 0.18;
        const v = m.look.vehicle;
        if (!v) continue;
        if (m.kind === 'rover') this.rover(m, working ? this.sim.state.time : -1);
        else if (m.kind === 'drill') this.drill(m, working, t);
        // The ascent vehicle is away while it flies the minerals up (another is readied from what the base makes).
        else if (m.kind === 'ascent') v.visible = !goingHome;
      }
    }
    // Flights.
    const live = new Set<number>();
    for (const f of s?.flights ?? []) {
      live.add(f.id);
      let v = this.flights.get(f.id);
      if (!v) {
        const from = this.origins.get(f.id) ??
          this.sim.state.buildings.find((b) => b.kind === 'port') ?? { x: 0, z: 0 };
        v = new FlightView(
          f,
          from,
          this.scene,
          this.fx,
          this.ground,
          this.looks,
          f.home ? this.liftPoint() : null,
        );
        this.flights.set(f.id, v);
      }
      if (f.t < flightTime) v.update(f, dt, t);
    }
    for (const [id, v] of this.flights) {
      if (live.has(id)) continue;
      this.flights.delete(id);
      if (v.home) this.resting.push(v);
      else v.dispose();
    }
    this.resting = this.resting.filter((v) => {
      v.rest(dt);
      if (v.linger < 25) return true;
      v.dispose();
      return false;
    });
  }

  /** Space deposits get their look (checked when the node count changes: a save or a LAN world comes in). */
  private syncNodes(): void {
    const all = this.sim.state.nodes;
    if (all.length === this.nodeCount) return;
    this.nodeCount = all.length;
    const ids = new Set<number>();
    for (const n of all) {
      if (!inSpace(n.z)) continue;
      ids.add(n.id);
      if (this.nodes.has(n.id)) continue;
      const obj = depositModel(n.kind, this.glow);
      obj.position.set(n.x, spaceHeight(n.x, n.z), n.z);
      this.root.add(obj);
      this.nodes.set(n.id, { obj, shake: 0, scale: n.amount > 0 ? 1 : 0.1, target: n.amount > 0 ? 1 : 0.1 });
    }
    for (const [id, v] of this.nodes) {
      if (ids.has(id)) continue;
      v.obj.removeFromParent();
      this.nodes.delete(id);
    }
  }

  /** Where the ascent vehicle stands (on its stage), for a flight home lifting off. */
  private liftPoint(): THREE.Vector3 | null {
    for (const m of this.modules.values()) {
      if (m.kind !== 'ascent') continue;
      const o = m.look.obj.position;
      return new THREE.Vector3(o.x, o.y + m.look.vehicleY, o.z);
    }
    const at = slotOf('ascent');
    return new THREE.Vector3(at.x, spaceHeight(at.x, at.z) + STAGE_H, at.z);
  }

  /** Walkways from the first lander out to every other module (rebuilt when the base changes). */
  private syncWalkways(modules: readonly { id: number; kind: PayloadId; x: number; z: number }[]): void {
    const key = modules.map((m) => m.id).join(',');
    if (key === this.walkKey) return;
    this.walkKey = key;
    for (const c of [...this.walkways.children]) c.removeFromParent();
    const hub = modules.find((m) => m.kind === 'lander');
    if (!hub) return;
    const deck = lam('#8d939f');
    const stripe = lam('#e0b23a');
    for (const m of modules) {
      if (m === hub) continue;
      const dx = m.x - hub.x;
      const dz = m.z - hub.z;
      const d = Math.hypot(dx, dz);
      const a0 = PAYLOADS.lander.half + 0.6;
      const a1 = d - PAYLOADS[m.kind].half - 0.4;
      const len = a1 - a0;
      if (len < 1) continue;
      const mid = (a0 + a1) / 2;
      const x = hub.x + (dx / d) * mid;
      const z = hub.z + (dz / d) * mid;
      const strip = new THREE.Group();
      strip.position.set(x, this.ground(x, z) + 0.03, z);
      strip.rotation.y = Math.atan2(-dz, dx);
      strip.add(new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 1.1), deck));
      for (const side of [-1, 1]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.09), stripe);
        edge.position.z = side * 0.5;
        strip.add(edge);
      }
      for (let i = 1; i < len / 1.2; i++) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.065, 0.9), lam('#6f7581'));
        seam.position.x = -len / 2 + i * 1.2;
        strip.add(seam);
      }
      strip.traverse((o) => (o.receiveShadow = true));
      this.walkways.add(strip);
    }
  }

  /** Crates by the ascent vehicle's pad: one for every two things in the depot (up to 18). */
  private syncCrates(depot: Partial<Record<string, number>>, base: boolean): void {
    const total = Object.values(depot).reduce((n: number, v) => n + (v ?? 0), 0);
    const n = base ? Math.min(18, Math.ceil(total / 2)) : 0;
    const key = `${n}/${this.looks.kit}`;
    if (key === this.crateKey) return;
    this.crateKey = key;
    for (const c of [...this.crates.children]) c.removeFromParent();
    const at = { x: SPACE.x + DEPOT.x, z: SPACE.z + DEPOT.z };
    this.crates.position.set(at.x, this.ground(at.x, at.z), at.z);
    const plain = lam('#c8ccd6');
    for (let i = 0; i < n; i++) {
      const layer = Math.floor(i / 9);
      const x = ((i % 9) % 3) - 1;
      const z = Math.floor((i % 9) / 3) - 1;
      const crate = this.looks.kit
        ? this.assets.model('space', i % 3 === 1 ? 'cargo_B' : 'cargo_A')
        : new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.52, 0.5).translate(0, 0.26, 0), plain);
      crate.scale.setScalar(2);
      crate.position.set(x * 1.1, layer * 1.04, z * 1.1);
      crate.rotation.y = (i * 0.37) % 0.3;
      this.crates.add(crate);
    }
  }

  /**
   * The rover's round (only while the solar farm powers the base; `time` < 0: parked): off its
   * stage, out to a deposit — nickel-iron mostly, ice every third trip — digging there, and back.
   */
  private rover(m: ModuleView, time: number): void {
    const v = m.look.vehicle!;
    const home = m.look.obj.position;
    if (time < 0) {
      v.position.set(0, m.look.vehicleY, 0);
      v.rotation.y = 0;
      return;
    }
    const every = BASE_WORK.rover.every;
    const trip = Math.floor(time / every);
    const ph = (time % every) / every;
    const kind = trip % 3 === 2 ? 'icefield' : 'metalrock';
    let best: { x: number; z: number } | null = null;
    let bd = Infinity;
    for (const n of this.sim.state.nodes) {
      if (n.kind !== kind || !inSpace(n.z)) continue;
      const d = Math.hypot(n.x - home.x, n.z - home.z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (!best) return;
    const dx = best.x - home.x;
    const dz = best.z - home.z;
    const d = Math.hypot(dx, dz);
    const reach = Math.max(0, d - 1.8);
    const out =
      ph < 0.05 ? 0 : ph < 0.4 ? (ph - 0.05) / 0.35 : ph < 0.6 ? 1 : ph < 0.95 ? 1 - (ph - 0.6) / 0.35 : 0;
    const along = THREE.MathUtils.smoothstep(out, 0, 1) * reach;
    const wx = home.x + (dx / d) * along;
    const wz = home.z + (dz / d) * along;
    // On its stage at the start and end of a trip; on the ground in between.
    const onStage = ph < 0.05 || ph >= 0.95;
    v.position.set(wx - home.x, onStage ? m.look.vehicleY : this.ground(wx, wz) - home.y + 0.02, wz - home.z);
    // Nose first: out to the deposit, then back home.
    const way = ph >= 0.6 && ph < 0.95 ? -1 : 1;
    v.rotation.y = Math.atan2(way * dx, way * dz);
    if (ph >= 0.4 && ph < 0.6 && Math.random() < 0.35) {
      const p = v.getWorldPosition(new THREE.Vector3());
      this.fx.burst(p.x + (dx / d) * 0.9, p.y + 0.3, p.z + (dz / d) * 0.9, 2, {
        color: kind === 'icefield' ? '#dff3ff' : '#c8d4e6',
        size: 0.18,
        life: 0.5,
        speed: 2.5,
        up: 2,
        gravity: 2,
        tex: 'spark',
      });
    }
  }

  /** The drill at work (while there's power): a shudder, dust and the odd spark at its foot. */
  private drill(m: ModuleView, working: boolean, t: number): void {
    const v = m.look.vehicle!;
    v.position.x = working ? Math.sin(t * 47) * 0.015 : 0;
    if (!working || Math.random() > 0.25) return;
    const p = m.look.obj.position;
    const a = Math.random() * Math.PI * 2;
    this.fx.puff({
      x: p.x + Math.cos(a) * 0.6,
      y: p.y + 0.3,
      z: p.z + Math.sin(a) * 0.6,
      vx: Math.cos(a) * 1.5,
      vz: Math.sin(a) * 1.5,
      vy: 0.4,
      life: 1,
      size: 0.4,
      size1: 1.2,
      color: '#a7abb8',
      alpha: 0.45,
      tex: 'smoke',
    });
    if (Math.random() < 0.3)
      this.fx.burst(p.x, p.y + 0.4, p.z, 2, {
        color: '#7fe0c0',
        size: 0.14,
        life: 0.45,
        speed: 2,
        up: 2,
        gravity: 2,
        tex: 'spark',
      });
  }

  /** Vapour breathing out of the ice near the camera. */
  private vents(dt: number, at: { x: number; z: number }): void {
    this.ventT -= dt;
    if (this.ventT > 0) return;
    this.ventT = 0.18;
    for (const n of this.sim.state.nodes) {
      if (
        n.kind !== 'icefield' ||
        n.amount <= 0 ||
        !inSpace(n.z) ||
        Math.hypot(n.x - at.x, n.z - at.z) > 80 ||
        Math.random() > 0.3
      )
        continue;
      this.fx.puff({
        x: n.x + (Math.random() - 0.5) * 0.6,
        y: spaceHeight(n.x, n.z) + 0.5,
        z: n.z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 0.6,
        vz: (Math.random() - 0.5) * 0.6,
        vy: 1.8 + Math.random() * 1.2,
        life: 1.6,
        size: 0.5,
        size1: 2.4,
        color: '#e6f6ff',
        alpha: 0.3,
        tex: 'smoke',
      });
    }
  }
}
