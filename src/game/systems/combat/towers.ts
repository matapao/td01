/** Tower target selection, firing and aura updates. */
import { dist } from '../../../core/math.ts';
import { ENEMIES } from '../../content/enemies.ts';
import { ABILITIES } from '../../content/heroes.ts';
import { REPAIR } from '../../content/structures.ts';
import { AURA, DEVICE, DIVE, GEM_LEVELS, TOWER_TOPS } from '../../content/tower-data.ts';
import { gemLevel, topOf } from '../../content/tower-rules.ts';
import type { GemId } from '../../content-types.ts';
import type { Building, Enemy } from '../../entity-types.ts';
import { laneAt } from '../../map.ts';
import type { Sim } from '../../sim.ts';
import { darkness, liveDevice, sightRange } from '../power.ts';
import { crewBoost, crewOf } from './buildings.ts';
import { fireProjectile } from './projectiles.ts';

function laneProgress(sim: Sim, e: Enemy): number {
  return e.lane < 0 ? 0 : e.d / laneAt(sim.world, e.lane).length;
}

function pickTargets(sim: Sim, b: Building, count: number, extra = 0): Enemy[] {
  const st = b.stats!;
  const smart = liveDevice(b, 'targeter');
  const range = sightRange(sim, b) + extra;
  const cands: { e: Enemy; score: number }[] = [];
  for (const e of sim.state.enemies) {
    // World-camp monsters are left to heroes; burrowers can't be seen.
    if (e.spawnT > 0 || e.hp <= 0 || e.camp || e.burrowed) continue;
    if (e.flying ? !st.hitsAir : !st.hitsGround) continue;
    const d = dist(b.x, b.z, e.x, e.z);
    if (d > range + ENEMIES[e.kind].radius) continue;
    let score: number;
    switch (b.mode) {
      case 'first':
        score = laneProgress(sim, e);
        break;
      case 'last':
        score = -laneProgress(sim, e);
        break;
      case 'strong':
        score = e.hp;
        break;
      case 'close':
        score = -d;
        break;
    }
    // A targeting computer finishes the nearly dead first.
    if (smart && e.hp < e.maxHp * DEVICE.targeterLow) score += 1e6;
    cands.push({ e, score });
  }
  cands.sort((a, b2) => b2.score - a.score);
  return cands.slice(0, count).map((c) => c.e);
}

/** Gem auras that reach other towers or the dead: warhearts and rime (sun topaz: power.ts). */
function auraTowers(sim: Sim, gem: GemId): Building[] {
  return sim.state.buildings.filter((b) => b.gems.includes(gem));
}

export function updateTowers(sim: Sim, dt: number): void {
  const drums = auraTowers(sim, 'warheart');
  const relays = sim.state.buildings.filter((b) => liveDevice(b, 'relay'));
  const night = darkness(sim) > 0.3;
  for (const b of sim.state.buildings) {
    const st = b.stats;
    if (!st || st.shooters <= 0) continue;
    b.hasteT = Math.max(0, b.hasteT - dt);
    const hurt = b.hp < b.maxHp * REPAIR.hurt ? REPAIR.hurtRate : 1;
    const up = crewBoost(crewOf(sim, b));
    // The strongest warheart in reach (a brilliant one beats harder).
    let drum = 1;
    for (const d of drums)
      if (dist(d.x, d.z, b.x, b.z) <= AURA.warheart)
        drum = Math.max(drum, 1 + AURA.haste * GEM_LEVELS[gemLevel(d, 'warheart')].k);
    // Linked by relay to another live tower near: they share targets.
    const linked =
      liveDevice(b, 'relay') && relays.some((o) => o !== b && dist(o.x, o.z, b.x, b.z) <= DEVICE.relayReach)
        ? 1 + DEVICE.relayRate
        : 1;
    // Rallied (the Warchief's Rally), a warheart beating near, and crewed by a hero up on top.
    const mul = (b.hasteT > 0 ? 1 + (ABILITIES.rally.haste ?? 0) : 1) * hurt * up.rate * drum * linked;
    const damage = st.damage * up.damage;
    b.cooldown -= dt * mul;
    b.cooldown2 -= dt * mul;
    // A searchlight by night: the dead in its beam (along its aim) are lit up for the next shots.
    if (night && liveDevice(b, 'searchlight')) {
      const aim = Math.atan2(b.aimX - b.x, b.aimZ - b.z);
      const reach = st.range + up.range;
      for (const e of sim.state.enemies) {
        if (e.hp <= 0 || e.camp || dist(e.x, e.z, b.x, b.z) > reach) continue;
        const off = Math.atan2(
          Math.sin(Math.atan2(e.x - b.x, e.z - b.z) - aim),
          Math.cos(Math.atan2(e.x - b.x, e.z - b.z) - aim),
        );
        if (Math.abs(off) <= DEVICE.searchCone) e.spotT = 0.6;
      }
    }
    // Open to the sky: a wraith diving at the top makes the archer duck — no shots while it is near.
    b.harried = !TOWER_TOPS[topOf(b)].covered && !!flyerNear(sim, b.x, b.z, DIVE.reach);
    if (b.harried) {
      b.cooldown = Math.max(b.cooldown, 0.25);
      b.cooldown2 = Math.max(b.cooldown2, 0.25);
      continue;
    }
    // The archer's bolts — an arcane gem makes them arcane bolts (they look and sound it).
    const kind = st.damageType === 'arcane' ? 'arcane' : 'bolt';
    for (let s = 0; s < st.shooters; s++) {
      if ((s === 0 ? b.cooldown : b.cooldown2) > 0) continue;
      const targets = pickTargets(sim, b, Math.ceil(st.shooters), up.range);
      const t = targets[Math.min(s, targets.length - 1)];
      if (!t) continue;
      const crit = sim.rng.chance(st.crit + (liveDevice(b, 'targeter') ? DEVICE.targeterCrit : 0));
      const p = fireProjectile(sim, kind, b.x, b.z, 5.4, t, damage, st.damageType, b.id, {
        crit,
        pierce: st.pierce,
        bonusMagic: st.bonusMagic,
        burnHit: st.burn,
        slow: st.slow,
        chain: st.chain,
        splash: st.splash,
      });
      if (s === 0) b.cooldown = 1 / st.rate;
      // (A twin's second archer: as often as the first once the gem is radiant — see computeTowerStats.)
      else b.cooldown2 = 1 / (st.rate * Math.min(1, st.shooters - 1));
      b.aimX = t.x;
      b.aimZ = t.z;
      b.shots++;
      sim.emit('towerFired', { building: b.id, target: t.id, proj: p.id, kind, shooter: s });
    }
  }
}

/** A flyer (alive, out of its spawn) within `r` m of (x, z), across the ground. */
export function flyerNear(sim: Sim, x: number, z: number, r: number): Enemy | undefined {
  for (const e of sim.state.enemies)
    if (e.flying && e.hp > 0 && !e.camp && dist(e.x, e.z, x, z) <= r) return e;
  return undefined;
}

/** Rime: the dead near a tower with a rime sapphire drag their feet (bosses and colossi half as much). */
export function updateAuras(sim: Sim): void {
  if (sim.state.tick % 5 !== 0) return;
  const charms = auraTowers(sim, 'rime');
  if (!charms.length) return;
  for (const e of sim.state.enemies) {
    if (e.hp <= 0 || e.spawnT > 0 || e.burrowed || e.camp) continue;
    let k = 0;
    for (const c of charms)
      if (dist(c.x, c.z, e.x, e.z) <= AURA.rime + ENEMIES[e.kind].radius)
        k = Math.max(k, GEM_LEVELS[gemLevel(c, 'rime')].k);
    if (!k) continue;
    const def = ENEMIES[e.kind];
    const resist = def.armorClass === 'colossal' || def.boss ? 0.5 : 1;
    e.slowMul = Math.min(e.slowMul, 1 - AURA.slow * k * resist);
    e.slowT = Math.max(e.slowT, 0.4);
  }
}
