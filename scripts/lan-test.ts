import { readStatistics } from '@zirbel/core/statistics';
/** Real WebSocket boundary tests. Every server and client is owned and closed by this test. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { startServer } from '../server/index.ts';
import type { SavedGame, SaveStore } from '../server/saves.ts';
import type { ServerMsg } from '../src/net/protocol.ts';
import { MINE_AT } from '../src/game/mines.ts';
import { earth } from '../src/game/excavation.ts';
import { LAN_LIMITS } from '../server/security.ts';

test('real LAN authority, persistence and rejection boundaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'td01-lan-'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>td01 test</title>');
  const games = new Map<string, SavedGame>();
  let failSave = false;
  const saves: SaveStore = {
    kind: 'files',
    async save(game) {
      if (failSave) throw Error('simulated disk failure');
      const code = 'ABC234';
      games.set(code, structuredClone(game));
      return code;
    },
    async load(code) {
      return games.get(code) ?? null;
    },
    async list() {
      return [...games.keys()].map((code) => ({ code, at: new Date().toISOString(), wave: 0 }));
    },
  };
  const server = await startServer({
    port: 0,
    host: '127.0.0.1',
    dist: root,
    saves,
    statistics: { directory: join(root, 'statistics'), instance: 'lan-test' },
  });
  const url = `ws://127.0.0.1:${server.port}/ws`;
  const sockets: WebSocket[] = [];
  const wait = async (test: () => boolean, ms = 4000) => {
    const end = Date.now() + ms;
    while (!test()) {
      if (Date.now() > end) throw Error('Timed out waiting for LAN state');
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  async function peer(origin?: string) {
    const ws = new WebSocket(url, origin ? { origin } : {});
    sockets.push(ws);
    const inbox: ServerMsg[] = [];
    ws.on('message', (raw) => inbox.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    const next = async <T extends ServerMsg['type']>(type: T) => {
      await wait(() => inbox.some((m) => m.type === type));
      const i = inbox.findIndex((m) => m.type === type);
      return inbox.splice(i, 1)[0] as Extract<ServerMsg, { type: T }>;
    };
    return { ws, inbox, next, send: (m: unknown) => ws.send(JSON.stringify(m)) };
  }
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/`);
    assert.equal(response.status, 200);
    const statisticsPage = await fetch(`http://127.0.0.1:${server.port}/stats`);
    assert.equal(statisticsPage.status, 200);
    assert((await statisticsPage.text()).includes('/stats/client.js'));
    const statisticsResponse = await fetch(`http://127.0.0.1:${server.port}/stats/v1`);
    assert(
      readStatistics(await statisticsResponse.json()),
      'the concrete LAN driver serves a validated snapshot',
    );
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert(response.headers.get('content-security-policy')?.includes("object-src 'none'"));
    await assert.rejects(
      () => peer('https://untrusted.example'),
      'cross-origin browser handshakes are rejected',
    );
    const a = await peer(),
      b = await peer();
    await a.next('full');
    a.send({ type: 'join', name: 'Alva', token: '0123456789abcdef' });
    const heroA = (await a.next('welcome')).hero;
    b.send({ type: 'join', name: 'Bjørn', token: 'fedcba9876543210' });
    const heroB = (await b.next('welcome')).hero;
    assert.notEqual(heroA, heroB);
    a.send({ type: 'cmd', cmd: { t: 'devMode', on: true } });
    await a.next('error');
    assert(!server.room.sim.state.dev, 'LAN cannot enable cheats by default');
    const h = server.room.sim.getAs(heroA, 'hero')!,
      other = server.room.sim.getAs(heroB, 'hero')!;
    a.send({ type: 'cmd', cmd: { t: 'move', hero: heroB, x: 0, z: 0 } });
    await wait(() => h.task.k === 'move');
    assert.equal(other.task.k, 'idle', 'you cannot command another hero');
    a.send({ type: 'cmd', cmd: { t: 'stop', hero: heroA } });
    for (const cmd of [
      { t: 'pose', hero: heroA },
      { t: 'chooseClass', hero: heroA, cls: 'constructor' },
      { t: 'withdraw', hero: heroA, item: 'wood', count: -99 },
      { t: 'excavate', hero: heroA, x: null, y: 1, z: 1, tool: 'pickaxe' },
    ])
      a.send({ type: 'cmd', cmd });
    h.x = h.px = MINE_AT.x + 1.2;
    h.z = h.pz = MINE_AT.z;
    h.task = { k: 'idle' };
    h.path = [];
    h.tools = ['pickaxe'];
    const f = earth(server.room.sim),
      hit = f.ray({ x: h.x, y: 0.8, z: h.z }, { x: 0, y: 0, z: 1 }, 3)!;
    assert(hit);
    a.send({
      type: 'cmd',
      cmd: { t: 'excavate', hero: heroA, x: hit.x, y: hit.y, z: hit.z, tool: 'pickaxe' },
    });
    await wait(() => server.room.sim.state.earth!.cuts.length === 1);
    await wait(() => b.inbox.some((m) => m.type === 'tick' && m.d.ec?.length === 1));
    a.send({ type: 'save' });
    const code = (await a.next('saved')).code;
    assert(server.room.paused);
    b.send({ type: 'load', code });
    await b.next('full');
    assert.equal(server.room.sim.state.earth!.cuts.length, 1, 'permanent excavation survives LAN save/load');
    a.send({ type: 'pause', on: false });
    await wait(() => !server.room.paused);
    failSave = true;
    a.send({ type: 'save' });
    await a.next('error');
    a.send({ type: 'ping', t: 7 });
    assert.equal((await a.next('pong')).t, 7, 'storage failure does not kill the room');
    const flood = await peer();
    const closed = new Promise<void>((resolve) => flood.ws.once('close', () => resolve()));
    flood.ws.send('x'.repeat(LAN_LIMITS.messageBytes + 1));
    await closed;
    const slow = await peer();
    const slowSocket = [...server.room.sockets].at(-1)!;
    const slowClosed = new Promise<void>((resolve) => slow.ws.once('close', () => resolve()));
    Object.defineProperty(slowSocket, 'bufferedAmount', { get: () => LAN_LIMITS.bufferedBytes });
    server.room.broadcast({ type: 'feed', text: 'bounded outgoing queue' });
    await slowClosed;
    assert(server.room.sim.state.heroes.every((h) => [h.x, h.z, h.hp].every(Number.isFinite)));
    console.log(
      'PASS: real LAN joins, authority, malformed commands, origin/payload protection, excavation deltas, save/load and storage-error recovery',
    );
  } finally {
    for (const socket of sockets) socket.terminate();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
