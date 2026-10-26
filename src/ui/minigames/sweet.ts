export type { SweetLook } from './sweet-data.ts';
export type { SweetTune } from './sweet-data.ts';
export type { SweetMoment } from './sweet-data.ts';
export type { SweetParams } from './sweet-data.ts';
export { SWEET_DEMOS } from './sweet-data.ts';
import { SWEET_DEMOS } from './sweet-data.ts';
import type { SweetTune, SweetMoment, SweetParams } from './sweet-data.ts';
/**
 * Find the sweet spot (TECH_LINEAGE §4): a narrow zone that only feedback reveals.
 *
 * - **Tune**: turn a dial (drag it, the wheel, or ←/→; hold for faster) toward a hidden value. The
 *   closer you get, the clearer it comes — static clears into a voice, a picture sharpens, a clock
 *   ticks in step with the bell — and you lock it in by holding it there for a moment.
 * - **Moment**: something is on its way (a capsule falling home, a lander coming down, a needle
 *   sweeping); press at the right moment (Space, Enter, a click). Too early and too late both fail,
 *   each in its own way, and the window shifts a little each run, so you go by what you see.
 */
import type { Minigame, MinigameDef, MinigameHost, Quality } from './types.ts';
import { canvasIn, finisher, rrect, text, FONT, PAL } from './kit.ts';

const W = 380;
const H = 220;
/** The picture, and (tune) the dial strip under it. */
const PY0 = 22;
const PY1 = 148;
const DX0 = 22;
const DX1 = 358;
const DY = 180;
/** Moment: the button. */
const BTN = { x: 282, y: 182, w: 90, h: 26 };
/** How long the outcome plays before the verdict (s). */
const OUT_T = 1.7;
const MONO = `'Courier New', Courier, monospace`;
const GLYPHS = '#%&*+=?@$<>~^/';

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const ease = (k: number): number => 1 - (1 - clamp(k, 0, 1)) ** 3;

/** A soft round glow (drawn once, stamped where something shines). */
function glowSprite(r: number, g: number, b: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const x = cv.getContext('2d')!;
  const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grd.addColorStop(0.35, `rgba(${r},${g},${b},0.5)`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grd;
  x.fillRect(0, 0, 64, 64);
  return cv;
}

/** A spark, splash, shred or chip: one shared pool, so nothing is allocated per frame. */
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

class SweetGame implements Minigame {
  private readonly host: MinigameHost;
  private readonly p: SweetParams;

  private readonly c: ReturnType<typeof canvasIn>;
  private readonly g: CanvasRenderingContext2D;
  private readonly end: ReturnType<typeof finisher>;
  private readonly back: HTMLCanvasElement;
  private readonly warm = glowSprite(255, 170, 80);
  private readonly white = glowSprite(255, 250, 235);
  private readonly bits: Bit[] = [];
  private bitI = 0;
  private readonly heldKeys = new Set<string>();
  private t = 0;
  private phase: 'play' | 'out' = 'play';
  private outT = 0;
  private outcome: { q: Quality; why: string; side: -1 | 0 | 1 } = { q: 0, why: '', side: 0 };
  // Tune.
  private readonly tn: SweetTune;
  private v = 0;
  private target = 0;
  private base = 0;
  private lock = 0;
  private perfectT = 0;
  private fillT = 0;
  private dragging = false;
  private keyT = 0;
  private strength = 0;
  // Moment.
  private readonly mo: SweetMoment;
  private u = 0;
  private shift = 0;
  private pressU = -1;
  /** The windows now (good from, to; perfect from, to), refilled in place. */
  private readonly win: [number, number, number, number] = [0, 0, 0, 0];
  /** The first-time hint beside the readouts, in two lines. */
  private hintLines: [string, string] | null = null;
  // Pictures.
  private noise: CanvasPattern | null = null;
  private scene: HTMLCanvasElement | null = null;
  private work: HTMLCanvasElement | null = null;
  private msgLines: string[] = [];
  private scrambled: string[] = [];
  private scrambleT = 0;
  private lastHalf = 0;
  private lastBell = 0;
  private tickFlash = 0;
  private bellFlash = 0;
  private ticks = 0;
  private struck = false;
  private readonly stars: number[] = [];
  private readonly clouds: number[] = [];
  /** The home sky high up (dark) and low down (bright), made once and cross-faded. */
  private skyHigh: CanvasGradient | null = null;
  private skyLow: CanvasGradient | null = null;

  constructor(host: MinigameHost, p: SweetParams) {
    this.host = host;
    this.p = p;

    this.tn = p.tune ?? { min: 0, max: 100, unit: '', target: 50, good: 5, perfect: 2 };
    this.mo = p.moment ?? { duration: 8, good: [0.4, 0.6], perfect: [0.45, 0.55] };
    if (p.mode === 'tune') {
      const tg = this.tn.target;
      this.base = typeof tg === 'number' ? tg : tg[0] + Math.random() * (tg[1] - tg[0]);
      this.target = this.base;
      const mid = (this.tn.min + this.tn.max) / 2;
      this.v =
        this.tn.start ??
        (this.base > mid
          ? this.tn.min + (this.tn.max - this.tn.min) * 0.06
          : this.tn.max - (this.tn.max - this.tn.min) * 0.06);
    } else this.shift = (Math.random() * 2 - 1) * (this.mo.jitter ?? 0);
    for (let i = 0; i < 120; i++)
      this.bits.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, col: '#fff', grav: 0 });
    // Packed triples (position and weight), consumed with i += 3 and never resized.
    for (let i = 0; i < 60; i++) this.stars.push(Math.random() * W, Math.random() * H, Math.random());
    for (let i = 0; i < 6; i++)
      this.clouds.push(Math.random() * 260, Math.random() * 400, 0.6 + Math.random() * 0.8);
    if (p.message) this.msgLines = this.wrapMono(p.message, 34);
    this.scrambled = this.msgLines.slice();
    this.end = finisher(host);
    this.c = canvasIn(host, W, H, { down: (q) => this.down(q.x, q.y), up: () => (this.dragging = false) });
    this.g = this.c.g;
    this.back = this.paintBack();
    this.c.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
  }

  // ---- Input ---------------------------------------------------------------------------------------

  private readonly onKey = (e: KeyboardEvent): void => {
    const k = e.key;
    const tune = this.p.mode === 'tune';
    const ours = tune ? k === 'ArrowLeft' || k === 'ArrowRight' : k === ' ' || k === 'Enter';
    if (!ours) return;
    if (e.type === 'keyup') {
      if (!this.heldKeys.delete(k)) return;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const first = !this.heldKeys.has(k);
    this.heldKeys.add(k);
    if (!this.live()) return;
    if (tune && first) {
      // A tap nudges by a hair; holding runs (see update).
      this.keyT = 0;
      this.nudge(k === 'ArrowLeft' ? -1 : 1, (this.tn.max - this.tn.min) / 600);
    } else if (!tune && !e.repeat) this.press();
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (this.p.mode !== 'tune' || !this.live()) return;
    e.preventDefault();
    this.nudge(
      e.deltaY > 0 ? -1 : 1,
      ((this.tn.max - this.tn.min) / 900) * Math.min(6, Math.max(1, Math.abs(e.deltaY) / 30)),
    );
  };

  private live(): boolean {
    return this.phase === 'play' && !this.end.finished();
  }

  private down(x: number, y: number): void {
    if (!this.live()) return;
    if (this.p.mode === 'tune') {
      if (y > PY1 + 4) {
        this.dragging = true;
        this.dragTo(x);
      }
    } else if (y < 212) this.press();
  }

  private dragTo(x: number): void {
    const k = clamp((x - DX0) / (DX1 - DX0), 0, 1);
    this.v = this.tn.min + k * (this.tn.max - this.tn.min);
  }

  private nudge(dir: number, by: number): void {
    this.v = clamp(this.v + dir * by, this.tn.min, this.tn.max);
  }

  private press(): void {
    if (!this.live()) return;
    const x = this.momentX();
    const [g0, g1, p0, p1] = this.windows();
    this.pressU = this.u;
    const mid = (p0 + p1) / 2;
    if (x >= p0 && x <= p1) this.outcome = { q: 2, why: this.p.whyPerfect, side: 0 };
    else if (x >= g0 && x <= g1) this.outcome = { q: 1, why: this.p.whyGood, side: 0 };
    else if (x < mid) this.outcome = { q: 0, why: this.p.whyLow, side: -1 };
    else this.outcome = { q: 0, why: this.p.whyHigh, side: 1 };
    this.phase = 'out';
    this.outT = 0;
  }

  /** Where the moving thing is on its way (0–1): straight through for a fall, back and forth for a sweep. */
  private momentX(): number {
    if (this.p.look !== 'sweep') return this.u;
    const s = this.u * (this.mo.sweeps ?? 3);
    const f = s % 2;
    return f < 1 ? f : 2 - f;
  }

  /** The good and perfect windows now: shifted for this run, drifting and narrowing as it goes. */
  private windows(): [number, number, number, number] {
    const m = this.mo;
    let sh = this.shift;
    if (m.drift) sh += Math.sin(this.u * 5.3) * m.drift;
    const k = 1 - (m.shrink ?? 0) * this.u;
    const gc = (m.good[0] + m.good[1]) / 2 + sh;
    const gw = ((m.good[1] - m.good[0]) / 2) * k;
    const pc = (m.perfect[0] + m.perfect[1]) / 2 + sh;
    const pw = ((m.perfect[1] - m.perfect[0]) / 2) * k;
    const w = this.win;
    w[0] = gc - gw;
    w[1] = gc + gw;
    w[2] = pc - pw;
    w[3] = pc + pw;
    return w;
  }

  /** Where the readouts stand: after the press they run on — fast to the end if it's too late, slowly under the brakes. */
  private shownU(): number {
    if (this.phase !== 'out') return this.u;
    const o = this.outT;
    const p = this.pressU;
    if (this.outcome.side > 0) return p + (1 - p) * ease(o / 0.6);
    // Too early on rockets: they hold it a moment, then the fuel's gone.
    if (this.outcome.side < 0)
      return Math.min(1, p + Math.max(0, o - (this.mo.world === 'space' ? 0.5 : 0)) / this.mo.duration);
    return Math.min(1, p + (o / this.mo.duration) * 0.35);
  }

  /** A readout as shown: braked in time, it eases to where it settles. */
  private shownValue(i: number): number {
    const r = this.mo.readouts?.[i];
    if (!r) throw new Error('Missing configured fall readout');
    const v = this.readout(i, this.shownU());
    if (this.phase !== 'out' || this.outcome.side !== 0 || r.braked === undefined) return v;
    return v + (r.braked - v) * ease(this.outT / 1.4);
  }

  /** A readout's value at a point of the run. */
  private readout(i: number, u: number): number {
    const r = this.mo.readouts?.[i];
    if (!r) throw new Error('Missing configured fall readout');
    return r.from + (r.to - r.from) * clamp(u, 0, 1) ** (r.curve ?? 1);
  }

  // ---- Frame -------------------------------------------------------------------------------------

  update(dt: number): void {
    this.t += dt;
    if (this.p.mode === 'tune') this.stepTune(dt);
    else if (this.phase === 'play') {
      this.u += dt / this.mo.duration;
      if (this.u >= 1) {
        this.u = 1;
        this.pressU = 1;
        this.outcome = { q: 0, why: this.p.whyMissed ?? this.p.whyHigh, side: 1 };
        this.phase = 'out';
        this.outT = 0;
      }
    }
    if (this.phase === 'out') {
      this.outT += dt;
      if (this.outT >= OUT_T) this.end.finish(this.outcome.q, this.outcome.why);
    }
    for (const b of this.bits) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.vy += b.grav * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    this.draw(dt);
  }

  private stepTune(dt: number): void {
    const tn = this.tn;
    if (this.live()) {
      if (this.dragging && this.c.pointer.down) this.dragTo(this.c.pointer.x);
      const l = this.heldKeys.has('ArrowLeft');
      const r = this.heldKeys.has('ArrowRight');
      if (l !== r) {
        // Held: slow at first, then faster.
        this.keyT += dt;
        if (this.keyT > 0.18)
          this.nudge(
            r ? 1 : -1,
            (tn.max - tn.min) * (0.03 + 0.3 * Math.min(1, (this.keyT - 0.18) * 0.9)) * dt,
          );
      }
      if (tn.drift) this.target = this.base + Math.sin(this.t * 0.45) * tn.drift;
      const d = Math.abs(this.v - this.target);
      const reach = tn.reach ?? tn.good * 6;
      const raw = clamp(1 - d / reach, 0, 1);
      // Feedback swells as you close in, and is all there inside the perfect zone.
      const want = d <= tn.perfect ? 1 : raw * raw * (d <= tn.good ? 1 : 0.85);
      this.strength += (want - this.strength) * Math.min(1, dt * 10);
      const hold = tn.hold ?? 2;
      if (d <= tn.good) {
        this.lock += dt / hold;
        this.fillT += dt;
        if (d <= tn.perfect) this.perfectT += dt;
      } else this.lock = Math.max(0, this.lock - (dt / hold) * 1.5);
      if (this.lock >= 1) {
        this.lock = 1;
        const perfect = this.perfectT >= this.fillT * 0.6;
        this.outcome = perfect
          ? { q: 2, why: this.p.whyPerfect, side: 0 }
          : { q: 1, why: this.p.whyGood, side: 0 };
        this.phase = 'out';
        this.outT = 0;
      } else if (this.t >= (this.p.time ?? 30)) {
        const low = this.v < this.target;
        this.outcome = { q: 0, why: low ? this.p.whyLow : this.p.whyHigh, side: low ? -1 : 1 };
        this.phase = 'out';
        this.outT = 0;
      }
    } else if (this.phase === 'out' && this.outcome.q > 0)
      this.strength += (1 - this.strength) * Math.min(1, dt * 6);
    else if (this.phase === 'out') this.strength *= 1 - Math.min(1, dt * 3);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKey, true);
    this.c.canvas.removeEventListener('wheel', this.onWheel);
    this.c.dispose();
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
    // All 120 bits are allocated before use; bitI advances modulo the pool length.
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

  private wrapMono(s: string, cols: number): string[] {
    const out: string[] = [];
    let line = '';
    for (const w of s.split(' ')) {
      if (line && line.length + 1 + w.length > cols) {
        out.push(line);
        line = w;
      } else line = line ? `${line} ${w}` : w;
    }
    if (line) out.push(line);
    return out.slice(0, 3);
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
    if (!this.host.guided) {
      g.font = `italic 10.5px ${FONT}`;
      g.fillStyle = PAL.dim;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(this.p.goal, 8, 11);
    }
    if (this.p.mode === 'tune') this.paintDial(g);
    if (this.p.look === 'radio') this.paintRadio(g);
    else if (this.p.look === 'focus') this.paintFocusFrame(g);
    else if (this.p.look === 'pendulum') this.paintClockRoom(g);
    else if (this.p.look === 'meter') this.paintMeter(g);
    else if (this.p.look === 'sweep') this.paintSweep(g);
    else this.paintFallPanel(g);
    return cv;
  }

  /** The tuning dial: a lit strip with the scale, its numbers and end words. */
  private paintDial(g: CanvasRenderingContext2D): void {
    const tn = this.tn;
    rrect(g, 8, PY1 + 8, W - 16, H - PY1 - 12, 6);
    const lit = g.createLinearGradient(0, PY1 + 8, 0, H - 4);
    lit.addColorStop(0, '#2b2114');
    lit.addColorStop(1, '#1a140d');
    g.fillStyle = lit;
    g.fill();
    g.strokeStyle = PAL.line;
    g.lineWidth = 1;
    g.stroke();
    // Ticks and numbers at round steps, and both ends (the top one with its unit).
    const d = tn.decimals ?? 0;
    const span = tn.max - tn.min;
    const px = (v: number): number => DX0 + ((v - tn.min) / span) * (DX1 - DX0);
    const e = 10 ** Math.floor(Math.log10(span / 4));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * e).find((st) => span / st <= 5) ?? 10 * e;
    const sd = Math.max(0, -Math.floor(Math.log10(step) + 1e-9) + (step / e === 2.5 ? 1 : 0));
    const minor = step / 5;
    g.strokeStyle = 'rgba(233,196,106,0.55)';
    g.beginPath();
    g.moveTo(DX0, DY);
    g.lineTo(DX1, DY);
    g.moveTo(DX0, DY);
    g.lineTo(DX0, DY - 9);
    g.moveTo(DX1, DY);
    g.lineTo(DX1, DY - 9);
    for (let k = Math.ceil(tn.min / minor - 1e-9); k * minor < tn.max - 1e-9; k++) {
      const x = px(k * minor);
      const major = Math.abs(k % 5) === 0;
      g.moveTo(x, DY);
      g.lineTo(x, DY - (major ? 8 : 3.5));
    }
    g.stroke();
    text(g, tn.min.toFixed(d), DX0, DY + 9, { size: 9.5, color: PAL.dim });
    text(g, `${tn.max.toFixed(d)} ${tn.unit}`, DX1 + 4, DY + 9, {
      size: 9.5,
      color: PAL.dim,
      align: 'right',
    });
    for (let v = Math.ceil(tn.min / step) * step; v < tn.max; v += step) {
      if (px(v) - DX0 < 26 || DX1 - px(v) < 40) continue;
      text(g, v.toFixed(sd), px(v), DY + 9, { size: 9.5, color: PAL.dim });
    }
    g.font = `italic 10px ${FONT}`;
    g.fillStyle = PAL.faint;
    g.textAlign = 'left';
    g.fillText(`← ${this.p.words[0]}`, DX0 - 6, DY + 24);
    g.textAlign = 'right';
    g.fillText(`${this.p.words[1]} →`, DX1 + 6, DY + 24);
  }

  /** The radio: a cabinet with a speaker and a trace window. */
  private paintRadio(g: CanvasRenderingContext2D): void {
    rrect(g, 8, PY0, W - 16, PY1 - PY0, 8);
    const wood = g.createLinearGradient(0, PY0, 0, PY1);
    wood.addColorStop(0, '#4a3220');
    wood.addColorStop(1, '#2e1f14');
    g.fillStyle = wood;
    g.fill();
    g.strokeStyle = '#6e5a35';
    g.stroke();
    g.fillStyle = '#1d150e';
    g.beginPath();
    g.arc(66, 82, 46, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#8a6a3a';
    g.lineWidth = 2;
    g.stroke();
    rrect(g, 124, PY0 + 8, 240, 64, 5);
    g.fillStyle = '#071108';
    g.fill();
    g.strokeStyle = '#3a4a3a';
    g.lineWidth = 1;
    g.stroke();
    g.strokeStyle = 'rgba(90,200,120,0.12)';
    g.beginPath();
    for (let x = 124 + 24; x < 364; x += 24) {
      g.moveTo(x, PY0 + 8);
      g.lineTo(x, PY0 + 72);
    }
    g.moveTo(124, PY0 + 40);
    g.lineTo(364, PY0 + 40);
    g.stroke();
    rrect(g, 124, PY0 + 78, 240, 42, 5);
    g.fillStyle = '#120d08';
    g.fill();
    g.strokeStyle = '#3a2c1c';
    g.stroke();
    // Static: fine grain, one dot per screen pixel, shifted about every frame.
    const n = document.createElement('canvas');
    n.width = 256;
    n.height = 128;
    const x = n.getContext('2d')!;
    const img = x.createImageData(256, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() < 0.55 ? 0 : 120 + Math.random() * 135;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = v ? 255 : 0;
    }
    x.putImageData(img, 0, 0);
    this.noise = this.g.createPattern(n, 'repeat');
  }

  /** The spyglass: a brass ring round the view, and the far scene to look at (drawn once). */
  private paintFocusFrame(g: CanvasRenderingContext2D): void {
    rrect(g, 8, PY0, W - 16, PY1 - PY0, 8);
    g.fillStyle = '#0c0a08';
    g.fill();
    const sc = document.createElement('canvas');
    sc.width = 400;
    sc.height = 260;
    const s = sc.getContext('2d')!;
    s.scale(2, 2);
    const sky = s.createLinearGradient(0, 0, 0, 130);
    sky.addColorStop(0, '#3b6ea8');
    sky.addColorStop(1, '#a9cfe8');
    s.fillStyle = sky;
    s.fillRect(0, 0, 200, 130);
    s.fillStyle = 'rgba(255,255,255,0.8)';
    for (const [cx, cy, r] of [
      [40, 26, 12],
      [56, 22, 10],
      [150, 34, 9],
      [162, 30, 12],
    ] as const)
      (s.beginPath(), s.arc(cx, cy, r, 0, Math.PI * 2), s.fill());
    s.fillStyle = '#5f8a9a';
    s.beginPath();
    s.moveTo(0, 92);
    s.quadraticCurveTo(60, 70, 120, 88);
    s.quadraticCurveTo(170, 76, 200, 86);
    s.lineTo(200, 130);
    s.lineTo(0, 130);
    s.fill();
    s.fillStyle = '#3f7a3a';
    s.beginPath();
    s.moveTo(0, 108);
    s.quadraticCurveTo(80, 84, 130, 100);
    s.quadraticCurveTo(170, 110, 200, 104);
    s.lineTo(200, 130);
    s.lineTo(0, 130);
    s.fill();
    // The far tower, its lit window and its banner.
    s.fillStyle = '#8c8478';
    s.fillRect(92, 50, 18, 46);
    s.fillStyle = '#6f685e';
    s.fillRect(90, 46, 22, 6);
    for (let k = 0; k < 4; k++) s.fillRect(90 + k * 6, 42, 4, 4);
    s.fillStyle = '#ffd27a';
    s.fillRect(99, 62, 4, 6);
    s.strokeStyle = '#3a3026';
    s.lineWidth = 1;
    s.beginPath();
    s.moveTo(101, 42);
    s.lineTo(101, 28);
    s.stroke();
    s.fillStyle = '#e9c46a';
    s.beginPath();
    s.moveTo(101, 28);
    s.lineTo(113, 31);
    s.lineTo(101, 35);
    s.fill();
    s.fillStyle = '#2f5a2c';
    for (const [tx, ty] of [
      [30, 100],
      [44, 98],
      [150, 100],
      [168, 98],
      [180, 102],
    ] as const) {
      s.beginPath();
      s.moveTo(tx, ty - 18);
      s.lineTo(tx + 7, ty);
      s.lineTo(tx - 7, ty);
      s.fill();
    }
    s.strokeStyle = '#2a2a30';
    s.beginPath();
    for (const [bx, by] of [
      [60, 50],
      [70, 44],
      [140, 56],
    ] as const) {
      s.moveTo(bx - 4, by - 2);
      s.lineTo(bx, by);
      s.lineTo(bx + 4, by - 2);
    }
    s.stroke();
    this.scene = sc;
    this.work = document.createElement('canvas');
    this.work.width = 400;
    this.work.height = 260;
  }

  /** The clock room: a dark wall for the clock, a bell and two lamps. */
  private paintClockRoom(g: CanvasRenderingContext2D): void {
    rrect(g, 8, PY0, W - 16, PY1 - PY0, 8);
    const wall = g.createLinearGradient(0, PY0, 0, PY1);
    wall.addColorStop(0, '#2a2119');
    wall.addColorStop(1, '#1a140e');
    g.fillStyle = wall;
    g.fill();
    // The clock's case.
    g.fillStyle = '#4a3220';
    rrect(g, 160, PY0 + 4, 60, PY1 - PY0 - 6, 6);
    g.fill();
    g.fillStyle = '#20160e';
    g.fillRect(166, PY0 + 50, 48, PY1 - PY0 - 56);
    g.fillStyle = '#efe6cf';
    g.beginPath();
    g.arc(190, PY0 + 24, 17, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#8a6a3a';
    g.lineWidth = 2;
    g.stroke();
    g.strokeStyle = '#5a4a30';
    g.lineWidth = 1;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(190 + Math.cos(a) * 13, PY0 + 24 + Math.sin(a) * 13);
      g.lineTo(190 + Math.cos(a) * 15.5, PY0 + 24 + Math.sin(a) * 15.5);
      g.stroke();
    }
    text(g, 'the bell', 74, PY1 - 10, { size: 10, color: PAL.faint });
    text(g, 'the clock', 306, PY1 - 10, { size: 10, color: PAL.faint });
  }

  /** A plain needle meter, for 'meter'. */
  private paintMeter(g: CanvasRenderingContext2D): void {
    rrect(g, 8, PY0, W - 16, PY1 - PY0, 8);
    g.fillStyle = '#17120d';
    g.fill();
    g.strokeStyle = PAL.line;
    g.stroke();
    g.strokeStyle = '#5a4a30';
    g.lineWidth = 12;
    g.beginPath();
    g.arc(190, 130, 80, Math.PI + 0.2, Math.PI * 2 - 0.2);
    g.stroke();
    g.strokeStyle = '#0b0907';
    g.lineWidth = 10;
    g.stroke();
    g.strokeStyle = 'rgba(191,179,154,0.5)';
    g.lineWidth = 1;
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI + 0.2 + (k / 10) * (Math.PI - 0.4);
      g.beginPath();
      g.moveTo(190 + Math.cos(a) * 88, 130 + Math.sin(a) * 88);
      g.lineTo(190 + Math.cos(a) * (k % 5 === 0 ? 96 : 92), 130 + Math.sin(a) * (k % 5 === 0 ? 96 : 92));
      g.stroke();
    }
    text(g, 'weak', 120, 138, { size: 10, color: PAL.faint });
    text(g, 'strong', 262, 138, { size: 10, color: PAL.faint });
  }

  /** The sweeping dial, for 'sweep', and the hum meter beside it. */
  private paintSweep(g: CanvasRenderingContext2D): void {
    this.paintFallPanel(g);
    text(g, 'Hum', 290, PY0 + 14, { size: 11, color: PAL.dim, align: 'left' });
    rrect(g, 316, PY0 + 30, 22, 112, 5);
    g.fillStyle = '#0b0907';
    g.fill();
    g.strokeStyle = '#4a3c26';
    g.lineWidth = 1;
    g.stroke();
    rrect(g, 8, PY0, 266, H - PY0 - 6, 8);
    g.fillStyle = '#121019';
    g.fill();
    g.strokeStyle = PAL.line;
    g.stroke();
    g.strokeStyle = '#3a3550';
    g.lineWidth = 14;
    g.beginPath();
    g.arc(141, 168, 96, Math.PI + 0.12, Math.PI * 2 - 0.12);
    g.stroke();
    g.strokeStyle = 'rgba(191,179,154,0.35)';
    g.lineWidth = 1;
    for (let k = 0; k <= 20; k++) {
      const a = Math.PI + 0.12 + (k / 20) * (Math.PI - 0.24);
      g.beginPath();
      g.moveTo(141 + Math.cos(a) * 104, 168 + Math.sin(a) * 104);
      g.lineTo(141 + Math.cos(a) * (k % 5 === 0 ? 112 : 108), 168 + Math.sin(a) * (k % 5 === 0 ? 112 : 108));
      g.stroke();
    }
    g.font = `italic 10px ${FONT}`;
    g.fillStyle = PAL.faint;
    g.textAlign = 'left';
    g.fillText(`← ${this.p.words[0]}`, 18, 200);
    g.textAlign = 'right';
    g.fillText(`${this.p.words[1]} →`, 266, 200);
  }

  /** The readouts' panel beside a fall. */
  private paintFallPanel(g: CanvasRenderingContext2D): void {
    rrect(g, 278, PY0, 96, 154, 6);
    g.fillStyle = 'rgba(33,27,20,0.92)';
    g.fill();
    g.strokeStyle = PAL.line;
    g.lineWidth = 1;
    g.stroke();
  }

  // ---- Drawing: every frame ----------------------------------------------------------------------------

  private draw(dt: number): void {
    const g = this.g;
    g.drawImage(this.back, 0, 0, W, H);
    switch (this.p.look) {
      case 'radio':
        this.drawRadio(dt);
        break;
      case 'focus':
        this.drawFocus();
        break;
      case 'pendulum':
        this.drawPendulum(dt);
        break;
      case 'meter':
        this.drawMeter();
        break;
      case 'sweep':
        this.drawSweep();
        break;
      default:
        this.drawFall(dt);
    }
    if (this.p.mode === 'tune') {
      this.drawNeedle();
      this.drawClock();
    } else this.drawButton();
    if (this.p.look !== 'fall') this.drawBits();
    if (this.host.guided) {
      // The first time, the goal itself glows as the hint.
      g.font = `italic 10.5px ${FONT}`;
      g.fillStyle = `rgba(255,224,138,${0.72 + 0.28 * Math.sin(this.t * 3)})`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(this.p.goal, 8, 11);
    }
  }

  /** The tuning needle on the strip, its reading, and (the first time) a hint of where to look. */
  private drawNeedle(): void {
    const g = this.g;
    const tn = this.tn;
    const x = DX0 + ((this.v - tn.min) / (tn.max - tn.min)) * (DX1 - DX0);
    if (this.host.guided && this.phase === 'play') {
      // A soft glow over the stretch where the target is (wider than the zone itself).
      const span = (tn.reach ?? tn.good * 6) * 0.6;
      const x0 = DX0 + ((this.target - span - tn.min) / (tn.max - tn.min)) * (DX1 - DX0);
      const x1 = DX0 + ((this.target + span - tn.min) / (tn.max - tn.min)) * (DX1 - DX0);
      g.fillStyle = `rgba(255,224,138,${0.08 + 0.06 * Math.sin(this.t * 3)})`;
      g.fillRect(Math.max(DX0, x0), DY - 12, Math.min(DX1, x1) - Math.max(DX0, x0), 12);
    }
    g.fillStyle = 'rgba(255,90,70,0.95)';
    g.fillRect(x - 1, DY - 12, 2, 16);
    g.fillStyle = this.dragging ? PAL.gold : '#d9c08a';
    g.beginPath();
    g.arc(x, DY - 14, 5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3a2c1c';
    g.lineWidth = 1;
    g.stroke();
    // Holding it there fills a ring round the knob.
    if (this.lock > 0) {
      g.strokeStyle = this.lock >= 1 ? PAL.gold : PAL.good;
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(x, DY - 14, 9, -Math.PI / 2, -Math.PI / 2 + this.lock * Math.PI * 2);
      g.stroke();
    }
    const d = tn.decimals ?? 0;
    text(g, `${this.v.toFixed(d)} ${tn.unit}`, W / 2, DY + 24, {
      size: 11.5,
      bold: true,
      color: this.lock > 0 ? PAL.good : PAL.ink,
    });
  }

  /** Time left: a thin line along the top that shrinks. */
  private drawClock(): void {
    const g = this.g;
    const left = clamp(1 - this.t / (this.p.time ?? 30), 0, 1);
    g.fillStyle = left < 0.25 ? 'rgba(255,106,90,0.7)' : 'rgba(233,196,106,0.35)';
    g.fillRect(8, H - 3, (W - 16) * left, 2);
  }

  private drawButton(): void {
    const g = this.g;
    const live = this.live();
    const ptr = this.c.pointer;
    const hover =
      live && ptr.x >= BTN.x && ptr.x <= BTN.x + BTN.w && ptr.y >= BTN.y && ptr.y <= BTN.y + BTN.h;
    rrect(g, BTN.x, BTN.y, BTN.w, BTN.h, 5);
    g.fillStyle = !live ? '#1d1812' : hover ? '#4a3a1e' : '#33281a';
    g.fill();
    g.strokeStyle = live ? PAL.gold : PAL.line;
    g.lineWidth = 1.5;
    g.stroke();
    const label = this.p.action ?? 'Now!';
    g.font = `bold 12px ${FONT}`;
    const size = g.measureText(label).width > BTN.w - 10 ? 10.5 : 12;
    text(g, label, BTN.x + BTN.w / 2, BTN.y + BTN.h / 2 - 0.5, {
      size,
      bold: true,
      color: live ? PAL.gold : PAL.faint,
    });
    text(g, 'Space', BTN.x + BTN.w / 2, BTN.y + BTN.h + 6, { size: 8.5, color: PAL.faint });
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

  // ---- Radio ----------------------------------------------------------------------------------------

  private drawRadio(dt: number): void {
    const g = this.g;
    const s = this.strength;
    // The speaker: its cone trembles with the static, and swings with the voice.
    const voice = s * (0.35 + 0.65 * Math.abs(Math.sin(this.t * 4.3)) * Math.abs(Math.sin(this.t * 1.7)));
    for (let k = 0; k < 4; k++) {
      const r = 10 + k * 9 + Math.sin(this.t * 40 + k) * voice * 1.6 + (Math.random() - 0.5) * (1 - s) * 1.4;
      g.strokeStyle = `rgba(200,170,120,${0.25 + 0.12 * k})`;
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(66, 82, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#3a2c1c';
    g.beginPath();
    g.arc(66, 82, 6, 0, Math.PI * 2);
    g.fill();
    // Static over the speaker and the trace, fading as it's tuned in.
    if (s < 0.98 && this.noise) {
      g.save();
      g.globalAlpha = (1 - s) * 0.42;
      g.beginPath();
      g.arc(66, 82, 44, 0, Math.PI * 2);
      g.rect(125, PY0 + 9, 238, 62);
      g.clip();
      const ox = (Math.random() * 256) | 0;
      const oy = (Math.random() * 128) | 0;
      g.scale(0.5, 0.5);
      g.translate(-ox, -oy);
      g.fillStyle = this.noise;
      // (In screen pixels here: the speaker and the trace window, x 18–368, y 29–139.)
      g.fillRect(ox + 36, oy + 58, 700, 220);
      g.restore();
    }
    // The trace: hiss far off, a voice when it's on.
    g.strokeStyle = `rgba(110,255,150,${0.55 + 0.4 * s})`;
    g.lineWidth = 1.3;
    g.beginPath();
    const mid = PY0 + 40;
    for (let k = 0; k <= 60; k++) {
      const x = 126 + k * 3.93;
      const hiss = (Math.random() - 0.5) * 2;
      const wave = Math.sin(k * 0.42 + this.t * 19) * 0.6 + Math.sin(k * 0.17 - this.t * 7) * 0.4;
      const y = mid + (hiss * (1 - s) * 0.9 + wave * voice) * 24;
      if (k) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
    // The message comes through letter by letter as the static clears.
    this.scrambleT -= dt;
    if (this.scrambleT <= 0) {
      this.scrambleT = 0.07;
      const keep = s >= 0.96 ? 1 : clamp((s - 0.15) / 0.8, 0, 1) ** 1.6;
      for (let li = 0; li < this.msgLines.length; li++) {
        const line = this.msgLines[li]!;
        let out = '';
        for (let ci = 0; ci < line.length; ci++) {
          const ch = line[ci];
          out += ch === ' ' || Math.random() < keep ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0]!;
        }
        this.scrambled[li] = out;
      }
    }
    g.font = `bold 10.5px ${MONO}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = s > 0.9 ? '#f4ead6' : `rgba(191,179,154,${0.35 + 0.5 * s})`;
    const top = PY0 + 99 - (this.scrambled.length - 1) * 6;
    for (let li = 0; li < this.scrambled.length; li++) g.fillText(this.scrambled[li]!, 244, top + li * 12);
    if (this.phase === 'out' && this.outcome.q > 0) this.drawLockGlow(244, PY0 + 40, 140);
  }

  /** A soft gold glow where it locked in. */
  private drawLockGlow(x: number, y: number, r: number): void {
    const g = this.g;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.3 * Math.min(1, this.outT * 3) * (0.8 + 0.2 * Math.sin(this.t * 8));
    g.drawImage(this.warm, x - r, y - r * 0.6, r * 2, r * 1.2);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // ---- Focus ----------------------------------------------------------------------------------------

  private drawFocus(): void {
    const g = this.g;
    const s = this.strength;
    const cx = 190;
    const cy = (PY0 + PY1) / 2;
    const r = 58;
    const sc = this.scene!;
    const wk = this.work!;
    // Out of focus: drawn small and blown up (soft), as much as it's off.
    const k = 1 + (1 - s) ** 1.5 * 16;
    g.save();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.clip();
    if (k < 1.05) g.drawImage(sc, cx - 100, cy - 65, 200, 130);
    else {
      const w = Math.max(2, Math.round(400 / k));
      const h = Math.max(2, Math.round(260 / k));
      const x = wk.getContext('2d')!;
      x.imageSmoothingEnabled = true;
      x.clearRect(0, 0, w + 2, h + 2);
      x.drawImage(sc, 0, 0, w, h);
      g.imageSmoothingEnabled = true;
      g.drawImage(wk, 0, 0, w, h, cx - 100, cy - 65, 200, 130);
    }
    // The glass: a faint sheen and a vignette.
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.beginPath();
    g.ellipse(cx - 20, cy - 26, 30, 12, -0.4, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.strokeStyle = '#1b130b';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(cx, cy, r + 4, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#b08a4a';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy, r + 3, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,236,180,0.7)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(cx, cy, r + 3, Math.PI * 1.08, Math.PI * 1.42);
    g.stroke();
    text(g, s > 0.9 ? 'sharp' : s > 0.5 ? 'nearly' : 'blurred', cx + r + 46, cy, {
      size: 11,
      color: s > 0.9 ? PAL.gold : PAL.faint,
    });
    if (this.phase === 'out' && this.outcome.q > 0) this.drawLockGlow(cx, cy, 90);
  }

  // ---- Pendulum --------------------------------------------------------------------------------------

  private drawPendulum(dt: number): void {
    const g = this.g;
    const tn = this.tn;
    const period = 2 * Math.PI * Math.sqrt(Math.max(0.01, this.v) / 9.81);
    const bellPeriod = 2 * Math.PI * Math.sqrt(Math.max(0.01, this.target) / 9.81);
    // The pendulum swings at its own pace; each swing is a tick.
    const ph = (this.t / period) * 2;
    const half = Math.floor(ph);
    if (half !== this.lastHalf) {
      this.lastHalf = half;
      this.tickFlash = 1;
      this.ticks++;
    }
    const bell = Math.floor((this.t / bellPeriod) * 2);
    if (bell !== this.lastBell) {
      this.lastBell = bell;
      this.bellFlash = 1;
    }
    this.tickFlash = Math.max(0, this.tickFlash - dt * 5);
    this.bellFlash = Math.max(0, this.bellFlash - dt * 5);
    const len = 16 + ((this.v - tn.min) / (tn.max - tn.min)) * 58;
    const ang = 0.3 * Math.sin(Math.PI * ph);
    const px = 190;
    const py = PY0 + 46;
    const bx = px + Math.sin(ang) * len;
    const by = py + Math.cos(ang) * len;
    g.strokeStyle = '#c9a24a';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(bx, by);
    g.stroke();
    g.fillStyle = '#d6b464';
    g.beginPath();
    g.arc(bx, by, 6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#6e5a35';
    g.lineWidth = 1;
    g.stroke();
    // The hands: the long one steps on each tick.
    const a = -Math.PI / 2 + (this.ticks / 60) * Math.PI * 2;
    g.strokeStyle = '#2a2018';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(190, PY0 + 24);
    g.lineTo(190 + Math.cos(a) * 12, PY0 + 24 + Math.sin(a) * 12);
    g.moveTo(190, PY0 + 24);
    g.lineTo(190 + Math.cos(a / 12 - 0.6) * 7, PY0 + 24 + Math.sin(a / 12 - 0.6) * 7);
    g.stroke();
    // The bell (the beat to match) and the clock's tick lamp: in step, they flash together.
    this.drawLamp(74, PY0 + 54, this.bellFlash, '#ffd27a', true);
    this.drawLamp(306, PY0 + 54, this.tickFlash, '#9fe08a', false);
    const rate = 120 / period;
    const bellRate = 120 / bellPeriod;
    text(g, `${Math.round(bellRate)} a minute`, 74, PY0 + 90, { size: 11, color: PAL.dim });
    text(g, `${rate.toFixed(1)} a minute`, 306, PY0 + 90, {
      size: 11,
      bold: true,
      color: this.strength > 0.9 ? PAL.gold : PAL.ink,
    });
    // In step or not: a small needle between them.
    const s = this.strength;
    g.strokeStyle = '#4a3c26';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(250, PY0 + 108, 18, Math.PI + 0.3, Math.PI * 2 - 0.3);
    g.stroke();
    const na = Math.PI + 0.3 + s * (Math.PI - 0.6);
    g.strokeStyle = s > 0.9 ? PAL.gold : PAL.dim;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(250, PY0 + 108);
    g.lineTo(250 + Math.cos(na) * 20, PY0 + 108 + Math.sin(na) * 20);
    g.stroke();
    text(g, 'in step', 250, PY0 + 118, { size: 9, color: PAL.faint });
    if (this.phase === 'out' && this.outcome.q > 0) this.drawLockGlow(190, PY0 + 70, 80);
  }

  private drawLamp(x: number, y: number, f: number, col: string, bell: boolean): void {
    const g = this.g;
    if (f > 0.01) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = f;
      g.drawImage(this.warm, x - 26, y - 26, 52, 52);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    if (bell) {
      const sw = Math.sin(this.t * 30) * f * 0.25;
      g.save();
      g.translate(x, y - 14);
      g.rotate(sw);
      g.fillStyle = f > 0.3 ? '#ffe08a' : '#b8914a';
      g.beginPath();
      g.moveTo(-11, 22);
      g.quadraticCurveTo(-10, 2, 0, 0);
      g.quadraticCurveTo(10, 2, 11, 22);
      g.closePath();
      g.fill();
      g.fillStyle = '#6e5a35';
      g.beginPath();
      g.arc(0, 24, 3, 0, Math.PI * 2);
      g.fill();
      g.restore();
    } else {
      g.fillStyle = f > 0.3 ? col : '#3a4a32';
      g.beginPath();
      g.arc(x, y, 9, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#6e5a35';
      g.lineWidth = 1.5;
      g.stroke();
    }
  }

  // ---- Meter ----------------------------------------------------------------------------------------

  private drawMeter(): void {
    const g = this.g;
    const s = this.strength;
    const a = Math.PI + 0.2 + s * (Math.PI - 0.4) + (Math.random() - 0.5) * 0.04 * (1 - s);
    g.strokeStyle = s > 0.9 ? PAL.gold : PAL.ink;
    g.lineWidth = 2.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(190, 130);
    g.lineTo(190 + Math.cos(a) * 84, 130 + Math.sin(a) * 84);
    g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = '#3a2f20';
    g.beginPath();
    g.arc(190, 130, 7, 0, Math.PI * 2);
    g.fill();
    if (this.phase === 'out' && this.outcome.q > 0) this.drawLockGlow(190, 90, 90);
  }

  // ---- Sweep ----------------------------------------------------------------------------------------

  private drawSweep(): void {
    const g = this.g;
    const x = this.phase === 'out' ? this.pressX() : this.momentX();
    const [g0, g1, p0, p1] = this.windows();
    const ang = (v: number): number => Math.PI + 0.12 + v * (Math.PI - 0.24);
    // The closer the needle comes to the window, the more the dial hums.
    const mid = (p0 + p1) / 2;
    const near = clamp(1 - Math.abs(x - mid) / 0.25, 0, 1) ** 2;
    // The hum meter: it swells as the needle nears the line.
    const hum = this.phase === 'out' ? (this.outcome.q > 0 ? 1 : near) : near;
    const bh = 108 * hum;
    g.fillStyle = hum > 0.85 ? PAL.gold : '#9a83d8';
    g.fillRect(318, PY0 + 140 - bh, 18, bh);
    g.strokeStyle = 'rgba(244,234,214,0.35)';
    g.lineWidth = 1;
    for (let k = 1; k < 5; k++) {
      const yy = PY0 + 32 + k * 21.6;
      g.beginPath();
      g.moveTo(318, yy);
      g.lineTo(322, yy);
      g.stroke();
    }
    if (this.host.guided && this.phase === 'play') {
      g.font = `italic 9.5px ${FONT}`;
      g.fillStyle = 'rgba(255,224,138,0.85)';
      g.textAlign = 'center';
      g.fillText('fire when', 326, PY0 + 158 - 10);
      g.fillText('it hums loudest', 326, PY0 + 158);
      g.strokeStyle = 'rgba(125,255,154,0.22)';
      g.lineWidth = 12;
      g.beginPath();
      g.arc(141, 168, 96, ang(g0), ang(g1));
      g.stroke();
      g.strokeStyle = 'rgba(233,196,106,0.4)';
      g.beginPath();
      g.arc(141, 168, 96, ang(p0), ang(p1));
      g.stroke();
    }
    if (near > 0.02) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = near * 0.6;
      const tx = 141 + Math.cos(ang(x)) * 96;
      const ty = 168 + Math.sin(ang(x)) * 96;
      g.drawImage(this.warm, tx - 30, ty - 30, 60, 60);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    const a = ang(x) + (Math.random() - 0.5) * near * 0.03;
    g.strokeStyle = this.phase === 'out' ? (this.outcome.q > 0 ? PAL.gold : PAL.bad) : PAL.ink;
    g.lineWidth = 2.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(141, 168);
    g.lineTo(141 + Math.cos(a) * 100, 168 + Math.sin(a) * 100);
    g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = '#3a2f20';
    g.beginPath();
    g.arc(141, 168, 8, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = PAL.gold;
    g.lineWidth = 1;
    g.stroke();
    if (this.phase === 'out') {
      // Where it was fired, and where the window really was.
      g.strokeStyle = 'rgba(125,255,154,0.5)';
      g.lineWidth = 12;
      g.beginPath();
      g.arc(141, 168, 96, ang(g0), ang(g1));
      g.stroke();
      g.strokeStyle = 'rgba(233,196,106,0.75)';
      g.beginPath();
      g.arc(141, 168, 96, ang(p0), ang(p1));
      g.stroke();
      if (this.outcome.q > 0) this.drawLockGlow(141, 120, 90);
    }
  }

  private pressX(): number {
    if (this.p.look !== 'sweep') return this.pressU;
    const s = this.pressU * (this.mo.sweeps ?? 3);
    const f = s % 2;
    return f < 1 ? f : 2 - f;
  }

  // ---- Fall -----------------------------------------------------------------------------------------

  private drawFall(dt: number): void {
    const g = this.g;
    const space = this.mo.world === 'space';
    const out = this.phase === 'out';
    const [g0, g1] = this.windows();
    const u = out ? this.pressU : this.u;
    const side = this.outcome.side;
    const o = this.outT;
    // How fast the world goes by: fast at first, slower as it brakes.
    let speedK = 1 - ease(u / Math.max(0.2, g0 + 0.1)) * 0.8;
    if (out && side >= 0 && !(side > 0 && this.pressU >= 1)) speedK *= Math.max(0.15, 1 - o * 1.5);
    g.save();
    rrect(g, 8, PY0, 266, H - PY0 - 6, 8);
    g.clip();
    // The sky, or the dark.
    if (space) {
      g.fillStyle = '#05060b';
      g.fillRect(8, PY0, 266, H - PY0);
      g.fillStyle = '#ffffff';
      for (let i = 0; i < this.stars.length; i += 3) {
        g.globalAlpha = 0.35 + this.stars[i + 2]! * 0.6;
        const y = (this.stars[i + 1]! - this.t * 6 * speedK * (0.5 + this.stars[i + 2]!)) % H;
        g.fillRect(8 + (this.stars[i]! % 266), y < 0 ? y + H : y, 1.2, 1.2);
      }
      g.globalAlpha = 1;
    } else {
      if (!this.skyHigh || !this.skyLow) {
        this.skyHigh = g.createLinearGradient(0, PY0, 0, H);
        this.skyHigh.addColorStop(0, '#050b1c');
        this.skyHigh.addColorStop(1, '#1d3c6e');
        this.skyLow = g.createLinearGradient(0, PY0, 0, H);
        this.skyLow.addColorStop(0, '#3a72b4');
        this.skyLow.addColorStop(1, '#a9d2ee');
      }
      g.fillStyle = this.skyHigh;
      g.fillRect(8, PY0, 266, H - PY0);
      g.globalAlpha = Math.min(1, u * 1.25);
      g.fillStyle = this.skyLow;
      g.fillRect(8, PY0, 266, H - PY0);
      g.globalAlpha = 1;
      // Clouds rush up past it.
      for (let i = 0; i < this.clouds.length; i += 3) {
        this.clouds[i + 1]! -= dt * 260 * speedK * this.clouds[i + 2]!;
        if (this.clouds[i + 1]! < -60) {
          this.clouds[i + 1] = 260 + Math.random() * 120;
          this.clouds[i] = Math.random() * 260;
        }
        g.globalAlpha = 0.35 + 0.3 * this.clouds[i + 2]! * Math.min(1, u * 2 + 0.2);
        g.drawImage(
          this.white,
          8 + this.clouds[i]! - 40,
          this.clouds[i + 1]!,
          80 * this.clouds[i + 2]! + 40,
          26,
        );
      }
      g.globalAlpha = 1;
    }
    // The ground rises in the last part of the way.
    const settle = out && side === 0 && space ? ease(o / 1.4) * 0.7 : 0;
    const groundK = Math.max(
      clamp((u - 0.55) / 0.45, 0, 1) + (out && side >= 0 ? clamp(o * (side > 0 ? 0.9 : 0.25), 0, 0.4) : 0),
      settle,
    );
    const gy = H + 10 - groundK * 70;
    if (groundK > 0) this.drawGround(gy, space);
    // Speed lines while it's fast.
    g.strokeStyle = space ? 'rgba(200,210,255,0.18)' : 'rgba(255,255,255,0.25)';
    g.lineWidth = 1;
    for (let k = 0; k < 8; k++) {
      const x = 30 + ((k * 61) % 230);
      const y = (PY0 + 200 - ((this.t * 400 * speedK + k * 47) % 220)) | 0;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + 14 * speedK);
      g.stroke();
    }
    // The craft.
    let cx = 140;
    let cy = 84;
    let tilt = Math.sin(this.t * 1.3) * 0.05;
    const braking = out && !(side < 0 && !space);
    if (out) {
      if (side > 0) {
        // Too late: it meets the ground (or the sea) before it can stop.
        cy += ease(o / 0.6) * Math.max(0, gy - 30 - cy);
        if (o > 0.6 && !this.struck) {
          this.struck = true;
          for (let i = 0; i < 26; i++)
            this.spawn(
              cx + (Math.random() - 0.5) * 30,
              gy - 20,
              (Math.random() - 0.5) * 160,
              -60 - Math.random() * 120,
              0.9,
              2.2,
              space ? (i % 3 ? '#9a9a9a' : '#ffd27a') : i % 2 ? '#3f8a3a' : '#6b4a2c',
              320,
            );
        }
        tilt = o > 0.6 ? 0.5 : tilt;
      } else if (side < 0) {
        // Too early: the chute tears and it falls on — or the rockets hold it a moment, run dry, and it drops.
        const f = space ? Math.max(0, o - 0.5) : o;
        cy += f * f * 90;
        tilt = Math.sin(this.t * 6) * 0.15;
      } else {
        // Just right: it slows, and settles (on its legs, out there).
        cy += ease(o / 1.4) * (space ? Math.max(0, gy - 17 - cy) : 26);
        tilt *= 1 - Math.min(1, o);
      }
    }
    if (space) this.drawLander(cx, cy, tilt, braking, side);
    else this.drawCapsule(cx, cy, tilt, u, g0, side, gy);
    if (out && side > 0 && o > 0.6) {
      // The thump.
      const k = (o - 0.6) / 0.5;
      if (k < 1) {
        g.strokeStyle = `rgba(255,255,255,${0.6 * (1 - k)})`;
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(cx, gy - 12, 14 + k * 50, 3 + k * 8, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    this.drawBits();
    g.restore();
    this.drawReadouts(this.shownU(), g0, g1, space);
  }

  private drawGround(gy: number, space: boolean): void {
    const g = this.g;
    if (space) {
      // A grey, airless ground with craters.
      g.fillStyle = '#6d6f73';
      g.beginPath();
      g.moveTo(8, gy + 6);
      g.quadraticCurveTo(80, gy - 6, 150, gy + 2);
      g.quadraticCurveTo(220, gy + 8, 280, gy - 2);
      g.lineTo(280, H);
      g.lineTo(8, H);
      g.fill();
      g.fillStyle = '#55575b';
      for (const [x, w] of [
        [50, 14],
        [120, 9],
        [210, 18],
      ] as const) {
        g.beginPath();
        g.ellipse(x, gy + 16, w, w * 0.3, 0, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      // Home: the vale — green fields, the river, and the keep.
      g.fillStyle = '#3f8a3a';
      g.beginPath();
      g.moveTo(8, gy + 2);
      g.quadraticCurveTo(90, gy - 8, 170, gy);
      g.quadraticCurveTo(230, gy + 6, 280, gy - 4);
      g.lineTo(280, H);
      g.lineTo(8, H);
      g.fill();
      g.fillStyle = '#356f31';
      g.fillRect(8, gy + 14, 272, H - gy);
      g.strokeStyle = '#4a8fd0';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(8, gy + 12);
      g.quadraticCurveTo(80, gy + 4, 150, gy + 10);
      g.quadraticCurveTo(210, gy + 16, 280, gy + 8);
      g.stroke();
      g.fillStyle = '#8c8478';
      g.fillRect(214, gy - 18, 12, 20);
      g.fillRect(212, gy - 21, 16, 4);
      g.fillStyle = '#ffd27a';
      g.fillRect(219, gy - 12, 2, 3);
    }
  }

  /** The capsule, heat shield down: glowing while the air still brakes it hard, then the parachute. */
  private drawCapsule(
    cx: number,
    cy: number,
    tilt: number,
    u: number,
    g0: number,
    side: number,
    gy: number,
  ): void {
    const g = this.g;
    const out = this.phase === 'out';
    const o = this.outT;
    // The glow of the air it ploughs through: it holds while it's too fast, and dies quickly just as
    // it's slow enough — the cue to open the chute.
    const heat = clamp((g0 + 0.01 - u) / 0.06, 0, 1) ** 0.6;
    if (heat > 0.01) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = heat * (0.85 + 0.15 * Math.sin(this.t * 30));
      g.drawImage(this.warm, cx - 34, cy - 10, 68, 52);
      g.globalAlpha = heat * 0.6;
      g.drawImage(this.white, cx - 18, cy + 4, 36, 22);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      if (Math.random() < heat)
        this.spawn(
          cx + (Math.random() - 0.5) * 24,
          cy + 10,
          (Math.random() - 0.5) * 30,
          -120 - Math.random() * 80,
          0.4,
          1.8,
          '#ffb060',
          0,
        );
    }
    if (out && this.pressU < 1) {
      // The parachute: blooms when it's right; tears when it's too early.
      const open = ease(o / 0.35);
      const top = cy - 18 - 46 * open;
      const w = 10 + 40 * open;
      if (side < 0) {
        if (!this.struck && o > 0.25) {
          this.struck = true;
          for (let i = 0; i < 18; i++)
            this.spawn(
              cx + (Math.random() - 0.5) * 40,
              top + 10,
              (Math.random() - 0.5) * 120,
              -60 - Math.random() * 120,
              1.2,
              3,
              i % 2 ? '#e8e4da' : '#d0563a',
              120,
            );
        }
        if (o < 0.3) this.drawCanopy(cx, top, w, cy - 10, 1 - o * 2);
      } else if (side > 0 && o > 0.6) {
        // Down too hard: the canopy slumps over it.
        const k = clamp((o - 0.6) / 0.6, 0, 1);
        this.drawCanopy(
          cx + k * 30,
          Math.min(gy - 20, top + k * 60),
          w * (1 - k * 0.4),
          cy - 10,
          1 - k * 0.5,
        );
      } else this.drawCanopy(cx, top + Math.sin(this.t * 2) * 1.5, w, cy - 10, 1);
    }
    g.save();
    g.translate(cx, cy);
    g.rotate(tilt);
    g.fillStyle = '#d7dbe1';
    g.beginPath();
    g.moveTo(-17, 8);
    g.lineTo(-7, -14);
    g.lineTo(7, -14);
    g.lineTo(17, 8);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.beginPath();
    g.moveTo(5, -14);
    g.lineTo(7, -14);
    g.lineTo(17, 8);
    g.lineTo(9, 8);
    g.closePath();
    g.fill();
    g.fillStyle = heat > 0.2 ? '#5a2e1a' : '#4a3a30';
    g.beginPath();
    g.moveTo(-19, 8);
    g.lineTo(19, 8);
    g.quadraticCurveTo(0, 18, -19, 8);
    g.fill();
    g.fillStyle = '#5ec8d8';
    g.beginPath();
    g.arc(3, -3, 2.4, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  private drawCanopy(cx: number, top: number, w: number, base: number, a: number): void {
    const g = this.g;
    g.globalAlpha = a;
    g.strokeStyle = 'rgba(230,226,216,0.7)';
    g.lineWidth = 0.8;
    g.beginPath();
    for (const dx of [-1, -0.5, 0, 0.5, 1]) {
      g.moveTo(cx + dx * w, top + 10);
      g.lineTo(cx, base);
    }
    g.stroke();
    g.beginPath();
    g.moveTo(cx - w, top + 10);
    g.quadraticCurveTo(cx - w, top - 12, cx, top - 12);
    g.quadraticCurveTo(cx + w, top - 12, cx + w, top + 10);
    g.quadraticCurveTo(cx, top + 2, cx - w, top + 10);
    g.fillStyle = '#e8e4da';
    g.fill();
    g.fillStyle = '#c0563a';
    g.beginPath();
    g.moveTo(cx - w * 0.33, top + 5);
    g.quadraticCurveTo(cx - w * 0.3, top - 12, cx, top - 12);
    g.quadraticCurveTo(cx + w * 0.3, top - 12, cx + w * 0.33, top + 5);
    g.quadraticCurveTo(cx, top + 1, cx - w * 0.33, top + 5);
    g.fill();
    g.globalAlpha = 1;
  }

  /** The lander, on its way down: legs out, and its rockets when it brakes. */
  private drawLander(cx: number, cy: number, tilt: number, braking: boolean, side: number): void {
    const g = this.g;
    const o = this.outT;
    // Out of fuel too high (too early): the flame sputters out.
    let flame = braking ? 1 : 0;
    if (braking && side < 0) flame = o < 0.5 ? 1 - o * 2 * Math.random() : 0;
    if (braking && side === 0) flame = Math.max(0.3, 1 - o * 0.5);
    g.save();
    g.translate(cx, cy);
    g.rotate(tilt);
    if (flame > 0.05) {
      const f = (12 + Math.random() * 8) * flame;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.8 * flame;
      g.drawImage(this.warm, -16, 6, 32, 20 + f);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(255,240,200,0.95)';
      for (const ex of [-6, 6]) {
        g.beginPath();
        g.moveTo(ex - 3, 10);
        g.lineTo(ex, 10 + f);
        g.lineTo(ex + 3, 10);
        g.fill();
      }
    }
    g.strokeStyle = '#9aa0a8';
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-10, 2);
    g.lineTo(-20, 14);
    g.moveTo(10, 2);
    g.lineTo(20, 14);
    g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = '#3a3a40';
    for (const ex of [-6, 6]) {
      g.beginPath();
      g.moveTo(ex - 2.5, 4);
      g.lineTo(ex + 2.5, 4);
      g.lineTo(ex + 4, 10);
      g.lineTo(ex - 4, 10);
      g.fill();
    }
    g.fillStyle = '#c9a64a';
    g.fillRect(-12, -10, 24, 14);
    g.fillStyle = '#9aa0a8';
    g.fillRect(-14, -13, 28, 4);
    g.fillStyle = '#e6e8ec';
    g.fillRect(-6, -19, 12, 6);
    g.restore();
  }

  /** The readouts beside a fall: height and speed, with (the first time) marks for when. */
  private drawReadouts(u: number, g0: number, g1: number, space: boolean): void {
    const g = this.g;
    // Only the first two configured readouts are visited below.
    const rs = this.mo.readouts ?? [];
    for (let i = 0; i < Math.min(2, rs.length); i++) {
      const r = rs[i]!;
      const y = PY0 + 10 + i * 74;
      const v = this.phase === 'out' ? this.shownValue(i) : this.readout(i, u);
      text(g, r.label, 290, y + 4, { size: 11, color: PAL.dim, align: 'left' });
      // Red while it's still too early (too fast, too high).
      const early = this.phase === 'play' && u < g0;
      text(g, `${v.toFixed(r.decimals ?? 0)} ${r.unit}`, 366, y + 22, {
        size: 14,
        bold: true,
        color: early ? '#ff8a7a' : PAL.ink,
        align: 'right',
      });
      // A bar: full at the start, down to the end value.
      const k = clamp((v - Math.min(r.from, r.to)) / Math.abs(r.to - r.from), 0, 1);
      rrect(g, 290, y + 34, 76, 8, 4);
      g.fillStyle = '#0b0907';
      g.fill();
      g.strokeStyle = '#4a3c26';
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = i === 0 ? '#6aa8ff' : '#e9c46a';
      g.fillRect(291, y + 35, 74 * k, 6);
      if (this.host.guided && this.phase === 'play') {
        // Marks: when the window opens and when it closes, on each readout.
        for (const [wu, col] of [
          [g0, 'rgba(125,255,154,0.95)'],
          [g1, 'rgba(255,106,90,0.95)'],
        ] as [number, string][]) {
          const wk = clamp((this.readout(i, wu) - Math.min(r.from, r.to)) / Math.abs(r.to - r.from), 0, 1);
          g.fillStyle = col;
          g.fillRect(290 + 76 * wk - 1, y + 31, 2, 14);
        }
      }
    }
    if (this.host.guided && this.phase === 'play') {
      const lines = (this.hintLines ??= space
        ? ['light them as the green', 'mark passes — before the red']
        : ['open it once the glow', 'fades — before the red mark']);
      g.font = `italic 9.5px ${FONT}`;
      g.fillStyle = 'rgba(255,224,138,0.85)';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(lines[0], 326, PY0 + 133);
      g.fillText(lines[1], 326, PY0 + 144);
    }
  }
}

/** Which demo the playground shows (?variant=…). */
function variant<T extends object>(all: T, fallback: keyof T): T[keyof T] {
  const v = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('variant');
  return v && Object.hasOwn(all, v) ? all[v as keyof T] : all[fallback];
}

export const sweet: MinigameDef<SweetParams> = {
  kind: 'sweet',
  name: 'Find the sweet spot',
  get demo() {
    return variant(SWEET_DEMOS, 'radio');
  },
  create: (host, p) => new SweetGame(host, p),
};
