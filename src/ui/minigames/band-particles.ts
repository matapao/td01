const TAU = Math.PI * 2;
export const SPARK = 1;
export const AIR = 2;
export const SMOKE = 3;
export const STEAM = 4;
export const EMBER = 5;
export const BUBBLE = 6;
export const GRAIN = 7;
export const WATER = 8;
export const STREAK = 9;
export const CLOUD = 10;
export const GRIT = 11;
const GRAV = [0, -40, 0, -18, -34, 140, -70, 560, 520, 0, 0, 50];
const DRAG = [0, 1.4, 4, 0.9, 1.9, 0.9, 1.5, 0, 0.3, 0, 0, 0];
const GROW = [0, 0, 0, 13, 30, 0, 1, 0, 0, 0, 10, 0];

/** A fixed pool of particles (sparks, puffs, bubbles, ore), reused so no frame allocates. */
/** Pool indices are either modulo N or bounded by N; kind tags are written only by typed spawn/burst. */
export type ParticleKind =
  | typeof SPARK
  | typeof AIR
  | typeof SMOKE
  | typeof STEAM
  | typeof EMBER
  | typeof BUBBLE
  | typeof GRAIN
  | typeof WATER
  | typeof STREAK
  | typeof CLOUD
  | typeof GRIT;
export class Fx {
  static readonly N = 160;
  readonly x = new Float32Array(Fx.N);
  readonly y = new Float32Array(Fx.N);
  readonly vx = new Float32Array(Fx.N);
  readonly vy = new Float32Array(Fx.N);
  readonly life = new Float32Array(Fx.N);
  readonly span = new Float32Array(Fx.N);
  readonly size = new Float32Array(Fx.N);
  readonly kind = new Uint8Array(Fx.N);
  private next = 0;

  spawn(k: ParticleKind, x: number, y: number, vx: number, vy: number, life: number, size: number): void {
    const i = this.next;
    this.next = (i + 1) % Fx.N;
    this.kind[i] = k;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.span[i] = life;
    this.size[i] = size;
  }

  step(dt: number): void {
    for (let i = 0; i < Fx.N; i++) {
      const k = this.kind[i]!;
      if (!k) continue;
      if ((this.life[i]! -= dt) <= 0) {
        this.kind[i] = 0;
        continue;
      }
      const d = Math.exp(-DRAG[k]! * dt);
      this.vx[i]! *= d;
      this.vy[i] = this.vy[i]! * d + GRAV[k]! * dt;
      this.x[i]! += this.vx[i]! * dt;
      this.y[i]! += this.vy[i]! * dt;
      this.size[i]! += GROW[k]! * dt;
    }
  }

  draw(g: CanvasRenderingContext2D): void {
    for (let i = 0; i < Fx.N; i++) {
      const k = this.kind[i]!;
      if (!k) continue;
      const a = this.life[i]! / this.span[i]!;
      const x = this.x[i]!;
      const y = this.y[i]!;
      const r = this.size[i]!;
      switch (k) {
        case SPARK:
        case EMBER:
          g.globalAlpha = Math.min(1, a * 1.6);
          g.fillStyle = a > 0.55 ? '#ffe9a8' : '#ff8a30';
          g.fillRect(x - r / 2, y - r / 2, r, r);
          break;
        case AIR:
        case STREAK:
          g.globalAlpha = k === AIR ? a * 0.75 : a * 0.5 * r;
          g.strokeStyle = '#e6f0ff';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x - this.vx[i]! * 0.04, y - this.vy[i]! * 0.04);
          g.lineTo(x, y);
          g.stroke();
          break;
        case SMOKE:
          g.globalAlpha = a * 0.32;
          g.fillStyle = '#6f6862';
          g.beginPath();
          g.arc(x, y, r, 0, TAU);
          g.fill();
          break;
        case STEAM:
          g.globalAlpha = a * 0.5;
          g.fillStyle = '#eef2f5';
          g.beginPath();
          g.arc(x, y, r, 0, TAU);
          g.fill();
          break;
        case GRIT:
          // Dust with no air to hold it: it flies straight out, fast and far.
          g.globalAlpha = Math.min(1, a * 2) * 0.8;
          g.strokeStyle = '#b4b9c0';
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(x - this.vx[i]! * 0.025, y - this.vy[i]! * 0.025);
          g.lineTo(x, y);
          g.stroke();
          break;
        case CLOUD:
          g.globalAlpha = Math.min(1, a * 2) * 0.9;
          g.fillStyle = '#f6f9fc';
          g.beginPath();
          g.ellipse(x, y, r * 1.6, r * 0.7, 0, 0, TAU);
          g.ellipse(x - r * 0.7, y - r * 0.25, r * 0.8, r * 0.55, 0, 0, TAU);
          g.ellipse(x + r * 0.6, y - r * 0.35, r * 0.9, r * 0.6, 0, 0, TAU);
          g.fill();
          break;
        case BUBBLE:
          g.globalAlpha = a * 0.85;
          g.strokeStyle = '#cdeefa';
          g.lineWidth = 1;
          g.beginPath();
          g.arc(x, y, r, 0, TAU);
          g.stroke();
          break;
        case GRAIN:
          g.globalAlpha = 1;
          g.fillStyle = r > 2 ? '#7a6a5c' : '#4b4038';
          g.fillRect(x - 1, y - 1, 2.2, 2.2);
          break;
        case WATER:
          g.globalAlpha = Math.min(1, a * 1.5);
          g.fillStyle = '#9fd6ea';
          g.fillRect(x - r / 2, y - r / 2, r, r);
          break;
      }
    }
    g.globalAlpha = 1;
  }
}
