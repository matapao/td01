const TAU = Math.PI * 2;
export const SPARK = 1;
export const DUST = 2;
export const PUFF = 3;
export const CHIP = 4;
const GRAV = [0, 300, 160, -20, 500];

/** A fixed pool of particles (sparks, sawdust, puffs), reused so no frame allocates. */
/** Pool indices are either modulo N or bounded by N; kind tags are written only by typed spawn/burst. */
export type ParticleKind = typeof SPARK | typeof DUST | typeof PUFF | typeof CHIP;
export class Fx {
  static readonly N = 120;
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

  burst(k: ParticleKind, x: number, y: number, n: number, speed: number, up: number, life: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.spawn(k, x, y, Math.cos(a) * v, Math.sin(a) * v * 0.6 - up, life * (0.6 + Math.random() * 0.5));
    }
  }

  step(dt: number): void {
    for (let i = 0; i < Fx.N; i++) {
      const k = this.kind[i]!;
      if (!k) continue;
      if ((this.life[i]! -= dt) <= 0) {
        this.kind[i] = 0;
        continue;
      }
      this.vy[i]! += GRAV[k]! * dt;
      this.vx[i]! *= 1 - Math.min(1, dt * 1.5);
      this.x[i]! += this.vx[i]! * dt;
      this.y[i]! += this.vy[i]! * dt;
    }
  }

  draw(g: CanvasRenderingContext2D): void {
    for (let i = 0; i < Fx.N; i++) {
      const k = this.kind[i]!;
      if (!k) continue;
      const a = this.life[i]! / this.span[i]!;
      g.globalAlpha = Math.min(1, a * 1.5);
      if (k === SPARK) {
        g.fillStyle = a > 0.5 ? '#fff0b0' : '#ff9a3c';
        g.fillRect(this.x[i]! - 1, this.y[i]! - 1, 2, 2);
      } else if (k === DUST || k === CHIP) {
        g.fillStyle = k === DUST ? '#d9b98a' : '#b87333';
        g.fillRect(this.x[i]! - 1, this.y[i]! - 1, 2, k === DUST ? 2 : 1.4);
      } else {
        g.globalAlpha = a * 0.4;
        g.fillStyle = '#8a827a';
        g.beginPath();
        g.arc(this.x[i]!, this.y[i]!, 3 + (1 - a) * 8, 0, TAU);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }
}
