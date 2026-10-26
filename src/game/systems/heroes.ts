/** Hero frame coordinator and compatibility entry; focused leaves own commands and rules. */
export {
  approach,
  waterPace,
  heroSpeed,
  walkableAt,
  bodyFree,
  slide,
  onField,
  postSpot,
} from './hero-movement.ts';
export { heroById } from './hero/task-state.ts';
export { ejectFromFootprint, inReachOf, postOf, OVER_WALL_WHY } from './hero/reach.ts';
export { hasToolFor } from './hero/gathering.ts';
export { heroDamage } from './hero/abilities.ts';
export { setClass, grantXp, damageHero } from './hero/lifecycle.ts';
export { applyHeroCommand } from './hero/commands.ts';

import type { Sim } from '../sim.ts';
import type { AbilityId } from '../content-types.ts';
import { HERO } from '../content/heroes.ts';
import { heroSpeed, steerMove } from './hero-movement.ts';
import { updateTransit } from '../transit.ts';
import { betweenWaves, dismount } from '../maintenance.ts';
import { MAP, outsideWalls } from '../map.ts';
import { GATE_WINCH } from './wall.ts';
import { rideTick, underground } from './mining.ts';
import { doorways, rescueLost } from './rooms.ts';
import { indoors } from '../interiors.ts';
import { inSpace } from '../space.ts';
import { clearTask } from './hero/task-state.ts';
import { takePost } from './hero/reach.ts';
import { meleeIfInReach } from './hero/abilities.ts';
import { runTask } from './hero/tasks.ts';

export function updateHeroes(sim: Sim, dt: number): void {
  rescueLost(sim);
  for (const h of sim.state.heroes) {
    if (h.dead) dismount(h);
    // Aboard a flight to or from Space: carried along (see systems/space).
    if (h.flight) {
      h.px = h.x;
      h.pz = h.z;
      continue;
    }
    h.px = h.x;
    h.pz = h.z;
    if (updateTransit(sim, h, dt)) continue;
    h.animT += dt;
    h.beatCd = Math.max(0, h.beatCd - dt);
    for (const k in h.cds) h.cds[k as AbilityId] = Math.max(0, h.cds[k as AbilityId] - dt);
    if (h.wallT > 0) h.wallT = Math.max(0, h.wallT - dt);
    if (h.dead) {
      h.respawnT -= dt;
      if (h.respawnT <= 0) {
        h.dead = false;
        h.hp = h.maxHp;
        h.x = h.px = MAP.heroStart.x;
        h.z = h.pz = MAP.heroStart.z;
        h.anim = 'idle';
        sim.emit('heroRespawned', { hero: h.id });
      }
      continue;
    }
    h.hp = Math.min(h.maxHp, h.hp + (HERO.regen + HERO.regenPerLevel * (h.level - 1)) * dt);
    h.attackCd = Math.max(0, h.attackCd - dt);
    if (h.anim !== 'cast' || h.animT > 0.6)
      h.anim = (h.fabricatingUntil ?? 0) > sim.state.time ? 'work' : 'idle';
    // In a mine wagon, rolling on to the next stop (see systems/mining).
    if (h.ride) {
      rideTick(sim, h, dt);
      continue;
    }
    // Somehow out on the field (a game saved up on a tower, before heroes stayed in): back inside the gate.
    if (outsideWalls(h.x, h.z) && !betweenWaves(sim)) {
      h.x = h.px = GATE_WINCH.x;
      h.z = h.pz = GATE_WINCH.z;
      clearTask(h);
    }
    if (h.dead || indoors(h.x) || underground(h.x) || inSpace(h.z)) dismount(h);
    // Up on the wall-walk: crewing the nearest tower in reach.
    takePost(sim, h);
    if (h.moveT > 0) {
      // The player's client is walking the hero (poses); combat keeps its target.
      h.moveT -= dt;
      h.anim = 'run';
      if (h.moveT <= 0) h.gait = 'idle';
      if (h.task.k === 'attack') meleeIfInReach(sim, h);
      continue;
    }
    const sl = Math.hypot(h.steer.mx, h.steer.mz);
    if (sl > 0.05) {
      // The player is driving: channels and auto-walking stop (combat keeps its target).
      if (h.task.k !== 'idle' && h.task.k !== 'attack') clearTask(h);
      h.path = [];
      h.pathGoal = null;
      const fx = Math.sin(h.look);
      const fz = Math.cos(h.look);
      const along = (h.steer.mx * fx + h.steer.mz * fz) / sl;
      const side = (h.steer.mx * fz - h.steer.mz * fx) / sl;
      const speed = heroSpeed(sim, h) * Math.min(1, sl) * (along < -0.4 ? 0.62 : 1);
      steerMove(sim, h, (h.steer.mx / sl) * speed * dt, (h.steer.mz / sl) * speed * dt);
      h.facing = h.look;
      doorways(sim, h, Math.atan2(h.steer.mx, h.steer.mz));
      h.gait = along > 0.4 ? 'fwd' : along < -0.4 ? 'back' : side > 0 ? 'left' : 'right';
      h.anim = 'run';
      if (h.task.k === 'attack') meleeIfInReach(sim, h);
      continue;
    }
    h.gait = 'idle';
    if ((h.earthAt ?? 0) > sim.state.time) {
      h.anim = 'mine';
      continue;
    }
    runTask(sim, h, dt);
  }
}
