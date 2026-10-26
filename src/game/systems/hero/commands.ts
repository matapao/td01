/** Hero command validation and intent changes; task execution stays in tasks.ts. */
import type { Sim } from '../../sim.ts';
import type { Command } from '../../command-types.ts';
import type { Enemy } from '../../entity-types.ts';
import { CLASSES } from '../../content/heroes.ts';
import { LANE_DEAD, THREAT } from '../../content/enemies.ts';
import { groundHeight, onWall, outsideWalls } from '../../map.ts';
import { betweenWaves, dismount, horseOf } from '../../maintenance.ts';
import { indoors } from '../../interiors.ts';
import { inSpace } from '../../space.ts';
import { dist } from '../../../core/math.ts';
import { setPath, walkableAt } from '../hero-movement.ts';
import { atRoomDoor, doorways, walkOutOfBuilding } from '../rooms.ts';
import { underground } from '../mining-rules.ts';
import { droneMove } from '../drone.ts';
import { applyBeat } from '../crafting/work.ts';
import { studyTime } from '../crafting/site-rules.ts';
import { cast } from './abilities.ts';
import { hasToolFor } from './gathering.ts';
import { setClass } from './lifecycle.ts';
import { OVER_WALL_WHY, tooFar } from './reach.ts';
import { clearTask, heroById, releaseBlock } from './task-state.ts';

/** Max distance (m) at which right-click / interact is accepted; the hero walks the rest. */
const INTERACT_RANGE = 12;
const ATTACK_RANGE = 22;

export function applyHeroCommand(sim: Sim, cmd: Command): boolean {
  if (!('hero' in cmd)) return false;
  const h = heroById(sim, cmd.hero);
  if (!h) return true;
  // Riding a mine wagon: nothing to do but look round till it stops.
  if (h.ride && cmd.t !== 'steer' && cmd.t !== 'chooseClass') return true;
  switch (cmd.t) {
    case 'mount': {
      if (
        h.dead ||
        h.flight ||
        h.droneOn ||
        indoors(h.x) ||
        underground(h.x) ||
        inSpace(h.z) ||
        onWall(h.x, h.z)
      )
        return true;
      const horse = horseOf(h);
      if (horse.riding) {
        dismount(h);
        return true;
      }
      if (dist(h.x, h.z, horse.x, horse.z) > 2.2) {
        sim.emit('denied', { hero: h.id, reason: 'Go to your horse at the stable, or where you left it' });
        return true;
      }
      clearTask(h);
      releaseBlock(sim, h);
      horse.riding = true;
      return true;
    }
    case 'pose': {
      // While flying the drone the hero stands; steering goes to the drone (droneMove). Aboard a flight, nothing moves them.
      if (h.dead || h.droneOn || h.flight) return true;
      h.look = cmd.look;
      h.facing = cmd.facing;
      if (!cmd.moving) {
        h.moveT = 0;
        h.gait = 'idle';
        return true;
      }
      // The client moves its own hero; accept anything a hero could have walked in a beat.
      const d = Math.hypot(cmd.x - h.x, cmd.z - h.z);
      if (d > 2.5 || (!walkableAt(sim, cmd.x, cmd.z) && walkableAt(sim, h.x, h.z))) return true;
      // Nobody hops from the ground up onto the wall-walk (or down off it): only by its stairs.
      if (
        Math.abs(groundHeight(sim.world, cmd.x, cmd.z) - groundHeight(sim.world, h.x, h.z)) > 1.2 &&
        walkableAt(sim, h.x, h.z)
      )
        return true;
      if (h.task.k !== 'idle' && h.task.k !== 'attack') clearTask(h);
      h.path = [];
      h.pathGoal = null;
      h.x = h.px = cmd.x;
      h.z = h.pz = cmd.z;
      h.gait = cmd.gait;
      h.anim = 'run';
      h.moveT = 0.3;
      // Through a door if they walked into one (heading: where the gait takes them).
      doorways(
        sim,
        h,
        cmd.look +
          (cmd.gait === 'back'
            ? Math.PI
            : cmd.gait === 'right'
              ? -Math.PI / 2
              : cmd.gait === 'left'
                ? Math.PI / 2
                : 0),
      );
      return true;
    }
    case 'steer': {
      const l = Math.hypot(cmd.mx, cmd.mz);
      const k = l > 1 ? 1 / l : 1;
      h.steer.mx = cmd.mx * k;
      h.steer.mz = cmd.mz * k;
      h.look = cmd.look;
      return true;
    }
    case 'leave': {
      if (h.dead) return true;
      if (!atRoomDoor(sim, h))
        return (sim.emit('denied', { hero: h.id, reason: 'Walk to the door first' }), true);
      walkOutOfBuilding(sim, h);
      return true;
    }
    case 'move': {
      if (h.dead) return true;
      if (outsideWalls(cmd.x, cmd.z) && !betweenWaves(sim))
        return (sim.emit('denied', { hero: h.id, reason: OVER_WALL_WHY, x: cmd.x, z: cmd.z }), true);
      releaseBlock(sim, h);
      h.task = { k: 'move', x: cmd.x, z: cmd.z };
      if (!setPath(sim, h, cmd.x, cmd.z))
        sim.emit('denied', { hero: h.id, reason: "Can't get there", x: cmd.x, z: cmd.z });
      return true;
    }
    case 'attack': {
      if (h.dead) return true;
      const ent = sim.get(cmd.target);
      if (!ent) return true;
      // The dead on the roads are beyond any hero: no fighting them, near or far.
      if (ent.type === 'enemy' && !ent.e.camp) {
        sim.emit('denied', { hero: h.id, reason: LANE_DEAD.why, x: ent.e.x, z: ent.e.z });
        return true;
      }
      if (tooFar(sim, h, cmd.target, ent.type === 'enemy' ? ATTACK_RANGE : INTERACT_RANGE)) return true;
      releaseBlock(sim, h);
      if (ent.type === 'enemy') {
        h.task = { k: 'attack', target: cmd.target };
        h.peace = false;
      } else h.task = { k: 'interact', target: cmd.target };
      h.path = [];
      h.pathGoal = null;
      return true;
    }
    case 'interact': {
      dismount(h);
      if (h.dead) return true;
      const ent = sim.get(cmd.target);
      if (!ent) return true;
      if (ent.type === 'enemy' && !ent.e.camp) {
        sim.emit('denied', { hero: h.id, reason: LANE_DEAD.why, x: ent.e.x, z: ent.e.z });
        return true;
      }
      if (tooFar(sim, h, cmd.target, ent.type === 'enemy' ? ATTACK_RANGE : INTERACT_RANGE)) return true;
      releaseBlock(sim, h);
      if (ent.type === 'node' && !hasToolFor(sim, h, ent.e.kind)) return true;
      if (ent.type === 'enemy') h.task = { k: 'attack', target: cmd.target };
      else if (ent.type === 'node') h.task = { k: 'gather', node: cmd.target };
      else h.task = { k: 'interact', target: cmd.target };
      h.path = [];
      h.pathGoal = null;
      return true;
    }
    case 'stop':
      releaseBlock(sim, h);
      clearTask(h);
      if (cmd.peace) h.peace = true;
      return true;
    case 'cast':
      if (!h.dead) cast(sim, h, cmd.ability, cmd.target, cmd.x, cmd.z);
      return true;
    case 'droneMove':
      if (!h.dead) droneMove(h, cmd.x, cmd.z);
      return true;
    case 'chooseClass': {
      if (h.dead || !CLASSES[cmd.cls] || h.cls === cmd.cls) return true;
      // Not in the middle of a fight: camp creatures close by, or the dead on the roads once angered
      // (walking past, they leave you be).
      const onYou = (e: Enemy) =>
        e.hp > 0 &&
        !e.burrowed &&
        dist(e.x, e.z, h.x, h.z) < 8 &&
        (!!e.camp || e.threat >= THREAT.aggro || e.tauntT > 0);
      if (sim.state.enemies.some(onYou)) {
        sim.emit('denied', { hero: h.id, reason: 'Not while the dead are on you' });
        return true;
      }
      setClass(sim, h, cmd.cls);
      return true;
    }
    case 'beat':
      applyBeat(sim, h, cmd.quality);
      return true;
    case 'study': {
      if (h.dead) return true;
      if (h.known.includes(cmd.plan)) {
        sim.emit('denied', { hero: h.id, reason: 'Already learned' });
        return true;
      }
      if (!sim.state.library.includes(cmd.plan)) {
        sim.emit('denied', { hero: h.id, reason: 'Find or buy this plan first' });
        return true;
      }
      releaseBlock(sim, h);
      const total = studyTime(h, cmd.plan);
      h.task = { k: 'study', plan: cmd.plan, t: 0, total };
      h.path = [];
      h.pathGoal = null;
      sim.emit('studyStarted', { hero: h.id, plan: cmd.plan });
      return true;
    }
    default:
      return false;
  }
}
