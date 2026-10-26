/** Projectile flight, impact and persistent fire. Keep impact order and seeded draws stable. */
import { dist } from '../../../core/math.ts';
import { CHAIN } from '../../content/combat.ts';
import { ENEMIES } from '../../content/enemies.ts';
import type { DamageType } from '../../content-types.ts';
import type { Enemy, Id, Proj, ProjKind } from '../../entity-types.ts';
import { laneAt, lanePos } from '../../map.ts';
import type { Sim } from '../../sim.ts';
import { applyBurn, applyChill, damageEnemy } from './damage.ts';

const SPEED: Record<ProjKind, number> = {
  bolt: 26,
  arcane: 17,
  axe: 20,
  fireball: 15,
  meteor: 6,
  boulder: 0,
  bomblet: 0,
};

export interface ProjOpts {
  pierce?: number;
  bonusMagic?: number;
  /** Burn applied to the struck enemy (enchants). */
  burnHit?: number;
  splash?: number;
  burn?: number;
  chain?: number;
  slow?: number;
  stun?: number;
  cluster?: number;
  crit?: boolean;
}

export function fireProjectile(
  sim: Sim,
  kind: ProjKind,
  sx: number,
  sz: number,
  sy: number,
  target: Enemy,
  damage: number,
  dmgType: DamageType,
  source: Id,
  o: ProjOpts = {},
): Proj {
  const d = dist(sx, sz, target.x, target.z);
  let tx = target.x;
  let tz = target.z;
  let dur: number;
  if (kind === 'boulder') {
    dur = 0.85 + d * 0.055;
    // Lead the target along its road.
    const def = ENEMIES[target.kind];
    if (!target.blocker && target.stunT <= 0 && target.lane >= 0 && !target.camp) {
      const p = lanePos(
        laneAt(sim.world, target.lane),
        target.d + def.speed * target.slowMul * dur,
        target.lat,
      );
      tx = p.x;
      tz = p.z;
    }
  } else if (kind === 'bomblet') dur = 0.45;
  else dur = Math.max(0.12, d / SPEED[kind]);
  const arc =
    kind === 'boulder'
      ? 2 + d * 0.32
      : kind === 'bolt'
        ? 0.5 + d * 0.05
        : kind === 'axe'
          ? 0.8
          : kind === 'bomblet'
            ? 1.4
            : 0.25;
  const p: Proj = {
    id: sim.newId(),
    kind,
    sx,
    sz,
    sy,
    tx,
    tz,
    x: sx,
    z: sz,
    px: sx,
    pz: sz,
    t: 0,
    dur,
    target: target.id,
    damage,
    dmgType,
    splash: o.splash ?? 0,
    burn: o.burn ?? 0,
    chain: o.chain ?? 0,
    slow: o.slow ?? 0,
    stun: o.stun ?? 0,
    cluster: o.cluster ?? 0,
    crit: !!o.crit,
    source,
    arc,
    pierce: o.pierce ?? 0,
    bonusMagic: o.bonusMagic ?? 0,
    burnHit: o.burnHit ?? 0,
  };
  sim.add('proj', p);
  return p;
}

export function updateProjectiles(sim: Sim, dt: number): void {
  for (const p of sim.state.projs) {
    p.px = p.x;
    p.pz = p.z;
    const homing = p.kind === 'bolt' || p.kind === 'arcane' || p.kind === 'axe' || p.kind === 'fireball';
    const tgt = homing ? sim.getAs(p.target, 'enemy') : undefined;
    if (tgt) {
      p.tx = tgt.x;
      p.tz = tgt.z;
    }
    p.t = Math.min(1, p.t + dt / p.dur);
    p.x = p.sx + (p.tx - p.sx) * p.t;
    p.z = p.sz + (p.tz - p.sz) * p.t;
    if (p.t < 1) continue;
    impact(sim, p, tgt);
    sim.remove(p.id);
  }
}

function impact(sim: Sim, p: Proj, tgt: Enemy | undefined): void {
  sim.emit('projHit', { proj: p.id, kind: p.kind, x: p.x, z: p.z, target: p.target });
  if (p.kind === 'boulder' || p.kind === 'bomblet' || p.kind === 'meteor') {
    sim.emit('explosion', {
      x: p.x,
      z: p.z,
      r: p.splash,
      kind: p.burn ? 'fire' : p.kind === 'meteor' ? 'boulder' : p.kind,
    });
    for (const e of [...sim.state.enemies]) {
      if (e.flying || e.spawnT > 0 || e.burrowed) continue;
      const d = dist(e.x, e.z, p.x, p.z);
      if (d > p.splash + ENEMIES[e.kind].radius) continue;
      const falloff = 1 - 0.5 * Math.min(1, d / Math.max(0.1, p.splash));
      damageEnemy(sim, e, p.damage * falloff, p.dmgType, p.source, false, p.pierce);
      if (p.bonusMagic > 0 && e.hp > 0)
        damageEnemy(sim, e, p.bonusMagic * falloff, 'arcane', p.source, false);
      if (p.slow > 0 && e.hp > 0) applyChill(sim, e, p.slow);
    }
    if (p.burn > 0)
      sim.add('fire', { id: sim.newId(), x: p.x, z: p.z, r: p.splash * 0.8, dps: p.burn, t: 3 });
    for (let i = 0; i < p.cluster; i++) {
      const a = (i / p.cluster) * Math.PI * 2 + sim.rng.range(-0.4, 0.4);
      const r = sim.rng.range(1.4, 2.4);
      const fake = { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r } as Enemy;
      const b = fireProjectile(
        sim,
        'bomblet',
        p.x,
        p.z,
        0.4,
        { ...fake, id: 0, kind: 'minion', d: 0, lane: 0, lat: 0, blocker: 1, stunT: 0, slowMul: 1 } as Enemy,
        p.damage * 0.35,
        p.dmgType,
        p.source,
        { splash: 1.3, slow: p.slow },
      );
      b.tx = fake.x;
      b.tz = fake.z;
    }
    return;
  }
  if (!tgt || tgt.hp <= 0) return;
  damageEnemy(sim, tgt, p.damage, p.dmgType, p.source, p.crit, p.pierce);
  if (p.splash > 0) {
    // A blast gem: the bolt bursts on its target and catches whatever stands close.
    sim.emit('explosion', { x: tgt.x, z: tgt.z, r: p.splash, kind: 'bomblet' });
    for (const e of [...sim.state.enemies]) {
      if (e === tgt || e.spawnT > 0 || e.burrowed || e.camp || e.hp <= 0) continue;
      const d = dist(e.x, e.z, tgt.x, tgt.z);
      if (d > p.splash + ENEMIES[e.kind].radius) continue;
      damageEnemy(
        sim,
        e,
        p.damage * (1 - 0.5 * Math.min(1, d / p.splash)),
        p.dmgType,
        p.source,
        false,
        p.pierce,
      );
    }
  }
  if (p.bonusMagic > 0 && tgt.hp > 0) damageEnemy(sim, tgt, p.bonusMagic, 'arcane', p.source, false);
  if (p.burnHit > 0 && tgt.hp > 0) applyBurn(sim, tgt, p.burnHit);
  if (p.slow > 0 && tgt.hp > 0) applyChill(sim, tgt, p.slow);
  if (p.stun > 0 && tgt.hp > 0 && !ENEMIES[tgt.kind].boss) tgt.stunT = Math.max(tgt.stunT, p.stun);
  if (p.chain > 0) {
    const hit = new Set<Id>([tgt.id]);
    let from = tgt;
    let dmg = p.damage;
    for (let i = 0; i < p.chain; i++) {
      let next: Enemy | null = null;
      let bd = CHAIN.reach;
      for (const e of sim.state.enemies) {
        if (hit.has(e.id) || e.spawnT > 0 || e.burrowed || e.hp <= 0 || e.camp) continue;
        const d = dist(e.x, e.z, from.x, from.z);
        if (d < bd) {
          bd = d;
          next = e;
        }
      }
      if (!next) break;
      dmg *= CHAIN.falloff;
      hit.add(next.id);
      sim.emit('chainArc', { from: from.id, to: next.id, fx: from.x, fz: from.z, tx: next.x, tz: next.z });
      damageEnemy(sim, next, dmg, 'lightning', p.source, false);
      from = next;
    }
  }
}

export function updateFires(sim: Sim, dt: number): void {
  for (const f of sim.state.fires) {
    const before = Math.floor(f.t * 2);
    f.t -= dt;
    if (Math.floor(f.t * 2) !== before) {
      for (const e of [...sim.state.enemies]) {
        if (e.flying || e.spawnT > 0) continue;
        if (dist(e.x, e.z, f.x, f.z) <= f.r + ENEMIES[e.kind].radius)
          damageEnemy(sim, e, f.dps * 0.5, 'fire', 0, false);
      }
    }
    if (f.t <= 0) sim.remove(f.id);
  }
}
