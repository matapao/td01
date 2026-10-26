import * as THREE from 'three';
import { ITEMS } from '../../game/content.ts';
import { RARITY } from '../../game/loot.ts';
import type { Drop } from '../../game/types.ts';
import { PERSON } from '../characters.ts';
import { itemMesh } from '../itemmodels.ts';
import { damp } from '../../core/math.ts';
import { gh, type ViewCtx } from './context.ts';

export class DropView {
  private ctx: ViewCtx;
  public readonly d: Drop;

  readonly obj: THREE.Object3D;
  private t = 0;
  private from: THREE.Vector3;
  private to: THREE.Vector3;
  private beam: THREE.Mesh | null = null;
  collecting: THREE.Vector3 | null = null;
  private ct = 0;

  constructor(ctx: ViewCtx, d: Drop, fromX: number, fromZ: number, beamGeo: THREE.BufferGeometry) {
    this.ctx = ctx;
    this.d = d;

    this.obj = itemMesh(d.item, ctx.assets);
    const s = (d.item === 'gold' ? 0.8 + Math.min(1.2, d.amount / 25) : d.inst ? 1.35 : 1.1) * 0.45;
    this.obj.scale.setScalar(s);
    this.from = new THREE.Vector3(fromX, gh(ctx, fromX, fromZ) + PERSON * 0.6, fromZ);
    this.to = new THREE.Vector3(d.x, gh(ctx, d.x, d.z), d.z);
    this.obj.position.copy(this.from);
    ctx.scene.add(this.obj);
    if (d.inst) {
      const color = RARITY[d.inst.rarity].color;
      this.beam = new THREE.Mesh(
        beamGeo,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      this.beam.scale.set(0.35, 0.45, 0.35);
      this.beam.position.copy(this.to);
      ctx.scene.add(this.beam);
    }
  }

  update(dt: number, w: number, h: number, alt: boolean): boolean {
    this.t += dt;
    if (this.collecting) {
      this.ct += dt * 4.5;
      const p = this.obj.position.lerp(this.collecting, Math.min(1, this.ct));
      p.y += Math.sin(this.ct * Math.PI) * 0.4;
      this.obj.scale.multiplyScalar(0.92);
      return this.ct < 1;
    }
    const k = Math.min(1, this.t / 0.5);
    if (k < 1) {
      this.obj.position.lerpVectors(this.from, this.to, k);
      this.obj.position.y += Math.sin(k * Math.PI) * 1.3;
      this.obj.rotation.x += dt * 9;
    } else {
      const bounce = Math.max(
        0,
        0.25 *
          Math.sin(Math.min(1, (this.t - 0.5) / 0.3) * Math.PI) *
          (1 - Math.min(1, (this.t - 0.5) / 0.3)),
      );
      this.obj.position.set(
        this.to.x,
        this.to.y + bounce + (this.d.inst ? 0.25 + Math.sin(this.t * 2.4) * 0.08 : 0),
        this.to.z,
      );
      this.obj.rotation.x = damp(this.obj.rotation.x % (Math.PI * 2), 0, 8, dt);
      this.obj.rotation.y += dt * (this.d.inst ? 1.2 : this.d.item === 'gold' ? 0.8 : 0.3);
    }
    if (this.d.item === 'gold' && Math.random() < dt * 2) {
      this.ctx.fx.glow({
        x: this.obj.position.x + (Math.random() - 0.5) * 0.3,
        y: this.obj.position.y + 0.3,
        z: this.obj.position.z + (Math.random() - 0.5) * 0.3,
        vy: 0.6,
        life: 0.6,
        size: 0.2,
        color: '#ffe27a',
        tex: 'star',
      });
    }
    if (this.d.inst || alt) {
      const name = this.d.inst
        ? this.d.inst.name
        : this.d.item === 'gold'
          ? `${this.d.amount} gold`
          : ITEMS[this.d.item].name;
      const color = this.d.inst
        ? RARITY[this.d.inst.rarity].color
        : this.d.item === 'gold'
          ? '#ffd35a'
          : '#e8e2d0';
      const pos = this.obj.position.clone();
      pos.y += 0.7;
      this.ctx.labels.show(
        `drop:${this.d.id}`,
        pos,
        `<span style="color:${color}">${name}</span>`,
        'loot-label',
        w,
        h,
        true,
      );
    }
    return true;
  }

  collect(to: THREE.Vector3): void {
    this.collecting = to.clone().setY(to.y + 1);
    if (this.beam) {
      this.beam.removeFromParent();
      this.beam = null;
    }
  }

  dispose(): void {
    this.obj.removeFromParent();
    this.beam?.removeFromParent();
  }
}

// ---- Projectiles ---------------------------------------------------------------------------------

/** A hero's scout drone in the air: hovers, tilts into its flight, rotors spinning, lights blinking. */
