export type { OrderLook } from './order-data.ts';
export type { OrderShape } from './order-data.ts';
export type { OrderPart } from './order-data.ts';
export type { OrderParams } from './order-data.ts';
export { ORDER_DEMOS } from './order-data.ts';
import { ORDER_DEMOS } from './order-data.ts';
import type { OrderLook, OrderShape, OrderPart, OrderParams } from './order-data.ts';
/**
 * Build in order (TECH_LINEAGE §4): take the parts from the tray and put them in, one at a time, in an
 * order that works — footings before the frame, the frame before the stones, the keystone last. A part
 * that goes in too early shows why it can't (the stones slide off, the capsule burns, the train jams)
 * and goes back to the tray: one slip still makes a good build, a second brings it all down.
 *
 * Click a part or drag it onto the build; keys 1–9 take the part in that place on the tray.
 */
import type { Minigame, MinigameDef, MinigameHost, Quality } from './types.ts';
import { canvasIn, finisher, rrect, text, FONT, PAL } from './kit.ts';

const W = 380;
const H = 220;
/** The tray, and the build area. */
const TX = 8;
const TW = 114;
const BX = 130;
const BW = 244;
const BY = 6;
const BB = 190;
/** The arch: its centre on the springing line, inner and outer radius, the river. */
const ACX = 252;
const ASY = 140;
const ARI = 58;
const ARO = 80;
const RIVER = 166;
/** The stack's stand: build boxes map onto this. */
const SX0 = 142;
const SW = 220;
const SY1 = 180;
const SH = 166;
/** Seconds: a part's flight to its place, a slip, the end. */
const FLY_T = 0.3;
const SLIP_T = 0.9;
const END_T = 1.6;

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const ease = (k: number): number => 1 - (1 - clamp(k, 0, 1)) ** 3;

/** Which of the arch's nine stones each arch part lays. */
const STONES: Partial<Record<OrderShape, number[]>> = {
  lower: [0, 1, 7, 8],
  upper: [2, 3, 5, 6],
  keystone: [4],
};

/** A spark, splash, ember or chip: one shared pool, so nothing is allocated per frame. */
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

/** A piece falling (or burning, or jamming): which part, which bit of it, and how it tumbles. */
interface Piece {
  part: number;
  k: number;
  spin: number;
  drift: number;
}

class OrderGame implements Minigame {
  private readonly host: MinigameHost;
  private readonly p: OrderParams;

  private readonly c: ReturnType<typeof canvasIn>;
  private readonly g: CanvasRenderingContext2D;
  private readonly end: ReturnType<typeof finisher>;
  private readonly parts: OrderPart[];
  private readonly needs: number[][];
  private readonly tray: number[];
  private readonly placed: boolean[];
  private readonly back: HTMLCanvasElement;
  private readonly bits: Bit[] = [];
  private bitI = 0;
  private readonly heldKeys = new Set<string>();
  private readonly cardH: number;
  private placedCount = 0;
  private mistakes = 0;
  private t = 0;
  private phase: 'build' | 'won' | 'lost' = 'build';
  private endT = 0;
  private fly: { i: number; t: number; fx: number; fy: number; ok: boolean } | null = null;
  private slip: { i: number; t: number; look: OrderLook; why: string } | null = null;
  private falling: Piece[] = [];
  private fallLook: OrderLook = 'fall';
  private note: { text: string; t: number } | null = null;
  private drag: { slot: number; x: number; y: number; moved: boolean } | null = null;
  private focus = -1;
  private lastWhy = '';
  private struck = false;
  /** The order parts are drawn in, back to front. */
  private readonly z: number[];

  constructor(host: MinigameHost, p: OrderParams) {
    this.host = host;
    this.p = p;

    if (p.parts.length === 0) throw new Error('Assembly needs at least one part');
    // tray/z are permutations of part indices; needs/placed have one entry per part.
    this.parts = p.parts;
    const ids = this.parts.map((x) => x.id);
    const seq = p.order ?? (this.parts.some((x) => x.needs) ? null : ids);
    this.needs = this.parts.map((part) => {
      const want = part.needs ?? (seq && seq.indexOf(part.id) > 0 ? [seq[seq.indexOf(part.id) - 1]!] : []);
      return want.map((id) => ids.indexOf(id)).filter((k) => k >= 0);
    });
    this.placed = this.parts.map(() => false);
    // The tray: shuffled, but never already in a working order.
    this.tray = this.parts.map((_, i) => i);
    for (let tries = 0; tries < 8; tries++) {
      for (let i = this.tray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.tray[i]!, this.tray[j]!] = [this.tray[j]!, this.tray[i]!];
      }
      if (!this.works(this.tray)) break;
    }
    this.cardH = Math.min(26, (BB - 24) / this.parts.length - 4);
    this.z = this.zOrder();
    for (let i = 0; i < 140; i++)
      this.bits.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, col: '#fff', grav: 0 });
    this.end = finisher(host);
    this.c = canvasIn(host, W, H, { down: (q) => this.down(q.x, q.y), up: (q) => this.up(q.x, q.y) });
    this.g = this.c.g;
    this.back = this.paintBack();
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
  }

  /** Whether putting the parts in this order would work. */
  private works(seq: number[]): boolean {
    const done = this.parts.map(() => false);
    for (const i of seq) {
      if (this.needs[i]!.some((k) => !done[k])) return false;
      done[i] = true;
    }
    return true;
  }

  private ready(i: number): boolean {
    return this.needs[i]!.every((k) => this.placed[k]);
  }

  /** The part to put in next, the first time: the first one in the parts' list that can go in. */
  private nextPart(): number {
    for (let i = 0; i < this.parts.length; i++) if (!this.placed[i] && this.ready(i)) return i;
    return -1;
  }

  // ---- Input ---------------------------------------------------------------------------------------

  private readonly onKey = (e: KeyboardEvent): void => {
    const k = e.key;
    const n = k >= '1' && k <= '9' ? Number(k) - 1 : -1;
    const ours =
      (n >= 0 && n < this.tray.length) || k === 'ArrowUp' || k === 'ArrowDown' || k === 'Enter' || k === ' ';
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
    if (e.repeat || !this.live()) return;
    if (n >= 0) this.take(n);
    else if (k === 'ArrowUp' || k === 'ArrowDown') {
      // Move the highlight to the next card still on the tray.
      const d = k === 'ArrowUp' ? -1 : 1;
      const n = this.tray.length;
      let f = this.focus < 0 ? (d > 0 ? -1 : 0) : this.focus;
      for (let s = 0; s < n; s++) {
        f = (f + d + n) % n;
        if (!this.placed[this.tray[f]!]) break;
      }
      this.focus = f;
    } else if (this.focus >= 0) this.take(this.focus);
  };

  private live(): boolean {
    return this.phase === 'build' && !this.fly && !this.slip && !this.end.finished();
  }

  private cardY(slot: number): number {
    return 22 + slot * (this.cardH + 4);
  }

  private cardAt(x: number, y: number): number {
    if (x < TX || x > TX + TW) return -1;
    for (let s = 0; s < this.tray.length; s++) {
      const cy = this.cardY(s);
      if (y >= cy && y <= cy + this.cardH && !this.placed[this.tray[s]!]) return s;
    }
    return -1;
  }

  private down(x: number, y: number): void {
    if (!this.live()) return;
    const s = this.cardAt(x, y);
    if (s >= 0) this.drag = { slot: s, x, y, moved: false };
  }

  private up(x: number, y: number): void {
    const d = this.drag;
    this.drag = null;
    if (!d || !this.live()) return;
    // A click puts it in; a drag puts it in where it's dropped on the build (anywhere there will do).
    if (!d.moved || (x > BX && y < BB + 10))
      this.take(d.slot, d.moved ? x : undefined, d.moved ? y : undefined);
  }

  /** Puts the part from tray place `slot` in; it flies from the card (or from where it was dropped). */
  private take(slot: number, fromX?: number, fromY?: number): void {
    const i = this.tray[slot];
    if (i === undefined || this.placed[i] || !this.live()) return;
    this.focus = slot;
    this.fly = {
      i,
      t: 0,
      fx: fromX ?? TX + TW / 2,
      fy: fromY ?? this.cardY(slot) + this.cardH / 2,
      ok: this.ready(i),
    };
    this.note = null;
  }

  /** The line on why part `i` can't go in yet, and how that shows. */
  private whyEarly(i: number): { why: string; look: OrderLook } {
    const part = this.parts[i]!;
    const fallback: OrderLook = this.p.style === 'generic' ? 'jam' : 'fall';
    const miss = this.needs[i]!.find((k) => !this.placed[k]);
    if (part.early) return { why: part.early, look: part.look ?? fallback };
    if (miss !== undefined) {
      const m = this.parts[miss]!;
      if (m.missing) return { why: m.missing, look: m.look ?? part.look ?? fallback };
      return {
        why: `The ${part.name.toLowerCase()} can’t go in before the ${m.name.toLowerCase()}.`,
        look: part.look ?? fallback,
      };
    }
    return { why: `The ${part.name.toLowerCase()} can’t go in yet.`, look: part.look ?? fallback };
  }

  // ---- Frame -------------------------------------------------------------------------------------

  update(dt: number): void {
    this.t += dt;
    const ptr = this.c.pointer;
    if (this.drag && !this.drag.moved && Math.hypot(ptr.x - this.drag.x, ptr.y - this.drag.y) > 5)
      this.drag.moved = true;
    if (this.fly) {
      this.fly.t += dt;
      if (this.fly.t >= FLY_T) {
        const i = this.fly.i;
        const ok = this.fly.ok;
        this.fly = null;
        if (ok) this.land(i);
        else {
          const w = this.whyEarly(i);
          this.slip = { i, t: 0, look: w.look, why: w.why };
          this.mistakes++;
          this.note = { text: w.why, t: 0 };
          this.lastWhy = w.why;
          this.startFall(i, w.look);
        }
      }
    }
    if (this.slip) {
      this.slip.t += dt;
      if (this.slip.t >= SLIP_T) {
        this.slip = null;
        this.falling.length = 0;
        if (this.mistakes >= 2) {
          // The second slip brings the whole build down.
          this.phase = 'lost';
          this.endT = 0;
          for (let i = 0; i < this.parts.length; i++)
            if (this.placed[i])
              this.startFall(
                i,
                this.fallLook === 'burn' ? 'burn' : this.p.style === 'generic' ? 'jam' : 'fall',
                true,
              );
        }
      }
    }
    if (this.note) this.note.t += dt;
    if (this.phase !== 'build') {
      this.endT += dt;
      if (this.endT >= END_T) {
        if (this.phase === 'won')
          this.end.finish(
            (this.mistakes === 0 ? 2 : 1) as Quality,
            this.mistakes === 0 ? this.p.whyPerfect : this.p.whyGood,
          );
        else this.end.finish(0, this.lastWhy);
      }
    }
    for (const b of this.bits) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.vy += b.grav * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    this.draw();
  }

  private land(i: number): void {
    this.placed[i] = true;
    this.placedCount++;
    this.order.push(i);
    // It clicks into place: stone chips for an arch, a glint for anything else.
    const [ax, ay] = this.anchor(i);
    const arch = this.p.style === 'arch';
    for (let k = 0; k < 8; k++)
      this.spawn(
        ax + (Math.random() - 0.5) * 30,
        ay + (arch ? 6 : 0),
        (Math.random() - 0.5) * 50,
        arch ? -20 - Math.random() * 30 : -10 - Math.random() * 20,
        0.5,
        arch ? 2 : 1.6,
        arch ? '#9a9284' : '#ffe08a',
        arch ? 260 : -10,
      );
    if (this.placedCount === this.parts.length) {
      this.phase = 'won';
      this.endT = 0;
    }
  }

  /** Sets part `i` falling (or burning, or jamming), piece by piece. */
  private startFall(i: number, look: OrderLook, keep = false): void {
    if (!keep) this.falling.length = 0;
    this.fallLook = look;
    const n = this.pieceCount(i);
    for (let k = 0; k < n; k++)
      this.falling.push({ part: i, k, spin: (Math.random() - 0.5) * 3, drift: (Math.random() - 0.5) * 40 });
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
    // The bit pool is populated before use and bitI is always modulo its length.
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

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKey, true);
    this.c.dispose();
  }

  // ---- Where parts go ------------------------------------------------------------------------------

  /** A stack part's box in canvas px: x, y (top), w, h. */
  private box(i: number): [number, number, number, number] {
    const b = this.parts[i]!.box ?? [0.5, (i / this.parts.length) * 0.9, 0.5, 0.9 / this.parts.length];
    const w = b[2] * SW;
    const h = b[3] * SH;
    return [SX0 + b[0] * SW - w / 2, SY1 - b[1] * SH - h, w, h];
  }

  /** Generic slots: where the n-th part in goes. */
  private slotBox(n: number): [number, number, number, number] {
    const rows = this.parts.length;
    const h = Math.min(24, (BB - 40) / rows - 4);
    return [BX + 34, 30 + n * (h + 4), BW - 52, h];
  }

  /** Where a part sits (its middle), for its flight in and its glint. */
  private anchor(i: number): [number, number] {
    const shape = this.parts[i]!.shape ?? 'block';
    if (this.p.style === 'arch') {
      const st = STONES[shape];
      if (st) {
        let x = 0;
        let y = 0;
        for (const s of st) {
          const a = Math.PI + ((s + 0.5) * Math.PI) / 9;
          x += ACX + Math.cos(a) * (ARI + ARO) * 0.5;
          y += ASY + Math.sin(a) * (ARI + ARO) * 0.5;
        }
        return [x / st.length, y / st.length];
      }
      if (shape === 'abutments') return [ACX, ASY + 12];
      if (shape === 'centring') return [ACX, ASY - 20];
      return [ACX, ASY - ARO + 8];
    }
    if (this.p.style === 'stack') {
      const [x, y, w, h] = this.box(i);
      return [x + w / 2, y + h / 2];
    }
    const n = this.placed[i] ? this.orderOf(i) : this.placedCount;
    const [x, y, w, h] = this.slotBox(n);
    return [x + w / 2, y + h / 2];
  }

  /** The parts in the order they went in (plain slots fill in this order). */
  private readonly order: number[] = [];

  /** For plain slots: which slot a placed part sits in. */
  private orderOf(i: number): number {
    return this.order.indexOf(i);
  }

  /** How many pieces a part breaks into when it falls. */
  private pieceCount(i: number): number {
    const shape = this.parts[i]!.shape ?? 'block';
    if (this.p.style === 'arch') return STONES[shape]?.length ?? (shape === 'abutments' ? 2 : 1);
    return 1;
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
    // The tray.
    rrect(g, TX - 3, 4, TW + 6, 212, 6);
    g.fillStyle = 'rgba(33,27,20,0.92)';
    g.fill();
    g.strokeStyle = PAL.line;
    g.lineWidth = 1;
    g.stroke();
    text(g, 'PARTS', TX + TW / 2, 13, { size: 9.5, color: PAL.dim });
    // The build.
    g.save();
    rrect(g, BX, BY, BW, BB - BY, 6);
    g.clip();
    if (this.p.style === 'arch') this.paintRiver(g);
    else if (this.p.style === 'stack') this.paintBay(g);
    else this.paintSlots(g);
    g.restore();
    rrect(g, BX, BY, BW, BB - BY, 6);
    g.strokeStyle = PAL.line;
    g.stroke();
    g.font = `italic 10.5px ${FONT}`;
    g.fillStyle = PAL.dim;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(this.p.what, BX + 8, BY + 10);
    return cv;
  }

  /** The arch's world: an evening sky, two grassy banks and the river between. */
  private paintRiver(g: CanvasRenderingContext2D): void {
    const sky = g.createLinearGradient(0, BY, 0, BB);
    sky.addColorStop(0, '#1b2333');
    sky.addColorStop(1, '#3b4656');
    g.fillStyle = sky;
    g.fillRect(BX, BY, BW, BB - BY);
    g.fillStyle = '#24476a';
    g.fillRect(BX, RIVER, BW, BB - RIVER);
    g.fillStyle = 'rgba(160,200,230,0.25)';
    for (let k = 0; k < 10; k++) g.fillRect(BX + 14 + ((k * 53) % 220), RIVER + 5 + ((k * 7) % 16), 14, 1.2);
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? BX : ACX + ARO + 6;
      const x1 = side < 0 ? ACX - ARO - 6 : BX + BW;
      g.fillStyle = '#3b2f22';
      g.beginPath();
      g.moveTo(x0, 160);
      g.lineTo(x1, 160);
      g.lineTo(x1 + side * -8, BB);
      g.lineTo(x0, BB);
      g.closePath();
      g.fill();
      g.fillStyle = '#4c6b32';
      g.fillRect(Math.min(x0, x1), 157, Math.abs(x1 - x0), 4);
    }
    // The arch to come, as a faint outline.
    g.setLineDash([2, 3]);
    g.strokeStyle = 'rgba(233,196,106,0.22)';
    g.lineWidth = 1;
    for (let s = 0; s < 9; s++) {
      this.stonePath(g, s, 0);
      g.stroke();
    }
    g.setLineDash([]);
  }

  /** The stack's world: a dark assembly bay with a stand. */
  private paintBay(g: CanvasRenderingContext2D): void {
    const bay = g.createLinearGradient(0, BY, 0, BB);
    bay.addColorStop(0, '#11141a');
    bay.addColorStop(1, '#1f242c');
    g.fillStyle = bay;
    g.fillRect(BX, BY, BW, BB - BY);
    g.strokeStyle = 'rgba(140,160,190,0.08)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = BX + 12; x < BX + BW; x += 24) {
      g.moveTo(x, BY);
      g.lineTo(x, SY1);
    }
    g.stroke();
    g.fillStyle = '#2c313a';
    g.fillRect(BX, SY1 + 2, BW, BB - SY1);
    g.fillStyle = '#4a515c';
    g.fillRect(SX0 + SW / 2 - 70, SY1, 140, 4);
    g.fillStyle = '#3a404a';
    g.fillRect(SX0 + SW / 2 - 60, SY1 + 4, 8, BB - SY1);
    g.fillRect(SX0 + SW / 2 + 52, SY1 + 4, 8, BB - SY1);
  }

  /** Plain numbered slots. */
  private paintSlots(g: CanvasRenderingContext2D): void {
    g.fillStyle = '#16120d';
    g.fillRect(BX, BY, BW, BB - BY);
    for (let n = 0; n < this.parts.length; n++) {
      const [x, y, w, h] = this.slotBox(n);
      rrect(g, x, y, w, h, 4);
      g.setLineDash([3, 3]);
      g.strokeStyle = 'rgba(191,179,154,0.3)';
      g.stroke();
      g.setLineDash([]);
      text(g, `${n + 1}`, x - 13, y + h / 2, { size: 11, color: PAL.faint });
    }
  }

  // ---- Drawing: every frame ----------------------------------------------------------------------------

  private draw(): void {
    const g = this.g;
    g.drawImage(this.back, 0, 0, W, H);
    g.save();
    rrect(g, BX, BY, BW, BB - BY, 6);
    g.clip();
    if (this.host.guided && this.phase === 'build' && !this.fly && !this.slip) this.drawGhost();
    // What's in: back to front, as listed (the centring behind the stones).
    if (this.p.style === 'stack') this.drawCrane();
    for (const i of this.z) {
      if (!this.placed[i] || this.isFalling(i)) continue;
      if (this.phase === 'won' && this.parts[i]!.shape === 'centring') {
        // Built: the centring is struck — lowered away — and the arch stands on its own.
        const k = ease(this.endT / 0.55);
        g.save();
        g.globalAlpha = 1 - k;
        g.translate(0, k * 26);
        this.drawPart(i, -1);
        g.restore();
        continue;
      }
      this.drawPart(i, -1);
      if (this.slip?.look === 'burn') this.scorch(i, -1, this.slip.t);
    }
    if (this.phase === 'won') this.drawWin();
    for (const f of this.falling) this.drawFallingPiece(f);
    if (this.fly) this.drawFlying();
    g.restore();
    this.drawBits();
    this.drawTray();
    this.drawPips();
    this.drawNote();
  }

  /** A stack that doesn't rest on the stand yet hangs from the crane's hook. */
  private drawCrane(): void {
    let rests = false;
    let top = Infinity;
    let cx = SX0 + SW / 2;
    let any = false;
    for (let i = 0; i < this.parts.length; i++) {
      if (!this.placed[i] || this.isFalling(i) || this.parts[i]!.shape === 'fairing') continue;
      const b = this.parts[i]!.box ?? [0.5, 0, 0, 0];
      any = true;
      if (b[1] <= 0.04) rests = true;
      const [x, y, w] = this.box(i);
      if (y < top) {
        top = y;
        cx = x + w / 2;
      }
    }
    if (!any || rests) return;
    const g = this.g;
    g.strokeStyle = '#8d939b';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cx, BY);
    g.lineTo(cx, top - 6);
    g.stroke();
    g.strokeStyle = '#c9a24a';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, top - 3, 3.5, Math.PI * 1.1, Math.PI * 2.4);
    g.stroke();
  }

  /** Arch parts go back to front: the centring first, the road behind the stones. */
  private zOrder(): number[] {
    const rank = (i: number): number => {
      const s = this.parts[i]!.shape;
      return s === 'centring' ? 0 : s === 'road' ? 1 : s === 'abutments' ? 2 : 3;
    };
    const idx = this.parts.map((_, i) => i);
    return this.p.style === 'arch' ? idx.sort((a, b) => rank(a) - rank(b)) : idx;
  }

  private isFalling(i: number): boolean {
    for (const f of this.falling) if (f.part === i) return true;
    return false;
  }

  /** The first time: a golden ghost of the next part, where it goes. */
  private drawGhost(): void {
    const i = this.nextPart();
    if (i < 0) return;
    const g = this.g;
    g.globalAlpha = 0.22 + 0.14 * Math.sin(this.t * 4);
    this.drawPart(i, -1, '#e9c46a');
    g.globalAlpha = 1;
  }

  private drawFlying(): void {
    const f = this.fly!;
    const g = this.g;
    const [ax, ay] = this.anchor(f.i);
    const k = ease(f.t / FLY_T);
    const s = 0.55 + 0.45 * k;
    g.save();
    g.translate(f.fx + (ax - f.fx) * k, f.fy + (ay - f.fy) * k - Math.sin(k * Math.PI) * 18);
    g.scale(s, s);
    g.translate(-ax, -ay);
    this.drawPart(f.i, -1);
    g.restore();
  }

  /** A falling (burning, jamming) piece: tumbling into the river, glowing and charring, or shaking. */
  private drawFallingPiece(f: Piece): void {
    const g = this.g;
    const t = this.phase === 'lost' ? this.endT : this.slip ? this.slip.t : 0;
    const look = this.fallLook;
    const [ax, ay] = this.pieceAnchor(f.part, f.k);
    g.save();
    if (look === 'fall') {
      const dy = 0.5 * 520 * t * t;
      g.translate(ax + f.drift * t, ay + dy);
      g.rotate(f.spin * t);
      g.translate(-ax, -ay);
      if (this.p.style === 'arch' && ay + dy > RIVER && ay + dy - 520 * t * 0.016 <= RIVER) {
        for (let k = 0; k < 6; k++)
          this.spawn(
            ax + f.drift * t + (Math.random() - 0.5) * 16,
            RIVER,
            (Math.random() - 0.5) * 70,
            -50 - Math.random() * 60,
            0.6,
            2,
            'rgba(180,215,240,0.8)',
            300,
          );
      }
    } else if (look === 'jam') {
      const sh = Math.max(0, 1 - t) * 2.5;
      g.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
      if (Math.random() < 0.3)
        this.spawn(
          ax + (Math.random() - 0.5) * 30,
          ay,
          (Math.random() - 0.5) * 120,
          -40 - Math.random() * 60,
          0.35,
          1.6,
          '#ffb347',
          300,
        );
    } else if (Math.random() < 0.5) {
      this.spawn(
        ax + (Math.random() - 0.5) * 40,
        ay + (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
        -30 - Math.random() * 40,
        0.6,
        2.4,
        Math.random() < 0.5 ? '#ff9a3c' : '#ffd27a',
        -30,
      );
    }
    this.drawPart(f.part, f.k);
    g.restore();
    if (look === 'burn') this.scorch(f.part, f.k, t);
    if (look === 'jam') {
      g.strokeStyle = `rgba(255,106,90,${Math.max(0, 1 - t)})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(ax, ay, 16 + t * 20, 0, Math.PI * 2);
      g.stroke();
    }
  }

  /** Overlays a part with heat: red-hot first, then charred black. */
  private scorch(i: number, k: number, t: number): void {
    const g = this.g;
    g.globalAlpha = Math.min(1, t * 2.5) * 0.7;
    this.drawPart(i, k, '#ff5a1f');
    if (t > 0.45) {
      g.globalAlpha = Math.min(1, (t - 0.45) * 2.5) * 0.85;
      this.drawPart(i, k, '#1a120c');
    }
    g.globalAlpha = 1;
  }

  /** Where one piece of a part sits (a stone of the arch, one footing). */
  private pieceAnchor(i: number, k: number): [number, number] {
    const shape = this.parts[i]!.shape ?? 'block';
    if (this.p.style === 'arch') {
      const st = STONES[shape];
      if (st) {
        const a = Math.PI + ((st[k]! + 0.5) * Math.PI) / 9;
        return [ACX + Math.cos(a) * (ARI + ARO) * 0.5, ASY + Math.sin(a) * (ARI + ARO) * 0.5];
      }
      if (shape === 'abutments') return [k ? ACX + (ARI + ARO) / 2 : ACX - (ARI + ARO) / 2, ASY + 10];
    }
    return this.anchor(i);
  }

  private drawWin(): void {
    const g = this.g;
    const t = this.endT;
    if (this.p.style === 'arch') {
      // The centring is struck, and a cart rolls over.
      const hasRoad = this.parts.some((x) => x.shape === 'road');
      const cx = BX - 20 + ease((t - 0.35) / 1.1) * (BW + 40);
      const cy = hasRoad ? ASY - ARO - 10 : ASY - ARO - 2;
      if (t > 0.35) {
        g.fillStyle = '#7a5530';
        g.fillRect(cx - 12, cy - 9, 24, 8);
        g.fillStyle = '#c9a24a';
        g.fillRect(cx - 9, cy - 13, 18, 4);
        g.fillStyle = '#2a2018';
        for (const wx of [-7, 7]) {
          g.beginPath();
          g.arc(cx + wx, cy, 3.5, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    // A glint runs over the build.
    const s = (t / 0.9) % 1.6;
    if (s < 1) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(255,230,160,0.16)';
      g.beginPath();
      const x = BX + s * (BW + 60) - 30;
      g.moveTo(x, BY);
      g.lineTo(x + 26, BY);
      g.lineTo(x - 10, BB);
      g.lineTo(x - 36, BB);
      g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    if (!this.struck) {
      this.struck = true;
      for (let k = 0; k < 18; k++)
        this.spawn(
          BX + 30 + Math.random() * (BW - 60),
          BY + 30 + Math.random() * 120,
          (Math.random() - 0.5) * 30,
          -20 - Math.random() * 30,
          1.2,
          2,
          Math.random() < 0.5 ? '#ffe08a' : '#fff3c8',
          10,
        );
    }
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

  private drawTray(): void {
    const g = this.g;
    const live = this.live();
    const ptr = this.c.pointer;
    const hover = live && !this.drag ? this.cardAt(ptr.x, ptr.y) : -1;
    const next = this.host.guided && live ? this.nextPart() : -1;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
    for (let s = 0; s < this.tray.length; s++) {
      const i = this.tray[s]!;
      const y = this.cardY(s);
      const h = this.cardH;
      const out =
        this.placed[i] ||
        this.fly?.i === i ||
        this.slip?.i === i ||
        (this.drag?.moved && this.drag.slot === s);
      rrect(g, TX, y, TW, h, 4);
      if (out) {
        g.setLineDash([2, 3]);
        g.strokeStyle = 'rgba(191,179,154,0.22)';
        g.lineWidth = 1;
        g.stroke();
        g.setLineDash([]);
        if (this.placed[i])
          text(g, '✓', TX + TW / 2, y + h / 2, { size: 11, color: 'rgba(125,255,154,0.45)' });
        continue;
      }
      g.fillStyle = s === hover ? '#3a2f20' : '#241c14';
      g.fill();
      const lit = i === next || (live && s === this.focus);
      g.strokeStyle = i === next ? `rgba(255,224,138,${0.45 + 0.5 * pulse})` : lit ? PAL.gold : PAL.line;
      g.lineWidth = lit ? 1.6 : 1;
      g.stroke();
      this.drawCardFace(i, s, TX, y, h);
    }
    // The card on the pointer while dragging.
    if (this.drag?.moved) {
      const i = this.tray[this.drag.slot]!;
      const x = clamp(ptr.x - TW / 2, 0, W - TW);
      const y = clamp(ptr.y - this.cardH / 2, 0, H - this.cardH);
      g.globalAlpha = 0.92;
      rrect(g, x, y, TW, this.cardH, 4);
      g.fillStyle = '#3a2f20';
      g.fill();
      g.strokeStyle = PAL.gold;
      g.lineWidth = 1.5;
      g.stroke();
      this.drawCardFace(i, this.drag.slot, x, y, this.cardH);
      g.globalAlpha = 1;
    }
  }

  private drawCardFace(i: number, slot: number, x: number, y: number, h: number): void {
    const g = this.g;
    const part = this.parts[i]!;
    text(g, `${slot + 1}`, x + 8, y + h / 2, { size: 9, color: PAL.gold });
    g.fillStyle = part.colour;
    rrect(g, x + 15, y + h / 2 - 5, 10, 10, 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 1;
    g.stroke();
    g.font = `11px ${FONT}`;
    let name = part.name;
    while (g.measureText(name).width > TW - 34 && name.length > 4) name = `${name.slice(0, -2)}…`;
    text(g, name, x + 30, y + h / 2, { size: 11, color: PAL.ink, align: 'left' });
  }

  /** Two marks: a slip each (one is forgiven). */
  private drawPips(): void {
    const g = this.g;
    for (let k = 0; k < 2; k++) {
      const x = BX + BW - 12 - k * 12;
      g.beginPath();
      g.arc(x, BY + 10, 3.6, 0, Math.PI * 2);
      if (k < this.mistakes) {
        g.fillStyle = PAL.bad;
        g.fill();
      } else {
        g.strokeStyle = 'rgba(191,179,154,0.5)';
        g.lineWidth = 1;
        g.stroke();
      }
    }
  }

  /** The line under the build: why a slip happened, what the part on the pointer is for, or (the first time) what's next. */
  private drawNote(): void {
    const g = this.g;
    let s = '';
    let col: string = PAL.dim;
    const ptr = this.c.pointer;
    const hover = this.live() ? this.cardAt(ptr.x, ptr.y) : -1;
    if (this.phase === 'lost' || (this.note && this.note.t < 4)) {
      s = this.note?.text ?? this.lastWhy;
      col = PAL.bad;
    } else if (hover >= 0) {
      const part = this.parts[this.tray[hover]!]!;
      s = part.hint ? `${part.name}: ${part.hint}` : part.name;
    } else if (this.host.guided && this.phase === 'build') {
      const i = this.nextPart();
      if (i >= 0) {
        s = `Next: ${this.parts[i]!.name.toLowerCase()}${this.parts[i]!.hint ? ` — ${this.parts[i]!.hint}` : ''}`;
        col = PAL.gold;
      }
    } else if (this.phase === 'build' && this.placedCount === 0)
      s = 'Click a part (or drag it) to put it in — in an order that works.';
    if (!s) return;
    g.font = `10.5px ${FONT}`;
    const max = BW - 6;
    let first = '';
    let rest = '';
    for (const w of s.split(' ')) {
      if (rest) rest += ` ${w}`;
      else {
        const tryLine = first ? `${first} ${w}` : w;
        if (g.measureText(tryLine).width > max && first) rest = w;
        else first = tryLine;
      }
    }
    if (rest)
      while (g.measureText(rest).width > max && rest.length > 3) rest = `${rest.slice(0, -2).trimEnd()}…`;
    text(g, first, BX + BW / 2, rest ? 199 : 203, { size: 10.5, color: col });
    if (rest) text(g, rest, BX + BW / 2, 211, { size: 10.5, color: col });
  }

  // ---- Drawing the parts ---------------------------------------------------------------------------

  /** Draws part `i` (or just its piece `k`), in its place; `tint` overrides its colours (for charring). */
  private drawPart(i: number, k: number, tint?: string): void {
    if (this.p.style === 'arch') this.drawArchPart(i, k, tint);
    else if (this.p.style === 'stack') this.drawStackPart(i, tint);
    else this.drawSlotPart(i, tint);
  }

  /** The outline of arch stone `s` (0–8, left foot to right foot), widened by `grow`. */
  private stonePath(g: CanvasRenderingContext2D, s: number, grow: number): void {
    const step = Math.PI / 9;
    const a0 = Math.PI + s * step + 0.012;
    const a1 = Math.PI + (s + 1) * step - 0.012;
    const ro = ARO + grow + (s === 4 ? 4 : 0);
    g.beginPath();
    g.arc(ACX, ASY, ro, a0, a1);
    g.arc(ACX, ASY, ARI - grow, a1, a0, true);
    g.closePath();
  }

  private drawArchPart(i: number, k: number, tint?: string): void {
    const g = this.g;
    const part = this.parts[i]!;
    const shape = part.shape ?? 'block';
    const st = STONES[shape];
    if (st) {
      for (let j = 0; j < st.length; j++) {
        if (k >= 0 && j !== k) continue;
        const s = st[j]!;
        this.stonePath(g, s, 0);
        g.fillStyle = tint ?? part.colour;
        g.fill();
        g.strokeStyle = '#3f392f';
        g.lineWidth = 1;
        g.stroke();
        // A lit top edge.
        const a = Math.PI + ((s + 0.5) * Math.PI) / 9;
        g.strokeStyle = 'rgba(255,245,220,0.25)';
        g.beginPath();
        g.arc(ACX, ASY, ARO - 1.5 + (s === 4 ? 4 : 0), a - 0.12, a + 0.12);
        g.stroke();
      }
      return;
    }
    if (shape === 'abutments') {
      for (let j = 0; j < 2; j++) {
        if (k >= 0 && j !== k) continue;
        const x = j ? ACX + ARI - 4 : ACX - ARO - 4;
        g.fillStyle = tint ?? part.colour;
        g.fillRect(x, ASY, ARO - ARI + 8, 20);
        g.strokeStyle = '#3f392f';
        g.lineWidth = 1;
        g.strokeRect(x, ASY, ARO - ARI + 8, 20);
        g.beginPath();
        g.moveTo(x, ASY + 10);
        g.lineTo(x + ARO - ARI + 8, ASY + 10);
        g.moveTo(x + 12, ASY);
        g.lineTo(x + 12, ASY + 10);
        g.moveTo(x + 20, ASY + 10);
        g.lineTo(x + 20, ASY + 20);
        g.stroke();
      }
      return;
    }
    if (shape === 'centring') {
      // A wooden frame under the arch: a curved rib on posts, braced.
      const col = tint ?? part.colour;
      const r = ARI - 3;
      g.strokeStyle = col;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(ACX, ASY, r, Math.PI, Math.PI * 2);
      g.stroke();
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(ACX - r, ASY + 2);
      g.lineTo(ACX + r, ASY + 2);
      for (const dx of [-36, -12, 12, 36]) {
        const y = ASY - Math.sqrt(r * r - dx * dx);
        g.moveTo(ACX + dx, y);
        g.lineTo(ACX + dx, RIVER + 10);
      }
      g.moveTo(ACX - 36, ASY + 2);
      g.lineTo(ACX - 12, ASY - 40);
      g.moveTo(ACX + 36, ASY + 2);
      g.lineTo(ACX + 12, ASY - 40);
      g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 1;
      for (let a = Math.PI + 0.15; a < Math.PI * 2 - 0.1; a += 0.2) {
        g.beginPath();
        g.moveTo(ACX + Math.cos(a) * (r - 2), ASY + Math.sin(a) * (r - 2));
        g.lineTo(ACX + Math.cos(a) * (r + 2), ASY + Math.sin(a) * (r + 2));
        g.stroke();
      }
      return;
    }
    if (shape === 'road') {
      // Rubble over the arch up to a level road, with a low wall along it.
      const top = ASY - ARO - 8;
      const x0 = ACX - ARO - 6;
      const x1 = ACX + ARO + 6;
      g.fillStyle = tint ?? part.colour;
      g.beginPath();
      g.moveTo(x0, ASY);
      g.lineTo(x0, top);
      g.lineTo(x1, top);
      g.lineTo(x1, ASY);
      g.arc(ACX, ASY, ARO + 1, 0, Math.PI, true);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let j = 0; j < 14; j++)
        g.fillRect(x0 + 6 + ((j * 37) % (x1 - x0 - 12)), top + 6 + ((j * 13) % 26), 5, 3);
      g.fillStyle = tint ?? '#5d554b';
      g.fillRect(x0 - 4, top - 3, x1 - x0 + 8, 4);
      g.fillStyle = tint ?? '#8a8274';
      g.fillRect(x0 - 2, top - 9, x1 - x0 + 4, 6);
      g.fillStyle = tint ?? '#a39b8c';
      g.fillRect(x0 - 3, top - 10, x1 - x0 + 6, 2);
      return;
    }
    g.fillStyle = tint ?? part.colour;
    g.fillRect(ACX - 20, ASY - 20, 40, 20);
  }

  private drawStackPart(i: number, tint?: string): void {
    const g = this.g;
    const part = this.parts[i]!;
    const [x, y, w, h] = this.box(i);
    const col = tint ?? part.colour;
    const cx = x + w / 2;
    const line = '#1b1d22';
    g.lineWidth = 1;
    g.strokeStyle = line;
    switch (part.shape ?? 'block') {
      case 'adapter': {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(x, y + h);
        g.lineTo(x + w, y + h);
        g.lineTo(x + w * 0.8, y);
        g.lineTo(x + w * 0.2, y);
        g.closePath();
        g.fill();
        g.stroke();
        break;
      }
      case 'panels': {
        // A flat stage ringed with solar cells, small thrusters at the ends.
        g.fillStyle = tint ?? '#b9bec6';
        g.fillRect(x, y + h * 0.15, w, h * 0.7);
        g.fillStyle = tint ?? '#1f3a6b';
        g.fillRect(x + 3, y + h * 0.25, w - 6, h * 0.5);
        g.strokeStyle = 'rgba(160,200,255,0.35)';
        g.beginPath();
        for (let k = 1; k < 10; k++) {
          g.moveTo(x + 3 + ((w - 6) * k) / 10, y + h * 0.25);
          g.lineTo(x + 3 + ((w - 6) * k) / 10, y + h * 0.75);
        }
        g.moveTo(x + 3, y + h * 0.5);
        g.lineTo(x + w - 3, y + h * 0.5);
        g.stroke();
        g.fillStyle = tint ?? '#6b7078';
        g.fillRect(x - 4, y + h * 0.35, 4, h * 0.3);
        g.fillRect(x + w, y + h * 0.35, 4, h * 0.3);
        break;
      }
      case 'legs': {
        // Legs to stand on and rockets to brake with.
        g.strokeStyle = tint ?? '#8d939b';
        g.lineWidth = 3;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x + w * 0.24, y + h * 0.42);
        g.lineTo(x + w * 0.06, y + h * 0.92);
        g.moveTo(x + w * 0.76, y + h * 0.42);
        g.lineTo(x + w * 0.94, y + h * 0.92);
        g.moveTo(x + w * 0.3, y + h * 0.62);
        g.lineTo(x + w * 0.12, y + h * 0.76);
        g.moveTo(x + w * 0.7, y + h * 0.62);
        g.lineTo(x + w * 0.88, y + h * 0.76);
        g.stroke();
        g.lineCap = 'butt';
        g.fillStyle = tint ?? '#6b7078';
        for (const fx of [0.06, 0.94]) {
          g.beginPath();
          g.ellipse(x + w * fx, y + h * 0.95, 7, 2.5, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = tint ?? '#3a3a40';
        for (const ex of [0.4, 0.6]) {
          g.beginPath();
          g.moveTo(x + w * ex - 4, y + h * 0.6);
          g.lineTo(x + w * ex + 4, y + h * 0.6);
          g.lineTo(x + w * ex + 7, y + h * 0.84);
          g.lineTo(x + w * ex - 7, y + h * 0.84);
          g.closePath();
          g.fill();
        }
        g.fillStyle = col;
        g.fillRect(x + w * 0.2, y + h * 0.12, w * 0.6, h * 0.5);
        g.strokeStyle = 'rgba(90,60,10,0.45)';
        g.lineWidth = 1;
        g.beginPath();
        for (let k = 1; k < 5; k++) {
          g.moveTo(x + w * 0.2 + (w * 0.6 * k) / 5, y + h * 0.12);
          g.lineTo(x + w * 0.2 + (w * 0.6 * k) / 5 + 3, y + h * 0.62);
        }
        g.stroke();
        g.fillStyle = tint ?? '#9aa0a8';
        g.fillRect(x + w * 0.14, y + h * 0.04, w * 0.72, h * 0.1);
        break;
      }
      case 'module': {
        // A habitat module lying on its side: a room to live in, windows along it.
        g.fillStyle = col;
        rrect(g, x, y + h * 0.1, w, h * 0.8, h * 0.35);
        g.fill();
        g.stroke();
        g.fillStyle = tint ?? '#c9a64a';
        g.fillRect(x + 2, y + h * 0.2, w * 0.08, h * 0.6);
        g.fillRect(x + w - 2 - w * 0.08, y + h * 0.2, w * 0.08, h * 0.6);
        g.fillStyle = tint ?? '#24406a';
        for (let k = 0; k < 4; k++) {
          rrect(g, x + w * (0.2 + k * 0.16), y + h * 0.36, w * 0.1, h * 0.22, 2);
          g.fill();
        }
        g.fillStyle = tint ?? '#5ec8d8';
        g.fillRect(x + w * 0.2, y + h * 0.36, w * 0.1 * 0.4, h * 0.07);
        break;
      }
      case 'rover': {
        g.fillStyle = tint ?? '#2a2a30';
        for (const wx of [0.2, 0.5, 0.8]) {
          g.beginPath();
          g.arc(x + w * wx, y + h * 0.82, h * 0.16, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = tint ?? '#9aa0a8';
        for (const wx of [0.2, 0.5, 0.8]) g.fillRect(x + w * wx - 1, y + h * 0.6, 2, h * 0.2);
        g.fillStyle = col;
        g.fillRect(x + w * 0.06, y + h * 0.38, w * 0.88, h * 0.26);
        g.strokeRect(x + w * 0.06, y + h * 0.38, w * 0.88, h * 0.26);
        g.fillStyle = tint ?? '#cfd3d8';
        g.fillRect(x + w * 0.2, y + h * 0.04, 3, h * 0.36);
        g.fillRect(x + w * 0.2 - 4, y, 11, h * 0.12);
        g.fillStyle = tint ?? '#5ec8d8';
        g.fillRect(x + w * 0.2 + 3, y + h * 0.03, 3, h * 0.06);
        g.fillStyle = tint ?? '#cfd3d8';
        g.beginPath();
        g.ellipse(x + w * 0.74, y + h * 0.28, w * 0.09, h * 0.06, -0.4, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'capsule': {
        // A cutaway shell: what's inside shows through.
        g.fillStyle = tint ?? 'rgba(220,224,230,0.32)';
        g.beginPath();
        g.moveTo(x, y + h);
        g.lineTo(x + w * 0.28, y);
        g.lineTo(x + w * 0.72, y);
        g.lineTo(x + w, y + h);
        g.closePath();
        g.fill();
        g.strokeStyle = tint ?? '#e4e7ec';
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = tint ?? '#5ec8d8';
        g.beginPath();
        g.arc(x + w * 0.66, y + h * 0.35, 3, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'crate': {
        g.fillStyle = col;
        g.fillRect(x, y, w, h);
        g.strokeRect(x, y, w, h);
        g.fillStyle = tint ?? '#3a3f46';
        g.fillRect(x + w * 0.3, y, 3, h);
        g.fillRect(x + w * 0.7 - 3, y, 3, h);
        g.fillStyle = tint ?? '#7fe0c8';
        g.beginPath();
        g.moveTo(x + w * 0.5, y + h * 0.2);
        g.lineTo(x + w * 0.58, y + h * 0.5);
        g.lineTo(x + w * 0.5, y + h * 0.8);
        g.lineTo(x + w * 0.42, y + h * 0.5);
        g.closePath();
        g.fill();
        break;
      }
      case 'shield': {
        // A broad, shallow dish that takes the heat coming home.
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + w, y);
        g.quadraticCurveTo(x + w * 0.85, y + h * 1.2, cx, y + h);
        g.quadraticCurveTo(x + w * 0.15, y + h * 1.2, x, y);
        g.closePath();
        g.fill();
        g.strokeStyle = tint ?? '#8a7a68';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + w, y);
        g.stroke();
        break;
      }
      case 'chute': {
        g.fillStyle = tint ?? '#e8e4da';
        rrect(g, x, y, w, h, Math.min(4, w / 3));
        g.fill();
        g.stroke();
        g.fillStyle = col;
        g.fillRect(x, y + h * 0.35, w, h * 0.3);
        break;
      }
      case 'engine': {
        g.fillStyle = col;
        g.fillRect(x + w * 0.1, y + h * 0.32, w * 0.8, h * 0.68);
        g.strokeRect(x + w * 0.1, y + h * 0.32, w * 0.8, h * 0.68);
        g.fillStyle = tint ?? '#8d939b';
        g.fillRect(x + w * 0.1, y + h * 0.5, w * 0.8, 2);
        g.fillRect(x + w * 0.1, y + h * 0.78, w * 0.8, 2);
        g.fillStyle = tint ?? '#3a3a40';
        g.beginPath();
        g.moveTo(cx - w * 0.14, y + h * 0.32);
        g.lineTo(cx + w * 0.14, y + h * 0.32);
        g.lineTo(cx + w * 0.26, y);
        g.lineTo(cx - w * 0.26, y);
        g.closePath();
        g.fill();
        break;
      }
      case 'fairing': {
        // The nose that closes round it all: see-through here, so the stack shows.
        g.fillStyle = tint ?? 'rgba(230,234,240,0.1)';
        g.strokeStyle = tint ?? 'rgba(236,240,246,0.85)';
        g.lineWidth = 1.8;
        g.beginPath();
        g.moveTo(x, y + h);
        g.lineTo(x, y + h * 0.42);
        g.quadraticCurveTo(x, y + h * 0.04, cx, y);
        g.quadraticCurveTo(x + w, y + h * 0.04, x + w, y + h * 0.42);
        g.lineTo(x + w, y + h);
        g.closePath();
        g.fill();
        g.stroke();
        break;
      }
      default: {
        g.fillStyle = col;
        g.fillRect(x, y, w, h);
        g.strokeRect(x, y, w, h);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(x, y, w, 2);
      }
    }
  }

  private drawSlotPart(i: number, tint?: string): void {
    const g = this.g;
    const part = this.parts[i]!;
    const n = this.placed[i] ? this.orderOf(i) : this.placedCount;
    const [x, y, w, h] = this.slotBox(n);
    rrect(g, x, y, w, h, 4);
    g.fillStyle = '#241c14';
    g.fill();
    g.fillStyle = tint ?? part.colour;
    rrect(g, x, y, 8, h, 4);
    g.fill();
    g.strokeStyle = tint ?? part.colour;
    g.lineWidth = 1.2;
    rrect(g, x, y, w, h, 4);
    g.stroke();
    text(g, part.name, x + 16, y + h / 2, { size: 11.5, color: PAL.ink, align: 'left' });
  }
}

/** Which demo the playground shows (?variant=…). */
function variant<T extends object>(all: T, fallback: keyof T): T[keyof T] {
  const v = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('variant');
  return v && Object.hasOwn(all, v) ? all[v as keyof T] : all[fallback];
}

export const order: MinigameDef<OrderParams> = {
  kind: 'order',
  name: 'Build in order',
  get demo() {
    return variant(ORDER_DEMOS, 'arch');
  },
  create: (host, p) => new OrderGame(host, p),
};
