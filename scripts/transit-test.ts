import { fixtureHero, fixtureValue } from './game-fixtures.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/game/sim.ts';
import {
  frontDoor,
  walkIntoBuilding,
  walkOutOfBuilding,
  roomDoor,
  insideOf,
} from '../src/game/systems/rooms.ts';
import { boardLift, underground } from '../src/game/systems/mining.ts';
import { transitFade, transitPose } from '../src/game/transit.ts';
import { snapshot, restore } from '../src/game/save.ts';

test('transit', async () => {
  const sim = new Sim(),
    h = fixtureHero(sim),
    b = sim.state.buildings.find((b) => b.kind === 'shop')!;
  const d = frontDoor(b);
  h.x = h.px = d.x;
  h.z = h.pz = d.z;
  sim.step();
  assert(!h.transit && !insideOf(sim, h, b), 'standing near the door never reveals the room');
  walkIntoBuilding(sim, h, b);
  const start = h.x;
  for (let i = 0; i < 8; i++) sim.step();
  assert.equal(h.x, start);
  assert(transitPose(h).alpha < 1);
  assert(transitFade(h) > 0);
  sim.apply({ t: 'pose', hero: h.id, x: 0, z: 0, facing: 0, look: 0, gait: 'fwd', moving: true });
  assert.equal(h.x, start, 'movement cannot interrupt a doorway crossing');
  for (let i = 0; i < 4; i++) sim.step();
  assert(insideOf(sim, h, b));
  assert.equal(transitFade(h), 1, 'coordinate change occurs under full blackout');
  const copy = new Sim();
  restore(copy, snapshot(sim));
  for (let i = 0; i < 15; i++) copy.step();
  assert(!fixtureHero(copy).transit);
  assert(
    insideOf(
      copy,
      fixtureHero(copy),
      copy.state.buildings.find((x) => x.kind === 'shop')!,
    ),
  );
  for (let i = 0; i < 15; i++) sim.step();
  assert(!h.transit);
  const exit = roomDoor(b)!;
  h.x = h.px = exit.x;
  h.z = h.pz = exit.z;
  walkOutOfBuilding(sim, h);
  for (let i = 0; i < 25; i++) sim.step();
  assert(!insideOf(sim, h, b) && !h.transit);
  const m = fixtureValue(sim.state.mines[0], 'mine');
  const poi = sim.state.pois.find((p) => p.kind === 'mine')!;
  assert(
    Math.hypot(poi.x - m.exit.x, poi.z - m.exit.z) < 0.1,
    'mine interaction is at the visible doorway, not the building centre',
  );
  h.x = h.px = m.exit.x;
  h.z = h.pz = m.exit.z;
  boardLift(sim, h, 0, true);
  for (let i = 0; i < 18; i++) sim.step();
  assert(!underground(h.x));
  assert(transitPose(h).y < 0, 'cage descends before relocation');
  for (let i = 0; i < 12; i++) sim.step();
  assert(underground(h.x));
  assert.equal(transitFade(h), 1);
  for (let i = 0; i < 30; i++) sim.step();
  assert(!h.transit);
  boardLift(sim, h, 0, false);
  for (let i = 0; i < 60; i++) sim.step();
  assert(!underground(h.x) && !h.transit);
  console.log(
    'PASS: no proximity teleport, animated approach, input lock, blackout relocation, saved transition recovery and two-way lift travel',
  );
});
