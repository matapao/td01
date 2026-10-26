import type { MinigameHost } from './types.ts';
import { canvasIn, text, rrect, PAL, FONT } from './kit.ts';
export const W = 380;
export const H = 220;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const inBox = (b: Box, x: number, y: number): boolean =>
  x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

export function fitSize(g: CanvasRenderingContext2D, s: string, w: number, max = 11, min = 8): number {
  for (let size = max; size > min; size -= 0.5) {
    g.font = `${size}px ${FONT}`;
    if (g.measureText(s).width <= w) return size;
  }
  return min;
}

export function topLine(g: CanvasRenderingContext2D, goal: string, size: number, left: number): void {
  text(g, goal, 6, 9, { size, color: PAL.gold, align: 'left' });
  g.fillStyle = '#2a2318';
  g.fillRect(W - 54, 6, 48, 4);
  g.fillStyle = left < 0.2 ? PAL.bad : '#8a7a5a';
  g.fillRect(W - 54, 6, 48 * Math.max(0, left), 4);
}

export function button(
  g: CanvasRenderingContext2D,
  b: Box,
  label: string,
  o: { hover?: boolean; on?: boolean; off?: boolean; size?: number } = {},
): void {
  g.fillStyle = o.on ? '#3a2f1c' : o.hover && !o.off ? '#2c241a' : '#1e1912';
  rrect(g, b.x, b.y, b.w, b.h, 5);
  g.fill();
  g.strokeStyle = o.off ? '#3a3022' : o.on || o.hover ? PAL.gold : '#5a4a30';
  g.lineWidth = o.on ? 1.5 : 1;
  g.stroke();
  text(g, label, b.x + b.w / 2, b.y + b.h / 2 + 0.5, {
    size: o.size ?? 10,
    color: o.off ? PAL.faint : o.on ? PAL.gold : PAL.ink,
    bold: true,
  });
}

export function glowSprite(r: number, g: number, b: number): HTMLCanvasElement {
  const s = document.createElement('canvas');
  s.width = s.height = 64;
  const x = s.getContext('2d')!;
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
  grad.addColorStop(0.4, `rgba(${r},${g},${b},0.35)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  return s;
}

/** A canvas with its goal line sized to fit, and a capture-phase key listener that the dispose removes. */
export function setup(
  host: MinigameHost,
  goal: string,
  on: {
    down?: (p: { x: number; y: number }) => void;
    up?: (p: { x: number; y: number }) => void;
    key?: (e: KeyboardEvent, down: boolean) => boolean;
  },
) {
  const c = canvasIn(host, W, H, { ...(on.down ? { down: on.down } : {}), ...(on.up ? { up: on.up } : {}) });
  const goalSize = fitSize(c.g, goal, W - 66);
  const kd = (e: KeyboardEvent): void => {
    if (on.key?.(e, true)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const ku = (e: KeyboardEvent): void => {
    if (on.key?.(e, false)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  window.addEventListener('keydown', kd, true);
  window.addEventListener('keyup', ku, true);
  return {
    c,
    g: c.g,
    pointer: c.pointer,
    goalSize,
    dispose: () => {
      window.removeEventListener('keydown', kd, true);
      window.removeEventListener('keyup', ku, true);
      c.dispose();
    },
  };
}

// ---- Morse ----------------------------------------------------------------------------------------
