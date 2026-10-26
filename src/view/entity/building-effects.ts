import * as THREE from 'three';
import type { Building } from '../../game/types.ts';
import { flickerFlame } from '../flame.ts';
import type { Fx } from '../fx.ts';
import { type GemFx } from '../gems.ts';
import { type ViewCtx } from './context.ts';

export function emitGemFx(fx: Fx, kind: Parameters<GemFx>[0], at: THREE.Vector3, to?: THREE.Vector3): void {
  const r = (k: number) => (Math.random() - 0.5) * k;
  if (kind === 'ember')
    fx.glow({
      x: at.x,
      y: at.y,
      z: at.z,
      vx: r(0.25),
      vy: 0.45 + Math.random() * 0.4,
      vz: r(0.25),
      life: 0.9,
      size: 0.07,
      size1: 0.01,
      color: '#ffc04a',
      color1: '#ff3010',
      tex: 'dot',
      drag: 0.6,
      gravity: 0,
    });
  else if (kind === 'frost')
    fx.glow({
      x: at.x,
      y: at.y,
      z: at.z,
      vx: r(0.1),
      vy: -0.08,
      vz: r(0.1),
      life: 1.1,
      size: 0.09,
      size1: 0,
      color: '#ffffff',
      color1: '#7fd8ff',
      tex: 'star',
      spin: 2,
      drag: 0.4,
      gravity: 0,
    });
  else if (to) {
    fx.beam(at, to, '#fff3a0', 0.022, 0.12, 0.045);
    fx.glow({
      x: to.x,
      y: to.y,
      z: to.z,
      life: 0.18,
      size: 0.14,
      size1: 0.02,
      color: '#fff6c0',
      color1: '#ffb800',
      tex: 'dot',
      gravity: 0,
    });
  }
}
export function updateBuildingFire(
  ctx: ViewCtx,
  root: THREE.Group,
  flame: THREE.Group | null,
  time: number,
  night: number,
  b: Building,
  dt: number,
): void {
  if (flame) {
    flickerFlame(flame, time, night);
    const p = flame.getWorldPosition(new THREE.Vector3());
    // Embers rising, and a wisp of smoke now and then.
    if (Math.random() < dt * 5) {
      ctx.fx.glow({
        x: p.x + (Math.random() - 0.5) * 0.2,
        y: p.y + 0.3,
        z: p.z + (Math.random() - 0.5) * 0.2,
        vx: (Math.random() - 0.5) * 0.4,
        vy: 0.9 + Math.random() * 0.8,
        vz: (Math.random() - 0.5) * 0.4,
        life: 1.2,
        size: 0.07,
        size1: 0.02,
        color: '#ffc040',
        color1: '#ff3a10',
        tex: 'dot',
        drag: 0.5,
        gravity: 0,
      });
    }
    if (Math.random() < dt * 1.5) {
      ctx.fx.puff({
        x: p.x,
        y: p.y + 0.7,
        z: p.z,
        vy: 0.6,
        vx: 0.08,
        life: 1.8,
        size: 0.2,
        size1: 0.7,
        color: '#4a4440',
        alpha: 0.25,
        tex: 'smoke',
        drag: 0.4,
      });
    }
  }
  if (b.kind === 'forge' && b.busy && Math.random() < dt * 6) {
    const p = new THREE.Vector3(0.3, 2.6, -0.3).applyMatrix4(root.matrixWorld);
    ctx.fx.puff({
      x: p.x,
      y: p.y,
      z: p.z,
      vy: 1.2,
      vx: 0.3,
      life: 2.2,
      size: 0.6,
      size1: 1.8,
      color: '#5a5550',
      alpha: 0.45,
      tex: 'smoke',
      drag: 0.4,
    });
  }
}
export function updateBuildingDamage(
  ctx: ViewCtx,
  root: THREE.Group,
  platformY: number,
  b: Building,
  dt: number,
): void {
  const hurt = 1 - b.hp / b.maxHp;
  if (hurt > 0.35 && Math.random() < dt * (2 + hurt * 10)) {
    const p = new THREE.Vector3(
      (Math.random() - 0.5) * 1.6,
      platformY * (0.5 + Math.random() * 0.5),
      (Math.random() - 0.5) * 1.6,
    ).applyMatrix4(root.matrixWorld);
    ctx.fx.puff({
      x: p.x,
      y: p.y,
      z: p.z,
      vy: 1.3,
      vx: 0.4,
      life: 2,
      size: 0.5,
      size1: 1.6,
      color: hurt > 0.7 ? '#2a2420' : '#55504a',
      alpha: 0.5,
      tex: 'smoke',
      drag: 0.5,
    });
    if (hurt > 0.7 && Math.random() < 0.3)
      ctx.fx.glow({
        x: p.x,
        y: p.y,
        z: p.z,
        vy: 1.5,
        life: 0.5,
        size: 0.4,
        size1: 0.1,
        color: '#ffb347',
        color1: '#ff3d00',
      });
  }
}
