import * as THREE from 'three';
import { DRONE, ENEMIES } from '../../game/content.ts';
import { gh, type ViewCtx } from './context.ts';
import type { EntityEventState } from './event-state.ts';

export function hookDroneEvents(
  ctx: ViewCtx,
  state: Pick<EntityEventState, 'drones' | 'enemies' | 'heroes'>,
): void {
  const { sim, fx } = ctx;
  const ev = sim.events;
  const at = (x: number, z: number, dy = 0) => new THREE.Vector3(x, gh(ctx, x, z) + dy, z);
  ev.on('droneLaunched', (e) => {
    const p = at(e.x, e.z, 0.1);
    fx.ring(p.x, p.y, p.z, 0.2, 1.4, '#cfe8ff', 0.5, 0.7);
    fx.burst(p.x, p.y + 0.1, p.z, 10, {
      color: '#bfae96',
      speed: 1.6,
      up: 0.4,
      size: 0.25,
      size1: 0.6,
      gravity: 0,
      tex: 'smoke',
      additive: false,
      alpha: 0.4,
      life: 0.7,
    });
  });
  ev.on('droneHit', (e) => {
    const d = state.drones.get(e.hero);
    const en = state.enemies.get(e.by);
    if (!d) return;
    if (en && ENEMIES[sim.getAs(e.by, 'enemy')?.kind ?? 'minion'].flying !== true) {
      // A caster's bolt across the sky.
      const from = en.ch.root.position.clone().add(new THREE.Vector3(0, en.height * 0.9, 0));
      fx.beam(from, d.pos.clone(), '#a6ff4d', 0.12, 0.3);
    }
    fx.burst(d.pos.x, d.pos.y, d.pos.z, 8, {
      color: '#ffe9a8',
      speed: 2.5,
      up: 1,
      size: 0.12,
      gravity: 6,
      tex: 'spark',
      stretch: 2,
      life: 0.3,
    });
  });
  ev.on('droneDown', (e) => {
    const d = state.drones.get(e.hero);
    const p = d ? d.pos.clone() : at(e.x, e.z, DRONE.altitude);
    fx.glow({ x: p.x, y: p.y, z: p.z, life: 0.3, size: 1.6, size1: 2.6, color: '#ffb347', tex: 'dot' });
    fx.burst(p.x, p.y, p.z, 18, {
      color: '#3b4250',
      speed: 3,
      up: 2,
      size: 0.12,
      gravity: 9,
      tex: 'chunk',
      additive: false,
      life: 1.2,
    });
    fx.burst(p.x, p.y, p.z, 12, {
      color: '#4a4440',
      speed: 1.2,
      up: 0.8,
      size: 0.5,
      size1: 1.4,
      gravity: 0,
      tex: 'smoke',
      additive: false,
      alpha: 0.6,
      life: 1.4,
    });
    fx.text(p.x, p.y + 0.4, p.z, 'DRONE DOWN', 'status enrage', 1.4);
  });
  ev.on('droneDocked', (e) => {
    const v = state.heroes.get(e.hero);
    if (v) fx.ring(v.pos.x, v.pos.y + 0.02, v.pos.z, 0.1, 0.8, '#7fe8ff', 0.4, 0.8);
  });
}
