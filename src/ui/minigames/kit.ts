/**
 * Shared pieces for the minigames: a crisp canvas that fills the host, the pointer on it, the
 * palette, and the finish — a verdict shown for a moment (why it went that way), then the result.
 */
import type { MinigameHost, Quality } from './types.ts';
import { BOARD_FACES, type FaceId } from '../fonts.ts';

/** The colours every minigame draws with (the HUD's gold-on-dark). */
export const PAL = {
  bg: '#14110d',
  panel: '#211b14',
  line: '#5a4a30',
  ink: '#f4ead6',
  dim: '#bfb39a',
  faint: '#6f6450',
  gold: '#e9c46a',
  good: '#7dff9a',
  bad: '#ff6a5a',
  hot: '#ff9a3c',
  cool: '#6aa8ff',
};

/**
 * The face every board draws its words in: the UI serif, or — while a milestone's board is up — its
 * age's face (set by runMinigame; one board runs at a time). A live binding: read it when drawing.
 */
export let FONT: string = BOARD_FACES.serif;

export function setBoardFace(face: FaceId): void {
  FONT = BOARD_FACES[face];
}

export interface Pointer {
  x: number;
  y: number;
  down: boolean;
}

/**
 * A canvas `w` × `h` CSS px (drawn at twice the resolution) in the host's root, and the pointer on it
 * in CSS px. `onDown` / `onUp` fire on press and release (anywhere after a press on the canvas).
 */
export function canvasIn(
  host: MinigameHost,
  w: number,
  h: number,
  on: { down?: (p: Pointer) => void; up?: (p: Pointer) => void } = {},
): {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  pointer: Pointer;
  dispose: () => void;
} {
  const canvas = document.createElement('canvas');
  canvas.width = w * 2;
  canvas.height = h * 2;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  canvas.style.borderRadius = '6px';
  canvas.style.cursor = 'pointer';
  canvas.style.pointerEvents = 'auto';
  canvas.style.touchAction = 'none';
  host.root.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  g.scale(2, 2);
  const pointer: Pointer = { x: 0, y: 0, down: false };
  const at = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * w;
    pointer.y = ((e.clientY - r.top) / r.height) * h;
  };
  const down = (e: PointerEvent) => {
    at(e);
    e.stopPropagation();
    e.preventDefault();
    pointer.down = true;
    on.down?.(pointer);
  };
  const move = (e: PointerEvent) => at(e);
  const up = (e: PointerEvent) => {
    if (!pointer.down) return;
    at(e);
    pointer.down = false;
    on.up?.(pointer);
  };
  canvas.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  return {
    canvas,
    g,
    pointer,
    dispose: () => {
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      canvas.remove();
    },
  };
}

/**
 * Ends a run: shows the verdict (Perfect / Good / Failed) and the why-line over the host for
 * `hold` seconds, then hands the result to the host. Returns a function that reports whether the
 * verdict is showing (so the minigame stops taking input).
 */
export function finisher(
  host: MinigameHost,
  hold = 1.4,
): { finish: (quality: Quality, why: string) => void; finished: () => boolean } {
  let done = false;
  return {
    finished: () => done,
    finish: (quality, why) => {
      if (done) return;
      done = true;
      const v = document.createElement('div');
      v.className = `mg-verdict q${quality}`;
      v.innerHTML = `<b>${quality === 2 ? 'Perfect' : quality === 1 ? 'Good' : 'Failed'}</b><span>${why}</span>`;
      host.root.appendChild(v);
      setTimeout(() => host.done({ quality, why }), hold * 1000);
    },
  };
}

/** Text on a canvas (centred by default). */
export function text(
  g: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  o: { size?: number; color?: string; align?: CanvasTextAlign; bold?: boolean } = {},
): void {
  g.font = `${o.bold ? 'bold ' : ''}${o.size ?? 12}px ${FONT}`;
  g.fillStyle = o.color ?? PAL.ink;
  g.textAlign = o.align ?? 'center';
  g.textBaseline = 'middle';
  g.fillText(s, x, y);
}

/** A rounded rectangle path. */
export function rrect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
