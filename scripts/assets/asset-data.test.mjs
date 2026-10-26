import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { assetRecord, gltfUris, readPins } from './asset-data.mjs';

test('asset metadata requires an object', () => {
  for (const value of [null, [], 'metadata', 1]) assert.throws(() => assetRecord(value, 'fixture'));
  assert.deepEqual(assetRecord({ name: 'mesh' }, 'fixture'), { name: 'mesh' });
});

test('SHA pin manifests preserve exact names and reject invalid hash values', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'td-asset-pins-'));
  const file = path.join(folder, 'pins.json');
  try {
    assert.equal(readPins(file).size, 0);
    const hash = 'a'.repeat(64);
    writeFileSync(file, JSON.stringify({ 'mesh.gltf': hash, ['__proto__']: hash }));
    assert.deepEqual(
      [...readPins(file)],
      [
        ['mesh.gltf', hash],
        ['__proto__', hash],
      ],
    );
    for (const value of [{ mesh: 42 }, { mesh: 'short' }, [], null]) {
      writeFileSync(file, JSON.stringify(value));
      assert.throws(() => readPins(file));
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('glTF URI extraction preserves external and embedded references', () => {
  assert.deepEqual(
    gltfUris(
      {
        buffers: [{ uri: 'mesh.bin' }],
        images: [{ uri: 'texture.png' }, {}, { uri: 'data:image/png;base64,AAAA' }],
      },
      'fixture',
    ),
    ['mesh.bin', 'texture.png', 'data:image/png;base64,AAAA'],
  );
  assert.deepEqual(gltfUris({}, 'fixture'), []);
});

test('glTF URI extraction rejects malformed arrays, entries and URI values', () => {
  for (const value of [
    null,
    [],
    { buffers: {} },
    { images: 'texture.png' },
    { buffers: [null] },
    { images: [{ uri: 42 }] },
  ]) {
    assert.throws(() => gltfUris(value, 'fixture'));
  }
});
