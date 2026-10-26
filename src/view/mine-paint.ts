import * as THREE from 'three';
import { MINERALS, pathAt, type MineLayout } from '../game/mines.ts';

// ---- Noise (view only: what the eye sees of the rock) -------------------------------------------

function hash3(i: number, j: number, k: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1). */
export function vnoise(x: number, y: number, z: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const k = Math.floor(z);
  const u = x - i;
  const v = y - j;
  const w = z - k;
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  const sw = w * w * (3 - 2 * w);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (di: number, dj: number, dk: number) => hash3(i + di, j + dj, k + dk);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), su), l(c(0, 1, 0), c(1, 1, 0), su), sv),
    l(l(c(0, 0, 1), c(1, 0, 1), su), l(c(0, 1, 1), c(1, 1, 1), su), sv),
    sw,
  );
}

export const h01 = (a: number, b: number) => hash3(Math.floor(a * 7919) | 0, Math.floor(b * 104729) | 0, 17);

/** A painted light: where it hangs, how far its pool reaches, how bright. */
export interface Lamp {
  x: number;
  y: number;
  z: number;
  r: number;
  k: number;
}

/** Where the tracks run (for their beds in the floor): points along every line, in a coarse grid. */
export class Bed {
  private cells = new Map<number, number[]>();
  constructor(L: MineLayout) {
    for (const line of L.lines) {
      for (let d = 0; d <= line.length; d += 0.25) {
        const p = pathAt(line, d);
        const k = Math.floor(p.x) * 4096 + Math.floor(p.z);
        let c = this.cells.get(k);
        if (!c) this.cells.set(k, (c = []));
        c.push(p.x, p.z);
      }
    }
  }
  /** Distance from (x, z) to the nearest track (up to 2). */
  near(x: number, z: number): number {
    let best = 2;
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const c = this.cells.get((ix + a) * 4096 + iz + b);
        if (!c) continue;
        for (let i = 0; i < c.length; i += 2) best = Math.min(best, Math.hypot(x - c[i]!, z - c[i + 1]!));
      }
    }
    return best;
  }
}

export const BALLAST = new THREE.Color('#2c2b2b');
// Cold, wet-grey stone down here (the ores' stains and lumps carry the colour).
export const ROCK = new THREE.Color('#a89b88');
export const ROCK2 = new THREE.Color('#777168');
export const FLOOR = new THREE.Color('#8b7a62');
export const FLOOR2 = new THREE.Color('#655b50');
/** Readable stone throughout the mine; lantern warmth is a small baked accent. */
const AMBIENT = new THREE.Color('#e1d9cc').multiplyScalar(0.85);
const LAMP_LIGHT = new THREE.Color('#ffd3a0');

/** How much lantern light reaches a point: each lantern's pool, added up. */
export function lampAt(lamps: Lamp[], x: number, y: number, z: number): number {
  let l = 0;
  for (const p of lamps) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (Math.abs(dx) > p.r || Math.abs(dz) > p.r) continue;
    const d = Math.hypot(dx, (y - p.y) * 0.8, dz);
    if (d < p.r) l += p.k * Math.pow(1 - d / p.r, 1.6);
  }
  return Math.min(1.3, l);
}

/** The painted light at a point as a colour: the cool dark plus the lanterns' warm pools. */
export function lightColor(lamps: Lamp[], x: number, y: number, z: number, out: THREE.Color): THREE.Color {
  const l = lampAt(lamps, x, y, z) * 0.1;
  return out.setRGB(AMBIENT.r + LAMP_LIGHT.r * l, AMBIENT.g + LAMP_LIGHT.g * l, AMBIENT.b + LAMP_LIGHT.b * l);
}

/** The minerals' colours (the rock's stain round them, and the ore itself), ready to mix. */
export const STAIN = Object.values(MINERALS).map((m) => new THREE.Color(m.stain));
export const ORE = Object.values(MINERALS).map((m) => new THREE.Color(m.ore));
export const METAL = new Set<number>([2, 3, 5, 7]);
export const HOLE = new THREE.Color('#0d0b0a');
export const COAL_LUMP = new THREE.Color('#4a4850');
/** Rock just broken: raw, pale, unstained. */
export const FRESH = new THREE.Color('#a9a59f');
