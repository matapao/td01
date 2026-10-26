import { test } from 'node:test';
/** Window startup must resolve without loading a minigame's browser runtime or stylesheet. */
import assert from 'node:assert/strict';
import { Windows } from '../src/ui/windows.ts';
import { MILESTONES } from '../src/game/road.ts';
import { isMinigameKind, MINIGAME_NAMES } from '../src/ui/minigames/catalogue.ts';
import { loadMinigame } from '../src/ui/minigames/load.ts';

test('minigame imports', async () => {
  assert.equal(typeof Windows, 'function', 'the startup window module loads without a browser');
  for (const { kind } of Object.values(MILESTONES)) {
    assert(isMinigameKind(kind), `milestone kind ${kind} has a catalogue entry`);
  }
  for (const kind of Object.keys(MINIGAME_NAMES)) {
    assert(isMinigameKind(kind));
    const game = await loadMinigame(kind);
    assert.equal(game.kind, kind);
    assert.equal(game.name, MINIGAME_NAMES[kind], 'window labels match the on-demand activity');
  }
  for (const invalid of ['', 'MINIGAMES', 'constructor', 'toString', '__proto__']) {
    assert.equal(isMinigameKind(invalid), false, `reject invalid kind ${invalid}`);
  }
  console.log('PASS: window startup imports and on-demand minigame catalogue labels');
});
