/** Public crafting commands keep atomic costs, batch continuity and storage ownership. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Sim } from '../src/game/sim.ts';
import { MAP } from '../src/game/map.ts';
import { updateStations } from '../src/game/systems/craft.ts';
import { enterBuilding } from '../src/game/systems/rooms.ts';
import { fixtureHero, fixtureValue } from './game-fixtures.ts';

function anvilFixture() {
  const sim = new Sim();
  const hero = fixtureHero(sim);
  const anvil = fixtureValue(
    sim.state.buildings.find((b) => b.kind === 'anvil'),
    'workshop anvil',
  );
  enterBuilding(sim, hero, anvil);
  return { sim, hero, anvil };
}

test('reforging rejects missing costs without disturbing a running batch', () => {
  const { sim, hero, anvil } = anvilFixture();
  anvil.busy = true;
  anvil.recipe = 0;
  anvil.step = 1;
  anvil.work = 12;
  const before = structuredClone(anvil);
  sim.apply({ t: 'reforge', hero: hero.id, building: anvil.id });
  assert.deepEqual(anvil, before, 'a reserved batch ingot alone cannot pay the two-ingot weapon');
  assert.deepEqual(hero.bag, {});
  assert.equal(hero.weaponTier ?? 0, 0);
});

test('reforging pays bag then tray once and resumes the interrupted station batch', () => {
  const { sim, hero, anvil } = anvilFixture();
  hero.bag = { ingot: 1 };
  anvil.input = { ingot: 2 };
  anvil.busy = true;
  anvil.recipe = 0;
  anvil.step = 1;
  anvil.work = 12;
  sim.apply({ t: 'reforge', hero: hero.id, building: anvil.id });
  assert.equal(hero.bag.ingot ?? 0, 0);
  assert.deepEqual(
    anvil.input,
    { ingot: 2 },
    'the reserved ingot returns before one tray ingot pays the weapon',
  );
  assert.equal(anvil.forgeFor, hero.id);
  assert.deepEqual(hero.task, { k: 'work', target: anvil.id });
  const paid = structuredClone(anvil);
  sim.apply({ t: 'reforge', hero: hero.id, building: anvil.id });
  assert.deepEqual(anvil, paid, 'a second command cannot charge or restart the weapon already on this anvil');
  updateStations(sim, 4_000);
  assert.equal(hero.weaponTier, 1);
  assert.equal(anvil.forgeFor, 0);
  assert(anvil.busy, 'ordinary batch production resumes after reforging');
  assert.deepEqual(anvil.input, { ingot: 1 });
  updateStations(sim, 4_000);
  updateStations(sim, 4_000);
  assert.deepEqual(anvil.output, { gears: 4 });
  assert.deepEqual(anvil.input, {});
  assert.equal(anvil.busy, false);
  assert.equal(sim.state.stats.crafted, 2);
});

test('storage commands move only the requested parts and reject distant transfers', () => {
  const sim = new Sim();
  const hero = fixtureHero(sim);
  hero.x = MAP.storehouse.x;
  hero.z = MAP.storehouse.z;
  hero.bag = { wood: 3, stone: 2 };
  sim.apply({ t: 'deposit', hero: hero.id });
  assert.deepEqual(hero.bag, {});
  assert.deepEqual(sim.state.storage, { wood: 3, stone: 2 });
  sim.apply({ t: 'withdraw', hero: hero.id, item: 'wood', count: 2 });
  assert.deepEqual(hero.bag, { wood: 2 });
  assert.deepEqual(sim.state.storage, { wood: 1, stone: 2 });
  hero.x = MAP.minX;
  hero.z = MAP.minZ;
  sim.apply({ t: 'deposit', hero: hero.id });
  sim.apply({ t: 'withdraw', hero: hero.id, item: 'stone', count: 2 });
  assert.deepEqual(hero.bag, { wood: 2 });
  assert.deepEqual(sim.state.storage, { wood: 1, stone: 2 });
});
