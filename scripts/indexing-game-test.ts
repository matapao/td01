import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wallStep } from '../src/game/grid.ts';
import { Sim } from '../src/game/sim.ts';
import { followPath } from '../src/game/systems/hero-movement.ts';

test('wall traversal rejects missing cells instead of treating undefined heights as open ground', () => {
  const level = new Float32Array(2).fill(NaN);
  assert.equal(wallStep(level, 0, 1), true);
  assert.equal(wallStep(level, -1, 0), false);
  assert.equal(wallStep(level, 0.5, 1), false);
  assert.equal(wallStep(level, NaN, 1), false);
  assert.equal(wallStep(level, 0, level.length), false);
});

test('an incomplete legacy movement waypoint cannot make hero coordinates nonfinite', () => {
  const sim = new Sim({ seed: 42 });
  const hero = sim.state.heroes[0];
  assert.ok(hero);
  const before = { x: hero.x, z: hero.z };
  hero.path = [hero.x + 1];
  hero.pathIdx = 0;
  assert.equal(followPath(sim, hero, 1 / 60), true);
  assert.deepEqual({ x: hero.x, z: hero.z }, before);
});
