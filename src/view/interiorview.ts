/**
 * A building's room, drawn from its InteriorDef (see game/interiors.ts): KayKit's dungeon walls two
 * storeys high, floors, lofts and stairs, the furniture, torches burning on the walls, a forge with
 * its fire, the room's fixtures that move with the work (the sawmill's blade spins, the forge's
 * bellows pump and its moulds glow, the arcanist's runes turn), and the station's trays — what it has
 * been given and what it has made, set out where the room keeps them.
 *
 * As in KayKit's dioramas, the walls between the camera and the room are cut away: whichever walls
 * the camera is beyond go (with everything hung on them), the rest stand. Each wall's pieces are
 * merged into a mesh per material, the rest of the room likewise: a room is a handful of draw calls.
 * Pieces from the town's kit (it streams in after the world) join the room the moment it lands.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Building } from '../game/types.ts';
import type { ItemId } from '../game/content.ts';
import {
  INTERIORS,
  interiorOrigin,
  type Fixture,
  type InteriorDef,
  type Piece,
  type Side,
} from '../game/interiors.ts';
import { patchMaterial, type Assets, type KitName } from './assets.ts';
import { flickerFlame, makeFlame } from './flame.ts';
import { itemMesh } from './itemmodels.ts';
import { crystalCluster } from './procmodels.ts';
import type { Fx } from './fx.ts';

const stone = patchMaterial(new THREE.MeshLambertMaterial({ color: '#8d8a86', flatShading: true }));
const darkStone = patchMaterial(new THREE.MeshLambertMaterial({ color: '#5d5a58', flatShading: true }));
const capStone = patchMaterial(new THREE.MeshLambertMaterial({ color: '#4a4846', flatShading: true }));
const coals = new THREE.MeshLambertMaterial({
  color: '#ff6a1a',
  emissive: '#ff4a00',
  emissiveIntensity: 1.4,
});
const wood = patchMaterial(new THREE.MeshLambertMaterial({ color: '#8a5a35', flatShading: true }));
const darkWood = patchMaterial(new THREE.MeshLambertMaterial({ color: '#5e3c24', flatShading: true }));
const leather = patchMaterial(new THREE.MeshLambertMaterial({ color: '#6b3f2a', flatShading: true }));
const steel = patchMaterial(new THREE.MeshLambertMaterial({ color: '#b9c2cc', flatShading: true }));
const molten = new THREE.MeshLambertMaterial({
  color: '#ffb347',
  emissive: '#ff6a00',
  emissiveIntensity: 1.6,
});

const SIDES: Side[] = ['back', 'front', 'left', 'right'];

/** One mesh per material out of everything under `root` that stays put (a room's walls, its furniture). */
function merged(root: THREE.Object3D): THREE.Object3D {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material) || !m.visible) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.morphAttributes = {};
    for (const k of Object.keys(g.attributes))
      if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const key = `${m.material.uuid}|${Object.keys(g.attributes).sort().join(',')}`;
    let e = groups.get(key);
    if (!e) groups.set(key, (e = { mat: m.material, geos: [] }));
    e.geos.push(g);
  });
  const out = new THREE.Group();
  for (const { mat, geos } of groups.values()) {
    const geo = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    if (geo) out.add(new THREE.Mesh(geo, mat));
  }
  return out;
}

/** A fixture's model, made in code (see interiors.ts Fixture). Its moving part is `userData.moving`. */
function fixtureModel(f: Fixture, glowTex: THREE.Texture): THREE.Object3D {
  const g = new THREE.Group();
  const box = (
    sx: number,
    sy: number,
    sz: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    parent: THREE.Object3D = g,
  ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const s = f.s;
  if (f.kind === 'saw') {
    // A big round blade standing in the bench's slot, its teeth all round (it spins about x).
    const blade = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(s * 0.5, s * 0.5, s * 0.03, 28).rotateZ(Math.PI / 2),
      steel,
    );
    blade.add(disc);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const t = new THREE.Mesh(new THREE.ConeGeometry(s * 0.045, s * 0.09, 3).rotateZ(Math.PI / 2), steel);
      t.position.set(0, Math.cos(a) * s * 0.52, Math.sin(a) * s * 0.52);
      t.rotation.x = -a;
      blade.add(t);
    }
    box(s * 0.08, s * 0.1, s * 0.1, 0, 0, 0, darkWood, blade);
    blade.position.y = s * 0.12;
    g.add(blade);
    g.userData['moving'] = blade;
  } else if (f.kind === 'bellows') {
    // A leather bellows on a timber frame, its nozzle into the hearth; the top board rises and falls.
    box(s * 0.9, s * 0.3, s * 0.08, 0, s * 0.15, -s * 0.25, darkWood);
    box(s * 0.9, s * 0.3, s * 0.08, 0, s * 0.15, s * 0.25, darkWood);
    const lower = box(s * 0.8, s * 0.06, s * 0.5, 0, s * 0.32, 0, wood);
    void lower;
    const hinge = new THREE.Group();
    hinge.position.set(s * 0.4, s * 0.36, 0);
    const top = box(s * 0.8, s * 0.06, s * 0.5, -s * 0.4, s * 0.12, 0, wood, hinge);
    void top;
    const bag = new THREE.Mesh(
      new THREE.CylinderGeometry(s * 0.22, s * 0.22, s * 0.7, 6, 1).rotateZ(Math.PI / 2),
      leather,
    );
    bag.scale.set(1, 0.55, 1);
    bag.position.set(-s * 0.05, s * 0.06, 0);
    hinge.add(bag);
    box(s * 0.36, s * 0.05, s * 0.06, -s * 0.95, s * 0.12, 0, wood, hinge);
    g.add(hinge);
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(s * 0.04, s * 0.07, s * 0.45, 8).rotateZ(Math.PI / 2),
      steel,
    );
    nozzle.position.set(s * 0.62, s * 0.36, 0);
    g.add(nozzle);
    g.userData['moving'] = hinge;
  } else if (f.kind === 'moulds') {
    // A low stone table of moulds; molten iron glows in them while the work goes on.
    box(s * 1.3, s * 0.32, s * 0.7, 0, s * 0.16, 0, stone);
    box(s * 1.36, s * 0.04, s * 0.76, 0, s * 0.33, 0, capStone);
    const glow = new THREE.Group();
    for (let i = 0; i < 3; i++)
      box(s * 0.3, s * 0.03, s * 0.16, (i - 1) * s * 0.4, s * 0.355, 0, molten, glow);
    g.add(glow);
    g.userData['moving'] = glow;
  } else if (f.kind === 'runes') {
    // A circle of glowing runes over the bench, turning.
    const ring = new THREE.Group();
    const mat = new THREE.SpriteMaterial({
      map: glowTex,
      color: '#b38cff',
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const sp = new THREE.Sprite(mat);
      sp.scale.setScalar(s * (i % 3 ? 0.16 : 0.24));
      sp.position.set(Math.cos(a) * s * 0.5, 0, Math.sin(a) * s * 0.5);
      ring.add(sp);
    }
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(s * 0.5, s * 0.012, 4, 40).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: '#c9a8ff',
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    ring.add(band);
    g.add(ring);
    g.userData['moving'] = ring;
  } else if (f.kind === 'crystal') {
    const c = crystalCluster(Math.round(f.x * 97 + f.z * 31));
    c.scale.setScalar(s * 1.6);
    g.add(c);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: '#a77bff',
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.7,
      }),
    );
    halo.scale.setScalar(s * 2.2);
    halo.position.y = s * 0.5;
    g.add(halo);
  }
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.rot;
  return g;
}

export class InteriorView {
  private assets: Assets;
  private fx: Fx;

  readonly root = new THREE.Group();
  private def: InteriorDef;
  /** The walls (and what hangs on them), side by side, to cut away. */
  private walls = {} as Record<Side, THREE.Group>;
  /** Pieces standing in two walls (the corner pillars): they go with either. */
  private corners: THREE.Object3D[] = [];
  private flames: THREE.Group[] = [];
  private trays = new THREE.Group();
  private trayKey = '';
  private time = 0;
  /** Pieces still waiting for their kit (the town's), added when it lands. */
  private waiting: Piece[] = [];
  private fixtures: { f: Fixture; obj: THREE.Object3D }[] = [];
  /** Light pools to paint (world): torches, the forge, a cauldron's or a crystal's glow. */
  readonly lights: { x: number; y: number; z: number; r: number; fire: boolean; color?: string }[] = [];

  constructor(assets: Assets, fx: Fx, b: Building, glowTex: THREE.Texture) {
    this.assets = assets;
    this.fx = fx;

    this.def = INTERIORS[b.kind]!;
    const def = this.def;
    const o = interiorOrigin(b.kind, b.interior ?? 0);
    this.root.position.set(o.x, 0, o.z);
    for (const s of SIDES) {
      this.walls[s] = new THREE.Group();
      this.root.add(this.walls[s]);
    }
    this.build(def.pieces);
    if (this.waiting.length) void assets.loadKit('town').then(() => this.build(this.waiting.splice(0)));
    if (def.hearth) this.buildHearth(def.hearth);
    for (const f of def.fires) {
      const flame = makeFlame(glowTex, f.size);
      flame.position.set(f.x, f.y, f.z);
      this.root.add(flame);
      this.flames.push(flame);
      this.lights.push({ x: o.x + f.x, y: f.y, z: o.z + f.z, r: 3.2, fire: true });
    }
    for (const g of def.glows ?? [])
      this.lights.push({ x: o.x + g.x, y: g.y, z: o.z + g.z, r: g.r, fire: false, color: g.color });
    for (const f of def.fixtures ?? []) {
      const obj = fixtureModel(f, glowTex);
      this.root.add(obj);
      this.fixtures.push({ f, obj });
    }
    // Torches on the walls, burning.
    for (const t of def.torches) {
      const wall = this.walls[t.side];
      if (assets.has('dungeon', 'torch_mounted')) {
        const torch = assets.model('dungeon', 'torch_mounted');
        torch.scale.setScalar(0.2);
        torch.position.set(t.x, t.y, t.z);
        torch.rotation.y = t.rot;
        assets.patchTree(torch);
        wall.add(torch);
      }
      const flame = makeFlame(glowTex, 0.2);
      flame.position.set(t.x + Math.sin(t.rot) * 0.1, t.y + 0.14, t.z + Math.cos(t.rot) * 0.1);
      wall.add(flame);
      this.flames.push(flame);
      this.lights.push({
        x: o.x + t.x + Math.sin(t.rot) * 0.4,
        y: t.y + 0.1,
        z: o.z + t.z + Math.cos(t.rot) * 0.4,
        r: 2.2,
        fire: false,
      });
    }
    this.root.add(this.trays);
  }

  /**
   * Adds pieces to the room: each wall's (and the rest) merged into a mesh per material; corner
   * pillars stay their own (they go with either of their walls). Pieces whose kit hasn't come yet wait.
   */
  private build(pieces: Piece[]): void {
    const assets = this.assets;
    const buckets = new Map<Side | 'room', THREE.Group>();
    for (const p of pieces) {
      if (!assets.has(p.kit as KitName, p.model)) {
        if (p.kit === 'town') this.waiting.push(p);
        continue;
      }
      let m = assets.model(p.kit as KitName, p.model);
      if (p.part) {
        const part = m.getObjectByName(p.part);
        if (!part) continue;
        part.removeFromParent();
        part.position.set(0, 0, 0);
        m = part;
      }
      m.scale.setScalar(p.scale);
      m.position.set(p.x, p.y ?? 0, p.z);
      m.rotation.set(p.rx ?? 0, p.rot ?? 0, 0, 'YXZ');
      assets.patchTree(m);
      if (p.sides && p.sides.length > 1) {
        m.userData['sides'] = p.sides;
        this.walls[p.sides[0]!].add(m); // Guard requires at least two sides.
        this.corners.push(m);
        continue;
      }
      const key = p.sides?.[0] ?? 'room';
      let g = buckets.get(key);
      if (!g) buckets.set(key, (g = new THREE.Group()));
      g.add(m);
    }
    for (const [key, g] of buckets) {
      const mesh = merged(g);
      (key === 'room' ? this.root : this.walls[key]).add(mesh);
    }
  }

  /** The forge: a stone hearth with a bed of live coals, a hood over it, and its chimney up the wall. */
  private buildHearth(h: NonNullable<InteriorDef['hearth']>): void {
    const w = h.x1 - h.x0;
    const d = h.z1 - h.z0;
    const cx = (h.x0 + h.x1) / 2;
    const cz = (h.z0 + h.z1) / 2;
    const g = new THREE.Group();
    const box = (
      sx: number,
      sy: number,
      sz: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material,
    ) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    // The hearth: a stone block with a lip of darker stone, the coals sunk in its top.
    box(w, h.h, d, cx, h.h / 2, cz, stone);
    box(w + 0.03, 0.045, d + 0.03, cx, h.h, cz, capStone);
    box(w * 0.62, 0.03, d * 0.5, cx + 0.05, h.h + 0.02, cz + 0.04, coals);
    // The hood: posts at the front corners and a sloping stone hood, then the chimney to the top.
    for (const s of [-1, 1])
      box(0.07, 0.44, 0.07, cx + s * (w / 2 - 0.08), h.h + 0.22, h.z1 - 0.06, darkStone);
    const hood = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.5, 0.36, 4, 1).rotateY(Math.PI / 4),
      darkStone,
    );
    hood.scale.set(w / 0.95, 1, d / 0.95);
    hood.position.set(cx, h.h + 0.62, cz - 0.03);
    g.add(hood);
    const chimneyY0 = h.h + 0.8;
    box(w * 0.42, h.top - chimneyY0, d * 0.5, cx, (h.top + chimneyY0) / 2, h.z0 + d * 0.25, stone);
    box(w * 0.5, 0.06, d * 0.58, cx, h.top, h.z0 + d * 0.25, capStone);
    this.root.add(g);
  }

  /** Every frame: the fires flicker, the fixtures move with the work, the trays show what's in them. Walls remain opaque. */
  update(dt: number, b: Building, camera: THREE.Camera): void {
    const cam = camera.position;
    // Only the room the camera is in is drawn (the others are far off in the dark).
    const o = this.root.position;
    this.root.visible = Math.abs(cam.x - o.x) < 30 && Math.abs(cam.z - o.z) < 30;
    if (!this.root.visible) return;
    this.time += dt;
    this.flames.forEach((f, i) => flickerFlame(f, this.time, 0.6, i * 1.7));
    // Embers off the forge now and then.
    const fire = this.def.fires[0];
    if (fire && Math.random() < dt * (b.busy ? 7 : 4)) {
      this.fx.glow({
        x: o.x + fire.x + (Math.random() - 0.5) * 0.3,
        y: fire.y + 0.15,
        z: o.z + fire.z,
        vy: 0.7 + Math.random() * 0.5,
        vx: (Math.random() - 0.5) * 0.2,
        life: 0.9,
        size: 0.04,
        size1: 0.01,
        color: '#ffc040',
        color1: '#ff3a10',
        tex: 'dot',
        drag: 0.5,
        gravity: 0,
      });
    }
    for (const { f, obj } of this.fixtures) {
      const moving = obj.userData['moving'] as THREE.Object3D | undefined;
      if (!moving) continue;
      if (f.kind === 'saw') {
        moving.rotation.x -= dt * (b.busy ? 16 : 0.4);
        if (b.busy && Math.random() < dt * 14) {
          const p = moving.getWorldPosition(new THREE.Vector3());
          this.fx.glow({
            x: p.x + (Math.random() - 0.5) * 0.1,
            y: p.y + 0.05,
            z: p.z + (Math.random() - 0.5) * 0.15,
            vy: 0.4 + Math.random() * 0.4,
            vx: (Math.random() - 0.5) * 0.5,
            vz: (Math.random() - 0.5) * 0.5,
            life: 0.6,
            size: 0.025,
            size1: 0.01,
            color: '#e8c48a',
            color1: '#b98a52',
            tex: 'dot',
            drag: 0.4,
            gravity: 1.2,
          });
        }
      } else if (f.kind === 'bellows') {
        moving.rotation.z = b.busy ? -0.12 - 0.12 * Math.sin(this.time * 4.5) : -0.06;
      } else if (f.kind === 'moulds') {
        moving.visible = b.busy;
      } else if (f.kind === 'runes') {
        moving.rotation.y += dt * (b.busy ? 1.6 : 0.25);
        moving.position.y = 0.04 * Math.sin(this.time * 1.7);
      }
    }
    this.updateTrays(b);
  }

  /** Retained for the debug inspector: walls always stay solid. */
  readonly cut: Record<Side, boolean> = { back: false, front: false, left: false, right: false };

  private updateTrays(b: Building): void {
    const key = JSON.stringify([b.input, b.output]);
    if (key === this.trayKey) return;
    this.trayKey = key;
    this.trays.clear();
    const lay = (parts: Partial<Record<ItemId, number>>, at: { x: number; y: number; z: number }) => {
      let i = 0;
      for (const k in parts) {
        const n = Math.min(8, parts[k as ItemId] ?? 0);
        for (let j = 0; j < n; j++, i++) {
          const m = itemMesh(k as ItemId, this.assets);
          m.scale.setScalar(0.42);
          m.position.set(
            at.x + ((i % 3) - 1) * 0.1,
            at.y + Math.floor(i / 6) * 0.05,
            at.z + (Math.floor(i / 3) % 2) * 0.12 - 0.06,
          );
          m.rotation.y = i * 0.7;
          this.trays.add(m);
        }
      }
    };
    lay(b.input, this.def.trays.input);
    lay(b.output, this.def.trays.output);
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
