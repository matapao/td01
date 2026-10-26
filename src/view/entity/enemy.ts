import { siegeRam } from '../siege.ts';
import * as THREE from 'three';
import { DT } from '../../game/config.ts';
import { lanePos } from '../../game/map.ts';
import { ENEMIES } from '../../game/content.ts';
import { underground } from '../../game/systems/mining.ts';
import type { Enemy, Id } from '../../game/types.ts';
import { CharacterView, SPECS, specHeight } from '../characters.ts';
import { softDot } from '../textures.ts';
import { clamp, dampAngle, easeOutCubic, lerp } from '../../core/math.ts';
import { gh, type ViewCtx } from './context.ts';
import { ENEMY_ANIMS, type EnemyAnims } from './enemy-animations.ts';

const iceMat = new THREE.MeshLambertMaterial({
  color: '#bff3ff',
  emissive: '#59c9ff',
  emissiveIntensity: 0.6,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  flatShading: true,
});
const shieldMat = new THREE.MeshBasicMaterial({
  color: '#a77bff',
  transparent: true,
  opacity: 0.13,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const iceGeo = new THREE.IcosahedronGeometry(0.75, 0);
const shieldGeo = new THREE.SphereGeometry(0.72, 18, 12);

/** Down the mine, what lairs in the dark shows first by its eyes, glinting beyond your lantern. */
let eyeMat: THREE.SpriteMaterial | null = null;
const EYES_SEEN = 24;

export class EnemyView {
  private ctx: ViewCtx;

  ch: CharacterView;
  private eyes: THREE.Sprite[] | null = null;
  private blinkT = 2 + Math.random() * 4;
  private facing = 0;
  private last = '';
  private rise = 1;
  dead = false;
  dieT = 0;
  corpse: Id = 0;
  ice: THREE.Mesh;
  shield: THREE.Mesh;
  anims: EnemyAnims;
  private flyT = Math.random() * 10;
  private ram: THREE.Mesh | null = null;
  height: number;
  boss: boolean;

  constructor(ctx: ViewCtx, e: Enemy, raised: boolean) {
    this.ctx = ctx;

    const spec = SPECS[e.kind];
    this.ch = new CharacterView(ctx.assets, spec);
    if (e.kind === 'crusher') {
      this.ram = siegeRam();
      this.ch.root.add(this.ram);
    }
    this.anims = ENEMY_ANIMS[e.kind];
    this.boss = !!ENEMIES[e.kind].boss;
    // Health bars and numbers ride a little over its head; ice and wards wrap its body.
    this.height = specHeight(spec) * 1.12;
    const k = this.height / 0.465;
    const wide = this.ch.rig === 'large' ? 1.35 : 1;
    ctx.scene.add(this.ch.root);
    this.facing = e.facing;
    this.ice = new THREE.Mesh(iceGeo, iceMat);
    this.ice.visible = false;
    this.ice.scale.set(wide, 1.5, wide).multiplyScalar(0.3 * k);
    this.ice.position.y = 0.21 * k;
    this.ch.root.add(this.ice);
    this.shield = new THREE.Mesh(shieldGeo, shieldMat);
    this.shield.visible = false;
    this.shield.position.y = 0.75 * Math.max(1, k * 0.8);
    this.shield.scale.setScalar(Math.max(1, k * 0.8 * wide));
    this.ch.root.add(this.shield);
    if (e.spawnT > 0) {
      if (e.flying) {
        this.ch.once('Spawn_Air', this.anims.walk, 1.6);
        this.ch.fade = 0;
      } else if (raised) {
        this.ch.once('Skeletons_Death_Resurrect', this.anims.walk, 2.2);
        this.rise = 1;
      } else {
        // Out of the ground: on the roads the dead claw their way up; in a camp they get up off the floor.
        if (e.camp) this.ch.once(this.anims.rise ?? 'Skeletons_Awaken_Floor', this.anims.idle, 1.4);
        else this.ch.once('Skeletons_Spawn_Ground', this.anims.walk, 2.1);
        this.rise = 0;
        const p = new THREE.Vector3(e.x, gh(ctx, e.x, e.z), e.z);
        ctx.fx.burst(p.x, p.y + 0.1, p.z, 14, {
          color: '#7a5a3a',
          speed: 2.2,
          up: 3,
          size: 0.35,
          gravity: 12,
          tex: 'chunk',
          additive: false,
          life: 0.8,
        });
        ctx.fx.burst(p.x, p.y + 0.3, p.z, 8, {
          color: '#a77bff',
          color1: '#3a1f6a',
          speed: 1,
          up: 2.2,
          size: 0.5,
          gravity: -1,
          tex: 'smoke',
          life: 1.2,
        });
      }
    } else this.ch.play(this.anims.idle);
  }

  private mound: THREE.Mesh | null = null;

  update(e: Enemy | null, alpha: number, dt: number, visible: boolean): void {
    if (this.ram)
      this.ram.position.z = e?.anim === 'attack' ? Math.sin(Math.min(1, e.animT * 3) * Math.PI) * 0.12 : 0;
    const root = this.ch.root;
    if (e?.burrowed) {
      // Tunnelling: head and shoulders plough through the earth (you always see what's coming),
      // a heaving mound in front and a furrow of clods behind.
      if (!this.mound) {
        this.mound = new THREE.Mesh(
          new THREE.SphereGeometry(0.52, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshLambertMaterial({ color: '#5a3f2a', flatShading: true }),
        );
        this.mound.scale.set(1, 0.6, 1.5);
        this.ctx.scene.add(this.mound);
      }
      const x = lerp(e.px, e.x, alpha);
      const z = lerp(e.pz, e.z, alpha);
      const y = gh(this.ctx, x, z);
      this.facing = dampAngle(this.facing, e.facing, 10, dt);
      this.mound.position.set(x + Math.sin(this.facing) * 0.12, y - 0.04, z + Math.cos(this.facing) * 0.12);
      this.mound.rotation.y = this.facing;
      this.mound.scale.y = 0.6 + Math.sin(performance.now() * 0.012) * 0.08;
      this.mound.visible = true;
      root.visible = visible;
      root.position.set(x, y - this.height * 0.45, z);
      root.rotation.y = this.facing;
      if (this.last !== this.anims.walk) {
        this.ch.play(this.anims.walk, 0.2, 1.3);
        this.last = this.anims.walk;
      }
      root.visible = visible && (this.ctx.sight?.sees(root.position, this.height + 1) ?? true);
      if (!root.visible) return;
      if (Math.random() < dt * 16)
        this.ctx.fx.puff({
          x: x - Math.sin(this.facing) * 0.4 + (Math.random() - 0.5) * 0.5,
          y: y + 0.15,
          z: z - Math.cos(this.facing) * 0.4 + (Math.random() - 0.5) * 0.5,
          vy: 1.6,
          vx: Math.random() - 0.5,
          life: 0.7,
          size: 0.3,
          color: '#6e5036',
          gravity: 6,
          tex: 'chunk',
          alpha: 0.95,
        });
      this.ch.update(dt);
      return;
    }
    if (this.mound) {
      this.mound.removeFromParent();
      this.mound = null;
    }
    if (e) {
      const x = lerp(e.px, e.x, alpha);
      const z = lerp(e.pz, e.z, alpha);
      let y =
        e.lane >= 0 && !e.camp
          ? lanePos(this.ctx.sim.world.lanes[e.lane]!, e.d, e.lat).y
          : gh(this.ctx, x, z); // Active road enemies reference their generated lane.
      y = Math.max(y, gh(this.ctx, x, z) - 0.05);
      if (e.flying) {
        this.flyT += dt;
        y += 1.6 + Math.sin(this.flyT * 2.2) * 0.18;
      }
      if (this.rise < 1) {
        this.rise = Math.min(1, this.rise + dt / 1.5);
        y -= (1 - easeOutCubic(this.rise)) * 1.1;
      }
      root.position.set(x, y, z);
      this.facing = dampAngle(this.facing, e.facing, 10, dt);
      root.rotation.y = this.facing;
      if (e.flying && this.ch.fade < 1) this.ch.fade = Math.min(1, this.ch.fade + dt * 1.5);
      const frozen = e.frozenT > 0;
      this.ice.visible = frozen;
      this.ch.timeScale = frozen ? 0 : e.slowMul < 0.99 ? 0.6 : 1;
      this.shield.visible = e.shield > 0;
      if (this.shield.visible) this.shield.scale.setScalar(1 + Math.sin(performance.now() * 0.006) * 0.05);
      if (e.burnT > 0 && Math.random() < dt * 14) {
        this.ctx.fx.glow({
          x: x + (Math.random() - 0.5) * 0.5,
          y: y + 0.3 + Math.random() * 0.9,
          z: z + (Math.random() - 0.5) * 0.5,
          vy: 1.6,
          life: 0.5,
          size: 0.35,
          size1: 0.1,
          color: '#ffb347',
          color1: '#ff3d00',
          tex: 'dot',
        });
      }
      if (e.slowMul < 0.99 && !frozen && Math.random() < dt * 5) {
        this.ctx.fx.glow({
          x: x + (Math.random() - 0.5) * 0.6,
          y: y + 0.2 + Math.random(),
          z: z + (Math.random() - 0.5) * 0.6,
          vy: -0.3,
          life: 0.6,
          size: 0.18,
          color: '#bff3ff',
          tex: 'star',
        });
      }
      if (!this.ch.busy && !frozen) {
        let want = this.anims.walk;
        let speed = 1;
        if (e.anim === 'walk') {
          const v = ENEMIES[e.kind].speed * e.slowMul * (e.dashT > 0 ? 1.8 : 1) * (e.enraged ? 1.6 : 1);
          speed = this.anims.walkRef > 50 ? 1 : clamp(v / this.anims.walkRef, 0.5, 2.4);
        } else if (e.anim === 'idle' || e.anim === 'hit') want = this.anims.idle;
        if (want !== this.last || e.anim === 'walk') {
          this.ch.play(want, 0.2, speed);
          this.last = want;
        }
      }
      if (e.anim === 'attack' && e.animT < DT * 1.5) {
        this.ch.once(
          this.anims.attack[Math.floor(Math.random() * this.anims.attack.length)]!, // Every animation profile has an attack.
          this.anims.idle,
          1.3,
        );
        this.last = '';
      } else if (e.anim === 'cast' && e.animT < DT * 1.5 && this.anims.cast) {
        this.ch.once(this.anims.cast, this.anims.walk, 1.6);
        this.last = '';
      }
    } else {
      // Dying: collapse, linger as a bone pile, then sink.
      this.dieT += dt;
      this.ice.visible = false;
      this.shield.visible = false;
      this.ch.timeScale = 1;
      if (this.dieT > 5.5) root.position.y -= dt * 0.6;
      if (this.ch.spec.ghost) this.ch.fade = Math.max(0, 1 - this.dieT * 1.2);
    }
    // Out of sight (beyond the haze, behind the lens, down another mine): not drawn, not animated.
    const seen = visible && (this.ctx.sight?.sees(root.position, this.height + 1) ?? true);
    root.visible = seen;
    if (seen) this.ch.update(dt);
    this.updateEyes(e, dt);
  }

  /** A lair creature's eyes in the dark: two sparks up to EYES_SEEN m off, blinking now and then (the rock hides them). */
  private updateEyes(e: Enemy | null, dt: number): void {
    const dark = !!e && !!e.camp && e.hp > 0 && !this.dead && underground(e.x);
    if (!dark) {
      if (this.eyes) for (const s of this.eyes) s.visible = false;
      return;
    }
    const k = this.height / 0.465;
    if (!this.eyes) {
      eyeMat ??= new THREE.SpriteMaterial({
        map: softDot(32),
        color: '#ff4a26',
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: false,
      });
      this.eyes = [new THREE.Sprite(eyeMat), new THREE.Sprite(eyeMat)];
      for (const s of this.eyes) {
        s.scale.setScalar(0.085 * k);
        this.ctx.scene.add(s);
      }
    }
    this.blinkT -= dt;
    if (this.blinkT < -0.13) this.blinkT = 2.5 + Math.random() * 4;
    const root = this.ch.root;
    const show =
      this.blinkT > 0 && root.position.distanceToSquared(this.ctx.camera.position) < EYES_SEEN * EYES_SEEN;
    const fx = Math.sin(root.rotation.y);
    const fz = Math.cos(root.rotation.y);
    const y = root.position.y + this.height * 0.8;
    this.eyes.forEach((s, i) => {
      const side = (i ? 1 : -1) * 0.045 * k;
      s.position.set(
        root.position.x + fx * 0.1 * k + fz * side,
        y,
        root.position.z + fz * 0.1 * k - fx * side,
      );
      s.visible = show;
    });
  }

  die(): void {
    this.dead = true;
    this.ch.once(this.anims.death, '', 1.15);
  }

  /** A stomp: the big two-handed slam. */
  slam(): void {
    if (this.dead) return;
    this.ch.once('Melee_2H_Slam', this.anims.walk, 1.6);
    this.last = '';
  }

  /** Taunted (a Battle Cry) or enraged: it jeers back — the golem flexes. */
  taunt(): void {
    if (this.dead || this.ch.busy) return;
    this.ch.once('Skeletons_Taunt', this.anims.idle, 1.3);
    this.last = '';
  }

  dispose(): void {
    this.mound?.removeFromParent();
    for (const s of this.eyes ?? []) s.removeFromParent();
    this.ch.dispose();
  }
}
