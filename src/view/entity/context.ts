import * as THREE from 'three';
import type { Sim } from '../../game/sim.ts';
import { groundHeight } from '../../game/map.ts';
import { type Assets } from '../assets.ts';
import type { Fx } from '../fx.ts';
import type { Labels } from '../labels.ts';

export interface ViewCtx {
  sim: Sim;
  assets: Assets;
  fx: Fx;
  labels: Labels;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  shake: (amount: number, x: number, z: number) => void;
  /** What the lens can see this frame (set up by EntityViews). */
  sight?: Sight;
}

export const gh = (ctx: ViewCtx, x: number, z: number) => groundHeight(ctx.sim.world, x, z);

/**
 * What the lens can see this frame. Characters are drawn without frustum culling (their animated
 * limbs outgrow their bounds), so they are culled here instead — nothing beyond the haze, behind
 * the lens or down another mine is drawn, and what isn't drawn isn't animated either.
 */
export class Sight {
  private camera: THREE.PerspectiveCamera;
  private scene: THREE.Scene;

  private frustum = new THREE.Frustum();
  private m = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  private far = 160;

  constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.camera = camera;
    this.scene = scene;
  }

  update(): void {
    this.camera.updateMatrixWorld();
    this.m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m);
    this.far = ((this.scene.fog as THREE.Fog | null)?.far ?? 150) + 12;
  }

  /** Is anything of a body `r` tall standing at p in view? */
  sees(p: THREE.Vector3, r: number): boolean {
    if (p.distanceToSquared(this.camera.position) > this.far * this.far) return false;
    this.sphere.center.set(p.x, p.y + r * 0.5, p.z);
    this.sphere.radius = r;
    return this.frustum.intersectsSphere(this.sphere);
  }
}
