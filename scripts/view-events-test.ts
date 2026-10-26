import { fixtureHero } from './game-fixtures.ts';
import { test } from 'node:test';
/** View event handoffs retain shared collections and never change authoritative gameplay. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Sim } from '../src/game/sim.ts';
import { snapshot } from '../src/game/save.ts';
import type { ViewCtx } from '../src/view/entity/context.ts';
import type { EntityEventState } from '../src/view/entity/event-state.ts';
import type { EnemyView } from '../src/view/entity/enemy.ts';
import type { HeroView } from '../src/view/entity/hero.ts';
import type { DropView } from '../src/view/entity/drop.ts';
import { hookEnemyEvents } from '../src/view/entity/enemy-events.ts';
import { hookLootEvents } from '../src/view/entity/loot-events.ts';
import { hookMiningEvents } from '../src/view/entity/mining-events.ts';

test('view events', async () => {
  const sim = new Sim(),
    hero = fixtureHero(sim);
  const calls: string[] = [];
  // Deliberately minimal animation/VFX doubles: no WebGL, textures or asset loading in these contracts.
  const ctx = {
    sim,
    fx: { burst() {}, ring() {}, text() {}, glow() {} },
    shake() {},
  } as unknown as ViewCtx;
  const heroes = new Map<number, HeroView>([
    [
      hero.id,
      {
        pos: new THREE.Vector3(1, 2, 3),
        gesture: () => calls.push('gesture'),
        strike: () => true,
        terrainStrike: () => calls.push('terrain'),
      } as unknown as HeroView,
    ],
  ]);
  const state: Pick<EntityEventState, 'enemies' | 'raisedFrom' | 'byCorpse' | 'dying'> = {
    enemies: new Map(),
    raisedFrom: new Set(),
    byCorpse: new Map(),
    dying: [],
  };
  hookEnemyEvents(ctx, state);
  const deadView = (tag: string) =>
    ({
      ch: { root: new THREE.Group(), spec: {} },
      die: () => calls.push('die:' + tag),
      dispose: () => calls.push('dispose:' + tag),
    }) as unknown as EnemyView;
  const first = deadView('first'),
    second = deadView('second');
  state.enemies.set(101, first);
  state.enemies.set(102, second);
  const before = snapshot(sim);
  for (const id of [101, 102])
    sim.emit('enemyDied', { id, kind: 'minion', x: 0, z: 0, gold: 0, by: hero.id, corpse: id + 100 });
  assert.equal(state.enemies.size, 0);
  assert.deepEqual(state.dying, [first, second]);
  const sharedDying = state.dying;
  sim.emit('corpseRaised', { corpse: 201, enemy: 301 });
  assert.equal(state.dying, sharedDying, 'resurrection preserves the array owned by the frame coordinator');
  assert.deepEqual(state.dying, [second], 'raising one corpse cannot remove another death animation');
  assert(!state.byCorpse.has(201));
  sim.emit('corpseRaised', { corpse: 201, enemy: 301 });
  assert.deepEqual(state.dying, [second], 'repeated/missing-corpse events leave other views intact');
  assert.deepEqual(calls, ['die:first', 'die:second', 'dispose:first']);

  const drops = new Map<number, DropView>(),
    collecting: DropView[] = [];
  const pendingDrops = new Map<number, { fromX: number; fromZ: number }>();
  hookLootEvents(ctx, { heroes, drops, collecting, pendingDrops, spawnPorter() {}, keeper: () => undefined });
  const drop = {
    collect: (to: THREE.Vector3) => {
      assert.deepEqual(to.toArray(), [1, 2, 3]);
      calls.push('collect');
    },
  } as unknown as DropView;
  drops.set(401, drop);
  sim.emit('dropSpawned', { id: 401, item: 'stone', amount: 1, inst: null, x: 2, z: 3, fromX: 4, fromZ: 5 });
  assert.deepEqual(pendingDrops.get(401), { fromX: 4, fromZ: 5 });
  sim.emit('pickedUp', { hero: hero.id, drop: 401, item: 'stone', amount: 1, inst: null, x: 2, z: 3 });
  assert.equal(drops.size, 0);
  assert.deepEqual(collecting, [drop], 'pickup transfers the same drop view into its collection animation');

  hookMiningEvents(ctx, { heroes });
  hero.earthAt = sim.state.time + 1;
  const withContact = snapshot(sim);
  sim.emit('earthHit', {
    hero: hero.id,
    x: 1,
    y: 0.8,
    z: 2,
    r: 0.1,
    soil: false,
    mineral: 0,
    item: 'stone',
    volume: 0.004,
  });
  assert(calls.includes('terrain'), 'precise impact reaches the hero animation after the module split');
  assert.deepEqual(snapshot(sim), withContact, 'presentation events cannot award resources or carve terrain');
  delete hero.earthAt;
  assert.deepEqual(
    snapshot(sim),
    before,
    'death and loot animation bookkeeping never changes simulation state',
  );
  console.log(
    'PASS: corpse lifecycle, shared collection identity, pickup handoff, exact hit animation and simulation isolation',
  );
});
