import { laneAt } from '../map.ts';
import { baseEnemy } from './enemy-factory.ts';
import { earth } from '../excavation.ts';
import { groundHeight } from '../map.ts';
import type { Sim } from '../sim.ts';
import { OVER_WALL, sizeOf, ENEMIES, SIGIL, THREAT, isTower, type EnemyKind } from '../content.ts';
import { lanePos, laneProject, MAP, onWall, type Lane } from '../map.ts';
import { GATE_STOP, batterGate, gateShut } from './wall.ts';
import type { Building, Enemy, Hero, Id } from '../types.ts';
import { WAVES } from '../waves.ts';
import { dist } from '../../core/math.ts';
import { damageBuilding, damageEnemy, damageUnit, releaseBlocker } from './combat.ts';
import { bodyFree, damageHero } from './heroes.ts';
import { mineWalkable, underground } from './mining.ts';

// ---- Routes --------------------------------------------------------------------------------------

/** How dangerous a route is: tower damage weighted by how much of the route each tower covers. */
export function routeThreat(sim: Sim, lane: number): number {
  const l = laneAt(sim.world, lane);
  let threat = 0;
  for (const b of sim.state.buildings) {
    const st = b.stats;
    if (!st) continue;
    let cov = 0;
    let n = 0;
    for (let i = 0; i < l.xs.length; i += 4) {
      n++;
      if (dist(b.x, b.z, l.xs[i]!, l.zs[i]!) <= Math.max(st.range, st.rally) + 1) cov++;
    }
    if (!cov) continue;
    const dps =
      st.soldiers * st.soldierDamage * st.soldierRate * 2 +
      (st.range > 0 ? st.damage * st.rate * Math.max(1, st.shooters) * (1 + st.splash * 0.4) : 0);
    threat += dps * (cov / n) * (l.length / 25);
  }
  return threat;
}

// Candidate indices come from lanes.map; threats and weights map that same dense list.
export function chooseLane(sim: Sim, crypt: number, kind: EnemyKind): number {
  const s = sim.state;
  const lanes = sim.world.lanes;
  const cands = lanes.map((_, i) => i).filter((i) => s.lanesOpen[i] && lanes[i]!.def.crypt === crypt);
  if (cands.length <= 1)
    return (
      cands[0] ??
      Math.max(
        0,
        lanes.findIndex((l) => l.def.crypt === crypt),
      )
    );
  const threats = cands.map((i) => routeThreat(sim, i));
  if (ENEMIES[kind].smart) {
    let best = 0;
    for (let k = 1; k < cands.length; k++) if (threats[k]! < threats[best]! - 1) best = k;
    return cands[best]!;
  }
  // The rest mostly keep to the road, but drift to the trail when the road bristles with towers.
  const w = cands.map((i, k) => (lanes[i]!.def.trail ? 0.55 : 1.45) / (1 + threats[k]! / 80));
  let r = sim.rng.next() * w.reduce((a, b) => a + b, 0);
  for (let k = 0; k < cands.length; k++) {
    r -= w[k]!;
    if (r <= 0) return cands[k]!;
  }
  return cands[0]!;
}

// ---- Spawning ------------------------------------------------------------------------------------

export function spawnEnemy(
  sim: Sim,
  kind: EnemyKind,
  lane: number,
  wave: number,
  at?: { d: number; lat: number },
  hpFrac = 1,
): Enemy {
  const e = baseEnemy(sim, kind, (WAVES[wave]?.hp ?? 1) * hpFrac);
  const def = ENEMIES[kind];
  e.wave = wave;
  e.lane = lane;
  e.d = at ? at.d : sim.rng.range(0, 1.5);
  e.lat = at ? at.lat : sim.rng.range(-1, 1) * (e.flying ? 1.6 : laneAt(sim.world, lane).def.half * 0.5);
  e.latTarget = e.lat;
  e.affixes = WAVES[wave]?.affixes ?? [];
  if (e.affixes.includes('swift')) e.speedMul = 1.2;
  if (e.affixes.includes('shielded')) e.shield = e.maxShield = e.maxHp * 0.25;
  if (def.burrow && !at) {
    e.burrowed = true;
    e.spawnT = 0.5;
  }
  const p = lanePos(laneAt(sim.world, lane), e.d, e.lat);
  e.x = e.px = p.x;
  e.z = e.pz = p.z;
  e.facing = Math.atan2(p.tx, p.tz);
  sim.add('enemy', e);
  sim.emit('enemySpawned', { id: e.id, kind, lane });
  if (e.burrowed) sim.emit('burrowed', { id: e.id });
  return e;
}

export function spawnFromCrypt(sim: Sim, kind: EnemyKind, crypt: number, wave: number): Enemy {
  const lane = chooseLane(sim, crypt, kind);
  const e = spawnEnemy(sim, kind, lane, wave);
  if (laneAt(sim.world, lane).def.trail)
    sim.emit('routeChosen', { id: e.id, lane, smart: !!ENEMIES[kind].smart });
  return e;
}

export function surface(sim: Sim, e: Enemy, detected: boolean): void {
  if (!e.burrowed) return;
  e.burrowed = false;
  e.stunT = detected ? 1.4 : 0.6;
  sim.emit('surfaced', { id: e.id, x: e.x, z: e.z, detected });
}

export function spawnCampEnemy(sim: Sim, kind: EnemyKind, camp: Id, x: number, z: number): Enemy {
  const e = baseEnemy(sim, kind, 1 + 0.08 * sim.state.wave);
  e.camp = camp;
  e.homeX = x;
  e.homeZ = z;
  e.x = e.px = x;
  e.z = e.pz = z;
  e.facing = sim.rng.range(0, Math.PI * 2);
  sim.add('enemy', e);
  sim.emit('enemySpawned', { id: e.id, kind, lane: -1 });
  return e;
}

/** Spawns (or respawns) every member of a camp around its centre. */
/**
 * Clear of props as they look, not only as they block: a scrap heap or a ruin is much bigger than
 * its footprint, and anything standing in it can't be seen.
 */
function clearOfProps(sim: Sim, x: number, z: number): boolean {
  for (const p of sim.props) {
    if (p.block <= 0.5 || Math.abs(p.x - x) > 8 || Math.abs(p.z - z) > 8) continue;
    if (Math.hypot(p.x - x, p.z - z) < p.block * 2.2 + 0.3) return false;
  }
  return true;
}

/** The nearest open spot a body can stand on (and be seen), searching outward from (x, z). */
function openSpotNear(sim: Sim, x: number, z: number): { x: number; z: number } {
  const ok = (px: number, pz: number) => bodyFree(sim, px, pz) && clearOfProps(sim, px, pz);
  if (ok(x, z)) return { x, z };
  for (let r = 0.5; r <= 7; r += 0.5) {
    const n = Math.max(8, Math.round(r * 6));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (ok(px, pz)) return { x: px, z: pz };
    }
  }
  return { x, z };
}

export function populateCamp(sim: Sim, campId: Id): void {
  const camp = sim.getAs(campId, 'camp');
  if (!camp) return;
  const def = sim.campDef(camp);
  let i = 0;
  const total = def.members.reduce((n, m) => n + m.count, 0);
  for (const m of def.members) {
    for (let k = 0; k < m.count; k++, i++) {
      const a = (i / total) * Math.PI * 2;
      // Out in the open, never inside a scrap heap, a tent or a rock (so you always see them).
      const p = openSpotNear(sim, camp.x + Math.cos(a) * 1.6, camp.z + Math.sin(a) * 1.6);
      spawnCampEnemy(sim, m.kind, camp.id, p.x, p.z);
    }
  }
  camp.alive = total;
}

// ---- Fighting -------------------------------------------------------------------------------------

function attackTarget(sim: Sim, e: Enemy, id: Id): boolean {
  const ent = sim.get(id);
  if (!ent) return false;
  const def = ENEMIES[e.kind];
  const dmg = def.damage * e.dmgMul * Math.pow(SIGIL.damagePerLevel, sim.state.sigil) * (e.enraged ? 1.5 : 1);
  if (ent.type === 'unit' && !ent.e.dead) {
    damageUnit(sim, ent.e, dmg);
    e.facing = Math.atan2(ent.e.x - e.x, ent.e.z - e.z);
    return true;
  }
  if (ent.type === 'hero' && !ent.e.dead && !onWall(ent.e.x, ent.e.z)) {
    // One blow from the dead on the roads kills a hero (camp and lair creatures hit at a hero's measure).
    damageHero(sim, ent.e, dmg, !e.camp, e.id);
    e.facing = Math.atan2(ent.e.x - e.x, ent.e.z - e.z);
    return true;
  }
  if (ent.type === 'building') {
    damageBuilding(sim, ent.e, dmg, e.id);
    e.facing = Math.atan2(ent.e.x - e.x, ent.e.z - e.z);
    return true;
  }
  return false;
}

function blockerValid(sim: Sim, e: Enemy): boolean {
  const ent = sim.get(e.blocker);
  if (!ent) return false;
  if (ent.type === 'unit')
    return !ent.e.dead && ent.e.target === e.id && dist(ent.e.x, ent.e.z, e.x, e.z) < 2.6;
  if (ent.type === 'hero')
    return !ent.e.dead && ent.e.blocking === e.id && dist(ent.e.x, ent.e.z, e.x, e.z) < 2.8;
  return false;
}

/** Siege mobs pick a building beside their route (towers first). */
function siegeTarget(sim: Sim, e: Enemy): Building | null {
  let best: Building | null = null;
  let bd = 4.4;
  for (const b of sim.state.buildings) {
    const d = dist(b.x, b.z, e.x, e.z) - (isTower(b.kind) ? 0.8 : 0);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

function abilities(sim: Sim, e: Enemy, dt: number): void {
  const s = sim.state;
  e.abilityCd -= dt;
  if (e.abilityCd > 0) return;
  if (e.kind === 'necromancer') {
    const corpse = s.corpses.find((c) => dist(c.x, c.z, e.x, e.z) < 5.5 && sim.alive(c.id));
    if (corpse && e.lane >= 0 && corpse.lane >= 0) {
      sim.remove(corpse.id);
      const raised = spawnEnemy(
        sim,
        corpse.kind,
        corpse.lane,
        corpse.wave >= 0 ? corpse.wave : e.wave,
        { d: corpse.d, lat: corpse.lat },
        0.5,
      );
      raised.spawnT = 1.2;
      sim.emit('corpseRaised', { corpse: corpse.id, enemy: raised.id });
      sim.emit('enemyAbility', {
        id: e.id,
        ability: 'raise',
        x: corpse.x,
        z: corpse.z,
        targets: [raised.id],
      });
    } else {
      const targets: Id[] = [];
      for (const o of s.enemies) {
        if (targets.length >= 3 || o.id === e.id || o.spawnT > 0 || o.shield > 0 || o.burrowed) continue;
        if (dist(o.x, o.z, e.x, e.z) < 4.5) {
          o.shield = o.maxShield = 50 + 12 * s.wave;
          targets.push(o.id);
        }
      }
      if (targets.length) sim.emit('enemyAbility', { id: e.id, ability: 'shield', x: e.x, z: e.z, targets });
    }
    e.abilityCd = 6;
    e.anim = 'cast';
    e.animT = 0;
  } else if (e.kind === 'lich' && e.lane >= 0) {
    const raised: Id[] = [];
    for (let i = 0; i < 3; i++) {
      const m = spawnEnemy(
        sim,
        'minion',
        e.lane,
        e.wave,
        { d: Math.max(0, e.d + sim.rng.range(-2.5, 1)), lat: sim.rng.range(-1.6, 1.6) },
        0.8,
      );
      raised.push(m.id);
    }
    sim.emit('enemyAbility', { id: e.id, ability: 'summon', x: e.x, z: e.z, targets: raised });
    e.abilityCd = 9;
    e.anim = 'cast';
    e.animT = 0;
  } else if (e.kind === 'colossus') {
    const near = !!e.blocker || s.buildings.some((b) => dist(b.x, b.z, e.x, e.z) < 4.4);
    if (!near) {
      e.abilityCd = 0.5;
      return;
    }
    const hit: Id[] = [];
    for (const u of s.units) {
      if (u.dead || dist(u.x, u.z, e.x, e.z) > 3.6) continue;
      damageUnit(sim, u, 40);
      u.attackCd += 1.5;
      hit.push(u.id);
    }
    for (const h of s.heroes) {
      if (h.dead || onWall(h.x, h.z) || dist(h.x, h.z, e.x, e.z) > 3.6) continue;
      damageHero(sim, h, 40, !e.camp, e.id);
      h.attackCd += 1.5;
      hit.push(h.id);
    }
    for (const b of [...s.buildings]) {
      if (dist(b.x, b.z, e.x, e.z) > 4.6) continue;
      damageBuilding(sim, b, 140, e.id);
      hit.push(b.id);
    }
    sim.emit('enemyAbility', { id: e.id, ability: 'stomp', x: e.x, z: e.z, targets: hit });
    e.abilityCd = 7;
    e.anim = 'attack';
    e.animT = 0;
  } else e.abilityCd = 99;
}

export function updateEnemies(sim: Sim, dt: number): void {
  const s = sim.state;
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    e.px = e.x;
    e.pz = e.z;
    e.animT += dt;
    if (e.spawnT > 0) {
      e.spawnT -= dt;
      e.anim = 'spawn';
      continue;
    }
    if ((e.spotT ?? 0) > 0) e.spotT = (e.spotT ?? 0) - dt;
    if (e.slowT > 0) {
      e.slowT -= dt;
      if (e.slowT <= 0) e.slowMul = 1;
    }
    if (e.dashT > 0) e.dashT -= dt;
    if (e.burnT > 0) {
      const before = Math.floor(e.burnT * 2);
      e.burnT -= dt;
      if (Math.floor(e.burnT * 2) !== before) damageEnemy(sim, e, e.burnDps * 0.5, 'fire', 0, false);
      if (e.hp <= 0) continue;
    }
    if (e.chillT > 0) {
      e.chillT -= dt;
      if (e.chillT <= 0) e.chill = 0;
    }
    if (e.brittleT > 0) e.brittleT -= dt;
    // Wave affixes.
    e.hurtT += dt;
    if (e.affixes.includes('regenerating') && e.hurtT > 3)
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.025 * dt);
    if (e.frozenT > 0) {
      e.frozenT -= dt;
      continue;
    }
    if (e.stunT > 0) {
      e.stunT -= dt;
      e.anim = 'hit';
      continue;
    }
    if (!e.burrowed) abilities(sim, e, dt);
    e.attackCd = Math.max(0, e.attackCd - dt);
    if (e.camp) updateCampEnemy(sim, e, dt);
    else updateLaneEnemy(sim, e, dt);
  }
  // Camps: respawn once wiped out.
  for (const c of s.camps) {
    if (c.alive > 0 || c.tunnel !== undefined) continue;
    c.respawnT -= dt;
    if (c.respawnT <= 0) {
      populateCamp(sim, c.id);
      sim.emit('campRespawned', { camp: c.id });
    }
  }
}

/** The nearest living hero within r on the ground (or, with `up`, up on the wall-walk out of reach), if any. */
function heroNear(sim: Sim, x: number, z: number, r: number, up = false): Hero | null {
  let best: Hero | null = null;
  let bd = r;
  for (const h of sim.state.heroes) {
    if (h.dead || onWall(h.x, h.z) !== up) continue;
    const d = dist(h.x, h.z, x, z);
    if (d < bd) {
      bd = d;
      best = h;
    }
  }
  return best;
}

/**
 * An angry (or taunted) walker comes off the road for the hero who hurt it, fights them in reach,
 * and goes back to its route when they get away. Stays within a few metres of the road.
 */
function chaseHero(sim: Sim, e: Enemy, h: Hero, lane: Lane, dt: number): void {
  const def = ENEMIES[e.kind];
  const d = dist(e.x, e.z, h.x, h.z);
  e.facing = Math.atan2(h.x - e.x, h.z - e.z);
  if (d <= def.radius + 0.5) {
    if (e.attackCd <= 0) {
      attackTarget(sim, e, h.id);
      e.attackCd = 1 / def.attackRate;
      e.anim = 'attack';
      e.animT = 0;
    } else if (e.anim === 'attack' && e.animT > 0.6) e.anim = 'idle';
    else if (e.anim !== 'attack') e.anim = 'idle';
    return;
  }
  const p = laneProject(lane, h.x, h.z);
  const maxLat = lane.def.half + 3;
  const td = p.d - e.d;
  const tl = Math.max(-maxLat, Math.min(maxLat, p.lat)) - e.lat;
  const len = Math.hypot(td, tl) || 1;
  const step = Math.min(len, def.speed * e.slowMul * e.speedMul * 1.2 * dt);
  e.d = Math.max(0, e.d + (td / len) * step);
  e.lat += (tl / len) * step;
  const q = lanePos(lane, e.d, e.lat);
  e.x = q.x;
  e.z = q.z;
  e.anim = 'walk';
}

function updateLaneEnemy(sim: Sim, e: Enemy, dt: number): void {
  const def = ENEMIES[e.kind];
  const lane = laneAt(sim.world, e.lane);
  // (A burrower doesn't come up by itself: unless a watch tower forces it up, it tunnels on under the
  // wall and comes up past it — through, like any of the dead that get by: see the end of this.)
  // Threat: the dead walk past heroes and towers alike — unless a hero hurts them enough or taunts.
  e.threat = Math.max(0, e.threat - THREAT.decay * dt);
  e.tauntT = Math.max(0, e.tauntT - dt);
  if (
    !e.flying &&
    !e.burrowed &&
    e.knockT <= 0 &&
    e.stunT <= 0 &&
    (e.tauntT > 0 || e.threat >= THREAT.aggro)
  ) {
    const h = heroNear(sim, e.x, e.z, THREAT.leash);
    if (h) {
      chaseHero(sim, e, h, lane, dt);
      return;
    }
    // Taunted from the wall-walk: it can't get up there, so it stands below, looking up, until the taunt wears off.
    const up = e.tauntT > 0 ? heroNear(sim, e.x, e.z, THREAT.leash + OVER_WALL.skillReach, true) : null;
    if (up) {
      e.facing = Math.atan2(up.x - e.x, up.z - e.z);
      if (e.anim !== 'cast') e.anim = 'idle';
      return;
    }
  }
  let stopped = false;
  if (e.knockT > 0) {
    e.knockT -= dt;
    e.d = Math.max(0, e.d - e.knockV * dt);
  } else if (e.blocker && !e.flying && !e.burrowed) {
    if (!blockerValid(sim, e)) e.blocker = 0;
    else {
      stopped = true;
      if (e.attackCd <= 0 && (e.anim !== 'cast' || e.animT > 0.8)) {
        if (attackTarget(sim, e, e.blocker)) {
          e.attackCd = 1 / def.attackRate;
          e.anim = 'attack';
          e.animT = 0;
        }
      } else if (e.anim === 'attack' && e.animT > 0.6) e.anim = 'idle';
      else if (e.anim !== 'attack' && e.anim !== 'cast') e.anim = 'idle';
    }
  }
  // Siege: stop to smash a building beside the route.
  if (!stopped && def.siege && !e.burrowed && e.knockT <= 0) {
    const tgt = e.siege ? sim.getAs(e.siege, 'building') : siegeTarget(sim, e);
    if (tgt && dist(tgt.x, tgt.z, e.x, e.z) < 4.6) {
      e.siege = tgt.id;
      stopped = true;
      e.facing = Math.atan2(tgt.x - e.x, tgt.z - e.z);
      if (dist(tgt.x, tgt.z, e.x, e.z) > sizeOf(tgt.kind) / 2 + 0.9) {
        const p = laneProject(lane, tgt.x, tgt.z),
          dd = p.d - e.d,
          dl = p.lat - e.lat,
          len = Math.hypot(dd, dl) || 1;
        const step = Math.min(len, def.speed * e.slowMul * e.speedMul * dt);
        e.d = Math.max(0, e.d + (dd / len) * step);
        e.lat += (dl / len) * step;
        e.anim = 'walk';
      } else if (e.attackCd <= 0) {
        attackTarget(sim, e, tgt.id);
        e.attackCd = 1 / def.attackRate;
        e.anim = 'attack';
        e.animT = 0;
      } else if (e.animT > 0.7) e.anim = 'idle';
    } else e.siege = 0;
  }
  // At the gate: shut, it holds the walkers at its doors — they batter it until it breaks (fliers go
  // over the wall, diggers under it).
  if (!stopped && !e.flying && !e.burrowed && gateShut(sim.state) && e.d >= lane.length - GATE_STOP - 0.05) {
    stopped = true;
    e.d = Math.min(e.d, lane.length - GATE_STOP);
    if (e.attackCd <= 0) {
      batterGate(
        sim,
        e,
        def.damage * e.dmgMul * Math.pow(SIGIL.damagePerLevel, sim.state.sigil) * (e.enraged ? 1.5 : 1),
      );
      e.attackCd = 1 / def.attackRate;
      e.anim = 'attack';
      e.animT = 0;
    } else if (e.anim === 'attack' && e.animT > 0.6) e.anim = 'idle';
  }
  if (!stopped && e.knockT <= 0) {
    const frenzy = e.affixes.includes('frenzied') && e.hp < e.maxHp * 0.3 ? 1.6 : 1;
    const speed =
      def.speed *
      e.slowMul *
      e.speedMul *
      frenzy *
      (e.dashT > 0 ? 1.8 : 1) *
      (e.enraged ? 1.6 : 1) *
      (e.burrowed ? 1.35 : 1);
    e.d += speed * dt;
    if (e.anim !== 'cast' || e.animT > 1) e.anim = 'walk';
    if (sim.rng.chance(0.01)) e.latTarget = sim.rng.range(-1, 1) * (e.flying ? 1.9 : lane.def.half * 0.55);
    e.lat += (e.latTarget - e.lat) * Math.min(1, dt * 1.2);
  }
  const p = lanePos(lane, e.d, e.lat);
  e.x = p.x;
  e.z = p.z;
  if (!stopped) e.facing = Math.atan2(p.tx, p.tz);
  if (e.d >= lane.length - 0.4) {
    // Through the gate: it breaks in.
    releaseBlocker(sim, e);
    sim.state.stats.leaks++;
    if (e.wave >= 0) {
      const leaks = (sim.state.waveLeaks ??= []);
      leaks[e.wave] = (leaks[e.wave] ?? 0) + def.leak;
    }
    sim.emit('enemyLeaked', { id: e.id, kind: e.kind, damage: def.leak });
    sim.remove(e.id);
    sim.loseLives(def.leak);
  }
}

/** Free movement for camp creatures; underground they slide along the rock instead of through it. */
function stepTo(sim: Sim, e: Enemy, x: number, z: number): void {
  if (underground(x)) {
    if (mineWalkable(sim, x, z)) [e.x, e.z] = [x, z];
    else if (mineWalkable(sim, x, e.z)) e.x = x;
    else if (mineWalkable(sim, e.x, z)) e.z = z;
    return;
  }
  e.x = x;
  e.z = z;
}

function updateCampEnemy(sim: Sim, e: Enemy, dt: number): void {
  const def = ENEMIES[e.kind];
  e.tauntT = Math.max(0, e.tauntT - dt);
  const home = sim.getAs(e.camp, 'camp');
  const camp = home ? sim.campDef(home) : MAP.camps[0];
  if (!camp) throw new Error(`Enemy ${e.id} references missing camp ${e.camp}`);
  if (!e.aggro || !sim.alive(e.aggro)) {
    e.aggro = 0;
    for (const h of sim.state.heroes) {
      // (A hero rolling past in a mine wagon is gone before it can turn.)
      if (!h.dead && !h.ride && !onWall(h.x, h.z) && dist(h.x, h.z, e.x, e.z) < 6) {
        if (underground(e.x)) {
          const y = groundHeight(sim.world, e.x, e.z) + 0.4,
            dy = groundHeight(sim.world, h.x, h.z) + 0.4 - y,
            dx = h.x - e.x,
            dz = h.z - e.z,
            d = Math.hypot(dx, dy, dz);
          if (d > 0.4 && earth(sim).ray({ x: e.x, y, z: e.z }, { x: dx / d, y: dy / d, z: dz / d }, d - 0.4))
            continue;
        }
        e.aggro = h.id;
        break;
      }
    }
  }
  const tgt = e.aggro ? sim.get(e.aggro) : undefined;
  const tpos =
    tgt &&
    (tgt.type === 'hero' || tgt.type === 'unit') &&
    !tgt.e.dead &&
    !(tgt.type === 'hero' && (tgt.e.ride || onWall(tgt.e.x, tgt.e.z)))
      ? tgt.e
      : null;
  if (tpos && dist(tpos.x, tpos.z, e.homeX, e.homeZ) < camp.leash + 2) {
    const reach = def.radius + (tgt!.type === 'hero' ? 1.2 : 0.9);
    const d = dist(e.x, e.z, tpos.x, tpos.z);
    e.facing = Math.atan2(tpos.x - e.x, tpos.z - e.z);
    if (d > reach) {
      const step = Math.min(d - reach * 0.9, def.speed * 1.2 * e.slowMul * dt);
      stepTo(sim, e, e.x + ((tpos.x - e.x) / d) * step, e.z + ((tpos.z - e.z) / d) * step);
      e.anim = 'walk';
    } else if (e.attackCd <= 0) {
      attackTarget(sim, e, e.aggro);
      e.attackCd = 1 / def.attackRate;
      e.anim = 'attack';
      e.animT = 0;
    } else if (e.animT > 0.6) e.anim = 'idle';
    return;
  }
  e.aggro = 0;
  releaseBlocker(sim, e);
  const d = dist(e.x, e.z, e.homeX, e.homeZ);
  if (d > 0.3) {
    const step = Math.min(d, def.speed * 1.4 * dt);
    e.facing = Math.atan2(e.homeX - e.x, e.homeZ - e.z);
    stepTo(sim, e, e.x + ((e.homeX - e.x) / d) * step, e.z + ((e.homeZ - e.z) / d) * step);
    e.anim = 'walk';
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.25 * dt);
  } else {
    e.anim = 'idle';
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.1 * dt);
  }
}
