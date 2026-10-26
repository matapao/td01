import { fixtureHero } from './game-fixtures.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/game/sim.ts';
import { atFabricator, deploymentBlocker, oversightSpot } from '../src/game/towerwork.ts';
import { benchOf, enterBuilding } from '../src/game/systems/rooms.ts';
import { WALL, cellOf } from '../src/game/map.ts';
import { snapshot, restore } from '../src/game/save.ts';
import { workTick, applyBeat } from '../src/game/systems/craft.ts';
import { DeltaTracker, applyDelta, PLAYER_COMMANDS } from '../src/net/protocol.ts';

test('first loop', async () => {
  const sim = new Sim(),
    h = fixtureHero(sim);
  for (let i = 0; i < 4000; i++) sim.step();
  assert.equal(sim.state.wave, 0, 'first attack waits for a deployed tower, however long preparation takes');
  assert(PLAYER_COMMANDS.has('queueTower') && PLAYER_COMMANDS.has('shipTower'));
  h.tools = ['hammer'];
  h.bag = { wood: 4, stone: 4 };
  sim.apply({ t: 'queueTower', hero: h.id });
  assert.equal(sim.state.towerCrates!.length, 0, 'no remote fabrication');
  const workshop = sim.state.buildings.find((b) => b.kind === 'anvil')!;
  enterBuilding(sim, h, workshop);
  Object.assign(h, benchOf(workshop)!);
  h.px = h.x;
  h.pz = h.z;
  assert(atFabricator(sim, h));
  sim.apply({ t: 'queueTower', hero: h.id });
  assert.equal(h.bag.wood ?? 0, 0);
  assert.equal(h.bag.stone ?? 0, 0);
  const crate = sim.state.towerCrates![0];
  assert(crate);
  sim.apply({ t: 'queueTower', hero: h.id });
  assert.equal(sim.state.towerCrates!.length, 1, 'one active platform job');
  for (let i = 0; i < 5; i++) {
    sim.apply({ t: 'hammerTower', hero: h.id, crate: crate.id });
    sim.apply({ t: 'hammerTower', hero: h.id, crate: crate.id });
    for (let j = 0; j < 11; j++) sim.step();
  }
  assert(crate.ready && crate.work === 100);
  assert.equal(
    sim.state.buildings.filter((b) => b.kind === 'tower').length,
    0,
    'assembled kits stay in storage',
  );
  let dest: { cx: number; cz: number } | undefined;
  for (let x = WALL.x + 6; x < WALL.x + 25 && !dest; x += 1)
    for (let z = -14; z < 14; z += 1) {
      const c = cellOf(x, z);
      if (!deploymentBlocker(sim, c.cx, c.cz)) {
        dest = c;
        break;
      }
    }
  assert(dest, 'starter field has valid deployment positions');
  sim.apply({ t: 'shipTower', hero: h.id, crate: crate.id, ...dest });
  assert(!crate.shipment, 'deployment requires the oversight post');
  Object.assign(h, oversightSpot());
  h.px = h.x;
  h.pz = h.z;
  sim.apply({ t: 'shipTower', hero: h.id, crate: crate.id, ...dest });
  assert(crate.shipment);
  const activeShipment = sim.state.towerCrates!.find((c) => c.id === crate.id)!.shipment!;
  const site = sim.getAs(activeShipment.site, 'site')!;
  assert(site.delivery);
  sim.apply({ t: 'shipTower', hero: h.id, crate: crate.id, ...dest });
  assert.equal(
    sim.state.sites.filter((s) => s.plan === 'tower').length,
    1,
    'repeated confirmation cannot duplicate shipment',
  );
  h.task = { k: 'work', target: site.id };
  assert.equal(workTick(sim, h, site.id, 1), false);
  applyBeat(sim, h, 2);
  assert.equal(
    sim.state.buildings.filter((b) => b.kind === 'tower').length,
    0,
    'a reserved delivery cannot be completed by ordinary site work',
  );
  const copy = new Sim();
  restore(copy, snapshot(sim));
  const tracker = new DeltaTracker(sim.state),
    mirror = new Sim();
  restore(mirror, snapshot(sim));
  for (let i = 0; i < 800 && sim.state.firstTowerAt < 0; i++) sim.step();
  assert(sim.state.firstTowerAt >= 0);
  assert.equal(sim.state.buildings.filter((b) => b.kind === 'tower').length, 1);
  assert.equal(sim.state.towerCrates!.length, 0);
  assert(sim.state.nextWaveAt > sim.state.time);
  applyDelta(mirror, structuredClone(tracker.diff(sim.state)));
  assert.equal(mirror.state.towerCrates!.length, 0);
  assert.equal(mirror.state.buildings.filter((b) => b.kind === 'tower').length, 1);
  for (let i = 0; i < 800 && copy.state.firstTowerAt < 0; i++) copy.step();
  assert.equal(
    copy.state.buildings.filter((b) => b.kind === 'tower').length,
    1,
    'mid-shipment save resumes exactly once',
  );
  const tower = sim.state.buildings.find((b) => b.kind === 'tower')!;
  assert.deepEqual(cellOf(tower.x, tower.z), dest);
  assert(tower.stats && tower.stats.range > 0, 'delivered tower is functional');
  console.log(
    'PASS: first-wave hold, physical fabrication, atomic materials, paced assembly, stored kit, deployment validation, reserved cells, duplicate protection, functional delivery, save and LAN continuity',
  );
});
