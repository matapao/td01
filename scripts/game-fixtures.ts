/** Require the initial actor at fixture setup, before tests exercise its gameplay. */
import assert from 'node:assert/strict';
import type { Sim } from '../src/game/sim.ts';
import type { Hero } from '../src/game/entity-types.ts';

export function fixtureHero(sim: Sim): Hero {
  const hero = sim.state.heroes[0];
  assert(hero, 'This test fixture requires an initial hero');
  return hero;
}

/** Fail fixture setup clearly when its expected element is absent. */
export function fixtureValue<T>(value: T | undefined, label: string): T {
  assert(value !== undefined, `Missing fixture value: ${label}`);
  return value;
}
