import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RNG } from '../src/core/rng.ts';
import { Noise2D } from '../src/core/noise.ts';

test('random selection rejects an empty collection without advancing the seeded stream', () => {
  const rng = new RNG(123);
  const before = rng.state;
  assert.throws(() => rng.pick([]), RangeError);
  assert.equal(rng.state, before);
  assert.equal(rng.next(), 0.7872516233474016);
  assert.equal(rng.pick(['only']), 'only');
});

test('strict permutation indexing preserves seeded noise across negative coordinates and wrap boundaries', () => {
  const noise = new Noise2D(123);
  assert.deepEqual(
    (
      [
        [0, 0],
        [0.25, 0.75],
        [-10.2, 7.3],
        [255.5, 256.2],
      ] as const
    ).map(([x, y]) => noise.noise(x, y)),
    [0, 0.3400618824832247, -0.5366794784252706, -0.5478285966643694],
  );
});
