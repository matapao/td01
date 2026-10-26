import * as THREE from 'three';
import { DT } from '../../game/config.ts';
import { DAMAGE_INFO, type DamageType } from '../../game/content.ts';
import type { Proj } from '../../game/types.ts';
import { PERSON } from '../characters.ts';
import { procMaterials } from '../procmodels.ts';
import { clamp, lerp } from '../../core/math.ts';
import { gh, type ViewCtx } from './context.ts';

export class ProjView {
  private ctx: ViewCtx;
  public readonly p: Proj;

  readonly obj: THREE.Object3D;
  private prev = new THREE.Vector3();
  private trailColor: string;

  constructor(ctx: ViewCtx, p: Proj, glowTex: THREE.Texture) {
    this.ctx = ctx;
    this.p = p;

    const A = ctx.assets;
    let obj: THREE.Object3D;
    switch (p.kind) {
      case 'bolt': {
        obj = new THREE.Group();
        const a = A.model('gear', 'arrow');
        a.scale.setScalar(1.6);
        a.rotation.x = Math.PI / 2;
        obj.add(a);
        break;
      }
      case 'boulder': {
        obj = A.model('medieval', 'projectile_catapult');
        obj.scale.setScalar(3.6);
        break;
      }
      case 'bomblet': {
        obj = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), procMaterials.pot);
        break;
      }
      case 'axe': {
        obj = new THREE.Group();
        const ax = A.model('gear', 'Skeleton_Axe');
        ax.scale.setScalar(1.4);
        obj.add(ax);
        break;
      }
      case 'fireball': {
        // A ball of fire: a white-hot core in an orange glow.
        obj = new THREE.Group();
        const glow = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTex,
            color: '#ff7a24',
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
          }),
        );
        glow.scale.setScalar(0.9);
        const core = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTex,
            color: '#fff2c0',
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
          }),
        );
        core.scale.setScalar(0.38);
        obj.add(glow, core);
        break;
      }
      case 'meteor': {
        // A burning rock: dark stone with glowing cracks, wrapped in fire.
        obj = new THREE.Group();
        const rock = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.42, 0),
          new THREE.MeshLambertMaterial({
            color: '#3a2a22',
            emissive: '#ff4a10',
            emissiveIntensity: 0.6,
            flatShading: true,
          }),
        );
        const glow = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTex,
            color: '#ff6a1a',
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
          }),
        );
        glow.scale.setScalar(2.2);
        obj.add(rock, glow);
        break;
      }
      default: {
        obj = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTex,
            color: '#c18bff',
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
          }),
        );
        obj.scale.setScalar(1.1);
      }
    }
    const t = p.dmgType as DamageType;
    this.trailColor = DAMAGE_INFO[t]?.color ?? '#ffffff';
    if (p.kind === 'arcane') {
      const mat = (obj as THREE.Sprite).material;
      mat.color.set(t === 'frost' ? '#9fe8ff' : t === 'lightning' ? '#fff27a' : '#c18bff');
      this.trailColor = '#' + mat.color.getHexString();
    }
    this.obj = obj;
    ctx.scene.add(obj);
    this.place(0);
    this.prev.copy(this.obj.position);
  }

  private place(alpha: number): void {
    const p = this.p;
    const t = clamp(p.t + (alpha - 1) * (DT / p.dur), 0, 1);
    const x = lerp(p.sx, p.tx, t);
    const z = lerp(p.sz, p.tz, t);
    const y0 = gh(this.ctx, p.sx, p.sz) + p.sy;
    const y1 =
      gh(this.ctx, p.tx, p.tz) +
      (p.kind === 'boulder' || p.kind === 'bomblet' || p.kind === 'meteor' ? 0.15 : PERSON * 0.55);
    const y = lerp(y0, y1, t) + Math.sin(t * Math.PI) * p.arc;
    this.obj.position.set(x, y, z);
  }

  update(alpha: number, dt: number): void {
    this.prev.copy(this.obj.position);
    this.place(alpha);
    const v = new THREE.Vector3().subVectors(this.obj.position, this.prev);
    if (this.p.kind === 'bolt' && v.lengthSq() > 1e-6) this.obj.lookAt(this.obj.position.clone().add(v));
    if (this.p.kind === 'boulder' || this.p.kind === 'bomblet') this.obj.rotation.x += dt * 6;
    if (this.p.kind === 'axe') this.obj.rotation.x += dt * 22;
    if (this.p.kind === 'meteor')
      this.obj.rotation.set(this.obj.rotation.x + dt * 3, this.obj.rotation.y + dt * 2, 0);
    const o = this.obj.position;
    if (this.p.kind === 'fireball' || this.p.kind === 'meteor') {
      const big = this.p.kind === 'meteor';
      this.ctx.fx.glow({
        x: o.x,
        y: o.y,
        z: o.z,
        life: big ? 0.6 : 0.35,
        size: big ? 1.4 : 0.55,
        size1: 0.1,
        color: '#ffb347',
        color1: '#ff3d00',
        tex: 'dot',
      });
      if (Math.random() < (big ? 1 : 0.5))
        this.ctx.fx.puff({
          x: o.x,
          y: o.y,
          z: o.z,
          life: big ? 1.4 : 0.6,
          size: big ? 0.6 : 0.25,
          size1: big ? 1.6 : 0.6,
          color: '#4a3c34',
          alpha: 0.45,
          tex: 'smoke',
        });
    }
    if (this.p.kind === 'arcane') {
      this.ctx.fx.glow({
        x: o.x,
        y: o.y,
        z: o.z,
        life: 0.35,
        size: 0.5,
        size1: 0.05,
        color: this.trailColor,
        tex: 'dot',
      });
      if (Math.random() < 0.5)
        this.ctx.fx.glow({
          x: o.x,
          y: o.y,
          z: o.z,
          vx: Math.random() - 0.5,
          vy: Math.random() - 0.5,
          vz: Math.random() - 0.5,
          life: 0.4,
          size: 0.2,
          color: '#ffffff',
          tex: 'star',
        });
    } else if (this.p.kind === 'boulder' && this.p.burn > 0) {
      this.ctx.fx.glow({
        x: o.x,
        y: o.y,
        z: o.z,
        life: 0.4,
        size: 0.7,
        size1: 0.2,
        color: '#ffb347',
        color1: '#ff3d00',
        tex: 'dot',
      });
    } else if (this.p.kind === 'boulder') {
      if (Math.random() < 0.4)
        this.ctx.fx.puff({
          x: o.x,
          y: o.y,
          z: o.z,
          life: 0.6,
          size: 0.3,
          size1: 0.7,
          color: '#bfb3a0',
          alpha: 0.35,
          tex: 'smoke',
        });
    } else if (this.p.kind === 'bolt' && this.p.dmgType !== 'pierce') {
      this.ctx.fx.glow({
        x: o.x,
        y: o.y,
        z: o.z,
        life: 0.25,
        size: 0.3,
        size1: 0.05,
        color: this.trailColor,
        tex: 'dot',
      });
    }
  }

  dispose(): void {
    this.obj.removeFromParent();
  }
}

// ---- Chests ---------------------------------------------------------------------------------------
