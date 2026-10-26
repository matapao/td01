import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { geometryAttribute } from '../src/view/geometry-attributes.ts';
import { weaponProps } from '../src/view/characters.ts';

test('mesh painters reject missing imported attributes before touching vertex buffers', () => {
  const geometry = new BufferGeometry();
  const positions = new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3);
  geometry.setAttribute('position', positions);
  assert.equal(geometryAttribute(geometry, 'position'), positions);
  assert.throws(() => geometryAttribute(geometry, 'normal'), /missing its normal attribute/);
  assert.equal(positions.count, 3);
  geometry.dispose();
});

test('weapon props keep a main hand at clamped tier bounds and reject an invalid tier', () => {
  for (const cls of ['tank', 'support', 'magic'] as const) {
    const first = weaponProps(cls, 0);
    assert.deepEqual(weaponProps(cls, -1), first);
    const last = weaponProps(cls, 999);
    assert.equal(first[0].hand, 'r');
    assert.equal(last[0].hand, 'r');
    assert.ok(first[0].model.length > 0);
    assert.ok(last[0].model.length > 0);
    assert.throws(() => weaponProps(cls, Number.NaN), /Missing weapon tier/);
  }
});
