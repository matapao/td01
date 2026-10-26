import type { DecideIcon } from './decide-data.ts';
import { text, rrect, PAL, FONT } from './kit.ts';
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

/** The largest font size (at most `max`) at which `s` fits in `w` px. */
export function fitSize(g: CanvasRenderingContext2D, s: string, w: number, max = 11, min = 8): number {
  for (let size = max; size > min; size -= 0.5) {
    g.font = `${size}px ${FONT}`;
    if (g.measureText(s).width <= w) return size;
  }
  return min;
}

/** The goal line and the time left (a thin bar), at the top. */
export function topLine(g: CanvasRenderingContext2D, goal: string, size: number, left: number): void {
  text(g, goal, 6, 9, { size, color: PAL.gold, align: 'left' });
  g.fillStyle = '#2a2318';
  g.fillRect(W - 54, 6, 48, 4);
  g.fillStyle = left < 0.2 ? PAL.bad : '#8a7a5a';
  g.fillRect(W - 54, 6, 48 * Math.max(0, left), 4);
}

/** A small picture for a condition or an output; `on` draws its active look. */
export function icon(
  g: CanvasRenderingContext2D,
  kind: DecideIcon,
  x: number,
  y: number,
  on: boolean,
  s = 1,
): void {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.lineWidth = 1.2;
  switch (kind) {
    case 'moon':
      if (on) {
        g.fillStyle = '#dfe6ff';
        g.beginPath();
        g.arc(0, 0, 6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#1e1912';
        g.beginPath();
        g.arc(3, -2, 5, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = '#ffd34d';
        g.beginPath();
        g.arc(0, 0, 3.6, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#ffd34d';
        g.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          g.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
          g.lineTo(Math.cos(a) * 7, Math.sin(a) * 7);
        }
        g.stroke();
      }
      break;
    case 'eye':
      g.strokeStyle = on ? '#ffb0a0' : '#8a7a5a';
      g.beginPath();
      g.moveTo(-7, 0);
      g.quadraticCurveTo(0, on ? -7 : -1.5, 7, 0);
      g.quadraticCurveTo(0, on ? 7 : 1.5, -7, 0);
      g.stroke();
      if (on) {
        g.fillStyle = '#ff5a4a';
        g.beginPath();
        g.arc(0, 0, 2.6, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'bell':
      g.fillStyle = on ? '#ffd34d' : '#8a7a5a';
      g.beginPath();
      g.moveTo(-5, 4);
      g.quadraticCurveTo(-5, -6, 0, -6);
      g.quadraticCurveTo(5, -6, 5, 4);
      g.closePath();
      g.fill();
      g.fillRect(-6.5, 3.5, 13, 1.8);
      g.beginPath();
      g.arc(0, 6.5, 1.6, 0, Math.PI * 2);
      g.fill();
      if (on) {
        g.strokeStyle = '#ffd34d';
        g.beginPath();
        g.arc(0, -1, 9, -0.6, 0.4);
        g.moveTo(-9 * Math.cos(0.6), -1 - 9 * Math.sin(0.6));
        g.arc(0, -1, 9, Math.PI + 0.6, Math.PI - 0.4, true);
        g.stroke();
      }
      break;
    case 'rain':
      g.fillStyle = on ? '#9fb8d0' : '#6f6450';
      g.beginPath();
      g.arc(-3, -1, 3.5, 0, Math.PI * 2);
      g.arc(2, -2.5, 4, 0, Math.PI * 2);
      g.arc(5, 0, 2.8, 0, Math.PI * 2);
      g.fill();
      if (on) {
        g.strokeStyle = '#6ab8ff';
        g.beginPath();
        for (const dx of [-3, 1, 5]) {
          g.moveTo(dx, 4);
          g.lineTo(dx - 1, 7);
        }
        g.stroke();
      }
      break;
    case 'fire':
      g.fillStyle = on ? '#ff9a3c' : '#5a3a28';
      g.beginPath();
      g.moveTo(0, -7);
      g.quadraticCurveTo(6, 0, 3, 6);
      g.lineTo(-3, 6);
      g.quadraticCurveTo(-6, 0, 0, -7);
      g.fill();
      if (on) {
        g.fillStyle = '#ffe08a';
        g.beginPath();
        g.arc(0, 3, 2.2, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'key':
      g.strokeStyle = on ? '#ffd34d' : '#8a7a5a';
      g.beginPath();
      g.arc(-3, 0, 3, 0, Math.PI * 2);
      g.moveTo(0, 0);
      g.lineTo(7, 0);
      g.moveTo(5, 0);
      g.lineTo(5, 3);
      g.stroke();
      break;
    case 'cart':
      g.fillStyle = on ? '#c9935a' : '#6f6450';
      g.beginPath();
      g.moveTo(-7, -3);
      g.lineTo(7, -3);
      g.lineTo(5, 3);
      g.lineTo(-5, 3);
      g.closePath();
      g.fill();
      if (on) {
        g.fillStyle = '#d8b25a';
        g.beginPath();
        g.arc(-2, -4, 2, 0, Math.PI * 2);
        g.arc(2, -4.5, 2.2, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#222';
      g.beginPath();
      g.arc(-3.5, 4, 1.6, 0, Math.PI * 2);
      g.arc(3.5, 4, 1.6, 0, Math.PI * 2);
      g.fill();
      break;
    case 'gate':
      g.strokeStyle = '#8a7a5a';
      g.strokeRect(-7, -7, 14, 14);
      g.strokeStyle = on ? '#e9c46a' : '#6f6450';
      g.beginPath();
      {
        const drop = on ? 7 : -3;
        for (const dx of [-4, 0, 4]) {
          g.moveTo(dx, -7);
          g.lineTo(dx, drop);
        }
        g.moveTo(-7, drop - 3);
        g.lineTo(7, drop - 3);
      }
      g.stroke();
      break;
    case 'lamp':
      g.fillStyle = on ? '#fff3b0' : '#3a3632';
      g.beginPath();
      g.arc(0, -1, 6, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#d8c79a';
      g.stroke();
      g.fillStyle = '#8a7a5a';
      g.fillRect(-3, 5, 6, 3);
      break;
  }
  g.restore();
}

// ---- Logic: relays on a ladder --------------------------------------------------------------------
