/** Enemy damage, status effects and death rewards. This is the authoritative mutation path. */
import { dist } from '../../../core/math.ts';
import { DAMAGE_VS_ARMOR, PHYSICAL, STATUS } from '../../content/combat.ts';
import { BOLSTER, ENEMIES, LANE_DEAD } from '../../content/enemies.ts';
import { DEVICE } from '../../content/tower-data.ts';
import { SIGIL } from '../../content/world-rules.ts';
import type { DamageType } from '../../content-types.ts';
import type { Enemy, Id } from '../../entity-types.ts';
import { DROP_CHANCE } from '../../loot.ts';
import type { Sim } from '../../sim.ts';
import { grantXp } from '../hero/lifecycle.ts';
import { lairLooted } from '../mining-rewards.ts';

export function damageEnemy(
  sim: Sim,
  e: Enemy,
  amount: number,
  type: DamageType,
  source: Id,
  crit: boolean,
  pierce = 0,
): void {
  if (e.hp <= 0 || e.burrowed) return;
  e.hurtT = 0;
  const def = ENEMIES[e.kind];
  const mult = DAMAGE_VS_ARMOR[type][def.armorClass];
  let dmg = amount * (crit ? 2 : 1) * mult;
  if (PHYSICAL.has(type)) dmg *= 1 - def.armor * (1 - pierce);
  // Caught in a searchlight's beam.
  if ((e.spotT ?? 0) > 0) dmg *= 1 + DEVICE.searchBonus;
  // Frozen foes shatter under impact.
  let shatter = false;
  if (type === 'impact' && e.brittleT > 0) {
    dmg *= STATUS.shatterBonus;
    e.brittleT = 0;
    e.frozenT = 0;
    shatter = true;
    sim.emit('status', { id: e.id, kind: 'shatter', x: e.x, z: e.z });
  }
  // The dead on the roads are beyond any hero: the blow is felt (it angers them) but barely scratches.
  const byHero = sim.get(source)?.type === 'hero';
  const felt = dmg;
  if (byHero && !e.camp) dmg *= LANE_DEAD.heroDamage;
  let shielded = false;
  if (e.shield > 0) {
    const absorbed = Math.min(e.shield, dmg);
    e.shield -= absorbed;
    dmg -= absorbed;
    shielded = absorbed > 0;
  }
  e.hp -= dmg;
  e.lastHitBy = source;
  if (byHero) e.threat += (felt / e.maxHp) * 100;
  sim.emit('enemyHit', { id: e.id, amount: dmg, type, crit, x: e.x, z: e.z, shielded, shatter, mult });
  if (e.kind === 'runner' && !e.dashed) {
    e.dashed = true;
    e.dashT = 1.3;
    sim.emit('enemyAbility', { id: e.id, ability: 'dash', x: e.x, z: e.z, targets: [] });
  }
  if (e.kind === 'colossus' && !e.enraged && e.hp < e.maxHp * 0.3) {
    e.enraged = true;
    sim.emit('enemyAbility', { id: e.id, ability: 'enrage', x: e.x, z: e.z, targets: [] });
  }
  if (e.hp <= 0) killEnemy(sim, e, source);
}

/** Frost: slows and stacks; three chills freeze (stun) and leave the target brittle. */
export function applyChill(sim: Sim, e: Enemy, slow: number): void {
  if (e.hp <= 0) return;
  const def = ENEMIES[e.kind];
  const resist = def.armorClass === 'colossal' ? 0.5 : 1;
  e.slowMul = Math.min(e.slowMul, 1 - slow * resist);
  e.slowT = Math.max(e.slowT, 2);
  if (def.boss) return;
  e.chill++;
  e.chillT = STATUS.chillTime;
  if (e.chill >= STATUS.chillToFreeze) {
    e.chill = 0;
    // A finer frost holds them longer (the freeze grows with the chill: STATUS.freezeTime at a polished frost sapphire's).
    const hold = STATUS.freezeTime * Math.max(0.5, Math.min(1.6, slow / STATUS.freezeChill));
    e.frozenT = hold;
    e.brittleT = hold + STATUS.brittleTime;
    sim.emit('status', { id: e.id, kind: 'freeze', x: e.x, z: e.z });
  } else sim.emit('status', { id: e.id, kind: 'chill', x: e.x, z: e.z });
}

export function applyBurn(sim: Sim, e: Enemy, dps: number): void {
  if (e.hp <= 0) return;
  if (e.burnT <= 0) sim.emit('status', { id: e.id, kind: 'burn', x: e.x, z: e.z });
  e.burnDps = Math.max(e.burnDps, dps);
  e.burnT = STATUS.burnTime;
}

export function releaseBlocker(sim: Sim, e: Enemy): void {
  if (!e.blocker) return;
  const b = sim.get(e.blocker);
  if (b?.type === 'unit' && b.e.target === e.id) b.e.target = 0;
  if (b?.type === 'hero' && b.e.blocking === e.id) b.e.blocking = 0;
  e.blocker = 0;
}

export function killEnemy(sim: Sim, e: Enemy, source: Id): void {
  const def = ENEMIES[e.kind];
  const s = sim.state;
  e.hp = 0;
  releaseBlocker(sim, e);
  s.stats.kills++;
  const tower = sim.getAs(source, 'building');
  const goldMul =
    (tower?.stats?.goldMul ?? 1) * Math.pow(SIGIL.goldPerLevel, s.sigil) * (1 + 0.04 * Math.max(0, e.wave));
  sim.spawnGold(def.gold * goldMul, e.x, e.z);
  const lootChance =
    DROP_CHANCE[e.kind] * (tower?.stats?.lootMul ?? 1) * (e.camp ? 2.2 : 1) * (1 + s.sigil * 0.05);
  if (sim.rng.chance(lootChance))
    sim.dropGear(e.x, e.z, e.kind === 'colossus' ? 3 : e.kind === 'lich' ? 2 : undefined);
  let corpse = 0;
  if (!def.flying && !def.boss && !e.camp) {
    corpse = sim.newId();
    sim.add('corpse', {
      id: corpse,
      kind: e.kind,
      lane: e.lane,
      d: e.d,
      lat: e.lat,
      x: e.x,
      z: e.z,
      t: 6,
      wave: e.wave,
    });
  }
  for (const h of s.heroes) {
    if (h.dead) continue;
    if (h.id === source || dist(h.x, h.z, e.x, e.z) < 12) grantXp(sim, h, Math.max(4, def.gold * 2));
  }
  if (e.affixes.includes('bolstering') && !e.camp) {
    const targets: Id[] = [];
    // (Its blows count the stacks: bolstering is all that hardens them.)
    const full = Math.pow(1 + BOLSTER.gain, BOLSTER.max) - 1e-6;
    for (const o of s.enemies) {
      if (
        o.id === e.id ||
        o.hp <= 0 ||
        o.camp ||
        o.dmgMul >= full ||
        dist(o.x, o.z, e.x, e.z) > BOLSTER.radius
      )
        continue;
      o.maxHp *= 1 + BOLSTER.gain;
      o.hp = Math.min(o.maxHp, o.hp + o.maxHp * BOLSTER.gain);
      o.dmgMul *= 1 + BOLSTER.gain;
      targets.push(o.id);
    }
    if (targets.length) sim.emit('bolstered', { id: e.id, x: e.x, z: e.z, targets });
  }
  if (e.camp) {
    const camp = sim.getAs(e.camp, 'camp');
    if (camp) {
      camp.alive--;
      if (camp.alive <= 0) {
        const def = sim.campDef(camp);
        camp.respawnT = def.respawn;
        sim.emit('campCleared', { camp: camp.id, name: def.name });
        // A lair down the mine: what its creatures sat on spills out.
        if (camp.lair) lairLooted(sim, camp, source);
      }
    }
  }
  sim.emit('enemyDied', {
    id: e.id,
    kind: e.kind,
    x: e.x,
    z: e.z,
    gold: Math.round(def.gold * goldMul),
    by: source,
    corpse,
  });
  sim.remove(e.id);
}
