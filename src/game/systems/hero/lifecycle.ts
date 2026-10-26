/** Class changes, experience thresholds, and death/drop ownership. */
import type { Sim } from '../../sim.ts';
import type { Hero, Id } from '../../entity-types.ts';
import type { HeroClass } from '../../content-types.ts';
import type { ItemId } from '../../item-data.ts';
import { HERO, classOf } from '../../content/heroes.ts';
import { droneDown } from '../drone.ts';
import { clearTask, releaseBlock } from './task-state.ts';

/** Take up a class (out of a fight): health keeps its share, the skills change. */
export function setClass(sim: Sim, h: Hero, cls: HeroClass): void {
  const frac = h.maxHp > 0 ? h.hp / h.maxHp : 1;
  // A drone in the air comes down with the old class.
  if (h.droneOn) droneDown(sim, h);
  h.cls = cls;
  h.maxHp = classOf(h).hp + HERO.hpPerLevel * (h.level - 1);
  h.hp = Math.max(1, Math.round(h.maxHp * frac));
  h.wallT = 0;
  releaseBlock(sim, h);
  if (h.task.k === 'attack') clearTask(h);
  sim.emit('classChosen', { hero: h.id, cls });
}

export function grantXp(sim: Sim, h: Hero, xp: number): void {
  if (h.dead) return;
  h.xp += xp;
  // The level bound keeps this threshold inside the authored XP table.
  while (h.level < HERO.xpLevels.length && h.xp >= HERO.xpLevels[h.level]!) {
    h.level++;
    h.maxHp = classOf(h).hp + HERO.hpPerLevel * (h.level - 1);
    h.hp = h.maxHp;
    sim.emit('heroLevel', { hero: h.id, level: h.level });
  }
}

export function damageHero(sim: Sim, h: Hero, amount: number, lethal = false, by: Id = 0): void {
  // Dev mode: heroes have unlimited health.
  if (h.dead || sim.state.dev) return;
  // A lethal blow (the dead on the roads) takes whatever is left, armour and shield wall or not.
  const dmg = lethal ? h.hp : amount * (1 - classOf(h).armor) * (h.wallT > 0 ? 0.4 : 1);
  h.hp -= dmg;
  sim.emit('heroHit', { hero: h.id, amount: dmg, lethal });
  if (h.hp <= 0) {
    h.hp = 0;
    h.dead = true;
    h.respawnT = HERO.respawn;
    h.anim = 'dead';
    h.post = 0;
    h.ride = null;
    releaseBlock(sim, h);
    // Whatever you carried spills where you fall.
    for (const k in h.bag)
      for (let i = 0; i < (h.bag[k as ItemId] ?? 0); i++) sim.spawnDrop(k as ItemId, h.x, h.z);
    for (const g of h.gear) sim.spawnDrop(g.base, h.x, h.z, h.x, h.z, 0, g);
    h.bag = {};
    h.gear = [];
    clearTask(h);
    sim.emit('heroDied', { hero: h.id, by });
  }
}
