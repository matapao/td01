import * as THREE from 'three';
import { buildTile, type TileOut } from '../mine-tile.ts';
import { Bed, type Lamp } from '../mine-paint.ts';
import { rockMaterial } from '../mine-materials.ts';
import { mineNow, digCenter, type Mine, type MineLayout } from '../../game/mines.ts';
/** Size of the rock tiles, in world units. */
const TILE = 10;
interface Tile {
  i0: number;
  j0: number;
  /** Its box in the world (for what's changed). */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  rock: THREE.Mesh | null;
  gems: THREE.Mesh | null;
  glows: TileOut['glows'];
  dirty: boolean;
}

/** Dirty rock tiles, strike dents and replacement geometry; materials remain shared across tiles. */
export class MineRock {
  private tiles: Tile[] = [];
  private rockMat = rockMaterial();
  private gemMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  private beds: Bed | null = null;
  private mine: Mine | null = null;
  private version = -1;
  private strikes = new Map<number, number>();
  private L: MineLayout;
  private group: THREE.Group;
  private lamps: Lamp[];
  private glowsChanged: () => void;
  constructor(L: MineLayout, group: THREE.Group, lamps: Lamp[], glowsChanged: () => void) {
    this.L = L;
    this.group = group;
    this.lamps = lamps;
    this.glowsChanged = glowsChanged;
    const f = this.L.field;
    const mx = Math.floor((f.nx - 1) / 2);
    const mz = Math.floor((f.nz - 1) / 2);
    const per = Math.round(TILE / (f.step * 2));
    const stepM = f.step * 2;
    for (let j0 = 0; j0 < mz; j0 += per) {
      for (let i0 = 0; i0 < mx; i0 += per) {
        this.tiles.push({
          i0,
          j0,
          x0: f.x0 + i0 * stepM,
          z0: f.z0 + j0 * stepM,
          x1: f.x0 + (i0 + per) * stepM,
          z1: f.z0 + (j0 + per) * stepM,
          rock: null,
          gems: null,
          glows: [],
          dirty: true,
        });
      }
    }
  }
  trackBeds(): Bed {
    return (this.beds ??= new Bed(this.L));
  }
  private dirtyBox(x0: number, z0: number, x1: number, z1: number): void {
    for (const t of this.tiles)
      if (t.x1 > x0 - 1 && t.x0 < x1 + 1 && t.z1 > z0 - 1 && t.z0 < z1 + 1) t.dirty = true;
  }

  sync(m: Mine | undefined): void {
    if (!m) return;
    if (m !== this.mine) {
      // Another game (a reload, a LAN world): everything again.
      this.mine = m;
      this.version = -1;
      this.strikes.clear();
      for (const t of this.tiles) t.dirty = true;
    }
    const now = mineNow(m);
    if (now.version !== this.version) {
      for (const c of now.changes) if (c.version > this.version) this.dirtyBox(c.x0, c.z0, c.x1, c.z1);
      this.version = now.version;
    }
    // Strikes: a dent that deepens with each (and is gone with the piece).
    const seen = new Set<number>();
    for (const [key, damage] of Object.entries(m.dmg)) {
      const k = Number(key);
      seen.add(k);
      if (this.strikes.get(k) === damage) continue;
      this.strikes.set(k, damage);
      const c = digCenter(k);
      this.dirtyBox(c.x - 0.5, c.z - 0.5, c.x + 0.5, c.z + 0.5);
    }
    for (const k of [...this.strikes.keys()]) {
      if (seen.has(k)) continue;
      this.strikes.delete(k);
      const c = digCenter(k);
      this.dirtyBox(c.x - 0.5, c.z - 0.5, c.x + 0.5, c.z + 0.5);
    }
  }

  private dented(m: Mine | undefined): Float32Array {
    const L = this.L;
    const f = L.field;
    const base = m ? mineNow(m).sdf : f.sdf;
    if (!m || !this.strikes.size) return base;
    const sdf = base.slice();
    for (const [k, n] of this.strikes) {
      const c = digCenter(k);
      const r = 0.2 + 0.055 * Math.min(4, n);
      for (
        let j = Math.floor((c.z - 0.8 - f.z0) / f.step);
        j <= Math.ceil((c.z + 0.8 - f.z0) / f.step);
        j++
      ) {
        for (
          let i = Math.floor((c.x - 0.8 - f.x0) / f.step);
          i <= Math.ceil((c.x + 0.8 - f.x0) / f.step);
          i++
        ) {
          if (i < 0 || j < 0 || i >= f.nx || j >= f.nz) continue;
          const fk = j * f.nx + i;
          const d = Math.hypot(f.x0 + i * f.step - c.x, f.z0 + j * f.step - c.z) - r;
          // The field owns nx * nz samples; both coordinates were checked above.
          const a = sdf[fk]!;
          const hh = Math.max(0.2 - Math.abs(a - d), 0) / 0.2;
          sdf[fk] = Math.min(a, d) - hh * hh * 0.05;
        }
      }
    }
    return sdf;
  }

  buildTiles(budget: number, m: Mine | undefined, focus?: THREE.Vector3): void {
    let sdf: Float32Array | null = null;
    const per = Math.round(TILE / (this.L.field.step * 2));
    const pending = this.tiles.filter((t) => t.dirty);
    if (focus) {
      const distance = (t: Tile) => ((t.x0 + t.x1) / 2 - focus.x) ** 2 + ((t.z0 + t.z1) / 2 - focus.z) ** 2;
      pending.sort((a, b) => distance(a) - distance(b));
    }
    const started = performance.now();
    let built = 0;
    for (const t of pending) {
      if (budget-- <= 0 || (built > 0 && performance.now() - started > 5)) return;
      built++;
      t.dirty = false;
      sdf ??= this.dented(m);
      const out = buildTile({
        L: this.L,
        m,
        struck: new Set(this.strikes.keys()),
        sdf,
        i0: t.i0,
        i1: t.i0 + per,
        j0: t.j0,
        j1: t.j0 + per,
        lamps: this.lamps,
        beds: (this.beds ??= new Bed(this.L)),
      });
      // Keep the previous geometry until its replacement has finished building.
      for (const old of [t.rock, t.gems]) {
        if (!old) continue;
        this.group.remove(old);
        old.geometry.dispose();
      }
      t.rock = out.rock ? new THREE.Mesh(out.rock, this.rockMat) : null;
      t.gems = out.gems ? new THREE.Mesh(out.gems, this.gemMat) : null;
      if (t.rock) {
        t.rock.name = 'rock';
        this.group.add(t.rock);
      }
      if (t.gems) this.group.add(t.gems);
      if (t.glows.length || out.glows.length) this.glowsChanged();
      t.glows = out.glows;
    }
  }

  pickRock(ray: THREE.Raycaster): { x: number; y: number; z: number; nx: number; nz: number } | null {
    let best: THREE.Intersection | null = null;
    for (const t of this.tiles) {
      if (!t.rock) continue;
      const hit = ray.intersectObject(t.rock, false)[0];
      if (hit && (!best || hit.distance < best.distance)) best = hit;
    }
    if (!best || !best.face) return null;
    return {
      x: best.point.x,
      y: best.point.y,
      z: best.point.z,
      nx: best.face.normal.x,
      nz: best.face.normal.z,
    };
  }
}
