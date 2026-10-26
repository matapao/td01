/** Network mirrors tolerate obsolete mine references and incomplete occupancy pairs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/game/sim.ts';
import { snapshot, restore } from '../src/game/save.ts';
import { DeltaTracker, applyDelta } from '../src/net/protocol.ts';
import { fixtureValue } from './game-fixtures.ts';

test('occupancy and mine deltas keep valid updates when an obsolete reference is present', () => {
  const host = new Sim(),
    mirror = new Sim();
  restore(mirror, snapshot(host));
  const tracker = new DeltaTracker(host.state);
  const mine = fixtureValue(host.state.mines[0], 'mine');
  host.state.occupied[0] = 42;
  mine.open[0] = true;
  mine.dmg[12] = 2;
  const delta = tracker.diff(host.state);
  applyDelta(mirror, structuredClone(delta));
  assert.deepEqual(mirror.state.occupied, host.state.occupied);
  assert.deepEqual(mirror.state.mines, host.state.mines);
  const before = snapshot(mirror);
  assert.doesNotThrow(() =>
    applyDelta(mirror, {
      o: [1],
      mm: [{ id: 999999, open: [true] }],
      md: [[999999, [12]]],
      mg: [[999999, { 12: 2 }]],
    }),
  );
  assert.deepEqual(snapshot(mirror), before, 'stale references never corrupt the restored state');
});
