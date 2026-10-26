import * as THREE from 'three';
import type { Assets, KitName } from '../assets.ts';
import { ZERO } from './transforms.ts';
const tmpM = new THREE.Matrix4();
const tmpC = new THREE.Color();
/** The toy set's wagons as mine tubs: their paint gone to iron, a little rust (one material per source). */
const ironOf = new WeakMap<THREE.Material, THREE.Material>();
export function ironMaterial(src: THREE.Material): THREE.Material {
  let m = ironOf.get(src);
  if (m) return m;
  m = src.clone();
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    base.call(m, shader, r);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       {
         float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
         vec3 iron = vec3(0.44, 0.41, 0.38) * (0.45 + 1.7 * lum);
         diffuseColor.rgb = mix(iron, diffuseColor.rgb, 0.05);
       }`,
    );
  };
  const key = m.customProgramCacheKey();
  m.customProgramCacheKey = () => `${key}iron`;
  ironOf.set(src, m);
  return m;
}

/** Many copies of one kit model: one instanced mesh per part, a colour (light) per copy. */
export class Batch {
  public readonly cap: number;

  readonly meshes: THREE.InstancedMesh[] = [];
  private locals: THREE.Matrix4[] = [];
  count = 0;

  constructor(
    assets: Assets,
    kit: KitName,
    model: string,
    cap: number,
    into: THREE.Object3D,
    look?: (m: THREE.Material) => THREE.Material,
    _near = true,
  ) {
    this.cap = cap;

    for (const part of assets.parts(kit, model, { fog: false })) {
      const im = new THREE.InstancedMesh(part.geometry, look ? look(part.material) : part.material, cap);
      im.count = 0;
      im.frustumCulled = false;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      into.add(im);
      this.meshes.push(im);
      this.locals.push(part.matrix);
    }
  }

  set(i: number, m: THREE.Matrix4, light = 1, tint?: THREE.Color): void {
    // Construction appends one mesh and one local transform for each model part.
    for (let p = 0; p < this.meshes.length; p++) {
      const im = this.meshes[p]!;
      im.setMatrixAt(i, tmpM.multiplyMatrices(m, this.locals[p]!));
      tmpC.setScalar(light);
      if (tint) tmpC.multiply(tint);
      im.setColorAt(i, tmpC);
    }
  }

  add(m: THREE.Matrix4, light = 1, tint?: THREE.Color): number {
    if (this.count >= this.cap) return -1;
    const i = this.count++;
    this.set(i, m, light, tint);
    for (const im of this.meshes) im.count = this.count;
    return i;
  }

  hide(i: number): void {
    for (const im of this.meshes) im.setMatrixAt(i, ZERO);
  }

  done(): void {
    for (const im of this.meshes) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
