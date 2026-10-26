/** Seeded enchantment output must survive stricter indexing and contract extraction. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RNG } from '../src/core/rng.ts';
import { rollItem } from '../src/game/loot.ts';

test('enchanted, rare and legendary loot retain their pre-migration output and random stream', () => {
  const rng = new RNG(82);
  const actual = [rollItem(rng, 1, 1, 1, 'gears'), rollItem(rng, 2, 3, 2, 'crystal'), rollItem(rng, 3, 5, 3)];
  assert.deepEqual(actual, [
    {
      uid: 1,
      base: 'gears',
      rarity: 1,
      ilvl: 1,
      affixes: [{ id: 'gilded', v: 18 }],
      name: 'Gilded Clockwork',
    },
    {
      uid: 2,
      base: 'crystal',
      rarity: 2,
      ilvl: 3,
      affixes: [
        { id: 'storm', v: 1 },
        { id: 'arcane', v: 10 },
        { id: 'reach', v: 1.3 },
      ],
      name: 'Thornward Prism',
    },
    {
      uid: 3,
      base: 'planks',
      rarity: 3,
      ilvl: 5,
      affixes: [
        { id: 'reach', v: 3 },
        { id: 'gilded', v: 50 },
        { id: 'bounty', v: 50 },
      ],
      name: 'Quartermaster’s Beam',
    },
  ]);
  assert.equal(rng.state, 4167084984);
});

test('an unsupported enchantment base reports a configuration error instead of indexing absent affixes', () => {
  assert.throws(() => rollItem(new RNG(82), 1, 1, 1, 'wood'), /No affixes configured for wood/);
});
