import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type Category } from './forest.ts';

/**
 * Forest Nature batches: patch size (small things in smaller patches, so the distance cut drops
 * whole patches), how far off they are still drawn (grass and pebbles vanish long before the haze),
 * and how far the tip of each model sways in the wind (m). Shrubs stand stiff: swaying foliage
 * dissolves further from the lens, and a shrub by the camera would show hollow.
 */
export const NATURE: Record<Category, { patch: number; far: number; bend: number }> = {
  tree: { patch: 64, far: Infinity, bend: 0.32 },
  rock: { patch: 64, far: Infinity, bend: 0 },
  bush: { patch: 48, far: 80, bend: 0 },
  grass: { patch: 48, far: 50, bend: 0.045 },
  pebble: { patch: 48, far: 40, bend: 0 },
};

/**
 * One mesh per material: a prop built of many little parts (an ore vein's nuggets, a scrap heap's
 * junk) costs a draw call per material instead of one per part. Only for props with no parts
 * that move on their own.
 */
export function mergeByMaterial(root: THREE.Object3D): THREE.Object3D {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const parts: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (
      !m.isMesh ||
      (m as THREE.SkinnedMesh).isSkinnedMesh ||
      (m as THREE.InstancedMesh).isInstancedMesh ||
      Array.isArray(m.material) ||
      !m.visible
    )
      return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.morphAttributes = {};
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const key = `${m.material.uuid}|${Object.keys(g.attributes).sort().join(',')}`;
    let e = groups.get(key);
    if (!e) groups.set(key, (e = { mat: m.material, geos: [] }));
    e.geos.push(g);
    parts.push(m);
  });
  if (parts.length < 3) return root;
  const out = new THREE.Group();
  for (const { mat, geos } of groups.values()) {
    const merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    if (merged) out.add(new THREE.Mesh(merged, mat));
  }
  return out;
}
