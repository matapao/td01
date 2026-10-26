import * as THREE from 'three';
import { PERSON } from '../characters.ts';
import { gh, type ViewCtx } from './context.ts';
import type { EntityEventState } from './event-state.ts';

export function hookCombatEvents(ctx: ViewCtx, state: Pick<EntityEventState, 'buildings' | 'units'>): void {
  const { sim, fx } = ctx;
  const ev = sim.events;
  const at = (x: number, z: number, dy = 0) => new THREE.Vector3(x, gh(ctx, x, z) + dy, z);
  ev.on('towerFired', (e) => {
    const v = state.buildings.get(e.building);
    v?.onFire(e.shooter, e.kind);
    if (v && e.kind === 'arcane') {
      const m = v.muzzle();
      fx.burst(m.x, m.y + 1, m.z, 8, {
        color: '#c18bff',
        speed: 2,
        up: 1,
        size: 0.25,
        gravity: 0,
        tex: 'star',
        life: 0.4,
      });
    }
  });
  ev.on('projHit', (e) => {
    const p = at(e.x, e.z);
    if (e.kind === 'boulder' || e.kind === 'bomblet') return;
    if (e.kind === 'arcane')
      fx.burst(p.x, p.y + 1, p.z, 10, {
        color: '#c18bff',
        speed: 3,
        up: 2,
        size: 0.3,
        gravity: 2,
        tex: 'star',
        life: 0.45,
      });
    if (e.kind === 'axe') {
      fx.burst(p.x, p.y + 1, p.z, 12, {
        color: '#ffffff',
        speed: 4,
        up: 2,
        size: 0.2,
        gravity: 6,
        tex: 'spark',
        stretch: 3,
        life: 0.3,
      });
      ctx.shake(0.2, p.x, p.z);
    }
    if (e.kind === 'fireball') {
      fx.glow({
        x: p.x,
        y: p.y + PERSON * 0.6,
        z: p.z,
        life: 0.25,
        size: 1.6,
        size1: 2.4,
        color: '#ffb347',
        tex: 'dot',
      });
      fx.burst(p.x, p.y + PERSON * 0.6, p.z, 16, {
        color: '#ffd166',
        color1: '#ff3d00',
        speed: 3,
        up: 2.5,
        size: 0.3,
        gravity: -1,
        tex: 'dot',
        life: 0.6,
      });
    }
  });
  ev.on('explosion', (e) => {
    const p = at(e.x, e.z);
    const big = e.kind !== 'bomblet';
    const fire = e.kind === 'fire';
    fx.glow({
      x: p.x,
      y: p.y + 0.6,
      z: p.z,
      life: 0.25,
      size: big ? 4.5 : 2.2,
      size1: big ? 6 : 3,
      color: fire ? '#ffb347' : '#fff1c1',
      tex: 'dot',
    });
    fx.burst(p.x, p.y + 0.3, p.z, big ? 26 : 10, {
      color: fire ? '#ff8a3a' : '#a08a6a',
      speed: big ? 7 : 4,
      up: 5,
      size: 0.3,
      gravity: 14,
      tex: 'chunk',
      additive: false,
      life: 0.9,
    });
    fx.burst(p.x, p.y + 0.4, p.z, big ? 12 : 5, {
      color: '#7a6f62',
      speed: 2,
      up: 1.5,
      size: 1,
      size1: 2.4,
      gravity: -0.4,
      tex: 'smoke',
      additive: false,
      alpha: 0.55,
      life: 1.6,
      drag: 1.5,
    });
    if (fire)
      fx.burst(p.x, p.y + 0.4, p.z, 18, {
        color: '#ffd166',
        color1: '#ff3d00',
        speed: 3,
        up: 4,
        size: 0.5,
        gravity: -2,
        tex: 'dot',
        life: 0.7,
      });
    fx.ring(p.x, p.y, p.z, 0.3, e.r * 1.1, fire ? '#ff8a3a' : '#ffe9c0', 0.45, 0.7);
    fx.scorch(p.x, p.y, p.z, e.r * 0.8);
    ctx.shake(big ? 0.35 : 0.12, p.x, p.z);
  });
  ev.on('chainArc', (e) => {
    const a = at(e.fx, e.fz, 1);
    const b = at(e.tx, e.tz, 1);
    fx.beam(a, b, '#fff27a', 0.22, 0.25);
    fx.burst(b.x, b.y, b.z, 6, {
      color: '#fff6a0',
      speed: 3,
      up: 1,
      size: 0.15,
      gravity: 4,
      tex: 'spark',
      stretch: 3,
      life: 0.25,
    });
  });
  ev.on('unitAttack', (e) => {
    const v = state.units.get(e.id);
    const u = sim.getAs(e.id, 'unit');
    v?.attack(u?.kind === 'captain');
  });
  ev.on('unitHit', (e) => state.units.get(e.id)?.ch.hit('#ff6a5a', 0.7));
}
