import { geometryAttribute } from './geometry-attributes.ts';
/**
 * The KayKit Forest Nature kit (CC0, Kay Lousberg): the vale's trees, bushes, rocks and grass tufts.
 * It streams in after the world is already on screen (never a loading screen); the generated trees
 * of treegen.ts stand in until it lands, and stay if it can't be had.
 *
 * Every model ships in eight colour palettes that differ only in the column of the shared 1024²
 * texture their UVs point at (row 1 leaves, row 2 bark, row 3 stone; one 128 px column per
 * palette). So only the first palette's models are used, and each instance picks its own column
 * per row in the shader (`aPal`): a wood of mixed greens and autumn colours costs one draw call per
 * model, and every palette comes free — nothing more to download.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { patchMaterial, toLambert } from './assets.ts';

/** Texture columns (the kit's palettes 1–8), for the leaves row. */
export const LEAF = {
  green: 0,
  emerald: 1,
  lime: 2,
  teal: 3,
  golden: 4,
  orange: 5,
  red: 6,
  pink: 7,
} as const;
/**
 * Bark row: 0 orange-brown (the kit's summer trunks), 1 brown, 2 light brown, 3 dark brown,
 * 5 pale grey-beige (birch-white), 7 pale tan; 13 reads the stone row's dark grey (ashen, dead wood).
 */
export const BARK = { orange: 0, brown: 1, light: 2, dark: 3, pale: 5, tan: 7, ash: 13 } as const;
/** Stone row: 0 grey, 2 beige-grey, 3 blue-grey, 4 sandstone, 5 dark brown-grey. */
export const STONE = { grey: 0, beige: 2, blue: 3, sand: 4, dark: 5 } as const;

/** Which column each texture row reads (leaves, bark, stone). */
export type Palette = readonly [leaf: number, bark: number, stone: number];

export interface NatureModel {
  name: string;
  geometry: THREE.BufferGeometry;
  /** Top and bottom (model units; the ground is y = 0). */
  height: number;
  bottom: number;
  /** Trees: the trunk's reach from the origin just above the ground. Others: their footprint's. */
  trunk: number;
  /** How far the leaves (or the whole model) reach out from the origin. */
  reach: number;
}

const ROW = 0.25;

/**
 * Where a model's triangles (of one texture row, or all for -1) cross the level y: the farthest
 * point from the origin, and the mean distance (which a few loose pebbles round a rock don't sway).
 */
function slice(
  pos: THREE.BufferAttribute,
  uv: THREE.BufferAttribute,
  index: ArrayLike<number> | null,
  y: number,
  row: number,
): { max: number; mean: number } {
  let max = 0;
  let sum = 0;
  let count = 0;
  const n = index ? index.length : pos.count;
  const at = (i: number) => (index ? index[i]! : i);
  for (let t = 0; t + 2 < n; t += 3) {
    if (row >= 0 && Math.floor(uv.getY(at(t)) / ROW) !== row) continue;
    for (let k = 0; k < 3; k++) {
      const a = at(t + k);
      const b = at(t + ((k + 1) % 3));
      const ya = pos.getY(a) - y;
      const yb = pos.getY(b) - y;
      if (ya * yb >= 0) continue;
      const f = ya / (ya - yb);
      const d = Math.hypot(
        pos.getX(a) + (pos.getX(b) - pos.getX(a)) * f,
        pos.getZ(a) + (pos.getZ(b) - pos.getZ(a)) * f,
      );
      max = Math.max(max, d);
      sum += d;
      count++;
    }
  }
  return { max, mean: count ? sum / count : 0 };
}

function measure(name: string, geometry: THREE.BufferGeometry): NatureModel {
  const pos = geometryAttribute(geometry, 'position') as THREE.BufferAttribute;
  const uv = geometryAttribute(geometry, 'uv') as THREE.BufferAttribute;
  const index = geometry.index ? geometry.index.array : null;
  let height = -Infinity;
  let bottom = Infinity;
  let reach = 0;
  const tree = name.startsWith('Tree');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    height = Math.max(height, y);
    bottom = Math.min(bottom, y);
    // A tree's reach is its crown's (row 0: leaves); bare trees reach as far as their branches.
    if (!tree || Math.floor(uv.getY(i) / ROW) === 0 || name.startsWith('Tree_Bare'))
      reach = Math.max(reach, Math.hypot(pos.getX(i), pos.getZ(i)));
  }
  // The trunk where you'd touch it (row 1: bark); rocks and bushes where they meet the ground.
  const trunk = tree
    ? slice(pos, uv, index, 0.3, 1).max || slice(pos, uv, index, 0.3, -1).max
    : slice(pos, uv, index, Math.max(0, bottom) + 0.05, -1).mean;
  return { name, geometry, height, bottom, trunk, reach };
}

/**
 * A cut stump for any tree: a short flared log in the bark row (scaled per tree to its trunk, coloured
 * with its bark), its cut face the light end of the bark's gradient.
 */
function stumpGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.86, 1, 1, 10, 1).toNonIndexed();
  g.translate(0, 0.5, 0);
  const pos = geometryAttribute(g, 'position');
  const nor = geometryAttribute(g, 'normal');
  const uv = geometryAttribute(g, 'uv');
  for (let i = 0; i < pos.count; i++) {
    const cap = Math.abs(nor.getY(i)) > 0.9;
    // Columns are flat across, graded down: only v matters (u stays inside column 0).
    uv.setXY(i, 0.06, cap ? 0.27 : pos.getY(i) > 0.5 ? 0.31 : 0.46);
  }
  return g;
}

export class NatureKit {
  readonly models = new Map<string, NatureModel>();
  readonly stump: NatureModel;
  private base: THREE.Material;
  private mats = new Map<string, THREE.Material>();

  constructor(scene: THREE.Object3D) {
    scene.updateMatrixWorld(true);
    let base: THREE.Material | null = null;
    for (const root of scene.children) {
      // Only the first palette: the others are the same models with their UVs one column over.
      if (!root.name.endsWith('_Color1')) continue;
      const name = root.name.replace(/_Color1$/, '').replace(/_Singlesided$/, '');
      const inv = root.matrixWorld.clone().invert();
      const parts: THREE.BufferGeometry[] = [];
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        base ??= toLambert(m.material as THREE.Material);
        const g = m.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
        for (const k of Object.keys(g.attributes))
          if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
        parts.push(g);
      });
      if (!parts.length) continue;
      const geometry = parts[0]!; // Nonempty parts checked above.
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      this.models.set(name, measure(name, geometry));
    }
    if (!base) throw new Error('nature kit has no models');
    this.base = base;
    const sg = stumpGeometry();
    sg.computeBoundingSphere();
    this.stump = { name: 'stump', geometry: sg, height: 1, bottom: 0, trunk: 1, reach: 1 };
  }

  get(name: string): NatureModel {
    const m = this.models.get(name);
    if (!m) throw new Error(`no nature model ${name}`);
    return m;
  }

  /**
   * The kit's one material with the world patch (painted finish, haze, near dissolve, `sway` for
   * leaves), reading each instance's palette. Grass blades are single sheets: drawn from both sides.
   */
  material(sway: number, double = false): THREE.Material {
    const key = `${sway.toFixed(5)}|${double}`;
    let m = this.mats.get(key);
    if (m) return m;
    const mat = patchMaterial(this.base.clone(), { sway });
    if (double) mat.side = THREE.DoubleSide;
    const world = mat.onBeforeCompile.bind(mat);
    mat.onBeforeCompile = (shader, renderer) => {
      world(shader, renderer);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aPal;')
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
           #ifdef USE_MAP
           {
             // This instance's palette: one column over per palette, chosen per row (8 and up:
             // the row below's column, e.g. bark the colour of stone).
             float row = vMapUv.y;
             float col = row < 0.25 ? aPal.x : row < 0.5 ? aPal.y : aPal.z;
             if (col > 7.5) {
               col -= 8.0;
               vMapUv.y += 0.25;
             }
             vMapUv.x += col * 0.125;
           }
           #endif`,
        );
    };
    const worldKey = mat.customProgramCacheKey();
    mat.customProgramCacheKey = () => `${worldKey}nat`;
    this.mats.set(key, (m = mat));
    return m;
  }
}

let pending: Promise<NatureKit | null> | null = null;

/** Fetches the kit once, in the background; null if it can't be had (the generated trees stay). */
export function loadNature(): Promise<NatureKit | null> {
  pending ??= new GLTFLoader()
    .loadAsync('assets/kits/nature.glb')
    .then((g) => new NatureKit(g.scene))
    .catch((e) => {
      console.warn('nature kit failed to load', e);
      return null;
    });
  return pending;
}
