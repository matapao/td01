/**
 * LAN test: a real server on a free port, played by scripted players over real WebSockets (like
 * the fps game's tests). Joining, two heroes, poses and commands, deltas keeping a mirror in step,
 * rejoining by token, pause/save/load, and bad input.   npm run test:lan
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server/index';
import { Sim } from '../src/game/sim';
import { restore } from '../src/game/save';
import { applyDelta, applyRemovals, type MirrorSim, type ServerMsg } from '../src/net/protocol';
import { MIN, digBlocker, digCenter, mineLayout, mineSdf } from '../src/game/mines';
import { bodyFree } from '../src/game/systems/heroes';
import { MAP, WALL, cellOf, onWall, wallSpot } from '../src/game/map';
import { forceCompleteSite, placementBlocker } from '../src/game/systems/craft';
import { WEAPONS, sizeOf } from '../src/game/content';
import { enterBuilding, leaveBuilding } from '../src/game/systems/rooms';

const dist = mkdtempSync(join(tmpdir(), 'browserdefense-dist-'));
writeFileSync(join(dist, 'index.html'), '<!doctype html><title>BrowserDefense</title>');
process.env.DATABASE_URL = '';
const server = await startServer({ port: 0, host: '127.0.0.1', dist });
const url = `ws://127.0.0.1:${server.port}/ws`;
let failed = false;

interface Client {
  inbox: ServerMsg[];
  send(msg: unknown): void;
  raw(data: string): void;
  next<T extends ServerMsg['type']>(type: T, ms?: number, match?: (m: Extract<ServerMsg, { type: T }>) => boolean): Promise<Extract<ServerMsg, { type: T }>>;
  close(): void;
  mirror: Sim | null;
}

async function connect(): Promise<Client> {
  const socket = new WebSocket(url);
  const inbox: ServerMsg[] = [];
  const waiting: { type: string; match?: (m: never) => boolean; resolve: (m: ServerMsg) => void }[] = [];
  const c: Client = {
    inbox,
    mirror: null,
    send: (m) => socket.send(JSON.stringify(m)),
    raw: (d) => socket.send(d),
    next(type, ms = 3000, match) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), ms);
        waiting.push({ type, match: match as never, resolve: (m) => (clearTimeout(timer), resolve(m as never)) });
      });
    },
    close: () => socket.close(),
  };
  socket.addEventListener('message', (ev) => {
    const m = JSON.parse(String(ev.data)) as ServerMsg;
    inbox.push(m);
    // A browser's mirror: the full snapshot, then each tick's changes.
    if (m.type === 'full') {
      c.mirror = new Sim({ players: 0 });
      restore(c.mirror, m.save);
    } else if (m.type === 'tick' && c.mirror) {
      const removed = applyDelta(c.mirror as unknown as MirrorSim, m.d);
      applyRemovals(c.mirror as unknown as MirrorSim, removed);
    }
    for (const w of [...waiting]) {
      if (w.type !== m.type || (w.match && !w.match(m as never))) continue;
      waiting.splice(waiting.indexOf(w), 1);
      w.resolve(m);
    }
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return c;
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed = true;
    console.error(`  ✗ ${name}\n    ${(e as Error).stack?.split('\n').slice(0, 3).join('\n    ')}`);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tokenA = 'a1b2c3d4e5f6a7b8c9d0e1f2';
let a!: Client;
let b!: Client;
let heroA = 0;
let heroB = 0;

console.log('LAN');
await test('hello, a full snapshot and the players list on connect', async () => {
  a = await connect();
  const hello = await a.next('hello');
  assert.ok(Array.isArray(hello.addresses));
  await a.next('full');
  assert.ok(a.mirror, 'mirror built from the snapshot');
});

await test('joining gives a hero; a second player gets another', async () => {
  a.send({ type: 'join', name: 'Alva', token: tokenA });
  heroA = (await a.next('welcome')).hero;
  b = await connect();
  await b.next('full');
  b.send({ type: 'join', name: 'Bjørn', token: 'ffeeddccbbaa99887766' });
  heroB = (await b.next('welcome')).hero;
  assert.notEqual(heroA, heroB);
  await wait(200);
  const players = [...a.inbox].reverse().find((m): m is Extract<ServerMsg, { type: 'players' }> => m.type === 'players')!;
  assert.deepEqual(players.list.map((p) => p.name).sort(), ['Alva', 'Bjørn']);
  await wait(200);
  assert.ok(b.mirror!.getAs(heroA, 'hero'), "B's mirror has A's hero");
});

await test("a pose moves your hero on everyone's mirror", async () => {
  const h = server.room.sim.getAs(heroA, 'hero')!;
  const x = h.x + 0.4;
  a.send({ type: 'cmd', cmd: { t: 'pose', hero: heroA, x, z: h.z, facing: 1, look: 1, gait: 'fwd', moving: true } });
  await wait(250);
  assert.ok(Math.abs(server.room.sim.getAs(heroA, 'hero')!.x - x) < 1e-6, 'server accepted the pose');
  assert.ok(Math.abs(b.mirror!.getAs(heroA, 'hero')!.x - x) < 0.01, "B's mirror shows it");
});

await test('commands only ever drive your own hero', async () => {
  const before = server.room.sim.getAs(heroB, 'hero')!.task.k;
  a.send({ type: 'cmd', cmd: { t: 'move', hero: heroB, x: 0, z: 0 } });
  await wait(200);
  assert.equal(server.room.sim.getAs(heroB, 'hero')!.task.k, before, "B's hero untouched");
  assert.equal(server.room.sim.getAs(heroA, 'hero')!.task.k, 'move', 'the command went to A instead');
  a.send({ type: 'cmd', cmd: { t: 'stop', hero: heroA } });
});

await test('mirrors stay in step with the server over a running wave', async () => {
  a.send({ type: 'wave' });
  await wait(3000);
  const s = server.room.sim.state;
  const m = b.mirror!.state;
  assert.equal(m.enemies.length, s.enemies.length, 'enemy count');
  assert.equal(m.wave, s.wave, 'wave');
  assert.equal(m.gold, s.gold, 'gold');
  for (const e of s.enemies) {
    const me = b.mirror!.getAs(e.id, 'enemy');
    assert.ok(me && Math.hypot(me.x - e.x, me.z - e.z) < 0.6, `enemy ${e.id} position`);
  }
});

await test('reconnecting with your token brings back your hero', async () => {
  a.close();
  await wait(200);
  a = await connect();
  await a.next('full');
  a.send({ type: 'join', name: 'Alva', token: tokenA });
  assert.equal((await a.next('welcome')).hero, heroA);
});

await test('pause stops the clock for everyone; save gives a code; load puts the game back exactly', async () => {
  a.send({ type: 'pause', on: true });
  await b.next('paused', 3000, (m) => m.paused);
  const t0 = server.room.sim.state.tick;
  await wait(300);
  assert.equal(server.room.sim.state.tick, t0, 'no ticks while paused');
  const gold = server.room.sim.state.gold;
  const hash = server.room.sim.hash();
  a.send({ type: 'save' });
  const { code } = await b.next('saved');
  assert.match(code, /^[A-Z2-9]{6}$/);
  // Play on a bit and change things, then load the save.
  server.room.sim.state.gold += 500;
  a.send({ type: 'pause', on: false });
  await wait(400);
  b.send({ type: 'load', code });
  await b.next('full');
  await wait(100);
  assert.equal(server.room.sim.state.gold, gold, 'gold is back');
  assert.equal(server.room.sim.hash(), hash, 'the whole game is exactly as saved');
  assert.equal(b.mirror!.state.gold, gold, "and so is everyone's mirror");
  assert.ok(server.room.paused, 'a loaded game waits paused');
  a.send({ type: 'pause', on: false });
});

await test('a lost game can start over: New game for everyone, same heroes and classes, all can move', async () => {
  const room = server.room;
  const hb = room.sim.getAs(heroB, 'hero')!;
  room.sim.apply({ t: 'chooseClass', hero: heroB, cls: 'magic' });
  assert.equal(hb.cls, 'magic');
  room.sim.state.phase = 'lost';
  a.send({ type: 'newGame' });
  await b.next('full');
  await wait(150);
  const s = room.sim.state;
  assert.notEqual(s.phase, 'lost', 'a fresh game is running');
  assert.ok(s.tick < 200, 'from the start');
  assert.ok(!room.paused, 'and not paused');
  const nb = room.sim.getAs(heroB, 'hero');
  assert.ok(room.sim.getAs(heroA, 'hero') && nb, 'both players keep their heroes');
  assert.equal(nb!.cls, 'magic', 'and their classes');
  const x0 = nb!.x;
  b.send({ type: 'cmd', cmd: { t: 'pose', hero: heroB, x: x0 + 0.4, z: nb!.z, facing: 0, look: 0, gait: 'fwd', moving: true } });
  await wait(150);
  assert.ok(Math.abs(room.sim.getAs(heroB, 'hero')!.x - (x0 + 0.4)) < 0.01, 'and can walk');
});

await test('the mine over LAN: pieces of rock hacked off and a cave-in blown open reach every mirror as changes (never the whole mine); a hero riding a wagon rides on every mirror', async () => {
  const sim = server.room.sim;
  const m = sim.state.mines[0];
  const plan = mineLayout();
  const ha = sim.getAs(heroA, 'hero')!;
  const mm = () => b.mirror!.state.mines[0];
  // Down at the Copper Face: the nearest copper showing in its wall, and a spot to hack at it from.
  const zone = plan.zones.findIndex((z) => z.chamber === plan.lines[0].chambers[0]);
  let cell = -1;
  let spot: { x: number; z: number } | null = null;
  for (let k = 0; k < plan.dig.zone.length && !spot; k++) {
    if (plan.dig.zone[k] !== zone || plan.dig.mineral[k] !== MIN.copper || digBlocker(m, k)) continue;
    const c = digCenter(k);
    for (let r = 0.6; r < 1.3 && !spot; r += 0.1) {
      for (let a = 0; a < Math.PI * 2 && !spot; a += Math.PI / 12) {
        if (bodyFree(sim, c.x + Math.sin(a) * r, c.z + Math.cos(a) * r)) [cell, spot] = [k, { x: c.x + Math.sin(a) * r, z: c.z + Math.cos(a) * r }];
      }
    }
  }
  assert.ok(spot, 'copper showing in the Copper Face');
  ha.tools.push('pickaxe');
  ha.x = ha.px = spot!.x;
  ha.z = ha.pz = spot!.z;
  const cp = digCenter(cell);
  // Hacked at, sent as a command like a browser does: strike by strike, then the piece comes away.
  a.send({ type: 'cmd', cmd: { t: 'dig', hero: heroA, x: cp.x, z: cp.z } });
  let dented = false;
  for (let t = 0; t < 60 && !m.dug.includes(cell); t++) {
    await wait(50);
    if ((mm().dmg[cell] ?? 0) > 0) dented = true;
  }
  assert.ok(m.dug.includes(cell), 'hacked off on the server');
  await wait(200);
  assert.ok(dented, "the strikes reached the mirror as they landed");
  assert.ok(mm().dug.includes(cell) && mm().dug.length === m.dug.length, 'and the piece came off on the mirror too');
  assert.ok(mineSdf(mm(), cp.x, cp.z) < 0, "the mirror's rock gave way there");
  ha.task = { k: 'idle' };
  // A cave-in blown open (the Copper Line's, on to the Ruby Gallery).
  const ci = plan.caveins.findIndex((c) => c.line === 0 && c.d > plan.lines[0].stopI);
  const cave = plan.caveins[ci];
  sim.state.bombs.push({ id: sim.newId(), x: cave.x - cave.hx * 1.4, z: cave.z - cave.hz * 1.4, t: 0.05, hero: heroA });
  for (let t = 0; t < 20 && !mm().open[ci]; t++) await wait(50);
  assert.ok(m.open[ci] && mm().open[ci], 'the cave-in is open on every mirror');
  assert.ok(!b.inbox.some((x) => x.type === 'tick' && x.d.s && 'mines' in x.d.s), 'the mine never goes out whole');
  assert.ok(b.inbox.some((x) => x.type === 'tick' && x.d.md?.length), 'dug pieces go out as changes');
  // A ride: in at the Copper Face's wagon on to the Ruby Gallery, riding on the mirror, out at the other end.
  const on = plan.wagons.find((w) => w.line === 0 && w.leg === 1 && w.dir > 0)!;
  ha.x = ha.px = on.ax;
  ha.z = ha.pz = on.az;
  await wait(100);
  a.send({ type: 'cmd', cmd: { t: 'ride', hero: heroA, wagon: on.id } });
  let riding = false;
  let moved = 0;
  let last = -1;
  for (let t = 0; t < 120; t++) {
    await wait(50);
    const mh = b.mirror!.getAs(heroA, 'hero');
    if (mh?.ride) {
      riding = true;
      if (last >= 0) moved += Math.abs(mh.x - last);
      last = mh.x;
    }
    if (riding && !mh?.ride) break;
  }
  const mh = b.mirror!.getAs(heroA, 'hero')!;
  const to = plan.wagons[on.to];
  assert.ok(riding && moved > 1, "B's mirror saw A ride the wagon along the line");
  assert.ok(!mh.ride && Math.hypot(mh.x - to.ax, mh.z - to.az) < 0.5, 'and get out at the Ruby Gallery');
  ha.x = ha.px = MAP.heroStart.x;
  ha.z = ha.pz = MAP.heroStart.z;
  ha.task = { k: 'idle' };
});

await test("gems go into a tower's sockets and come out again on everyone's mirror; a hero on the wall-walk crews the tower on every mirror; no step takes them out over the wall", async () => {
  const sim = server.room.sim;
  const ha = sim.getAs(heroA, 'hero')!;
  for (const id of ['tower', 'swift', 'frost'] as const) if (!ha.known.includes(id)) ha.known.push(id);
  const c0 = cellOf(ha.x + 5, ha.z - 4);
  let placed = false;
  for (let r = 0; r < 8 && !placed; r++) {
    for (let dz = -r; dz <= r && !placed; dz++) {
      for (let dx = -r; dx <= r && !placed; dx++) {
        // (With the kind: the wall's rule too — a tower only beyond the wall.)
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || placementBlocker(sim, c0.cx + dx, c0.cz + dz, sizeOf('tower'), 'tower')) continue;
        sim.apply({ t: 'place', hero: heroA, plan: 'tower', cx: c0.cx + dx, cz: c0.cz + dz });
        placed = true;
      }
    }
  }
  forceCompleteSite(sim, sim.state.sites[sim.state.sites.length - 1]);
  const tower = sim.state.buildings[sim.state.buildings.length - 1];
  // A's player sets a swift topaz and a frost sapphire into it (one gem of each colour).
  for (const plan of ['swift', 'frost'] as const) {
    a.send({ type: 'cmd', cmd: { t: 'placeGem', hero: heroA, plan, building: tower.id } });
    await wait(150);
    const site = sim.state.sites.find((x) => x.building === tower.id && sim.alive(x.id));
    assert.ok(site, `a ${plan} gem site on the tower`);
    forceCompleteSite(sim, site!);
  }
  await wait(250);
  assert.deepEqual(b.mirror!.getAs(tower.id, 'building')!.gems, ['swift', 'frost'], "the gems are in on B's mirror");
  a.send({ type: 'cmd', cmd: { t: 'removeGem', hero: heroA, building: tower.id, gem: 'frost' } });
  await wait(250);
  assert.deepEqual(b.mirror!.getAs(tower.id, 'building')!.gems, ['swift'], "and the frost sapphire is out on B's mirror");
  // Up on the wall-walk beside it: A crews it — on every mirror.
  const home = { x: ha.x, z: ha.z };
  const post = wallSpot(tower.x, tower.z);
  ha.x = ha.px = post.x;
  ha.z = ha.pz = post.z;
  await wait(250);
  assert.equal(sim.getAs(heroA, 'hero')!.post, tower.id, 'crewing it on the server');
  assert.equal(b.mirror!.getAs(heroA, 'hero')!.post, tower.id, "and on B's mirror");
  // A step over the battlements onto the field: refused.
  a.send({ type: 'cmd', cmd: { t: 'pose', hero: heroA, x: WALL.x + WALL.half + 0.6, z: post.z, facing: Math.PI / 2, look: Math.PI / 2, gait: 'fwd', moving: true } });
  await wait(150);
  assert.ok(onWall(sim.getAs(heroA, 'hero')!.x, sim.getAs(heroA, 'hero')!.z), 'a pose does not take them out over the wall');
  ha.x = ha.px = home.x;
  ha.z = ha.pz = home.z;
  await wait(250);
  assert.ok(!b.mirror!.getAs(heroA, 'hero')!.post, "off the walk, no post on B's mirror");
});

await test("a weapon reforged at the Blacksmith's anvil is the new one on everyone's mirror", async () => {
  const sim = server.room.sim;
  const ha = sim.getAs(heroA, 'hero')!;
  if (!ha.known.includes('anvil')) ha.known.push('anvil');
  const c0 = cellOf(ha.x - 6, ha.z + 6);
  let placed = false;
  for (let r = 0; r < 10 && !placed; r++) {
    for (let dz = -r; dz <= r && !placed; dz++) {
      for (let dx = -r; dx <= r && !placed; dx++) {
        // (A workshop: inside the walls, in town.)
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || placementBlocker(sim, c0.cx + dx, c0.cz + dz, sizeOf('anvil'), 'anvil')) continue;
        sim.apply({ t: 'place', hero: heroA, plan: 'anvil', cx: c0.cx + dx, cz: c0.cz + dz });
        placed = true;
      }
    }
  }
  forceCompleteSite(sim, sim.state.sites[sim.state.sites.length - 1]);
  const anvil = sim.state.buildings[sim.state.buildings.length - 1];
  assert.equal(anvil.kind, 'anvil');
  enterBuilding(sim, ha, anvil);
  ha.bag = { ...WEAPONS[ha.cls].tiers[1].cost };
  const tier0 = ha.weaponTier;
  a.send({ type: 'cmd', cmd: { t: 'reforge', hero: heroA, building: anvil.id } });
  await wait(200);
  assert.equal(sim.getAs(anvil.id, 'building')!.forgeFor, heroA, 'the weapon is on the anvil');
  for (let i = 0; i < 4; i++) {
    a.send({ type: 'cmd', cmd: { t: 'beat', hero: heroA, quality: 2 } });
    await wait(220);
  }
  await wait(250);
  assert.equal(sim.getAs(heroA, 'hero')!.weaponTier, tier0 + 1, 'a tier up on the server');
  assert.equal(b.mirror!.getAs(heroA, 'hero')!.weaponTier, tier0 + 1, "and on B's mirror");
  leaveBuilding(sim, ha);
});

await test('bad input is ignored and the server keeps going', async () => {
  a.raw('not json');
  a.raw(JSON.stringify({ type: 'cmd', cmd: { t: 'nope' } }));
  a.raw(JSON.stringify({ type: 'cmd', cmd: { t: 'pose', hero: heroA, x: Number.NaN, z: 1, facing: 0, look: 0, gait: 'fwd', moving: true } }));
  a.raw(JSON.stringify({ type: 'load', code: '../../etc' }));
  await a.next('error');
  a.send({ type: 'ping', t: 42 });
  assert.equal((await a.next('pong')).t, 42);
  assert.ok(Number.isFinite(server.room.sim.getAs(heroA, 'hero')!.x));
});

a.close();
b.close();
await server.close();
if (failed) process.exit(1);
console.log('PASS');
process.exit(0);
