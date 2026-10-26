// Rail points initialize parallel coordinate/distance arrays; sampling uses clamped binary-search neighbors. Train methods run only after the locomotive is installed.
/**
 * The rail line (game/rails.ts) in the world: the toy train set's track pieces (Holiday Bits, in
 * kits/bits.glb) laid from a mine head toward the forge, and a little steam engine with two ore
 * carts. It waits by the mine head; when someone comes up the lift with ore (the sim's `railLoaded`
 * — the ore is already in the forge's tray) the carts fill, it runs to the forge, tips the ore in and
 * comes back. Laid again whenever the line changes (a building put in its way, a new forge).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Sim } from '../game/sim.ts';
import { groundHeight } from '../game/map.ts';
import { RAIL, railLine, railPoints, type RailLine, type RailStep } from '../game/rails.ts';
import type { Assets } from './assets.ts';
import { Blobs } from './blobs.ts';
import type { Fx } from './fx.ts';

const KIT = 'bits';
const S = RAIL.unit;
const SQ = 2 * S;
/** The track sits this far over the ground (its sleepers are 0.05 · S thick). */
const LIFT = 0.012;
/** The train: top speed (m/s), how long it takes to get going / to stop, and the pause to tip the ore. */
const TRAIN = { speed: 2.4, ease: 2.2, tip: 1.6, gap: 0.05 * S };
/** Lengths of the cars (the models' own, at scale 1). */
const CARS: { model: string; len: number }[] = [
  { model: 'train_locomotive', len: 0.86 },
  { model: 'train_tender_empty', len: 0.64 },
  { model: 'train_tender_empty', len: 0.64 },
];

const Y = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3(S, S, S);

export class RailsView {
  private sim: Sim;
  private assets: Assets;
  private fx: Fx;

  readonly group = new THREE.Group();
  private key = '';
  private line: RailLine | null = null;
  /** The middle line: points, their ground heights and the distance along to each. */
  private px: number[] = [];
  private pz: number[] = [];
  private py: number[] = [];
  private along: number[] = [];
  private length = 0;
  private trackMeshes: THREE.InstancedMesh[] = [];
  private train: { obj: THREE.Object3D; len: number; ore: THREE.Object3D | null }[] = [];
  private trainLen = 0;
  private blobs: Blobs;
  /** Where the engine's middle is along the line, and what the train is doing. */
  private at = 0;
  private mode: 'wait' | 'out' | 'tip' | 'back' = 'wait';
  private t = 0;
  /** Ore waiting to ride (count) and riding now. */
  private queued = 0;
  private riding = 0;
  private checkT = 0;
  private asked = false;

  constructor(sim: Sim, assets: Assets, fx: Fx) {
    this.sim = sim;
    this.assets = assets;
    this.fx = fx;

    this.blobs = new Blobs(8, 0.32, (x, z) => groundHeight(sim.world, x, z));
    this.group.add(this.blobs.mesh);
    this.group.name = 'rails';
    sim.events.on('railLoaded', (e) => {
      this.queued += e.count;
      const m = sim.state.mines[e.mine];
      const h = sim.getAs(e.hero, 'hero');
      const x = h?.x ?? m?.exit.x ?? 0;
      const z = h?.z ?? m?.exit.z ?? 0;
      fx.text(
        x,
        groundHeight(sim.world, x, z) + 0.9,
        z,
        `${e.count} ore onto the rails`,
        'status level',
        1.6,
      );
    });
    // Just invented: say where the line runs (or what it still needs) once it's laid.
    sim.events.on('invented', (e) => {
      if (e.milestone === 'rails' && e.quality > 0) this.announce = e.hero;
    });
  }

  /** The hero who just invented rails (0: nobody to tell). */
  private announce = 0;

  private tell(line: RailLine | null): void {
    const h = this.sim.getAs(this.announce, 'hero');
    this.announce = 0;
    const at = line
      ? this.sample(0)
      : h
        ? { x: h.x, y: groundHeight(this.sim.world, h.x, h.z), z: h.z }
        : null;
    if (!at) return;
    const say = !line
      ? 'Rails: a forge near a mine head gets ore carts'
      : line.reaches
        ? 'Rails to the forge: bring ore up the lift'
        : 'The rails stop short of the forge: build one nearer';
    this.fx.text(at.x, at.y + 1.1, at.z, say, 'status level', 3.2);
  }

  /** What the line depends on: the road done, the forges and whatever stands on the grid. */
  private layoutKey(): string {
    const s = this.sim.state;
    if (!(s.road?.done ?? []).includes('rails')) return '';
    let k = `${s.buildings.length}/${s.sites.length}`;
    for (const b of s.buildings) k += `,${b.id}${b.hp > 0 ? '' : 'x'}`;
    for (const site of s.sites) k += `;${site.id}`;
    return k;
  }

  update(dt: number): void {
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.5;
      const key = this.layoutKey();
      if (key && !this.assets.has(KIT, 'tracks_straight')) {
        if (!this.asked) {
          this.asked = true;
          void this.assets.loadKit(KIT).then(() => (this.key = '#'));
        }
      } else if (key !== this.key) {
        this.key = key;
        this.lay(key ? railLine(this.sim) : null);
      }
    }
    if (!this.line || !this.train.length) return;
    this.run(dt);
    this.place();
  }

  // ---- Laying the track ---------------------------------------------------------------------------

  private clear(): void {
    for (const m of this.trackMeshes) {
      this.group.remove(m);
      m.dispose();
    }
    this.trackMeshes = [];
    for (const c of this.train) this.group.remove(c.obj);
    this.train = [];
    this.blobs.begin();
    this.blobs.end();
  }

  private lay(line: RailLine | null): void {
    this.clear();
    this.line = line;
    if (!line || !line.steps.length) {
      if (this.announce) this.tell(null);
      return;
    }
    const g = (x: number, z: number) => groundHeight(this.sim.world, x, z);
    // The middle line, for the train.
    const pts = railPoints(line, 0.2);
    if (pts.length < 2) throw new Error('A rail line needs at least two points');
    this.px = pts.map((p) => p.x);
    this.pz = pts.map((p) => p.z);
    this.py = pts.map((p) => g(p.x, p.z) + LIFT + 0.05 * S);
    this.along = [0];
    for (let i = 1; i < pts.length; i++)
      this.along.push(
        this.along[i - 1]! + Math.hypot(this.px[i]! - this.px[i - 1]!, this.pz[i]! - this.pz[i - 1]!),
      );
    this.length = this.along[this.along.length - 1]!;

    // The pieces: two straights across each square, a curve for each turn.
    const straights: THREE.Matrix4[] = [];
    const curves: THREE.Matrix4[] = [];
    for (const s of line.steps) {
      if (s.turn) curves.push(curveMatrix(s, g));
      else
        for (const k of [0.5, 1.5])
          straights.push(straightMatrix(s.x + s.hx * S * k, s.z + s.hz * S * k, s.hx, s.hz, g));
    }
    this.instance('tracks_straight', straights);
    this.instance('tracks_curve', curves);

    // The train: as many cars as fit on the line.
    let len = 0;
    for (const [i, c] of CARS.entries()) {
      if (i > 0 && len + (c.len + TRAIN.gap) * S > this.length - 0.2) break;
      const obj = this.assets.model(KIT, c.model);
      obj.scale.setScalar(S);
      this.assets.patchTree(obj);
      let ore: THREE.Object3D | null = null;
      if (c.model === 'train_tender_empty' && this.assets.has('resources', 'Iron_Nugget_Medium')) {
        ore = orePile(this.assets);
        obj.add(ore);
        ore.visible = false;
      }
      this.group.add(obj);
      this.train.push({ obj, len: c.len * S, ore });
      len += c.len * S + (i ? TRAIN.gap : 0);
    }
    this.trainLen = len;
    this.mode = 'wait';
    this.at = this.homeAt();
    this.riding = 0;
    if (this.announce) this.tell(line);
  }

  private instance(model: string, mats: THREE.Matrix4[]): void {
    if (!mats.length) return;
    for (const part of this.assets.parts(KIT, model)) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, tmpM.multiplyMatrices(m, part.matrix)));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.name = model;
      this.group.add(im);
      this.trackMeshes.push(im);
    }
  }

  // ---- The train ----------------------------------------------------------------------------------

  /** The engine's spot when the whole train stands at the mine end (the carts by the mine head). */
  private homeAt(): number {
    return Math.min(this.length, this.trainLen - this.train[0]!.len / 2);
  }

  /** The engine's spot at the far end (its nose at the buffer). */
  private endAt(): number {
    return Math.max(this.homeAt(), this.length - this.train[0]!.len / 2);
  }

  private run(dt: number): void {
    const home = this.homeAt();
    const end = this.endAt();
    const span = Math.max(0.01, end - home);
    // Ease in and out over the first and last metres; never stop dead mid-line.
    const speed = (d: number) =>
      TRAIN.speed * Math.max(0.18, Math.min(1, Math.min(d - home, end - d) / TRAIN.ease + 0.18));
    switch (this.mode) {
      case 'wait':
        this.at = home;
        if (this.queued > 0) {
          this.riding = this.queued;
          this.queued = 0;
          this.mode = 'out';
        }
        break;
      case 'out':
        this.steam(dt);
        this.at = Math.min(end, this.at + speed(this.at) * dt);
        if (this.at >= end - 1e-4 || span < 0.05) {
          this.mode = 'tip';
          this.t = 0;
        }
        break;
      case 'tip':
        this.t += dt;
        if (this.t > TRAIN.tip * 0.5 && this.riding) {
          const f = this.sim.getAs(this.line!.forge, 'building');
          const e = this.sample(this.length);
          if (f && this.line!.reaches)
            this.fx.puff({
              x: e.x,
              y: e.y + 0.35,
              z: e.z,
              vy: 0.5,
              life: 0.9,
              size: 0.6,
              size1: 1.1,
              color: '#8a7a6a',
              alpha: 0.45,
              tex: 'smoke',
            });
          this.riding = 0;
        }
        if (this.t >= TRAIN.tip) this.mode = 'back';
        break;
      case 'back':
        this.steam(dt);
        this.at = Math.max(home, this.at - speed(this.at) * dt);
        if (this.at <= home + 1e-4) this.mode = 'wait';
        break;
    }
    for (const c of this.train) if (c.ore) c.ore.visible = this.riding > 0;
  }

  /** Puffs of steam from the engine's chimney while it runs. */
  private steamT = 0;
  private steam(dt: number): void {
    this.steamT -= dt;
    if (this.steamT > 0) return;
    this.steamT = 0.22;
    const e = this.train[0]!.obj;
    const p = e.localToWorld(tmpV.set(0, 0.62, 0.3));
    this.fx.puff({
      x: p.x,
      y: p.y,
      z: p.z,
      vy: 0.9,
      vx: 0.05,
      life: 1.3,
      size: 0.12 * S,
      size1: 0.45 * S,
      color: '#e8e8e8',
      alpha: 0.35,
      tex: 'smoke',
      drag: 0.5,
    });
  }

  /** Puts every car on the line (engine first, toward the far end), its wheels on the rails. */
  private place(): void {
    this.blobs.begin();
    let d = this.at + this.train[0]!.len / 2;
    const tipK = this.mode === 'tip' ? Math.sin(Math.min(1, this.t / TRAIN.tip) * Math.PI) : 0;
    for (const [i, c] of this.train.entries()) {
      const mid = d - c.len / 2;
      const a = this.sample(mid - c.len / 2);
      const b = this.sample(mid + c.len / 2);
      const m = this.sample(mid);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const yaw = Math.atan2(dx, dz);
      const pitch = Math.atan2(b.y - a.y, Math.hypot(dx, dz) || 1);
      // Tipping the ore out: the carts lean over to the side at the far end.
      const roll = i > 0 ? tipK * 0.45 : 0;
      c.obj.rotation.set(-pitch, yaw, roll, 'YXZ');
      c.obj.position.set(m.x, m.y, m.z);
      this.blobs.add(m.x, m.z, 0.42 * S);
      d -= c.len + TRAIN.gap;
    }
    this.blobs.end();
  }

  /** The point `d` along the middle line (clamped to it). */
  private sample(d: number): { x: number; y: number; z: number } {
    const al = this.along;
    const n = al.length;
    if (d <= 0) return this.extrapolate(0, 1, d);
    if (d >= this.length) return this.extrapolate(n - 1, n - 2, d - this.length);
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (al[mid]! <= d) lo = mid;
      else hi = mid;
    }
    const f = (d - al[lo]!) / Math.max(1e-6, al[hi]! - al[lo]!);
    return {
      x: this.px[lo]! + (this.px[hi]! - this.px[lo]!) * f,
      y: this.py[lo]! + (this.py[hi]! - this.py[lo]!) * f,
      z: this.pz[lo]! + (this.pz[hi]! - this.pz[lo]!) * f,
    };
  }

  /** Off an end of the line: straight on from it (a car's far wheels never hang off a cliff). */
  private extrapolate(i: number, j: number, over: number): { x: number; y: number; z: number } {
    const l = Math.max(1e-6, Math.hypot(this.px[i]! - this.px[j]!, this.pz[i]! - this.pz[j]!));
    const k = Math.abs(over) / l;
    return {
      x: this.px[i]! + (this.px[i]! - this.px[j]!) * k,
      y: this.py[i]!,
      z: this.pz[i]! + (this.pz[i]! - this.pz[j]!) * k,
    };
  }
}

/** A straight piece centred at (x, z) along (hx, hz), its ends on the ground. */
function straightMatrix(
  x: number,
  z: number,
  hx: number,
  hz: number,
  g: (x: number, z: number) => number,
): THREE.Matrix4 {
  const y0 = g(x - (hx * S) / 2, z - (hz * S) / 2);
  const y1 = g(x + (hx * S) / 2, z + (hz * S) / 2);
  const e = new THREE.Euler(-Math.atan2(y1 - y0, S), Math.atan2(hx, hz), 0, 'YXZ');
  return new THREE.Matrix4().compose(tmpV.set(x, (y0 + y1) / 2 + LIFT, z), tmpQ.setFromEuler(e), tmpS);
}

/**
 * A curve piece for a quarter turn. The toy set's curve runs round its own origin at radius 2, from
 * (2, 0) heading +z to (0, 2) heading −x; a turn the other way is the same piece laid from its end.
 * It is tilted to the plane through the ground at its two ends and its middle.
 */
function curveMatrix(s: RailStep, g: (x: number, z: number) => number): THREE.Matrix4 {
  const ox = s.x + s.nx * SQ;
  const oz = s.z + s.nz * SQ;
  const left = s.hx * s.nz - s.hz * s.nx > 0;
  const yaw = left ? Math.atan2(s.hx, s.hz) : Math.atan2(-s.nx, -s.nz);
  const ex = s.x + (s.hx + s.nx) * SQ;
  const ez = s.z + (s.hz + s.nz) * SQ;
  const c = Math.SQRT1_2;
  const mx = ox - s.nx * SQ * c + s.hx * SQ * c;
  const mz = oz - s.nz * SQ * c + s.hz * SQ * c;
  const a = new THREE.Vector3(s.x, g(s.x, s.z), s.z);
  const b = new THREE.Vector3(ex, g(ex, ez), ez);
  const m = new THREE.Vector3(mx, g(mx, mz), mz);
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(m, a)).normalize();
  if (n.y < 0) n.negate();
  if (n.y < 0.5) n.set(0, 1, 0);
  // The plane's height under the piece's origin.
  const oy = a.y - (n.x * (ox - a.x) + n.z * (oz - a.z)) / n.y;
  const q = new THREE.Quaternion()
    .setFromUnitVectors(Y, n)
    .multiply(new THREE.Quaternion().setFromAxisAngle(Y, yaw));
  return new THREE.Matrix4().compose(new THREE.Vector3(ox, oy + LIFT, oz), q, tmpS);
}

/** A heap of iron ore (the game's ore nuggets) that fills an empty cart: one mesh per material. */
function orePile(assets: Assets): THREE.Object3D {
  const g = new THREE.Group();
  const spots: [number, number, number, number][] = [
    [-0.08, 0.36, -0.14, 0.4],
    [0.09, 0.37, -0.12, 2.1],
    [0, 0.38, 0.02, 1.2],
    [-0.09, 0.36, 0.15, 3.3],
    [0.08, 0.36, 0.14, 4.4],
    [0, 0.43, -0.04, 5.1],
  ];
  for (const [x, y, z, r] of spots) {
    const n = assets.model('resources', 'Iron_Nugget_Medium');
    const box = new THREE.Box3().setFromObject(n);
    const size = box.getSize(new THREE.Vector3());
    n.scale.setScalar(0.2 / Math.max(size.x, size.y, size.z, 1e-3));
    n.position.set(x, y, z);
    n.rotation.set(r, r * 1.7, 0);
    g.add(n);
  }
  g.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(
      m.matrixWorld,
    );
    byMat.set(m.material, [...(byMat.get(m.material) ?? []), geo]);
  });
  const out = new THREE.Group();
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (merged) out.add(new THREE.Mesh(merged, mat));
  }
  assets.patchTree(out);
  return out;
}
