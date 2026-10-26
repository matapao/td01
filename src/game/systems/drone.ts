/**
 * The Warchief's scout drone. Launched, it hovers off its pilot — who stands still, controls in
 * hand — and flies where the player steers it (the client sends droneMove, like poses), never
 * further than DRONE.range from the pilot. It uncovers the land it flies over. Its battery runs
 * down; when it is empty (or when called) the drone flies home and docks. Wraiths close by and
 * casters from range shoot at it; if it falls, it is gone for a while.
 */
import type { Sim } from '../sim.ts';
import { ABILITIES, DRONE, ENEMIES } from '../content.ts';
import { dist } from '../../core/math.ts';
import type { Hero } from '../types.ts';
import { underground } from './mining-rules.ts';
import { indoors } from '../interiors.ts';

export const droneOut = (h: Hero): boolean => !!h.droneOn;

/** Launch the drone, or (when it is out) call it home. */
export function launchOrRecall(sim: Sim, h: Hero): void {
  if (h.droneOn) {
    h.droneBack = true;
    return;
  }
  if (underground(h.x) || indoors(h.x)) {
    sim.emit('denied', {
      hero: h.id,
      reason: underground(h.x)
        ? 'No signal this deep — fly the drone in the open'
        : 'Not indoors — fly the drone in the open',
    });
    return;
  }
  h.droneOn = true;
  h.droneBack = false;
  h.droneX = h.x;
  h.droneZ = h.z;
  h.droneHp = DRONE.hp;
  h.droneT = DRONE.battery;
  h.task = { k: 'pilot' };
  h.path = [];
  h.pathGoal = null;
  h.anim = 'pilot';
  sim.emit('droneLaunched', { hero: h.id, x: h.x, z: h.z });
}

/** Keeps a point within the drone's range of its pilot. */
export function inRange(h: Hero, x: number, z: number): { x: number; z: number; edge: boolean } {
  const d = dist(h.x, h.z, x, z);
  if (d <= DRONE.range) return { x, z, edge: false };
  return { x: h.x + ((x - h.x) / d) * DRONE.range, z: h.z + ((z - h.z) / d) * DRONE.range, edge: true };
}

/** The player steers the drone (validated: not too fast, never out of range). */
export function droneMove(h: Hero, x: number, z: number): void {
  if (!h.droneOn || h.droneBack || !Number.isFinite(x) || !Number.isFinite(z)) return;
  if (dist(h.droneX ?? h.x, h.droneZ ?? h.z, x, z) > 3) return;
  const p = inRange(h, x, z);
  h.droneX = p.x;
  h.droneZ = p.z;
}

function dock(_sim: Sim, h: Hero, cooldown: number): void {
  h.droneOn = false;
  h.droneBack = false;
  if (h.task.k === 'pilot') h.task = { k: 'idle' };
  if (h.anim === 'pilot') h.anim = 'idle';
  h.cds.drone = cooldown;
}

/** Shot down (or its pilot fell): the drone crashes and is out for a while. */
export function droneDown(sim: Sim, h: Hero): void {
  if (!h.droneOn) return;
  const x = h.droneX ?? h.x;
  const z = h.droneZ ?? h.z;
  dock(sim, h, DRONE.downCooldown);
  sim.emit('droneDown', { hero: h.id, x, z });
}

export function updateDrones(sim: Sim, dt: number): void {
  const s = sim.state;
  for (const h of s.heroes) {
    if (!h.droneOn) continue;
    if (h.dead) {
      droneDown(sim, h);
      continue;
    }
    if (h.task.k !== 'pilot') h.task = { k: 'pilot' };
    let x = h.droneX ?? h.x;
    let z = h.droneZ ?? h.z;
    h.droneT = Math.max(0, (h.droneT ?? 0) - dt);
    if (h.droneT <= 0) h.droneBack = true;
    if (h.droneBack) {
      // Home to the pilot's hand.
      const d = dist(x, z, h.x, h.z);
      if (d < 0.6) {
        dock(sim, h, ABILITIES.drone.cooldown);
        sim.emit('droneDocked', { hero: h.id });
        continue;
      }
      const step = Math.min(d, DRONE.speed * 1.2 * dt);
      x += ((h.x - x) / d) * step;
      z += ((h.z - z) / d) * step;
      h.droneX = x;
      h.droneZ = z;
    }
    // It sees the land below.
    if (s.tick % 10 === 0) sim.reveal(x, z, DRONE.sight);
    // The dead that can reach the sky shoot at it: wraiths up close, casters from range.
    for (const e of s.enemies) {
      if (e.hp <= 0 || e.spawnT > 0 || e.burrowed) continue;
      const def = ENEMIES[e.kind];
      const d = dist(e.x, e.z, x, z);
      let amount = 0;
      if (def.flying && d <= DRONE.wraithReach) {
        amount = DRONE.wraithDps * dt;
        if ((s.tick + e.id) % 10 === 0)
          sim.emit('droneHit', { hero: h.id, by: e.id, x, z, amount: DRONE.wraithDps * 0.5 });
      } else if ((e.kind === 'necromancer' || e.kind === 'lich') && d <= DRONE.casterReach) {
        // A bolt every casterRate seconds (staggered by id so they don't all fire at once).
        const period = Math.round(DRONE.casterRate * 20);
        if ((s.tick + e.id) % period === 0) {
          amount = DRONE.casterDamage;
          sim.emit('droneHit', { hero: h.id, by: e.id, x, z, amount });
        }
      }
      if (amount <= 0) continue;
      h.droneHp = (h.droneHp ?? DRONE.hp) - amount;
      if (h.droneHp <= 0) break;
    }
    if ((h.droneHp ?? 0) <= 0) droneDown(sim, h);
  }
}
