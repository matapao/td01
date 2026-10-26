/** Execute the current hero task after frame movement and lifecycle handling. */
import type { Sim } from '../../sim.ts';
import type { Hero } from '../../entity-types.ts';
import { dist } from '../../../core/math.ts';
import { HERO, classOf } from '../../content/heroes.ts';
import { ENEMIES } from '../../content/enemies.ts';
import { NODES } from '../../content/workshop.ts';
import { PLANS } from '../../content/plans.ts';
import { approach, followPath, heroSpeed, walkTo } from '../hero-movement.ts';
import { digTick } from '../mining.ts';
import { interactArrive } from '../crafting/interactions.ts';
import { workTick } from '../crafting/work.ts';
import { meleeIfInReach, strike } from './abilities.ts';
import { hasToolFor, nearestNode } from './gathering.ts';
import { clearTask, releaseBlock } from './task-state.ts';

export function runTask(sim: Sim, h: Hero, dt: number): void {
  const t = h.task;
  switch (t.k) {
    case 'dig':
      digTick(sim, h, t.mine, t.cell, dt);
      return;
    case 'pilot':
      // Standing still, the controls in hand (the drone flies: see systems/drone).
      h.anim = 'pilot';
      return;
    case 'idle': {
      // Swing at a camp creature in reach — unless told to stop fighting (Esc) and not yet back at it.
      // Never at the dead on the roads: they are beyond any hero, and one blow of theirs kills.
      const e = h.peace ? null : sim.enemyAt(h.x, h.z, HERO.range + 0.6, (o) => !!o.camp);
      if (e && !e.flying) {
        h.task = { k: 'attack', target: e.id };
        meleeIfInReach(sim, h);
      }
      return;
    }
    case 'move': {
      if (followPath(sim, h, dt)) clearTask(h);
      return;
    }
    case 'attack': {
      const e = sim.getAs(t.target, 'enemy');
      if (!e || e.hp <= 0) {
        releaseBlock(sim, h);
        clearTask(h);
        return;
      }
      // Swords don't reach flyers; a mage's bolts do.
      if (e.flying && !classOf(h).ranged) {
        clearTask(h);
        return;
      }
      const r = ENEMIES[e.kind].radius + classOf(h).reach;
      const d = dist(h.x, h.z, e.x, e.z);
      if (d > r) {
        if (h.blocking === e.id) releaseBlock(sim, h);
        if (d < 6) {
          // Close: steer straight at it.
          const step = Math.min(d - r * 0.8, heroSpeed(sim, h) * dt);
          h.facing = Math.atan2(e.x - h.x, e.z - h.z);
          h.x += ((e.x - h.x) / d) * step;
          h.z += ((e.z - h.z) / d) * step;
          h.anim = 'run';
        } else walkTo(sim, h, e.x, e.z, r, dt);
        return;
      }
      h.facing = Math.atan2(e.x - h.x, e.z - h.z);
      if (h.attackCd <= 0) strike(sim, h, e);
      else if (h.animT > 0.5) h.anim = 'idle';
      else h.anim = 'attack';
      return;
    }
    case 'gather': {
      const n = sim.getAs(t.node, 'node');
      if (!n || n.amount <= 0) {
        const next = n ? nearestNode(sim, h, n.kind, n.x, n.z) : null;
        if (next) h.task = { k: 'gather', node: next };
        else clearTask(h);
        return;
      }
      if (!walkTo(sim, h, n.x, n.z, n.radius + HERO.reach, dt)) {
        h.swingCd = Math.min(h.swingCd, 0.15);
        return;
      }
      if (!hasToolFor(sim, h, n.kind)) {
        clearTask(h);
        return;
      }
      if (sim.bagSpace(h, NODES[n.kind].item) <= 0) {
        sim.emit('bagFull', { hero: h.id });
        clearTask(h);
        return;
      }
      const def = NODES[n.kind];
      h.facing = Math.atan2(n.x - h.x, n.z - h.z);
      h.anim = n.kind === 'tree' ? 'chop' : 'mine';
      h.swingCd -= dt;
      if (h.swingCd <= 0) {
        h.swingCd = def.hitTime;
        h.animT = 0;
        n.amount--;
        sim.state.stats.gathered++;
        sim.spawnDrop(def.item, (n.x + h.x) / 2, (n.z + h.z) / 2, n.x, n.z, h.id);
        sim.emit('gatherHit', { hero: h.id, node: n.id, kind: n.kind, x: n.x, z: n.z, left: n.amount });
        if (n.amount <= 0) {
          n.regrowT = def.regrow;
          sim.emit('nodeDepleted', { node: n.id, kind: n.kind });
        }
      }
      return;
    }
    case 'interact': {
      const a = approach(sim, t.target, h);
      if (!a) {
        clearTask(h);
        return;
      }
      if (!walkTo(sim, h, a.x, a.z, a.r, dt)) return;
      const at = a.look ?? a;
      h.facing = Math.atan2(at.x - h.x, at.z - h.z);
      sim.emit('heroArrived', { hero: h.id, target: t.target });
      interactArrive(sim, h, t.target);
      return;
    }
    case 'work': {
      const a = approach(sim, t.target, h);
      if (!a) {
        clearTask(h);
        return;
      }
      if (!walkTo(sim, h, a.x, a.z, a.r, dt)) return;
      const at = a.look ?? a;
      h.facing = Math.atan2(at.x - h.x, at.z - h.z);
      h.anim = 'work';
      if (!workTick(sim, h, t.target, dt)) clearTask(h);
      return;
    }
    case 'study': {
      h.anim = 'study';
      t.t += dt;
      if (t.t >= t.total) {
        if (!h.known.includes(t.plan)) h.known.push(t.plan);
        h.mastery[PLANS[t.plan].discipline]++;
        sim.emit('learned', { hero: h.id, plan: t.plan });
        clearTask(h);
      }
      return;
    }
  }
}
