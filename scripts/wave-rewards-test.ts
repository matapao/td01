import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ECONOMY } from '../src/game/content.ts';
import { MAP } from '../src/game/map.ts';
import { Sim } from '../src/game/sim.ts';
import { WAVES } from '../src/game/waves.ts';

function clearedWaveFixture(): Sim {
  const sim = new Sim({ seed: 37 });
  sim.state.phase = 'waves';
  sim.state.wave = 10;
  sim.state.nextWaveAt = -1;
  sim.state.spawns = [];
  sim.state.waveCleared = WAVES.map((_, index) => index < 9);
  for (const enemy of sim.state.enemies) sim.remove(enemy.id);
  sim.compactNow();
  return sim;
}

test('clearing a wave pays gold once and drops only its non-gold reward', () => {
  // Wave ten has both an immediate gold reward and one collectible rune.
  const sim = clearedWaveFixture();
  const control = clearedWaveFixture();
  control.state.waveCleared[9] = true;
  const goldBefore = sim.state.gold;
  const bonus = ECONOMY.waveBonusBase + ECONOMY.waveBonusPerWave * 9;
  const goldPayments: number[] = [];
  const cleared: number[] = [];
  sim.events.on('gold', (event) => goldPayments.push(event.amount));
  sim.events.on('waveCleared', (event) => cleared.push(event.wave));

  sim.step();
  control.step();
  // The control receives the intended physical reward through the public drop boundary.
  // Its stream and next ID must match: paying gold must not create random coin piles first.
  control.spawnDrop('rune', MAP.storehouse.x, MAP.storehouse.z + 3.6);

  assert.deepEqual(goldPayments, [bonus, 80]);
  assert.equal(sim.state.gold, goldBefore + bonus + 80);
  assert.deepEqual(cleared, [10]);
  assert.equal(sim.state.drops.filter((drop) => drop.item === 'gold').length, 0);
  assert.deepEqual(sim.state.drops, control.state.drops);
  assert.equal(sim.rng.state, control.rng.state, 'only the rune consumes the seeded drop stream');
  assert.equal(sim.state.nextId, control.state.nextId, 'only the rune reserves a reward entity ID');

  sim.step();
  assert.equal(sim.state.gold, goldBefore + bonus + 80, 'a cleared wave cannot pay again');
  assert.deepEqual(goldPayments, [bonus, 80]);
  assert.deepEqual(cleared, [10]);
});
