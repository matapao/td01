/** Guard-room soldiers: slot placement, life cycle, movement and attacks. */
import { dist } from '../../../core/math.ts';
import { ENEMIES } from '../../content/enemies.ts';
import type { Building, Enemy, Unit } from '../../entity-types.ts';
import type { Sim } from '../../sim.ts';
import { makeSoldier } from '../soldier-spawn.ts';
import { damageEnemy } from './damage.ts';

const SLOTS = [
  [0, 0],
  [0.6, 0.45],
  [-0.6, 0.45],
  [0, -0.65],
  [0.65, -0.5],
] as const;

export function soldierSlot(b: Building, slot: number): { x: number; z: number } {
  const offset = SLOTS[slot % SLOTS.length];
  if (!offset) throw new Error(`Unknown soldier slot ${slot}`);
  const [ox, oz] = offset;
  return { x: b.rallyX + ox, z: b.rallyZ + oz };
}

export function spawnSoldiers(sim: Sim, b: Building): void {
  for (let i = 0; i < (b.stats?.soldiers ?? 0); i++) makeSoldier(sim, b, i);
}

export function damageUnit(sim: Sim, u: Unit, amount: number): void {
  if (u.dead) return;
  const dmg = amount * (1 - u.armor);
  u.hp -= dmg;
  sim.emit('unitHit', { id: u.id, amount: dmg });
  if (u.hp <= 0) {
    u.hp = 0;
    u.dead = true;
    u.anim = 'dead';
    const b = sim.getAs(u.tower, 'building');
    u.respawnT = b?.stats?.respawn ?? 10;
    if (u.target) {
      const e = sim.getAs(u.target, 'enemy');
      if (e && e.blocker === u.id) e.blocker = 0;
      u.target = 0;
    }
    sim.emit('unitDied', { id: u.id });
  }
}

const UNIT_SPEED = 2.0;

export function updateUnits(sim: Sim, dt: number): void {
  for (const u of sim.state.units) {
    u.px = u.x;
    u.pz = u.z;
    u.animT += dt;
    u.attackCd = Math.max(0, u.attackCd - dt);
    const b = sim.getAs(u.tower, 'building');
    if (!b || !b.stats) {
      sim.remove(u.id);
      continue;
    }
    if (u.dead) {
      u.respawnT -= dt;
      if (u.respawnT <= 0) {
        u.dead = false;
        u.hp = u.maxHp;
        u.x = u.px = b.x + Math.sin(b.rot) * 1.8;
        u.z = u.pz = b.z + Math.cos(b.rot) * 1.8;
        u.anim = 'idle';
        sim.emit('unitSpawned', { id: u.id, tower: b.id });
      }
      continue;
    }
    const slot = soldierSlot(b, u.slot);
    let e = u.target ? sim.getAs(u.target, 'enemy') : undefined;
    if (e && (e.hp <= 0 || e.flying || dist(e.x, e.z, slot.x, slot.z) > 6.5)) {
      if (e.blocker === u.id) e.blocker = 0;
      e = undefined;
      u.target = 0;
    }
    if (!e) {
      let best: Enemy | null = null;
      let bd = 3.4;
      for (const c of sim.state.enemies) {
        if (c.flying || c.spawnT > 0 || c.hp <= 0 || c.camp || c.burrowed) continue;
        const d = dist(c.x, c.z, slot.x, slot.z) + (c.blocker ? 1.5 : 0);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (best) {
        e = best;
        u.target = best.id;
        if (!best.blocker) best.blocker = u.id;
      }
    }
    if (e) {
      u.idleT = 0;
      const reach = ENEMIES[e.kind].radius + 0.35;
      const d = dist(u.x, u.z, e.x, e.z);
      u.facing = Math.atan2(e.x - u.x, e.z - u.z);
      if (d > reach) {
        const step = Math.min(d - reach * 0.9, UNIT_SPEED * dt);
        u.x += ((e.x - u.x) / d) * step;
        u.z += ((e.z - u.z) / d) * step;
        u.anim = 'run';
      } else {
        if (!e.blocker) e.blocker = u.id;
        if (u.attackCd <= 0) {
          u.attackCd = 1 / u.rate;
          u.anim = 'attack';
          u.animT = 0;
          damageEnemy(sim, e, u.damage, 'slash', u.id, false);
          if (b.stats.banner && e.hp > 0) {
            e.slowMul = Math.min(e.slowMul, 0.75);
            e.slowT = Math.max(e.slowT, 0.6);
          }
          sim.emit('unitAttack', { id: u.id, target: e.id });
        } else if (u.animT > 0.55) u.anim = 'idle';
      }
    } else {
      const d = dist(u.x, u.z, slot.x, slot.z);
      if (d > 0.15) {
        const step = Math.min(d, UNIT_SPEED * dt);
        u.facing = Math.atan2(slot.x - u.x, slot.z - u.z);
        u.x += ((slot.x - u.x) / d) * step;
        u.z += ((slot.z - u.z) / d) * step;
        u.anim = 'run';
      } else {
        u.anim = 'idle';
        u.idleT += dt;
        if (u.idleT > 2) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.08 * dt);
      }
    }
  }
}
