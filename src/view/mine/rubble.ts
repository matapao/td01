import * as THREE from 'three';
import type { Mine, MineLayout } from '../../game/mines.ts';
import { h01 } from '../mine-paint.ts';
import { STONE, LEAF, BARK, type NatureKit } from '../nature.ts';
import { mat4, ZERO } from './transforms.ts';
/** Cave-in scenery and open/shut visibility, including streamed nature-kit instances. */
export class MineRubble {
  private L: MineLayout;
  private group: THREE.Group;
  private caveKey = '';
  private rubble: { cave: number; shut: THREE.Object3D; open: THREE.Object3D }[] = [];
  private natureRubble: { cave: number; meshes: THREE.InstancedMesh[]; shut: number[] }[] = [];
  constructor(L: MineLayout, group: THREE.Group, mine: Mine | undefined) {
    this.L = L;
    this.group = group;
    this.buildRubble(mine);
  }
  private buildRubble(m: Mine | undefined): void {
    const rockMat = new THREE.MeshLambertMaterial({ color: '#6e665c', flatShading: true });
    const beamMat = new THREE.MeshLambertMaterial({ color: '#5c3f24', flatShading: true });
    const chunk = new THREE.DodecahedronGeometry(1, 0);
    this.L.caveins.forEach((c, ci) => {
      const shut = new THREE.Group();
      const open = new THREE.Group();
      const nx = -c.hz;
      const nz = c.hx;
      // Shut: a mound across the drift, rising to the roof.
      for (let k = 0; k < 26; k++) {
        const u = (h01(ci, k) - 0.5) * c.half * 2.1;
        const v = (h01(ci + 7, k) - 0.5) * 2.4;
        const s = 0.22 + 0.32 * h01(ci + 3, k);
        const y = Math.max(0.1, (1 - Math.abs(v) / 1.6) * 1.0 * (1 - Math.abs(u) / (c.half * 1.3))) + s * 0.4;
        const m = new THREE.Mesh(chunk, rockMat);
        m.position.set(c.x + c.hx * u + nx * v, y * 0.9, c.z + c.hz * u + nz * v);
        m.scale.set(s * (1 + h01(ci, k + 40) * 0.5), s * 0.8, s);
        m.rotation.set(h01(ci, k + 9) * 3, h01(ci, k + 19) * 6, h01(ci, k + 29) * 3);
        shut.add(m);
      }
      // A broken set's timbers in it.
      for (let k = 0; k < 3; k++) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.6 + k * 0.3), beamMat);
        beam.position.set(c.x + nx * (k - 1) * 0.5, 0.55 + k * 0.25, c.z + nz * (k - 1) * 0.5);
        beam.rotation.set(0.5 - k * 0.4, Math.atan2(c.hx, c.hz) + 1.2 * (k - 1), 0.3 * k);
        shut.add(beam);
      }
      // Open: what's left, pushed against the walls.
      for (let k = 0; k < 10; k++) {
        const side = k % 2 ? 1 : -1;
        const u = (h01(ci + 11, k) - 0.5) * c.half * 3;
        const s = 0.14 + 0.2 * h01(ci + 13, k);
        const m = new THREE.Mesh(chunk, rockMat);
        m.position.set(
          c.x + c.hx * u + nx * side * (0.85 + h01(ci, k) * 0.25),
          s * 0.5,
          c.z + c.hz * u + nz * side * (0.85 + h01(ci, k) * 0.25),
        );
        m.scale.set(s * 1.3, s * 0.7, s);
        m.rotation.set(h01(ci, k + 3) * 3, h01(ci, k + 5) * 6, 0);
        open.add(m);
      }
      this.group.add(shut, open);
      this.rubble.push({ cave: ci, shut, open });
    });
    this.syncCaves(m, true);
  }

  syncCaves(m: Mine | undefined, force = false): void {
    const key = m ? m.open.map((o) => (o ? 1 : 0)).join('') : '';
    if (!force && key === this.caveKey) return;
    this.caveKey = key;
    for (const r of this.rubble) {
      const open = !!m?.open[r.cave];
      r.shut.visible = !open;
      r.open.visible = open;
    }
    for (const r of this.natureRubble) {
      const open = !!m?.open[r.cave];
      for (const im of r.meshes) {
        for (const i of r.shut) im.setMatrixAt(i, open ? ZERO : (im.userData['mats'] as THREE.Matrix4[])[i]!);
        im.instanceMatrix.needsUpdate = true;
      }
    }
  }

  buildNatureRubble(kit: NatureKit, m: Mine | undefined): void {
    const names = ['Rock_3_K', 'Rock_1_J', 'Rock_2_E', 'Rock_3_N'];
    const mat = kit.material(0);
    for (const [ci, c] of this.L.caveins.entries()) {
      const meshes: THREE.InstancedMesh[] = [];
      const shut: number[] = [];
      for (const [ni, name] of names.entries()) {
        const model = kit.models.get(name);
        if (!model) continue;
        const geo = new THREE.BufferGeometry();
        geo.setIndex(model.geometry.index);
        for (const [k, attr] of Object.entries(model.geometry.attributes)) geo.setAttribute(k, attr);
        const n = 4;
        const pal = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
        geo.setAttribute('aPal', pal);
        const im = new THREE.InstancedMesh(geo, mat, n);
        im.frustumCulled = false;
        const mats: THREE.Matrix4[] = [];
        for (let k = 0; k < n; k++) {
          const u = (h01(ci + ni, k) - 0.5) * c.half * 1.8;
          const v = (h01(ci + 5, k + ni * 7) - 0.5) * 1.8;
          const s = (0.42 + 0.35 * h01(ci, k + ni)) / Math.max(0.3, model.reach);
          const m = mat4(
            c.x + c.hx * u - c.hz * v,
            -0.05,
            c.z + c.hz * u + c.hx * v,
            h01(ci, k) * 6,
            s,
            s * 0.9,
            s,
          );
          mats.push(m);
          im.setMatrixAt(k, m);
          pal.setXYZ(k, LEAF.green, BARK.dark, h01(ci, k + 3) < 0.5 ? STONE.dark : STONE.grey);
          shut.push(k);
        }
        im.userData['mats'] = mats;
        im.count = n;
        this.group.add(im);
        meshes.push(im);
      }
      this.natureRubble.push({ cave: ci, meshes, shut });
    }
    this.syncCaves(m, true);
  }
}
