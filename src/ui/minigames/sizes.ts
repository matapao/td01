export type { SizesOption } from './sizes-data.ts';
export type { SizesRole } from './sizes-data.ts';
export type { SizesSlot } from './sizes-data.ts';
export type { SizesTarget } from './sizes-data.ts';
export type { SizesParams } from './sizes-data.ts';
export { SIZES_DEMOS } from './sizes-data.ts';
import { SIZES_DEMOS } from './sizes-data.ts';
import type { SizesRole, SizesSlot, SizesParams } from './sizes-data.ts';
/**
 * Pick the sizes (TECH_LINEAGE §4): choose a size for each part — gear teeth, cells in a chain, a
 * rocket's stages, fuel and payload — and see what it makes, live: gears turn at the speed they give,
 * a lamp glows as bright as its cells push, the needle on the gauge swings. When it sits in the band,
 * test it: the mill runs, the lamp is switched on, the rocket flies — and shows why it worked or not.
 *
 * Click the arrows to change a size (or ←/→, with ↑/↓ to pick the part); clicking the size itself
 * steps through them all. Enter tests.
 */
import type { Minigame, MinigameDef, MinigameHost, Quality } from './types.ts';
import { canvasIn, finisher, rrect, text, FONT, PAL } from './kit.ts';

const W = 380;
const H = 220;
/** The slots' column, and where the picture starts. */
const LX = 10;
const LW = 142;
const VX = 162;
const BTN = { x: 16, y: 178, w: 130, h: 25 };
/** The top gauge (gears, cells). */
const GX0 = 176;
const GX1 = 364;
/** How long the test runs before the verdict (s). */
const TEST_T = 1.9;

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const ease = (k: number): number => 1 - (1 - clamp(k, 0, 1)) ** 3;

/** A rounded-up gauge end (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ). */
function niceCeil(v: number): number {
  const e = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= v - 1e-9) return m * e;
  return 10 * e;
}

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

/** A gear's outline: `teeth` teeth on a pitch circle of radius `r` (module `m`), tooth 0 at angle 0. */
function gearPath(teeth: number, r: number, m: number): Path2D {
  const p = new Path2D();
  const ro = r + m * 0.95;
  const ri = r - m * 1.15;
  const w = (Math.PI * 2) / teeth;
  for (let k = 0; k < teeth; k++) {
    const a = k * w;
    const pts: [number, number][] = [
      [ri, a - 0.28 * w],
      [ro, a - 0.13 * w],
      [ro, a + 0.13 * w],
      [ri, a + 0.28 * w],
    ];
    for (let j = 0; j < 4; j++) {
      const [rr, aa] = pts[j]!;
      if (k === 0 && j === 0) p.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
      else p.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
    }
  }
  p.closePath();
  return p;
}

/** A spark, puff or scrap of flour: one shared pool, so nothing is allocated per frame. */
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

/** A slot as played: its sizes, labels, and which one is picked. */
interface Slot {
  def: SizesSlot;
  values: number[];
  labels: string[];
  colours: (string | undefined)[];
  idx: number;
  y: number;
  pop: number;
}

class SizesGame implements Minigame {
  private readonly host: MinigameHost;
  private readonly p: SizesParams;

  private readonly c: ReturnType<typeof canvasIn>;
  private readonly g: CanvasRenderingContext2D;
  private readonly end: ReturnType<typeof finisher>;
  private readonly slots: Slot[];
  private readonly style: 'gears' | 'cells' | 'rocket' | 'generic';
  private readonly vals: number[];
  private readonly min: number;
  private readonly max: number;
  private readonly back: HTMLCanvasElement;
  private readonly warm = glowSprite(255, 190, 90);
  private readonly white = glowSprite(255, 250, 230);
  private readonly bits: Bit[] = [];
  private bitI = 0;
  private readonly heldKeys = new Set<string>();
  private value = 0;
  /** Made when the choice changes, not every frame: the reading, the gear legend, the battery's label. */
  private reading = '';
  private legend: [string, string] = ['', ''];
  private cellsLabel = '';
  private readonly shortNames: [string, string];
  /** The slots the two gears are sized by (they pop when changed). */
  private readonly gearSlots: [Slot | undefined, Slot | undefined];
  /** The legend names' widths (to place their colour dots). */
  private readonly nameW: [number, number] = [0, 0];
  private readonly maxFuel: number;
  private readonly maxPayload: number;
  private needle = 0;
  private needleV = 0;
  private focus = 0;
  private t = 0;
  private phase: 'pick' | 'test' = 'pick';
  private testT = 0;
  private outcome: { q: Quality; why: string; side: -1 | 0 | 1 } = { q: 0, why: '', side: 0 };
  /** The guided next step: which slot, which way (0: test it). */
  private hint = { slot: -1, dir: 0 };
  // Gears.
  private gearA: Path2D | null = null;
  private gearB: Path2D | null = null;
  private teethA = 0;
  private teethB = 0;
  private module = 2;
  private spinA = 0;
  // Rocket.
  private readonly drops: {
    on: boolean;
    x: number;
    y: number;
    vy: number;
    rot: number;
    h: number;
    w: number;
    k: number;
  }[] = [];
  private dropped = 0;
  private struck = false;

  constructor(host: MinigameHost, p: SizesParams) {
    this.host = host;
    this.p = p;

    if (p.slots.length === 0 || p.slots.some((slot) => slot.options.length === 0))
      throw new Error('Sizing needs slots with at least one option each');
    // Slot values, labels, colours and selected values are parallel; selected option indices are clamped or wrapped.
    this.style = p.style ?? 'generic';
    this.slots = p.slots.map((def) => {
      const values: number[] = [];
      const labels: string[] = [];
      const colours: (string | undefined)[] = [];
      for (const o of def.options) {
        if (typeof o === 'number') {
          values.push(o);
          labels.push(def.unit ? `${o} ${def.unit}` : `${o}`);
          colours.push(undefined);
        } else {
          values.push(o.value);
          labels.push(o.label);
          colours.push(o.colour);
        }
      }
      return { def, values, labels, colours, idx: clamp(def.start ?? 0, 0, values.length - 1), y: 0, pop: 0 };
    });
    const n = this.slots.length;
    const y0 = n >= 3 ? 40 : 52;
    const step = n >= 3 ? 46 : 54;
    this.slots.forEach((s, i) => (s.y = y0 + i * step));
    this.vals = this.slots.map((s) => s.values[s.idx]!);
    const tg = p.target;
    this.min = tg.min ?? 0;
    this.max = tg.max ?? niceCeil(tg.hi * 1.45);
    const short = (r: SizesRole, i: number): string =>
      (this.slots.find((x) => x.def.role === r) ?? this.slots[i]!)?.def.name.replace(/\s*\(.*\)$/, '') ?? '';
    this.shortNames = [short('driver', 0), short('driven', 1)];
    this.gearSlots = [this.slotOf('driver'), this.slotOf('driven')];
    this.maxFuel = Math.max(...this.optionsOf('fuel', 1));
    this.maxPayload = Math.max(...this.optionsOf('payload', 2));
    if (this.style === 'gears') {
      const maxA = Math.max(...this.optionsOf('driver', 0));
      const maxB = Math.max(...this.optionsOf('driven', 1));
      this.module = Math.min(124 / maxA, 250 / (maxA + 2 * maxB), 3);
    }
    for (let i = 0; i < 120; i++)
      this.bits.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, col: '#fff', grav: 0 });
    for (let i = 0; i < 3; i++) this.drops.push({ on: false, x: 0, y: 0, vy: 0, rot: 0, h: 0, w: 0, k: 0 });
    this.end = finisher(host);
    this.c = canvasIn(host, W, H, { down: (q) => this.down(q.x, q.y) });
    this.g = this.c.g;
    this.g.font = `9.5px ${FONT}`;
    this.nameW[0] = this.g.measureText(this.shortNames[0]).width;
    this.nameW[1] = this.g.measureText(this.shortNames[1]).width;
    this.back = this.paintBack();
    this.recompute();
    this.needle = this.value;
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
  }

  /** The options of the slot with this role (or the slot at `fallback`). */
  private optionsOf(role: SizesRole, fallback: number): number[] {
    const s = this.slots.find((x) => x.def.role === role) ?? this.slots[fallback];
    return s ? s.values : [1];
  }

  /** The chosen value of the slot with this role. */
  private valueOf(role: SizesRole, fallback: number, dflt = 1): number {
    const i = this.slots.findIndex((x) => x.def.role === role);
    if (i >= 0) return this.vals[i]!;
    return fallback >= 0 && fallback < this.vals.length ? this.vals[fallback]! : dflt;
  }

  private slotOf(role: SizesRole): Slot | undefined {
    return this.slots.find((x) => x.def.role === role);
  }

  // ---- Input ---------------------------------------------------------------------------------------

  private readonly onKey = (e: KeyboardEvent): void => {
    const k = e.key;
    const ours =
      k === 'ArrowLeft' ||
      k === 'ArrowRight' ||
      k === 'ArrowUp' ||
      k === 'ArrowDown' ||
      k === 'Enter' ||
      k === ' ';
    if (!ours) return;
    if (e.type === 'keyup') {
      if (!this.heldKeys.delete(k)) return;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.heldKeys.add(k);
    if (this.phase !== 'pick' || this.end.finished()) return;
    if (k === 'ArrowUp') this.focus = (this.focus + this.slots.length - 1) % this.slots.length;
    else if (k === 'ArrowDown') this.focus = (this.focus + 1) % this.slots.length;
    else if (k === 'ArrowLeft') this.step(this.focus, -1, false);
    else if (k === 'ArrowRight') this.step(this.focus, 1, false);
    else if (!e.repeat) this.test();
  };

  private down(x: number, y: number): void {
    if (this.phase !== 'pick' || this.end.finished()) return;
    if (x >= BTN.x && x <= BTN.x + BTN.w && y >= BTN.y && y <= BTN.y + BTN.h) {
      this.test();
      return;
    }
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]!;
      if (y < s.y + 12 || y > s.y + 38 || x < LX + 4 || x > LX + LW - 4) continue;
      this.focus = i;
      if (x < LX + 30) this.step(i, -1, false);
      else if (x > LX + LW - 30) this.step(i, 1, false);
      else this.step(i, 1, true);
      return;
    }
  }

  /** Moves slot `i` one size up or down (`wrap`: past the end, round to the start). */
  private step(i: number, dir: number, wrap: boolean): void {
    const s = this.slots[i]!;
    let k = s.idx + dir;
    if (k < 0 || k >= s.values.length) {
      if (!wrap) return;
      k = (k + s.values.length) % s.values.length;
    }
    s.idx = k;
    s.pop = 1;
    this.vals[i]! = s.values[k]!;
    this.recompute();
  }

  private recompute(): void {
    this.value = this.p.compute(this.vals);
    this.reading = `${this.value.toFixed(this.p.target.decimals ?? 0)} ${this.p.target.unit}`;
    if (this.style === 'cells') {
      const series = Math.max(1, Math.round(this.valueOf('series', 0)));
      const rows = Math.max(1, Math.round(this.valueOf('parallel', -1, 1)));
      this.cellsLabel = `${series} in a chain${rows > 1 ? `, ${rows} side by side` : ''}`;
    }
    if (this.style === 'gears') {
      const a = Math.round(this.valueOf('driver', 0, 24));
      const b = Math.round(this.valueOf('driven', 1, 12));
      if (a !== this.teethA) {
        this.teethA = a;
        this.gearA = gearPath(a, (a * this.module) / 2, this.module);
      }
      if (b !== this.teethB) {
        this.teethB = b;
        this.gearB = gearPath(b, (b * this.module) / 2, this.module);
      }
      const unit = this.p.target.unit;
      this.legend = [`${Math.round((this.value * b) / a)} ${unit}`, `${Math.round(this.value)} ${unit}`];
    }
    if (this.host.guided) this.findHint();
  }

  /** The first time: the step toward the nearest perfect choice (fewest clicks away), or "test it". */
  private findHint(): void {
    const tg = this.p.target;
    if (this.value >= tg.perfectLo && this.value <= tg.perfectHi) {
      this.hint = { slot: -1, dir: 0 };
      return;
    }
    const n = this.slots.length;
    const idx = this.slots.map((s) => s.idx);
    const vals = this.vals.slice();
    let best: number[] | null = null;
    let bestD = Infinity;
    const walk = (i: number): void => {
      if (i === n) {
        const v = this.p.compute(vals);
        if (v < tg.perfectLo || v > tg.perfectHi) return;
        let d = 0;
        for (let k = 0; k < n; k++) d += Math.abs(idx[k]! - this.slots[k]!.idx);
        if (d < bestD) {
          bestD = d;
          best = idx.slice();
        }
        return;
      }
      const s = this.slots[i]!;
      const keep = idx[i]!;
      for (let k = 0; k < s.values.length; k++) {
        idx[i] = k;
        vals[i] = s.values[k]!;
        walk(i + 1);
      }
      idx[i] = keep;
      vals[i] = s.values[keep]!;
    };
    walk(0);
    const goal = best as number[] | null;
    this.hint = { slot: -1, dir: 0 };
    if (!goal) return;
    for (let i = 0; i < n; i++) {
      if (goal[i]! !== this.slots[i]!.idx) {
        this.hint = { slot: i, dir: goal[i]! > this.slots[i]!.idx ? 1 : -1 };
        return;
      }
    }
  }

  private test(): void {
    if (this.phase !== 'pick' || this.end.finished()) return;
    const tg = this.p.target;
    const v = this.value;
    if (v < tg.lo) this.outcome = { q: 0, why: this.p.whyLow, side: -1 };
    else if (v > tg.hi) this.outcome = { q: 0, why: this.p.whyHigh, side: 1 };
    else if (v >= tg.perfectLo && v <= tg.perfectHi) this.outcome = { q: 2, why: this.p.whyPerfect, side: 0 };
    else this.outcome = { q: 1, why: this.p.whyGood, side: 0 };
    this.phase = 'test';
    this.testT = 0;
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
    // The preallocated bit pool is selected modulo its length.
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

  // ---- Frame -------------------------------------------------------------------------------------

  update(dt: number): void {
    this.t += dt;
    if (this.phase === 'test') this.testT += dt;
    this.needleV += (160 * (this.value - this.needle) - 15 * this.needleV) * dt;
    this.needle += this.needleV * dt;
    for (const s of this.slots) s.pop = Math.max(0, s.pop - dt * 5);
    for (const b of this.bits) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.vy += b.grav * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    this.draw(dt);
    if (this.phase === 'test' && this.testT >= TEST_T) this.end.finish(this.outcome.q, this.outcome.why);
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
    // The slots' panel, with the goal at its head.
    rrect(g, LX - 4, 6, LW + 8, 208, 6);
    g.fillStyle = 'rgba(33,27,20,0.92)';
    g.fill();
    g.strokeStyle = PAL.line;
    g.lineWidth = 1;
    g.stroke();
    g.font = `italic 10.5px ${FONT}`;
    const lines = this.wrap(g, this.p.goal, LW - 6);
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      g.fillStyle = PAL.dim;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(lines[i]!, LX + LW / 2, 15 + i * 12.5);
    }
    if (this.style === 'rocket') this.paintSky(g);
    else if (this.style === 'generic') this.paintDial(g);
    else this.paintTrack(g);
    return cv;
  }

  private wrap(g: CanvasRenderingContext2D, s: string, w: number): string[] {
    const out: string[] = [];
    let line = '';
    for (const word of s.split(' ')) {
      const tryLine = line ? `${line} ${word}` : word;
      if (g.measureText(tryLine).width > w && line) {
        out.push(line);
        line = word;
      } else line = tryLine;
    }
    if (line) out.push(line);
    return out;
  }

  private gx(v: number): number {
    return GX0 + clamp((v - this.min) / (this.max - this.min), 0, 1) * (GX1 - GX0);
  }

  /** The top gauge's track: bands, ticks and end words (gears, cells). */
  private paintTrack(g: CanvasRenderingContext2D): void {
    const tg = this.p.target;
    text(g, tg.label, GX0, 14, { size: 12, color: PAL.ink, align: 'left' });
    const y = 24;
    rrect(g, GX0 - 2, y - 1, GX1 - GX0 + 4, 12, 5);
    g.fillStyle = '#0b0907';
    g.fill();
    g.strokeStyle = '#5a4a30';
    g.stroke();
    g.fillStyle = 'rgba(125,255,154,0.24)';
    g.fillRect(this.gx(tg.lo), y + 1, this.gx(tg.hi) - this.gx(tg.lo), 8);
    g.fillStyle = 'rgba(233,196,106,0.62)';
    g.fillRect(this.gx(tg.perfectLo), y + 1, Math.max(2, this.gx(tg.perfectHi) - this.gx(tg.perfectLo)), 8);
    g.strokeStyle = 'rgba(191,179,154,0.45)';
    g.beginPath();
    for (let k = 0; k <= 10; k++) {
      const x = GX0 + ((GX1 - GX0) * k) / 10;
      g.moveTo(x, y + 12);
      g.lineTo(x, y + (k % 5 === 0 ? 17 : 14.5));
    }
    g.stroke();
    text(g, `${this.min}`, GX0, y + 23, { size: 8.5, color: PAL.faint });
    text(g, `${this.max}`, GX1, y + 23, { size: 8.5, color: PAL.faint });
    if (this.p.words) {
      g.font = `italic 10px ${FONT}`;
      g.fillStyle = PAL.dim;
      g.textAlign = 'left';
      g.fillText(`← ${this.p.words[0]}`, GX0 + 12, y + 23);
      g.textAlign = 'right';
      g.fillText(`${this.p.words[1]} →`, GX1 - 14, y + 23);
    }
    g.strokeStyle = 'rgba(90,74,48,0.6)';
    g.beginPath();
    g.moveTo(VX + 6, 56);
    g.lineTo(W - 8, 56);
    g.stroke();
  }

  /** The rocket's sky: dusk to dark, a few stars, the orbit band and the speed scale. */
  private paintSky(g: CanvasRenderingContext2D): void {
    const sky = g.createLinearGradient(0, 8, 0, 206);
    // Dark space above, the home world's blue air low down.
    sky.addColorStop(0, '#04060d');
    sky.addColorStop(0.5, '#0f1a33');
    sky.addColorStop(1, '#2d5a86');
    rrect(g, VX, 6, 172, 208, 6);
    g.fillStyle = sky;
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 40; i++) {
      const x = VX + 4 + ((i * 97.3) % 164);
      const y = 10 + ((i * 53.7) % 80);
      g.fillRect(x, y, i % 5 === 0 ? 1.4 : 0.8, i % 5 === 0 ? 1.4 : 0.8);
    }
    // The ground and the pad.
    g.fillStyle = '#2f4a2c';
    g.fillRect(VX, 202, 172, 12);
    g.fillStyle = '#556052';
    g.fillRect(VX + 66, 199, 44, 4);
    const tg = this.p.target;
    const y0 = this.sy(tg.hi);
    const y1 = this.sy(tg.lo);
    g.fillStyle = 'rgba(125,255,154,0.08)';
    g.fillRect(VX, y0, 172, y1 - y0);
    g.fillStyle = 'rgba(233,196,106,0.12)';
    g.fillRect(VX, this.sy(tg.perfectHi), 172, this.sy(tg.perfectLo) - this.sy(tg.perfectHi));
    g.setLineDash([3, 4]);
    g.strokeStyle = 'rgba(233,196,106,0.4)';
    g.beginPath();
    const mid = this.sy((tg.perfectLo + tg.perfectHi) / 2);
    g.moveTo(VX + 4, mid);
    g.lineTo(VX + 168, mid);
    g.stroke();
    g.setLineDash([]);
    g.font = `italic 10px ${FONT}`;
    g.fillStyle = 'rgba(233,196,106,0.75)';
    g.textAlign = 'left';
    g.textBaseline = 'bottom';
    if (tg.band) g.fillText(tg.band, VX + 6, y0 - 2);
    // The scale on the right.
    const sx = 352;
    rrect(g, sx - 5, this.sy(this.max) - 2, 10, this.sy(this.min) - this.sy(this.max) + 4, 4);
    g.fillStyle = '#0b0907';
    g.fill();
    g.strokeStyle = '#5a4a30';
    g.stroke();
    g.fillStyle = 'rgba(125,255,154,0.3)';
    g.fillRect(sx - 3, y0, 6, y1 - y0);
    g.fillStyle = 'rgba(233,196,106,0.7)';
    g.fillRect(sx - 3, this.sy(tg.perfectHi), 6, this.sy(tg.perfectLo) - this.sy(tg.perfectHi));
    g.strokeStyle = 'rgba(191,179,154,0.5)';
    g.beginPath();
    for (let k = 0; k <= 10; k++) {
      const y = this.sy(this.min + ((this.max - this.min) * k) / 10);
      g.moveTo(sx + 6, y);
      g.lineTo(sx + (k % 5 === 0 ? 11 : 8.5), y);
    }
    g.stroke();
    text(g, `${this.max}`, sx + 1, this.sy(this.max) - 9, { size: 8.5, color: PAL.faint });
    text(g, `${this.min}`, sx + 1, this.sy(this.min) + 9, { size: 8.5, color: PAL.faint });
  }

  /** The rocket scale's height for a value. */
  private sy(v: number): number {
    return 196 - clamp((v - this.min) / (this.max - this.min), 0, 1.06) * 160;
  }

  /** The plain dial (generic): bands, ticks and the end words. */
  private paintDial(g: CanvasRenderingContext2D): void {
    const tg = this.p.target;
    const x = 270;
    const y = 132;
    const r = 70;
    text(g, tg.label, x, 22, { size: 13, color: PAL.ink });
    g.lineCap = 'butt';
    g.strokeStyle = '#5a4a30';
    g.lineWidth = 16;
    g.beginPath();
    g.arc(x, y, r, this.da(this.min), this.da(this.max));
    g.stroke();
    g.strokeStyle = '#0b0907';
    g.lineWidth = 14;
    g.stroke();
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(125,255,154,0.3)';
    g.beginPath();
    g.arc(x, y, r, this.da(tg.lo), this.da(tg.hi));
    g.stroke();
    g.strokeStyle = 'rgba(233,196,106,0.72)';
    g.beginPath();
    g.arc(x, y, r, this.da(tg.perfectLo), Math.max(this.da(tg.perfectHi), this.da(tg.perfectLo) + 0.03));
    g.stroke();
    g.strokeStyle = 'rgba(191,179,154,0.5)';
    g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k <= 10; k++) {
      const a = this.da(this.min + ((this.max - this.min) * k) / 10);
      g.moveTo(x + Math.cos(a) * (r + 9), y + Math.sin(a) * (r + 9));
      g.lineTo(
        x + Math.cos(a) * (r + (k % 5 === 0 ? 15 : 12)),
        y + Math.sin(a) * (r + (k % 5 === 0 ? 15 : 12)),
      );
    }
    g.stroke();
    text(g, `${this.min}`, x - r, y + 12, { size: 9, color: PAL.faint });
    text(g, `${this.max}`, x + r, y + 12, { size: 9, color: PAL.faint });
    if (this.p.words) {
      g.font = `italic 10.5px ${FONT}`;
      g.fillStyle = PAL.dim;
      g.textAlign = 'left';
      g.fillText(`← ${this.p.words[0]}`, x - r - 8, y + 50);
      g.textAlign = 'right';
      g.fillText(`${this.p.words[1]} →`, x + r + 8, y + 50);
    }
  }

  private da(v: number): number {
    return Math.PI + 0.12 + clamp((v - this.min) / (this.max - this.min), 0, 1.04) * (Math.PI - 0.24);
  }

  // ---- Drawing: every frame ----------------------------------------------------------------------------

  private draw(dt: number): void {
    const g = this.g;
    g.drawImage(this.back, 0, 0, W, H);
    for (let i = 0; i < this.slots.length; i++) this.drawSlot(i);
    this.drawButton();
    if (this.style === 'gears') this.drawGears(dt);
    else if (this.style === 'cells') this.drawCells();
    else if (this.style === 'rocket') this.drawRocketScene(dt);
    else this.drawDialNeedle();
    if (this.style === 'gears' || this.style === 'cells') this.drawTrackNeedle();
    this.drawBits();
  }

  private readingText(): string {
    return this.reading;
  }

  private bandColour(v: number): string {
    const tg = this.p.target;
    return v >= tg.perfectLo && v <= tg.perfectHi ? PAL.gold : v >= tg.lo && v <= tg.hi ? PAL.good : PAL.bad;
  }

  private drawSlot(i: number): void {
    const g = this.g;
    const s = this.slots[i]!;
    const live = this.phase === 'pick';
    const y = s.y;
    text(g, s.def.name, LX + LW / 2, y + 5, { size: 11, color: PAL.dim });
    const bx = LX + 4;
    const bw = LW - 8;
    const by = y + 13;
    rrect(g, bx, by, bw, 24, 5);
    g.fillStyle = '#16110c';
    g.fill();
    const focused = live && i === this.focus;
    g.strokeStyle = focused ? 'rgba(233,196,106,0.85)' : PAL.line;
    g.lineWidth = focused ? 1.5 : 1;
    g.stroke();
    // Arrows: dim at the ends.
    const px = this.c.pointer.x;
    const py = this.c.pointer.y;
    const over = live && py >= by && py <= by + 24;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    for (const dir of [-1, 1]) {
      const ax = dir < 0 ? bx + 12 : bx + bw - 12;
      const can = dir < 0 ? s.idx > 0 : s.idx < s.values.length - 1;
      const hover = over && Math.abs(px - ax) < 13;
      const hinted = this.host.guided && live && this.hint.slot === i && this.hint.dir === dir;
      if (hinted) {
        g.fillStyle = `rgba(255,224,138,${0.15 + 0.25 * pulse})`;
        rrect(g, ax - 11, by + 2, 22, 20, 4);
        g.fill();
      }
      g.fillStyle = !can ? '#3a3024' : hinted ? PAL.gold : hover ? PAL.gold : '#a08a5c';
      g.beginPath();
      g.moveTo(ax + dir * 5, by + 12);
      g.lineTo(ax - dir * 4, by + 6);
      g.lineTo(ax - dir * 4, by + 18);
      g.closePath();
      g.fill();
    }
    const sc = 1 + s.pop * 0.12;
    g.save();
    g.translate(LX + LW / 2, by + 12.5);
    g.scale(sc, sc);
    text(g, s.labels[s.idx]!, 0, 0, { size: 12.5, bold: true, color: PAL.ink });
    g.restore();
  }

  private drawButton(): void {
    const g = this.g;
    const live = this.phase === 'pick';
    const px = this.c.pointer.x;
    const py = this.c.pointer.y;
    const hover = live && px >= BTN.x && px <= BTN.x + BTN.w && py >= BTN.y && py <= BTN.y + BTN.h;
    rrect(g, BTN.x, BTN.y, BTN.w, BTN.h, 5);
    g.fillStyle = hover ? '#4a3a1e' : '#33281a';
    g.fill();
    g.strokeStyle = PAL.gold;
    g.lineWidth = 1.5;
    g.stroke();
    text(g, this.p.action ?? 'Test', BTN.x + BTN.w / 2, BTN.y + BTN.h / 2 - 0.5, {
      size: 13,
      bold: true,
      color: PAL.gold,
    });
    text(g, 'Enter', BTN.x + BTN.w / 2, BTN.y + BTN.h + 6.5, { size: 8.5, color: PAL.faint });
    if (this.host.guided && live && this.hint.slot < 0) {
      const tg = this.p.target;
      if (this.value >= tg.perfectLo && this.value <= tg.perfectHi) {
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
        g.strokeStyle = `rgba(255,224,138,${0.3 + 0.6 * pulse})`;
        g.lineWidth = 2;
        rrect(g, BTN.x - 3, BTN.y - 3, BTN.w + 6, BTN.h + 6, 7);
        g.stroke();
      }
    }
  }

  private drawTrackNeedle(): void {
    const g = this.g;
    const col = this.bandColour(this.value);
    text(g, this.readingText(), GX1, 14, { size: 12, bold: true, color: col, align: 'right' });
    const x = GX0 + clamp((this.needle - this.min) / (this.max - this.min), 0, 1.03) * (GX1 - GX0);
    const y = 24;
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
    if (this.host.guided && this.phase === 'pick') {
      const tg = this.p.target;
      const mx = this.gx((tg.perfectLo + tg.perfectHi) / 2);
      g.strokeStyle = `rgba(255,224,138,${0.35 + 0.3 * Math.sin(this.t * 5)})`;
      g.setLineDash([2, 2]);
      g.beginPath();
      g.moveTo(mx, y - 6);
      g.lineTo(mx, y + 16);
      g.stroke();
      g.setLineDash([]);
    }
  }

  private drawDialNeedle(): void {
    const g = this.g;
    const x = 270;
    const y = 132;
    const r = 70;
    const col = this.bandColour(this.value);
    let v = this.needle;
    if (this.phase === 'test' && this.outcome.side !== 0)
      v += Math.sin(this.testT * 40) * (this.max - this.min) * 0.01 * Math.max(0, 1 - this.testT);
    const a = this.da(v);
    if (this.host.guided && this.phase === 'pick') {
      const tg = this.p.target;
      const ma = this.da((tg.perfectLo + tg.perfectHi) / 2);
      g.strokeStyle = `rgba(255,224,138,${0.35 + 0.3 * Math.sin(this.t * 5)})`;
      g.setLineDash([2, 3]);
      g.beginPath();
      g.moveTo(x + Math.cos(ma) * 14, y + Math.sin(ma) * 14);
      g.lineTo(x + Math.cos(ma) * (r + 16), y + Math.sin(ma) * (r + 16));
      g.stroke();
      g.setLineDash([]);
    }
    g.lineCap = 'round';
    g.strokeStyle = '#120e0a';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3));
    g.stroke();
    g.strokeStyle = col;
    g.lineWidth = 2.5;
    g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = '#3a2f20';
    g.beginPath();
    g.arc(x, y, 7, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = PAL.gold;
    g.lineWidth = 1;
    g.stroke();
    text(g, this.readingText(), x, y + 26, { size: 17, bold: true, color: col });
    if (this.phase === 'test' && this.outcome.q > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.5 * Math.min(1, this.testT * 2) * (0.7 + 0.3 * Math.sin(this.t * 6));
      g.drawImage(this.warm, x - 60, y - 40, 120, 120);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  }

  private drawBits(): void {
    const g = this.g;
    for (const b of this.bits) {
      if (b.life <= 0) continue;
      g.globalAlpha = Math.min(1, (b.life / b.max) * 1.6);
      g.fillStyle = b.col;
      if (b.size < 3) g.fillRect(b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
      else {
        // Puffs are round, and swell as they fade.
        g.beginPath();
        g.arc(b.x, b.y, (b.size / 2) * (2 - b.life / b.max), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  // ---- Gears ----------------------------------------------------------------------------------------

  private drawGears(dt: number): void {
    const g = this.g;
    const m = this.module;
    const ra = (this.teethA * m) / 2;
    const rb = (this.teethB * m) / 2;
    // The pair sits in the middle of the picture, whatever their sizes.
    const ax = 270 - rb;
    const ay = 130;
    const bx = ax + ra + rb;
    const tg = this.p.target;
    const mid = (tg.perfectLo + tg.perfectHi) / 2;
    // The driven gear turns at the result (about one turn a second on target); the driver meshes with it.
    let speed = (this.value / mid) * Math.PI * 2 * 0.75;
    let shake = 0;
    if (this.phase === 'test') {
      const k = this.testT;
      if (this.outcome.side < 0) speed *= 0.35 + 0.65 * Math.max(0, Math.sin(k * 9)) ** 3;
      if (this.outcome.side > 0) {
        speed *= 1 + k * 0.6;
        shake = Math.min(1, k * 2) * 1.6;
        if (Math.random() < 0.7)
          this.spawn(
            ax + ra,
            ay + (Math.random() - 0.5) * 6,
            30 + Math.random() * 80,
            -40 - Math.random() * 90,
            0.5,
            1.8,
            Math.random() < 0.5 ? '#ffb347' : '#ffe08a',
            300,
          );
        if (k > 0.8 && Math.random() < 0.25)
          this.spawn(
            bx + (Math.random() - 0.5) * 10,
            ay - rb,
            (Math.random() - 0.5) * 20,
            -25,
            1.2,
            6,
            'rgba(120,110,100,0.5)',
            -10,
          );
      }
      if (this.outcome.side === 0 && Math.random() < 0.6)
        this.spawn(
          bx + (Math.random() - 0.5) * rb,
          ay + rb + 6,
          (Math.random() - 0.5) * 12,
          30 + Math.random() * 30,
          0.9,
          1.8,
          'rgba(250,246,236,0.9)',
          120,
        );
    }
    this.spinA += ((speed * this.teethB) / this.teethA) * dt;
    const angA = this.spinA;
    const wb = (Math.PI * 2) / this.teethB;
    const angB = Math.PI - 0.5 * wb - (angA * this.teethA) / this.teethB;
    const jx = shake ? (Math.random() - 0.5) * shake : 0;
    const jy = shake ? (Math.random() - 0.5) * shake : 0;
    if (this.phase === 'test' && this.outcome.q > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.35 * Math.min(1, this.testT * 2);
      g.drawImage(this.warm, bx - rb * 2.2, ay - rb * 2.2, rb * 4.4, rb * 4.4);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    // Axles on a beam.
    g.fillStyle = '#2b2219';
    g.fillRect(ax - 4, ay - 3, bx - ax + 8, 6);
    this.drawGear(ax + jx, ay + jy, ra, m, this.gearA!, angA, '#b8914a', '#5e4520', this.gearSlots[0]);
    this.drawGear(bx + jx, ay + jy, rb, m, this.gearB!, angB, '#9aa0a7', '#454a50', this.gearSlots[1]);
    // The legend, in the bottom corners: each gear's name (by its colour) and what it turns at.
    const lx = VX + 8;
    const rx = W - 10;
    g.fillStyle = '#b8914a';
    g.beginPath();
    g.arc(lx + 3.5, 199, 3.5, 0, Math.PI * 2);
    g.fill();
    text(g, this.shortNames[0], lx + 10, 199, { size: 9.5, color: PAL.dim, align: 'left' });
    text(g, this.legend[0], lx, 211, { size: 10.5, bold: true, color: PAL.ink, align: 'left' });
    g.fillStyle = '#9aa0a7';
    g.beginPath();
    g.arc(rx - this.nameW[1] - 7, 199, 3.5, 0, Math.PI * 2);
    g.fill();
    text(g, this.shortNames[1], rx, 199, { size: 9.5, color: PAL.dim, align: 'right' });
    text(g, this.legend[1], rx, 211, {
      size: 10.5,
      bold: true,
      color: this.bandColour(this.value),
      align: 'right',
    });
  }

  private drawGear(
    x: number,
    y: number,
    r: number,
    m: number,
    path: Path2D,
    ang: number,
    col: string,
    dark: string,
    slot: Slot | undefined,
  ): void {
    const g = this.g;
    const pop = slot ? 1 + slot.pop * 0.05 : 1;
    g.save();
    g.translate(x, y);
    g.scale(pop, pop);
    g.rotate(ang);
    g.fillStyle = col;
    g.fill(path);
    g.strokeStyle = dark;
    g.lineWidth = 1;
    g.stroke(path);
    if (r > 22) {
      // Cut away between the spokes.
      g.fillStyle = '#17120d';
      g.beginPath();
      g.arc(0, 0, r - m * 2.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = col;
      g.fillRect(-(r - m * 2), -2.6, (r - m * 2) * 2, 5.2);
      g.fillRect(-2.6, -(r - m * 2), 5.2, (r - m * 2) * 2);
      g.beginPath();
      g.arc(0, 0, Math.max(6, r * 0.18), 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = dark;
      g.beginPath();
      g.arc(0, 0, r - m * 2.2, 0, Math.PI * 2);
      g.stroke();
    } else {
      g.strokeStyle = dark;
      g.beginPath();
      g.arc(0, 0, Math.max(3, r * 0.55), 0, Math.PI * 2);
      g.stroke();
    }
    // A bright mark near the rim, to see it turn; the axle.
    g.fillStyle = '#fff3c8';
    g.beginPath();
    g.arc(Math.max(4, r - m * 2.6), 0, Math.min(2.2, r * 0.15), 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1a140e';
    g.beginPath();
    g.arc(0, 0, 2.6, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // ---- Cells and the lamp ------------------------------------------------------------------------------

  private drawCells(): void {
    const g = this.g;
    const series = Math.max(1, Math.round(this.valueOf('series', 0)));
    const rows = Math.max(1, Math.round(this.valueOf('parallel', -1, 1)));
    const cellSlot = this.slotOf('cell');
    const cellCol = cellSlot?.colours[cellSlot.idx] ?? '#c9a24a';
    const tg = this.p.target;
    const mid = (tg.perfectLo + tg.perfectHi) / 2;
    // A loop: the lamp at the top, the battery on the bottom wire, cells side by side stacked up.
    const cx = 268;
    const cw = Math.min(16, 120 / series - 3);
    const ch = 9;
    const gap = 3;
    const rowH = 14;
    const gw = series * (cw + gap) - gap;
    const x0 = cx - gw / 2;
    const by = 170;
    const left = x0 - 7;
    const right = x0 + gw + 7;
    const wl = 192;
    const wr = 344;
    const wy = 118;
    const lx = cx;
    const ly = 90;
    const on = this.phase === 'test' ? Math.min(1, this.testT * 4) : 1;
    let bright = clamp(this.value / mid, 0, 2.2) * on;
    let popped = false;
    if (this.phase === 'test') {
      if (this.outcome.side > 0 && this.testT > 0.55) {
        popped = true;
        bright = 0;
        if (!this.struck) {
          this.struck = true;
          for (let i = 0; i < 16; i++)
            this.spawn(
              lx,
              ly,
              (Math.random() - 0.5) * 160,
              -40 - Math.random() * 120,
              0.8,
              2,
              i % 3 ? '#dfe7ee' : '#ffe08a',
              360,
            );
        }
      } else if (this.outcome.side > 0) bright *= 1.3 + Math.random() * 0.4;
      if (this.outcome.side < 0) bright *= 0.75 + 0.25 * Math.sin(this.testT * 23) * Math.sin(this.testT * 7);
    }
    g.strokeStyle = '#7a5f3a';
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(lx - 4, wy - 4);
    g.lineTo(lx - 4, wy);
    g.lineTo(wl, wy);
    g.lineTo(wl, by);
    g.lineTo(left, by);
    g.moveTo(lx + 4, wy - 4);
    g.lineTo(lx + 4, wy);
    g.lineTo(wr, wy);
    g.lineTo(wr, by);
    g.lineTo(right, by);
    g.stroke();
    // Current: dots running round the loop, faster with more push.
    const flow = popped ? 0 : clamp(this.value / mid, 0, 2.5);
    if (flow > 0.02) {
      g.fillStyle = 'rgba(255,224,138,0.85)';
      const a = wr - right;
      const b = by - wy;
      const c = wr - (lx + 4);
      const d = lx - 4 - wl;
      const len = a + b + c + d + b + (left - wl);
      for (let k = 0; k < 12; k++) {
        let s = (k * (len / 12) + this.t * 36 * flow) % len;
        let x: number;
        let y: number;
        if (s < a) [x, y] = [right + s, by];
        else if ((s -= a) < b) [x, y] = [wr, by - s];
        else if ((s -= b) < c) [x, y] = [wr - s, wy];
        else if ((s -= c) < d) [x, y] = [lx - 4 - s, wy];
        else if ((s -= d) < b) [x, y] = [wl, wy + s];
        else [x, y] = [wl + (s - b), by];
        g.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
      }
    }
    // The battery: rows of cells in a chain; side by side, joined at both ends.
    const top = by - ((rows - 1) * rowH) / 2;
    g.strokeStyle = '#7a5f3a';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(left, top);
    g.lineTo(left, top + (rows - 1) * rowH);
    g.moveTo(right, top);
    g.lineTo(right, top + (rows - 1) * rowH);
    for (let r = 0; r < rows; r++) {
      const y = top + r * rowH;
      g.moveTo(left, y);
      g.lineTo(x0, y);
      g.moveTo(x0 + gw, y);
      g.lineTo(right, y);
    }
    g.stroke();
    for (let r = 0; r < rows; r++) {
      const y = top + r * rowH;
      for (let c = 0; c < series; c++) {
        const x = x0 + c * (cw + gap);
        rrect(g, x, y - ch / 2, cw, ch, 2.5);
        g.fillStyle = cellCol;
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.3)';
        g.fillRect(x + 1.5, y - ch / 2 + 1.2, cw - 4, 1.6);
        g.fillStyle = '#2a2622';
        g.fillRect(x + cw - 3, y - ch / 2, 3, ch);
        g.fillStyle = '#d8d2c6';
        g.fillRect(x + cw, y - 1.5, gap, 3);
      }
    }
    text(g, this.cellsLabel, cx, top + (rows - 1) * rowH + 17, { size: 9.5, color: PAL.faint });
    // The lamp: it glows as bright as the push it gets.
    if (bright > 0.02) {
      g.globalCompositeOperation = 'lighter';
      const s = 24 + bright * 38;
      g.globalAlpha = Math.min(1, 0.22 + bright * 0.45);
      g.drawImage(this.warm, lx - s, ly - s, s * 2, s * 2);
      if (bright > 1.2) {
        g.globalAlpha = Math.min(1, (bright - 1.2) * 0.8);
        g.drawImage(this.white, lx - s * 0.6, ly - s * 0.6, s * 1.2, s * 1.2);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    g.fillStyle = '#6f6a62';
    g.fillRect(lx - 7, ly + 12, 14, 11);
    g.strokeStyle = '#4a463f';
    g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      g.moveTo(lx - 7, ly + 14 + k * 3);
      g.lineTo(lx + 7, ly + 15 + k * 3);
    }
    g.stroke();
    if (!popped) {
      const b1 = Math.min(1, bright);
      g.fillStyle = `rgba(255,${Math.round(200 + 55 * b1)},${Math.round(150 + 100 * Math.min(1, bright / 2))},${0.12 + Math.min(0.5, bright * 0.3)})`;
      g.beginPath();
      g.arc(lx, ly, 14, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(230,240,255,0.55)';
      g.lineWidth = 1.2;
      g.stroke();
      g.strokeStyle = bright > 0.15 ? `rgba(255,${Math.round(150 + 100 * b1)},80,1)` : '#5a4a3a';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(lx - 4, ly + 12);
      g.lineTo(lx - 4, ly);
      for (let k = 0; k < 4; k++) g.lineTo(lx - 3 + k * 2, ly + (k % 2 ? -3 : 0));
      g.lineTo(lx + 4, ly);
      g.lineTo(lx + 4, ly + 12);
      g.stroke();
    } else {
      // Popped: a jagged stump of glass, and a wisp of smoke.
      g.strokeStyle = 'rgba(230,240,255,0.5)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(lx - 9, ly + 12);
      g.lineTo(lx - 11, ly + 4);
      g.lineTo(lx - 6, ly + 7);
      g.lineTo(lx - 3, ly - 1);
      g.lineTo(lx + 2, ly + 6);
      g.lineTo(lx + 7, ly + 2);
      g.lineTo(lx + 9, ly + 12);
      g.stroke();
      const a = this.testT - 0.55;
      g.fillStyle = 'rgba(110,104,96,0.4)';
      g.beginPath();
      g.arc(lx + Math.sin(a * 3) * 4, ly - 10 - a * 30, 6 + a * 14, 0, Math.PI * 2);
      g.fill();
    }
  }

  // ---- The rocket -------------------------------------------------------------------------------------

  private stageH(fuel: number): number {
    return 9 + 26 * (fuel / this.maxFuel);
  }

  private drawRocketScene(dt: number): void {
    const g = this.g;
    const stages = Math.max(1, Math.round(this.valueOf('stages', 0)));
    const fuel = this.valueOf('fuel', 1);
    const payload = this.valueOf('payload', 2);
    const bigP = this.maxPayload;
    const hs = this.stageH(fuel);
    const ph = 9 + 14 * (payload / bigP);
    const x = 250;
    let baseY = 199;
    let scale = 1;
    let rot = 0;
    let flame = 0;
    if (this.phase === 'test') {
      const t = this.testT;
      const climb = ease(t / 1.25);
      const peak = this.sy(this.value);
      const side = this.outcome.side;
      // Fly up to the height the speed gives, shrinking into the distance.
      const topY = side > 0 ? -40 : peak + 6;
      baseY = 199 + (topY - 199) * (side > 0 ? clamp(t / 1.25, 0, 1) ** 1.4 : climb);
      scale = 1 - 0.62 * climb;
      flame = t < 1.25 ? 1 : 0;
      // Stages drop off on the way up.
      const want = Math.min(stages - 1, Math.floor(climb * stages * 0.98));
      while (this.dropped < want) {
        // Three animation slots are available even if an authored setup later offers more stages.
        const d = this.drops[this.dropped];
        if (!d) break;
        d.on = true;
        d.k = this.dropped;
        d.x = x;
        d.y = baseY;
        d.vy = 10;
        d.rot = 0;
        d.h = hs * scale;
        d.w = (16 - this.dropped * 2) * scale;
        this.dropped++;
      }
      if (t > 1.25) {
        const a = t - 1.25;
        if (side === 0) rot = Math.min(Math.PI / 2, a * 4);
        else if (side < 0) {
          rot = Math.min(Math.PI * 0.9, a * 3.2);
          baseY += a * a * 160;
        }
      }
      if (side === 0 && t > 1.25) {
        // In orbit: it coasts along the band.
        const a = t - 1.25;
        g.setLineDash([2, 3]);
        g.strokeStyle = 'rgba(255,224,138,0.6)';
        g.beginPath();
        g.moveTo(x, baseY - 10 * scale);
        g.lineTo(x + a * 70, baseY - 10 * scale);
        g.stroke();
        g.setLineDash([]);
      }
      if (flame && Math.random() < 0.8)
        this.spawn(
          x + (Math.random() - 0.5) * 4,
          baseY + 4,
          (Math.random() - 0.5) * 20,
          30 + Math.random() * 30,
          0.8,
          3 + Math.random() * 3,
          'rgba(200,190,180,0.35)',
          -20,
        );
    }
    for (const d of this.drops) {
      if (!d.on) continue;
      d.vy += 140 * dt;
      d.y += d.vy * dt;
      d.x -= 12 * dt;
      d.rot += 2.5 * dt;
      g.save();
      g.translate(d.x, d.y);
      g.rotate(d.rot);
      g.fillStyle = '#cfc9bd';
      g.fillRect(-d.w / 2, -d.h, d.w, d.h);
      g.fillStyle = '#b5523a';
      g.fillRect(-d.w / 2, -d.h, d.w, 2);
      g.restore();
    }
    let ox = 0;
    if (this.phase === 'test' && this.outcome.side === 0 && this.testT > 1.25) ox = (this.testT - 1.25) * 70;
    g.save();
    g.translate(x + ox, baseY);
    g.rotate(rot);
    g.scale(scale, scale);
    this.drawRocket(stages - this.dropped, hs, ph, flame);
    g.restore();
    // The needle on the scale: where this rocket's speed lands.
    const col = this.bandColour(this.value);
    const ny = this.sy(this.needle);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(346, ny);
    g.lineTo(339, ny - 4.5);
    g.lineTo(339, ny + 4.5);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(244,234,214,0.25)';
    g.setLineDash([2, 3]);
    g.beginPath();
    g.moveTo(VX + 4, ny);
    g.lineTo(338, ny);
    g.stroke();
    g.setLineDash([]);
    text(g, this.p.target.label, VX + 8, 17, { size: 11, color: PAL.dim, align: 'left' });
    text(g, this.readingText(), 334, 17, { size: 12, bold: true, color: col, align: 'right' });
    if (this.host.guided && this.phase === 'pick') {
      const tg = this.p.target;
      const my = this.sy((tg.perfectLo + tg.perfectHi) / 2);
      g.fillStyle = `rgba(255,224,138,${0.4 + 0.4 * Math.sin(this.t * 5)})`;
      g.beginPath();
      g.moveTo(364, my);
      g.lineTo(371, my - 4);
      g.lineTo(371, my + 4);
      g.closePath();
      g.fill();
    }
  }

  /** The stack: `n` stages (bottom up), then the payload under its fairing; drawn at the origin, upward. */
  private drawRocket(n: number, hs: number, ph: number, flame: number): void {
    const g = this.g;
    let y = 0;
    const first = this.dropped;
    for (let k = 0; k < n; k++) {
      const w = 16 - (first + k) * 2;
      if (k === 0 && flame) {
        const f = 10 + Math.random() * 6;
        g.fillStyle = 'rgba(255,170,60,0.9)';
        g.beginPath();
        g.moveTo(-w * 0.32, y);
        g.lineTo(0, y + f);
        g.lineTo(w * 0.32, y);
        g.fill();
        g.fillStyle = 'rgba(255,245,200,0.95)';
        g.beginPath();
        g.moveTo(-w * 0.18, y);
        g.lineTo(0, y + f * 0.55);
        g.lineTo(w * 0.18, y);
        g.fill();
      }
      g.fillStyle = '#3a3a40';
      g.beginPath();
      g.moveTo(-w * 0.32, y);
      g.lineTo(w * 0.32, y);
      g.lineTo(w * 0.2, y - 4);
      g.lineTo(-w * 0.2, y - 4);
      g.fill();
      y -= 4;
      g.fillStyle = '#e8e3d8';
      g.fillRect(-w / 2, y - hs, w, hs);
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.fillRect(w / 2 - 4, y - hs, 4, hs);
      g.fillStyle = '#b5523a';
      g.fillRect(-w / 2, y - hs, w, 2.2);
      if (first + k === 0) {
        g.fillStyle = '#8a3c2a';
        g.beginPath();
        g.moveTo(-w / 2, y);
        g.lineTo(-w / 2 - 5, y);
        g.lineTo(-w / 2, y - 9);
        g.moveTo(w / 2, y);
        g.lineTo(w / 2 + 5, y);
        g.lineTo(w / 2, y - 9);
        g.fill();
      }
      y -= hs;
    }
    const w = 16 - (first + n - 1) * 2 + 2;
    g.fillStyle = '#f2efe8';
    g.beginPath();
    g.moveTo(-w / 2, y);
    g.lineTo(-w / 2, y - ph * 0.45);
    g.quadraticCurveTo(-w / 2, y - ph, 0, y - ph - 4);
    g.quadraticCurveTo(w / 2, y - ph, w / 2, y - ph * 0.45);
    g.lineTo(w / 2, y);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.14)';
    g.fillRect(w / 2 - 3, y - ph * 0.45, 3, ph * 0.45);
  }
}

/** Which demo the playground shows (?variant=…). */
function variant<T extends object>(all: T, fallback: keyof T): T[keyof T] {
  const v = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('variant');
  return v && Object.hasOwn(all, v) ? all[v as keyof T] : all[fallback];
}

export const sizes: MinigameDef<SizesParams> = {
  kind: 'sizes',
  name: 'Pick the sizes',
  get demo() {
    return variant(SIZES_DEMOS, 'gears');
  },
  create: (host, p) => new SizesGame(host, p),
};
