import * as THREE from 'three';
import { ITEMS } from '../../game/content.ts';
import { MINERALS, type MineralId } from '../../game/mines.ts';
import type { Id } from '../../game/types.ts';
import { PERSON } from '../characters.ts';
import { gh, type ViewCtx } from './context.ts';
import type { EntityEventState } from './event-state.ts';

export function hookMiningEvents(ctx: ViewCtx, state: Pick<EntityEventState, 'heroes'>): void {
  const { sim, fx } = ctx;
  const ev = sim.events;
  const at = (x: number, z: number, dy = 0) => new THREE.Vector3(x, gh(ctx, x, z) + dy, z);
  const chipAt = (e: { hero: Id; x: number; z: number }) => {
    // On the face, between the piece's middle and whoever's hacking at it, at the pickaxe's height.
    const h = ctx.sim.getAs(e.hero, 'hero');
    const d = h ? Math.hypot(h.x - e.x, h.z - e.z) || 1 : 1;
    const k = Math.min(0.32, d * 0.4);
    return new THREE.Vector3(
      h ? e.x + ((h.x - e.x) / d) * k : e.x,
      PERSON * 0.75,
      h ? e.z + ((h.z - e.z) / d) * k : e.z,
    );
  };

  ev.on('digHit', (e) => {
    const k = (state.heroes.get(e.hero)?.strike(false) ?? true) ? 1 : 0.35;
    const p = chipAt(e);
    const m = MINERALS[e.mineral as MineralId] ?? MINERALS[0];
    fx.burst(p.x, p.y, p.z, Math.round(8 * k), {
      color: m.stain,
      speed: 1.6,
      up: 1.4,
      size: 0.06,
      gravity: 9,
      tex: 'chunk',
      additive: false,
      life: 0.5,
    });
    if (e.mineral)
      fx.burst(p.x, p.y, p.z, Math.round(4 * k), {
        color: m.ore,
        speed: 1.4,
        up: 1.2,
        size: 0.05,
        gravity: 8,
        tex: 'chunk',
        additive: false,
        life: 0.5,
      });
    fx.burst(p.x, p.y, p.z, Math.round(4 * k), {
      color: '#ffe9a8',
      speed: 1.8,
      up: 1,
      size: 0.05,
      gravity: 6,
      tex: 'spark',
      stretch: 2,
      life: 0.25,
    });
    fx.burst(p.x, p.y - 0.15, p.z, Math.round(2 * k), {
      color: '#8a7e70',
      speed: 0.5,
      up: 0.3,
      size: 0.25,
      size1: 0.6,
      gravity: 0,
      tex: 'smoke',
      additive: false,
      alpha: 0.35,
      life: 0.8,
      drag: 2,
    });
  });
  ev.on('earthHit', (e) => {
    const h = sim.getAs(e.hero, 'hero');
    if (h && (h.earthAt ?? 0) > sim.state.time) state.heroes.get(e.hero)?.terrainStrike(h);
  });
  ev.on('cellDug', (e) => {
    const p = e.blasted ? at(e.x, e.z, 0.6) : chipAt(e);
    const m = MINERALS[e.mineral as MineralId] ?? MINERALS[0];
    fx.burst(p.x, p.y, p.z, e.blasted ? 6 : 16, {
      color: m.stain,
      speed: 2,
      up: 1.6,
      size: 0.11,
      gravity: 10,
      tex: 'chunk',
      additive: false,
      life: 0.8,
    });
    if (e.mineral)
      fx.burst(p.x, p.y, p.z, 6, {
        color: m.ore,
        speed: 1.6,
        up: 1.5,
        size: 0.08,
        gravity: 9,
        tex: 'chunk',
        additive: false,
        life: 0.7,
      });
    if (!e.blasted)
      fx.burst(p.x, p.y - 0.3, p.z, 6, {
        color: '#8a7e70',
        speed: 0.7,
        up: 0.35,
        size: 0.4,
        size1: 1,
        gravity: 0,
        tex: 'smoke',
        additive: false,
        alpha: 0.4,
        life: 1.1,
        drag: 2,
      });
    if (e.item && !e.blasted) fx.text(p.x, p.y + 0.5, p.z, `+1 ${ITEMS[e.item].name}`, 'gain', 1.1);
  });
  ev.on('caveInCleared', (e) => {
    const p = at(e.x, e.z, 0.6);
    fx.burst(p.x, p.y, p.z, 40, {
      color: '#857b6e',
      speed: 4,
      up: 2.5,
      size: 0.18,
      gravity: 11,
      tex: 'chunk',
      additive: false,
      life: 1.2,
    });
    fx.burst(p.x, p.y, p.z, 22, {
      color: '#6e655b',
      speed: 2.2,
      up: 0.8,
      size: 1.4,
      size1: 3.6,
      gravity: -0.1,
      tex: 'smoke',
      additive: false,
      alpha: 0.55,
      life: 3.2,
      drag: 1.2,
    });
    fx.text(p.x, p.y + 1.2, p.z, 'The way is open!', 'status level', 2.4);
  });
  ev.on('blast', (e) => {
    const p = at(e.x, e.z, 0.4);
    if (e.y !== undefined) p.y = e.y;
    fx.glow({ x: p.x, y: p.y + 0.4, z: p.z, life: 0.35, size: 5, size1: 8, color: '#ffd38a', tex: 'dot' });
    fx.burst(p.x, p.y, p.z, 60, {
      color: '#7a6f62',
      speed: 7,
      up: 5,
      size: 0.16,
      gravity: 12,
      tex: 'chunk',
      additive: false,
      life: 1.2,
    });
    fx.burst(p.x, p.y, p.z, 26, {
      color: '#ffb347',
      color1: '#ff3d00',
      speed: 5,
      up: 4,
      size: 0.3,
      gravity: 2,
      tex: 'dot',
      life: 0.6,
    });
    fx.burst(p.x, p.y, p.z, 18, {
      color: '#5e564e',
      speed: 2.5,
      up: 1.6,
      size: 1.2,
      size1: 3.2,
      gravity: -0.3,
      tex: 'smoke',
      additive: false,
      alpha: 0.6,
      life: 2.4,
      drag: 1.4,
    });
    fx.ring(p.x, p.y - 0.35, p.z, 0.3, e.r * 1.3, '#ffcf8a', 0.45, 0.7);
    ctx.shake(1.1, e.x, e.z);
  });
}
