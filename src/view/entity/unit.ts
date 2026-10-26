import type { Unit } from '../../game/types.ts';
import { CharacterView, type CharacterSpec } from '../characters.ts';
import { dampAngle, lerp } from '../../core/math.ts';
import { gh, type ViewCtx } from './context.ts';

export class UnitView {
  private ctx: ViewCtx;

  ch: CharacterView;
  private facing = 0;
  private last = '';
  specKey: string;

  constructor(ctx: ViewCtx, u: Unit, spec: CharacterSpec, specKey: string) {
    this.ctx = ctx;

    this.specKey = specKey;
    this.ch = new CharacterView(ctx.assets, spec);
    ctx.scene.add(this.ch.root);
    this.facing = u.facing;
    this.ch.play('Idle_A');
  }

  update(u: Unit, alpha: number, dt: number): void {
    const x = lerp(u.px, u.x, alpha);
    const z = lerp(u.pz, u.z, alpha);
    this.ch.root.position.set(x, gh(this.ctx, x, z), z);
    this.facing = dampAngle(this.facing, u.facing, 12, dt);
    this.ch.root.rotation.y = this.facing;
    if (u.dead) {
      if (this.last !== 'dead') this.ch.once('Death_B', '', 1.2);
      this.last = 'dead';
      this.ch.fade = Math.max(0, this.ch.fade - dt * 0.6);
    } else {
      this.ch.fade = Math.min(1, this.ch.fade + dt * 3);
      const want = u.anim === 'run' ? 'Running_A' : 'Idle_A';
      if ((!this.ch.busy || this.last === 'dead') && want !== this.last) {
        this.ch.play(want, 0.15, u.anim === 'run' ? 1.05 : 1);
        this.last = want;
      }
    }
    this.ch.root.visible = this.ch.fade > 0.02 && (this.ctx.sight?.sees(this.ch.root.position, 1) ?? true);
    if (this.ch.root.visible) this.ch.update(dt);
  }

  attack(captain: boolean): void {
    this.ch.once(
      captain
        ? 'Melee_2H_Attack_Slice'
        : Math.random() < 0.5
          ? 'Melee_1H_Attack_Slice_Diagonal'
          : 'Melee_1H_Attack_Chop',
      'Idle_A',
      1.5,
    );
    this.last = 'Idle_A';
  }

  dispose(): void {
    this.ch.dispose();
  }
}
