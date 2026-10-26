import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openGameStatistics } from '../server/statistics.ts';
import { Room } from '../server/room.ts';
import type { SaveStore } from '../server/saves.ts';
test('the actual LAN room stores completed numeric results through independently packaged provider drivers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'td01-local-statistics-'));
  const options = { directory, instance: 'integration' };
  const saves: SaveStore = {
    kind: 'files',
    async save() {
      throw new Error('not used');
    },
    async load() {
      return null;
    },
    async list() {
      return [];
    },
  };
  const first = await openGameStatistics(options, 'integration');
  try {
    const room = new Room({ addresses: [], version: 'integration', saves, reportMetric: first.report });
    room.sim.addHero(0, 'Not public');
    room.sim.state.stats.kills = 5;
    room.sim.state.time = 12;
    room.sim.loseLives(room.sim.state.lives);
    room.tick();
    const snapshot = first.snapshot();
    const result = snapshot.rows.find((row) => row.metric.name === 'run_kills');
    assert.deepEqual(result?.scores, [5]);
    assert.equal(result?.from, 'authority');
    assert.deepEqual(result?.labels, { sigil: '0', party: '1' });
    assert(!JSON.stringify(snapshot).includes('Not public'));
    assert.throws(() => first.report('undeclared_metric', 1), /Undeclared/);
    await first.close();
    const second = await openGameStatistics(options, 'integration');
    try {
      assert.deepEqual(second.snapshot().rows.find((row) => row.metric.name === 'run_kills')?.scores, [5]);
    } finally {
      await second.close();
    }
  } finally {
    await first.close();
    await rm(directory, { recursive: true, force: true });
  }
});
