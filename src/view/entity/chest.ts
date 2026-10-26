import * as THREE from 'three';
import type { Chest } from '../../game/types.ts';
import { easeOutBack } from '../../core/math.ts';
import { gh, type ViewCtx } from './context.ts';

export class ChestView {
  public readonly c: Chest;

  readonly root = new THREE.Group();
  private lid: THREE.Object3D | null;
  private beam: THREE.Mesh;
  private openT = 0;
  constructor(ctx: ViewCtx, c: Chest, beamGeo: THREE.BufferGeometry) {
    this.c = c;

    const m = ctx.assets.model('dungeon', c.golden ? 'chest_gold' : 'chest');
    m.scale.setScalar(0.34);
    this.root.add(m);
    this.lid = m.getObjectByName(c.golden ? 'chest_gold_lid' : 'chest_lid') ?? null;
    this.root.position.set(c.x, gh(ctx, c.x, c.z), c.z);
    this.root.rotation.y = 0.6;
    this.beam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({
        color: c.golden ? '#ffcf4a' : '#ffe9a8',
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.beam.scale.set(0.5, 1.4, 0.5);
    this.beam.position.copy(this.root.position);
    ctx.scene.add(this.root, this.beam);
    this.cam = ctx.camera;
  }
  private cam: THREE.PerspectiveCamera;
  update(dt: number, c: Chest): void {
    if (c.opened) {
      this.openT = Math.min(1, this.openT + dt * 2.5);
      if (this.lid) this.lid.rotation.x = -easeOutBack(this.openT) * 1.9;
      this.beam.visible = false;
    } else {
      // A guiding light from afar; it melts away as you walk up to the chest.
      const near = Math.min(1, Math.max(0, (this.cam.position.distanceTo(this.root.position) - 4) / 10));
      (this.beam.material as THREE.MeshBasicMaterial).opacity =
        (0.3 + 0.1 * Math.sin(performance.now() * 0.003)) * near;
    }
  }
}

// ---- Manager -------------------------------------------------------------------------------------
