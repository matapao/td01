// Reverse cleanup indexes the current live porter list.
import { type StoreId } from '../../game/content.ts';
import type { Id } from '../../game/types.ts';
import { CHAR, CharacterView, SPECS, type CharacterSpec } from '../characters.ts';
import { dampAngle } from '../../core/math.ts';
import { gh, type ViewCtx } from './context.ts';

export class TownActors {
  private ctx: ViewCtx;

  private vendors: { store: StoreId; ch: CharacterView; rot: number; waveT: number; near: boolean }[] = [];
  private porters: { ch: CharacterView; t: number }[] = [];
  constructor(ctx: ViewCtx) {
    this.ctx = ctx;
  }
  spawnVendor(store: StoreId, spec: CharacterSpec, x: number, z: number, rot: number): void {
    const ch = new CharacterView(this.ctx.assets, spec);
    ch.root.position.set(x, gh(this.ctx, x, z), z);
    ch.root.rotation.y = rot;
    ch.play('Idle_A');
    this.ctx.scene.add(ch.root);
    this.vendors.push({ store, ch, rot, waveT: 0, near: false });
  }
  spawnPorter(x: number, z: number): void {
    if (this.porters.length >= 3) return;
    const a = Math.random() * Math.PI * 2;
    const px = x + Math.cos(a) * 2.4;
    const pz = z + Math.sin(a) * 2.4;
    // Once the vale has invented robots, a robot brings the load.
    const robots = (this.ctx.sim.state.road?.done ?? []).includes('robots');
    const spec = robots ? (Math.random() < 0.5 ? SPECS.porterRobot : SPECS.porterRobot2) : SPECS.porter;
    const ch = new CharacterView(this.ctx.assets, spec);
    ch.root.position.set(px, gh(this.ctx, px, pz), pz);
    ch.root.rotation.y = Math.atan2(x - px, z - pz);
    const sack = this.ctx.assets.model('medieval', 'sack');
    sack.position.set(0, 0.25, -0.42);
    sack.rotation.set(0.3, 0, 0);
    sack.scale.setScalar((4.2 * CHAR) / spec.scale);
    ch.attach('chest', sack);
    ch.once('PickUp', 'Waving', 1.3);
    this.ctx.scene.add(ch.root);
    this.porters.push({ ch, t: 0 });
  }
  updatePorters(dt: number): void {
    for (let i = this.porters.length - 1; i >= 0; i--) {
      const p = this.porters[i]!;
      p.t += dt;
      if (p.t > 3.2) p.ch.fade = Math.max(0, 1 - (p.t - 3.2) / 0.8);
      p.ch.root.visible = this.ctx.sight?.sees(p.ch.root.position, 1) ?? true;
      if (p.ch.root.visible) p.ch.update(dt);
      if (p.t > 4) {
        p.ch.dispose();
        this.porters.splice(i, 1);
      }
    }
  }
  keeper(store: StoreId): { ch: CharacterView } | undefined {
    return this.vendors.find((v) => v.store === store);
  }
  updateVendors(dt: number, localHero: Id): void {
    const me = this.ctx.sim.getAs(localHero, 'hero');
    for (const v of this.vendors) {
      const p = v.ch.root.position;
      const d = me && !me.dead ? Math.hypot(me.x - p.x, me.z - p.z) : Infinity;
      const near = d < 5;
      v.waveT -= dt;
      if (near && !v.near && v.waveT <= 0 && !v.ch.busy) {
        v.ch.once('Waving', 'Idle_A', 1.2);
        v.waveT = 30;
      }
      v.near = near;
      v.ch.root.rotation.y = dampAngle(
        v.ch.root.rotation.y,
        near && me ? Math.atan2(me.x - p.x, me.z - p.z) : v.rot,
        4,
        dt,
      );
      v.ch.root.visible = this.ctx.sight?.sees(p, 1) ?? true;
      if (v.ch.root.visible) v.ch.update(dt);
    }
  }
}
