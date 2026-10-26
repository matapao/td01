import { corners, resample, tracePath, STEP, type Rect, type Path } from './steady-path.ts';
import { SPARK, SMOKE, CHIP, FLAKE, GRIT, Fx } from './steady-particles.ts';
export type { SteadyStyle } from './steady-data.ts';
export type { SteadyPath } from './steady-data.ts';
export type { SteadyParams } from './steady-data.ts';
export { STEADY_EXAMPLES } from './steady-data.ts';
import { STEADY_EXAMPLES } from './steady-data.ts';
import type { SteadyParams } from './steady-data.ts';
/**
 * Steady hand (TECH_LINEAGE §4): trace a path with the pointer held, close to the line and at the
 * right pace — a weld along a seam, a lathe tool along a profile, a glass cutter's score, a drill fed
 * into rock, a lander guided down onto its pad. What you lay shows as you go: an even bead or a
 * spattered one, a true cut or a gouge. Too fast is sloppy; too slow overheats (or, landing, burns
 * the fuel); off the line misses the joint. Space or F can stand in for holding the button.
 *
 * Each piece of the path is graded as it is passed (the tape along the bottom). STEADY_EXAMPLES shows
 * how milestones set it up; the playground runs one with ?minigame=steady&demo=<name>.
 */
import type { MinigameDef, Quality } from './types.ts';
import { canvasIn, finisher, text, rrect, PAL } from './kit.ts';

/** The playground's ?demo=<name> picks an example; the weld by default. */
function demoFromUrl(): SteadyParams {
  const name =
    typeof location === 'undefined' ? '' : (new URLSearchParams(location.search).get('demo') ?? '');
  return Object.hasOwn(STEADY_EXAMPLES, name)
    ? STEADY_EXAMPLES[name as keyof typeof STEADY_EXAMPLES]
    : STEADY_EXAMPLES.weld;
}

// ---- Drawing helpers --------------------------------------------------------------------------------

const W = 380;
const H = 220;
/** Seconds the ending plays before the verdict. */
const OUTRO = 1.1;
/** Pieces of the path, graded as they are passed. */
const CELLS = 60;
const TAU = Math.PI * 2;
/** Grades of a piece of the path. */
const BAD = 1;
const OK = 2;
const BEST = 3;

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const ease = (u: number): number => u * u * (3 - 2 * u);

/** An offscreen canvas `w` × `h` CSS px (at twice the resolution), painted once (or added to). */
function layer(paint: (g: CanvasRenderingContext2D) => void, w = W, h = H): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w * 2;
  cv.height = h * 2;
  const g = cv.getContext('2d')!;
  g.scale(2, 2);
  paint(g);
  return cv;
}

/** A soft round light in one colour ("r,g,b"). */
function glowSprite(rgb: string): HTMLCanvasElement {
  return layer(
    (g) => {
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, `rgba(${rgb},1)`);
      grd.addColorStop(0.3, `rgba(${rgb},0.5)`);
      grd.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    },
    64,
    64,
  );
}

function glow(
  g: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  r: number,
  a: number,
): void {
  if (a <= 0.01) return;
  g.globalAlpha = Math.min(1, a);
  g.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  g.globalAlpha = 1;
}

/** A small seeded random generator, for scenery that looks the same every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stars over an airless world. */
function stars(g: CanvasRenderingContext2D, y1: number, seed: number): void {
  const r = rng(seed);
  for (let i = 0; i < 90; i++) {
    g.globalAlpha = 0.25 + r() * 0.75;
    g.fillStyle = r() < 0.2 ? '#ffe9c0' : '#e2eaff';
    const s = r() < 0.1 ? 1.7 : 1;
    g.fillRect(r() * W, r() * y1, s, s);
  }
  g.globalAlpha = 1;
}

/** A cartoony base on the grey ground: domes, a mast with its lamp (drawn by the look). */
function base(g: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  g.fillStyle = '#c9ced6';
  g.beginPath();
  g.arc(x, y, 12 * k, Math.PI, 0);
  g.fill();
  g.beginPath();
  g.arc(x + 20 * k, y, 8 * k, Math.PI, 0);
  g.fill();
  g.fillStyle = '#8a929c';
  g.fillRect(x - 13 * k, y - 1, 42 * k, 2.5 * k);
  g.fillStyle = '#6aa8ff';
  g.fillRect(x - 5 * k, y - 6 * k, 3 * k, 2 * k);
  g.fillRect(x + 1 * k, y - 6 * k, 3 * k, 2 * k);
  g.strokeStyle = '#9aa2ac';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x + 34 * k, y);
  g.lineTo(x + 34 * k, y - 22 * k);
  g.stroke();
}

// ---- Particles --------------------------------------------------------------------------------------

// ---- The path ---------------------------------------------------------------------------------------

// ---- The run, as the looks see it ---------------------------------------------------------------

/** What a look draws from, every frame. */
interface View {
  t: number;
  dt: number;
  // Path indices are clamped to n; tail indices are modulo TAIL; cells are bounded by CELLS.
  path: Path;
  /** Has the tool touched the start yet; is it held now; is it on the work (near the line). */
  started: boolean;
  active: boolean;
  contact: boolean;
  /** The pointer, and how far it is from the line. */
  px: number;
  py: number;
  d: number;
  /** The sample reached along the path, and the share of it done. */
  idx: number;
  progress: number;
  /** Speed along the path (px a second), and its limits. */
  speed: number;
  slow: number;
  fast: number;
  /** 0–1: heat built up by dawdling (or fuel burnt, landing). */
  heat: number;
  /** The grade of each piece of the path so far (0 not yet). */
  cells: Uint8Array;
  /** What is being laid now (BAD, OK, BEST). */
  grade: number;
  end: '' | 'win' | 'fast' | 'slow' | 'off';
  outro: number;
  /** The last points laid, with when (a ring of TAIL). */
  tailX: Float32Array;
  tailY: Float32Array;
  tailT: Float32Array;
  tailHead: number;
}

const TAIL = 48;

/** A look: where the path lies, how to lay a piece of trail, and the scene each frame. */
interface Look {
  rect: Rect;
  /** Named shapes run top to bottom. */
  upright: boolean;
  /** The meter's name when the words give none. */
  meter: string;
  /** Paint what doesn't move, once the path is known. */
  init(path: Path): void;
  /** Lay a piece of trail from (ax, ay) to (bx, by) on the trail layer. */
  lay(
    tg: CanvasRenderingContext2D,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    grade: number,
    s: View,
  ): void;
  draw(g: CanvasRenderingContext2D, s: View, trail: HTMLCanvasElement): void;
}

/** The hot end of a weld bead: white at the arc, cooling through yellow and orange to dull red. */
function hotTail(g: CanvasRenderingContext2D, s: View, life: number, width: number): void {
  g.lineCap = 'round';
  g.lineWidth = width;
  for (let k = 1; k < TAIL; k++) {
    const i = (s.tailHead - k + TAIL) % TAIL;
    const j = (i - 1 + TAIL) % TAIL;
    const age = s.t - s.tailT[i]!;
    if (age > life || s.tailT[j]! <= 0 || s.tailT[j]! > s.tailT[i]!) break;
    if (Math.hypot(s.tailX[i]! - s.tailX[j]!, s.tailY[i]! - s.tailY[j]!) > 12) continue;
    const u = age / life;
    g.globalAlpha = 1 - u;
    g.strokeStyle = u < 0.15 ? '#fff6d8' : u < 0.35 ? '#ffd27a' : u < 0.6 ? '#ff8a3c' : '#a8401c';
    g.beginPath();
    g.moveTo(s.tailX[j]!, s.tailY[j]!);
    g.lineTo(s.tailX[i]!, s.tailY[i]!);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.lineCap = 'butt';
}

/** 'weld': two steel plates and the seam between them; the torch lays a rippled bead, white-hot at the arc. */
function weldLook(fx: Fx): Look {
  const rect = { x: 40, y: 58, w: 300, h: 108 };
  const arcLight = glowSprite('200,228,255');
  const hot = glowSprite('255,120,40');
  let bg: HTMLCanvasElement | null = null;
  let path: Path | null = null;
  let sparkT = 0;
  let lastRipple = 0;
  return {
    rect,
    upright: false,
    meter: 'heat',
    init(pth) {
      path = pth;
      bg = layer((g) => {
        g.fillStyle = '#17120d';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#2a2017';
        g.fillRect(0, 176, W, H - 176);
        const steel = g.createLinearGradient(0, 44, 0, 180);
        steel.addColorStop(0, '#6c737b');
        steel.addColorStop(1, '#3f454c');
        g.fillStyle = steel;
        rrect(g, 22, 46, 336, 132, 4);
        g.fill();
        const r = rng(4);
        g.strokeStyle = 'rgba(255,255,255,0.05)';
        g.lineWidth = 1;
        for (let i = 0; i < 40; i++) {
          const y = 48 + r() * 128;
          g.beginPath();
          g.moveTo(24 + r() * 100, y);
          g.lineTo(140 + r() * 210, y);
          g.stroke();
        }
        // The seam: a groove between the plates' edges.
        g.lineJoin = 'round';
        g.strokeStyle = '#16181b';
        g.lineWidth = 4;
        tracePath(g, pth);
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.14)';
        g.lineWidth = 1;
        g.save();
        g.translate(0, -2.5);
        tracePath(g, pth);
        g.stroke();
        g.restore();
        // Clamps holding the plates.
        g.fillStyle = '#2b2e33';
        for (const x of [60, 320]) {
          g.fillRect(x - 10, 38, 20, 12);
          g.fillRect(x - 10, 174, 20, 12);
        }
      });
    },
    lay(tg, ax, ay, bx, by, grade, s) {
      tg.lineCap = 'round';
      if (grade === BAD) {
        // Thin and spattered.
        tg.strokeStyle = '#7d776d';
        tg.lineWidth = 2;
        tg.beginPath();
        tg.moveTo(ax, ay);
        tg.lineTo(bx, by);
        tg.stroke();
        tg.fillStyle = '#5d5850';
        for (let i = 0; i < 2; i++)
          tg.fillRect(bx + (Math.random() - 0.5) * 12, by + (Math.random() - 0.5) * 12, 1.5, 1.5);
      } else {
        // An even bead, rippled; a blue-straw tint beside it where it ran hot.
        if (s.heat > 0.45) {
          tg.strokeStyle = `rgba(90,110,190,${(0.25 * (s.heat - 0.45)) / 0.55})`;
          tg.lineWidth = 12;
          tg.beginPath();
          tg.moveTo(ax, ay);
          tg.lineTo(bx, by);
          tg.stroke();
        }
        tg.strokeStyle = '#8f897e';
        tg.lineWidth = grade === BEST ? 5.5 : 4.5;
        tg.beginPath();
        tg.moveTo(ax, ay);
        tg.lineTo(bx, by);
        tg.stroke();
        lastRipple += Math.hypot(bx - ax, by - ay);
        if (lastRipple > 3) {
          lastRipple = 0;
          const a = Math.atan2(by - ay, bx - ax);
          tg.strokeStyle = '#c9c2b4';
          tg.lineWidth = 1;
          tg.beginPath();
          tg.arc(bx - Math.cos(a) * 1.5, by - Math.sin(a) * 1.5, 2.3, a - 1.2, a + 1.2);
          tg.stroke();
        }
      }
      tg.lineCap = 'butt';
    },
    draw(g, s, trail) {
      const u = s.end ? clamp(s.outro / OUTRO, 0, 1) : 0;
      if (bg) g.drawImage(bg, 0, 0, W, H);
      if (s.end === 'off' || s.end === 'fast') {
        // The joint gives way: the seam opens along its length.
        g.save();
        g.translate(Math.sin(s.t * 50) * 2 * (1 - u), 0);
        g.strokeStyle = '#0b0c0e';
        g.lineWidth = 4 + 5 * ease(u);
        if (path) tracePath(g, path);
        g.stroke();
        g.drawImage(trail, 0, 0, W, H);
        g.restore();
      } else g.drawImage(trail, 0, 0, W, H);
      glow(g, hot, s.px, s.py, 10 + 22 * s.heat, s.contact ? 0.15 + 0.7 * s.heat : 0);
      hotTail(g, s, 0.9, 5);
      if (s.end === 'slow') {
        // Burnt through: a hole with a glowing rim and smoke.
        g.fillStyle = '#ff8a3c';
        g.beginPath();
        g.arc(s.px, s.py, 7 + u * 2, 0, TAU);
        g.fill();
        g.fillStyle = '#0a0a0b';
        g.beginPath();
        g.arc(s.px, s.py, 5 + u * 2, 0, TAU);
        g.fill();
        if (Math.random() < 0.5) fx.spawn(SMOKE, s.px, s.py, (Math.random() - 0.5) * 10, -24, 1.3);
      }
      if (s.end === 'win' && path) {
        const i = Math.floor(ease(u) * (path.n - 1));
        glow(g, arcLight, path.xs[i]!, path.ys[i]!, 12, 0.8 * (1 - u));
      }
      // The torch: an electrode in its holder, the arc at its tip while it welds.
      const welding = s.active && s.contact && !s.end;
      if (welding) {
        sparkT += s.dt * 45;
        while (sparkT > 1) {
          sparkT--;
          fx.spawn(
            SPARK,
            s.px,
            s.py,
            (Math.random() - 0.5) * 160,
            -60 - Math.random() * 120,
            0.3 + Math.random() * 0.3,
          );
        }
        if (s.heat > 0.6 && Math.random() < s.dt * 12)
          fx.spawn(SMOKE, s.px, s.py - 3, (Math.random() - 0.5) * 8, -20, 1);
      }
      fx.draw(g);
      if (s.end !== 'slow' || u < 0.2) {
        g.lineCap = 'round';
        g.strokeStyle = '#b8bcc2';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(s.px, s.py);
        g.lineTo(s.px + 14, s.py - 22);
        g.stroke();
        g.strokeStyle = '#2b2b2e';
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(s.px + 14, s.py - 22);
        g.lineTo(s.px + 26, s.py - 40);
        g.stroke();
        g.strokeStyle = '#3a3330';
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(s.px + 26, s.py - 40);
        g.quadraticCurveTo(s.px + 34, s.py - 52, s.px + 48, s.py - 56);
        g.stroke();
        g.lineCap = 'butt';
      }
      if (welding) {
        const fl = 0.75 + 0.25 * Math.sin(s.t * 47) * Math.sin(s.t * 31);
        glow(g, arcLight, s.px, s.py, 16 + 8 * fl, 0.95);
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(s.px, s.py, 2.2, 0, TAU);
        g.fill();
      }
    },
  };
}

/** 'lathe': a steel bar spinning between centres; the tool cuts it down to the line, chips curling off. */
function latheLook(fx: Fx): Look {
  const rect = { x: 64, y: 74, w: 270, h: 46 };
  const axis = 132;
  const left = 56;
  const right = 342;
  const R0 = 58;
  const cols = right - left;
  // Lathe columns are accessed only after checking c, or by bounded column loops.
  const cut = new Float32Array(cols).fill(R0);
  const rough = new Uint8Array(cols);
  let bg: HTMLCanvasElement | null = null;
  let target: Path | null = null;
  let metal: CanvasGradient | null = null;
  let chipT = 0;
  let toolOff = 0;
  return {
    rect,
    upright: false,
    meter: 'heat',
    init(pth) {
      target = pth;
      bg = layer((g) => {
        g.fillStyle = '#16130f';
        g.fillRect(0, 0, W, H);
        // The bed, the headstock with its chuck, the tailstock with its centre.
        g.fillStyle = '#34413c';
        g.fillRect(0, 178, W, 10);
        g.fillStyle = '#2a3531';
        g.fillRect(0, 188, W, H - 188);
        g.fillStyle = '#3e4c46';
        rrect(g, 4, 60, 40, 118, 5);
        g.fill();
        g.fillStyle = '#4a4f55';
        g.fillRect(40, axis - 34, 16, 68);
        g.fillStyle = '#2b2f33';
        for (const y of [axis - 30, axis + 22]) g.fillRect(44, y, 14, 8);
        g.fillStyle = '#3e4c46';
        rrect(g, 352, 92, 26, 86, 4);
        g.fill();
        g.fillStyle = '#9aa0a8';
        g.beginPath();
        g.moveTo(352, axis - 8);
        g.lineTo(342, axis);
        g.lineTo(352, axis + 8);
        g.closePath();
        g.fill();
      });
    },
    lay(_tg, _ax, _ay, bx, by, grade) {
      // Cut the bar down to where the tool's tip is, a little either side.
      for (let x = Math.floor(bx - 1.5); x <= Math.ceil(bx + 1.5); x++) {
        const c = x - left;
        if (c < 0 || c >= cols) continue;
        const r = Math.max(4, axis - by + (grade === BAD ? (Math.random() - 0.5) * 3 : 0));
        if (r < cut[c]!) {
          cut[c] = r;
          rough[c] = grade;
        }
      }
    },
    draw(g, s) {
      const u = s.end ? clamp(s.outro / OUTRO, 0, 1) : 0;
      if (bg) g.drawImage(bg, 0, 0, W, H);
      if (!metal) {
        metal = g.createLinearGradient(0, axis - R0, 0, axis + R0);
        metal.addColorStop(0, '#5f666e');
        metal.addColorStop(0.3, '#c9ced6');
        metal.addColorStop(0.55, '#8d949c');
        metal.addColorStop(1, '#3a4046');
      }
      // The bar, as cut so far.
      g.fillStyle = metal;
      g.beginPath();
      g.moveTo(left, axis - cut[0]!);
      for (let c = 1; c < cols; c++) g.lineTo(left + c, axis - cut[c]!);
      for (let c = cols - 1; c >= 0; c--) g.lineTo(left + c, axis + cut[c]!);
      g.closePath();
      g.fill();
      // Fresh-cut metal shines; chattered, it is dull and rough; hot, it turns blue.
      for (let c = 0; c < cols; c++) {
        if (!rough[c]!) continue;
        g.fillStyle =
          rough[c]! === BEST
            ? 'rgba(255,255,255,0.35)'
            : rough[c]! === OK
              ? 'rgba(255,255,255,0.2)'
              : 'rgba(40,30,20,0.4)';
        g.fillRect(left + c, axis - cut[c]!, 1, 3);
      }
      if (s.heat > 0.3) {
        g.fillStyle = `rgba(70,90,200,${0.4 * s.heat})`;
        g.fillRect(s.px - 10, axis - R0, 20, R0 * 2);
      }
      // It spins: marks run over its face.
      g.fillStyle = 'rgba(255,255,255,0.12)';
      for (let k = 0; k < 6; k++) {
        const ph = (s.t * 3.2 + k / 6) % 1;
        const ang = ph * Math.PI;
        for (let x = left + 20; x < right - 10; x += 46) {
          const c = x - left;
          g.fillRect(x, axis - cut[c]! * Math.cos(ang) - 0.5, 10, 1);
        }
      }
      // The line to cut to, and its mirror.
      if (target) {
        g.setLineDash([5, 4]);
        g.strokeStyle = 'rgba(233,196,106,0.85)';
        g.lineWidth = 1.2;
        tracePath(g, target);
        g.stroke();
        g.strokeStyle = 'rgba(233,196,106,0.3)';
        g.save();
        g.translate(0, axis * 2);
        g.scale(1, -1);
        tracePath(g, target);
        g.stroke();
        g.restore();
        g.setLineDash([]);
      }
      // Chips curl off while it cuts.
      const cutting = s.active && s.contact && !s.end;
      if (cutting) {
        chipT += s.dt * (10 + s.speed * 0.4);
        while (chipT > 1) {
          chipT--;
          fx.spawn(CHIP, s.px, s.py, 30 + Math.random() * 60, -60 - Math.random() * 80, 0.6);
        }
        if (s.heat > 0.6 && Math.random() < s.dt * 10) fx.spawn(SMOKE, s.px, s.py, 4, -20, 1);
      }
      fx.draw(g);
      // The tool: a cutting bit on its post, its tip at the pointer (it jumps off when it fails).
      if (s.end && s.end !== 'win') toolOff += s.dt * 120 * (1 - u);
      const tx = s.px + toolOff * 0.3;
      const ty = s.py - toolOff;
      g.fillStyle = '#2b2f33';
      g.fillRect(tx - 9, ty - 52, 18, 30);
      g.fillStyle = '#d0b060';
      g.beginPath();
      g.moveTo(tx - 4, ty - 24);
      g.lineTo(tx + 4, ty - 24);
      g.lineTo(tx + 1, ty);
      g.lineTo(tx - 1, ty);
      g.closePath();
      g.fill();
      if (s.heat > 0.4) {
        g.fillStyle = `rgba(255,120,40,${s.heat})`;
        g.beginPath();
        g.arc(tx, ty - 2, 2.5, 0, TAU);
        g.fill();
      }
      if (s.end === 'win') {
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillRect(left + (right - left) * u - 6, axis - R0, 12, R0 * 2);
      }
    },
  };
}

/** 'cut': a pane of glass on felt with a line marked on it; the cutter's wheel scores it, and it snaps. */
function cutLook(fx: Fx): Look {
  const rect = { x: 40, y: 50, w: 300, h: 124 };
  let bg: HTMLCanvasElement | null = null;
  let path: Path | null = null;
  let skip = 0;
  let crackA = 0;
  return {
    rect,
    upright: false,
    meter: 'pressure',
    init(pth) {
      path = pth;
      bg = layer((g) => {
        g.fillStyle = '#1e2f25';
        g.fillRect(0, 0, W, H);
        g.strokeStyle = 'rgba(255,255,255,0.05)';
        g.lineWidth = 1;
        for (let x = 10; x < W; x += 24) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, H);
          g.stroke();
        }
        for (let y = 10; y < H; y += 24) {
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(W, y);
          g.stroke();
        }
        // The pane: pale, see-through, a bright edge and a streak of light.
        g.fillStyle = 'rgba(175,228,232,0.2)';
        rrect(g, 26, 42, 328, 140, 3);
        g.fill();
        g.strokeStyle = 'rgba(210,250,250,0.55)';
        g.lineWidth = 1.5;
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.07)';
        g.beginPath();
        g.moveTo(60, 42);
        g.lineTo(110, 42);
        g.lineTo(50, 182);
        g.lineTo(0 + 26, 182);
        g.closePath();
        g.fill();
        // The line to score along.
        g.setLineDash([4, 4]);
        g.strokeStyle = 'rgba(240,250,255,0.5)';
        g.lineWidth = 1;
        tracePath(g, pth);
        g.stroke();
        g.setLineDash([]);
      });
    },
    lay(tg, ax, ay, bx, by, grade, s) {
      if (grade === BAD && s.speed > s.fast) {
        // Too fast: the wheel skips and leaves gaps.
        skip += Math.hypot(bx - ax, by - ay);
        if (skip % 8 > 4) return;
      }
      tg.strokeStyle =
        grade === BEST
          ? 'rgba(255,255,255,0.95)'
          : grade === OK
            ? 'rgba(235,245,250,0.8)'
            : 'rgba(220,235,245,0.6)';
      tg.lineWidth = grade === BEST ? 1.2 : 1.6;
      tg.beginPath();
      tg.moveTo(ax, ay);
      tg.lineTo(bx, by);
      tg.stroke();
      if (s.heat > 0.4 && Math.random() < s.heat) {
        // Pressed too hard: the score crushes into flakes.
        tg.fillStyle = 'rgba(255,255,255,0.7)';
        tg.fillRect(bx + (Math.random() - 0.5) * 6, by + (Math.random() - 0.5) * 6, 1.5, 1.5);
      }
    },
    draw(g, s, trail) {
      const u = s.end ? clamp(s.outro / OUTRO, 0, 1) : 0;
      if (bg) g.drawImage(bg, 0, 0, W, H);
      g.drawImage(trail, 0, 0, W, H);
      if (s.end === 'win' && path) {
        // It snaps clean along the score.
        g.strokeStyle = '#1e2f25';
        g.lineWidth = 3 * ease(u);
        tracePath(g, path);
        g.stroke();
        g.strokeStyle = `rgba(255,255,255,${0.8 * (1 - u)})`;
        g.lineWidth = 1;
        g.stroke();
      }
      if (s.end && s.end !== 'win') {
        // It snaps the wrong way: a crack runs off to the edge.
        if (!crackA) crackA = Math.random() * TAU;
        const len = 220 * ease(clamp(u * 2, 0, 1));
        g.strokeStyle = 'rgba(240,250,255,0.9)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(s.px, s.py);
        let x = s.px;
        let y = s.py;
        for (let k = 1; k <= 8; k++) {
          const a = crackA + Math.sin(k * 2.7) * 0.5;
          x += Math.cos(a) * (len / 8);
          y += Math.sin(a) * (len / 8);
          g.lineTo(x, y);
        }
        g.stroke();
        if (u < 0.1)
          for (let i = 0; i < 4; i++)
            fx.spawn(FLAKE, s.px, s.py, (Math.random() - 0.5) * 120, -40 - Math.random() * 60, 0.6);
      }
      if (s.active && s.contact && s.heat > 0.5 && Math.random() < s.dt * 20)
        fx.spawn(FLAKE, s.px, s.py, (Math.random() - 0.5) * 60, -30 - Math.random() * 30, 0.5);
      fx.draw(g);
      // The cutter: a small wheel in its fork, a brass handle reaching up and away.
      g.lineCap = 'round';
      g.strokeStyle = '#7a5a2a';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(s.px + 6, s.py - 10);
      g.lineTo(s.px + 22, s.py - 40);
      g.stroke();
      g.strokeStyle = '#b8bcc2';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(s.px, s.py);
      g.lineTo(s.px + 7, s.py - 12);
      g.stroke();
      g.lineCap = 'butt';
      g.fillStyle = '#e4e8ec';
      g.beginPath();
      g.arc(s.px, s.py, 3.2, 0, TAU);
      g.fill();
      g.fillStyle = '#8a9099';
      g.beginPath();
      g.arc(s.px, s.py, 1.2, 0, TAU);
      g.fill();
      g.fillStyle = '#c9a050';
      g.beginPath();
      g.arc(s.px + 23, s.py - 42, 4, 0, TAU);
      g.fill();
    },
  };
}

/** 'drill': a rover on a grey airless world feeds its drill down through dust and rock to a vein. */
function drillLook(fx: Fx): Look {
  const rect = { x: 150, y: 86, w: 80, h: 86 };
  const top = 86;
  const red = glowSprite('255,90,40');
  const lamp = glowSprite('120,200,255');
  let bg: HTMLCanvasElement | null = null;
  let head = 190;
  let dustT = 0;
  let pile = 0;
  return {
    rect,
    upright: true,
    meter: 'heat',
    init(pth) {
      head = pth.xs[0]!;
      bg = layer((g) => {
        g.fillStyle = '#040508';
        g.fillRect(0, 0, W, top);
        stars(g, top - 16, 9);
        // Far grey hills and a base on them.
        g.fillStyle = '#2c3036';
        g.beginPath();
        g.moveTo(0, top);
        for (let x = 0; x <= W; x += 20)
          g.lineTo(x, top - 12 - Math.sin(x * 0.03) * 6 - Math.sin(x * 0.11) * 3);
        g.lineTo(W, top);
        g.closePath();
        g.fill();
        base(g, 300, top - 13, 0.8);
        // The ground in section: grey dust, darker rock, and the vein with its glints.
        const ground = g.createLinearGradient(0, top, 0, H);
        ground.addColorStop(0, '#8b9096');
        ground.addColorStop(0.2, '#6e737a');
        ground.addColorStop(0.24, '#4f545b');
        ground.addColorStop(0.6, '#43474e');
        ground.addColorStop(0.64, '#2f3540');
        ground.addColorStop(1, '#232833');
        g.fillStyle = ground;
        g.fillRect(0, top, W, H - top);
        const r = rng(3);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        for (let i = 0; i < 26; i++) {
          g.beginPath();
          g.ellipse(r() * W, top + 24 + r() * 40, 6 + r() * 12, 3 + r() * 5, 0, 0, TAU);
          g.fill();
        }
        for (let i = 0; i < 40; i++) {
          g.fillStyle = r() < 0.5 ? '#9fe8ff' : '#e8f6ff';
          g.globalAlpha = 0.5 + r() * 0.5;
          g.fillRect(r() * W, top + 58 + r() * 70, 1.5, 1.5);
        }
        g.globalAlpha = 1;
        // The rover: body, wheels, mast, and its arm out to the drill head.
        g.fillStyle = '#3a3e44';
        for (const x of [38, 70, 102]) {
          g.beginPath();
          g.arc(x, top - 6, 7, 0, TAU);
          g.fill();
        }
        g.fillStyle = '#d9dde3';
        rrect(g, 28, top - 30, 88, 18, 4);
        g.fill();
        g.fillStyle = '#c9a050';
        g.fillRect(28, top - 16, 88, 3);
        g.fillStyle = '#9aa2ac';
        g.fillRect(44, top - 42, 4, 12);
        g.fillStyle = '#d9dde3';
        rrect(g, 36, top - 49, 20, 9, 3);
        g.fill();
        g.fillStyle = '#2a3442';
        g.fillRect(50, top - 47, 4, 4);
        g.fillStyle = '#4a7ac8';
        g.fillRect(58, top - 40, 34, 9);
        g.strokeStyle = '#b8bec6';
        g.lineWidth = 4;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(112, top - 24);
        g.lineTo(150, top - 48);
        g.lineTo(head - 4, top - 40);
        g.stroke();
        g.lineCap = 'butt';
        g.fillStyle = '#c9ced6';
        rrect(g, head - 9, top - 46, 18, 22, 3);
        g.fill();
        g.fillStyle = '#6a7078';
        g.fillRect(head - 9, top - 30, 18, 3);
      });
    },
    lay(tg, ax, ay, bx, by, grade) {
      // The bore: darker where it was cut clean, ragged where it was forced.
      tg.strokeStyle = '#121418';
      tg.lineWidth = grade === BAD ? 10 : 8;
      tg.lineCap = 'round';
      tg.beginPath();
      tg.moveTo(ax, ay);
      tg.lineTo(bx, by);
      tg.stroke();
      if (grade === BAD) {
        tg.fillStyle = '#121418';
        tg.fillRect(bx + (Math.random() < 0.5 ? -7 : 5), by - 2, 3, 3);
      }
      tg.lineCap = 'butt';
    },
    draw(g, s, trail) {
      const u = s.end ? clamp(s.outro / OUTRO, 0, 1) : 0;
      if (bg) g.drawImage(bg, 0, 0, W, H);
      // The base's lamp blinks.
      glow(g, lamp, 300 + 27, top - 31, 6, 0.5 + 0.5 * Math.sin(s.t * 3));
      g.drawImage(trail, 0, 0, W, H);
      // Cuttings come up and pile at the mouth of the hole.
      pile = lerp(pile, s.progress, Math.min(1, s.dt * 2));
      g.fillStyle = '#9a9fa6';
      g.beginPath();
      g.ellipse(head - 12, top, 9 * pile + 1, 4 * pile + 0.5, 0, Math.PI, 0);
      g.ellipse(head + 12, top, 9 * pile + 1, 4 * pile + 0.5, 0, Math.PI, 0);
      g.fill();
      const boring = s.active && s.contact && !s.end;
      if (boring) {
        dustT += s.dt * 16;
        while (dustT > 1) {
          dustT--;
          fx.spawn(
            GRIT,
            head + (Math.random() - 0.5) * 6,
            top - 2,
            (Math.random() - 0.5) * 90,
            -40 - Math.random() * 50,
            1.2,
          );
        }
      }
      // The bit: from the head down to the tip, its flutes turning; it snaps if forced.
      const snapped = s.end === 'fast' || s.end === 'off';
      const tipY = snapped
        ? lerp(s.py, top - 20, ease(u))
        : s.end === 'win'
          ? lerp(s.py, top - 20, ease(u))
          : s.py;
      const tipX = snapped
        ? lerp(s.px, head, ease(u))
        : s.end === 'win'
          ? lerp(s.px, head, ease(u))
          : s.started
            ? s.px
            : head;
      const tY = s.started || s.end ? tipY : top - 24;
      g.strokeStyle = '#8a9099';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(head, top - 24);
      g.lineTo(tipX, tY);
      g.stroke();
      g.strokeStyle = '#4a4f55';
      g.lineWidth = 1.5;
      const len = Math.hypot(tipX - head, tY - (top - 24));
      const spin = (s.t * (boring ? 40 : 4)) % 6;
      g.beginPath();
      for (let d = spin; d < len; d += 6) {
        const k = d / Math.max(1, len);
        const x = lerp(head, tipX, k);
        const y = lerp(top - 24, tY, k);
        g.moveTo(x - 2.5, y - 1.5);
        g.lineTo(x + 2.5, y + 1.5);
      }
      g.stroke();
      if (snapped) {
        // The broken end stays in the hole, askew.
        g.strokeStyle = '#8a9099';
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(s.px - 2, s.py - 18);
        g.lineTo(s.px + 2, s.py);
        g.stroke();
        if (u < 0.15)
          for (let i = 0; i < 6; i++)
            fx.spawn(SPARK, s.px, s.py - 18, (Math.random() - 0.5) * 140, -60 - Math.random() * 80, 0.4);
      }
      glow(g, red, s.px, s.py, 8 + 14 * s.heat, s.started && !snapped ? s.heat * 0.9 : 0);
      if (s.end === 'slow' && Math.random() < 0.4)
        fx.spawn(SMOKE, head, top - 4, (Math.random() - 0.5) * 10, -24, 1.2);
      if (s.end === 'win') {
        // A core sample rises out of the hole: grey dust, rock, then the glinting vein.
        const cy = lerp(top + 66, top - 22, ease(clamp(u * 1.4 - 0.2, 0, 1)));
        const cx = head - 4;
        g.save();
        g.beginPath();
        g.rect(0, 0, W, top + 70);
        g.clip();
        g.fillStyle = '#7c8188';
        g.fillRect(cx, cy, 8, 20);
        g.fillStyle = '#4a4f57';
        g.fillRect(cx, cy + 20, 8, 22);
        g.fillStyle = '#2f3644';
        g.fillRect(cx, cy + 42, 8, 22);
        g.fillStyle = '#bff0ff';
        g.fillRect(cx + 2, cy + 48, 2, 2);
        g.fillRect(cx + 5, cy + 56, 2, 2);
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.lineWidth = 1;
        g.strokeRect(cx + 0.5, cy + 0.5, 7, 63);
        g.restore();
      }
      fx.draw(g);
    },
  };
}

/** 'land': a lander comes down on its engine over a grey airless world, onto a pad by the base. */
function landLook(fx: Fx): Look {
  const rect = { x: 50, y: 54, w: 290, h: 98 };
  const ground = 160;
  const flame = glowSprite('150,200,255');
  const lamp = glowSprite('120,255,160');
  const warn = glowSprite('255,90,60');
  let bg: HTMLCanvasElement | null = null;
  let padX = 0;
  let padY = ground;
  let dustT = 0;
  let fall = 0;
  let fallV = 0;
  return {
    rect,
    upright: true,
    meter: 'fuel',
    init(pth) {
      padX = pth.xs[pth.n - 1]!;
      padY = pth.ys[pth.n - 1]! + 8;
      bg = layer((g) => {
        g.fillStyle = '#030408';
        g.fillRect(0, 0, W, H);
        stars(g, ground, 21);
        // Home, small and blue in the black sky.
        g.fillStyle = '#3f86c8';
        g.beginPath();
        g.arc(318, 52, 9, 0, TAU);
        g.fill();
        g.fillStyle = '#6fae5a';
        g.beginPath();
        g.ellipse(315, 50, 4, 2.5, 0.4, 0, TAU);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.fillRect(312, 56, 9, 1.5);
        // The grey ground, its craters, the base and the pad.
        g.fillStyle = '#5a5f66';
        g.beginPath();
        g.moveTo(0, ground + 6);
        for (let x = 0; x <= W + 16; x += 16)
          g.lineTo(x, ground + 2 - Math.sin(x * 0.04) * 3 - Math.sin(x * 0.13) * 1.5);
        g.lineTo(W + 16, H);
        g.lineTo(0, H);
        g.closePath();
        g.fill();
        const r = rng(13);
        for (let i = 0; i < 9; i++) {
          const x = r() * W;
          const y = ground + 12 + r() * 30;
          const w = 8 + r() * 14;
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.beginPath();
          g.ellipse(x, y, w, w * 0.3, 0, 0, TAU);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.08)';
          g.beginPath();
          g.ellipse(x, y + 1.5, w * 0.8, w * 0.2, 0, 0, Math.PI);
          g.fill();
        }
        base(g, 60, ground + 4, 1.1);
        g.fillStyle = '#7d838b';
        g.beginPath();
        g.ellipse(padX, padY, 30, 6, 0, 0, TAU);
        g.fill();
        g.strokeStyle = '#e9c46a';
        g.lineWidth = 1.2;
        g.beginPath();
        g.ellipse(padX, padY, 22, 4.2, 0, 0, TAU);
        g.stroke();
        g.beginPath();
        g.moveTo(padX - 8, padY);
        g.lineTo(padX + 8, padY);
        g.stroke();
      });
    },
    lay(tg, ax, ay, bx, by) {
      // A faint wisp of exhaust where it has been.
      tg.fillStyle = 'rgba(160,200,255,0.25)';
      tg.fillRect((ax + bx) / 2 - 0.6, (ay + by) / 2 - 0.6, 1.2, 1.2);
    },
    draw(g, s, trail) {
      const u = s.end ? clamp(s.outro / OUTRO, 0, 1) : 0;
      if (bg) g.drawImage(bg, 0, 0, W, H);
      g.drawImage(trail, 0, 0, W, H);
      // The pad's lamps: green once it's down, a calm blink before.
      glow(
        g,
        s.end === 'win' ? lamp : s.end ? warn : lamp,
        padX - 26,
        padY - 2,
        6,
        s.end === 'win' ? 1 : 0.4 + 0.4 * Math.sin(s.t * 4),
      );
      glow(
        g,
        s.end === 'win' ? lamp : s.end ? warn : lamp,
        padX + 26,
        padY - 2,
        6,
        s.end === 'win' ? 1 : 0.4 + 0.4 * Math.sin(s.t * 4 + 1),
      );
      // Where it is: at the pointer while flown, then down, toppled or dropped.
      let x = s.started ? s.px : s.path.xs[0]!;
      let y = s.started ? s.py : s.path.ys[0]!;
      let tilt = clamp((s.speed / Math.max(1, s.fast)) * 0.25, 0, 0.3);
      let thrust = s.active && s.started && !s.end ? clamp(1.1 - s.speed / Math.max(1, s.fast), 0.25, 1) : 0;
      if (s.end === 'win') {
        y = lerp(y, padY - 12, ease(u));
        x = lerp(x, padX, ease(u));
        tilt = 0;
      } else if (s.end) {
        // Dropped (no fuel) or slammed: down, and over on its side.
        fallV += 420 * s.dt;
        fall = Math.min(ground - 12 - y, fall + fallV * s.dt);
        y += Math.max(0, fall);
        const down = y >= ground - 13;
        tilt = down ? lerp(0, 1.35, ease(clamp(u * 2 - 0.4, 0, 1))) : tilt;
        thrust = s.end === 'slow' ? (Math.random() < 0.15 * (1 - u) ? 0.4 : 0) : 0;
        if (down && u < 0.6 && Math.random() < 0.6)
          fx.spawn(
            GRIT,
            x + (Math.random() - 0.5) * 30,
            ground,
            (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * 160),
            -20 - Math.random() * 50,
            1,
          );
      }
      // Dust blown off the ground under the engine.
      if (thrust > 0 && ground - y < 46) {
        dustT += s.dt * 30 * thrust;
        while (dustT > 1) {
          dustT--;
          const side = Math.random() < 0.5 ? -1 : 1;
          fx.spawn(
            GRIT,
            x + side * 4,
            ground - 1,
            side * (140 + Math.random() * 160),
            -8 - Math.random() * 22,
            1,
          );
        }
      }
      if (s.end === 'win' && u > 0.5 && u < 0.6)
        for (let i = 0; i < 4; i++)
          fx.spawn(
            GRIT,
            x + (Math.random() - 0.5) * 30,
            padY,
            (Math.random() < 0.5 ? -1 : 1) * (100 + Math.random() * 120),
            -16,
            1,
          );
      fx.draw(g);
      g.save();
      g.translate(x, y);
      g.rotate(tilt);
      // The flame under the engine bell.
      if (thrust > 0) {
        const fl = 0.85 + 0.15 * Math.sin(s.t * 40);
        glow(g, flame, 0, 12 + 8 * thrust, 8 + 10 * thrust, 0.9);
        g.fillStyle = 'rgba(230,245,255,0.9)';
        g.beginPath();
        g.moveTo(-3, 8);
        g.lineTo(3, 8);
        g.lineTo(0, 8 + 22 * thrust * fl);
        g.closePath();
        g.fill();
      }
      // Legs and footpads, the engine bell, the body with its gold foil and a window.
      const squash = s.end === 'win' ? 1.5 * Math.sin(clamp((u - 0.5) * 3, 0, 1) * Math.PI) : 0;
      g.strokeStyle = '#9aa2ac';
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(-8, 2);
      g.lineTo(-15, 12 - squash);
      g.moveTo(8, 2);
      g.lineTo(15, 12 - squash);
      g.stroke();
      g.fillStyle = '#c9ced6';
      g.fillRect(-18, 11 - squash, 6, 2);
      g.fillRect(12, 11 - squash, 6, 2);
      g.fillStyle = '#5a5f66';
      g.beginPath();
      g.moveTo(-3, 3);
      g.lineTo(3, 3);
      g.lineTo(5, 9);
      g.lineTo(-5, 9);
      g.closePath();
      g.fill();
      g.fillStyle = '#c9a050';
      g.fillRect(-11, -2, 22, 6);
      g.fillStyle = '#e4e7ec';
      g.beginPath();
      g.moveTo(-10, -2);
      g.lineTo(-7, -13);
      g.lineTo(7, -13);
      g.lineTo(10, -2);
      g.closePath();
      g.fill();
      g.fillStyle = '#4a7ac8';
      g.fillRect(-3, -10, 6, 4);
      g.restore();
    },
  };
}

/** 'generic': a chip under a lens, a fine wire drawn from its pad to its leg — or any line on a board. */
function plainLook(fx: Fx): Look {
  const rect = { x: 70, y: 70, w: 240, h: 80 };
  let bg: HTMLCanvasElement | null = null;
  return {
    rect,
    upright: false,
    meter: 'heat',
    init(pth) {
      bg = layer((g) => {
        g.fillStyle = '#121a16';
        g.fillRect(0, 0, W, H);
        // The board, the chip and its legs, a pad at each end of the path.
        g.fillStyle = '#1f4a34';
        rrect(g, 24, 44, 332, 138, 6);
        g.fill();
        g.fillStyle = '#16181b';
        rrect(g, 46, 92, 70, 56, 4);
        g.fill();
        g.fillStyle = '#c9a050';
        for (let i = 0; i < 5; i++) g.fillRect(52 + i * 13, 96, 6, 6);
        g.fillStyle = '#b9bec5';
        for (let i = 0; i < 6; i++) g.fillRect(280 + (i % 2) * 22, 74 + i * 14, 40, 6);
        const x0 = pth.xs[0]!;
        const y0 = pth.ys[0]!;
        const x1 = pth.xs[pth.n - 1]!;
        const y1 = pth.ys[pth.n - 1]!;
        g.fillStyle = '#e9c46a';
        g.fillRect(x0 - 4, y0 - 4, 8, 8);
        g.fillRect(x1 - 4, y1 - 4, 8, 8);
        g.setLineDash([3, 4]);
        g.strokeStyle = 'rgba(233,196,106,0.6)';
        g.lineWidth = 1;
        tracePath(g, pth);
        g.stroke();
        g.setLineDash([]);
      });
    },
    lay(tg, ax, ay, bx, by, grade) {
      tg.strokeStyle = grade === BEST ? '#ffe08a' : grade === OK ? '#d8b25a' : '#a07a3a';
      tg.lineWidth = grade === BAD ? 2.2 : 1.4;
      tg.beginPath();
      tg.moveTo(ax, ay);
      tg.lineTo(bx, by);
      tg.stroke();
    },
    draw(g, s, trail) {
      const u = s.end ? clamp(s.outro / OUTRO, 0, 1) : 0;
      if (bg) g.drawImage(bg, 0, 0, W, H);
      g.drawImage(trail, 0, 0, W, H);
      if (s.end === 'slow') {
        g.fillStyle = '#d8b25a';
        g.beginPath();
        g.arc(s.px, s.py, 4 + 2 * u, 0, TAU);
        g.fill();
      }
      if (s.end && s.end !== 'win' && u < 0.1)
        for (let i = 0; i < 3; i++) fx.spawn(SPARK, s.px, s.py, (Math.random() - 0.5) * 80, -40, 0.4);
      fx.draw(g);
      // The bonding tool: a fine needle on a holder.
      g.strokeStyle = '#d0d4da';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(s.px, s.py);
      g.lineTo(s.px + 6, s.py - 24);
      g.stroke();
      g.fillStyle = '#5a6068';
      g.fillRect(s.px + 3, s.py - 46, 8, 22);
      if (s.active && s.contact) {
        g.fillStyle = '#fff6d8';
        g.beginPath();
        g.arc(s.px, s.py, 1.6, 0, TAU);
        g.fill();
      }
    },
  };
}

// ---- The kind -----------------------------------------------------------------------------------

export const steady: MinigameDef<SteadyParams> = {
  kind: 'steady',
  name: 'Steady hand',
  demo: demoFromUrl(),
  create: (host, p) => {
    const end = finisher(host);
    const fx = new Fx();
    const look =
      p.style === 'lathe'
        ? latheLook(fx)
        : p.style === 'cut'
          ? cutLook(fx)
          : p.style === 'drill'
            ? drillLook(fx)
            : p.style === 'land'
              ? landLook(fx)
              : p.style === 'generic'
                ? plainLook(fx)
                : weldLook(fx);
    const path = resample(corners(p, look.rect, look.upright));
    const tol = Math.max(2, p.tolerance);
    const fast = path.len / Math.max(0.5, p.pace[0]);
    const slow = path.len / Math.max(p.pace[0] + 0.5, p.pace[1]);
    const ideal = (fast + slow) / 2;
    const burn = Math.max(0.3, p.burn ?? 1.6);
    const limit = Math.min(40, p.limit ?? 40);
    const softEnd = clamp(p.softEnd ?? 0, 0, 1);
    const fuel = p.style === 'land';
    const meter = (p.words.meter ?? look.meter).toUpperCase();
    look.init(path);
    const trail = layer(() => {});
    const tg = trail.getContext('2d')!;

    let keyHold = false;
    const c = canvasIn(host, W, H);
    const g = c.g;
    const key = (e: KeyboardEvent, down: boolean): void => {
      if (e.code !== 'Space' && e.code !== 'KeyF') return;
      e.preventDefault();
      if (down) e.stopPropagation();
      keyHold = down;
    };
    const kd = (e: KeyboardEvent): void => key(e, true);
    const ku = (e: KeyboardEvent): void => key(e, false);
    const blur = (): void => {
      keyHold = false;
    };
    window.addEventListener('keydown', kd, true);
    window.addEventListener('keyup', ku, true);
    window.addEventListener('blur', blur);

    const s: View = {
      t: 0,
      dt: 0,
      path,
      started: false,
      active: false,
      contact: false,
      px: path.xs[0]!,
      py: path.ys[0]!,
      d: 0,
      idx: 0,
      progress: 0,
      speed: 0,
      slow,
      fast,
      heat: 0,
      cells: new Uint8Array(CELLS),
      grade: OK,
      end: '',
      outro: 0,
      tailX: new Float32Array(TAIL),
      tailY: new Float32Array(TAIL),
      tailT: new Float32Array(TAIL),
      tailHead: 0,
    };
    // For tests and the playground: the run as it stands (read it, don't change it).
    (c.canvas as unknown as { mg: View }).mg = s;
    /** How far along the path the tool has got, in px. */
    let reach = 0;
    let lastX = 0;
    let lastY = 0;
    let laying = false;
    let wasActive = false;
    let stops = 0;
    let bad = 0;
    let offBad = 0;
    let fastBad = 0;
    let quality: Quality = 0;
    let why = '';

    const stop = (how: 'win' | 'fast' | 'slow' | 'off', q: Quality, line: string): void => {
      s.end = how;
      s.outro = 0;
      quality = q;
      why = line;
    };
    const fail = (): void => {
      stop(offBad >= fastBad ? 'off' : 'fast', 0, offBad >= fastBad ? p.words.off : p.words.fast);
    };

    const cellOf = (i: number): number =>
      Math.min(CELLS - 1, Math.floor((i / Math.max(1, path.n - 1)) * CELLS));

    const step = (dt: number): void => {
      const ptr = c.pointer;
      s.px = ptr.x;
      s.py = ptr.y;
      s.active = ptr.down || keyHold;
      if (!s.started) {
        if (s.active && Math.hypot(ptr.x - path.xs[0]!, ptr.y - path.ys[0]!) <= tol * 2.5 + 8)
          s.started = true;
        else {
          s.contact = false;
          return;
        }
      }
      // Where along the path the tool is: the nearest point a little behind or ahead.
      let best = s.idx;
      let bestD = Infinity;
      const lo = Math.max(0, s.idx - 6);
      const hi = Math.min(path.n - 1, s.idx + 16);
      for (let j = lo; j <= hi; j++) {
        const d = (path.xs[j]! - ptr.x) ** 2 + (path.ys[j]! - ptr.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      // Exactly how far along: onto the piece of path either side of that point.
      let along = best * STEP;
      for (let j = Math.max(0, best - 1); j < Math.min(path.n - 1, best + 1); j++) {
        const ex = path.xs[j + 1]! - path.xs[j]!;
        const ey = path.ys[j + 1]! - path.ys[j]!;
        const l2 = ex * ex + ey * ey || 1;
        const u = clamp(((ptr.x - path.xs[j]!) * ex + (ptr.y - path.ys[j]!) * ey) / l2, 0, 1);
        const d = (path.xs[j]! + ex * u - ptr.x) ** 2 + (path.ys[j]! + ey * u - ptr.y) ** 2;
        if (d <= bestD + 1e-6) {
          bestD = d;
          along = (j + u) * STEP;
        }
      }
      s.d = Math.sqrt(bestD);
      s.contact = s.active && s.d <= tol * 2.5;
      let ds = 0;
      if (s.contact && along > reach) {
        ds = along - reach;
        reach = along;
      }
      s.speed += (ds / Math.max(1e-3, dt) - s.speed) * (1 - Math.exp(-dt / 0.3));
      best = Math.min(path.n - 1, Math.floor(reach / STEP + 1e-6));
      // What is being laid now: off the line, rushed, or good — perfect close in at a fair pace.
      s.grade = s.d > tol || s.speed > fast ? BAD : s.d <= tol / 2 && s.speed >= slow ? BEST : OK;
      if (best > s.idx) {
        for (let k = cellOf(s.idx); k <= cellOf(best); k++) {
          if (s.cells[k]!) continue;
          s.cells[k] = s.grade;
          if (s.grade === BAD) {
            bad++;
            if (s.d > tol) offBad++;
            else fastBad++;
          }
        }
        s.idx = best;
      }
      s.progress = clamp(reach / path.len, 0, 1);
      // Dawdling builds heat (landing, burns fuel); moving on lets it cool.
      if (fuel)
        s.heat +=
          dt *
          (1 / (p.pace[1] * 1.25) + (s.contact && s.speed < slow ? (1 - s.speed / slow) / (burn * 2) : 0));
      else if (s.contact && s.speed < slow) s.heat += (dt * (1 - s.speed / slow)) / burn;
      else s.heat -= dt * (s.active ? 0.45 : 0.8);
      s.heat = clamp(s.heat, 0, 1);
      // Lay the trail where the tool is.
      if (s.contact) {
        if (!laying) {
          lastX = ptr.x;
          lastY = ptr.y;
          laying = true;
        } else if (Math.hypot(ptr.x - lastX, ptr.y - lastY) >= 1.5) {
          look.lay(tg, lastX, lastY, ptr.x, ptr.y, s.grade, s);
          s.tailHead = (s.tailHead + 1) % TAIL;
          s.tailX[s.tailHead] = ptr.x;
          s.tailY[s.tailHead] = ptr.y;
          s.tailT[s.tailHead] = s.t;
          lastX = ptr.x;
          lastY = ptr.y;
        }
      } else laying = false;
      // Letting go part way is a stop (a perfect needs one steady pass).
      if (wasActive && !s.active && s.idx < path.n - 1) stops++;
      wasActive = s.active;
      // How it ends.
      if (s.heat >= 1) return stop('slow', 0, p.words.slow);
      if (bad > CELLS * 0.3) return fail();
      if (softEnd > 0 && s.progress >= 1 - softEnd && s.contact && s.speed > fast)
        return stop('fast', 0, p.words.fast);
      if (s.idx >= path.n - 1 || reach >= path.len - 0.5) {
        let perfect = 0;
        for (let k = 0; k < CELLS; k++) {
          if (!s.cells[k]!) s.cells[k] = s.grade;
          if (s.cells[k]! === BEST) perfect++;
        }
        const best2 = bad <= 1 && perfect >= CELLS * 0.7 && stops === 0;
        return stop('win', best2 ? 2 : 1, best2 ? p.words.perfect : p.words.good);
      }
      if (s.t >= limit) stop('slow', 0, p.words.slow);
    };

    // The ghost: the tool going along the path at the ideal pace, to show the way and the speed.
    let ghostFrom = -1;
    const units = p.speed;

    const overlay = (): void => {
      // The speed gauge: too slow, the fair pace in gold, too fast.
      g.fillStyle = 'rgba(8,6,4,0.66)';
      rrect(g, 6, 5, 136, 32, 6);
      g.fill();
      text(g, 'SPEED', 13, 13, { size: 8.5, color: PAL.dim, align: 'left' });
      const shown = units
        ? `${((s.speed / ideal) * units.at).toFixed(units.at < 10 ? 1 : 0)} ${units.unit}`
        : '';
      text(g, shown, 135, 13, {
        size: 9,
        bold: true,
        color: s.speed > fast ? '#ff8a6a' : s.speed >= slow ? PAL.gold : PAL.dim,
        align: 'right',
      });
      const gx = 13;
      const gw = 122;
      const top = fast * 1.4;
      g.fillStyle = '#2a3442';
      g.fillRect(gx, 23, (gw * slow) / top, 6);
      g.fillStyle = 'rgba(233,196,106,0.75)';
      g.fillRect(gx + (gw * slow) / top, 23, (gw * (fast - slow)) / top, 6);
      g.fillStyle = '#6a2a22';
      g.fillRect(gx + (gw * fast) / top, 23, gw - (gw * fast) / top, 6);
      const nx = gx + gw * clamp(s.speed / top, 0, 1);
      g.fillStyle = '#fff6dc';
      g.fillRect(nx - 1, 20, 2, 12);
      // The meter that fills when too slow (fuel shows what is left).
      g.fillStyle = 'rgba(8,6,4,0.66)';
      rrect(g, W - 112, 5, 106, 32, 6);
      g.fill();
      text(g, meter, W - 105, 13, { size: 8.5, color: PAL.dim, align: 'left' });
      const lvl = fuel ? 1 - s.heat : s.heat;
      const danger = s.heat > 0.7;
      g.fillStyle = '#2a2016';
      g.fillRect(W - 105, 23, 92, 6);
      g.strokeStyle = '#5a4a30';
      g.lineWidth = 1;
      g.strokeRect(W - 105.5, 22.5, 93, 7);
      g.fillStyle = fuel
        ? lvl < 0.25
          ? '#ff6a5a'
          : '#6aa8ff'
        : s.heat > 0.7
          ? '#ff6a3c'
          : s.heat > 0.4
            ? '#ffb347'
            : '#c9a050';
      g.globalAlpha = danger ? 0.6 + 0.4 * Math.sin(s.t * 16) : 1;
      g.fillRect(W - 105, 23, 92 * lvl, 6);
      g.globalAlpha = 1;
      // The tape: each piece of the path as it was laid.
      g.fillStyle = 'rgba(8,6,4,0.62)';
      g.fillRect(0, 184, W, H - 184);
      const x0 = 14;
      const tw = W - 28;
      g.fillStyle = '#251d14';
      rrect(g, x0, 189, tw, 7, 3.5);
      g.fill();
      const cw = tw / CELLS;
      for (let i = 0; i < CELLS; i++) {
        const q = s.cells[i]!;
        if (!q) continue;
        g.fillStyle = q === BEST ? '#ffd36a' : q === OK ? '#9c7d3a' : '#c0503e';
        g.fillRect(x0 + i * cw, 189, cw + 0.4, 7);
      }
      g.strokeStyle = '#5a4a30';
      g.lineWidth = 1;
      rrect(g, x0, 189, tw, 7, 3.5);
      g.stroke();
      text(g, `${p.words.act} · or Space / F`, W / 2, 208, { size: 10, color: PAL.dim });
      if (s.end) return;
      // Where to start (and where to come back to after slipping off).
      const resume = s.started && !s.contact && s.active;
      if (!s.started || resume || !s.active) {
        const i = s.started ? s.idx : 0;
        const k = (s.t * 1.4) % 1;
        g.strokeStyle = PAL.gold;
        g.globalAlpha = 1 - k;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(path.xs[i]!, path.ys[i]!, 5 + k * 12, 0, TAU);
        g.stroke();
        g.globalAlpha = 1;
        if (!s.started || resume)
          text(
            g,
            s.started ? 'back to the line' : 'start here',
            path.xs[i]!,
            path.ys[i]! + (path.ys[i]! < 64 ? 24 : -20),
            { size: 10, bold: true, color: PAL.gold },
          );
      }
      // The first time: a ghost tool shows the way at the right pace (from the start, once you start).
      if (host.guided) {
        if (s.started && ghostFrom < 0) ghostFrom = s.t;
        const along = s.started ? ideal * (s.t - ghostFrom) : ideal * (s.t % (path.len / ideal + 1));
        const gi = Math.min(path.n - 1, Math.floor(along / STEP));
        if (!s.started) {
          g.strokeStyle = 'rgba(233,196,106,0.35)';
          g.lineWidth = 3;
          tracePath(g, path, 0, gi);
          g.stroke();
        }
        g.globalAlpha = 0.55;
        g.fillStyle = PAL.gold;
        g.beginPath();
        g.arc(path.xs[gi]!, path.ys[gi]!, 4, 0, TAU);
        g.fill();
        g.globalAlpha = 1;
        if (s.started) {
          if (s.speed > fast) text(g, 'slower', s.px, s.py + 22, { size: 10, bold: true, color: '#ff8a6a' });
          else if (s.contact && s.speed < slow * 0.8 && s.heat > 0.25)
            text(g, 'keep moving', s.px, s.py + 22, { size: 10, bold: true, color: '#ffb347' });
          else if (s.contact && s.d > tol)
            text(g, 'onto the line', s.px, s.py + 22, { size: 10, bold: true, color: '#ff8a6a' });
        } else
          text(g, 'follow the ghost: on the line, at its pace', W / 2, 176, {
            size: 10,
            bold: true,
            color: PAL.gold,
          });
      }
    };

    return {
      update(dt) {
        s.dt = dt;
        s.t += dt;
        if (!s.end) step(dt);
        else {
          s.outro += dt;
          if (s.outro >= OUTRO) end.finish(quality, why);
        }
        fx.step(dt);
        look.draw(g, s, trail);
        overlay();
      },
      dispose() {
        window.removeEventListener('keydown', kd, true);
        window.removeEventListener('keyup', ku, true);
        window.removeEventListener('blur', blur);
        c.dispose();
      },
    };
  },
};
