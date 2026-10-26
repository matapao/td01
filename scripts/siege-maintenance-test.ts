import { fixtureHero, fixtureValue } from './game-fixtures.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/game/sim.ts';
import { betweenWaves, horseOf, REPAIR_BREAK } from '../src/game/maintenance.ts';
import { GATE, MAP, lanePos } from '../src/game/map.ts';
import { bodyFree, heroSpeed, approach, inReachOf } from '../src/game/systems/heroes.ts';
import { spawnEnemy, updateEnemies } from '../src/game/systems/enemies.ts';
import { snapshot, restore } from '../src/game/save.ts';
import { SPECS, specHeight } from '../src/view/characters.ts';
import { WAVES } from '../src/game/waves.ts';
import { PLAYER_COMMANDS } from '../src/net/protocol.ts';

test('siege maintenance', async () => {
  const sim = new Sim(),
    h = fixtureHero(sim);
  assert(betweenWaves(sim));
  assert(PLAYER_COMMANDS.has('mount'));
  for (const kind of new Set(WAVES.flatMap((w) => w.groups.map((g) => g.kind))))
    assert(specHeight(SPECS[kind]) >= specHeight(SPECS.heroTank), `${kind} must be at least human height`);
  assert.equal(SPECS.minion.model, 'Skeleton_Warrior');
  const horse = horseOf(h);
  h.x = h.px = horse.x;
  h.z = h.pz = horse.z;
  assert(bodyFree(sim, h.x, h.z), 'horse can be approached');
  const pace = heroSpeed(sim, h);
  sim.apply({ t: 'mount', hero: h.id });
  assert(horse.riding);
  assert(heroSpeed(sim, h) > pace * 2);
  h.x += 1;
  sim.apply({ t: 'mount', hero: h.id });
  assert(!horse.riding);
  assert.equal(horse.x, h.x);
  assert(bodyFree(sim, GATE.x, 0), 'gate passage opens for maintenance');
  assert(bodyFree(sim, GATE.x + 5, 0), 'field is accessible between waves');
  assert(sim.pf.find(MAP.heroStart.x, MAP.heroStart.z, GATE.x + 5, 0), 'auto-walking can pass the open gate');
  const resumed = new Sim();
  restore(resumed, snapshot(sim));
  assert.deepEqual(fixtureHero(resumed).horse, horse);
  // A damaged field tower is approached and repaired in person with a hammer and gathered wood.
  const tower = {
    ...structuredClone(fixtureValue(sim.state.buildings[0], 'starter building')),
    id: sim.newId(),
    kind: 'tower' as const,
    x: GATE.x + 6,
    z: 0,
    hp: 200,
    maxHp: 500,
    site: 0,
  };
  delete tower.interior;
  sim.add('building', tower);
  h.x = h.px = tower.x;
  h.z = h.pz = tower.z + 2;
  h.tools.push('hammer');
  h.bag.wood = 5;
  assert.equal(approach(sim, tower.id, h)!.x, tower.x);
  assert(inReachOf(h, tower.x, tower.z, 3));
  sim.apply({ t: 'interact', hero: h.id, target: tower.id });
  for (let i = 0; i < 80; i++) sim.step();
  assert(tower.hp > 200, 'manual repairs restore tower HP');
  assert(h.bag.wood! < 5, 'repairs spend gathered supplies');
  // Starting an attack recalls the repair party and closes access, including when called early.
  h.x = h.px = GATE.x + 5;
  h.z = h.pz = 0;
  sim.onTowerBuilt();
  sim.callWave();
  assert(!betweenWaves(sim));
  assert(h.x < GATE.x);
  assert(!bodyFree(sim, GATE.x + 5, 0));
  assert(!bodyFree(sim, GATE.x, 0));
  // Finishing the spawn queue alone is not a repair break while one soldier remains alive.
  sim.state.spawns = [];
  const guard = spawnEnemy(sim, 'minion', 0, 0);
  guard.spawnT = 0;
  sim.step();
  assert.equal(sim.state.nextWaveAt, -1);
  assert(!betweenWaves(sim));
  sim.remove(guard.id);
  for (const e of [...sim.state.enemies]) if (!e.camp) sim.remove(e.id);
  sim.step();
  assert(betweenWaves(sim));
  assert(sim.state.nextWaveAt - sim.state.time >= REPAIR_BREAK - 0.1);
  // A siege breaker diverts toward a tower, damages it, and also deals extra gate damage.
  const siege = new Sim(),
    lane = fixtureValue(siege.world.lanes[0], 'siege road'),
    p = lanePos(lane, lane.length * 0.65, 0);
  const target = {
    ...structuredClone(fixtureValue(siege.state.buildings[0], 'siege starter building')),
    id: siege.newId(),
    kind: 'tower' as const,
    x: p.x + 2,
    z: p.z,
    hp: 500,
    maxHp: 500,
    site: 0,
  };
  delete target.interior;
  siege.add('building', target);
  const crusher = spawnEnemy(siege, 'crusher', 0, 4, { d: lane.length * 0.65, lat: 0 });
  crusher.spawnT = 0;
  crusher.attackCd = 0;
  for (let i = 0; i < 150; i++) updateEnemies(siege, 0.05);
  assert(target.hp < 500, 'ram carrier attacks field towers');
  console.log(
    'PASS: human-sized road troops, mount/park/save, open maintenance gate and paths, manual tower repair, safe recall, full post-clear break and siege attacks',
  );
});
