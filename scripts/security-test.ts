import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, COMMAND_SCHEMAS } from '../src/game/commands.ts';
import { PLAYER_COMMANDS } from '../src/net/protocol.ts';
import { allowedOrigin, LAN_LIMITS, MessageBudget, parseClientMessage } from '../server/security.ts';
import { RNG } from '../src/core/rng.ts';

test('security', async () => {
  assert.deepEqual(
    new Set(Object.keys(COMMAND_SCHEMAS)),
    PLAYER_COMMANDS,
    'every command has a reviewed runtime contract and LAN dispatch entry',
  );
  const good = { t: 'excavate', hero: 1, x: 1760, y: 0.7, z: -420, tool: 'pickaxe', wide: false };
  assert(parseCommand(good));
  for (const value of [
    null,
    [],
    {},
    'move',
    { t: 'constructor' },
    { t: 'pose', hero: 1 },
    { ...good, x: null },
    { ...good, x: Infinity },
    { ...good, tool: 'constructor' },
    { ...good, x: '1760' },
    { ...good, wide: 'false' },
    JSON.parse('{"t":"mount","hero":1,"__proto__":{}}'),
    { t: 'withdraw', hero: 1, item: 'wood', count: -5 },
    { t: 'place', hero: 1, plan: 'constructor', cx: 1, cz: 1 },
    { t: 'chooseClass', hero: 1, cls: 'constructor' },
    { t: 'blast', hero: 1, x: 1 },
    { t: 'shipTower', hero: 1, crate: 1, cx: 1.2, cz: 1 },
  ])
    assert.equal(parseCommand(value), null, JSON.stringify(value));
  assert(allowedOrigin(undefined, 'localhost:7777'));
  assert(allowedOrigin('http://localhost:7777', 'localhost:7777'));
  for (const origin of [
    'null',
    'https://evil.example',
    'http://localhost:8888',
    'http://localhost:7777/path',
  ])
    assert(!allowedOrigin(origin, 'localhost:7777'));
  assert.equal(parseClientMessage(JSON.stringify({ type: 'pause', on: 'false' })), null);
  assert.equal(parseClientMessage(' '.repeat(LAN_LIMITS.messageBytes + 1)), null);
  const budget = new MessageBudget(0);
  for (let i = 0; i < LAN_LIMITS.burst; i++) assert(budget.take(0));
  assert(!budget.take(0));
  assert(budget.take(1000));
  const rng = new RNG(82),
    values: unknown[] = [null, undefined, {}, [], true, 'constructor', 1e99, NaN, 0, -1];
  for (let i = 0; i < 2000; i++) {
    const cmd = {
      ...good,
      [rng.pick(['hero', 'x', 'tool', 'wide'])]: values[rng.int(0, values.length - 1)],
    };
    assert.doesNotThrow(() => parseCommand(cmd));
    assert.doesNotThrow(() => parseClientMessage(JSON.stringify({ type: 'cmd', cmd })));
  }
  console.log(
    'PASS: exhaustive command contracts, malformed and prototype input, bounded values, origin checks and message budgets',
  );
});

test('decoded optional fields are absent and inherited fields cannot impersonate a command', () => {
  const input = { t: 'place', hero: 1, plan: 'tower', cx: 1, cz: 1, rot: undefined };
  assert.deepEqual(parseCommand(input), { t: 'place', hero: 1, plan: 'tower', cx: 1, cz: 1 });
  assert(Object.hasOwn(input, 'rot'), 'decoding does not mutate its input');
  assert.equal(parseCommand(Object.create({ t: 'mount', hero: 1 })), null);
  assert.equal(parseCommand(Object.assign(Object.create({ hero: 1 }), { t: 'mount' })), null);
});
