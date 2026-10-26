export type { RatioLook } from './ratio-data.ts';
export type { RatioIngredient } from './ratio-data.ts';
export type { RatioParams } from './ratio-data.ts';
export { RATIO_DEMOS } from './ratio-data.ts';
import { RATIO_DEMOS } from './ratio-data.ts';
import type { RatioLook, RatioIngredient, RatioParams } from './ratio-data.ts';
/**
 * Mix the ratio (TECH_LINEAGE §4): pour two or three ingredients into a crucible, vat or bowl until
 * each sits at its share of the mix, then fire it. A gauge per ingredient shows its share live against
 * its band; then the batch is tested — cast into a bar and struck, left to set as a block, or lit — and
 * shows why it held or failed (too much tin and the bronze cracks, too little and it bends).
 *
 * Hold a spout (or its number key) to pour: a short press dribbles, a long one pours. Tiny shares go
 * in a pinch at a time. Overshot? Pour more of the rest to thin it out — the share is what counts, not
 * the amount — as long as the vessel has room.
 */
import type { Minigame, MinigameDef, MinigameHost, Quality } from './types.ts';
import { canvasIn, finisher, rrect, text, FONT, PAL } from './kit.ts';

const W = 380;
const H = 220;
/** The vessel: its centre, the inside of its floor, and its brim per kind. */
const CX = 98;
const BOT = 186;
const TOP = { crucible: 98, vat: 102, bowl: 122 } as const;
/** The gauges' column, and the dial used when there's only one gauge. */
const GX0 = 216;
const GX1 = 364;
const DIAL = { x: 290, y: 118, r: 48 };
/** The finishing button. */
const BTN = { x: 288, y: 177, w: 78, h: 26 };
/** How long the test plays before the verdict (s). */
const TEST_T = 1.75;
/** About how full a finished batch is (0–1): pour rates are set so each ingredient reaches its share of it in a few seconds. */
const TYPICAL_FILL = 0.8;

type RGB = [number, number, number];
const rgbOf = (hex: string): RGB => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const css = (c: RGB, f = 1, a = 1): string =>
  `rgba(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0},${a})`;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const ease = (k: number): number => 1 - (1 - clamp(k, 0, 1)) ** 3;

/** A rounded-up gauge end (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ). */
function niceCeil(v: number): number {
  const e = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= v - 1e-9) return m * e;
  return 10 * e;
}

/** A share as the gauges write it: one decimal, two below 1 %. */
const pctText = (v: number): string => (v < 1 && v > 0 ? v.toFixed(2) : v.toFixed(1));

/** A spark, grain, splash or chip: the shared pool, so nothing is allocated per frame. */
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  col: string;
  grav: number;
}

/** A gauge: the ingredient it reads, where it sits, its scale and its spring-loaded needle. */
interface Gauge {
  i: number;
  y: number;
  max: number;
  good: number;
  perfect: number;
  needle: number;
  vel: number;
}

/** A soft round glow (drawn once, stamped where something is hot). */
function glowSprite(r: number, g: number, b: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const x = cv.getContext('2d')!;
  const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grd.addColorStop(0.4, `rgba(${r},${g},${b},0.45)`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grd;
  x.fillRect(0, 0, 64, 64);
  return cv;
}

class RatioGame implements Minigame {
  private readonly host: MinigameHost;
  private readonly p: RatioParams;

  private readonly c: ReturnType<typeof canvasIn>;
  private readonly g: CanvasRenderingContext2D;
  private readonly end: ReturnType<typeof finisher>;
  private readonly ing: RatioIngredient[];
  private readonly rgb: RGB[];
  private readonly amt: number[];
  private readonly gauges: Gauge[] = [];
  private readonly px: number[] = [];
  private readonly dir: number[] = [];
  private readonly tilt: number[] = [];
  private readonly rate: number[] = [];
  private readonly pinchAmt: number[] = [];
  private readonly flick: number[] = [];
  private readonly minFill: number;
  private readonly top: number;
  private readonly back: HTMLCanvasElement;
  private readonly warm = glowSprite(255, 170, 70);
  private readonly white = glowSprite(255, 246, 220);
  private readonly shade: CanvasGradient;
  private readonly bits: Bit[] = [];
  private bitI = 0;
  /** Speckles in a bowl of powder: fixed spots, coloured by the shares. */
  private readonly speck: { x: number; y: number }[] = [];
  private readonly heldKeys = new Set<string>();
  private pour = -1;
  private byKey = false;
  private holdT = 0;
  private trickle = 0;
  private t = 0;
  private phase: 'mix' | 'test' = 'mix';
  private testT = 0;
  private outcome: { q: Quality; why: string; look: RatioLook | 'ok' } = { q: 0, why: '', look: 'ok' };
  private reading = '';
  private crack: number[] = [];
  /** Each ingredient's colours: plain, a highlight, its stream (and its lit core), its splashes and grains. */
  private readonly cols: { plain: string; hi: string; stream: string; core: string; light: string }[];
  /** The mix's colours, remade as it changes: the mix, its swirls and surface, and the cast piece's faces. */
  private mixCol = 'rgba(0,0,0,1)';
  private mixSwirl = 'rgba(0,0,0,0)';
  private mixSurface = 'rgba(0,0,0,0)';
  private pieceFront = 'rgba(0,0,0,1)';
  private pieceTop = 'rgba(0,0,0,1)';
  private pieceDark = 'rgba(0,0,0,1)';
  private mixRgb: RGB = [0, 0, 0];
  private nudge = 0;
  private spill = 0;
  private struck = false;
  private stage: HTMLCanvasElement | null = null;

  constructor(host: MinigameHost, p: RatioParams) {
    this.host = host;
    this.p = p;

    if (p.ingredients.length < 2 || p.ingredients.length > 3)
      throw new Error('Mixing needs two or three ingredients');
    // Every ingredient array is built in the same order. Indices come from bounded input loops or stored gauges.
    this.ing = p.ingredients;
    this.rgb = this.ing.map((i) => rgbOf(i.colour));
    this.cols = this.rgb.map((c) => ({
      plain: css(c),
      hi: css(c, 1.5, 0.7),
      stream: css(c, 0.85),
      core: css(c, 1.35, 0.8),
      light: css(c, 1.2),
    }));
    this.amt = this.ing.map(() => 0);
    this.minFill = p.minFill ?? 0.6;
    this.top = TOP[p.vessel];
    const n = this.ing.length;
    const xs = n === 2 ? [58, 138] : n === 3 ? [36, 98, 160] : [98];
    let big = 0;
    for (let i = 0; i < n; i++) if (this.ing[i]!.share > this.ing[big]!.share) big = i;
    for (let i = 0; i < n; i++) {
      const ing = this.ing[i]!;
      this.px.push(xs[i]! ?? 98);
      this.dir.push(xs[i]! > CX + 1 ? -1 : 1);
      this.tilt.push(0);
      this.flick.push(0);
      // A full stream takes about 3 s to pour the bulk, 2.4 s for a minor share: tiny ones go by the pinch.
      this.rate.push(((ing.share / 100) * TYPICAL_FILL) / (i === big ? 3 : 2.4));
      const tol: [number, number] = ing.tolerance ?? [ing.share * 0.3, ing.share * 0.1];
      this.pinchAmt.push((tol[1] / 100) * TYPICAL_FILL * 0.6);
      if (ing.tolerance) {
        const [good, perfect] = ing.tolerance;
        this.gauges.push({
          i,
          y: 0,
          max: ing.max ?? niceCeil(ing.share + Math.max(ing.share, 2.5 * good)),
          good,
          perfect,
          needle: 0,
          vel: 0,
        });
      }
    }
    const m = this.gauges.length;
    const y0 = m === 2 ? 56 : 46;
    const step = m === 3 ? 42 : 52;
    this.gauges.forEach((ga, k) => (ga.y = y0 + k * step));
    for (let i = 0; i < 110; i++)
      this.bits.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, col: '#fff', grav: 0 });
    for (let i = 0; i < 90; i++) {
      // Spread over the bowl's inside (a half ellipse), denser low down.
      const u = Math.random() * 2 - 1;
      const v = Math.sqrt(Math.random());
      this.speck.push({
        x: CX + u * 46 * Math.sqrt(1 - v * v * 0.6),
        y: BOT - 3 - v * (BOT - this.top) * 0.98 * (1 - Math.abs(u) * 0.35),
      });
    }
    this.end = finisher(host);
    this.c = canvasIn(host, W, H, { down: (q) => this.down(q.x, q.y), up: () => this.release(false) });
    this.g = this.c.g;
    this.shade = this.g.createLinearGradient(0, this.top, 0, BOT);
    this.shade.addColorStop(0, 'rgba(0,0,0,0)');
    this.shade.addColorStop(1, 'rgba(0,0,0,0.38)');
    this.back = this.paintBack();
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
  }

  // ---- Input ---------------------------------------------------------------------------------------

  private readonly onKey = (e: KeyboardEvent): void => {
    const k = e.key;
    const idx = k >= '1' && k <= '9' ? Number(k) - 1 : -1;
    const ours = (idx >= 0 && idx < this.ing.length) || k === 'Enter' || k === ' ';
    if (!ours) return;
    if (e.type === 'keyup' && !this.heldKeys.has(k)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'keydown') {
      this.heldKeys.add(k);
      if (e.repeat) return;
      if (idx >= 0) this.start(idx, true);
      else this.fire();
    } else {
      this.heldKeys.delete(k);
      if (idx >= 0 && this.pour === idx && this.byKey) this.release(true);
    }
  };

  private down(x: number, y: number): void {
    if (this.phase !== 'mix' || this.end.finished()) return;
    const i = this.pourerAt(x, y);
    if (i >= 0) this.start(i, false);
    else if (x >= BTN.x && x <= BTN.x + BTN.w && y >= BTN.y && y <= BTN.y + BTN.h) this.fire();
  }

  private pourerAt(x: number, y: number): number {
    if (y < 0 || y > 62) return -1;
    for (let i = 0; i < this.ing.length; i++) if (Math.abs(x - this.px[i]!) < 27) return i;
    return -1;
  }

  private start(i: number, byKey: boolean): void {
    if (this.phase !== 'mix' || this.end.finished()) return;
    this.pour = i;
    this.byKey = byKey;
    this.holdT = 0;
    this.trickle = 0;
    if (this.ing[i]!.pinch) this.addPinch(i);
  }

  private release(byKey: boolean): void {
    if (this.pour >= 0 && this.byKey === byKey) this.pour = -1;
  }

  // ---- The mix -------------------------------------------------------------------------------------

  private total(): number {
    let s = 0;
    for (const a of this.amt) s += a;
    return s;
  }

  private share(i: number): number {
    const t = this.total();
    return t > 0 ? (this.amt[i]! / t) * 100 : 0;
  }

  /** Pours `a` of ingredient `i` in; past the brim, the mix spills over (the shares stay). */
  private add(i: number, a: number): void {
    this.amt[i]! += a;
    const t = this.total();
    if (t > 1) {
      for (let k = 0; k < this.amt.length; k++) this.amt[k]! /= t;
      if (this.spill < 0.5)
        for (let k = 0; k < 3; k++)
          this.spawn(
            CX + (Math.random() < 0.5 ? -1 : 1) * (this.p.vessel === 'bowl' ? 52 : 44),
            this.top,
            (Math.random() - 0.5) * 30,
            10,
            0.7,
            2,
            this.mixCol,
            260,
          );
      this.spill = 1;
    }
    this.mixRgb = this.blend();
    this.mixCol = css(this.mixRgb);
    this.mixSwirl = css(this.mixRgb, 1.5, 0.2);
    this.mixSurface = css(this.mixRgb, 1.45, 0.9);
  }

  private addPinch(i: number): void {
    this.add(i, this.pinchAmt[i]!);
    this.flick[i] = 1;
    const lx = this.lipX(i);
    for (let k = 0; k < 5; k++)
      this.spawn(
        lx + (Math.random() - 0.5) * 4,
        44,
        (CX - lx) * 0.9 + (Math.random() - 0.5) * 14,
        20 + Math.random() * 30,
        0.9,
        1.6,
        this.cols[i]!.light,
        420,
      );
  }

  private blend(): RGB {
    const t = this.total();
    if (t <= 0) return [0, 0, 0];
    let r = 0;
    let gg = 0;
    let b = 0;
    for (let i = 0; i < this.amt.length; i++) {
      const w = this.amt[i]! / t;
      r += this.rgb[i]![0] * w;
      gg += this.rgb[i]![1] * w;
      b += this.rgb[i]![2] * w;
    }
    return [r, gg, b];
  }

  private levelY(): number {
    return BOT - Math.min(1, this.total()) * (BOT - this.top);
  }

  private spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    col: string,
    grav: number,
  ): void {
    // The pool is allocated with 110 bits before use; bitI always advances modulo its length.
    const b = this.bits[this.bitI]!;
    this.bitI = (this.bitI + 1) % this.bits.length;
    b.x = x;
    b.y = y;
    b.vx = vx;
    b.vy = vy;
    b.life = b.max = life;
    b.size = size;
    b.col = col;
    b.grav = grav;
  }

  /** How the mix stands now: the worst-off ingredient, by how far out of its band it is (1 = the edge). */
  private judge(): { worst: number; e: number; perfect: boolean } {
    let worst = -1;
    let e = 0;
    let perfect = true;
    for (const ga of this.gauges) {
      const d = Math.abs(this.share(ga.i) - this.ing[ga.i]!.share);
      if (d / ga.good > e || worst < 0) {
        e = d / ga.good;
        worst = ga.i;
      }
      if (d > ga.perfect) perfect = false;
    }
    return { worst, e, perfect };
  }

  private fire(): void {
    if (this.phase !== 'mix' || this.end.finished()) return;
    if (this.total() < this.minFill - 1e-6) {
      this.nudge = 1;
      return;
    }
    this.pour = -1;
    const j = this.judge();
    const ing = j.worst >= 0 ? this.ing[j.worst]! : undefined;
    if (ing && j.e > 1) {
      const low = this.share(j.worst) < ing.share;
      const words: [string, string] = ing.words ?? ['too weak', 'spoilt'];
      const why = low
        ? (ing.whyLow ?? `Too little ${ing.name.toLowerCase()}: ${words[0]}.`)
        : (ing.whyHigh ?? `Too much ${ing.name.toLowerCase()}: ${words[1]}.`);
      this.outcome = { q: 0, why, look: this.lookFor(ing.looks?.[low ? 0 : 1], low) };
    } else
      this.outcome = j.perfect
        ? { q: 2, why: this.p.whyPerfect, look: 'ok' }
        : { q: 1, why: this.p.whyGood, look: 'ok' };
    this.reading = this.ing.map((g, i) => `${g.name} ${this.readPct(this.share(i))} %`).join(' · ');
    this.pieceFront = css(this.mixRgb, 0.92);
    this.pieceTop = css(this.mixRgb, 1.3);
    this.pieceDark = css(this.mixRgb, 0.55);
    // A jagged crack down the middle, in case it cracks.
    // Nine crack vertices are populated before the test scene can draw them.
    this.crack = [];
    for (let k = 0; k <= 5; k++)
      this.crack.push(
        (k === 0 || k === 5 ? 0 : (k % 2 ? 1 : -1) * (3 + Math.random() * 5)) + (Math.random() - 0.5) * 3,
      );
    this.phase = 'test';
    this.testT = 0;
  }

  private readPct(v: number): string {
    return v < 2 ? v.toFixed(1) : Math.round(v).toString();
  }

  /** The failure look that suits the test (a cast bar can't fizzle, a heap of powder can't bend). */
  private lookFor(want: RatioLook | undefined, low: boolean): RatioLook {
    const t = this.p.test;
    if (t === 'burn') return 'fizzle';
    const l = want ?? (t === 'cast' ? (low ? 'bend' : 'crack') : 'crumble');
    if (t === 'set') return l === 'bend' || l === 'fizzle' ? 'crumble' : l;
    return l === 'crumble' || l === 'fizzle' ? 'crack' : l;
  }

  // ---- Frame -------------------------------------------------------------------------------------

  update(dt: number): void {
    this.t += dt;
    const live = this.phase === 'mix' && !this.end.finished();
    if (live && this.pour >= 0) {
      const i = this.pour;
      this.holdT += dt;
      if (this.ing[i]!.pinch) {
        if (this.holdT > 0.35) {
          this.trickle += dt * 5;
          while (this.trickle >= 1) {
            this.trickle -= 1;
            this.addPinch(i);
          }
        }
      } else {
        this.add(i, this.rate[i]! * Math.min(1, 0.22 + this.holdT * 1.5) * dt);
        if (Math.random() < 0.5)
          this.spawn(
            this.streamX(i),
            this.levelY(),
            (Math.random() - 0.5) * 40,
            -30 - Math.random() * 40,
            0.35,
            1.5,
            this.cols[i]!.light,
            380,
          );
      }
    }
    for (let i = 0; i < this.ing.length; i++) {
      const want = i === this.pour && live ? (this.ing[i]!.pinch ? 0.3 : 0.95) : 0;
      this.tilt[i]! += (want - this.tilt[i]!) * Math.min(1, dt * 12);
      this.flick[i] = Math.max(0, this.flick[i]! - dt * 5);
    }
    for (const ga of this.gauges) {
      const want = this.total() > 0 ? Math.min(this.share(ga.i), ga.max * 1.04) : 0;
      ga.vel += (180 * (want - ga.needle) - 16 * ga.vel) * dt;
      ga.needle += ga.vel * dt;
    }
    for (const b of this.bits) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.vy += b.grav * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (this.phase === 'test') {
        const floor = this.floorAt(b.x) - b.size / 2;
        if (b.y > floor && b.vy > 0) {
          b.y = floor;
          b.vy *= -0.25;
          b.vx *= 0.5;
        }
      }
    }
    this.nudge = Math.max(0, this.nudge - dt * 2.5);
    this.spill = Math.max(0, this.spill - dt * 1.5);
    this.draw();
    if (this.phase === 'test') {
      this.testT += dt;
      if (this.testT >= TEST_T) this.end.finish(this.outcome.q, this.outcome.why);
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKey, true);
    this.c.dispose();
  }

  // ---- Drawing: the still parts, once --------------------------------------------------------------

  private paintBack(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = W * 2;
    cv.height = H * 2;
    const g = cv.getContext('2d')!;
    g.scale(2, 2);
    g.fillStyle = PAL.bg;
    g.fillRect(0, 0, W, H);
    const v = g.createRadialGradient(CX, 150, 10, CX, 150, 200);
    v.addColorStop(0, this.p.vessel === 'crucible' ? 'rgba(255,140,60,0.13)' : 'rgba(255,220,160,0.06)');
    v.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
    // The gauges' panel.
    rrect(g, 206, 6, 168, 208, 6);
    g.fillStyle = 'rgba(33,27,20,0.92)';
    g.fill();
    g.strokeStyle = PAL.line;
    g.lineWidth = 1;
    g.stroke();
    text(g, this.p.product, 290, 19, { size: 14, bold: true, color: PAL.gold });
    // The mix strip (filled live): every ingredient's part of the whole.
    rrect(g, 232, 29, 116, 6, 3);
    g.fillStyle = '#0b0907';
    g.fill();
    g.strokeStyle = '#4a3c26';
    g.stroke();
    if (this.gauges.length === 1) this.paintDial(g, this.gauges[0]!);
    else for (const ga of this.gauges) this.paintTrack(g, ga);
    this.paintVessel(g);
    return cv;
  }

  private gx(ga: Gauge, v: number): number {
    return GX0 + (clamp(v, 0, ga.max) / ga.max) * (GX1 - GX0);
  }

  /** The dial's angle for a share (an upper half circle, left to right). */
  private da(ga: Gauge, v: number): number {
    return Math.PI + 0.14 + (clamp(v, 0, ga.max * 1.04) / ga.max) * (Math.PI - 0.28);
  }

  private paintDial(g: CanvasRenderingContext2D, ga: Gauge): void {
    const ing = this.ing[ga.i]!;
    const { x, y, r } = DIAL;
    const s = ing.share;
    g.lineCap = 'butt';
    g.strokeStyle = '#5a4a30';
    g.lineWidth = 14;
    g.beginPath();
    g.arc(x, y, r, this.da(ga, 0), this.da(ga, ga.max));
    g.stroke();
    g.strokeStyle = '#0b0907';
    g.lineWidth = 12;
    g.stroke();
    g.lineWidth = 9;
    g.strokeStyle = 'rgba(125,255,154,0.28)';
    g.beginPath();
    g.arc(x, y, r, this.da(ga, s - ga.good), this.da(ga, s + ga.good));
    g.stroke();
    g.strokeStyle = 'rgba(233,196,106,0.7)';
    g.beginPath();
    g.arc(
      x,
      y,
      r,
      this.da(ga, s - ga.perfect),
      Math.max(this.da(ga, s + ga.perfect), this.da(ga, s - ga.perfect) + 0.03),
    );
    g.stroke();
    g.strokeStyle = 'rgba(191,179,154,0.5)';
    g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k <= 10; k++) {
      const a = this.da(ga, (ga.max * k) / 10);
      const r0 = r + 8;
      const r1 = r + (k % 5 === 0 ? 13 : 10.5);
      g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    }
    g.stroke();
    text(g, '0', x - r - 1, y + 8, { size: 9, color: PAL.faint });
    text(g, `${ga.max} %`, x + r + 1, y + 8, { size: 9, color: PAL.faint });
    if (ing.words) {
      // The end words under the reading, at each side.
      g.font = `italic 10px ${FONT}`;
      g.fillStyle = PAL.dim;
      g.textAlign = 'left';
      g.fillText(`← ${ing.words[0]}`, x - r - 10, y + 39);
      g.textAlign = 'right';
      g.fillText(`${ing.words[1]} →`, x + r + 10, y + 39);
    }
    // What the dial reads, over it.
    g.font = `11px ${FONT}`;
    const cap = `${ing.name} in the mix`;
    const nw = g.measureText(cap).width;
    g.fillStyle = ing.colour;
    g.beginPath();
    g.arc(x - nw / 2 - 5, 45, 3.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(244,234,214,0.5)';
    g.stroke();
    text(g, cap, x + 4, 45, { size: 11, color: PAL.dim });
  }

  private paintTrack(g: CanvasRenderingContext2D, ga: Gauge): void {
    const ing = this.ing[ga.i]!;
    const y = ga.y + 14;
    // Name with its colour swatch; the reading goes on the right, live.
    g.fillStyle = ing.colour;
    g.beginPath();
    g.arc(GX0 + 4, ga.y + 4, 4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(244,234,214,0.5)';
    g.lineWidth = 1;
    g.stroke();
    text(g, ing.name, GX0 + 13, ga.y + 4, { size: 12, align: 'left' });
    rrect(g, GX0 - 2, y - 1, GX1 - GX0 + 4, 12, 5);
    g.fillStyle = '#0b0907';
    g.fill();
    g.strokeStyle = '#5a4a30';
    g.stroke();
    const s = ing.share;
    g.fillStyle = 'rgba(125,255,154,0.24)';
    g.fillRect(this.gx(ga, s - ga.good), y + 1, this.gx(ga, s + ga.good) - this.gx(ga, s - ga.good), 8);
    g.fillStyle = 'rgba(233,196,106,0.62)';
    g.fillRect(
      this.gx(ga, s - ga.perfect),
      y + 1,
      Math.max(2, this.gx(ga, s + ga.perfect) - this.gx(ga, s - ga.perfect)),
      8,
    );
    g.strokeStyle = 'rgba(191,179,154,0.45)';
    g.beginPath();
    for (let k = 0; k <= 10; k++) {
      const x = GX0 + ((GX1 - GX0) * k) / 10;
      g.moveTo(x, y + 12);
      g.lineTo(x, y + (k % 5 === 0 ? 17 : 14.5));
    }
    g.stroke();
    text(g, '0', GX0, y + 23, { size: 8.5, color: PAL.faint });
    text(g, `${ga.max} %`, GX1, y + 23, { size: 8.5, color: PAL.faint });
    const words = ing.words;
    if (words) {
      g.font = `italic 10px ${FONT}`;
      g.fillStyle = PAL.dim;
      g.textAlign = 'left';
      g.fillText(`← ${words[0]}`, GX0 + 12, y + 23);
      g.textAlign = 'right';
      g.fillText(`${words[1]} →`, GX1 - 16, y + 23);
    }
  }

  /** The vessel's inside (the path the mix fills). */
  private inside(g: CanvasRenderingContext2D): void {
    const top = this.top;
    g.beginPath();
    if (this.p.vessel === 'crucible') {
      g.moveTo(CX - 40, top);
      g.lineTo(CX - 30, BOT - 12);
      g.quadraticCurveTo(CX - 28, BOT, CX - 16, BOT);
      g.lineTo(CX + 16, BOT);
      g.quadraticCurveTo(CX + 28, BOT, CX + 30, BOT - 12);
      g.lineTo(CX + 40, top);
    } else if (this.p.vessel === 'vat') {
      g.moveTo(CX - 44, top);
      g.lineTo(CX - 41, BOT);
      g.lineTo(CX + 41, BOT);
      g.lineTo(CX + 44, top);
    } else {
      g.moveTo(CX - 54, top);
      g.ellipse(CX, top, 54, BOT - top, 0, Math.PI, 0, true);
    }
  }

  private paintVessel(g: CanvasRenderingContext2D): void {
    const top = this.top;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (this.p.vessel === 'crucible') {
      // Coals under it.
      for (let k = 0; k < 9; k++) {
        const x = CX - 44 + k * 11;
        g.fillStyle = k % 2 ? '#3a1a10' : '#5a2412';
        g.beginPath();
        g.ellipse(x, 204 + (k % 3), 8, 5, 0, 0, Math.PI * 2);
        g.fill();
      }
      this.inside(g);
      g.strokeStyle = '#5c4334';
      g.lineWidth = 15;
      g.stroke();
      this.inside(g);
      g.strokeStyle = '#7a5a45';
      g.lineWidth = 9;
      g.stroke();
      g.strokeStyle = '#9a7558';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(CX - 47, top - 1);
      g.lineTo(CX - 37, BOT - 10);
      g.stroke();
    } else if (this.p.vessel === 'vat') {
      g.fillStyle = '#5e4128';
      g.fillRect(CX - 52, top - 6, 104, BOT - top + 14);
      g.strokeStyle = '#3e2a18';
      g.lineWidth = 1;
      for (let k = 1; k < 8; k++) {
        g.beginPath();
        g.moveTo(CX - 52 + k * 13, top - 6);
        g.lineTo(CX - 52 + k * 13, BOT + 8);
        g.stroke();
      }
      for (const y of [top + 14, BOT - 12]) {
        g.fillStyle = '#34322f';
        g.fillRect(CX - 54, y, 108, 6);
        g.fillStyle = '#6b6862';
        g.fillRect(CX - 54, y, 108, 1.5);
      }
    } else {
      g.fillStyle = '#4b4741';
      g.fillRect(CX - 40, BOT + 6, 80, 8);
      this.inside(g);
      g.strokeStyle = '#6a655c';
      g.lineWidth = 14;
      g.stroke();
      this.inside(g);
      g.strokeStyle = '#857f74';
      g.lineWidth = 6;
      g.stroke();
    }
    this.inside(g);
    g.closePath();
    g.fillStyle = '#0c0907';
    g.fill();
    // The fill line, and the brim.
    const fy = BOT - this.minFill * (BOT - top);
    g.setLineDash([3, 3]);
    g.strokeStyle = 'rgba(233,196,106,0.5)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(CX - 34, fy);
    g.lineTo(CX + 34, fy);
    g.stroke();
    g.setLineDash([]);
    text(g, 'fill', CX - (this.p.vessel === 'bowl' ? 72 : 62), fy, {
      size: 10,
      color: 'rgba(233,196,106,0.7)',
    });
    g.lineCap = 'butt';
  }

  // ---- Drawing: every frame ----------------------------------------------------------------------------

  private draw(): void {
    const g = this.g;
    g.drawImage(this.back, 0, 0, W, H);
    if (this.p.vessel === 'crucible') this.drawFlames();
    this.drawMix();
    this.drawFillLine();
    for (let i = 0; i < this.ing.length; i++)
      if (i === this.pour && !this.ing[i]!.pinch && this.phase === 'mix') this.drawStream(i);
    this.drawBits();
    for (let i = 0; i < this.ing.length; i++) this.drawPourer(i);
    this.drawStrip();
    for (const ga of this.gauges) this.drawNeedle(ga);
    this.drawStatus();
    if (this.host.guided && this.phase === 'mix') this.drawGuide();
    if (this.phase === 'test') this.drawTest();
  }

  private drawFlames(): void {
    const g = this.g;
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 7; k++) {
      const x = CX - 36 + k * 12;
      const h = 14 + 7 * Math.sin(this.t * (7 + k) + k * 1.7) + 4 * Math.sin(this.t * 13 + k);
      g.fillStyle = k % 2 ? 'rgba(255,110,40,0.55)' : 'rgba(255,170,60,0.5)';
      g.beginPath();
      g.moveTo(x - 6, 208);
      g.quadraticCurveTo(x - 5, 200 - h * 0.4, x + Math.sin(this.t * 5 + k) * 3, 204 - h);
      g.quadraticCurveTo(x + 5, 200 - h * 0.4, x + 6, 208);
      g.fill();
    }
    g.globalAlpha = 0.35 + 0.1 * Math.sin(this.t * 9);
    g.drawImage(this.warm, CX - 60, 168, 120, 50);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  private drawMix(): void {
    const g = this.g;
    const tot = this.total();
    if (tot <= 0.0005) return;
    const ly = this.levelY();
    g.save();
    this.inside(g);
    g.closePath();
    g.clip();
    g.fillStyle = this.mixCol;
    if (this.p.vessel === 'vat') {
      g.beginPath();
      g.moveTo(CX - 50, BOT + 2);
      for (let x = -50; x <= 50; x += 10)
        g.lineTo(CX + x, ly + Math.sin(this.t * 3 + x * 0.12) * (this.pour >= 0 ? 1.6 : 0.8));
      g.lineTo(CX + 50, BOT + 2);
      g.fill();
    } else if (this.p.vessel === 'bowl') {
      g.fillRect(CX - 60, ly, 120, BOT - ly + 4);
      g.beginPath();
      g.ellipse(CX, ly, 36 * Math.min(1, tot * 3 + 0.3), 4, 0, Math.PI, 0);
      g.fill();
      // Grains of each ingredient, as many as its share.
      const n = this.speck.length;
      let cut = 0;
      let k = 0;
      for (let j = 0; j < n; j++) {
        while (k < this.amt.length - 1 && j >= cut + (this.amt[k]! / tot) * n) {
          cut += (this.amt[k]! / tot) * n;
          k++;
        }
        const s = this.speck[(j * 37) % n]!;
        if (s.y < ly + 1) continue;
        g.fillStyle = this.cols[k]!.light;
        g.fillRect(s.x, s.y, 1.6, 1.6);
      }
    } else g.fillRect(CX - 50, ly, 100, BOT - ly + 4);
    if (this.p.vessel === 'crucible' && BOT - ly > 16) {
      // Molten: slow bright swirls under the surface.
      g.fillStyle = this.mixSwirl;
      for (let k = 0; k < 3; k++) {
        const x = CX + Math.sin(this.t * 0.7 + k * 2.1) * 20;
        const y = ly + 8 + ((k * 13 + this.t * 5) % (BOT - ly - 10));
        g.beginPath();
        g.ellipse(x, y, 9 + k * 3, 2.2, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = this.shade;
    g.fillRect(CX - 60, this.top, 120, BOT - this.top + 4);
    // The surface catches the light (and glows, molten).
    g.fillStyle = this.mixSurface;
    g.fillRect(CX - 56, ly, 112, 1.6);
    g.restore();
    if (this.p.vessel === 'crucible') {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.35 + 0.08 * Math.sin(this.t * 6);
      g.drawImage(this.warm, CX - 44, ly - 12, 88, 26);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    if (this.spill > 0) {
      g.globalAlpha = this.spill;
      g.fillStyle = this.mixCol;
      g.fillRect(CX - (this.p.vessel === 'bowl' ? 56 : 48), this.top - 2, 4, 6 + (1 - this.spill) * 10);
      g.fillRect(CX + (this.p.vessel === 'bowl' ? 52 : 44), this.top - 2, 4, 6 + (1 - this.spill) * 14);
      g.globalAlpha = 1;
    }
  }

  private drawFillLine(): void {
    if (this.phase !== 'mix') return;
    const short = this.total() < this.minFill - 1e-6;
    if (!short && this.nudge <= 0) return;
    // Below the line the mark pulses (and shakes when you try to fire too soon).
    const g = this.g;
    const fy = BOT - this.minFill * (BOT - this.top);
    const sx = Math.sin(this.t * 60) * 3 * this.nudge;
    g.globalAlpha = this.nudge > 0 ? 1 : 0.25 + 0.2 * Math.sin(this.t * 4);
    g.setLineDash([3, 3]);
    g.strokeStyle = this.nudge > 0 ? PAL.bad : PAL.gold;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(CX - 34 + sx, fy);
    g.lineTo(CX + 34 + sx, fy);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
  }

  private lipX(i: number): number {
    const a = this.tilt[i]! * this.dir[i]!;
    return this.px[i]! + Math.cos(a) * 14 * this.dir[i]! + Math.sin(a) * 22;
  }

  private lipY(i: number): number {
    const a = this.tilt[i]! * this.dir[i]!;
    return 46 + Math.sin(a) * 14 * this.dir[i]! - Math.cos(a) * 22;
  }

  private streamX(i: number): number {
    return CX + (this.px[i]! < CX - 1 ? -8 : this.px[i]! > CX + 1 ? 8 : 2);
  }

  private drawStream(i: number): void {
    const g = this.g;
    const lx = this.lipX(i);
    const ly = this.lipY(i);
    const sx = this.streamX(i);
    const sy = this.levelY();
    const w = 1.5 + 3.2 * Math.min(1, 0.22 + this.holdT * 1.5);
    const wob = Math.sin(this.t * 30) * 0.8;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(lx, ly);
    g.quadraticCurveTo(sx + wob, ly + 4, sx + wob, sy);
    g.strokeStyle = 'rgba(255,236,200,0.16)';
    g.lineWidth = w + 2;
    g.stroke();
    g.strokeStyle = this.cols[i]!.stream;
    g.lineWidth = w;
    g.stroke();
    g.strokeStyle = this.cols[i]!.core;
    g.lineWidth = Math.max(0.8, w * 0.35);
    g.stroke();
    g.lineCap = 'butt';
  }

  private drawBits(): void {
    const g = this.g;
    for (const b of this.bits) {
      if (b.life <= 0) continue;
      g.globalAlpha = Math.min(1, (b.life / b.max) * 1.6);
      g.fillStyle = b.col;
      g.fillRect(b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
    }
    g.globalAlpha = 1;
  }

  private drawPourer(i: number): void {
    const g = this.g;
    const ing = this.ing[i]!;
    const x = this.px[i]!;
    const hot = this.pour === i;
    const hover = this.phase === 'mix' && this.pourerAt(this.c.pointer.x, this.c.pointer.y) === i;
    // Label: the key in a little box, then the name.
    g.font = `11px ${FONT}`;
    const lw = g.measureText(ing.name).width;
    const kx = x - (lw + 13) / 2;
    rrect(g, kx, 3, 10, 11, 2);
    g.strokeStyle = 'rgba(233,196,106,0.55)';
    g.lineWidth = 1;
    g.stroke();
    text(g, `${i + 1}`, kx + 5, 9, { size: 8.5, color: PAL.gold });
    text(g, ing.name, kx + 13, 9, { size: 11, color: hot || hover ? PAL.ink : PAL.dim, align: 'left' });
    g.save();
    g.translate(x, 46);
    g.rotate(this.tilt[i]! * this.dir[i]! + Math.sin(this.flick[i]! * Math.PI) * 0.25 * this.dir[i]!);
    const col = this.cols[i]!;
    if (ing.pinch) {
      // A small dish with a heap: a pinch at a time.
      g.fillStyle = '#6a655c';
      g.beginPath();
      g.ellipse(0, -10, 16, 8, 0, 0, Math.PI);
      g.fill();
      g.fillStyle = col.plain;
      g.beginPath();
      g.ellipse(0, -11, 11, 5, 0, Math.PI, 0);
      g.fill();
      g.fillStyle = col.hi;
      g.fillRect(-4, -14, 3, 1.5);
      g.strokeStyle = '#8d877b';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-16, -10);
      g.lineTo(16, -10);
      g.stroke();
    } else {
      // A ladle-pot: body, rim, and what's in it.
      g.fillStyle = hot ? '#7d6250' : '#6a5242';
      g.beginPath();
      g.moveTo(-15, -24);
      g.lineTo(15, -24);
      g.lineTo(11, -2);
      g.quadraticCurveTo(0, 2, -11, -2);
      g.closePath();
      g.fill();
      g.strokeStyle = '#3c2c22';
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = col.plain;
      g.beginPath();
      g.ellipse(0, -24, 14, 3.5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = col.hi;
      g.fillRect(-7, -25, 6, 1.2);
      g.strokeStyle = '#a3866c';
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(0, -24, 15, 4, 0, 0, Math.PI * 2);
      g.stroke();
      // The handle, away from the spout.
      g.strokeStyle = '#4a3a2c';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-14 * this.dir[i]!, -18);
      g.lineTo(-24 * this.dir[i]!, -26);
      g.stroke();
    }
    g.restore();
    if (hover && !hot) {
      g.strokeStyle = 'rgba(233,196,106,0.35)';
      g.lineWidth = 1;
      rrect(g, x - 26, 1, 52, 52, 6);
      g.stroke();
    }
  }

  /** The mix strip under the name: each ingredient's part of the whole, live. */
  private drawStrip(): void {
    const g = this.g;
    const tot = this.total();
    if (tot <= 0) return;
    let x = 233;
    for (let i = 0; i < this.amt.length; i++) {
      const w = (this.amt[i]! / tot) * 114;
      g.fillStyle = this.ing[i]!.colour;
      g.fillRect(x, 30, w, 4);
      x += w;
    }
  }

  private drawNeedle(ga: Gauge): void {
    const g = this.g;
    const ing = this.ing[ga.i]!;
    const s = this.share(ga.i);
    const d = Math.abs(s - ing.share);
    const tot = this.total();
    const col = tot <= 0 ? PAL.faint : d <= ga.perfect ? PAL.gold : d <= ga.good ? PAL.good : PAL.bad;
    if (this.gauges.length === 1) {
      const a = this.da(ga, ga.needle);
      const { x, y, r } = DIAL;
      g.strokeStyle = '#120e0a';
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * (r + 2), y + Math.sin(a) * (r + 2));
      g.stroke();
      g.strokeStyle = col === PAL.faint ? PAL.dim : col;
      g.lineWidth = 2;
      g.stroke();
      g.lineCap = 'butt';
      g.fillStyle = '#3a2f20';
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = PAL.gold;
      g.lineWidth = 1;
      g.stroke();
      text(g, tot > 0 ? `${pctText(s)} %` : '— %', x, y + 22, { size: 16, bold: true, color: col });
      return;
    }
    text(g, tot > 0 ? `${pctText(s)} %` : '— %', GX1, ga.y + 4, {
      size: 12,
      bold: true,
      color: col,
      align: 'right',
    });
    const x = GX0 + (clamp(ga.needle, 0, ga.max * 1.04) / ga.max) * (GX1 - GX0);
    const y = ga.y + 14;
    g.fillStyle = PAL.ink;
    g.fillRect(x - 0.75, y - 2, 1.5, 14);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x, y + 1);
    g.lineTo(x - 4.5, y - 6);
    g.lineTo(x + 4.5, y - 6);
    g.closePath();
    g.fill();
    g.strokeStyle = '#120e0a';
    g.lineWidth = 1;
    g.stroke();
  }

  private drawStatus(): void {
    const g = this.g;
    const tot = this.total();
    const ready = tot >= this.minFill - 1e-6;
    let word = 'fill to the line';
    let col: string = PAL.dim;
    if (ready) {
      const j = this.judge();
      if (j.worst < 0) {
        word = 'ready';
        col = PAL.good;
      } else if (j.e > 1) {
        const ing = this.ing[j.worst]!;
        const w = ing.words ?? ['too little', 'too much'];
        word = this.share(j.worst) < ing.share ? w[0] : w[1];
        col = PAL.bad;
      } else if (j.perfect) {
        word = 'just right';
        col = PAL.gold;
      } else {
        word = 'about right';
        col = PAL.good;
      }
    }
    g.font = `italic 12px ${FONT}`;
    g.fillStyle = col;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(word, 247, BTN.y + BTN.h / 2);
    // The button: dim until the vessel is filled to the line.
    const hover =
      this.c.pointer.x >= BTN.x &&
      this.c.pointer.x <= BTN.x + BTN.w &&
      this.c.pointer.y >= BTN.y &&
      this.c.pointer.y <= BTN.y + BTN.h;
    rrect(g, BTN.x, BTN.y, BTN.w, BTN.h, 5);
    g.fillStyle = ready ? (hover ? '#4a3a1e' : '#33281a') : '#1d1812';
    g.fill();
    g.strokeStyle = ready ? PAL.gold : PAL.line;
    g.lineWidth = ready ? 1.5 : 1;
    g.stroke();
    text(g, this.p.action, BTN.x + BTN.w / 2, BTN.y + BTN.h / 2 - 1, {
      size: 13,
      bold: true,
      color: ready ? PAL.gold : PAL.faint,
    });
    text(g, 'Enter', BTN.x + BTN.w / 2, BTN.y + BTN.h + 6, { size: 8.5, color: PAL.faint });
  }

  /** The first time: which spout to hold, where to aim, when to fire. */
  private drawGuide(): void {
    const g = this.g;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
    for (const ga of this.gauges) {
      // A ghost needle on the target.
      g.strokeStyle = `rgba(255,224,138,${0.3 + 0.45 * pulse})`;
      g.setLineDash([2, 2]);
      g.lineWidth = 1.2;
      g.beginPath();
      if (this.gauges.length === 1) {
        const a = this.da(ga, this.ing[ga.i]!.share);
        g.moveTo(DIAL.x + Math.cos(a) * 10, DIAL.y + Math.sin(a) * 10);
        g.lineTo(DIAL.x + Math.cos(a) * (DIAL.r + 14), DIAL.y + Math.sin(a) * (DIAL.r + 14));
      } else {
        const x = this.gx(ga, this.ing[ga.i]!.share);
        g.moveTo(x, ga.y + 10);
        g.lineTo(x, ga.y + 30);
      }
      g.stroke();
      g.setLineDash([]);
    }
    let next = -1;
    let bulk = 0;
    for (let i = 0; i < this.ing.length; i++) if (this.ing[i]!.share > this.ing[bulk]!.share) bulk = i;
    const tot = this.total();
    if (tot < this.minFill - 1e-6 && this.amt[bulk]! < this.minFill) next = bulk;
    else {
      // First whatever falls short (the most short first); then, if something is over, thin it with the bulk.
      let short = 0;
      for (const ga of this.gauges) {
        const d = (this.ing[ga.i]!.share - this.share(ga.i)) / ga.perfect;
        if (d > 0.7 && d > short) {
          short = d;
          next = ga.i;
        }
      }
      if (next < 0 && tot < 0.98)
        for (const ga of this.gauges) if (this.share(ga.i) - this.ing[ga.i]!.share > ga.perfect) next = bulk;
    }
    if (next >= 0 && next !== this.pour) {
      const x = this.px[next]!;
      const y = 56 + pulse * 3;
      g.fillStyle = `rgba(255,224,138,${0.6 + 0.4 * pulse})`;
      g.beginPath();
      g.moveTo(x, y - 6);
      g.lineTo(x - 5, y);
      g.lineTo(x + 5, y);
      g.closePath();
      g.fill();
      text(g, this.ing[next]!.pinch ? 'tap' : 'hold', x, y + 8, { size: 10, color: PAL.gold });
    } else if (next < 0 && tot >= this.minFill - 1e-6 && this.judge().e <= 1) {
      g.strokeStyle = `rgba(255,224,138,${0.3 + 0.6 * pulse})`;
      g.lineWidth = 2;
      rrect(g, BTN.x - 3, BTN.y - 3, BTN.w + 6, BTN.h + 6, 7);
      g.stroke();
    }
  }

  // ---- The test -----------------------------------------------------------------------------------

  /** Where crumbs and sparks land on the test stage. */
  private floorAt(x: number): number {
    if (this.p.test === 'set' && x > 110 && x < 270) return 150;
    if (this.p.test === 'burn' && x > W / 2 - 70 && x < W / 2 + 70) return 128;
    if (this.p.test === 'cast' && (Math.abs(x - 134) < 15 || Math.abs(x - 246) < 15)) return 122;
    return 158;
  }

  /** The test's backdrop: a dark stage in a pool of light, and what the piece stands on. */
  private paintStage(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = W * 2;
    cv.height = H * 2;
    const g = cv.getContext('2d')!;
    g.scale(2, 2);
    g.fillStyle = '#100c09';
    g.fillRect(0, 0, W, H);
    const v = g.createRadialGradient(W / 2, 118, 10, W / 2, 118, 200);
    v.addColorStop(0, 'rgba(255,214,150,0.13)');
    v.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
    const head =
      this.p.test === 'cast'
        ? 'Cast, cooled, and struck'
        : this.p.test === 'set'
          ? 'Out of the mould, and loaded'
          : 'A heap of it, lit';
    g.font = `italic 12px ${FONT}`;
    g.fillStyle = PAL.dim;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(head, W / 2, 18);
    g.fillStyle = '#231c14';
    g.fillRect(50, 158, 280, 2);
    if (this.p.test === 'cast') {
      // Two iron supports: the bar spans them and is struck in the middle.
      for (const sx of [134, 246]) {
        g.fillStyle = '#3b3d42';
        g.beginPath();
        g.moveTo(sx - 13, 122);
        g.lineTo(sx + 13, 122);
        g.lineTo(sx + 19, 158);
        g.lineTo(sx - 19, 158);
        g.closePath();
        g.fill();
        g.fillStyle = '#6a6e75';
        g.fillRect(sx - 13, 122, 26, 2);
      }
    } else if (this.p.test === 'set') {
      g.fillStyle = '#3a3631';
      g.fillRect(110, 150, 160, 8);
      g.fillStyle = '#58534b';
      g.fillRect(110, 150, 160, 1.5);
    } else {
      g.fillStyle = '#3a3631';
      g.fillRect(W / 2 - 70, 128, 140, 8);
      g.fillStyle = '#58534b';
      g.fillRect(W / 2 - 70, 128, 140, 1.5);
    }
    return cv;
  }

  private drawTest(): void {
    const g = this.g;
    g.globalAlpha = ease(this.testT / 0.2);
    g.drawImage(this.stage ?? (this.stage = this.paintStage()), 0, 0, W, H);
    g.globalAlpha = 1;
    if (this.testT < 0.08) return;
    if (this.p.test === 'cast') this.drawCast();
    else if (this.p.test === 'set') this.drawSet();
    else this.drawBurn();
    this.drawBits();
    text(g, this.reading, W / 2, 192, { size: 12, color: PAL.dim });
  }

  /** The bar is struck: it rings, snaps or bends. */
  private drawCast(): void {
    const g = this.g;
    const t = this.testT;
    const hit = 0.62;
    const look = this.outcome.look;
    const x0 = 112;
    const x1 = 268;
    const y = 100;
    const h = 22;
    const after = Math.max(0, t - hit);
    if (t >= hit && !this.struck) {
      this.struck = true;
      for (let i = 0; i < 14; i++)
        this.spawn(
          W / 2,
          y,
          (Math.random() - 0.5) * 220,
          -60 - Math.random() * 120,
          0.6,
          2,
          look === 'crack' ? '#d9dde2' : '#ffe08a',
          500,
        );
    }
    const front = this.pieceFront;
    const top = this.pieceTop;
    let sag = 0;
    if (look === 'bend') {
      // Soft: it sags between the supports.
      sag = ease(after / 0.4) * 16;
      g.strokeStyle = front;
      g.lineWidth = h;
      g.beginPath();
      g.moveTo(x0, y + h / 2);
      g.quadraticCurveTo(W / 2, y + h / 2 + sag * 2, x1, y + h / 2);
      g.stroke();
      g.strokeStyle = top;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x0, y + 1.5);
      g.quadraticCurveTo(W / 2, y + 1.5 + sag * 2, x1, y + 1.5);
      g.stroke();
    } else if (look === 'crack') {
      // Brittle: it snaps, and the halves fall in on their supports.
      const a = ease(after / 0.3) * 0.2;
      for (const side of [-1, 1]) {
        const end = side < 0 ? x0 : x1;
        const px = side < 0 ? 134 : 246;
        g.save();
        g.translate(px, y + h);
        g.rotate(-side * a);
        g.translate(-px, -(y + h));
        g.beginPath();
        g.moveTo(end, y);
        for (let k = 0; k < this.crack.length; k++)
          g.lineTo(W / 2 + this.crack[k]!, y + (h * k) / (this.crack.length - 1));
        g.lineTo(end, y + h);
        g.closePath();
        g.fillStyle = front;
        g.fill();
        g.fillStyle = top;
        g.fillRect(Math.min(end, W / 2 - 4), y, Math.abs(end - W / 2) + 4, 3);
        g.restore();
      }
    } else {
      g.fillStyle = front;
      g.fillRect(x0, y, x1 - x0, h);
      g.fillStyle = top;
      g.fillRect(x0, y, x1 - x0, 3);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x0, y + h - 4, x1 - x0, 4);
      if (t >= hit) {
        // It rings: a shine runs along it, and rings spread from the blow.
        const s = x0 + ((after / 0.6) % 1.4) * (x1 - x0);
        g.save();
        g.beginPath();
        g.rect(x0, y, x1 - x0, h);
        g.clip();
        g.fillStyle = 'rgba(255,250,230,0.5)';
        g.beginPath();
        g.moveTo(s - 10, y);
        g.lineTo(s + 6, y);
        g.lineTo(s - 4, y + h);
        g.lineTo(s - 20, y + h);
        g.fill();
        g.restore();
        g.strokeStyle = PAL.gold;
        g.lineWidth = 1.5;
        for (let r = 0; r < 3; r++) {
          const rr = 22 + ((after * 70 + r * 16) % 54);
          g.globalAlpha = Math.max(0, 1 - rr / 78) * 0.8;
          g.beginPath();
          g.arc(W / 2, y + 4, rr, Math.PI * 1.1, Math.PI * 1.9);
          g.stroke();
        }
        g.globalAlpha = 1;
      }
    }
    // The hammer: raised, brought down, and a little bounce (or it follows a soft bar down).
    let swing: number;
    if (t < 0.3) swing = 0.3 + ease(t / 0.3) * 0.65;
    else if (t < hit) swing = 0.95 * (1 - ((t - 0.3) / (hit - 0.3)) ** 2);
    else if (look === 'bend') swing = -sag / 125;
    else swing = 0.16 * Math.abs(Math.sin(after * 12)) * Math.max(0, 1 - after * 2.5);
    g.save();
    g.translate(322, 85);
    g.rotate(swing);
    g.lineCap = 'round';
    g.strokeStyle = '#7a5530';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(4, 0);
    g.lineTo(-118, 0);
    g.stroke();
    g.strokeStyle = '#4a3220';
    g.lineWidth = 6.5;
    g.beginPath();
    g.moveTo(4, 0);
    g.lineTo(-22, 0);
    g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = '#8e949c';
    g.fillRect(-134, -15, 18, 30);
    g.fillStyle = '#c9ced4';
    g.fillRect(-134, -15, 18, 3);
    g.fillStyle = '#5f646b';
    g.fillRect(-134, 12, 18, 3);
    g.restore();
  }

  /** The block comes out of its mould and is loaded: it holds, crumbles or cracks. */
  private drawSet(): void {
    const g = this.g;
    const t = this.testT;
    const look = this.outcome.look;
    const bx = W / 2 - 44;
    const by = 98;
    const bw = 88;
    const bh = 52;
    const lift = ease((t - 0.25) / 0.35);
    const after = Math.max(0, t - 0.6);
    const slump = look === 'crumble' ? ease(after / 0.6) : 0;
    const h2 = bh * (1 - slump * 0.3);
    g.fillStyle = this.pieceFront;
    g.beginPath();
    g.moveTo(bx - slump * 8, by + bh);
    g.lineTo(bx + slump * 6, by + bh - h2 + slump * 6);
    g.lineTo(bx + bw - slump * 6, by + bh - h2 + slump * 8);
    g.lineTo(bx + bw + slump * 8, by + bh);
    g.closePath();
    g.fill();
    g.fillStyle = this.pieceTop;
    g.fillRect(bx + slump * 7, by + bh - h2 + slump * 6, bw - slump * 14, 3);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(bx + bw - 10 - slump * 6, by + bh - h2 + slump * 8, 10, h2 - slump * 8);
    if (look === 'crumble' && t > 0.6 && !this.struck) {
      this.struck = true;
      for (let i = 0; i < 18; i++)
        this.spawn(
          bx + Math.random() * bw,
          by + Math.random() * 20,
          (Math.random() - 0.5) * 90,
          -20 - Math.random() * 40,
          3,
          3 + Math.random() * 2,
          css(this.mixRgb, 0.8 + Math.random() * 0.3),
          420,
        );
    }
    if (look === 'crack' && t > 0.6) {
      const a = ease(after / 0.4);
      g.strokeStyle = '#120e0a';
      g.lineWidth = 1.5 + a * 1.5;
      g.beginPath();
      g.moveTo(W / 2 + this.crack[0]!, by);
      for (let k = 1; k < this.crack.length; k++)
        g.lineTo(W / 2 + this.crack[k]! * 1.5, by + ((bh * k) / (this.crack.length - 1)) * a);
      g.stroke();
    }
    // The wooden form lifts away.
    if (lift < 1) {
      g.globalAlpha = 1 - lift;
      g.fillStyle = '#6b4a2c';
      g.fillRect(bx - 8, by - 6 - lift * 50, 6, bh + 8);
      g.fillRect(bx + bw + 2, by - 6 - lift * 50, 6, bh + 8);
      g.fillRect(bx - 8, by - 8 - lift * 50, bw + 16, 5);
      g.globalAlpha = 1;
    }
    if (look !== 'crumble' && t > 0.7) {
      // A weight drops on it: it holds (or splits under it).
      const f = Math.min(1, (t - 0.7) / 0.28);
      const wy = by - 92 + f * f * 70;
      g.fillStyle = '#3a3631';
      g.fillRect(W / 2 - 18, wy, 36, 22);
      g.fillStyle = '#5a554d';
      g.fillRect(W / 2 - 18, wy, 36, 3);
      text(g, '1 t', W / 2, wy + 12, { size: 10, color: PAL.dim });
      if (f >= 1 && !this.struck) {
        this.struck = true;
        for (let i = 0; i < 10; i++)
          this.spawn(
            W / 2 + (Math.random() - 0.5) * 40,
            by,
            (Math.random() - 0.5) * 80,
            -20 - Math.random() * 20,
            0.6,
            2,
            'rgba(220,210,190,0.8)',
            80,
          );
      }
    }
  }

  /** The heap is lit: it flashes, or fizzles and smokes. */
  private drawBurn(): void {
    const g = this.g;
    const t = this.testT;
    const lit = 0.6;
    const cx = W / 2;
    const cy = 128;
    const burnt = this.outcome.look === 'ok' && t > lit;
    if (!burnt) {
      g.fillStyle = t > lit ? this.pieceDark : this.pieceFront;
      g.beginPath();
      g.moveTo(cx - 40, cy);
      g.quadraticCurveTo(cx, cy - 46, cx + 40, cy);
      g.fill();
    }
    // The fuse burns in from the left.
    const f = Math.min(1, t / lit);
    g.strokeStyle = '#5a4a30';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - 110 + f * 72, cy - 2);
    g.lineTo(cx - 38, cy - 2);
    g.stroke();
    if (t < lit) {
      g.globalCompositeOperation = 'lighter';
      g.drawImage(this.warm, cx - 118 + f * 72, cy - 10, 16, 16);
      g.globalCompositeOperation = 'source-over';
      if (Math.random() < 0.6)
        this.spawn(
          cx - 110 + f * 72,
          cy - 3,
          (Math.random() - 0.5) * 50,
          -30 - Math.random() * 40,
          0.3,
          1.5,
          '#ffd27a',
          200,
        );
    }
    if (t >= lit && !this.struck) {
      this.struck = true;
      if (this.outcome.look === 'ok')
        for (let i = 0; i < 26; i++)
          this.spawn(
            cx,
            cy - 12,
            (Math.random() - 0.5) * 320,
            -80 - Math.random() * 200,
            0.7,
            2.2,
            i % 2 ? '#ffe08a' : '#ff9a3c',
            300,
          );
    }
    if (t < lit) return;
    const a = t - lit;
    if (this.outcome.look === 'ok') {
      // A flash and a ring of smoke.
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = Math.max(0, 1 - a / 0.45);
      const r = 40 + a * 260;
      g.drawImage(this.white, cx - r, cy - 16 - r, r * 2, r * 2);
      g.drawImage(this.warm, cx - r * 0.7, cy - 16 - r * 0.7, r * 1.4, r * 1.4);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = Math.max(0, 0.7 - a * 0.6);
      g.strokeStyle = '#8a8378';
      g.lineWidth = 6;
      g.beginPath();
      g.ellipse(cx, cy - 20 - a * 40, 20 + a * 70, 8 + a * 16, 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    } else {
      // It fizzles: a few sputters and a lazy puff of smoke.
      if (Math.random() < 0.35)
        this.spawn(
          cx + (Math.random() - 0.5) * 30,
          cy - 14,
          (Math.random() - 0.5) * 60,
          -40 - Math.random() * 30,
          0.35,
          1.6,
          '#ffb060',
          260,
        );
      for (let k = 0; k < 4; k++) {
        const s = a * (0.8 + k * 0.15);
        g.globalAlpha = Math.max(0, 0.5 - s * 0.35);
        g.fillStyle = '#6f6a62';
        g.beginPath();
        g.arc(cx + Math.sin(k * 2.1 + a) * 10, cy - 20 - s * 40 - k * 6, 10 + s * 16 + k * 3, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
  }
}

/** Which demo the playground shows (?variant=…). */
function variant<T extends object>(all: T, fallback: keyof T): T[keyof T] {
  const v = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('variant');
  return v && Object.hasOwn(all, v) ? all[v as keyof T] : all[fallback];
}

export const ratio: MinigameDef<RatioParams> = {
  kind: 'ratio',
  name: 'Mix the ratio',
  get demo() {
    return variant(RATIO_DEMOS, 'bronze');
  },
  create: (host, p) => new RatioGame(host, p),
};
