const TAU = Math.PI * 2;
export const SPARK = 1;
export const SMOKE = 2;
export const CHIP = 3;
export const FLAKE = 4;
/** Dust on an airless world: no air to hold it, so it flies straight and far. */
export const GRIT = 5;
const GRAV = [0, 260, -16, 300, 220, 60];
const DRAG = [0, 1.2, 1, 1.5, 1, 0];

/** A fixed pool of particles (sparks, smoke, chips, dust), reused so no frame allocates. */
/** Pool indices are either modulo N or bounded by N; kind tags are written only by typed spawn/burst. */
export type ParticleKind = typeof SPARK | typeof SMOKE | typeof CHIP | typeof FLAKE | typeof GRIT;
export class Fx {
  static readonly N = 140;
  readonly x = new Float32Array(Fx.N);
  readonly y = new Float32Array(Fx.N);
  readonly vx = new Float32Array(Fx.N);
  readonly vy = new Float32Array(Fx.N);
  readonly life = new Float32Array(Fx.N);
  readonly span = new Float32Array(Fx.N);
  readonly kind = new Uint8Array(Fx.N);
  private next = 0;

  spawn(k: ParticleKind, x: number, y: number, vx: number, vy: number, life: number): void {
    const i = this.next;
    this.next = (i + 1) % Fx.N;
    this.kind[i] = k;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.span[i] = life;
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
    }
  }

  draw(g: CanvasRenderingContext2D): void {
    for (let i = 0; i < Fx.N; i++) {
      const k = this.kind[i]!;
      if (!k) continue;
      const a = this.life[i]! / this.span[i]!;
      const x = this.x[i]!;
      const y = this.y[i]!;
      if (k === SMOKE) {
        g.globalAlpha = a * 0.35;
        g.fillStyle = '#7a746e';
        g.beginPath();
        g.arc(x, y, 3 + (1 - a) * 9, 0, TAU);
        g.fill();
        continue;
      }
      if (k === GRIT) {
        g.globalAlpha = Math.min(1, a * 2) * 0.8;
        g.strokeStyle = '#b4b9c0';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(x - this.vx[i]! * 0.025, y - this.vy[i]! * 0.025);
        g.lineTo(x, y);
        g.stroke();
        continue;
      }
      g.globalAlpha = Math.min(1, a * 1.6);
      g.fillStyle = k === SPARK ? (a > 0.5 ? '#fff4c0' : '#ffa040') : k === CHIP ? '#c9ced6' : '#eaf6ff';
      g.fillRect(x - 1, y - 1, k === FLAKE ? 1.6 : 2, k === FLAKE ? 1.6 : 2);
    }
    g.globalAlpha = 1;
  }
}
