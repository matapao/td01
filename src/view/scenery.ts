import { LIT_PROPS } from './scenery-light-data.ts';
// Prop indices come from the same props array; each instanced part has a matching local transform.
import { geometryAttribute } from './geometry-attributes.ts';
import { NATURE, mergeByMaterial } from './scenery-batches.ts';
import { betweenWaves } from '../game/maintenance.ts';
/**
 * Instantiates the map's props: instanced scenery, unique buildings, animated parts, node visuals.
 *
 * The vale's nature — trees, stone, undergrowth — is KayKit's Forest Nature kit (nature.ts, placed
 * by forest.ts). It streams in after the world is on screen: until it lands (or if it can't be had)
 * the generated trees and the hex kit's rocks stand in, then every tree and stone node swaps to its
 * KayKit look in place, keeping its spot, its collider and whatever state it is in (felled, regrowing).
 */
import * as THREE from 'three';
import { Blobs } from './blobs.ts';
import { GLOW_COLORS, type GlowSource } from './glowlights.ts';
import type { Sim } from '../game/sim.ts';
import { GRID_W, MAP, groundHeight, inGrid } from '../game/map.ts';
import type { Prop } from '../game/scenery.ts';
import type { StoreId } from '../game/content.ts';
import { Assets, type KitName } from './assets.ts';
import { caveMouth, cauldron, crystalCluster, oreVein, stoneBridge, wallStair } from './procmodels.ts';
import { softDot } from './textures.ts';
import { damp, easeOutBack } from '../core/math.ts';

import { loadNature, type NatureKit } from './nature.ts';
import { dressing, rockLook, treeLook, type Category, type Placement } from './forest.ts';
import { GateWear } from './gatewear.ts';

/** Scenery is instanced in patches this many metres across (bigger: fewer draw calls, coarser culling). */
const PATCH = 64;

interface InstGroup {
  meshes: THREE.InstancedMesh[];
  /** Per-part local matrices (model space). */
  locals: THREE.Matrix4[];
  count: number;
}

/** One Forest Nature model in one patch of land: one mesh, each instance with its own palette. */
interface NatGroup extends InstGroup {
  meshes: [THREE.InstancedMesh];
  locals: [THREE.Matrix4];
  pal: THREE.InstancedBufferAttribute;
  /** Not drawn beyond this (m). */
  far: number;
}

interface NodeVis {
  prop: Prop;
  /** Instanced: group + index; otherwise an object. */
  group?: InstGroup;
  index?: number;
  obj?: THREE.Object3D;
  base: THREE.Matrix4;
  shake: number;
  /** 0 = gone, 1 = full. */
  scale: number;
  target: number;
  /** A felled tree's stump: a generated one, or (with the nature kit) its slot among the stumps. */
  stump?: THREE.Object3D | undefined;
  stumpAt?: number;
}

/** Dressing that hides when something is built over it (and the stumps, which do too). */
interface Dressed {
  g: NatGroup;
  index: number;
  m: THREE.Matrix4;
  x: number;
  z: number;
  r: number;
  hidden: boolean;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const IDENTITY = new THREE.Matrix4();

/** A flame (lantern, torch, brazier): a flickering sprite, and where it stands. */
interface Glow {
  sprite: THREE.Sprite;
  base: number;
  phase: number;
  at: THREE.Vector3;
  /** Its painted light: colour and reach. */
  color: THREE.Color;
  reach: number;
}

export class SceneryView {
  private assets: Assets;
  private sim: Sim;

  readonly group = new THREE.Group();
  private groups = new Map<string, InstGroup>();
  private nodes = new Map<number, NodeVis>();
  private nodeByProp = new Map<number, number>();
  private spinners: { obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number }[] = [];
  private gates = new Map<
    number,
    { left: THREE.Object3D; right: THREE.Object3D; open: number; goal: number }
  >();
  /** The wall's gate: its doors, and how far open they stand now (they follow the gate's state). */
  private wallGate: { left: THREE.Object3D; right: THREE.Object3D; open: number; wear: GateWear } | null =
    null;
  readonly stores = new Map<StoreId, THREE.Object3D>();
  keep: THREE.Object3D | null = null;
  private glows: Glow[] = [];
  /** Lights that are many and alike (street lamps, the wall's torches): where their flames are, and one cloud of halos per kind. */
  private beacons = new Map<string, { at: THREE.Vector3[]; halos: THREE.Points | null }>();
  private night = 0;
  private spots: GlowSource[] | null = null;
  /** World boxes of walls, houses, the keep and other big structures: the camera stays out. */
  readonly cameraBlockers: THREE.Box3[] = [];
  private time = 0;
  /** The Forest Nature batches, once the kit is in. */
  private nature: NatGroup[] = [];
  private stumps: { mesh: THREE.InstancedMesh; group: InstGroup; slots: Dressed[] } | null = null;
  private dressed: Dressed[] = [];
  private builtSig = -1;
  private syncT = 0;
  /** True once the vale wears the nature kit. */
  natureOn = false;
  /** Every Forest Nature placement (for the debug console). */
  looks: readonly Placement[] = [];

  constructor(assets: Assets, sim: Sim) {
    this.assets = assets;
    this.sim = sim;

    const props = sim.props;
    for (const n of sim.state.nodes) this.nodeByProp.set(n.prop, n.id);
    // The town's own kit streams in after the world: its props join the scene the moment it lands.
    const now: number[] = [];
    const later: number[] = [];
    props.forEach((p, i) => (p.kit === 'town' && !assets.has('town', p.model) ? later : now).push(i));
    this.place(now);
    if (later.length) void assets.loadKit('town').then(() => this.place(later));
    // Soft shadows under the trees (drawn once; cheaper than any shadow map).
    const trees = props.filter((p) => p.kit === 'trees' && !p.model.startsWith('stump'));
    this.treeBlobs = this.blobs(
      trees.map((p) => ({
        x: p.x,
        z: p.z,
        r: p.scale * (p.model.startsWith('pine') ? 0.17 : p.model.startsWith('dead') ? 0.1 : 0.22),
      })),
    );
    // Nodes felled in a game carried on from before (a reload, a LAN join) show as felled.
    this.syncNodes(true);
    // The nature kit: fetched in the background (game.ts starts it before the other models).
    // One preset: use the pack's pines whenever the asset is available.
    void loadNature().then((kit) => {
      if (kit) this.useNature(kit);
    });
  }

  /** How many times props were placed (each batch's groups get keys of their own). */
  private batches = 0;

  /**
   * Puts props in the scene: one-offs on their own, the rest instanced — one group per model and 64 m
   * patch of land, so whole patches out of view (or past the haze) are skipped. The wall, houses and
   * other big structures become camera blockers.
   */
  private place(indices: number[]): void {
    const props = this.sim.props;
    const assets = this.assets;
    const batch = this.batches++;
    const keyOf = (p: Prop) => (batch ? `${this.key(p)}#${batch}` : this.key(p));
    const counts = new Map<string, number>();
    for (const i of indices) {
      const p = props[i]!;
      if (this.isUnique(p)) continue;
      const k = keyOf(p);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const fresh: InstGroup[] = [];
    for (const [k, n] of counts) {
      const [kit, model, sway] = k.split('|');
      if (!kit || !model || sway === undefined) throw new Error(`Invalid prop batch ${k}`);
      const parts = assets.parts(kit as KitName, model, { sway: Number(sway) });
      const meshes = parts.map((part) => {
        const im = new THREE.InstancedMesh(part.geometry, part.material, n);
        im.count = 0;
        this.group.add(im);
        this.patches.push(im);
        return im;
      });
      const g = { meshes, locals: parts.map((p) => p.matrix), count: 0 };
      this.groups.set(k, g);
      fresh.push(g);
    }
    /** The wall's pieces keep the camera out as much as houses do. */
    const solidProp = (p: Prop) =>
      !p.node && (!!p.box || p.block >= 1.5 || p.model.startsWith('wall_straight'));
    for (const i of indices) {
      const p = props[i]!;
      const y = this.baseY(p);
      const base = new THREE.Matrix4().compose(
        tmpV.set(p.x, y, p.z),
        tmpQ.setFromAxisAngle(Y, p.rot),
        tmpS.setScalar(p.scale),
      );
      const nodeId = this.nodeByProp.get(i);
      if (this.isUnique(p)) {
        const obj = this.buildUnique(p, i);
        obj.matrixAutoUpdate = false;
        obj.matrix.copy(base);
        obj.matrixWorldNeedsUpdate = true;
        this.group.add(obj);
        obj.updateMatrixWorld(true);
        const sphere = new THREE.Box3().setFromObject(obj).getBoundingSphere(new THREE.Sphere());
        this.uniques.push({ obj, at: sphere.center, r: sphere.radius });
        if (solidProp(p) && p.tag !== 'bridge' && p.tag !== 'stair') {
          obj.updateMatrixWorld(true);
          this.cameraBlockers.push(new THREE.Box3().setFromObject(obj));
        }
        if (nodeId) this.nodes.set(nodeId, { prop: p, obj, base, shake: 0, scale: 1, target: 1 });
        continue;
      }
      const g = this.groups.get(keyOf(p))!;
      const index = g.count++;
      const box = solidProp(p) ? new THREE.Box3() : null;
      g.meshes.forEach((im, j) => {
        im.setMatrixAt(index, tmpM.multiplyMatrices(base, g.locals[j]!));
        im.count = g.count;
        if (box) {
          im.geometry.computeBoundingBox();
          box.union(im.geometry.boundingBox!.clone().applyMatrix4(tmpM));
        }
      });
      if (box) this.cameraBlockers.push(box);
      if (nodeId) this.nodes.set(nodeId, { prop: p, group: g, index, base, shake: 0, scale: 1, target: 1 });
      // Where an instanced light's flame is (model units → world).
      const lit = p.tag && Object.hasOwn(LIT_PROPS, p.tag) ? LIT_PROPS[p.tag] : undefined;
      if (lit) {
        let b = this.beacons.get(p.tag!);
        if (!b) this.beacons.set(p.tag!, (b = { at: [], halos: null }));
        b.at.push(new THREE.Vector3(...lit.at).applyMatrix4(base));
      }
    }
    for (const [tag, b] of this.beacons) {
      if (b.halos || !b.at.length) continue;
      const lit = LIT_PROPS[tag];
      if (!lit) throw new Error(`Unknown lit prop ${tag}`);
      const mat = new THREE.PointsMaterial({
        map: glowTex(),
        color: lit.color,
        size: lit.size,
        sizeAttenuation: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      b.halos = new THREE.Points(new THREE.BufferGeometry().setFromPoints(b.at), mat);
      b.halos.frustumCulled = false;
      this.group.add(b.halos);
      this.spots = null;
    }
    for (const g of fresh) {
      for (const im of g.meshes) {
        im.instanceMatrix.needsUpdate = true;
        // Bounds of the patch's instances (swaying leaves stay well inside the margin).
        im.computeBoundingSphere();
        if (im.boundingSphere) im.boundingSphere.radius += 2;
      }
    }
  }

  private treeBlobs: Blobs;

  private baseY(p: Prop): number {
    return p.y ?? groundHeight(this.sim.world, p.x, p.z) + (p.dy ?? 0);
  }

  private blobs(list: { x: number; z: number; r: number }[]): Blobs {
    const b = new Blobs(Math.max(1, list.length), 0.38, (x, z) => groundHeight(this.sim.world, x, z));
    b.begin();
    for (const t of list) b.add(t.x, t.z, t.r);
    b.end();
    this.group.add(b.mesh);
    return b;
  }

  private key(p: Prop): string {
    const patch = `${Math.floor(p.x / PATCH)},${Math.floor(p.z / PATCH)}`;
    return `${p.kit}|${p.model}|${p.sway ? (p.kit === 'halloween' ? 0.006 : 0.05) : 0}|${patch}`;
  }

  /** Instanced patches of scenery (for culling by distance). */
  private patches: THREE.InstancedMesh[] = [];

  /** One-off props (buildings, stores, ore, crystals, junk): where they stand and how big they are. */
  private uniques: { obj: THREE.Object3D; at: THREE.Vector3; r: number }[] = [];

  /** Patches and props beyond the haze aren't drawn (the frustum takes care of what's behind you). */
  cull(viewer: THREE.Vector3, far: number): void {
    for (const im of this.patches) {
      const b = im.boundingSphere;
      im.visible = !b || b.center.distanceTo(viewer) - b.radius < far;
    }
    for (const g of this.nature) {
      const im = g.meshes[0];
      const b = im.boundingSphere;
      im.visible = !b || b.center.distanceTo(viewer) - b.radius < Math.min(far, g.far);
    }
    for (const u of this.uniques) u.obj.visible = u.at.distanceTo(viewer) - u.r < far;
  }

  // ---- The Forest Nature kit -------------------------------------------------------------------

  /** What the nature kit put in the vale (for the debug console and tests): instances and batches per kind. */
  natureStats(): Record<string, { instances: number; batches: number; triangles: number }> {
    const out: Record<string, { instances: number; batches: number; triangles: number }> = {};
    for (const g of this.nature) {
      const im = g.meshes[0];
      const cat = (im.userData['cat'] as string) ?? '?';
      const e = (out[cat] ??= { instances: 0, batches: 0, triangles: 0 });
      e.instances += g.count;
      e.batches++;
      const geo = im.geometry;
      e.triangles += ((geo.index ? geo.index.count : geometryAttribute(geo, 'position').count) / 3) * g.count;
    }
    return out;
  }

  /** Swaps the generated trees and the hex kit's rocks for the kit's, and dresses the vale. */
  private useNature(kit: NatureKit): void {
    if (this.natureOn) return;
    const props = this.sim.props;
    const treeIdx: number[] = [];
    // Every tree: the ones you can fell, and the town's own (orchards, the high street's trees, the
    // snags round the crypts) that nobody takes an axe to.
    props.forEach((p, i) => {
      if (p.kit === 'trees') treeIdx.push(i);
    });
    const trees = treeIdx.map((i) => {
      const p = props[i]!;
      const lone = !treeIdx.some((j) => j !== i && Math.hypot(props[j]!.x - p.x, props[j]!.z - p.z) < 9);
      return treeLook(kit, p, i, this.baseY(p), lone);
    });
    const rocks: Placement[] = [];
    props.forEach((p, i) => {
      if (
        p.node === 'rock' &&
        p.kit === 'medieval' &&
        p.model.startsWith('rock_single') &&
        this.nodeByProp.has(i)
      )
        rocks.push(rockLook(kit, p, i, this.baseY(p)));
    });
    const dress = dressing(kit, this.sim, trees, rocks);
    const all = [...trees, ...rocks, ...dress];
    this.looks = all;

    // One material per model: its sway sized so the tip moves about NATURE.bend metres.
    const mats = new Map<string, THREE.Material>();
    const typical = new Map<string, { s: number; n: number; cat: Category }>();
    for (const pl of all) {
      const t = typical.get(pl.model) ?? { s: 0, n: 0, cat: pl.cat };
      t.s += pl.s;
      t.n++;
      typical.set(pl.model, t);
    }
    for (const [model, t] of typical) {
      const m = kit.get(model);
      const bend = NATURE[t.cat].bend;
      const sway = bend ? bend / (0.85 * m.height * m.height * (t.s / t.n)) : 0;
      mats.set(model, kit.material(sway, t.cat === 'grass'));
    }

    // Batches: one per model and patch.
    const keyOf = (pl: Placement) => {
      const size = NATURE[pl.cat].patch;
      return `${pl.model}|${pl.cat}|${Math.floor(pl.x / size)},${Math.floor(pl.z / size)}`;
    };
    const counts = new Map<string, number>();
    for (const pl of all) counts.set(keyOf(pl), (counts.get(keyOf(pl)) ?? 0) + 1);
    const batches = new Map<string, NatGroup>();
    for (const [k, n] of counts) {
      const [model, cat] = k.split('|');
      if (!model || !cat) throw new Error(`Invalid nature batch ${k}`);
      const g = this.natBatch(kit.get(model).geometry, mats.get(model)!, n, NATURE[cat as Category].far);
      g.meshes[0].userData['cat'] = cat;
      g.meshes[0].name = model;
      batches.set(k, g);
    }
    const nodePlaces = new Map<number, Placement>();
    for (const pl of all) {
      const g = batches.get(keyOf(pl))!;
      const index = g.count++;
      const m = new THREE.Matrix4().compose(
        tmpV.set(pl.x, pl.y, pl.z),
        tmpQ.setFromAxisAngle(Y, pl.rot),
        tmpS.set(pl.s * pl.sx, pl.s * pl.sy, pl.s * pl.sx),
      );
      g.meshes[0].setMatrixAt(index, m);
      g.meshes[0].count = g.count;
      g.pal.setXYZ(index, pl.pal[0], pl.pal[1], pl.pal[2]);
      if (pl.prop >= 0) {
        const id = this.nodeByProp.get(pl.prop)!;
        const v = this.nodes.get(id);
        if (!v) continue;
        // The old look leaves (its batch goes below); the node keeps its state.
        v.group = g;
        v.index = index;
        v.base = m;
        nodePlaces.set(id, pl);
        this.writeNode(v);
      } else if (pl.cat === 'bush' || pl.cat === 'grass' || pl.cat === 'pebble') {
        this.dressed.push({ g, index, m, x: pl.x, z: pl.z, r: Math.min(pl.r, 1.2), hidden: false });
      }
    }
    for (const g of batches.values()) {
      const im = g.meshes[0];
      im.instanceMatrix.needsUpdate = true;
      g.pal.needsUpdate = true;
      im.computeBoundingSphere();
      if (im.boundingSphere) im.boundingSphere.radius += 2;
      this.group.add(im);
      this.nature.push(g);
    }

    // Retire the stand-ins: every batch of generated trees and of the hex kit's quarry rocks.
    for (const [k, g] of this.groups) {
      const [kitName, model] = k.split('|');
      if (!kitName || !model) throw new Error(`Invalid scenery batch ${k}`);
      if (kitName !== 'trees' && !(kitName === 'medieval' && model.startsWith('rock_single'))) continue;
      for (const im of g.meshes) {
        this.group.remove(im);
        this.patches.splice(this.patches.indexOf(im), 1);
        im.dispose();
      }
      this.groups.delete(k);
    }

    // Stumps: one batch for every tree node, shown as the trees fall.
    const st = trees.length;
    const sg = this.natBatch(kit.stump.geometry, kit.material(0), Math.max(1, st), Infinity);
    sg.meshes[0].frustumCulled = false;
    sg.meshes[0].count = st;
    for (let i = 0; i < st; i++) sg.meshes[0].setMatrixAt(i, ZERO);
    this.group.add(sg.meshes[0]);
    this.stumps = { mesh: sg.meshes[0], group: sg, slots: [] };
    trees.forEach((t, i) => {
      const id = this.nodeByProp.get(t.prop)!;
      const v = this.nodes.get(id);
      if (!v) return;
      v.stumpAt = i;
      sg.pal.setXYZ(i, 0, t.pal[1], 0);
      const h = Math.min(0.7, Math.max(0.36, t.trunk * 1.25));
      const r = t.trunk * 1.04;
      const m = new THREE.Matrix4().compose(
        tmpV.set(t.x, t.y - 0.05, t.z),
        tmpQ.setFromAxisAngle(Y, t.rot),
        tmpS.set(r, h, r),
      );
      const slot: Dressed = { g: sg, index: i, m, x: t.x, z: t.z, r: 0.3, hidden: true };
      this.stumps!.slots[i] = slot;
      this.dressed.push(slot);
      if (v.stump) {
        this.group.remove(v.stump);
        v.stump = undefined;
      }
      if (v.target === 0) this.showStump(v, true);
    });
    sg.pal.needsUpdate = true;
    sg.meshes[0].instanceMatrix.needsUpdate = true;

    // Blob shadows under the new crowns (and the slope forest).
    this.group.remove(this.treeBlobs.mesh);
    this.treeBlobs.mesh.geometry.dispose();
    (this.treeBlobs.mesh.material as THREE.Material).dispose();
    const crowns = all
      .filter((pl) => pl.cat === 'tree')
      .map((pl) => ({
        x: pl.x,
        z: pl.z,
        r:
          pl.reach *
          (pl.model.startsWith('Tree_Bare')
            ? 0.3
            : pl.model.startsWith('Tree_5') || pl.model.startsWith('Tree_4')
              ? 0.5
              : 0.62),
      }));
    this.treeBlobs = this.blobs(crowns);
    this.natureOn = true;
    this.builtSig = -1;
  }

  private natBatch(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    n: number,
    far: number,
  ): NatGroup {
    // Each batch its own palette column per instance (vertex data shared with every other batch).
    const geo = new THREE.BufferGeometry();
    geo.setIndex(geometry.index);
    for (const [name, attr] of Object.entries(geometry.attributes)) geo.setAttribute(name, attr);
    geo.boundingSphere = geometry.boundingSphere;
    geo.boundingBox = geometry.boundingBox;
    const pal = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    geo.setAttribute('aPal', pal);
    const im = new THREE.InstancedMesh(geo, material, n);
    im.count = 0;
    return { meshes: [im], locals: [IDENTITY], count: 0, pal, far };
  }

  /** A felled tree's stump comes (or goes, as it regrows). */
  private showStump(v: NodeVis, on: boolean): void {
    if (!this.stumps || v.stumpAt === undefined) return;
    const d = this.stumps.slots[v.stumpAt];
    if (!d) return;
    d.hidden = !on;
    this.stumps.mesh.setMatrixAt(v.stumpAt, on && !this.builtOver(d) ? d.m : ZERO);
    this.stumps.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Is something built (or being built) on this spot? */
  private builtOver(d: Dressed): boolean {
    const occ = this.sim.state.occupied;
    for (let k = 0; k < 5; k++) {
      const a = (k / 4) * Math.PI * 2;
      const r = k === 4 ? 0 : d.r;
      const cx = Math.floor(d.x + Math.cos(a) * r - MAP.minX);
      const cz = Math.floor(d.z + Math.sin(a) * r - MAP.minZ);
      if (inGrid(cx, cz) && occ[cz * GRID_W + cx]) return true;
    }
    return false;
  }

  /** Grass, shrubs and stumps make way for whatever is built over them (and come back after). */
  private hideUnderBuildings(): void {
    const s = this.sim.state;
    let sig = s.buildings.length * 7919 + s.sites.length * 104729;
    for (const b of s.buildings) sig += b.id;
    for (const b of s.sites) sig += b.id * 3;
    if (sig === this.builtSig) return;
    this.builtSig = sig;
    const dirty = new Set<NatGroup>();
    for (const d of this.dressed) {
      const stump = this.stumps && d.g === this.stumps.group;
      const show = !(stump && d.hidden) && !this.builtOver(d);
      d.g.meshes[0].setMatrixAt(d.index, show ? d.m : ZERO);
      if (!stump) d.hidden = !show;
      dirty.add(d.g);
    }
    for (const g of dirty) g.meshes[0].instanceMatrix.needsUpdate = true;
  }

  /** The view follows the nodes' state even without events (a reload, a LAN join): felled shows felled. */
  private plantedTrees = new Map<number, THREE.Object3D>();
  private syncNodes(instant = false): void {
    for (const [id, obj] of this.plantedTrees)
      if (!this.sim.getAs(id, 'node') || this.sim.getAs(id, 'node')!.prop >= 0) {
        this.group.remove(obj);
        this.plantedTrees.delete(id);
      }
    for (const n of this.sim.state.nodes)
      if (n.kind === 'tree' && n.prop < 0) {
        let obj = this.plantedTrees.get(n.id);
        if (!obj) {
          obj = this.assets.model('trees', 'pine_0');
          this.assets.patchTree(obj);
          this.group.add(obj);
          this.plantedTrees.set(n.id, obj);
          void loadNature().then((kit) => {
            if (!kit) return;
            const model = kit.get('Tree_5_F'),
              geometry = model.geometry.clone();
            geometry.setAttribute(
              'aPal',
              new THREE.Float32BufferAttribute(
                new Float32Array(geometryAttribute(geometry, 'position').count * 3),
                3,
              ),
            );
            const pine = new THREE.Mesh(geometry, kit.material(0));
            pine.scale.setScalar(0.95 / model.height);
            obj!.clear();
            obj!.add(pine);
          });
        }
        obj.position.set(n.x, groundHeight(this.sim.world, n.x, n.z), n.z);
        obj.scale.setScalar(
          n.amount > 0 ? 5.8 : n.planted ? 0.25 + (1 - Math.max(0, n.regrowT) / 90) * 2 : 0.08,
        );
      }

    for (const [id, v] of this.nodes) {
      const n = this.sim.getAs(id, 'node');
      if (!n) continue;
      if (n.amount <= 0 && v.target === 1) {
        this.depleteNode(id);
        if (instant) {
          v.scale = 0;
          this.writeNode(v);
        }
      } else if (n.amount > 0 && v.target === 0) this.regrowNode(id);
    }
  }

  private isUnique(p: Prop): boolean {
    // Street lamps and the wall's torches are many and alike: instanced like any prop, their glow drawn in one go (beacons).
    return p.kit === 'proc' || (!!p.tag && !Object.hasOwn(LIT_PROPS, p.tag));
  }

  private buildUnique(p: Prop, index: number): THREE.Object3D {
    let obj: THREE.Object3D;
    if (p.kit === 'proc') {
      if (p.model === 'crystal') obj = crystalCluster(index * 13 + 1);
      else if (p.model === 'ore_vein') obj = mergeByMaterial(oreVein(this.assets, index * 7 + 3));
      else if (p.model === 'cave') obj = caveMouth(this.assets, index * 11 + 5);
      else if (p.model.startsWith('stone_bridge')) {
        const [, len, wid, depth] = p.model.split(':').map(Number);
        if (len === undefined || wid === undefined || depth === undefined)
          throw new Error(`Invalid ramp ${p.model}`);
        obj = stoneBridge(len, wid, depth, index);
      } else if (p.model.startsWith('wall_stair')) {
        const [, run, wid, height, landing] = p.model.split(':').map(Number);
        if (run === undefined || wid === undefined || height === undefined || landing === undefined)
          throw new Error(`Invalid stair ${p.model}`);
        obj = wallStair(run, wid, height, landing, index);
      } else obj = cauldron();
    } else {
      obj = this.assets.model(p.kit as KitName, p.model);
      this.assets.patchTree(obj, { sway: p.sway ? 0.05 : 0 });
    }
    const tag = p.tag ?? '';
    // Animated parts.
    const find = (name: string) => obj.getObjectByName(name);
    if (tag === 'windmill') {
      const fan = find('building_windmill_top_fan_blue');
      if (fan) this.spinners.push({ obj: fan, axis: 'z', speed: 0.9 });
    } else if (tag === 'watermill') {
      const wheel = find('building_watermill_wheel_blue');
      if (wheel) this.spinners.push({ obj: wheel, axis: 'x', speed: -1.1 });
    } else if (tag === 'lumbermill') {
      const saw = find('building_lumbermill_saw_blue');
      if (saw) this.spinners.push({ obj: saw, axis: 'z', speed: 6 });
    } else if (tag.startsWith('gate:')) {
      const left = find('arch_gate_left');
      const right = find('arch_gate_right');
      if (left && right) this.gates.set(Number(tag.slice(5)), { left, right, open: 0, goal: 0 });
    } else if (tag.startsWith('store:')) {
      this.stores.set(tag.slice(6) as StoreId, obj);
    } else if (tag === 'keep') {
      this.keep = obj;
    } else if (tag === 'keep-gate') {
      // The wall's gate: its two doors swing in to open, shut against the dead.
      const left = find('wall_straight_gate_door_left');
      const right = find('wall_straight_gate_door_right');
      if (left && right)
        this.wallGate = {
          left,
          right,
          open: this.sim.state.gate.shut ? 0 : 1,
          wear: new GateWear([left, right]),
        };
    }
    if (tag === 'lantern' || tag === 'torch' || tag === 'candles' || tag === 'cauldron') {
      const color = tag === 'cauldron' ? '#7dff6a' : tag === 'lantern' ? '#ffb455' : '#ffcf7a';
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex(),
          color,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      );
      const h = tag === 'torch' ? 0.9 : tag === 'cauldron' ? 1.0 : tag === 'candles' ? 1.4 : 1.2;
      sprite.position.set(0, h / p.scale, 0);
      const s = (tag === 'cauldron' ? 1.6 : 1.2) / p.scale;
      sprite.scale.set(s, s, s);
      obj.add(sprite);
      const light =
        tag === 'cauldron' ? GLOW_COLORS.cauldron : tag === 'torch' ? GLOW_COLORS.torch : GLOW_COLORS.lantern;
      this.glows.push({
        sprite,
        base: s,
        phase: index * 1.7,
        at: new THREE.Vector3(p.x, 0, p.z),
        color: light,
        reach: tag === 'candles' ? 3.5 : 5.5,
      });
      this.spots = null;
    }
    return obj;
  }

  // ---- Node reactions -------------------------------------------------------------------------

  hitNode(id: number): void {
    const v = this.nodes.get(id);
    if (v) v.shake = 1;
  }

  depleteNode(id: number): void {
    const v = this.nodes.get(id);
    if (!v || v.target === 0) return;
    v.target = 0;
    if (v.stumpAt !== undefined) {
      this.showStump(v, true);
      return;
    }
    if (v.prop.node === 'tree' && !v.stump && (v.prop.kit === 'medieval' || v.prop.kit === 'trees')) {
      const cut =
        v.prop.kit === 'trees'
          ? 'stump_0'
          : v.prop.model.startsWith('trees_B') || v.prop.model === 'tree_single_B'
            ? v.prop.model.startsWith('trees')
              ? 'trees_B_cut'
              : 'tree_single_B_cut'
            : v.prop.model.startsWith('trees')
              ? 'trees_A_cut'
              : 'tree_single_A_cut';
      const stump = this.assets.model(v.prop.kit === 'trees' ? 'trees' : 'medieval', cut);
      this.assets.patchTree(stump);
      stump.matrixAutoUpdate = false;
      stump.matrix.copy(v.base);
      this.group.add(stump);
      v.stump = stump;
    }
  }

  regrowNode(id: number): void {
    const v = this.nodes.get(id);
    if (!v || v.target === 1) return;
    v.target = 1;
    v.scale = 0.05;
    if (v.stumpAt !== undefined) this.showStump(v, false);
    if (v.stump) {
      this.group.remove(v.stump);
      v.stump = undefined;
    }
  }

  /** 0 by day, 1 at night: flames burn brighter (their light is painted by GlowLights). */
  setNight(night: number): void {
    this.night = night;
  }

  /** Where the vale's lanterns, torches and cauldrons burn (world), for the painted light pools. */
  lightSpots(): GlowSource[] {
    if (!this.spots) {
      this.spots = this.glows.map((g) => {
        const p = g.sprite.getWorldPosition(new THREE.Vector3());
        return { x: p.x, y: p.y, z: p.z, r: g.reach, color: g.color, k: 1 };
      });
      for (const [tag, b] of this.beacons)
        for (const p of b.at)
          this.spots.push({
            x: p.x,
            y: p.y,
            z: p.z,
            r: LIT_PROPS[tag]!.reach,
            color: LIT_PROPS[tag]!.glow,
            k: 1,
          });
    }
    return this.spots;
  }

  setGate(lane: number, open: boolean): void {
    const g = this.gates.get(lane);
    if (g) g.goal = open ? 1 : 0;
  }

  /** A node's matrix as it stands now: shaken by a hit, felled, or growing back. */
  private nodeMatrix(v: NodeVis, out: THREE.Matrix4): THREE.Matrix4 {
    const grow = v.target === 1 ? easeOutBack(v.scale) : v.scale;
    const wob = Math.sin(v.shake * 26) * v.shake * 0.09;
    const s = Math.max(0.0001, grow);
    const m = new THREE.Matrix4()
      .makeRotationZ(wob)
      .multiply(new THREE.Matrix4().makeScale(s * (1 + v.shake * 0.05), s * (1 - v.shake * 0.04), s));
    return out.copy(v.base).multiply(m);
  }

  /** Writes a node's matrix into its batch (or object). */
  private writeNode(v: NodeVis): void {
    this.nodeMatrix(v, tmpM);
    const s = v.target === 1 ? easeOutBack(v.scale) : v.scale;
    if (v.obj) {
      v.obj.matrix.copy(tmpM);
      v.obj.matrixWorldNeedsUpdate = true;
      v.obj.visible = s > 0.002;
    } else if (v.group && v.index !== undefined) {
      const g = v.group;
      g.meshes.forEach((im, j) => {
        im.setMatrixAt(v.index!, new THREE.Matrix4().multiplyMatrices(tmpM, g.locals[j]!));
        im.instanceMatrix.needsUpdate = true;
      });
    }
  }

  /** The dead struck the wall's gate: its doors jolt. */
  gateHit(): void {
    this.wallGate?.wear.hit();
  }

  /** How much damage the gate's doors show (cracks, splinters, holes; tests read it). */
  get gateWear(): number {
    return this.wallGate?.wear.showing ?? 0;
  }

  update(dt: number): void {
    this.time += dt;
    for (const s of this.spinners) s.obj.rotation[s.axis] += s.speed * dt;
    for (const g of this.gates.values()) {
      g.open = damp(g.open, g.goal, 3.5, dt);
      g.left.rotation.y = -g.open * 1.75;
      g.right.rotation.y = g.open * 1.75;
    }
    // The wall's gate: shut, it shows what the dead have done to it (see GateWear); broken, it hangs
    // open, swinging in (into town) — shut again once it is mended a third of the way.
    if (this.wallGate) {
      const gs = this.sim.state.gate;
      const g = this.wallGate;
      g.open = damp(
        g.open,
        betweenWaves(this.sim) ? 1 : gs.shut && gs.hp > 0 ? 0 : gs.hp > 0 ? 1 : 0.82,
        2.4,
        dt,
      );
      g.wear.update(gs.hp / gs.maxHp, g.open, dt);
    }
    for (const gl of this.glows) {
      const f =
        0.85 + 0.1 * Math.sin(this.time * 9 + gl.phase) + 0.06 * Math.sin(this.time * 23 + gl.phase * 3);
      gl.sprite.scale.setScalar(gl.base * f * (1 + this.night * 0.8));
    }
    for (const [tag, b] of this.beacons) {
      if (!b.halos) continue;
      // They glow faintly by day and brightly at night, flickering together a little.
      const lit = LIT_PROPS[tag];
      if (!lit) throw new Error(`Unknown lit prop ${tag}`);
      const m = b.halos.material as THREE.PointsMaterial;
      m.size = lit.size * (1 + this.night * 0.9) * (0.93 + 0.07 * Math.sin(this.time * lit.flicker));
      m.opacity = lit.day + (1 - lit.day) * this.night;
    }
    // Twice a second: the view catches up with what the events didn't say, and grass and stumps
    // make way for new buildings.
    this.syncT -= dt;
    if (this.syncT <= 0) {
      this.syncT = 0.5;
      this.syncNodes();
      if (this.natureOn) this.hideUnderBuildings();
    }
    for (const v of this.nodes.values()) {
      if (v.shake <= 0 && Math.abs(v.scale - v.target) < 0.001) continue;
      v.shake = Math.max(0, v.shake - dt * 3.2);
      if (v.target === 0) v.scale = Math.max(0, v.scale - dt * 3.5);
      else v.scale = Math.min(1, v.scale + dt * 0.5);
      this.writeNode(v);
    }
  }
}

let glow: THREE.Texture | null = null;
function glowTex(): THREE.Texture {
  return (glow ??= softDot(64));
}
