import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Assets } from '../src/view/assets.ts';
import { Batch, ironMaterial } from '../src/view/mine/batch.ts';

test('mine batches retain kit resource ownership while updating bounded instances', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({ color: '#806040' });
  let disposed = 0;
  geometry.addEventListener('dispose', () => disposed++);
  material.addEventListener('dispose', () => disposed++);
  const assets = new Assets();
  assets.parts = () => [{ geometry, material, matrix: new THREE.Matrix4().makeTranslation(0, 2, 0) }];
  const group = new THREE.Group();
  const batch = new Batch(assets, 'bits', 'train_tender_empty', 1, group);
  const mesh = batch.meshes[0];
  assert(mesh);
  assert.equal(group.children[0], mesh);
  assert.equal(mesh.geometry, geometry);
  assert.equal(mesh.material, material);
  const transform = new THREE.Matrix4();
  const color = new THREE.Color();
  assert.equal(
    batch.add(new THREE.Matrix4().makeTranslation(3, 0, 4), 0.5, new THREE.Color(1, 0.5, 0.25)),
    0,
  );
  mesh.getMatrixAt(0, transform);
  assert.deepEqual(transform.elements, new THREE.Matrix4().makeTranslation(3, 2, 4).elements);
  mesh.getColorAt(0, color);
  assert.deepEqual(color.toArray(), [0.5, 0.25, 0.125]);
  assert.equal(batch.add(new THREE.Matrix4()), -1);
  assert.equal(mesh.count, 1);
  batch.hide(0);
  mesh.getMatrixAt(0, transform);
  assert.deepEqual(new THREE.Vector3().setFromMatrixScale(transform).toArray(), [0, 0, 0]);
  batch.set(0, new THREE.Matrix4().makeTranslation(1, 0, -2));
  batch.done();
  mesh.getMatrixAt(0, transform);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(transform).toArray(), [1, 2, -2]);
  assert.equal(disposed, 0, 'hiding and updating copies cannot dispose kit-owned resources');
  geometry.dispose();
  material.dispose();
  assert.equal(disposed, 2);
});

test('mine wagon iron materials reuse a source-specific clone without changing the kit material', () => {
  const source = new THREE.MeshLambertMaterial({ color: '#957654' });
  source.onBeforeCompile = (shader) => {
    shader.fragmentShader = `// source patch\n${shader.fragmentShader}`;
  };
  const sourceShader = source.onBeforeCompile;
  const iron = ironMaterial(source);
  assert.notEqual(iron, source);
  assert.equal(ironMaterial(source), iron);
  assert.equal(source.color.getHexString(), '957654');
  assert.equal(source.onBeforeCompile, sourceShader);
  assert.notEqual(iron.onBeforeCompile, sourceShader);
  assert.equal(iron.customProgramCacheKey().endsWith('iron'), true);
  iron.dispose();
  source.dispose();
});
