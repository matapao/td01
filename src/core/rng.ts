/** Small, fast, seedable PRNG (mulberry32). Deterministic across runs — the sim only uses this. */
export class RNG {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  /** Float in [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** Integer in [a, b] inclusive. */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (!arr.length) throw new RangeError('Cannot pick from an empty collection');
    // next() is in [0, 1), so this index is in the checked non-empty collection.
    return arr[Math.floor(this.next() * arr.length)]!;
  }

  /** Independent stream derived from this seed (does not advance this one). */
  fork(salt: number): RNG {
    return new RNG(hash32(this.s ^ Math.imul(salt + 1, 0x85ebca6b)));
  }

  /** The generator's whole state (for saving and restoring a game exactly). */
  get state(): number {
    return this.s;
  }

  set state(v: number) {
    this.s = v >>> 0;
  }
}

export function hash32(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

/** Deterministic 2D lattice hash in [0, 1). */
export function hash2(x: number, y: number, seed = 0): number {
  return hash32(Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ seed) / 4294967296;
}
