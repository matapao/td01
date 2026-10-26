import * as THREE from 'three';
import { MAP } from '../../game/map.ts';
import { DRONE } from '../../game/content.ts';
import type { Hero } from '../../game/types.ts';
import { PERSON } from '../characters.ts';
import { droneModel } from '../procmodels.ts';
import { damp, dampAngle } from '../../core/math.ts';
import { gh, type ViewCtx } from './context.ts';

export class DroneView {
  private ctx: ViewCtx;

  readonly root = new THREE.Group();
  private rotors: THREE.Object3D[];
  private blink: THREE.Mesh;
  private t = Math.random() * 10;
  private vel = new THREE.Vector3();
  readonly pos = new THREE.Vector3();

  constructor(ctx: ViewCtx, h: Hero) {
    this.ctx = ctx;

    const m = droneModel();
    this.rotors = m.rotors;
    this.blink = m.blink;
    // Two people across: big enough to read from the camera behind it.
    m.root.scale.setScalar(1.6);
    this.root.add(m.root);
    this.pos.set(h.x, gh(ctx, h.x, h.z) + PERSON * 1.2, h.z);
    this.root.position.copy(this.pos);
    ctx.scene.add(this.root);
  }

  update(dt: number, h: Hero): void {
    this.t += dt;
    const x = h.droneX ?? h.x;
    const z = h.droneZ ?? h.z;
    const ground = Math.max(gh(this.ctx, x, z), MAP.waterLevel);
    const target = new THREE.Vector3(x, ground + DRONE.altitude + Math.sin(this.t * 2.1) * 0.06, z);
    const prev = this.pos.clone();
    this.pos.lerp(target, 1 - Math.exp(-dt * 14));
    this.vel.lerp(prev.sub(this.pos).multiplyScalar(-1 / Math.max(dt, 1e-3)), 1 - Math.exp(-dt * 6));
    this.root.position.copy(this.pos);
    // Nose into the flight, lean with it.
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.3)
      this.root.rotation.y = dampAngle(this.root.rotation.y, Math.atan2(this.vel.x, this.vel.z), 6, dt);
    this.root.rotation.x = damp(this.root.rotation.x, Math.min(0.35, sp * 0.05), 6, dt);
    for (const r of this.rotors) r.rotation.y += dt * 40;
    this.blink.visible = Math.sin(this.t * 6) > 0.4;
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
