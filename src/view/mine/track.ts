import * as THREE from 'three';
import { TRACK, WAGON, type MineLayout } from '../../game/mines.ts';
import type { Hero } from '../../game/entity-types.ts';
import type { Assets } from '../assets.ts';
import type { Lamp } from '../mine-paint.ts';
import { Batch, ironMaterial } from './batch.ts';
import { mat4 } from './transforms.ts';
import { mineLight } from './lamps.ts';
/** Instanced track, waiting wagons and a capped set of interpolated rider wagons. */
export class MineTrack {
  private L: MineLayout;
  private group: THREE.Group;
  private lamps: Lamp[];
  private wagons: Batch[] = [];
  private wagonOf = new Map<number, { batch: number; i: number }>();
  private riders: { batch: Batch; used: number } | null = null;
  constructor(L: MineLayout, group: THREE.Group, lamps: Lamp[]) {
    this.L = L;
    this.group = group;
    this.lamps = lamps;
  }
  build(a: Assets): void {
    const S = TRACK.scale;
    const straight: THREE.Matrix4[] = [];
    const station: THREE.Matrix4[] = [];
    const curve: THREE.Matrix4[] = [];
    for (const line of this.L.lines) {
      for (const p of line.pieces) {
        const yaw = Math.atan2(p.hx, p.hz);
        if (p.kind === 'straight')
          straight.push(
            mat4(p.x + (p.hx * TRACK.straight) / 2, 0.012, p.z + (p.hz * TRACK.straight) / 2, yaw, S),
          );
        else if (p.kind === 'station')
          station.push(
            mat4(p.x + (p.hx * TRACK.station) / 2, 0.012, p.z + (p.hz * TRACK.station) / 2, yaw, S),
          );
        else {
          // The set's curve runs round its own origin, from (2, 0) heading +z to (0, 2) heading −x: a
          // right turn as it comes (its middle on the right); a left turn is the same piece laid from
          // its other end. Its origin goes on the turn's middle.
          const R = TRACK.radius;
          const nx = p.right ? -p.hz : p.hz;
          const nz = p.right ? p.hx : -p.hx;
          const ox = p.x + nx * R;
          const oz = p.z + nz * R;
          const yaw = Math.atan2(p.hx, p.hz);
          curve.push(mat4(ox, 0.012, oz, p.right ? yaw : yaw - Math.PI / 2, S));
        }
      }
    }
    const lay = (model: string, list: THREE.Matrix4[]) => {
      if (!list.length) return;
      const b = new Batch(a, 'bits', model, list.length, this.group, undefined, false);
      list.forEach((m) => b.add(m, 0.9));
      b.done();
    };
    lay('tracks_straight', straight);
    lay('tracks_straight_station', station);
    lay('tracks_curve', curve);
    // The wagons waiting at the platforms (a coal tender here and there), and a few for riders.
    const models = ['train_tender_empty', 'train_tender_coal'];
    this.wagons = models.map(
      (m) => new Batch(a, 'bits', m, this.L.wagons.length, this.group, ironMaterial, false),
    );
    for (const w of this.L.wagons) {
      const which = w.id % 3 === 1 ? 1 : 0;
      // Both wagon models were allocated above; which selects index 0 or 1.
      const b = this.wagons[which]!;
      const i = b.add(
        this.wagonMatrix(w.x, w.z, Math.atan2(w.hx * w.dir, w.hz * w.dir)),
        mineLight(this.lamps, w.x, 0.5, w.z),
      );
      this.wagonOf.set(w.id, { batch: which, i });
    }
    for (const b of this.wagons) b.done();
    this.riders = {
      batch: new Batch(a, 'bits', 'train_tender_empty', 8, this.group, ironMaterial, false),
      used: 0,
    };
  }

  private wagonMatrix(x: number, z: number, yaw: number): THREE.Matrix4 {
    return mat4(x, 0.03, z, yaw, TRACK.scale);
  }

  updateRiders(heroes: readonly Hero[], alpha: number): void {
    const r = this.riders;
    if (!r) return;
    const L = this.L;
    const near = new Set<number>();
    let used = 0;
    for (const h of heroes) {
      if (!h.ride || used >= r.batch.cap) continue;
      const w = L.wagons[h.ride.wagon];
      if (!w) continue;
      const x = h.px + (h.x - h.px) * alpha;
      const z = h.pz + (h.z - h.pz) * alpha;
      r.batch.set(used++, this.wagonMatrix(x, z, h.facing), mineLight(this.lamps, x, 0.5, z));
      for (const id of [w.id, w.to]) {
        const p = L.wagons[id];
        if (!p) continue;
        if (Math.hypot(p.x - x, p.z - z) < WAGON.len * 1.4) near.add(id);
      }
    }
    for (const im of r.batch.meshes) im.count = used;
    r.batch.done();
    for (const [id, at] of this.wagonOf) {
      const w = L.wagons[id];
      const b = this.wagons[at.batch]!;
      if (!w || !b) continue;
      if (near.has(id)) b.hide(at.i);
      else
        b.set(
          at.i,
          this.wagonMatrix(w.x, w.z, Math.atan2(w.hx * w.dir, w.hz * w.dir)),
          mineLight(this.lamps, w.x, 0.5, w.z),
        );
    }
    for (const b of this.wagons) b.done();
  }
}
