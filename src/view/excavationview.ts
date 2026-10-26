// Tunnel segments iterate neighboring points; cuts advance only while seen < cuts.length.
import { geometryAttribute } from './geometry-attributes.ts';
import { PREP_BAY } from '../game/blasting.ts';
import { TUNNELS, tunnelWorld } from '../game/mine-routes.ts';
import { transitPose } from '../game/transit.ts';
/** A block-built mine and smooth surface terrain share the permanent saved cut history. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Sim } from '../game/sim.ts';
import { earth, type Cut } from '../game/excavation.ts';
import { MINE_AT } from '../game/mines.ts';
import { MINE_REGION_X, groundHeight, sampleHeights } from '../game/map.ts';
import type { Hero } from '../game/types.ts';
import type { Assets } from './assets.ts';
import type { Terrain } from './terrain.ts';
import { rockGeometryWork } from './rockmesh.ts';

/** One local, vertex-shaded light. No per-frame geometry work, shadows, or light-pool overlays. */
const torchUniforms = {
  uMineTorch: { value: new THREE.Vector3() },
  uMineTorchOn: { value: 0 },
};

/** Flat block colors and a single warm torch keep the small steps easy to read. */
function paintedRock(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uMineTorch'] = torchUniforms.uMineTorch;
    shader.uniforms['uMineTorchOn'] = torchUniforms.uMineTorchOn;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
      varying vec3 vRockLight; uniform vec3 uMineTorch; uniform float uMineTorchOn;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      float warmth = uMineTorchOn * (1.0-smoothstep(0.3,7.0,length(position-uMineTorch)));
      vRockLight = vec3(0.56,0.59,0.65) + warmth*vec3(0.8,0.59,0.34);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockLight;')
      .replace('#include <map_fragment>', 'diffuseColor.rgb *= vRockLight;');
  };
  material.customProgramCacheKey = () => 'block-excavation-torch';
  return material;
}

export class ExcavationView {
  private sim: Sim;

  readonly group = new THREE.Group();
  private rock = paintedRock();
  private meshes = new Map<string, THREE.Mesh>();
  private known = new Map<string, [number, number, number]>();
  private empty = new Set<string>();
  private queue = new Map<string, [number, number, number]>();
  private urgent = new Set<string>();
  private active: {
    id: string;
    c: [number, number, number];
    work: ReturnType<typeof rockGeometryWork>;
  } | null = null;
  private seen = 0;
  private state: unknown;
  private terrain: Terrain;
  private lift = new THREE.Group();
  private surfaceLift = new THREE.Group();
  private beds = new Map<string, THREE.Mesh>();
  private idleLift = 0;
  private focus = new THREE.Vector3(MINE_AT.x, 1, MINE_AT.z);
  constructor(sim: Sim, terrain: Terrain) {
    this.sim = sim;

    this.terrain = terrain;
    this.group.name = 'excavation';
    // Planks, grain strips, straps, bolts and pulley share one opaque draw call.
    const parts: THREE.BufferGeometry[] = [];
    const piece = (g: THREE.BufferGeometry, x: number, y: number, z: number, color: string, rotateX = 0) => {
      g.rotateX(rotateX);
      g.translate(x + MINE_AT.x, y, z + MINE_AT.z);
      const rgb = new THREE.Color(color),
        colors = new Float32Array(geometryAttribute(g, 'position').count * 3);
      for (let i = 0; i < colors.length; i += 3) colors.set([rgb.r, rgb.g, rgb.b], i);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      parts.push(g);
    };
    for (let i = 0; i < 7; i++) {
      const x = (i - 3) * 0.17;
      piece(new THREE.BoxGeometry(0.162, 0.1, 1.2), x, 0.07, 0, i % 2 ? '#9c713f' : '#876036');
      for (const z of [-0.49, 0.49])
        piece(new THREE.CylinderGeometry(0.017, 0.017, 0.008, 6), x, 0.125, z, '#393c40');
      piece(new THREE.BoxGeometry(0.012, 0.003, 0.72), x + 0.035, 0.122, 0.07, '#b28b51');
    }
    for (const x of [-0.55, 0.55]) {
      piece(new THREE.BoxGeometry(0.08, 0.08, 1.28), x, 0.015, 0, '#494b4c');
      for (const z of [-0.55, 0.55]) {
        piece(new THREE.BoxGeometry(0.065, 1.45, 0.065), x, 0.8, z, '#63666c');
        piece(new THREE.BoxGeometry(0.11, 0.11, 0.11), x, 0.18, z, '#393c40');
      }
      piece(new THREE.BoxGeometry(0.08, 0.1, 1.22), x, 1.53, 0, '#80552f');
    }
    piece(new THREE.BoxGeometry(1.2, 0.1, 0.1), 0, 1.6, 0, '#a07843');
    piece(new THREE.CylinderGeometry(0.13, 0.13, 0.09, 10), 0, 1.77, 0, '#555b62', Math.PI / 2);
    piece(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 8), 0, 1.77, 0, '#b4a179', Math.PI / 2);
    piece(new THREE.CylinderGeometry(0.018, 0.018, 0.95, 8), 0, 2.06, 0, '#b89b69');
    const liftGeometry = mergeGeometries(parts)!;
    for (const p of parts) p.dispose();
    this.lift.add(
      new THREE.Mesh(liftGeometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })),
    );
    this.group.add(this.lift);
    this.surfaceLift = this.lift.clone(true);
    this.surfaceLift.name = 'surface mine lift';
    this.group.add(this.surfaceLift);
    const bench = new THREE.Group();
    bench.name = 'blasting preparation bench';
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.06, 0.28),
      new THREE.MeshLambertMaterial({ color: '#936b3e' }),
    );
    plank.position.y = 0.3;
    bench.add(plank);
    for (const x of [-0.18, 0.18]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.28, 0.18),
        new THREE.MeshLambertMaterial({ color: '#67492c' }),
      );
      leg.position.set(x, 0.14, 0);
      bench.add(leg);
    }
    for (let i = 0; i < 3; i++) {
      const prop = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.14, 6).rotateZ(Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: '#b7533d' }),
      );
      prop.position.set(0.02, 0.35, (i - 1) * 0.06);
      bench.add(prop);
    }
    bench.position.set(PREP_BAY.x, 0, PREP_BAY.z);
    this.group.add(bench);
    this.queueLift();
  }
  private queueLift(): void {
    for (const t of TUNNELS)
      for (const path of [t.points, t.branch])
        for (let i = 1; i < path.length; i++) {
          const a = tunnelWorld(path[i - 1]!),
            b = tunnelWorld(path[i]!),
            steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z));
          for (let j = 0; j <= steps; j++) {
            const x = a.x + ((b.x - a.x) * j) / steps,
              y = a.y + ((b.y - a.y) * j) / steps,
              z = a.z + ((b.z - a.z) * j) / steps;
            for (let dx = -1; dx <= 1; dx++)
              for (let dz = -1; dz <= 1; dz++)
                for (let dy = -1; dy <= 1; dy++)
                  this.enqueue(Math.floor(x / 2) + dx, Math.floor(y / 2) + dy, Math.floor(z / 2) + dz);
          }
        }
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 0; z++)
        for (let x = -3; x <= -1; x++)
          this.enqueue(Math.floor(MINE_AT.x / 2) + x, y, Math.floor(MINE_AT.z / 2) + z);
    // Only chunks intersecting the small starting cavern have surfaces; the rest is untouched rock.
    for (let z = Math.floor((MINE_AT.z - 3) / 2); z <= Math.floor((MINE_AT.z + 3) / 2); z++)
      for (let x = Math.floor((MINE_AT.x - 3) / 2); x <= Math.floor((MINE_AT.x + 3) / 2); x++)
        for (let y = -1; y <= 1; y++) this.enqueue(x, y, z);
  }
  attach(_assets: Assets): void {}
  setTorch(position: THREE.Vector3, lit: boolean): void {
    torchUniforms.uMineTorch.value.copy(position);
    torchUniforms.uMineTorchOn.value = lit ? 1 : 0;
  }
  rideSpot(_h: Hero, _a: number, _out: THREE.Vector3): THREE.Vector3 | null {
    return null;
  }
  get torchSpots(): THREE.Vector3[] {
    return [];
  }
  private enqueue(x: number, y: number, z: number, urgent = false): void {
    const id = `${x},${y},${z}`;
    this.known.set(id, [x, y, z]);
    this.empty.delete(id);
    this.queue.set(id, [x, y, z]);
    if (urgent) {
      this.urgent.add(id);
      if (this.active?.id === id) this.active = null;
    }
  }
  private dirty(c: Cut): void {
    const x0 = Math.floor((c.x - c.r - 0.15) / 2),
      x1 = Math.floor((c.x + c.r + 0.15) / 2),
      z0 = Math.floor((c.z - c.r - 0.15) / 2),
      z1 = Math.floor((c.z + c.r + 0.15) / 2);
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        if (c.x < MINE_REGION_X) {
          this.terrain.exciseColumn(x, z);
          const height = Math.max(
            ...[0, 1, 2].flatMap((dx) =>
              [0, 1, 2].map((dz) => sampleHeights(this.sim.world.heights, x * 2 + dx, z * 2 + dz)),
            ),
          );
          for (let y = Math.floor(Math.min(c.y - c.r - 0.2, 0) / 2); y <= Math.ceil(height / 2); y++)
            this.enqueue(x, y, z, true);
        } else
          for (let y = Math.floor((c.y - c.r - 0.15) / 2); y <= Math.floor((c.y + c.r + 0.15) / 2); y++)
            this.enqueue(x, y, z, true);
      }
  }
  pickRock(ray: THREE.Raycaster) {
    const h = earth(this.sim).ray(ray.ray.origin, ray.ray.direction);
    if (!h) return null;
    return { ...h, nx: h.normal.x, ny: h.normal.y, nz: h.normal.z };
  }
  update(_dt: number, viewerX: number, _alpha = 1, _eye?: THREE.Vector3, target?: THREE.Vector3): void {
    const field = earth(this.sim);
    if (this.state !== field.state) {
      if (this.state !== undefined) {
        for (const mesh of this.meshes.values()) {
          this.group.remove(mesh);
          mesh.geometry.dispose();
        }
        this.meshes.clear();
        this.queue.clear();
        this.known.clear();
        this.empty.clear();
        this.urgent.clear();
        this.active = null;
        this.terrain.resetExcavation();
        this.queueLift();
        for (const bed of this.beds.values()) {
          this.group.remove(bed);
          bed.geometry.dispose();
        }
        this.beds.clear();
      }
      this.state = field.state;
      this.seen = 0;
    }
    if (target) this.focus.copy(target);
    while (this.seen < field.state.cuts.length) this.dirty(field.state.cuts[this.seen++]!);
    this.terrain.flushExcavation();
    this.lift.visible = viewerX > MINE_REGION_X;
    this.surfaceLift.visible = viewerX < MINE_REGION_X;
    const mine = this.sim.state.mines[0],
      trip = this.sim.state.heroes.find(
        (h) => h.transit?.kind === 'lift' && Math.hypot(h.x - this.focus.x, h.z - this.focus.z) < 6,
      );
    const offset = trip && trip.transit!.t / trip.transit!.duration >= 0.25 ? transitPose(trip).y : 0;
    if (trip) this.idleLift = 0;
    else if (
      mine &&
      viewerX > MINE_REGION_X &&
      Math.hypot(this.focus.x - mine.lift.x, this.focus.z - mine.lift.z) > 1.25
    )
      this.idleLift = Math.min(3.8, this.idleLift + _dt * 1.2);
    const boarding = trip && trip.transit!.t / trip.transit!.duration < 0.25;
    const summon =
      boarding && !trip!.transit!.down
        ? 3.8 * (1 - trip!.transit!.t / trip!.transit!.duration / 0.25)
        : offset;
    this.lift.position.set(
      mine ? mine.lift.x - MINE_AT.x : 0,
      viewerX > MINE_REGION_X ? (trip ? summon : this.idleLift) : 0,
      mine ? mine.lift.z - MINE_AT.z : 0,
    );
    if (mine)
      this.surfaceLift.position.set(
        mine.exit.x - MINE_AT.x,
        groundHeight(this.sim.world, mine.exit.x, mine.exit.z) + (viewerX < MINE_REGION_X ? offset : 0),
        mine.exit.z - MINE_AT.z,
      );
    for (const [id, c] of this.known)
      if (
        this.distance(c) < 900 &&
        !this.meshes.has(id) &&
        !this.empty.has(id) &&
        !this.queue.has(id) &&
        this.active?.id !== id
      )
        this.queue.set(id, c);
    const started = performance.now();
    // Each step samples one lattice layer or meshes one row. Keep the old surface until its
    // replacement is complete, so time slicing never opens a temporary hole in the mountain.
    for (let steps = 0; steps < 4096 && performance.now() - started < 2; steps++) {
      if (!this.active) {
        const pending = [...this.queue.entries()]
          .filter(([, c]) => this.distance(c) < (c[0] * 2 > MINE_REGION_X ? 225 : 100))
          .sort(
            (a, b) =>
              Number(this.urgent.has(b[0])) - Number(this.urgent.has(a[0])) ||
              this.distance(a[1]) - this.distance(b[1]),
          );
        const next = pending[0];
        if (!next) break;
        const [id, c] = next;
        this.queue.delete(id);
        this.active = { id, c, work: rockGeometryWork(field, ...c) };
      }
      const { id, c, work } = this.active,
        result = work.next();
      if (!result.done) continue;
      this.active = null;
      this.urgent.delete(id);
      const old = this.meshes.get(id);
      if (old) {
        this.group.remove(old);
        old.geometry.dispose();
        this.meshes.delete(id);
      }
      const geometry = result.value;
      if (!geometry) {
        this.empty.add(id);
        continue;
      }
      if (c[0] * 2 < MINE_REGION_X) this.terrain.paintExcavation(geometry);
      const mesh = new THREE.Mesh(
        geometry,
        c[0] * 2 < MINE_REGION_X ? this.terrain.excavationMaterial() : this.rock,
      );
      mesh.name = 'excavated rock';
      this.group.add(mesh);
      this.meshes.set(id, mesh);
    }
    for (const [id, mesh] of this.meshes) {
      const b = mesh.geometry.boundingSphere!;
      if (b.center.x > MINE_REGION_X === viewerX > MINE_REGION_X && b.center.distanceTo(this.focus) > 42) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        this.meshes.delete(id);
        continue;
      }
      mesh.visible =
        b.center.x > MINE_REGION_X === viewerX > MINE_REGION_X && b.center.distanceTo(this.focus) < 30;
      void id;
    }
    for (const bed of field.state.beds) {
      const id = `${bed.x},${bed.z}`;
      if (this.beds.has(id)) continue;
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(0.23, 16),
        new THREE.MeshLambertMaterial({ color: '#735339' }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(bed.x, groundHeight(this.sim.world, bed.x, bed.z) + 0.012, bed.z);
      this.group.add(m);
      this.beds.set(id, m);
    }
  }
  private distance(c: readonly [number, number, number]): number {
    // Prepare nearby workings while the player is still in the village; arrival does not start
    // the entire mesh queue from cold. The same small frame budget applies to this warm-up.
    const p =
      c[0] * 2 > MINE_REGION_X && this.focus.x < MINE_REGION_X
        ? { x: MINE_AT.x, y: 1, z: MINE_AT.z }
        : this.focus;
    return (c[0] * 2 + 1 - p.x) ** 2 + (c[1] * 2 + 1 - p.y) ** 2 + (c[2] * 2 + 1 - p.z) ** 2;
  }
}
