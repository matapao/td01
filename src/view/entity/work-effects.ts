import * as THREE from 'three';
import { type ViewCtx } from './context.ts';

export function beatFx(ctx: ViewCtx, action: string, p: THREE.Vector3, q: number): void {
  const { fx } = ctx;
  const n = q === 2 ? 22 : q === 1 ? 10 : 3;
  switch (action) {
    case 'hammer':
      fx.burst(p.x, p.y, p.z, n, {
        color: '#ffd27a',
        speed: 3,
        up: 2,
        size: 0.07,
        gravity: 10,
        tex: 'spark',
        stretch: 3,
        life: 0.4,
      });
      fx.burst(p.x, p.y - 0.3, p.z, 4, {
        color: '#bfae96',
        speed: 0.8,
        up: 0.3,
        size: 0.3,
        size1: 0.6,
        gravity: 0,
        tex: 'smoke',
        additive: false,
        alpha: 0.4,
        life: 0.8,
      });
      break;
    case 'saw':
      fx.burst(p.x, p.y, p.z, n, {
        color: '#e8c48a',
        speed: 1.8,
        up: 1.2,
        size: 0.06,
        gravity: 6,
        tex: 'chunk',
        additive: false,
        life: 0.7,
      });
      break;
    case 'cut':
      fx.burst(p.x, p.y, p.z, n, {
        color: '#c4ccd6',
        speed: 2.2,
        up: 1.8,
        size: 0.08,
        gravity: 10,
        tex: 'chunk',
        additive: false,
        life: 0.6,
      });
      break;
    case 'smelt':
      fx.burst(p.x, p.y, p.z, n, {
        color: '#ffb347',
        color1: '#ff3d00',
        speed: 2,
        up: 3,
        size: 0.3,
        gravity: -1,
        tex: 'dot',
        life: 0.7,
      });
      break;
    case 'weld':
      fx.burst(p.x, p.y, p.z, n + 6, {
        color: '#d9f3ff',
        speed: 6,
        up: 2,
        size: 0.1,
        gravity: 10,
        tex: 'spark',
        stretch: 4,
        life: 0.35,
      });
      fx.glow({ x: p.x, y: p.y, z: p.z, life: 0.12, size: 2.2, color: '#bfe9ff', tex: 'dot' });
      break;
    case 'wire':
      fx.burst(p.x, p.y, p.z, n, {
        color: '#fff27a',
        speed: 4,
        up: 1,
        size: 0.12,
        gravity: 4,
        tex: 'spark',
        stretch: 3,
        life: 0.3,
      });
      break;
    case 'code':
      fx.burst(p.x, p.y + 0.5, p.z, n, {
        color: '#c18bff',
        speed: 1.5,
        up: 2,
        size: 0.35,
        gravity: -0.5,
        tex: 'rune',
        life: 0.9,
      });
      break;
  }
  if (q === 2) ctx.fx.text(p.x, p.y + 1.6, p.z, 'PERFECT!', 'status perfect', 0.8);
}
