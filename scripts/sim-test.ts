import { fixtureHero } from './game-fixtures.ts';
import { test } from 'node:test';
/** Current-game integration: deterministic commands, real fabrication/delivery, saves and waves. */
import assert from 'node:assert/strict';
import { Sim } from '../src/game/sim.ts';
import { snapshot, restore } from '../src/game/save.ts';
import { benchOf, enterBuilding } from '../src/game/systems/rooms.ts';
import { atFabricator, deploymentBlocker, oversightSpot } from '../src/game/towerwork.ts';
import { cellOf, WALL } from '../src/game/map.ts';
import { earth } from '../src/game/excavation.ts';
import { MINE_AT } from '../src/game/mines.ts';

test('sim', async () => {
  function run(seed: number): Sim {
    const sim = new Sim({ seed }),
      h = fixtureHero(sim);
    assert.equal(sim.world.bridges.length, 0);
    for (let i = 0; i < 100; i++) sim.step();
    assert.equal(sim.state.wave, 0, 'first tower holds the attack');
    h.tools = ['hammer'];
    h.bag = { wood: 4, stone: 4 };
    const shop = sim.state.buildings.find((b) => b.kind === 'anvil')!;
    enterBuilding(sim, h, shop);
    Object.assign(h, benchOf(shop));
    h.px = h.x;
    h.pz = h.z;
    assert(atFabricator(sim, h));
    sim.apply({ t: 'queueTower', hero: h.id });
    const crate = sim.state.towerCrates![0];
    assert(crate);
    for (let i = 0; i < 5; i++) {
      sim.apply({ t: 'hammerTower', hero: h.id, crate: crate.id });
      for (let n = 0; n < 10; n++) sim.step();
    }
    Object.assign(h, oversightSpot());
    h.px = h.x;
    h.pz = h.z;
    let destination: { cx: number; cz: number } | undefined;
    for (let x = WALL.x + 6; x < WALL.x + 25 && !destination; x++)
      for (let z = -14; z < 14; z++) {
        const p = cellOf(x, z);
        if (!deploymentBlocker(sim, p.cx, p.cz)) {
          destination = p;
          break;
        }
      }
    assert(destination);
    sim.apply({ t: 'shipTower', hero: h.id, crate: crate.id, ...destination });
    for (let i = 0; i < 3000 && sim.state.phase !== 'lost' && sim.state.phase !== 'won'; i++) sim.step();
    assert(sim.state.firstTowerAt >= 0);
    assert(sim.state.wave >= 1);
    assert.equal(sim.state.towerCrates!.length, 0);
    for (const entities of [sim.state.heroes, sim.state.enemies, sim.state.buildings])
      for (const e of entities)
        assert([e.x, e.z, e.hp].every(Number.isFinite), 'simulation positions and health stay finite');
    return sim;
  }
  const a = run(7),
    b = run(7);
  assert.equal(a.hash(), b.hash(), 'same actions and seed yield the same state');
  const copy = new Sim({ seed: 7 });
  restore(copy, snapshot(a));
  assert.equal(copy.hash(), a.hash(), 'restore is exact');
  for (let i = 0; i < 400; i++) {
    a.step();
    copy.step();
  }
  assert.equal(a.hash(), copy.hash(), 'restored simulation continues identically');
  // Overlapping underground actors previously produced a zero-length sight ray.
  const underground = new Sim(),
    h = fixtureHero(underground),
    e = underground.state.enemies.find((e) => e.camp)!;
  h.x = h.px = e.x;
  h.z = h.pz = e.z;
  for (let i = 0; i < 100; i++) underground.step();
  assert([h.x, h.z, e.x, e.z].every(Number.isFinite));
  assert(earth(underground).density(MINE_AT.x, 1, MINE_AT.z) < 0);
  console.log(
    'PASS: current first-tower loop, deterministic replay, exact saves, active waves and finite overlapping mine actors',
  );
});
