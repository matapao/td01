import type { MinigameHost, Quality } from './types.ts';
import type { SeparatePart, SeparateParams } from './separate-data.ts';
import { canvasIn, finisher, text, rrect, PAL, FONT } from './kit.ts';
export const W = 380;
export const H = 220;
export const PANEL_X = 246;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const inBox = (b: Box, x: number, y: number): boolean =>
  x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
export const pct = (x: number): string => `${Math.round(x * 100)} %`;

export function glowSprite(r: number, g: number, b: number): HTMLCanvasElement {
  const s = document.createElement('canvas');
  s.width = s.height = 64;
  const x = s.getContext('2d')!;
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.95)`);
  grad.addColorStop(0.4, `rgba(${r},${g},${b},0.4)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  return s;
}

/** The common frame of every style: canvas, goal line, time bar, a Done button, keys, the finish. */
export function frame(
  host: MinigameHost,
  p: SeparateParams,
  on: {
    down?: (pt: { x: number; y: number }) => void;
    up?: (pt: { x: number; y: number }) => void;
    key?: (e: KeyboardEvent, down: boolean) => boolean;
  },
) {
  const end = finisher(host);
  const doneBtn: Box = { x: PANEL_X + 34, y: 176, w: 64, h: 24 };
  let onDone: () => void = () => {};
  const c = canvasIn(host, W, H, {
    down: (pt) => {
      if (end.finished()) return;
      if (inBox(doneBtn, pt.x, pt.y)) return onDone();
      on.down?.(pt);
    },
    up: (pt) => on.up?.(pt),
  });
  const g = c.g;
  let goalSize = 11;
  for (; goalSize > 8; goalSize -= 0.5) {
    g.font = `${goalSize}px ${FONT}`;
    if (g.measureText(p.words.goal).width <= W - 66) break;
  }
  const kd = (e: KeyboardEvent): void => {
    if (end.finished()) return;
    if (e.key === 'Enter') {
      onDone();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
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
    end,
    c,
    g,
    pointer: c.pointer,
    doneBtn,
    setDone: (f: () => void) => (onDone = f),
    /** The top line and the panel's back. */
    top: (left: number): void => {
      g.fillStyle = PAL.bg;
      g.fillRect(0, 0, W, H);
      text(g, p.words.goal, 6, 9, { size: goalSize, color: PAL.gold, align: 'left' });
      g.fillStyle = '#2a2318';
      g.fillRect(W - 54, 6, 48, 4);
      g.fillStyle = left < 0.2 ? PAL.bad : '#8a7a5a';
      g.fillRect(W - 54, 6, 48 * Math.max(0, left), 4);
      g.fillStyle = '#1b1610';
      rrect(g, PANEL_X - 4, 18, W - PANEL_X + 2, 186, 6);
      g.fill();
    },
    /** A readout bar: label, value text, fill share, the target mark. */
    meter: (y: number, label: string, value: string, share: number, target: number, good: boolean): void => {
      text(g, label, PANEL_X + 2, y, { size: 9, color: PAL.dim, align: 'left' });
      text(g, value, W - 10, y, { size: 9.5, color: good ? PAL.good : PAL.ink, align: 'right', bold: true });
      const bx = PANEL_X + 2;
      const bw = W - PANEL_X - 12;
      g.fillStyle = '#2a2318';
      g.fillRect(bx, y + 7, bw, 5);
      g.fillStyle = good ? '#5fd07a' : '#c9a24a';
      g.fillRect(bx, y + 7, bw * Math.max(0, Math.min(1, share)), 5);
      if (target > 0 && target < 1) {
        g.fillStyle = PAL.ink;
        g.fillRect(bx + bw * target - 0.5, y + 5, 1.5, 9);
      }
    },
    button: (label: string, off: boolean, ready = false): void => {
      const hover = !off && inBox(doneBtn, c.pointer.x, c.pointer.y);
      g.fillStyle = ready && !off ? '#24361f' : hover ? '#2c241a' : '#1e1912';
      rrect(g, doneBtn.x, doneBtn.y, doneBtn.w, doneBtn.h, 5);
      g.fill();
      g.strokeStyle = off ? '#3a3022' : ready ? PAL.good : hover ? PAL.gold : '#5a4a30';
      g.lineWidth = ready && !off ? 1.5 : 1;
      g.stroke();
      text(g, label, doneBtn.x + doneBtn.w / 2, doneBtn.y + doneBtn.h / 2 + 0.5, {
        size: 10,
        color: off ? PAL.faint : ready ? PAL.good : PAL.ink,
        bold: true,
      });
    },
    status: (s: string, gold: boolean): void =>
      text(g, s, W / 2, 211, { size: 9, color: gold ? PAL.gold : PAL.faint }),
    dispose: () => {
      window.removeEventListener('keydown', kd, true);
      window.removeEventListener('keyup', ku, true);
      c.dispose();
    },
  };
}

/** Splits `total` grains among the parts by share (at least one each). */
export function counts(parts: SeparatePart[], total: number): number[] {
  const sum = parts.reduce((s, pt) => s + pt.share, 0) || 1;
  return parts.map((pt) => Math.max(1, Math.round((pt.share / sum) * total)));
}

/** Good / perfect / miss from the purity and the share kept. */
export function judge(p: SeparateParams, purity: number, kept: number): Quality {
  const keep = p.keep ?? 0.6;
  if (purity < p.purity || kept < keep) return 0;
  const perfectP = p.purity + (1 - p.purity) / 2;
  return purity >= perfectP && kept >= Math.max(keep, 0.85) ? 2 : 1;
}

// ---- Pan ------------------------------------------------------------------------------------------
