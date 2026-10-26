/** Hero attacks and class abilities, preserving their event and random-draw order. */
import type { Sim } from '../../sim.ts';
import type { Enemy, Hero, Id } from '../../entity-types.ts';
import type { AbilityId } from '../../content-types.ts';
import { dist } from '../../../core/math.ts';
import { ABILITIES, HERO, OVER_WALL, classOf } from '../../content/heroes.ts';
import { ENEMIES, LANE_DEAD, THREAT } from '../../content/enemies.ts';
import { tierMul, weaponMul } from '../../content/equipment.ts';
import { sizeOf } from '../../content/structures.ts';
import { onWall } from '../../map.ts';
import { damageEnemy } from '../combat/damage.ts';
import { fireProjectile } from '../combat/projectiles.ts';
import { launchOrRecall } from '../drone.ts';
import { releaseBlock } from './task-state.ts';

/**
 * A hero's basic damage: fists until you buy something heavier (tools double as weapons), and the
 * class weapon's tier on top — each reforge at the anvil hits WEAPON_DAMAGE harder.
 */
export function heroDamage(h: Hero): number {
  const c = classOf(h);
  // A mage's bolts don't care which axe you own.
  return (
    (HERO.damage + HERO.damagePerLevel * (h.level - 1)) *
    (c.ranged ? 1 : weaponMul(h.tools)) *
    c.damageMul *
    tierMul(h)
  );
}

/** The basic attack: a swing, or (Mage) an arcane bolt. */
export function strike(sim: Sim, h: Hero, e: Enemy): void {
  h.attackCd = 1 / HERO.rate;
  h.anim = 'attack';
  h.animT = 0;
  if (classOf(h).ranged) fireProjectile(sim, 'arcane', h.x, h.z, 0.45, e, heroDamage(h), 'arcane', h.id);
  else damageEnemy(sim, e, heroDamage(h), h.tools.length ? 'slash' : 'impact', h.id, sim.rng.chance(0.1));
  sim.emit('heroAttack', { hero: h.id, target: e.id });
}

export function cast(sim: Sim, h: Hero, id: AbilityId, target?: Id, x?: number, z?: number): void {
  const a = ABILITIES[id];
  const c = classOf(h);
  if (!c.abilities.includes(id)) {
    sim.emit('denied', { hero: h.id, reason: `${a.name} is not a ${c.name}'s skill` });
    return;
  }
  // While flying the drone, the hands are on the controls.
  if (h.droneOn && id !== 'drone') {
    sim.emit('denied', { hero: h.id, reason: 'You are flying the drone — 4 calls it home' });
    return;
  }
  if (h.cds[id] > 0 && !(id === 'drone' && h.droneOn)) {
    sim.emit('denied', { hero: h.id, reason: `${a.name} is recharging` });
    return;
  }
  const lvl = h.level - 1;
  const dmg = (a.damage ?? 0) + (a.damagePerLevel ?? 0) * lvl;
  const done = (at: { x: number; z: number } = h, tgt: Id = 0, proj?: Id) => {
    // Striking at the dead is fighting again (after an Esc stop).
    if (id !== 'mend' && id !== 'rally' && id !== 'wall') h.peace = false;
    h.cds[id] = a.cooldown;
    h.anim = 'cast';
    h.animT = 0;
    sim.emit('heroCast', {
      hero: h.id,
      ability: id,
      x: at.x,
      z: at.z,
      target: tgt,
      ...(proj !== undefined ? { proj } : {}),
    });
  };
  /** The enemy a targeted skill goes at (the one picked, else whatever stands at x, z), if in range. */
  const pick = (ground: boolean): Enemy | undefined => {
    let e = target ? sim.getAs(target, 'enemy') : undefined;
    if (!e && x !== undefined && z !== undefined) e = sim.enemyAt(x, z, 3, (o) => !!o.camp) ?? undefined;
    // The dead on the roads are beyond any hero's skills.
    if (e && !e.camp) {
      sim.emit('denied', { hero: h.id, reason: LANE_DEAD.why, x: e.x, z: e.z });
      return undefined;
    }
    if (!e || e.spawnT > 0 || e.hp <= 0 || (ground && (e.flying || e.burrowed))) {
      sim.emit('denied', { hero: h.id, reason: 'Pick an enemy' });
      return undefined;
    }
    if (dist(e.x, e.z, h.x, h.z) > a.range! + ENEMIES[e.kind].radius) {
      sim.emit('denied', { hero: h.id, reason: 'Out of range', x: e.x, z: e.z });
      return undefined;
    }
    h.facing = Math.atan2(e.x - h.x, e.z - h.z);
    return e;
  };
  const taunt = (e: Enemy) => {
    e.tauntT = THREAT.taunt;
    e.threat = Math.max(e.threat, THREAT.aggro);
  };
  const near = (r: number) =>
    sim.state.enemies.filter(
      (e) =>
        e.spawnT <= 0 && e.hp > 0 && !e.burrowed && dist(e.x, e.z, h.x, h.z) <= r + ENEMIES[e.kind].radius,
    );
  switch (id) {
    case 'slam': {
      const e = pick(true);
      if (!e) return;
      if (onWall(h.x, h.z)) {
        sim.emit('denied', { hero: h.id, reason: "You can't reach them from up here" });
        return;
      }
      damageEnemy(sim, e, dmg, 'impact', h.id, false);
      if (e.hp > 0 && !ENEMIES[e.kind].boss) e.stunT = Math.max(e.stunT, a.stun!);
      if (e.hp > 0 && !e.camp) taunt(e);
      done(e, e.id);
      return;
    }
    case 'cry': {
      // Taunt: camp creatures close by turn on you (off whoever they were after). The dead on the roads
      // only from up on the wall-walk — they stand below it, unable to reach you, under the towers'
      // fire; on the ground one blow of theirs would kill you, so the cry leaves them be.
      const up = onWall(h.x, h.z);
      for (const e of near(a.radius! + (up ? OVER_WALL.skillReach : 0))) {
        if (e.flying) continue;
        if (!e.camp) {
          if (up) taunt(e);
        } else if (!up) {
          e.aggro = h.id;
          e.tauntT = THREAT.taunt;
        }
      }
      done();
      return;
    }
    case 'wall':
      h.wallT = a.duration!;
      done();
      return;
    case 'mend': {
      const r = a.radius!;
      const heal = (who: { hp: number; maxHp: number; id: Id; x: number; z: number }, amount: number) => {
        const got = Math.min(who.maxHp - who.hp, amount);
        if (got <= 0) return;
        who.hp += got;
        sim.emit('healed', { id: who.id, x: who.x, z: who.z, amount: got });
      };
      for (const o of sim.state.heroes)
        if (!o.dead && dist(o.x, o.z, h.x, h.z) <= r) heal(o, o.maxHp * a.heal!);
      for (const u of sim.state.units)
        if (!u.dead && dist(u.x, u.z, h.x, h.z) <= r) heal(u, u.maxHp * a.heal!);
      for (const b of sim.state.buildings)
        if (dist(b.x, b.z, h.x, h.z) <= r + sizeOf(b.kind) / 2) heal(b, b.maxHp * 0.15);
      done();
      return;
    }
    case 'rally':
      for (const b of sim.state.buildings)
        if (b.stats && dist(b.x, b.z, h.x, h.z) <= a.radius!) b.hasteT = a.duration!;
      done();
      return;
    case 'repulse':
      for (const e of near(a.radius!)) {
        damageEnemy(sim, e, dmg, 'impact', h.id, false);
        if (!e.flying && !ENEMIES[e.kind].boss) {
          e.knockT = 0.35;
          e.knockV = a.knock! / 0.35;
          if (e.blocker) {
            const b = sim.get(e.blocker);
            if (b?.type === 'unit') b.e.target = 0;
            if (b?.type === 'hero') b.e.blocking = 0;
            e.blocker = 0;
          }
        }
        e.slowMul = Math.min(e.slowMul, 1 - a.slow!);
        e.slowT = Math.max(e.slowT, a.slowTime!);
      }
      done();
      return;
    case 'fireball': {
      const e = pick(false);
      if (!e) return;
      const p = fireProjectile(sim, 'fireball', h.x, h.z, 0.45, e, dmg, 'fire', h.id, { burnHit: 8 });
      done(e, e.id, p.id);
      return;
    }
    case 'nova':
      for (const e of near(a.radius!)) {
        damageEnemy(sim, e, dmg, 'frost', h.id, false);
        if (e.hp <= 0) continue;
        e.slowMul = Math.min(e.slowMul, 1 - a.slow!);
        e.slowT = Math.max(e.slowT, a.slowTime!);
      }
      done();
      return;
    case 'drone':
      launchOrRecall(sim, h);
      if (h.droneOn && !h.droneBack)
        sim.emit('heroCast', { hero: h.id, ability: id, x: h.x, z: h.z, target: 0 });
      return;
    case 'meteor': {
      const e = pick(true);
      if (!e) return;
      // Out of the sky onto where it stands: splash damage, and the ground burns.
      const p = fireProjectile(sim, 'meteor', e.x - 3.5, e.z - 3.5, 14, e, dmg, 'fire', h.id, {
        splash: a.radius!,
        burn: 10,
      });
      done(e, e.id, p.id);
      return;
    }
  }
}

/** Swing at the current target if it is within reach (no chasing). */
export function meleeIfInReach(sim: Sim, h: Hero): void {
  if (h.task.k !== 'attack') return;
  const e = sim.getAs(h.task.target, 'enemy');
  if (!e || e.hp <= 0 || (e.flying && !classOf(h).ranged) || e.burrowed) {
    releaseBlock(sim, h);
    h.task = { k: 'idle' };
    return;
  }
  const r = ENEMIES[e.kind].radius + classOf(h).reach;
  if (dist(h.x, h.z, e.x, e.z) > r) return;
  if (h.attackCd <= 0) strike(sim, h, e);
}
