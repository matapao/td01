import {
  SPARK,
  AIR,
  SMOKE,
  STEAM,
  EMBER,
  BUBBLE,
  GRAIN,
  WATER,
  STREAK,
  CLOUD,
  GRIT,
  Fx,
} from './band-particles.ts';
export type { BandEdge } from './band-data.ts';
export type { BandStyle } from './band-data.ts';
export type { BandParams } from './band-data.ts';
export { BAND_EXAMPLES } from './band-data.ts';
import { BAND_EXAMPLES } from './band-data.ts';
import type { BandParams } from './band-data.ts';
/**
 * Hold the band (TECH_LINEAGE §4): keep a live value — a fire's heat, a boiler's pressure, a
 * capsule's entry angle, a boat's load — in its band long enough, holding and letting go (or pushing
 * up and down) against its drift and the odd disturbance. Out of the band the count stops and a
 * perfect is spoilt; past a fatal edge it fails, safely and visibly: the crucible cracks, the boiler
 * pops its plug, the capsule skips off the air, the boat goes down.
 *
 * One kind in five looks ('fire', 'gauge', 'capsule', 'load', 'lander'). BAND_EXAMPLES shows how
 * milestones set it up; the playground runs one with ?minigame=band&demo=<name>.
 */
import type { MinigameDef, Quality } from './types.ts';
import { canvasIn, finisher, text, rrect, PAL, FONT } from './kit.ts';

/** The playground's ?demo=<name> picks an example; the forge by default. */
function demoFromUrl(): BandParams {
  const name =
    typeof location === 'undefined' ? '' : (new URLSearchParams(location.search).get('demo') ?? '');
  return Object.hasOwn(BAND_EXAMPLES, name)
    ? BAND_EXAMPLES[name as keyof typeof BAND_EXAMPLES]
    : BAND_EXAMPLES.forge;
}

// ---- Drawing helpers --------------------------------------------------------------------------------

const W = 380;
const H = 220;
/** Seconds the ending plays (the crucible cracks, the parachute opens) before the verdict. */
const OUTRO = 1.15;
/** Cells in the hold tape (how the hold went, moment by moment). */
const TAPE = 120;
const TAU = Math.PI * 2;
const RAD = Math.PI / 180;

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const ease = (u: number): number => u * u * (3 - 2 * u);

/** A small seeded random generator (mulberry32): the same disturbances every run for one seed. */
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

/** An offscreen canvas `w` × `h` CSS px (at twice the resolution), painted once. */
function layer(paint: (g: CanvasRenderingContext2D) => void, w = W, h = H): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w * 2;
  cv.height = h * 2;
  const g = cv.getContext('2d')!;
  g.scale(2, 2);
  paint(g);
  return cv;
}

/** A soft round light in one colour ("r,g,b"), stamped wherever something glows. */
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

/** The colours of hot things, from a dull red through orange and yellow to white (0–1). */
const HEAT: string[] = (() => {
  // Seven RGBA stops; k starts at 1 and stops at the last pair.
  const stops: [number, number, number, number][] = [
    [0, 52, 12, 6],
    [0.2, 122, 22, 8],
    [0.42, 205, 58, 14],
    [0.6, 246, 118, 28],
    [0.76, 255, 176, 64],
    [0.9, 255, 226, 150],
    [1, 255, 250, 232],
  ];
  const out: string[] = [];
  for (let i = 0; i < 64; i++) {
    const f = i / 63;
    let k = 1;
    while (k < stops.length - 1 && stops[k]![0] < f) k++;
    const a = stops[k - 1]!;
    const b = stops[k]!;
    const u = (f - a[0]) / (b[0] - a[0]);
    out.push(
      `rgb(${Math.round(lerp(a[1], b[1], u))},${Math.round(lerp(a[2], b[2], u))},${Math.round(lerp(a[3], b[3], u))})`,
    );
  }
  return out;
})();
// The 64-entry palette is sampled only with a clamped 0..63 index.
const heat = (f: number): string => HEAT[Math.round(clamp(f, 0, 1) * 63)]!;

/** A dark wall of stone blocks behind a scene. */
function wall(g: CanvasRenderingContext2D, top: string, bottom: string, seed: number): void {
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, top);
  grd.addColorStop(1, bottom);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const r = rng(seed);
  for (let row = 0; row < 10; row++) {
    const y = row * 19 - 6;
    for (let x = -(row % 2) * 22; x < W; x += 44) {
      const k = 34 + r() * 18;
      g.fillStyle = `rgba(${k | 0},${(k * 0.8) | 0},${(k * 0.62) | 0},0.55)`;
      rrect(g, x + 1.5, y + 1.5, 41, 16, 3);
      g.fill();
    }
  }
}

// ---- Particles ------------------------------------------------------------------------------------

// ---- The run, as the looks see it ---------------------------------------------------------------

/** What a look draws from, every frame. */
interface View {
  t: number;
  dt: number;
  /** The value now (with its wobble), the driven value without it, and where they sit on the gauge (0–1). */
  v: number;
  x: number;
  f: number;
  fx: number;
  /** The band and its perfect middle, now. */
  lo: number;
  hi: number;
  plo: number;
  phi: number;
  /** What the player does (−1 down, 0 nothing, 1 holding / up), and the same smoothed. */
  input: number;
  drive: number;
  /** −1 below the band, 0 in it, 1 above. */
  side: number;
  /** 0–1: how near it is to failing. */
  danger: number;
  /** The hold, 0–1. */
  progress: number;
  /** How it ended ('' while playing), and seconds since. */
  end: '' | 'win' | 'high' | 'low';
  outro: number;
  /** The wobble now: its size (units, grown) and its two phases (the waves on the river). */
  wob: number;
  ph1: number;
  ph2: number;
}

/** A look: draws the scene each frame; `ghost` is where to point a first-timer's hand. */
interface Look {
  draw(g: CanvasRenderingContext2D, s: View): void;
  ghost: [number, number];
  /** Where to say "keep it in the gold" the first time: beside the scale's band, or a spot. */
  gold: 'scale' | [number, number];
}

/** The wobble about the value (waves, a needle's shiver) at time t; `k` shifts it along a river. */
function wobble(s: { wob: number; ph1: number; ph2: number }, t: number, k = 0): number {
  return s.wob * (0.65 * Math.sin(t * 1.9 + s.ph1 - k * 0.03) + 0.35 * Math.sin(t * 3.7 + s.ph2 - k * 0.05));
}

// The vertical scale beside the fire and the boat.
const SX = 348;
const STOP = 30;
const SBOT = 168;
const sy = (f: number): number => SBOT - clamp(f, 0, 1) * (SBOT - STOP);

/** The scale's strip, painted once: `colour(f)` along it, the ends labelled. */
function paintScale(g: CanvasRenderingContext2D, p: BandParams, colour: (f: number) => string): void {
  const grd = g.createLinearGradient(0, SBOT, 0, STOP);
  for (let i = 0; i <= 8; i++) grd.addColorStop(i / 8, colour(i / 8));
  g.fillStyle = '#0b0907';
  rrect(g, SX - 3, STOP - 3, 16, SBOT - STOP + 6, 4);
  g.fill();
  g.fillStyle = grd;
  g.fillRect(SX, STOP, 10, SBOT - STOP);
  g.strokeStyle = '#6e5a35';
  g.lineWidth = 1;
  rrect(g, SX - 3, STOP - 3, 16, SBOT - STOP + 6, 4);
  g.stroke();
  const d = p.decimals ?? 0;
  text(g, p.max.toFixed(d), SX + 5, STOP - 10, { size: 8.5, color: PAL.faint });
  text(g, p.min.toFixed(d), SX + 5, SBOT + 10, { size: 8.5, color: PAL.faint });
}

/** The scale's moving marks: the rest dimmed, the band bracketed in gold, the pointer at the value. */
function drawScale(g: CanvasRenderingContext2D, p: BandParams, s: View): void {
  const span = p.max - p.min;
  const yHi = sy((s.hi - p.min) / span);
  const yLo = sy((s.lo - p.min) / span);
  g.fillStyle = 'rgba(8,6,4,0.62)';
  g.fillRect(SX, STOP, 10, Math.max(0, yHi - STOP));
  g.fillRect(SX, yLo, 10, Math.max(0, SBOT - yLo));
  // The band's bracket, and the perfect middle in bright gold.
  g.strokeStyle = PAL.gold;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(SX - 1, yHi);
  g.lineTo(SX - 6, yHi);
  g.lineTo(SX - 6, yLo);
  g.lineTo(SX - 1, yLo);
  g.stroke();
  g.strokeStyle = '#ffe08a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(SX - 6, sy((s.phi - p.min) / span));
  g.lineTo(SX - 6, sy((s.plo - p.min) / span));
  g.stroke();
  const d = p.decimals ?? 0;
  text(g, s.hi.toFixed(d), SX - 10, yHi, { size: 8.5, color: PAL.gold, align: 'right' });
  text(g, s.lo.toFixed(d), SX - 10, yLo, { size: 8.5, color: PAL.gold, align: 'right' });
  // The pointer.
  const y = sy(s.f);
  g.fillStyle = s.side === 0 ? '#fff6dc' : s.side > 0 ? '#ff8a6a' : '#8ec5ff';
  g.fillRect(SX - 1, y - 1, 12, 2);
  g.beginPath();
  g.moveTo(SX + 12, y);
  g.lineTo(SX + 19, y - 5);
  g.lineTo(SX + 19, y + 5);
  g.closePath();
  g.fill();
}

// ---- The looks --------------------------------------------------------------------------------------

/** 'fire': a forge — bellows, coals, flames and the piece in the fire, all brightening with the heat. */
function fireLook(p: BandParams, fx: Fx): Look {
  const piece = p.look?.piece ?? 'crucible';
  const span = p.max - p.min;
  // In °C things glow their real colours (dull red at 500, yellow at 1200); otherwise along the gauge.
  const glowAt = p.unit === '°C' ? (u: number) => (u - 470) / 1030 : (u: number) => (u - p.min) / span;
  const cx = 184;
  const pit = 143;
  const r = rng(12);
  // Every coal has three packed values; all consumers iterate exactly 17 coals.
  const coals = new Float32Array(17 * 3);
  for (let i = 0; i < 17; i++) {
    coals[i * 3] = cx - 64 + i * 8 + (r() - 0.5) * 4;
    coals[i * 3 + 1] = pit - 3 + (r() - 0.5) * 5;
    coals[i * 3 + 2] = 4.5 + r() * 3.2;
  }
  const amber = glowSprite('255,140,50');
  const bg = layer((g) => {
    wall(g, '#1c1611', '#0c0a07', 31);
    // The hood over the hearth.
    g.fillStyle = '#16110d';
    g.beginPath();
    g.moveTo(cx - 48, 0);
    g.lineTo(cx + 48, 0);
    g.lineTo(cx + 76, 30);
    g.lineTo(cx - 76, 30);
    g.closePath();
    g.fill();
    g.fillStyle = '#2e251c';
    g.fillRect(cx - 80, 29, 160, 5);
    // The floor.
    g.fillStyle = '#0d0a07';
    g.fillRect(0, 186, W, H - 186);
    // The hearth: a block of stones with the fire pit on top.
    g.fillStyle = '#1f1914';
    g.fillRect(cx - 88, 143, 176, 45);
    g.save();
    g.beginPath();
    g.rect(cx - 88, 143, 176, 45);
    g.clip();
    for (let row = 0; row < 3; row++)
      for (let i = -1; i < 7; i++) {
        const x = cx - 88 + i * 30 + (row % 2) * 15;
        const y = 147 + row * 14;
        const k = 48 + r() * 18;
        g.fillStyle = `rgb(${k | 0},${(k * 0.82) | 0},${(k * 0.66) | 0})`;
        rrect(g, x + 1, y, 28, 12, 2);
        g.fill();
        g.fillStyle = 'rgba(255,225,180,0.07)';
        g.fillRect(x + 3, y + 1, 24, 2);
      }
    g.restore();
    g.fillStyle = '#3b3028';
    g.fillRect(cx - 92, 139, 184, 6);
    g.fillStyle = '#080605';
    g.beginPath();
    g.ellipse(cx, pit, 74, 7, 0, 0, TAU);
    g.fill();
    for (let i = 0; i < 17; i++) {
      g.fillStyle = '#18120e';
      g.beginPath();
      g.arc(coals[i * 3]!, coals[i * 3 + 1]!, coals[i * 3 + 2]!, 0, TAU);
      g.fill();
      g.fillStyle = '#2a2019';
      g.beginPath();
      g.arc(coals[i * 3]! - 1, coals[i * 3 + 1]! - 1.5, coals[i * 3 + 2]! * 0.5, 0, TAU);
      g.fill();
    }
    // The bellows' nozzle into the fire (the boards and leather move).
    g.fillStyle = '#4a4c52';
    g.beginPath();
    g.moveTo(100, 147);
    g.lineTo(126, 144);
    g.lineTo(126, 147.5);
    g.lineTo(100, 154);
    g.closePath();
    g.fill();
    paintScale(g, p, (f) => {
      const k = glowAt(p.min + f * span);
      return k < 0 ? '#2a201a' : heat(k);
    });
  });
  let pump = 0;
  let open = 22;
  let sparkT = 0;
  let airT = 0;
  let smokeT = 0;
  let burst = false;

  const piecePath = (g: CanvasRenderingContext2D): void => {
    g.beginPath();
    if (piece === 'glass') {
      g.moveTo(cx - 5, 93);
      g.lineTo(cx + 5, 93);
      g.lineTo(cx + 5, 105);
      g.quadraticCurveTo(cx + 20, 108, cx + 18, 124);
      g.quadraticCurveTo(cx + 16, 138, cx, 138);
      g.quadraticCurveTo(cx - 16, 138, cx - 18, 124);
      g.quadraticCurveTo(cx - 20, 108, cx - 5, 105);
    } else if (piece === 'pot') {
      g.moveTo(cx - 10, 96);
      g.lineTo(cx + 10, 96);
      g.quadraticCurveTo(cx + 9, 104, cx + 16, 112);
      g.quadraticCurveTo(cx + 24, 126, cx + 13, 138);
      g.lineTo(cx - 13, 138);
      g.quadraticCurveTo(cx - 24, 126, cx - 16, 112);
      g.quadraticCurveTo(cx - 9, 104, cx - 10, 96);
    } else {
      g.moveTo(cx - 19, 98);
      g.lineTo(cx + 19, 98);
      g.lineTo(cx + 13, 136);
      g.quadraticCurveTo(cx, 141, cx - 13, 136);
    }
    g.closePath();
  };

  const flame = (
    g: CanvasRenderingContext2D,
    bx: number,
    by: number,
    w: number,
    h: number,
    sway: number,
  ): void => {
    g.beginPath();
    g.moveTo(bx - w, by);
    g.quadraticCurveTo(bx - w * 0.9, by - h * 0.55, bx + sway, by - h);
    g.quadraticCurveTo(bx + w * 0.9, by - h * 0.55, bx + w, by);
    g.closePath();
    g.fill();
  };

  const flames = (g: CanvasRenderingContext2D, s: View, fv: number, front: boolean): void => {
    for (let i = 0; i < 5; i++) {
      const outer = i === 0 || i === 4;
      if (outer !== front) continue;
      const bx = cx - 48 + i * 24;
      const flick = 0.75 + 0.25 * Math.sin(s.t * (7 + i) + i * 1.7);
      const h = (5 + 66 * fv) * flick * (outer ? 0.65 : 1) * (i === 2 ? 1.1 : 1);
      const w = 6 + 7 * fv;
      const sway = Math.sin(s.t * 5 + i) * 3 + 7 * s.drive;
      g.globalAlpha = 0.5 + 0.4 * fv;
      g.fillStyle = heat(0.3 + 0.5 * fv);
      flame(g, bx, pit - 1, w, h, sway);
      g.globalAlpha = 0.75;
      g.fillStyle = heat(0.55 + 0.45 * fv);
      flame(g, bx + sway * 0.2, pit - 1, w * 0.5, h * 0.55, sway * 0.6);
    }
    g.globalAlpha = 1;
  };

  return {
    ghost: [62, 140],
    gold: 'scale',
    draw(g, s) {
      const u = s.end ? clamp(s.outro / OUTRO, 0, 1) : 0;
      // How hot the fire looks: dying when it failed cold, flaring when it failed hot.
      let fv = s.f;
      if (s.end === 'low') fv = s.f * (1 - u);
      else if (s.end === 'high') fv = Math.min(1, s.f + 0.3 * (1 - u));
      g.drawImage(bg, 0, 0, W, H);
      glow(g, amber, cx, pit - 16, 120, 0.08 + 0.42 * fv);
      // The bellows pump in strokes while held, and rest open when let go.
      if (s.input > 0 && !s.end) {
        pump += s.dt * TAU * 2.6;
        open = 13 + 8 * Math.cos(pump);
        airT += s.dt * 34;
        while (airT > 1) {
          airT--;
          fx.spawn(
            AIR,
            128,
            145 + (Math.random() - 0.5) * 4,
            120 + Math.random() * 60,
            (Math.random() - 0.5) * 30,
            0.28,
            1,
          );
        }
      } else open += (24 - open) * Math.min(1, s.dt * 6);
      // Sparks fly up, more as it heats; smoke curls from a dying fire.
      sparkT += s.dt * (2 + 24 * fv + 10 * Math.max(0, s.drive));
      while (sparkT > 1) {
        sparkT--;
        const i = Math.floor(Math.random() * 17);
        fx.spawn(
          SPARK,
          coals[i * 3]!,
          coals[i * 3 + 1]! - 4,
          (Math.random() - 0.5) * 20 + 18 * s.drive,
          -(40 + Math.random() * 60) * (0.6 + fv),
          0.5 + Math.random() * 0.6,
          1.2 + Math.random(),
        );
      }
      if (s.end === 'low' && piece !== 'glass') {
        smokeT += s.dt * 14;
        while (smokeT > 1) {
          smokeT--;
          fx.spawn(
            SMOKE,
            cx - 40 + Math.random() * 80,
            pit - 6,
            (Math.random() - 0.5) * 10,
            -20 - Math.random() * 16,
            1.2,
            3,
          );
        }
      }
      if (s.end === 'high' && !burst) {
        burst = true;
        for (let i = 0; i < 26; i++)
          fx.spawn(
            SPARK,
            cx,
            106,
            (Math.random() - 0.5) * 220,
            -60 - Math.random() * 160,
            0.7 + Math.random() * 0.5,
            2,
          );
      }
      if (s.end === 'win' && !burst) {
        burst = true;
        for (let i = 0; i < 18; i++)
          fx.spawn(
            SPARK,
            cx + (Math.random() - 0.5) * 20,
            96,
            (Math.random() - 0.5) * 90,
            -80 - Math.random() * 120,
            0.8 + Math.random() * 0.4,
            1.8,
          );
      }
      flames(g, s, fv, false);
      // The piece in the fire, glowing its heat (split, slumped or cracked when it failed).
      const gl = clamp(glowAt(s.v), 0, 1) * (s.end === 'low' ? 1 - u * 0.7 : 1);
      const crackHot = s.end === 'high' && piece !== 'glass';
      const slump = s.end === 'high' && piece === 'glass' ? u : 0;
      const halves = crackHot ? 2 : 1;
      for (let h = 0; h < halves; h++) {
        g.save();
        if (crackHot) {
          g.beginPath();
          if (h === 0) g.rect(0, 0, cx, H);
          else g.rect(cx, 0, W - cx, H);
          g.clip();
          const d = (h === 0 ? -1 : 1) * 5 * Math.min(1, u * 3);
          g.translate(cx, 138);
          g.rotate(d * 0.03);
          g.translate(-cx + d, -138);
        }
        if (slump > 0) {
          g.translate(cx, 138);
          g.scale(1 + 0.35 * slump, 1 - 0.45 * slump);
          g.translate(-cx, -138);
        }
        piecePath(g);
        if (piece === 'glass') {
          g.fillStyle = 'rgba(150,214,200,0.3)';
          g.fill();
        } else if (piece === 'pot') {
          g.fillStyle = '#7b6b5c';
          g.fill();
          g.globalAlpha = s.progress;
          g.fillStyle = '#b4613a';
          g.fill();
          g.globalAlpha = 1;
        } else {
          g.fillStyle = '#5b4232';
          g.fill();
        }
        if (gl > 0) {
          // Clay glows no further than yellow-white, so it still reads as a pot in the fire.
          g.globalAlpha = clamp(gl * 1.7, 0, piece === 'glass' ? 0.7 : 0.8);
          g.fillStyle = heat(piece === 'glass' ? gl : Math.min(gl, 0.84));
          g.fill();
          g.globalAlpha = 1;
        }
        if (piece !== 'glass') {
          g.save();
          g.clip();
          g.fillStyle = 'rgba(0,0,0,0.28)';
          g.fillRect(cx + 5, 90, 30, 60);
          g.fillStyle = 'rgba(255,235,200,0.12)';
          g.fillRect(cx - 14, 90, 5, 60);
          g.restore();
          piecePath(g);
        }
        g.strokeStyle = piece === 'glass' ? 'rgba(215,250,240,0.7)' : 'rgba(0,0,0,0.45)';
        g.lineWidth = 1.2;
        g.stroke();
        if (piece === 'glass') {
          g.strokeStyle = 'rgba(255,255,255,0.55)';
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(cx - 2, 123, 12, 2.6, 3.5);
          g.stroke();
        } else if (piece === 'crucible') {
          // The ore lumps melt into a shining pool as the hold goes on.
          g.fillStyle = '#3d3a3a';
          g.beginPath();
          g.ellipse(cx, 100, 16, 3.6, 0, 0, TAU);
          g.fill();
          g.globalAlpha = clamp(s.progress * 1.4, 0, 1);
          g.fillStyle = s.end === 'win' ? '#fff3c4' : heat(0.78 + 0.2 * gl);
          g.fill();
          g.globalAlpha = 1;
          g.fillStyle = '#5d5a58';
          for (let k = 0; k < 4; k++) {
            g.globalAlpha = 1 - clamp(s.progress * 1.3, 0, 1);
            g.beginPath();
            g.arc(cx - 9 + k * 6, 98.5 + (k % 2), 2.6, 0, TAU);
            g.fill();
          }
          g.globalAlpha = 1;
        }
        g.restore();
      }
      if (crackHot) {
        // The crack, and the melt running out of it.
        const k = Math.min(1, u * 3);
        g.strokeStyle = '#1a0d08';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(cx, 98);
        g.lineTo(cx - 3, 108);
        g.lineTo(cx + 2, 117);
        g.lineTo(cx - 2, 127);
        g.lineTo(cx + 1, 138);
        g.stroke();
        g.fillStyle = heat(0.85);
        g.beginPath();
        g.ellipse(cx, 120 + 20 * k, 3 + 3 * k, 5 + 4 * k, 0, 0, TAU);
        g.fill();
        glow(g, amber, cx, 128 + 16 * k, 22, 0.7);
      }
      if (s.end === 'low' && piece === 'glass') {
        g.strokeStyle = 'rgba(240,250,255,0.85)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(cx - 12, 110);
        g.lineTo(cx - 2, 120);
        g.lineTo(cx - 6, 128);
        g.moveTo(cx - 2, 120);
        g.lineTo(cx + 10, 117);
        g.lineTo(cx + 15, 129);
        g.stroke();
      }
      flames(g, s, fv, true);
      // The coals glow with the fire.
      for (let i = 0; i < 17; i++) {
        const fl = 0.5 + 0.5 * Math.sin(s.t * 6 + i * 2.1);
        g.globalAlpha = clamp(0.2 + 0.8 * fv, 0, 1) * (0.75 + 0.25 * fl);
        g.fillStyle = heat(0.25 + 0.6 * fv + 0.1 * fl);
        g.beginPath();
        g.ellipse(
          coals[i * 3]!,
          coals[i * 3 + 1]! - 1,
          coals[i * 3 + 2]! * 0.62,
          coals[i * 3 + 2]! * 0.45,
          0,
          0,
          TAU,
        );
        g.fill();
      }
      g.globalAlpha = 1;
      fx.draw(g);
      // The bellows: two boards hinged at the nozzle, the pleated leather between them.
      const a = open * RAD;
      const tx = 104 - 78 * Math.cos(a);
      const ty = 149 - 78 * Math.sin(a);
      const bx = 28;
      const by = 158;
      g.fillStyle = '#5e3b22';
      g.beginPath();
      g.moveTo(104, 150);
      g.lineTo(tx, ty);
      g.quadraticCurveTo(Math.min(tx, bx) - 12, (ty + by) / 2, bx, by);
      g.closePath();
      g.fill();
      g.strokeStyle = '#3a2414';
      g.lineWidth = 1.2;
      for (let k = 1; k < 4; k++) {
        const q = k / 4;
        const ax = lerp(tx, 104, q);
        const ay = lerp(ty, 150, q);
        const cx2 = lerp(bx, 104, q);
        const cy2 = lerp(by, 150, q);
        g.beginPath();
        g.moveTo(ax, ay);
        g.quadraticCurveTo(Math.min(ax, cx2) - 10 * (1 - q), (ay + cy2) / 2, cx2, cy2);
        g.stroke();
      }
      g.lineCap = 'round';
      g.strokeStyle = '#8a6038';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(104, 152);
      g.lineTo(bx, by + 1);
      g.lineTo(bx - 14, by + 3);
      g.moveTo(104, 148);
      g.lineTo(tx, ty);
      g.lineTo(tx - 14 * Math.cos(a), ty - 14 * Math.sin(a));
      g.stroke();
      g.lineCap = 'butt';
      g.fillStyle = '#d8b25a';
      for (let k = 1; k < 4; k++) {
        g.fillRect(lerp(tx, 104, k / 4) - 1, lerp(ty, 148, k / 4) - 1, 2, 2);
        g.fillRect(lerp(bx, 104, k / 4) - 1, lerp(by + 1, 152, k / 4) - 1, 2, 2);
      }
      if (u > 0 && s.end === 'high') {
        g.fillStyle = '#fff4d0';
        g.globalAlpha = clamp(0.6 - u * 2, 0, 1);
        g.fillRect(0, 0, W, H);
        g.globalAlpha = 1;
      }
      drawScale(g, p, s);
    },
  };
}

/** 'gauge': a needle dial on a boiler with a relief valve (or a control box with a lever), and an engine that runs while the needle sits in the band. */
function gaugeLook(p: BandParams, fx: Fx): Look {
  const lever = p.look?.device === 'lever';
  const span = p.max - p.min;
  const dx = 226;
  const dy = 92;
  const ang = (f: number): number => (135 + 270 * clamp(f, -0.03, 1.03)) * RAD;
  const fire = glowSprite('255,120,40');
  const white = glowSprite('255,250,235');
  // A step for the dial's numbers: about six of them.
  let step = 1;
  for (const m of [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) {
    step = m;
    if (span / m <= 7) break;
  }
  const bg = layer((g) => {
    if (lever) {
      // A cool steel room: panels with seams and rivets.
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#1c232b');
      grd.addColorStop(1, '#0c1014');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(160,190,215,0.08)';
      g.lineWidth = 1;
      for (let x = 0; x < W; x += 64) {
        g.beginPath();
        g.moveTo(x + 0.5, 0);
        g.lineTo(x + 0.5, H);
        g.stroke();
        g.fillStyle = 'rgba(170,195,215,0.18)';
        for (let y = 8; y < 186; y += 22) g.fillRect(x + 3, y, 1.5, 1.5);
      }
      g.beginPath();
      g.moveTo(0, 96.5);
      g.lineTo(W, 96.5);
      g.stroke();
      g.fillStyle = '#0a0d10';
    } else {
      wall(g, '#18130f', '#0b0907', 57);
      g.fillStyle = '#0d0a07';
    }
    g.fillRect(0, 188, W, H - 188);
    // The pipe (or cable) to the dial.
    g.strokeStyle = lever ? '#2a2420' : '#6b5a3a';
    g.lineWidth = lever ? 3 : 5;
    g.beginPath();
    g.moveTo(126, 140);
    g.lineTo(178, 140);
    g.stroke();
    if (lever) {
      // The control box.
      g.fillStyle = '#2b2f33';
      rrect(g, 28, 104, 100, 82, 6);
      g.fill();
      g.strokeStyle = '#4a5157';
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = '#121416';
      rrect(g, 64, 122, 10, 52, 4);
      g.fill();
      for (let i = 0; i < 4; i++) {
        g.fillStyle = '#1a1d20';
        g.fillRect(36, 116 + i * 9, 20, 4);
      }
    } else {
      // The boiler: a riveted drum over its firebox.
      const grd = g.createLinearGradient(0, 112, 0, 170);
      grd.addColorStop(0, '#6a777b');
      grd.addColorStop(0.45, '#3b4549');
      grd.addColorStop(1, '#1e2427');
      g.fillStyle = grd;
      rrect(g, 14, 112, 114, 58, 24);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(46, 113, 5, 56);
      g.fillRect(94, 113, 5, 56);
      g.fillStyle = '#a7b0b2';
      for (let y = 118; y < 166; y += 7) {
        g.fillRect(47.5, y, 2, 2);
        g.fillRect(95.5, y, 2, 2);
      }
      g.fillStyle = '#1b1715';
      rrect(g, 24, 168, 96, 20, 3);
      g.fill();
      g.fillStyle = '#0a0706';
      rrect(g, 40, 173, 64, 12, 2);
      g.fill();
      // The valve's column and the whistle.
      g.fillStyle = '#b08a3e';
      g.fillRect(105, 100, 8, 13);
      g.fillRect(118, 103, 4, 10);
      g.fillRect(34, 104, 5, 9);
      g.fillStyle = '#d8b25a';
      g.fillRect(32, 100, 9, 5);
    }
    if (lever) {
      // The cell: a glass tank of water with two plates, wired to the box.
      g.strokeStyle = '#2a2420';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(328, 106);
      g.lineTo(328, 96);
      g.lineTo(300, 96);
      g.moveTo(352, 106);
      g.lineTo(352, 92);
      g.lineTo(300, 92);
      g.stroke();
      g.fillStyle = 'rgba(90,130,160,0.42)';
      g.fillRect(312, 128, 56, 57);
      g.fillStyle = 'rgba(190,225,245,0.5)';
      g.fillRect(312, 127, 56, 1.5);
      g.strokeStyle = 'rgba(190,215,230,0.65)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(312, 116);
      g.lineTo(312, 186);
      g.lineTo(368, 186);
      g.lineTo(368, 116);
      g.stroke();
      g.fillStyle = '#3a3f44';
      g.fillRect(306, 104, 68, 4);
      g.fillStyle = '#6a7177';
      g.fillRect(326, 106, 4, 72);
      g.fillRect(350, 106, 4, 72);
      g.fillStyle = '#1f2a30';
      g.fillRect(304, 186, 72, 3);
    } else {
      // The engine: a flywheel on its stand, a pump below with its spout.
      g.fillStyle = '#2a2420';
      g.fillRect(337, 118, 6, 48);
      g.fillStyle = '#3a332c';
      rrect(g, 322, 158, 36, 28, 4);
      g.fill();
      g.fillStyle = '#4a4038';
      g.fillRect(356, 164, 12, 5);
      g.fillStyle = '#1f2a30';
      g.fillRect(346, 182, 34, 6);
    }
    // The dial: a brass bezel, a dark face, cream ticks and numbers.
    // Brass on the boiler; steel in the cool room.
    const bez = g.createRadialGradient(dx - 20, dy - 24, 10, dx, dy, 70);
    bez.addColorStop(0, lever ? '#eef3f7' : '#f6dc94');
    bez.addColorStop(0.6, lever ? '#9aa6b0' : '#b8903e');
    bez.addColorStop(1, lever ? '#4a5560' : '#6e5222');
    g.fillStyle = bez;
    g.beginPath();
    g.arc(dx, dy, 68, 0, TAU);
    g.fill();
    const face = g.createRadialGradient(dx, dy - 10, 4, dx, dy, 62);
    face.addColorStop(0, '#2a2219');
    face.addColorStop(1, '#120e0a');
    g.fillStyle = face;
    g.beginPath();
    g.arc(dx, dy, 61, 0, TAU);
    g.fill();
    const minor = step / (step === 2.5 || step === 25 || step === 250 ? 5 : 4);
    const n = Math.round(span / minor);
    const every = Math.round(step / minor);
    for (let i = 0; i <= n; i++) {
      const a = ang(i / n);
      const major = i % every === 0;
      const r0 = major ? 45 : 49;
      g.strokeStyle = '#e8dcc0';
      g.lineWidth = major ? 1.6 : 0.9;
      g.beginPath();
      g.moveTo(dx + Math.cos(a) * r0, dy + Math.sin(a) * r0);
      g.lineTo(dx + Math.cos(a) * 54, dy + Math.sin(a) * 54);
      g.stroke();
      if (major) {
        const val = p.min + i * minor;
        text(g, val.toFixed(step < 1 ? 1 : 0), dx + Math.cos(a) * 36, dy + Math.sin(a) * 36, {
          size: 8.5,
          color: '#e8dcc0',
          bold: true,
        });
      }
    }
    text(g, p.label.toUpperCase(), dx, dy - 19, { size: 7.5, color: '#a89878' });
    text(g, p.unit, dx, dy + 22, { size: 9, color: '#c9bb98', bold: true });
  });
  let spin = 0;
  let omega = 0;
  let steamT = 0;
  let waterT = 0;
  let toot = 0;
  let weightY = 0;
  let weightVy = 0;
  let popped = false;
  let needleSpin = 0;
  let hub: CanvasGradient | null = null;

  return {
    ghost: lever ? [70, 118] : [86, 104],
    gold: [dx, dy + 76],
    draw(g, s) {
      const u = s.end ? clamp(s.outro / OUTRO, 0, 1) : 0;
      g.drawImage(bg, 0, 0, W, H);
      const pushesDown = s.input * Math.sign(p.push) < 0;
      const pushesUp = s.input * Math.sign(p.push) > 0;
      if (!lever) {
        // The firebox glows; stoking it (holding, when holding raises the pressure) makes it roar.
        const fl = 0.75 + 0.25 * Math.sin(s.t * 9) * Math.sin(s.t * 5.3);
        glow(
          g,
          fire,
          72,
          179,
          40 + (pushesUp ? 10 : 0),
          (0.55 + (pushesUp ? 0.3 : 0)) * fl * (s.end === 'low' ? 1 - u : 1),
        );
        g.fillStyle = heat(0.55 + 0.2 * fl);
        g.globalAlpha = 0.8 * (s.end === 'low' ? 1 - u : 1);
        g.fillRect(42, 176, 60, 7);
        g.globalAlpha = 1;
        // The relief valve: its lever lifts while it vents, steam roaring out.
        const lift = s.end === 'high' ? 0 : s.drive * Math.sign(-p.push);
        if (pushesDown && !s.end) {
          steamT += s.dt * 30;
          while (steamT > 1) {
            steamT--;
            fx.spawn(
              STEAM,
              109 + (Math.random() - 0.5) * 3,
              96,
              10 + (Math.random() - 0.5) * 30,
              -110 - Math.random() * 60,
              0.7 + Math.random() * 0.4,
              2.5 + Math.random() * 2,
            );
          }
        }
        // Leaks hiss from the seams near the red.
        if (s.danger > 0.3 && !s.end && Math.random() < s.danger * s.dt * 18)
          fx.spawn(
            STEAM,
            30 + Math.random() * 90,
            114,
            (Math.random() - 0.5) * 40,
            -40 - Math.random() * 40,
            0.5,
            1.5,
          );
        if (s.end === 'high' && !popped) {
          popped = true;
          weightVy = -260;
          for (let i = 0; i < 22; i++)
            fx.spawn(
              STEAM,
              30 + Math.random() * 90,
              118 + Math.random() * 20,
              (Math.random() - 0.5) * 260,
              -30 - Math.random() * 190,
              1.1 + Math.random() * 0.5,
              7 + Math.random() * 7,
            );
        }
        if (popped) {
          weightVy += 640 * s.dt;
          weightY += weightVy * s.dt;
        }
        // The lever pivots at its right end; lifting the weight end opens the valve.
        const la = (15 * Math.max(0, lift) + (popped ? 55 * u : 0)) * RAD;
        const wx0 = 120 - 44 * Math.cos(la);
        const wy0 = 99 - 44 * Math.sin(la);
        g.strokeStyle = '#2c2a28';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(120, 99);
        g.lineTo(wx0, wy0);
        g.stroke();
        g.fillStyle = '#222';
        g.beginPath();
        g.arc(wx0, wy0 + weightY, 5.5, 0, TAU);
        g.fill();
        g.fillStyle = '#d8b25a';
        g.beginPath();
        g.arc(120, 99, 2.4, 0, TAU);
        g.fill();
        // A toot of the whistle when it's done.
        if (s.end === 'win') {
          toot += s.dt;
          if (toot < 0.5 && Math.random() < 0.8)
            fx.spawn(STEAM, 37, 98, (Math.random() - 0.5) * 20, -120 - Math.random() * 40, 0.6, 2);
        }
      } else {
        // The heater lever: pushed over while held, back while let go.
        const la = (p.control === 'updown' ? 28 * s.drive : -28 + 50 * s.drive) * RAD;
        g.save();
        g.translate(69, 172);
        g.rotate(la);
        g.strokeStyle = '#8a7a5a';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(0, -54);
        g.stroke();
        g.fillStyle = '#c0392b';
        g.beginPath();
        g.arc(0, -56, 6, 0, TAU);
        g.fill();
        g.restore();
        // The box's lamp shows how hard it is driven.
        glow(g, fire, 101, 120, 14, 0.25 + 0.6 * clamp((s.f - 0.2) / 0.8, 0, 1));
        g.fillStyle = heat(0.3 + 0.6 * s.f);
        g.beginPath();
        g.arc(101, 120, 4, 0, TAU);
        g.fill();
        if (s.end === 'high' && !popped) {
          popped = true;
          for (let i = 0; i < 24; i++)
            fx.spawn(
              SPARK,
              72 + (Math.random() - 0.5) * 80,
              110,
              (Math.random() - 0.5) * 200,
              -40 - Math.random() * 150,
              0.8,
              2,
            );
          for (let i = 0; i < 10; i++)
            fx.spawn(
              SMOKE,
              30 + Math.random() * 90,
              104,
              (Math.random() - 0.5) * 30,
              -30 - Math.random() * 30,
              1.4,
              5,
            );
        }
      }
      // The engine runs while the needle sits in the band: slow below, racing above.
      const fl = (s.lo - p.min) / span;
      const fh = (s.hi - p.min) / span;
      let run =
        s.f < fl ? clamp((s.f - fl * 0.55) / (fl * 0.45), 0, 1) * 0.5 : s.f <= fh ? 1 : 1 + (s.f - fh) * 3;
      if (s.end === 'low') run *= 1 - u;
      omega += (8 * run - omega) * Math.min(1, s.dt * 2.5);
      if (lever) {
        // Gas bubbles off both plates — twice as fast off one, as water gives twice as much hydrogen
        // as oxygen — and boils when pushed too hard.
        waterT += s.dt * omega * 5;
        while (waterT > 1) {
          waterT--;
          const plate = Math.random() < 0.67 ? 352 : 328;
          const y0 = 140 + Math.random() * 38;
          fx.spawn(
            BUBBLE,
            plate + (Math.random() - 0.5) * 6,
            y0,
            (Math.random() - 0.5) * 8,
            -30 - Math.random() * 20,
            Math.max(0.15, (y0 - 132) / 62),
            1 + Math.random() * 1.4,
          );
        }
        if (run > 1.3 && Math.random() < s.dt * 20)
          fx.spawn(STEAM, 316 + Math.random() * 48, 124, (Math.random() - 0.5) * 20, -50, 0.6, 2);
      } else {
        spin += omega * s.dt;
        const wx = 340;
        const wy = 118;
        g.strokeStyle = '#7a6a52';
        g.lineWidth = 3.5;
        g.beginPath();
        g.arc(wx, wy, 23, 0, TAU);
        g.stroke();
        g.lineWidth = 2;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = spin + (k * TAU) / 6;
          g.moveTo(wx, wy);
          g.lineTo(wx + Math.cos(a) * 22, wy + Math.sin(a) * 22);
        }
        g.stroke();
        const pinX = wx + Math.cos(spin) * 12;
        const pinY = wy + Math.sin(spin) * 12;
        const rodY = 150 + Math.sin(spin) * 8;
        g.strokeStyle = '#a99674';
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(pinX, pinY);
        g.lineTo(340, rodY);
        g.stroke();
        g.fillStyle = '#c9b48a';
        g.beginPath();
        g.arc(wx, wy, 3.5, 0, TAU);
        g.fill();
        g.fillRect(335, rodY - 2, 10, 6);
        // The pump spouts water from the mine while it runs.
        if (omega > 3.5) {
          waterT += s.dt * omega * 4;
          while (waterT > 1) {
            waterT--;
            fx.spawn(WATER, 368, 166, 24 + Math.random() * 22, (Math.random() - 0.3) * 20, 0.38, 2);
          }
        }
      }
      // Pressure-coloured zones round the rim: the band in gold, the red past a fatal end.
      const r0 = 58;
      g.lineWidth = 5;
      if (p.high.fails !== 'never') {
        g.strokeStyle =
          s.danger > 0 && s.side > 0 ? (Math.sin(s.t * 16) > 0 ? '#ff5a3a' : '#9a2a1a') : '#a8331f';
        g.beginPath();
        g.arc(dx, dy, r0, ang(fh), ang(1));
        g.stroke();
      }
      if (p.low.fails !== 'never') {
        g.strokeStyle = '#2f5f9a';
        g.beginPath();
        g.arc(dx, dy, r0, ang(0), ang(fl));
        g.stroke();
      }
      g.strokeStyle = 'rgba(233,196,106,0.85)';
      g.beginPath();
      g.arc(dx, dy, r0, ang(fl), ang(fh));
      g.stroke();
      g.strokeStyle = '#ffe08a';
      g.lineWidth = 7;
      g.beginPath();
      g.arc(dx, dy, r0, ang((s.plo - p.min) / span), ang((s.phi - p.min) / span));
      g.stroke();
      // The needle (it whips round when the boiler blows).
      if (s.end === 'high') needleSpin += s.dt * 16 * (1 - u);
      const na = ang(s.f) + needleSpin;
      g.save();
      g.translate(dx, dy);
      g.rotate(na);
      g.fillStyle = '#f4ead6';
      g.beginPath();
      g.moveTo(-12, -2.2);
      g.lineTo(46, -0.8);
      g.lineTo(50, 0);
      g.lineTo(46, 0.8);
      g.lineTo(-12, 2.2);
      g.closePath();
      g.fill();
      g.fillStyle = '#d94a32';
      g.fillRect(38, -1.2, 10, 2.4);
      g.restore();
      if (!hub) {
        hub = g.createRadialGradient(dx - 2, dy - 2, 0, dx, dy, 7);
        hub.addColorStop(0, '#fff0c0');
        hub.addColorStop(1, '#8a6a24');
      }
      g.fillStyle = hub;
      g.beginPath();
      g.arc(dx, dy, 6.5, 0, TAU);
      g.fill();
      // The glass cracks when it blows.
      if (s.end === 'high') {
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(dx - 30, dy - 40);
        g.lineTo(dx - 8, dy - 12);
        g.lineTo(dx + 18, dy - 22);
        g.lineTo(dx + 40, dy - 6);
        g.moveTo(dx - 8, dy - 12);
        g.lineTo(dx - 14, dy + 20);
        g.lineTo(dx + 6, dy + 44);
        g.moveTo(dx + 18, dy - 22);
        g.lineTo(dx + 24, dy - 50);
        g.stroke();
      }
      fx.draw(g);
      if (s.end === 'high') {
        glow(g, white, 72, 120, 120, clamp(1 - u * 1.6, 0, 1) * 0.9);
      }
    },
  };
}

/** The layers of the air's glow round the world's rim: alpha, width, height. */
// All three haze passes iterate the same four layers (k = 0..3).
const HAZE_A = [0.08, 0.14, 0.3, 0.75];
const HAZE_W = [22, 11, 5, 1.6];
const HAZE_R = [10, 5, 2, 0.5];

/**
 * 'capsule': a capsule coming home through the air at an angle — its shield glowing, a plasma trail
 * behind it, the blue world with its clouds below.
 */
function capsuleLook(p: BandParams, fx: Fx, g0: CanvasRenderingContext2D): Look {
  const span = p.max - p.min;
  const px = 150;
  const py = 94;
  const ox = 292;
  const oy = 24;
  const OR = 62;
  /** The angle as drawn (exaggerated so a few degrees show). */
  const vis = (f: number): number => (6 + 54 * clamp(f, 0, 1)) * RAD;
  const plasma = glowSprite('255,160,110');
  const hot = glowSprite('255,240,220');
  const wake = g0.createLinearGradient(6, 0, -130, 0);
  wake.addColorStop(0, 'rgba(255,180,140,0.75)');
  wake.addColorStop(0.35, 'rgba(255,130,90,0.3)');
  wake.addColorStop(1, 'rgba(255,100,50,0)');
  const core = g0.createLinearGradient(6, 0, -90, 0);
  core.addColorStop(0, 'rgba(255,248,230,0.9)');
  core.addColorStop(1, 'rgba(255,230,200,0)');
  const ocean = g0.createLinearGradient(0, 118, 0, 236);
  ocean.addColorStop(0, '#6fb6e0');
  ocean.addColorStop(0.22, '#2f74a6');
  ocean.addColorStop(1, '#10304f');
  // The world's face, twice the view wide so it can slide by: land, and clouds over it.
  const face = layer(
    (g) => {
      const r = rng(19);
      for (let i = 0; i < 12; i++) {
        const x = r() * W * 2;
        const y = 128 + r() * 92;
        const k = 0.4 + (y - 120) / 100;
        g.fillStyle = r() < 0.5 ? '#4f8a4c' : '#6f9850';
        for (let j = 0; j < 4; j++) {
          g.beginPath();
          g.ellipse(
            x + (r() - 0.5) * 50 * k,
            y + (r() - 0.5) * 6 * k,
            (16 + r() * 30) * k,
            (3 + r() * 4) * k,
            0,
            0,
            TAU,
          );
          g.fill();
        }
      }
      for (let i = 0; i < 34; i++) {
        const x = r() * W * 2;
        const y = 124 + r() * 96;
        const k = 0.4 + (y - 120) / 100;
        g.globalAlpha = 0.55 + r() * 0.4;
        g.fillStyle = '#f5f9fc';
        g.beginPath();
        g.ellipse(x, y, (10 + r() * 34) * k, (1.5 + r() * 3) * k, 0, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    },
    W * 2,
    H,
  );
  const bg = layer((g) => {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#03040a');
    sky.addColorStop(0.6, '#0a1026');
    sky.addColorStop(1, '#173a6e');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    const r = rng(77);
    for (let i = 0; i < 80; i++) {
      g.globalAlpha = 0.25 + r() * 0.7;
      g.fillStyle = r() < 0.2 ? '#ffe9c0' : '#dfe8ff';
      const s = r() < 0.12 ? 1.6 : 1;
      g.fillRect(r() * W, r() * 150, s, s);
    }
    g.globalAlpha = 1;
    // The angle dial's frame: a quarter of a protractor from shallow (right) to steep (down).
    g.strokeStyle = 'rgba(233,196,106,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(ox, oy);
    g.arc(ox, oy, OR, vis(0), vis(1));
    g.closePath();
    g.stroke();
    for (let i = 0; i <= 10; i++) {
      const a = vis(i / 10);
      g.beginPath();
      g.moveTo(ox + Math.cos(a) * (OR - 4), oy + Math.sin(a) * (OR - 4));
      g.lineTo(ox + Math.cos(a) * OR, oy + Math.sin(a) * OR);
      g.stroke();
    }
    const d = p.decimals ?? 0;
    text(g, `${p.min.toFixed(d)}${p.unit}`, ox + Math.cos(vis(0)) * OR + 4, oy + Math.sin(vis(0)) * OR + 1, {
      size: 8,
      color: PAL.faint,
      align: 'left',
    });
    text(g, `${p.max.toFixed(d)}${p.unit}`, ox + Math.cos(vis(1)) * OR + 2, oy + Math.sin(vis(1)) * OR + 9, {
      size: 8,
      color: PAL.faint,
    });
  });
  let streakT = 0;
  let cloudT = 0;
  let broke = false;

  return {
    ghost: [px, py + 46],
    gold: [ox - 8, oy + OR + 16],
    draw(g, s) {
      const u = s.end ? clamp(s.outro / OUTRO, 0, 1) : 0;
      g.drawImage(bg, 0, 0, W, H);
      // The world below rises as the capsule falls through the air, its face sliding by.
      const drop = s.progress * 56 + (s.end === 'win' ? u * 34 : 0);
      g.save();
      g.translate(0, -drop);
      g.beginPath();
      g.arc(190, 1140, 1010, 0, TAU);
      g.fillStyle = ocean;
      g.fill();
      g.save();
      g.clip();
      const scroll = (s.t * 16) % (W * 2);
      g.drawImage(face, -scroll, 0, W * 2, H);
      g.drawImage(face, W * 2 - scroll, 0, W * 2, H);
      g.restore();
      g.strokeStyle = '#8fd0ff';
      for (let k = 0; k < 4; k++) {
        g.globalAlpha = HAZE_A[k]!;
        g.lineWidth = HAZE_W[k]!;
        g.beginPath();
        g.arc(190, 1140, 1010 + HAZE_R[k]!, Math.PI * 1.32, Math.PI * 1.68);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.restore();
      // How hot the shield runs: steeper is hotter.
      let a = vis(s.f);
      let heatK = clamp(0.25 + 0.75 * Math.pow(s.f, 1.2), 0, 1);
      let cxp = px;
      let cyp = py;
      let scale = 1;
      if (s.end === 'win') {
        // Slowed by the air: the glow dies, it drops into the clouds.
        heatK *= clamp(1 - u * 2.2, 0, 1);
        a = lerp(a, 90 * RAD, ease(clamp((u - 0.35) * 2.5, 0, 1)));
        cloudT += s.dt * 26 * clamp(u * 3 - 0.4, 0, 1);
        while (cloudT > 1) {
          cloudT--;
          fx.spawn(
            CLOUD,
            px + (Math.random() - 0.5) * 300,
            py + 120 + Math.random() * 20,
            (Math.random() - 0.5) * 20,
            -300 - Math.random() * 140,
            1,
            12 + Math.random() * 12,
          );
        }
      }
      if (s.end === 'high') heatK = 1;
      if (s.end === 'low') {
        // Skipping off: back up into the dark, tumbling away, a dotted trail behind.
        cxp += 150 * u;
        cyp -= 90 * u * (2 - u);
        a -= 5 * u * u;
        scale = 1 - 0.55 * u;
        heatK *= 1 - u;
        g.fillStyle = 'rgba(220,230,255,0.55)';
        for (let k = 1; k < 10; k++) {
          const q = (u * k) / 10;
          g.fillRect(px + 150 * q, py - 90 * q * (2 - q), 1.6, 1.6);
        }
      }
      // Air rushes past.
      if (!s.end || s.end === 'win') {
        streakT += s.dt * (10 + 30 * heatK) * (s.end ? 1 - u : 1);
        while (streakT > 1) {
          streakT--;
          const off = (Math.random() - 0.5) * 220;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          fx.spawn(
            STREAK,
            px + ca * 210 - sa * off,
            py + sa * 210 + ca * off,
            -ca * (260 + Math.random() * 120),
            -sa * (260 + Math.random() * 120),
            1.3,
            0.3 + heatK * 0.7,
          );
        }
      }
      if (s.end === 'high' && u > 0.45 && !broke) {
        broke = true;
        for (let i = 0; i < 30; i++)
          fx.spawn(
            EMBER,
            px + (Math.random() - 0.5) * 16,
            py + (Math.random() - 0.5) * 16,
            Math.cos(a) * (60 + Math.random() * 140) + (Math.random() - 0.5) * 80,
            Math.sin(a) * (60 + Math.random() * 140) + (Math.random() - 0.5) * 80,
            0.6 + Math.random() * 0.5,
            2.2,
          );
        for (let i = 0; i < 8; i++)
          fx.spawn(SMOKE, px, py, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 1.2, 6);
      }
      if (s.end !== 'win') fx.draw(g);
      if (!broke) {
        g.save();
        g.translate(cxp, cyp);
        g.rotate(a);
        g.scale(scale, scale);
        // The wake: a gradient made once at full length, squeezed to how hot it runs.
        const len = (40 + 90 * heatK) / 130;
        g.save();
        g.scale(len, 1);
        g.globalAlpha = heatK;
        g.fillStyle = wake;
        g.beginPath();
        g.moveTo(6 / len, -12);
        g.quadraticCurveTo(-40, -9 - 3 * heatK, -130, -2);
        g.lineTo(-130, 2);
        g.quadraticCurveTo(-40, 9 + 3 * heatK, 6 / len, 12);
        g.closePath();
        g.fill();
        g.fillStyle = core;
        g.beginPath();
        g.moveTo(4 / len, -5);
        g.quadraticCurveTo(-30, -3, -90, 0);
        g.quadraticCurveTo(-30, 3, 4 / len, 5);
        g.closePath();
        g.fill();
        g.restore();
        g.globalAlpha = 1;
        glow(g, plasma, 13, 0, 12 + 22 * heatK, 0.25 + 0.75 * heatK);
        // The backshell (a cone) and the heat shield in front.
        g.fillStyle = s.end === 'high' ? heat(0.6 + 0.4 * u) : '#d9d4ca';
        g.beginPath();
        g.moveTo(8, -13);
        g.lineTo(-13, -6);
        g.lineTo(-16, -4);
        g.lineTo(-16, 4);
        g.lineTo(-13, 6);
        g.lineTo(8, 13);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.beginPath();
        g.moveTo(8, 0);
        g.lineTo(8, 13);
        g.lineTo(-13, 6);
        g.lineTo(-16, 4);
        g.lineTo(-16, 0);
        g.closePath();
        g.fill();
        g.fillStyle = '#4a3328';
        g.beginPath();
        g.moveTo(7, -14);
        g.quadraticCurveTo(15, 0, 7, 14);
        g.lineTo(5, 14);
        g.quadraticCurveTo(12, 0, 5, -14);
        g.closePath();
        g.fill();
        g.strokeStyle = heat(0.55 + 0.45 * heatK);
        g.globalAlpha = 0.35 + 0.65 * heatK;
        g.lineWidth = 2 + 1.5 * heatK;
        g.beginPath();
        g.arc(-1, 0, 16, -0.85, 0.85);
        g.stroke();
        g.globalAlpha = 1;
        g.restore();
        if (s.end === 'high') glow(g, hot, px, py, 30 + 30 * u, u * 1.4);
      }
      // Clouds rush up past it once it is through, and the parachute opens.
      if (s.end === 'win') {
        fx.draw(g);
        if (u > 0.35) {
          const k = clamp((u - 0.35) / 0.35, 0, 1);
          const open = 1 - Math.pow(1 - k, 3);
          const top = py - 26 - 30 * open;
          g.strokeStyle = 'rgba(240,235,225,0.75)';
          g.lineWidth = 0.8;
          g.beginPath();
          g.moveTo(px, py - 10);
          g.lineTo(px - 22 * open, top + 6);
          g.moveTo(px, py - 10);
          g.lineTo(px + 22 * open, top + 6);
          g.moveTo(px, py - 10);
          g.lineTo(px, top);
          g.stroke();
          for (let i = 0; i < 4; i++) {
            g.fillStyle = i % 2 ? '#f2efe6' : '#e2583a';
            g.beginPath();
            g.moveTo(px, top + 6);
            g.ellipse(
              px,
              top + 6,
              24 * open,
              15 * open,
              0,
              Math.PI + (i * Math.PI) / 4,
              Math.PI + ((i + 1) * Math.PI) / 4,
            );
            g.closePath();
            g.fill();
          }
        }
      }
      // The angle dial: the corridor in gold, the capsule's angle as the needle.
      const fl = (s.lo - p.min) / span;
      const fh = (s.hi - p.min) / span;
      g.fillStyle = 'rgba(233,196,106,0.2)';
      g.beginPath();
      g.moveTo(ox, oy);
      g.arc(ox, oy, OR, vis(fl), vis(fh));
      g.closePath();
      g.fill();
      g.strokeStyle = PAL.gold;
      g.lineWidth = 1.2;
      g.stroke();
      g.fillStyle = 'rgba(255,224,138,0.4)';
      g.beginPath();
      g.moveTo(ox, oy);
      g.arc(ox, oy, OR, vis((s.plo - p.min) / span), vis((s.phi - p.min) / span));
      g.closePath();
      g.fill();
      const na = vis(s.f);
      g.strokeStyle = s.side === 0 ? '#fff6dc' : s.side > 0 ? '#ff8a6a' : '#8ec5ff';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(ox + Math.cos(na) * (OR + 4), oy + Math.sin(na) * (OR + 4));
      g.stroke();
      g.fillStyle = PAL.gold;
      g.beginPath();
      g.arc(ox, oy, 2.5, 0, TAU);
      g.fill();
      text(g, p.low.word, ox + Math.cos(vis(0)) * OR, oy - 6, {
        size: 8.5,
        color: s.side < 0 ? '#8ec5ff' : PAL.faint,
        align: 'right',
      });
      text(g, p.high.word, ox + Math.cos(vis(1)) * OR - 9, oy + Math.sin(vis(1)) * OR - 7, {
        size: 8.5,
        color: s.side > 0 ? '#ff8a6a' : PAL.faint,
        align: 'right',
      });
    },
  };
}

/** 'load': a boat at a dock, settling to its load line as cargo pours down the chute, rocked by waves. */
function loadLook(p: BandParams, fx: Fx): Look {
  const span = p.max - p.min;
  const x0 = 214;
  const yw = 134;
  const HH = 54;
  const D0 = 9;
  /** How deep the hull sits at gauge fraction f, in px below the water. */
  const depth = (f: number): number => D0 + f * (HH - D0);
  const unitPx = (HH - D0) / span;
  const hull = layer(
    (g) => {
      // Local: the keel's middle at (100, 70), the gunwale 54 above, the bow to the right.
      g.translate(100, 70);
      const grd = g.createLinearGradient(0, -HH, 0, 0);
      grd.addColorStop(0, '#8a5d36');
      grd.addColorStop(1, '#4a2f1c');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(-90, -HH);
      g.lineTo(-82, -12);
      g.quadraticCurveTo(-78, 0, -60, 0);
      g.lineTo(54, 0);
      g.quadraticCurveTo(84, -4, 96, -HH - 8);
      g.quadraticCurveTo(4, -HH + 4, -90, -HH);
      g.closePath();
      g.fill();
      g.save();
      g.clip();
      g.strokeStyle = 'rgba(0,0,0,0.28)';
      g.lineWidth = 1;
      for (let y = -HH + 10; y < 0; y += 9) {
        g.beginPath();
        g.moveTo(-95, y);
        g.quadraticCurveTo(0, y + 3, 100, y - 6);
        g.stroke();
      }
      g.restore();
      g.strokeStyle = '#2f1d11';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-90, -HH + 2);
      g.quadraticCurveTo(4, -HH + 6, 94, -HH - 5);
      g.stroke();
    },
    200,
    80,
  );
  const bg = layer((g) => {
    const sky = g.createLinearGradient(0, 0, 0, 130);
    sky.addColorStop(0, '#1d2836');
    sky.addColorStop(1, '#6a5c48');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, 130);
    const r = rng(5);
    // The far bank: hills and trees.
    g.fillStyle = '#26301f';
    g.beginPath();
    g.moveTo(0, 124);
    for (let x = 0; x <= W; x += 20) g.lineTo(x, 104 + Math.sin(x * 0.02) * 8 + r() * 4);
    g.lineTo(W, 124);
    g.closePath();
    g.fill();
    g.fillStyle = '#1b2417';
    for (let i = 0; i < 22; i++) {
      const x = r() * W;
      const y = 108 + Math.sin(x * 0.02) * 8;
      g.beginPath();
      g.ellipse(x, y, 6 + r() * 6, 9 + r() * 6, 0, 0, TAU);
      g.fill();
    }
    // The river.
    const river = g.createLinearGradient(0, 124, 0, H);
    river.addColorStop(0, '#2c5862');
    river.addColorStop(1, '#0f2228');
    g.fillStyle = river;
    g.fillRect(0, 124, W, H - 124);
    // The dock, the hopper and the chute.
    g.fillStyle = '#3a2a1c';
    for (const x of [6, 44, 82]) g.fillRect(x, 120, 6, 50);
    g.fillStyle = '#6b4b2e';
    g.fillRect(0, 114, 96, 7);
    g.fillStyle = '#3a2a1c';
    g.fillRect(34, 76, 5, 39);
    g.fillRect(66, 76, 5, 39);
    g.fillRect(118, 80, 4, 36);
    g.fillStyle = '#5a3e26';
    g.beginPath();
    g.moveTo(22, 58);
    g.lineTo(76, 58);
    g.lineTo(66, 80);
    g.lineTo(32, 80);
    g.closePath();
    g.fill();
    g.fillStyle = '#4a4038';
    g.beginPath();
    g.ellipse(49, 59, 25, 4, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#6e4c2e';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(58, 78);
    g.lineTo(156, 80);
    g.stroke();
    g.strokeStyle = '#8a6440';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(58, 75);
    g.lineTo(156, 77);
    g.stroke();
    // Sacks on the dock.
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i === 1 ? '#8a7656' : '#7a6848';
      rrect(g, 4 + i * 13, 102 - (i === 1 ? 4 : 0), 14, 13, 4);
      g.fill();
    }
    paintScale(g, p, (f) => `rgb(${(40 + f * 30) | 0},${(70 + f * 20) | 0},${(80 - f * 30) | 0})`);
  });
  let grainT = 0;
  let foamT = 0;
  let bubbleT = 0;

  const waveY = (s: View, x: number): number =>
    yw - unitPx * wobble(s, s.t, x - x0) - 0.8 * Math.sin(x * 0.12 + s.t * 2.3);

  return {
    ghost: [100, 92],
    gold: 'scale',
    draw(g, s) {
      const u = s.end ? clamp(s.outro / OUTRO, 0, 1) : 0;
      g.drawImage(bg, 0, 0, W, H);
      const sink = s.end === 'high' ? 78 * u * u + 6 * u : 0;
      const sail = s.end === 'win' ? 150 * u * u : 0;
      const roll =
        (s.end === 'low' && p.low.fails !== 'never' ? 2.6 * u : 0) + 0.025 * Math.sin(s.t * 1.3 + s.ph1);
      const keel = yw + depth(s.fx) + sink;
      const bx = x0 + sail;
      const fl = clamp(s.fx, 0, 1);
      // Shovelled back onto the dock while held down.
      if (s.input < 0 && !s.end) {
        grainT += s.dt * 40;
        while (grainT > 1) {
          grainT--;
          fx.spawn(
            GRAIN,
            bx - 30 + Math.random() * 40,
            keel - HH - 4 - 20 * fl,
            -95 - Math.random() * 40,
            -150 - Math.random() * 40,
            0.62,
            Math.random() * 3,
          );
        }
      }
      // Ore pours down the chute while held.
      if (s.input > 0 && !s.end) {
        grainT += s.dt * 70;
        while (grainT > 1) {
          grainT--;
          const vy = 20 + Math.random() * 30;
          const d = Math.max(6, keel - HH - 8 - 26 * fl - 82);
          fx.spawn(
            GRAIN,
            156 + Math.random() * 3,
            82,
            22 + Math.random() * 16,
            vy,
            (-vy + Math.sqrt(vy * vy + 2 * 560 * d)) / 560,
            Math.random() * 3,
          );
        }
      }
      if (s.end === 'high' && u < 0.5) {
        bubbleT += s.dt * 40;
        while (bubbleT > 1) {
          bubbleT--;
          fx.spawn(
            WATER,
            bx - 60 + Math.random() * 130,
            keel - HH - 2,
            (Math.random() - 0.5) * 30,
            -40 - Math.random() * 30,
            0.5,
            2,
          );
        }
      }
      if (s.end === 'high' && u >= 0.3) {
        bubbleT += s.dt * 16;
        while (bubbleT > 1) {
          bubbleT--;
          fx.spawn(
            BUBBLE,
            bx - 50 + Math.random() * 100,
            keel - 20,
            (Math.random() - 0.5) * 10,
            -30,
            0.7,
            1.5 + Math.random() * 2,
          );
        }
      }
      g.save();
      g.translate(bx, keel);
      g.rotate(roll);
      // The heap of ore in the hold, the mast and its pennant.
      const hp = 2 + 30 * fl;
      g.fillStyle = '#5b4f49';
      g.beginPath();
      g.moveTo(-66, -HH + 6);
      g.quadraticCurveTo(-8, -HH + 6 - hp * 2, 52, -HH + 6);
      g.closePath();
      g.fill();
      g.fillStyle = '#7d6f66';
      for (let k = 0; k < 7; k++) {
        const hx = -50 + k * 14;
        const top = -HH + 6 - hp * 2 * (1 - Math.pow((hx + 8) / 60, 2)) * 0.5;
        g.fillRect(hx, top + 3 + (k % 3) * 2, 2, 2);
      }
      g.strokeStyle = '#2a1c10';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(66, -HH);
      g.lineTo(66, -HH - 62);
      g.stroke();
      const wav = Math.sin(s.t * 5) * 2;
      g.fillStyle = '#c8402e';
      g.beginPath();
      g.moveTo(67, -HH - 62);
      g.quadraticCurveTo(76, -HH - 60 + wav, 84, -HH - 57 + wav);
      g.lineTo(67, -HH - 52);
      g.closePath();
      g.fill();
      g.drawImage(hull, -100, -70, 200, 80);
      // The band painted along the hull, and the load line mark at its top.
      const yHi = -depth((s.hi - p.min) / span);
      const yLo = -depth((s.lo - p.min) / span);
      g.fillStyle = 'rgba(233,196,106,0.28)';
      g.fillRect(-74, yHi, 128, yLo - yHi);
      g.fillStyle = 'rgba(255,224,138,0.4)';
      g.fillRect(
        -74,
        -depth((s.phi - p.min) / span),
        128,
        depth((s.phi - p.min) / span) - depth((s.plo - p.min) / span),
      );
      g.strokeStyle = '#f1e6cf';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(-6, yHi, 5, 0, TAU);
      g.moveTo(-15, yHi);
      g.lineTo(3, yHi);
      g.stroke();
      g.restore();
      // The water in front: it hides what sits under the line.
      g.fillStyle = 'rgba(30,78,90,0.74)';
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) g.lineTo(x, waveY(s, x));
      g.lineTo(W, H);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(180,225,232,0.55)';
      g.lineWidth = 1.2;
      g.beginPath();
      for (let x = 0; x <= W; x += 8) {
        if (x) g.lineTo(x, waveY(s, x));
        else g.moveTo(x, waveY(s, x));
      }
      g.stroke();
      // Foam where the hull meets the water.
      foamT += s.dt;
      g.fillStyle = 'rgba(230,245,250,0.7)';
      for (let k = 0; k < 6; k++) {
        const fx0 = bx - 76 + k * 30 + Math.sin(foamT * 2 + k) * 3;
        g.fillRect(fx0, waveY(s, fx0) - 1, 8, 1.5);
      }
      if (s.end === 'high' && u > 0.55) {
        // Two sacks bob up where she went down.
        for (let k = 0; k < 2; k++) {
          const sxk = x0 - 24 + k * 46;
          g.fillStyle = '#8a7656';
          rrect(g, sxk - 6, waveY(s, sxk) - 6 + Math.sin(s.t * 3 + k) * 1.5, 12, 9, 3);
          g.fill();
        }
      }
      fx.draw(g);
      drawScale(g, p, s);
    },
  };
}

/** 'lander': a lander coming down on its engine over a grey airless world, onto the pad by the base. */
function landerLook(p: BandParams, fx: Fx): Look {
  const ground = 166;
  const padX = 206;
  const top = 40;
  const flame = glowSprite('150,200,255');
  const lampOn = glowSprite('120,255,160');
  const lampOff = glowSprite('255,90,60');
  const bg = layer((g) => {
    g.fillStyle = '#030408';
    g.fillRect(0, 0, W, H);
    const r = rng(23);
    for (let i = 0; i < 90; i++) {
      g.globalAlpha = 0.25 + r() * 0.75;
      g.fillStyle = r() < 0.2 ? '#ffe9c0' : '#e2eaff';
      g.fillRect(r() * W, r() * ground, r() < 0.1 ? 1.7 : 1, r() < 0.1 ? 1.7 : 1);
    }
    g.globalAlpha = 1;
    // Home, small and blue in the black sky.
    g.fillStyle = '#3f86c8';
    g.beginPath();
    g.arc(282, 62, 9, 0, TAU);
    g.fill();
    g.fillStyle = '#6fae5a';
    g.beginPath();
    g.ellipse(279, 60, 4, 2.5, 0.4, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(276, 66, 9, 1.5);
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
    for (let i = 0; i < 8; i++) {
      const x = r() * W;
      const y = ground + 10 + r() * 14;
      const w = 8 + r() * 14;
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(x, y, w, w * 0.3, 0, 0, TAU);
      g.fill();
    }
    g.fillStyle = '#c9ced6';
    g.beginPath();
    g.arc(60, ground + 3, 13, Math.PI, 0);
    g.fill();
    g.beginPath();
    g.arc(82, ground + 3, 9, Math.PI, 0);
    g.fill();
    g.fillStyle = '#6aa8ff';
    g.fillRect(54, ground - 4, 3, 2);
    g.fillRect(60, ground - 4, 3, 2);
    g.strokeStyle = '#9aa2ac';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(98, ground + 3);
    g.lineTo(98, ground - 22);
    g.stroke();
    g.fillStyle = '#7d838b';
    g.beginPath();
    g.ellipse(padX, ground + 4, 32, 6, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#e9c46a';
    g.lineWidth = 1.2;
    g.beginPath();
    g.ellipse(padX, ground + 4, 23, 4.2, 0, 0, TAU);
    g.stroke();
    paintScale(g, p, (f) => `rgb(${(50 + f * 60) | 0},${(70 + f * 40) | 0},${(100 - f * 30) | 0})`);
  });
  // Where the lander is: it sinks at the sinking speed, but can't touch down until the hold is done.
  let y = top;
  let tilt = 0;
  let fallV = 0;
  let gritT = 0;
  let landed = false;
  const ghost: [number, number] = [padX, top + 40];
  return {
    ghost,
    gold: 'scale',
    draw(g, s) {
      const u = s.end ? clamp(s.outro / OUTRO, 0, 1) : 0;
      g.drawImage(bg, 0, 0, W, H);
      const floor = ground - 15;
      let thrust = s.input > 0 && !s.end ? 1 : 0;
      if (!s.end) y = Math.min(floor - 8 * (1 - s.progress), y + s.v * s.dt * 3.2);
      else if (s.end === 'win') {
        // The last metres: a soft drop onto the legs, then the engine cuts.
        y = lerp(y, floor, Math.min(1, s.dt * 6));
        thrust = u < 0.45 ? 0.6 : 0;
        if (!landed && u > 0.45) {
          landed = true;
          for (let i = 0; i < 16; i++)
            fx.spawn(
              GRIT,
              padX + (Math.random() - 0.5) * 20,
              ground,
              (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * 140),
              -10 - Math.random() * 30,
              1,
              1,
            );
        }
      } else {
        // A hard landing: it drops, slams down and tips over, the engine sputtering out.
        fallV += 220 * s.dt;
        y = Math.min(floor, y + fallV * s.dt + (s.end === 'high' ? s.v * s.dt * 6 : 0));
        thrust = s.end === 'low' && Math.random() < 0.15 * (1 - u) ? 0.4 : 0;
        if (y >= floor) {
          tilt = lerp(tilt, 1.3, Math.min(1, s.dt * 5));
          if (!landed) {
            landed = true;
            for (let i = 0; i < 22; i++)
              fx.spawn(
                GRIT,
                padX + (Math.random() - 0.5) * 24,
                ground,
                (Math.random() < 0.5 ? -1 : 1) * (140 + Math.random() * 180),
                -20 - Math.random() * 60,
                1.1,
                1,
              );
          }
        }
      }
      const x = padX + Math.sin(s.t * 0.7) * 3 * (1 - s.progress) * (s.end ? 0 : 1);
      ghost[1] = y - 26;
      ghost[0] = x;
      // Its shadow grows as it nears the ground; dust flies straight out from under the engine.
      const near = clamp(1 - (floor - y) / 90, 0, 1);
      g.fillStyle = `rgba(0,0,0,${0.15 + 0.3 * near})`;
      g.beginPath();
      g.ellipse(x, ground + 4, 10 + 10 * near, 2.5, 0, 0, TAU);
      g.fill();
      if (thrust > 0 && floor - y < 46) {
        gritT += s.dt * 40 * thrust;
        while (gritT > 1) {
          gritT--;
          const side = Math.random() < 0.5 ? -1 : 1;
          fx.spawn(
            GRIT,
            x + side * 5,
            ground - 1,
            side * (140 + Math.random() * 160),
            -8 - Math.random() * 22,
            1,
            1,
          );
        }
      }
      fx.draw(g);
      // The pad's lamps: green once it's down safe, red when it isn't.
      const lamp = s.end === 'win' && landed ? lampOn : s.end && s.end !== 'win' ? lampOff : lampOn;
      const lit = s.end ? 1 : 0.35 + 0.35 * Math.sin(s.t * 4);
      glow(g, lamp, padX - 28, ground + 2, 6, lit);
      glow(g, lamp, padX + 28, ground + 2, 6, lit);
      g.save();
      g.translate(x, y);
      g.rotate(tilt);
      if (thrust > 0) {
        const fl = 0.85 + 0.15 * Math.sin(s.t * 40);
        glow(g, flame, 0, 14, 12, 0.9 * thrust);
        g.fillStyle = 'rgba(230,245,255,0.9)';
        g.beginPath();
        g.moveTo(-3, 9);
        g.lineTo(3, 9);
        g.lineTo(0, 9 + 24 * thrust * fl);
        g.closePath();
        g.fill();
      }
      const squash = s.end === 'win' && landed ? 1.5 : 0;
      g.strokeStyle = '#9aa2ac';
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(-8, 2);
      g.lineTo(-15, 13 - squash);
      g.moveTo(8, 2);
      g.lineTo(15, 13 - squash);
      g.stroke();
      g.fillStyle = '#c9ced6';
      g.fillRect(-18, 12 - squash, 6, 2);
      g.fillRect(12, 12 - squash, 6, 2);
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
      drawScale(g, p, s);
    },
  };
}

// ---- The kind -----------------------------------------------------------------------------------

export const band: MinigameDef<BandParams> = {
  kind: 'band',
  name: 'Hold the band',
  demo: demoFromUrl(),
  create: (host, p) => {
    const end = finisher(host);
    const updown = p.control === 'updown';
    const c = canvasIn(host, W, H);
    const g = c.g;
    // Space or F holds (or pushes up); the arrows or W / S push up and down.
    let keyHold = false;
    let keyUp = false;
    let keyDown = false;
    const key = (e: KeyboardEvent, down: boolean): void => {
      const k = e.code;
      if (k === 'Space' || k === 'KeyF') keyHold = down;
      else if (updown && (k === 'ArrowUp' || k === 'KeyW')) keyUp = down;
      else if (updown && (k === 'ArrowDown' || k === 'KeyS')) keyDown = down;
      else return;
      e.preventDefault();
      if (down) e.stopPropagation();
    };
    const kd = (e: KeyboardEvent): void => key(e, true);
    const ku = (e: KeyboardEvent): void => key(e, false);
    const blur = (): void => {
      keyHold = keyUp = keyDown = false;
    };
    window.addEventListener('keydown', kd, true);
    window.addEventListener('keyup', ku, true);
    window.addEventListener('blur', blur);

    const fx = new Fx();
    const look =
      p.style === 'gauge'
        ? gaugeLook(p, fx)
        : p.style === 'capsule'
          ? capsuleLook(p, fx, g)
          : p.style === 'load'
            ? loadLook(p, fx)
            : p.style === 'lander'
              ? landerLook(p, fx)
              : fireLook(p, fx);
    const span = p.max - p.min;
    const lag = Math.max(0.02, p.lag ?? 0.25);
    const grace = p.grace ?? 0.5;
    const limit = Math.min(40, Math.max(p.hold + 2, p.limit ?? p.hold * 2.5));
    const share = p.perfectShare ?? 0.6;
    const dis = p.disturb ?? {};
    const rand = rng(dis.seed ?? 7);
    const kick = dis.kick ?? 0;
    const every = dis.every ?? 2.5;
    const upShare = dis.up ?? 0.5;
    const tape = new Uint8Array(TAPE);
    const vignette = layer((vg) => {
      const grd = vg.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 230);
      grd.addColorStop(0, 'rgba(255,60,30,0)');
      grd.addColorStop(1, 'rgba(255,60,30,0.75)');
      vg.fillStyle = grd;
      vg.fillRect(0, 0, W, H);
    });

    const s: View = {
      t: 0,
      dt: 0,
      v: p.start,
      x: p.start,
      f: (p.start - p.min) / span,
      fx: (p.start - p.min) / span,
      lo: p.band[0],
      hi: p.band[1],
      plo: p.perfect[0],
      phi: p.perfect[1],
      input: 0,
      drive: 0,
      side: 0,
      danger: 0,
      progress: 0,
      end: '',
      outro: 0,
      wob: dis.wobble ?? 0,
      ph1: rand() * TAU,
      ph2: rand() * TAU,
    };
    // For tests and the playground: the run as it stands (read it, don't change it).
    (c.canvas as unknown as { mg: View }).mg = s;
    let rate = 0;
    let held = 0;
    let perfect = 0;
    let entered = false;
    let outT = 0;
    let outSide = 0;
    let slipped = false;
    let slips = 0;
    let outHigh = 0;
    let outLow = 0;
    let kickWait = every * (0.5 + rand() * 0.6);
    let kickT = 1;
    let kickLen = 1;
    let kickAmp = 0;
    let quality: Quality = 0;
    let why = '';

    const stop = (how: 'win' | 'high' | 'low', q: Quality, line: string): void => {
      s.end = how;
      s.outro = 0;
      quality = q;
      why = line;
    };

    const step = (dt: number): void => {
      const t = s.t;
      const sh = p.shift ? p.shift(t, held / p.hold) : 0;
      s.lo = p.band[0] + sh;
      s.hi = p.band[1] + sh;
      s.plo = p.perfect[0] + sh;
      s.phi = p.perfect[1] + sh;
      // What the player is doing.
      const ptr = c.pointer;
      if (updown) {
        const up = (ptr.down && ptr.y < H / 2) || keyUp || keyHold;
        const down = (ptr.down && ptr.y >= H / 2) || keyDown;
        s.input = up === down ? 0 : up ? 1 : -1;
      } else s.input = ptr.down || keyHold ? 1 : 0;
      s.drive += (s.input - s.drive) * Math.min(1, dt * 10);
      // It answers with a lag, drifts, and gets shoved now and then.
      const grow = 1 + ((dis.grow ?? 1) - 1) * (held / p.hold);
      const want = p.drift + s.input * p.push;
      rate += (want - rate) * (1 - Math.exp(-dt / lag));
      if (kick > 0 && (kickWait -= dt) <= 0) {
        kickWait = every * (0.6 + rand() * 0.8);
        kickLen = 0.45 + rand() * 0.35;
        kickT = 0;
        kickAmp = kick * (0.55 + rand() * 0.45) * (rand() < upShare ? 1 : -1);
      }
      let shove = 0;
      if (kickT < kickLen) {
        shove = kickAmp * grow * Math.sin((Math.PI * kickT) / kickLen);
        kickT += dt;
      }
      s.x += (rate + shove) * dt;
      if (s.x >= p.max) {
        s.x = p.max;
        rate = Math.min(rate, 0);
        if (p.high.fails !== 'never') return stop('high', 0, p.high.why);
      }
      if (s.x <= p.min) {
        s.x = p.min;
        rate = Math.max(rate, 0);
        if (p.low.fails !== 'never') return stop('low', 0, p.low.why);
      }
      s.wob = (dis.wobble ?? 0) * grow;
      s.v = clamp(s.x + wobble(s, t), p.min, p.max);
      s.f = (s.v - p.min) / span;
      s.fx = (s.x - p.min) / span;
      // In the band the hold counts (gold in the middle); out of it, it doesn't.
      const side = s.v > s.hi ? 1 : s.v < s.lo ? -1 : 0;
      if (side !== outSide) outT = 0;
      outSide = side;
      s.side = side;
      s.danger = 0;
      if (side === 0) {
        entered = true;
        slipped = false;
        const from = Math.floor((held / p.hold) * TAPE);
        held = Math.min(p.hold, held + dt);
        const best = s.v >= s.plo && s.v <= s.phi;
        if (best) perfect += dt;
        const to = Math.min(TAPE - 1, Math.floor((held / p.hold) * TAPE));
        for (let i = from; i <= to; i++) if (!tape[i]) tape[i] = best ? 2 : 1;
      } else {
        outT += dt;
        if (side > 0) outHigh += dt;
        else outLow += dt;
        if (entered && outT > 0.3 && !slipped) {
          slipped = true;
          slips++;
        }
        const edge = side > 0 ? p.high : p.low;
        if (edge.fails === 'band' && entered) {
          s.danger = clamp(outT / grace, 0, 1);
          if (outT > grace) return stop(side > 0 ? 'high' : 'low', 0, edge.why);
        }
      }
      // Near a fatal end of the gauge the danger shows too.
      if (p.high.fails === 'end' && s.v > s.hi)
        s.danger = Math.max(s.danger, clamp((s.v - s.hi) / (p.max - s.hi), 0, 1));
      if (p.low.fails === 'end' && s.v < s.lo)
        s.danger = Math.max(s.danger, clamp((s.lo - s.v) / (s.lo - p.min), 0, 1));
      s.progress = held / p.hold;
      if (held >= p.hold) {
        const best = slips === 0 && perfect >= share * p.hold;
        return stop('win', best ? 2 : 1, best ? p.words.perfect : p.words.good);
      }
      if (t >= limit) {
        const high = outHigh > outLow;
        stop(high ? 'high' : 'low', 0, high ? p.high.why : p.low.why);
      }
    };

    const fmt = (v: number): string => v.toFixed(p.decimals ?? 0);
    const keysHint = updown ? '↑ ↓, or click high / low' : 'click, Space or F';

    const overlay = (): void => {
      // The readout: what it is, how much, and the band (or which way it strayed).
      g.fillStyle = 'rgba(8,6,4,0.62)';
      rrect(g, 6, 5, 112, 48, 6);
      g.fill();
      text(g, p.label.toUpperCase(), 14, 14, { size: 9, color: PAL.dim, align: 'left' });
      const best = s.v >= s.plo && s.v <= s.phi;
      text(g, `${fmt(s.v)} ${p.unit}`, 14, 30, {
        size: 18,
        bold: true,
        color: s.side === 0 ? (best ? '#ffe08a' : PAL.gold) : s.side > 0 ? '#ff8a6a' : '#8ec5ff',
        align: 'left',
      });
      if (s.side !== 0 && !s.end) {
        const pulse = s.danger > 0 ? 0.55 + 0.45 * Math.sin(s.t * 14) : 1;
        g.globalAlpha = pulse;
        text(g, (s.side > 0 ? p.high : p.low).word, 14, 45, {
          size: 10,
          bold: true,
          color: s.side > 0 ? '#ff8a6a' : '#8ec5ff',
          align: 'left',
        });
        g.globalAlpha = 1;
      } else
        text(g, `band ${fmt(s.lo)}–${fmt(s.hi)} ${p.unit}`, 14, 45, {
          size: 9,
          color: PAL.faint,
          align: 'left',
        });
      // Up and down: the top half pushes it up, the bottom half down — shown at the left edge.
      if (updown && !s.end) {
        for (let d = 1; d >= -1; d -= 2) {
          const on = s.input === d;
          g.globalAlpha = on ? 1 : 0.45;
          g.fillStyle = 'rgba(8,6,4,0.6)';
          rrect(g, 4, d > 0 ? 62 : 158, 18, 22, 5);
          g.fill();
          text(g, d > 0 ? '▲' : '▼', 13, d > 0 ? 73 : 169, {
            size: 11,
            bold: true,
            color: on ? '#fff3c4' : PAL.gold,
          });
        }
        g.globalAlpha = 1;
      }
      // Danger: the edges glow red as it nears failing.
      if (s.danger > 0 && !s.end) {
        g.globalAlpha = s.danger * (0.5 + 0.5 * Math.sin(s.t * 14));
        g.drawImage(vignette, 0, 0, W, H);
        g.globalAlpha = 1;
      }
      // The hold tape (gold where it sat in the middle) and the time left beneath it.
      g.fillStyle = 'rgba(8,6,4,0.62)';
      g.fillRect(0, 188, W, H - 188);
      const x0 = 14;
      const tw = W - 28;
      g.fillStyle = '#251d14';
      rrect(g, x0, 192, tw, 7, 3.5);
      g.fill();
      const cw = tw / TAPE;
      for (let i = 0; i < TAPE; i++) {
        if (!tape[i]) continue;
        g.fillStyle = tape[i] === 2 ? '#ffd36a' : '#9c7d3a';
        g.fillRect(x0 + i * cw, 192, cw + 0.4, 7);
      }
      g.strokeStyle = '#5a4a30';
      g.lineWidth = 1;
      rrect(g, x0, 192, tw, 7, 3.5);
      g.stroke();
      const left = clamp(1 - s.t / limit, 0, 1);
      g.fillStyle = left < 0.25 ? (Math.sin(s.t * 10) > 0 ? '#ff6a5a' : '#8a3a30') : '#5a4a30';
      g.fillRect(x0, 202, tw * left, 2);
      text(g, `${p.words.hold} · ${keysHint}`, W / 2, 212, { size: 10, color: PAL.dim });
      // The first time: a ghost hand says when to hold and when to let go.
      if (host.guided && !s.end) {
        const need = s.v < s.plo ? 1 : s.v > s.phi ? -1 : 0;
        let label = '';
        if (updown) {
          if (need > 0 && s.input <= 0) label = '▲ UP · top half';
          else if (need < 0 && s.input >= 0) label = '▼ DOWN · bottom half';
        } else if (need !== 0) {
          const holdHelps = need * Math.sign(p.push) > 0;
          if (holdHelps && s.input === 0) label = 'HOLD';
          else if (!holdHelps && s.input > 0) label = 'LET GO';
        }
        if (label) ghost(g, look.ghost[0], look.ghost[1], label, s.t);
        if (s.t < 5) {
          g.globalAlpha = clamp(5 - s.t, 0, 1) * (0.7 + 0.3 * Math.sin(s.t * 5));
          if (look.gold === 'scale')
            text(g, 'keep it in the gold ▸', SX - 36, sy(((s.lo + s.hi) / 2 - p.min) / span), {
              size: 10,
              bold: true,
              color: PAL.gold,
              align: 'right',
            });
          else
            text(g, 'keep it in the gold', look.gold[0], look.gold[1], {
              size: 10,
              bold: true,
              color: PAL.gold,
            });
          g.globalAlpha = 1;
        }
      }
    };

    return {
      update(dt) {
        s.dt = dt;
        s.t += dt;
        if (!s.end) step(dt);
        else {
          s.outro += dt;
          s.input = 0;
          s.drive += (0 - s.drive) * Math.min(1, dt * 10);
          if (s.outro >= OUTRO) end.finish(quality, why);
        }
        fx.step(dt);
        look.draw(g, s);
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

/** A ghost hint: a pulsing ring where to act, and a word on what to do. */
function ghost(g: CanvasRenderingContext2D, x: number, y: number, label: string, t: number): void {
  const k = (t * 1.5) % 1;
  g.globalAlpha = 0.8 * (1 - k);
  g.strokeStyle = PAL.gold;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, y, 7 + k * 16, 0, TAU);
  g.stroke();
  g.globalAlpha = 0.95;
  g.font = `bold 10px ${FONT}`;
  const w = g.measureText(label).width + 14;
  g.fillStyle = 'rgba(20,16,10,0.88)';
  rrect(g, x - w / 2, y - 29, w, 16, 8);
  g.fill();
  g.strokeStyle = PAL.gold;
  g.lineWidth = 1;
  g.stroke();
  text(g, label, x, y - 21, { size: 10, bold: true, color: PAL.gold });
  g.globalAlpha = 1;
}
