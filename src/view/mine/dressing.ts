import * as THREE from 'three';
import { MINE_AT, STATION, mineRoof, mineSdf, type MineLayout } from '../../game/mines.ts';
import type { Assets } from '../assets.ts';
import type { Lamp } from '../mine-paint.ts';
import { Batch } from './batch.ts';
import { mat4 } from './transforms.ts';
import { mineLight } from './lamps.ts';
const Y = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
/** Streamed scenery uses kit-owned geometry/materials and steady baked lamp warmth. */
export class MineDressing {
  private L: MineLayout;
  private group: THREE.Group;
  private lamps: Lamp[];
  private flame: (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    color: THREE.Color,
    k: number,
  ) => void;
  constructor(L: MineLayout, group: THREE.Group, lamps: Lamp[], flame: MineDressing['flame']) {
    this.L = L;
    this.group = group;
    this.lamps = lamps;
    this.flame = flame;
  }
  buildTimbers(a: Assets): void {
    const sets: { x: number; z: number; yaw: number; w: number; h: number; old: boolean }[] = [];
    for (const dr of this.L.drifts) {
      // Along the drift's middle, a set every 2.4 m.
      let acc = 0;
      // Each drift segment pairs point q with the preceding point.
      for (let q = 1; q < dr.pts.length; q++) {
        const p0 = dr.pts[q - 1]!;
        const p1 = dr.pts[q]!;
        const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
        acc += len;
        if (acc < 2.4) continue;
        acc = 0;
        const tx = (p1.x - p0.x) / (len || 1);
        const tz = (p1.z - p0.z) / (len || 1);
        // Not in the station or the chambers (their rock stands on its own), nor too near another set.
        if (Math.hypot(p1.x - MINE_AT.x, p1.z - MINE_AT.z) < STATION.r - 1.4) continue;
        if (this.L.chambers.some((c) => c.grade > 0 && Math.hypot(p1.x - c.x, p1.z - c.z) < c.r - 1.2))
          continue;
        // The walls either side: walk out from the middle to the rock.
        const wall = (side: number) => {
          let t = 0.3;
          while (t < 2.4 && mineSdf(undefined, p1.x - tz * side * t, p1.z + tx * side * t) < -0.18) t += 0.05;
          return t;
        };
        // Nor in the dens, nor anywhere the drift has opened out too wide for one cap to span.
        if (this.L.dens.some((d) => Math.hypot(p1.x - d.x, p1.z - d.z) < d.r + 0.4)) continue;
        const l = wall(-1);
        const r = wall(1);
        if (l + r > 3.3) continue;
        const mid = (r - l) / 2;
        const x = p1.x - tz * mid;
        const z = p1.z + tx * mid;
        const h =
          Math.min(
            mineRoof(undefined, p1.x - tz * (mid - (l + r) / 2 + 0.2), p1.z + tx * (mid - (l + r) / 2 + 0.2)),
            mineRoof(undefined, p1.x + tz * (l - 0.2), p1.z - tx * (l - 0.2)),
          ) - 0.06;
        sets.push({
          x,
          z,
          yaw: Math.atan2(tx, tz),
          w: l + r - 0.1,
          h: Math.max(1.0, Math.min(1.5, h)),
          old: dr.old,
        });
      }
    }
    const post = new Batch(a, 'mine', 'scaffold_pillar_wall', sets.length * 2 + 16, this.group);
    const cap = new Batch(a, 'mine', 'scaffold_beam_wall', sets.length + 8, this.group);
    const tint = new THREE.Color('#f4e2cc');
    const oldTint = new THREE.Color('#b8a893');
    for (const s of sets) {
      const k = s.h / 4;
      const light = mineLight(this.lamps, s.x, 1, s.z);
      for (const side of [-1, 1]) {
        // The post's back sits against its wall; its knee braces run along the drift.
        const ox = Math.cos(s.yaw) * side * (s.w / 2 - 0.24 * k * 4 * 0.25);
        const oz = -Math.sin(s.yaw) * side * (s.w / 2 - 0.24 * k * 4 * 0.25);
        const m = new THREE.Matrix4().compose(
          tmpV.set(s.x + ox, 0, s.z + oz),
          tmpQ.setFromAxisAngle(Y, s.yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2)),
          tmpS.set(k * 0.6, k, k),
        );
        // Its local z is 0.5–0.85 (×k) off the origin: pull it back so its back meets the wall.
        m.multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.85));
        post.add(m, light, s.old ? oldTint : tint);
      }
      const capM = new THREE.Matrix4().compose(
        tmpV.set(s.x, 0, s.z),
        tmpQ.setFromAxisAngle(Y, s.yaw + Math.PI / 2),
        tmpS.set(s.w / 4, k, k),
      );
      capM.multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.675));
      cap.add(capM, light, s.old ? oldTint : tint);
    }
    post.done();
    cap.done();
    this.buildDens(a);
  }

  buildLanterns(a: Assets): void {
    const hang = new Batch(a, 'halloween', 'lantern_hanging', this.lamps.length, this.group);
    for (const l of this.lamps) hang.add(mat4(l.x, l.y + 0.33, l.z, l.x * 3, 0.28), 1.3);
    hang.done();
  }

  buildStation(a: Assets): void {
    const at = MINE_AT;
    const crates = new Batch(a, 'dungeon', 'crates_stacked', 4, this.group);
    const barrels = new Batch(a, 'dungeon', 'barrel_small_stack', 4, this.group);
    const posts = new Batch(a, 'halloween', 'post_lantern', 4, this.group);
    for (let q = 0; q < 4; q++) {
      const ang = (q + 0.5) * (Math.PI / 2);
      const r = STATION.r - 1.0;
      const x = at.x + Math.cos(ang) * r;
      const z = at.z + Math.sin(ang) * r;
      const yaw = -ang + Math.PI / 2;
      if (q % 2) crates.add(mat4(x, 0, z, yaw, 0.28), mineLight(this.lamps, x, 0.5, z));
      else barrels.add(mat4(x, 0, z, yaw, 0.32), mineLight(this.lamps, x, 0.5, z));
      posts.add(mat4(at.x + Math.cos(ang) * 3.3, 0, at.z + Math.sin(ang) * 3.3, yaw, 0.46), 1.2);
    }
    crates.done();
    barrels.done();
    posts.done();
    // A plank landing round the lift.
    const deck = new Batch(a, 'dungeon', 'floor_wood_large', 4, this.group, undefined, false);
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      deck.add(
        mat4(at.x + sx * 1.0, -0.035, at.z + sz * 1.0, 0, 0.5),
        mineLight(this.lamps, at.x, 0.2, at.z) * 0.9,
      );
    deck.done();
  }

  private buildDens(a: Assets): void {
    for (const d of this.L.dens) {
      const den = this.L.lairs[d.lair]?.den;
      if (!den) throw new Error(`Missing mine lair ${d.lair}`);
      const light = mineLight(this.lamps, d.x, 0.4, d.z);
      if (den === 'wolves') {
        const bones = new Batch(a, 'halloween', 'bone_A', 6, this.group);
        const skull = new Batch(a, 'halloween', 'skull', 2, this.group);
        for (let k = 0; k < 6; k++) {
          const ang = k * 1.7;
          const r = 0.6 + (k % 3) * 0.55;
          bones.add(mat4(d.x + Math.cos(ang) * r, 0.02, d.z + Math.sin(ang) * r, ang * 2, 0.2), light);
        }
        skull.add(mat4(d.x + 1.1, 0, d.z - 0.7, 2, 0.16), light);
        skull.add(mat4(d.x - 0.9, 0, d.z + 1.2, 4, 0.14), light);
        bones.done();
        skull.done();
      } else if (den === 'raiders') {
        const fire = new Batch(a, 'mine', 'Campfire_Base', 1, this.group);
        const logs = new Batch(a, 'mine', 'Campfire_Logs', 1, this.group);
        const drum = new Batch(a, 'mine', 'Orc_Wardrum', 1, this.group);
        const banner = new Batch(a, 'mine', 'Orc_Banner', 1, this.group);
        fire.add(mat4(d.x, 0, d.z, 0, 0.3), 1.2);
        logs.add(mat4(d.x, 0, d.z, 0.5, 0.3), 1.2);
        drum.add(mat4(d.x + 1.4, 0, d.z - 0.9, 0.3, 0.26), light);
        banner.add(mat4(d.x - 1.5, 0, d.z - 1.2, 0.8, 0.34), light);
        for (const b of [fire, logs, drum, banner]) b.done();
        this.flame(d.x, 0.25, d.z, 0.35, 0.5, new THREE.Color('#ffb050'), 1.3);
        this.flame(d.x, 0.3, d.z, 2.2, 2.2, new THREE.Color('#ff7a24'), 0.45);
      } else if (den === 'dead') {
        const candles = new Batch(a, 'halloween', 'candle_melted', 5, this.group);
        const picks = new Batch(a, 'mine', 'dungeon_pickaxe', 3, this.group);
        for (let k = 0; k < 5; k++) {
          const ang = k * 1.26 + 0.4;
          const x = d.x + Math.cos(ang) * 1.6;
          const z = d.z + Math.sin(ang) * 1.6;
          candles.add(mat4(x, 0, z, ang, 0.16), 1.1);
          this.flame(x, 0.17, z, 0.08, 0.12, new THREE.Color('#ffe0a0'), 1.2);
        }
        for (let k = 0; k < 3; k++)
          picks.add(
            new THREE.Matrix4().compose(
              tmpV.set(d.x + (k - 1) * 0.8, 0.03, d.z + 0.6 - k * 0.4),
              tmpQ.setFromEuler(new THREE.Euler(Math.PI / 2, k * 1.3, 0)),
              tmpS.setScalar(0.22),
            ),
            light,
          );
        candles.done();
        picks.done();
      }
    }
  }
}
