/**
 * Hands-on actions: each crafting / assembly verb has its own small interaction.
 * Results are sent as beats (0 miss, 1 good, 2 perfect). Passive progress continues regardless.
 */
import { ACTIONS, type ActionKind } from '../game/content.ts';
import { el, pct, setText } from './dom.ts';
import { FACES } from './fonts.ts';

type Quality = 0 | 1 | 2;
const W = 320;
const H = 96;
const GOLD = '#e9c46a';

const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ'] as const;
const WIRE_COLORS = ['#ff6a5a', '#6aa8ff', '#7dff6a'] as const;
type Wire = 0 | 1 | 2;
type Terminals = [Wire, Wire, Wire];

export class ActionPanel {
  private beat: (q: Quality) => void;

  readonly root = el('div', 'castbar panel hidden pe');
  private title = el('div', 'c-title gold-text');
  private hint = el('div', 'c-hint');
  private canvas = el('canvas');
  private g: CanvasRenderingContext2D;
  private bar = el('div', 'bar');
  private fill = el('div', 'fill work');
  private verdict = el('div', 'verdict');
  private kind: ActionKind | null = null;
  private t = 0;
  private flash = 0;
  private flashColor = '#fff';
  private verdictT = 0;
  private holding = false;
  private mouse = { x: 0, y: 0 };
  // Per-action state.
  private ring = 0;
  private heat = 0.3;
  private heatTick = 0;
  private target = { x: 0, y: 0, t: 0 };
  private seamT = 0;
  private weldTick = 0;
  private wires: { left: Terminals; right: Terminals; done: boolean[]; drag: number } = {
    left: [0, 1, 2],
    right: [0, 1, 2],
    done: [false, false, false],
    drag: -1,
  };
  private code: { seq: number[]; idx: number; showT: number; stepT: number } = {
    seq: [],
    idx: 0,
    showT: 0,
    stepT: 0,
  };

  constructor(parent: HTMLElement, beat: (q: Quality) => void) {
    this.beat = beat;

    this.canvas.width = W * 2;
    this.canvas.height = H * 2;
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    this.g = this.canvas.getContext('2d')!;
    this.g.scale(2, 2);
    this.bar.appendChild(this.fill);
    this.root.append(this.verdict, this.title, this.hint, this.canvas, this.bar);
    parent.appendChild(this.root);
    const pos = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * W;
      this.mouse.y = ((e.clientY - r.top) / r.height) * H;
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      pos(e);
      e.stopPropagation();
      this.press(true);
    });
    window.addEventListener('pointerup', (e) => {
      pos(e);
      this.press(false);
    });
    this.canvas.addEventListener('pointermove', pos);
  }

  get active(): boolean {
    return this.kind !== null;
  }

  show(kind: ActionKind, label: string, progress: number): void {
    if (kind !== this.kind) {
      this.kind = kind;
      this.reset();
      this.root.classList.remove('hidden');
      setText(this.hint, `${ACTIONS[kind].hint} · F or click`);
    }
    setText(this.title, `${ACTIONS[kind].verb} — ${label}`);
    this.fill.style.width = pct(progress);
  }

  hide(): void {
    if (!this.kind) return;
    this.kind = null;
    this.holding = false;
    this.root.classList.add('hidden');
  }

  /** F key: acts like a click for timing actions. Returns true if consumed. */
  key(down: boolean): boolean {
    if (!this.kind) return false;
    if (this.kind === 'cut' || this.kind === 'wire' || this.kind === 'code' || this.kind === 'weld') {
      // These need the mouse; Space still counts for nothing but shouldn't recentre the camera.
      return true;
    }
    this.press(down);
    return true;
  }

  private reset(): void {
    this.t = 0;
    this.ring = 0;
    this.heat = 0.3;
    this.seamT = 0;
    this.newTarget();
    this.wires = {
      left: this.shuffle([0, 1, 2]),
      right: this.shuffle([0, 1, 2]),
      done: [false, false, false],
      drag: -1,
    };
    this.newCode();
  }

  private shuffle(a: Terminals): Terminals {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      // Fisher–Yates keeps both indices within this dense three-terminal tuple.
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }

  private newTarget(): void {
    this.target = { x: 40 + Math.random() * (W - 80), y: 22 + Math.random() * (H - 44), t: 0 };
  }

  private newCode(): void {
    this.code = {
      seq: Array.from({ length: 4 }, () => Math.floor(Math.random() * RUNES.length)),
      idx: 0,
      showT: 1.6,
      stepT: 0,
    };
  }

  private judge(q: Quality): void {
    this.beat(q);
    this.flash = 1;
    this.flashColor = q === 2 ? '#ffe066' : q === 1 ? '#9fe08a' : '#ff6a5a';
    this.verdict.textContent = q === 2 ? 'Perfect!' : q === 1 ? 'Good' : 'Miss';
    this.verdict.style.color = this.flashColor;
    this.verdictT = 0.6;
  }

  private press(down: boolean): void {
    const k = this.kind;
    if (!k) return;
    if (k === 'smelt' || k === 'weld') {
      this.holding = down;
      return;
    }
    if (!down) {
      if (k === 'wire' && this.wires.drag >= 0) this.dropWire();
      return;
    }
    switch (k) {
      case 'hammer': {
        const r = this.ringRadius();
        const d = Math.abs(r - 14);
        this.judge(d < 3 ? 2 : d < 7 ? 1 : 0);
        this.ring = 0;
        break;
      }
      case 'saw': {
        const x = this.sawX();
        const d = Math.abs(x - 0.5);
        this.judge(d < 0.05 ? 2 : d < 0.13 ? 1 : 0);
        break;
      }
      case 'cut': {
        const d = Math.hypot(this.mouse.x - this.target.x, this.mouse.y - this.target.y);
        if (d < 16) {
          this.judge(this.target.t < 0.45 ? 2 : 1);
          this.newTarget();
        } else this.judge(0);
        break;
      }
      case 'wire': {
        const i = this.terminalAt(this.mouse.x, this.mouse.y, 'left');
        if (i >= 0 && !this.wires.done[i]) this.wires.drag = i;
        break;
      }
      case 'code': {
        if (this.code.showT > 0) return;
        const i = this.runeAt(this.mouse.x, this.mouse.y);
        if (i < 0) return;
        if (i === this.code.seq[this.code.idx]) {
          this.judge(this.code.stepT < 0.7 ? 2 : 1);
          this.code.idx++;
          this.code.stepT = 0;
          if (this.code.idx >= this.code.seq.length) this.newCode();
        } else {
          this.judge(0);
          this.code.idx = 0;
          this.code.showT = 1.2;
        }
        break;
      }
    }
  }

  private ringRadius(): number {
    return 44 * (1 - this.ring);
  }

  private sawX(): number {
    return 0.5 + 0.5 * Math.sin(this.t * 4.2);
  }

  private terminalAt(x: number, y: number, side: 'left' | 'right'): number {
    const tx = side === 'left' ? 40 : W - 40;
    for (let i = 0; i < 3; i++) {
      const ty = 20 + i * 28;
      if (Math.hypot(x - tx, y - ty) < 14) return i;
    }
    return -1;
  }

  private dropWire(): void {
    const from = this.wires.drag;
    this.wires.drag = -1;
    const to = this.terminalAt(this.mouse.x, this.mouse.y, 'right');
    if (to < 0) return;
    if (this.wires.left[from] === this.wires.right[to]) {
      this.wires.done[from] = true;
      this.judge(2);
      if (this.wires.done.every(Boolean))
        this.wires = {
          left: this.shuffle([0, 1, 2]),
          right: this.shuffle([0, 1, 2]),
          done: [false, false, false],
          drag: -1,
        };
    } else this.judge(0);
  }

  private runeAt(x: number, y: number): number {
    if (y < 52 || y > 88) return -1;
    const i = Math.floor((x - 16) / ((W - 32) / RUNES.length));
    return i >= 0 && i < RUNES.length ? i : -1;
  }

  update(dt: number): void {
    if (!this.kind) return;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.verdictT -= dt;
    if (this.verdictT <= 0) this.verdict.textContent = '';
    const g = this.g;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#120e0a';
    g.fillRect(0, 0, W, H);
    if (this.flash > 0) {
      g.fillStyle = this.flashColor;
      g.globalAlpha = this.flash * 0.25;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    switch (this.kind) {
      case 'hammer':
        this.drawHammer(dt);
        break;
      case 'saw':
        this.drawSaw();
        break;
      case 'cut':
        this.drawCut(dt);
        break;
      case 'smelt':
        this.drawSmelt(dt);
        break;
      case 'weld':
        this.drawWeld(dt);
        break;
      case 'wire':
        this.drawWire();
        break;
      case 'code':
        this.drawCode(dt);
        break;
    }
  }

  private drawHammer(dt: number): void {
    const g = this.g;
    this.ring += dt / 0.85;
    if (this.ring >= 1) this.ring = 0;
    const cx = W / 2;
    const cy = H / 2;
    g.strokeStyle = 'rgba(233,196,106,0.35)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cy, 14, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#6e5a35';
    g.beginPath();
    g.arc(cx, cy, 9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = GOLD;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, cy, Math.max(1, this.ringRadius()), 0, Math.PI * 2);
    g.stroke();
  }

  private drawSaw(): void {
    const g = this.g;
    const y = H / 2;
    g.fillStyle = '#3a2a18';
    g.fillRect(20, y - 10, W - 40, 20);
    g.fillStyle = 'rgba(159,224,138,0.35)';
    g.fillRect(20 + (W - 40) * 0.37, y - 10, (W - 40) * 0.26, 20);
    g.fillStyle = 'rgba(255,224,102,0.6)';
    g.fillRect(20 + (W - 40) * 0.45, y - 10, (W - 40) * 0.1, 20);
    const x = 20 + (W - 40) * this.sawX();
    g.fillStyle = '#d9dee6';
    g.beginPath();
    g.moveTo(x - 6, y - 22);
    g.lineTo(x + 6, y - 22);
    for (let i = 0; i < 6; i++) g.lineTo(x + (i % 2 ? 6 : 2), y + 10 + i * 2);
    g.lineTo(x - 6, y + 22);
    g.closePath();
    g.fill();
  }

  private drawCut(dt: number): void {
    const g = this.g;
    g.fillStyle = '#5a5f68';
    g.beginPath();
    g.moveTo(14, 18);
    g.lineTo(W - 20, 10);
    g.lineTo(W - 10, H - 14);
    g.lineTo(24, H - 8);
    g.closePath();
    g.fill();
    this.target.t += dt / 1.0;
    if (this.target.t > 1) {
      this.judge(0);
      this.newTarget();
    }
    const r = 16 * (1 - this.target.t * 0.5);
    g.strokeStyle = this.target.t < 0.45 ? '#ffe066' : '#ffb0a0';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(this.target.x, this.target.y, r, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(this.target.x - 6, this.target.y);
    g.lineTo(this.target.x + 6, this.target.y);
    g.moveTo(this.target.x, this.target.y - 6);
    g.lineTo(this.target.x, this.target.y + 6);
    g.stroke();
  }

  private drawSmelt(dt: number): void {
    const g = this.g;
    this.heat += (this.holding ? 0.85 : -0.55) * dt;
    this.heat = Math.max(0, Math.min(1, this.heat));
    if (this.heat > 0.97) {
      this.judge(0);
      this.heat = 0.6;
    }
    this.heatTick -= dt;
    if (this.heatTick <= 0 && this.heat > 0.55 && this.heat < 0.82) {
      this.heatTick = 0.45;
      this.judge(this.heat > 0.62 && this.heat < 0.74 ? 2 : 1);
    }
    const x0 = 30;
    const x1 = W - 30;
    const y = H / 2;
    const grd = g.createLinearGradient(x0, 0, x1, 0);
    grd.addColorStop(0, '#2a1a40');
    grd.addColorStop(0.5, '#c2491a');
    grd.addColorStop(1, '#fff1a0');
    g.fillStyle = grd;
    g.fillRect(x0, y - 8, x1 - x0, 16);
    g.strokeStyle = GOLD;
    g.lineWidth = 2;
    g.strokeRect(x0 + (x1 - x0) * 0.55, y - 12, (x1 - x0) * 0.27, 24);
    g.fillStyle = 'rgba(255,224,102,0.35)';
    g.fillRect(x0 + (x1 - x0) * 0.62, y - 12, (x1 - x0) * 0.12, 24);
    const nx = x0 + (x1 - x0) * this.heat;
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(nx, y - 16);
    g.lineTo(nx - 6, y - 26);
    g.lineTo(nx + 6, y - 26);
    g.closePath();
    g.fill();
    g.fillStyle = '#c9b48a';
    g.font = `11px ${FACES.serif}`;
    g.fillText(this.holding ? 'pumping the bellows…' : 'hold to pump', 30, H - 10);
  }

  private seam(t: number): { x: number; y: number } {
    return { x: 20 + (W - 40) * t, y: H / 2 + Math.sin(t * Math.PI * 2.2) * 22 };
  }

  private drawWeld(dt: number): void {
    const g = this.g;
    g.strokeStyle = '#6a7180';
    g.lineWidth = 6;
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const p = this.seam(i / 40);
      if (i) g.lineTo(p.x, p.y);
      else g.moveTo(p.x, p.y);
    }
    g.stroke();
    this.seamT += dt / 2.4;
    if (this.seamT > 1) this.seamT = 0;
    // Welded part of the seam glows.
    g.strokeStyle = '#ffd27a';
    g.lineWidth = 3;
    g.beginPath();
    for (let i = 0; i <= 40 * this.seamT; i++) {
      const p = this.seam(i / 40);
      if (i) g.lineTo(p.x, p.y);
      else g.moveTo(p.x, p.y);
    }
    g.stroke();
    const sp = this.seam(this.seamT);
    g.fillStyle = '#e6f6ff';
    g.beginPath();
    g.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
    g.fill();
    const d = Math.hypot(this.mouse.x - sp.x, this.mouse.y - sp.y);
    this.weldTick -= dt;
    if (this.holding && this.weldTick <= 0) {
      this.weldTick = 0.3;
      if (d < 14) this.judge(d < 6 ? 2 : 1);
    }
    g.strokeStyle = this.holding ? (d < 14 ? '#9fe08a' : '#ff6a5a') : 'rgba(255,255,255,0.4)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(this.mouse.x, this.mouse.y, 9, 0, Math.PI * 2);
    g.stroke();
  }

  private drawWire(): void {
    const g = this.g;
    for (const i of [0, 1, 2] as const) {
      const ly = 20 + i * 28;
      g.fillStyle = WIRE_COLORS[this.wires.left[i]];
      g.beginPath();
      g.arc(40, ly, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = WIRE_COLORS[this.wires.right[i]];
      g.beginPath();
      g.arc(W - 40, ly, 9, 0, Math.PI * 2);
      g.fill();
      if (this.wires.done[i]) {
        const j = this.wires.right.indexOf(this.wires.left[i]);
        g.strokeStyle = WIRE_COLORS[this.wires.left[i]];
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(40, ly);
        g.bezierCurveTo(W / 2, ly, W / 2, 20 + j * 28, W - 40, 20 + j * 28);
        g.stroke();
      }
    }
    if (this.wires.drag >= 0) {
      const ly = 20 + this.wires.drag * 28;
      // drag comes from terminalAt: only a valid terminal is stored while dragging.
      g.strokeStyle = WIRE_COLORS[this.wires.left[this.wires.drag]!];
      g.lineWidth = 3;
      g.setLineDash([5, 4]);
      g.beginPath();
      g.moveTo(40, ly);
      g.lineTo(this.mouse.x, this.mouse.y);
      g.stroke();
      g.setLineDash([]);
    }
  }

  private drawCode(dt: number): void {
    const g = this.g;
    const c = this.code;
    if (c.showT > 0) c.showT -= dt;
    else c.stepT += dt;
    // Sequence preview (top).
    g.font = '20px serif';
    g.textAlign = 'center';
    const shown = c.showT > 0 ? Math.min(c.seq.length, Math.floor((1.6 - c.showT) / 0.35) + 1) : c.seq.length;
    for (let i = 0; i < c.seq.length; i++) {
      const x = W / 2 - 54 + i * 36;
      const visible = c.showT > 0 ? i < shown : true;
      g.fillStyle = i < c.idx ? '#9fe08a' : visible && c.showT > 0 ? '#c18bff' : '#4a3a5a';
      // seq is dense, generated from indices below RUNES.length in newCode.
      g.fillText(c.showT > 0 || i < c.idx ? RUNES[c.seq[i]!]! : '?', x, 30);
    }
    // Rune buttons (bottom).
    const bw = (W - 32) / RUNES.length;
    for (let i = 0; i < RUNES.length; i++) {
      const x = 16 + i * bw;
      const hover = this.mouse.y > 52 && this.mouse.x > x && this.mouse.x < x + bw - 4;
      g.fillStyle = hover ? '#3a2a50' : '#221a30';
      g.fillRect(x, 54, bw - 4, 34);
      g.fillStyle = '#d4a8ff';
      g.fillText(RUNES[i]!, x + (bw - 4) / 2, 79);
    }
    g.textAlign = 'left';
  }
}
