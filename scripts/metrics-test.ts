import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Sim } from '../src/game/sim.ts';
import { GameMetrics } from '../server/metrics.ts';
test('server results contain numbers and closed outcomes only, never hero data', () => {
  const state = new Sim({ players: 1 }).state;
  const reports: { name: string; value: number; labels?: Readonly<Record<string, string>> }[] = [];
  const metrics = new GameMetrics(state, (name, value, labels) => {
    reports.push({ name, value, ...(labels ? { labels } : {}) });
  });
  state.stats.kills = 12;
  state.stats.gathered = 30;
  state.time = 10;
  state.waveCleared[0] = true;
  metrics.update(state);
  state.phase = 'won';
  state.time = 11;
  metrics.update(state);
  const afterEnd = reports.length;
  metrics.update(state);
  assert.equal(reports.length, afterEnd, 'terminal ticks must not flood the sink');
  assert.equal(reports.filter((r) => r.name === 'runs_total').length, 1);
  assert.deepEqual(
    reports.find((r) => r.name === 'run_kills'),
    { name: 'run_kills', value: 12, labels: { sigil: '0', party: '1' } },
  );
  assert.deepEqual(
    reports.find((r) => r.name === 'victory_seconds'),
    { name: 'victory_seconds', value: 11, labels: { sigil: '0', party: '1' } },
  );
  assert.deepEqual(reports.find((r) => r.name === 'runs_total')?.labels, {
    sigil: '0',
    party: '1',
    outcome: 'won',
  });
  assert.equal(
    reports.filter((r) => r.name === 'enemies_defeated_total').reduce((n, r) => n + r.value, 0),
    12,
  );
});
test('loaded terminal saves and development-assisted runs do not award new records', () => {
  const state = new Sim({ players: 1 }).state;
  state.phase = 'won';
  const terminal: string[] = [];
  new GameMetrics(state, (name) => {
    terminal.push(name);
  }).update(state);
  assert(!terminal.includes('runs_total'));
  const reports: string[] = [];
  state.phase = 'build';
  const metrics = new GameMetrics(state, (name) => {
    reports.push(name);
  });
  state.dev = true;
  metrics.update(state);
  state.dev = false;
  state.phase = 'won';
  metrics.update(state);
  assert.deepEqual(reports, []);
});

test('unsupported custom difficulties cannot mix with standard records', () => {
  const state = new Sim({ players: 1, sigil: 8 }).state;
  const reports: string[] = [];
  const metrics = new GameMetrics(state, (name) => {
    reports.push(name);
  });
  state.phase = 'won';
  metrics.update(state);
  assert.deepEqual(reports, []);
});
