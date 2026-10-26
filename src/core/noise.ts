import { RNG } from './rng.ts';

/** Seeded 2D gradient noise (Perlin-style), output roughly in [-1, 1]. */
export class Noise2D {
  private perm = new Uint8Array(512);
  private gx = new Float32Array(256);
  private gy = new Float32Array(256);

  constructor(seed: number) {
    const rng = new RNG(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i);
      [p[i], p[j]] = [p[j]!, p[i]!];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]!;
    for (let i = 0; i < 256; i++) {
      const a = rng.next() * Math.PI * 2;
      this.gx[i] = Math.cos(a);
      this.gy[i] = Math.sin(a);
    }
  }

  noise(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    // The complete 512-entry permutation contains byte indices into both 256-entry gradients.
    // X/Y are masked to [0,255], so every nested lookup (including +1 corners) is in bounds.
    const p = this.perm;
    const dot = (h: number, dx: number, dy: number) => this.gx[h]! * dx + this.gy[h]! * dy;
    const n00 = dot(p[p[X]! + Y]!, xf, yf);
    const n10 = dot(p[p[X + 1]! + Y]!, xf - 1, yf);
    const n01 = dot(p[p[X]! + Y + 1]!, xf, yf - 1);
    const n11 = dot(p[p[X + 1]! + Y + 1]!, xf - 1, yf - 1);
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const a = n00 + u * (n10 - n00);
    const b = n01 + u * (n11 - n01);
    return (a + v * (b - a)) * 1.414;
  }

  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
