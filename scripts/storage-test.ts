import { fixtureHero, fixtureValue } from './game-fixtures.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSaves } from '../server/saves.ts';
import { Sim } from '../src/game/sim.ts';
import { restore, snapshot } from '../src/game/save.ts';
import { assertSaveData } from '../src/game/save-format.ts';
import { blastRadius, blastSkill } from '../src/game/blasting.ts';

test('storage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'td01-save-test-'));
  try {
    const sim = new Sim(),
      store = await openSaves(root, ''),
      game = { save: snapshot(sim), players: [] };
    const codes = await Promise.all(Array.from({ length: 6 }, () => store.save(game)));
    assert.equal(new Set(codes).size, 6);
    assert.deepEqual(await store.load(fixtureValue(codes[0], 'saved code')), game);
    assert.equal(await store.load('../package'), null);
    await writeFile(join(root, 'saves', 'AAAAAA.json'), 'broken JSON');
    await writeFile(join(root, 'saves', 'BBBBBB.json'), '{}');
    assert.equal(await store.load('AAAAAA'), null);
    assert.equal((await store.list()).length, 6);
    assert(
      (await readdir(join(root, 'saves'))).every((n) => n.endsWith('.json')),
      'no partial save files remain',
    );
    const before = snapshot(sim),
      bad = structuredClone(before);
    const hero = fixtureHero(sim);
    blastSkill(hero);
    assert.equal(hero.blastSkill, undefined, 'reading UI skill data never mutates simulation state');
    assert(blastRadius(3) > blastRadius(1), 'the warning radius grows with the actual blast');
    const legacy = structuredClone(before);
    legacy.v = 5;
    delete fixtureValue((legacy.state['heroes'] as Record<string, unknown>[])[0], 'legacy hero')['cls'];
    assert.doesNotThrow(() => assertSaveData(legacy), 'old saves without a class can still migrate');
    legacy.v = 6;
    assert.throws(() => assertSaveData(legacy), 'current saves require a valid class');
    bad.state['occupied'] = 'not base64!';
    assert.throws(() => restore(sim, bad));
    assert.deepEqual(snapshot(sim), before, 'bad grids fail before state changes');
    const invalid = structuredClone(before);
    fixtureValue((invalid.state['heroes'] as Record<string, unknown>[])[0], 'invalid hero')['task'] = null;
    assert.throws(() => restore(sim, invalid));
    assert.deepEqual(snapshot(sim), before);
    const poison = JSON.parse(JSON.stringify(before));
    Object.defineProperty(poison.state, '__proto__', { value: 'blocked', enumerable: true });
    assert.throws(() => restore(sim, poison));
    sim.apply({ t: 'devMode', on: true });
    sim.apply({ t: 'setTime', tod: 0.75, hold: true });
    sim.apply({ t: 'devWaves', on: false });
    const copy = new Sim();
    restore(copy, snapshot(sim));
    assert.equal(copy.state.dayHold, 0.75);
    assert(copy.state.wavesOff && copy.state.dev);
    console.log(
      'PASS: atomic concurrent saves, path rejection, damaged-file isolation, validation before mutation and optional-state recovery',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
