import * as THREE from 'three';
import type { MineLayout } from '../../game/mines.ts';
import { h01, ROCK2, type Bed, type Lamp } from '../mine-paint.ts';
import { mineLight } from './lamps.ts';
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
/** Deterministic rubble at wall feet, avoiding track beds and wagon platforms. */
export function buildTalus(L: MineLayout, group: THREE.Group, lamps: Lamp[], beds: Bed): void {
  const f = L.field;
  const spots: { x: number; z: number; s: number; r: number }[] = [];
  for (let j = 0; j < f.nz; j++) {
    for (let i = 0; i < f.nx; i++) {
      // The field owns nx * nz samples; this loop stays inside those dimensions.
      const v = f.sdf[j * f.nx + i]!;
      if (v > -0.16 || v < -0.5) continue;
      const x = f.x0 + i * f.step;
      const z = f.z0 + j * f.step;
      if (h01(x, z) > 0.14) continue;
      if (beds.near(x, z) < 0.6) continue;
      if (L.wagons.some((w) => Math.hypot(w.x - x, w.z - z) < 1.3 || Math.hypot(w.ax - x, w.az - z) < 0.6))
        continue;
      spots.push({ x, z, s: 0.06 + 0.15 * h01(z, x), r: h01(x + 1, z) * 6 });
    }
  }
  const im = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    spots.length,
  );
  im.frustumCulled = false;
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spots.length * 3), 3);
  spots.forEach((p, k) => {
    im.setMatrixAt(
      k,
      new THREE.Matrix4().compose(
        tmpV.set(p.x, p.s * 0.35, p.z),
        tmpQ.setFromEuler(new THREE.Euler(p.r, p.r * 2, p.r * 0.5)),
        tmpS.set(p.s * 1.3, p.s * 0.8, p.s),
      ),
    );
    im.setColorAt(
      k,
      tmpC.copy(ROCK2).multiplyScalar(mineLight(lamps, p.x, 0.2, p.z) * (0.85 + 0.3 * h01(p.z, p.x + 3))),
    );
  });
  im.name = 'talus';
  group.add(im);
}
