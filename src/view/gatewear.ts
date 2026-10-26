/**
 * The wall's gate showing what it has taken. As the dead batter it, its doors darken and give: cracks
 * first, then planks knocked askew and splintered, then holes punched clean through — each piece
 * shows once the gate's strength falls below its own mark, so the doors read like its bar does. Every
 * blow jolts them; a weak gate sags ajar on its hinges. Mended, the damage goes again in reverse.
 */
import * as THREE from 'three';
import { patchMaterial } from './assets.ts';
import { damp } from '../core/math.ts';

const MAT = {
  plank: patchMaterial(new THREE.MeshLambertMaterial({ color: '#86603a', flatShading: true })),
  splinter: patchMaterial(new THREE.MeshLambertMaterial({ color: '#e2bd84', flatShading: true })),
  crack: patchMaterial(new THREE.MeshLambertMaterial({ color: '#24170e' })),
  hole: patchMaterial(new THREE.MeshLambertMaterial({ color: '#0d0907' })),
};

interface Piece {
  mesh: THREE.Object3D;
  /** It shows while the gate's strength (0…1) is below this. */
  below: number;
}

interface Door {
  obj: THREE.Object3D;
  /** Its own materials (cloned once, so darkening them leaves the rest of the wall alone), with their colours. */
  tints: { mat: THREE.MeshLambertMaterial; base: THREE.Color }[];
  /** Which way it swings open (+1 or −1 on its y turn). */
  sense: number;
}

export class GateWear {
  private doors: Door[] = [];
  private pieces: Piece[] = [];
  private built = false;
  private jolt = 0;
  private sag = 0;
  private shown = -1;
  private k: number;

  constructor(doors: [THREE.Object3D, THREE.Object3D], seed = 7) {
    this.k = seed * 131 + 17;
    doors.forEach((obj, i) => {
      const tints: Door['tints'] = [];
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        const own = mats.map((mat) => {
          const c = (mat as THREE.MeshLambertMaterial).clone();
          // (A clone leaves the world patch behind — fog, rim light: keep it.)
          c.onBeforeCompile = mat.onBeforeCompile;
          c.customProgramCacheKey = mat.customProgramCacheKey;
          if (c.color) tints.push({ mat: c, base: c.color.clone() });
          return c;
        });
        m.material = Array.isArray(m.material) ? own : own[0]!; // A single source material creates one clone.
      });
      this.doors.push({ obj, tints, sense: i === 0 ? -1 : 1 });
    });
  }

  private rnd(): number {
    this.k = (this.k * 16807 + 11) % 2147483647;
    return this.k / 2147483647;
  }

  /** A blow on the gate: it jolts. */
  hit(): void {
    this.jolt = 1;
  }

  /** How many cracks, splinters and holes show now (tests read it). */
  get showing(): number {
    return this.pieces.filter((p) => p.mesh.visible).length;
  }

  /** The doors' wear for the gate's strength `frac` (0…1); the swing (`open`, 0…1) is the caller's. */
  update(frac: number, open: number, dt: number): void {
    if (!this.built) this.build();
    this.jolt = Math.max(0, this.jolt - dt * 5);
    // Weakened, it sags ajar on its hinges; each blow jolts it in.
    this.sag = damp(this.sag, frac < 0.5 ? (0.5 - frac) * 0.16 : 0, 2, dt);
    const shake = this.jolt * this.jolt * 0.07;
    this.doors.forEach(
      (d, i) => (d.obj.rotation.y = d.sense * (open * 1.55 + this.sag + shake * (i ? 1 : 0.8))),
    );
    // Pieces and the darkening only change as the strength crosses their marks.
    const q = Math.round(frac * 200) / 200;
    if (q === this.shown) return;
    this.shown = q;
    for (const p of this.pieces) p.mesh.visible = frac < p.below;
    const dark = 0.42 + 0.58 * Math.max(0, frac);
    for (const d of this.doors) for (const t of d.tints) t.mat.color.copy(t.base).multiplyScalar(dark);
  }

  /** The cracks, splinters and holes, laid onto the doors' outer faces once the scene has placed them. */
  private build(): void {
    this.built = true;
    const box = new THREE.Box3();
    const at = new THREE.Vector3();
    for (const d of this.doors) {
      d.obj.updateWorldMatrix(true, true);
      box.setFromObject(d.obj);
      if (box.isEmpty()) continue;
      const size = box.getSize(new THREE.Vector3());
      // The doors are slabs across the wall: thin along x, their outer face (the dead's side) at +x.
      const face = box.max.x;
      const thick = Math.max(0.05, size.x);
      const place = (mesh: THREE.Object3D, u: number, v: number, out: number, below: number) => {
        at.set(face + out, box.min.y + v * size.y, box.min.z + u * size.z);
        mesh.position.copy(at);
        mesh.updateMatrixWorld();
        d.obj.attach(mesh);
        mesh.visible = false;
        this.pieces.push({ mesh, below });
      };
      // Cracks first: thin dark lines across the planks.
      for (let i = 0; i < 6; i++) {
        const len = size.y * (0.12 + this.rnd() * 0.18);
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, len, 0.035), MAT.crack);
        m.rotation.x = (this.rnd() - 0.5) * 1.6;
        place(m, 0.15 + this.rnd() * 0.7, 0.15 + this.rnd() * 0.7, 0.015, 0.92 - i * 0.05);
      }
      // Then planks knocked askew, their split ends pale.
      for (let i = 0; i < 5; i++) {
        const len = size.y * (0.16 + this.rnd() * 0.16);
        const w = size.z * (0.1 + this.rnd() * 0.06);
        const g = new THREE.Group();
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.07, len, w), MAT.plank);
        const end = new THREE.Mesh(new THREE.BoxGeometry(0.075, len * 0.18, w * 0.9), MAT.splinter);
        end.position.y = len * 0.45;
        g.add(plank, end);
        g.rotation.set((this.rnd() - 0.5) * 1.4, (this.rnd() - 0.5) * 0.7, 0);
        place(g, 0.18 + this.rnd() * 0.64, 0.2 + this.rnd() * 0.6, 0.06, 0.74 - i * 0.07);
      }
      // Last, holes punched clean through (dark right through the door), ringed with pale splinters.
      for (let i = 0; i < 4; i++) {
        const s = Math.min(size.y, size.z) * (0.22 + this.rnd() * 0.12);
        const g = new THREE.Group();
        g.add(
          new THREE.Mesh(new THREE.BoxGeometry(thick + 0.05, s, s * (0.65 + this.rnd() * 0.35)), MAT.hole),
        );
        for (let j = 0; j < 5; j++) {
          const a = (j / 5) * Math.PI * 2 + this.rnd() * 0.6;
          const sp = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, s * (0.25 + this.rnd() * 0.2), s * 0.08),
            MAT.splinter,
          );
          sp.position.set(size.x / 2 + 0.03, Math.sin(a) * s * 0.52, Math.cos(a) * s * 0.42);
          sp.rotation.x = a + Math.PI / 2 + (this.rnd() - 0.5) * 0.5;
          sp.rotation.y = (this.rnd() - 0.5) * 0.8;
          g.add(sp);
        }
        g.rotation.x = this.rnd() * Math.PI;
        place(g, 0.22 + this.rnd() * 0.56, 0.18 + this.rnd() * 0.55, -size.x / 2, 0.42 - i * 0.09);
      }
    }
  }
}
