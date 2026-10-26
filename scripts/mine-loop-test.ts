import { fixtureHero, fixtureValue } from './game-fixtures.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/game/sim.ts';
import { earth, earthWalkable } from '../src/game/excavation.ts';
import { TUNNELS, tunnelWorld } from '../src/game/mine-routes.ts';
import { MINE_AT } from '../src/game/mines.ts';
import { PREP_BAY } from '../src/game/blasting.ts';
import { updateBombs, minePath } from '../src/game/systems/mining.ts';
import { snapshot, restore } from '../src/game/save.ts';

test('mine loop', async () => {
  const sim = new Sim(),
    h = fixtureHero(sim),
    f = earth(sim);
  h.tools = ['pickaxe', 'scanner'];
  assert.equal(TUNNELS.length, 3);
  for (const route of TUNNELS)
    for (const points of [route.points, route.branch])
      for (let i = 1; i < points.length; i++) {
        const a = tunnelWorld(fixtureValue(points[i - 1], 'previous tunnel sample')),
          b = tunnelWorld(fixtureValue(points[i], 'next tunnel sample'));
        for (let k = 0; k <= 10; k++) {
          const x = a.x + ((b.x - a.x) * k) / 10,
            z = a.z + ((b.z - a.z) * k) / 10;
          assert(earthWalkable(sim, x, z), `route blocked at ${route.name}: ${x},${z}`);
        }
      }
  assert(
    fixtureValue(TUNNELS[2], 'deep route').points.at(-1)![1] <
      fixtureValue(TUNNELS[0], 'shallow route').points.at(-1)![1] - 2,
  );
  assert(
    minePath(sim, MINE_AT.x - 3.1, MINE_AT.z, MINE_AT.x + 6, MINE_AT.z - 12),
    'click-to-walk uses continuous tunnel layout',
  );
  assert.equal(sim.state.camps.filter((c) => c.tunnel !== undefined).length, 6);
  h.x = h.px = PREP_BAY.x;
  h.z = h.pz = PREP_BAY.z;
  sim.apply({ t: 'prepareBlast', hero: h.id, step: 2 });
  assert(!h.bag.dynamite, 'preparation cannot skip stages');
  for (let step = 1; step <= 3; step++) {
    sim.apply({ t: 'prepareBlast', hero: h.id, step });
    sim.apply({ t: 'prepareBlast', hero: h.id, step });
  }
  assert.equal(h.bag.dynamite, 2);
  assert.equal(h.blastSkill!.level, 1);
  sim.apply({ t: 'prepareBlast', hero: h.id, step: 2 });
  assert.equal(h.bag.dynamite, 2, 'starter supplies cannot be claimed twice');
  const hit = f.ray({ x: h.x, y: 1.1, z: h.z }, { x: 0, y: 0.25, z: -Math.sqrt(1 - 0.25 ** 2) }, 3.5)!;
  assert(hit, 'a reachable raised face exists near preparation');
  const before = f.density(hit.x, hit.y, hit.z);
  sim.apply({ t: 'blast', hero: h.id, x: hit.x, y: hit.y, z: hit.z });
  assert.equal(h.bag.dynamite, 1);
  assert.equal(sim.state.bombs.length, 1);
  sim.apply({ t: 'blast', hero: h.id, x: hit.x, y: hit.y, z: hit.z });
  assert.equal(h.bag.dynamite, 1, 'one active fuse per miner');
  const copy = new Sim();
  restore(copy, snapshot(sim));
  const hp = h.hp;
  h.x = MINE_AT.x + 1;
  h.z = MINE_AT.z + 1;
  updateBombs(sim, 3.4);
  assert.equal(sim.state.earth!.cuts.length, 0);
  updateBombs(sim, 0.2);
  assert.equal(sim.state.bombs.length, 0);
  assert(f.density(hit.x, hit.y, hit.z) < before);
  assert.equal(h.blastSkill!.xp, 1);
  updateBombs(sim, 10);
  assert.equal(h.blastSkill!.xp, 1, 'explosion executes once');
  updateBombs(copy, 4);
  assert.equal(copy.state.bombs.length, 0);
  assert.equal(copy.state.earth!.cuts.length, 1);
  h.x = PREP_BAY.x;
  h.z = PREP_BAY.z;
  h.bag.coal = 1;
  h.bag.sulfur = 1;
  sim.apply({ t: 'makeCharges', hero: h.id });
  assert.equal(h.bag.dynamite, 3);
  assert(!h.bag.coal && !h.bag.sulfur);
  assert(h.hp <= hp);
  console.log(
    'PASS: three connected sloping workings and branches, occupied pockets, matching navigation, staged one-time charge preparation, elevated placement, fuse timing, permanent 3D blast, skill progress, atomic materials and save recovery',
  );
});
