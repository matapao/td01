import { fixtureHero, fixtureValue } from './game-fixtures.ts';
import { test } from 'node:test';
/** Dev wave control and purchased mine light: authority, persistence, and LAN replication. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Sim } from '../src/game/sim.ts';
import { DT } from '../src/game/config.ts';
import { TORCH } from '../src/game/content.ts';
import { snapshot, restore } from '../src/game/save.ts';
import { benchOf, enterBuilding } from '../src/game/systems/rooms.ts';
import { DeltaTracker, PLAYER_COMMANDS } from '../src/net/protocol.ts';
import { HandTorch } from '../src/view/torch.ts';
import { Audio } from '../src/view/audio.ts';

test('dev utilities', async () => {
  const sim = new Sim();
  sim.apply({ t: 'devWaves', on: false });
  assert(!sim.state.wavesOff, 'wave control is restricted to dev mode');
  sim.apply({ t: 'devMode', on: true });
  sim.apply({ t: 'devWaves', on: false });
  sim.state.nextWaveAt = sim.state.time + 2;
  for (let i = 0; i < 80; i++) sim.step();
  assert.equal(sim.state.wave, 0);
  assert(Math.abs(sim.state.nextWaveAt - sim.state.time - 2) < 1e-9, 'remaining countdown is frozen');
  sim.callWave();
  assert.equal(sim.state.wave, 0, 'manual wave call is also blocked');
  sim.apply({ t: 'devWaves', on: true });
  sim.callWave();
  assert.equal(sim.state.wave, 1);
  assert(sim.state.spawns.length > 0);
  sim.apply({ t: 'devWaves', on: false });
  const pending = sim.state.spawns.length;
  const remaining = fixtureValue(sim.state.spawns[0], 'queued spawn').at - sim.state.time;
  for (let i = 0; i < 40; i++) sim.step();
  assert.equal(sim.state.spawns.length, pending, 'queued reinforcements stay queued');
  assert(
    Math.abs(fixtureValue(sim.state.spawns[0], 'queued spawn').at - sim.state.time - remaining) < DT / 100,
  );
  sim.apply({ t: 'devMode', on: false });
  sim.step();
  assert(sim.state.spawns.length < pending, 'leaving dev mode resumes scheduled spawns');

  const shop = new Sim(),
    h = fixtureHero(shop);
  const tracker = new DeltaTracker(shop.state);
  shop.state.gold = 20;
  const buy = () => shop.apply({ t: 'buyTorch', hero: h.id, store: 'market' });
  buy();
  assert(!h.torchOwned, 'purchase requires the shop counter');
  const building = shop.state.buildings.find((b) => b.kind === 'shop')!;
  enterBuilding(shop, h, building);
  const counter = benchOf(building)!;
  h.x = h.px = counter.x;
  h.z = h.pz = counter.z;
  shop.state.gold = TORCH.price - 1;
  buy();
  assert(!h.torchOwned, 'cannot purchase without gold');
  shop.state.gold = 20;
  let purchaseName = false;
  shop.events.on('bought', (e) => {
    purchaseName = !!e.torch;
  });
  buy();
  assert(h.torchOwned && h.torchLit && purchaseName);
  assert.equal(shop.state.gold, 20 - TORCH.price);
  buy();
  assert.equal(shop.state.gold, 20 - TORCH.price, 'duplicate purchase does not charge');
  shop.apply({ t: 'toggleTorch', hero: h.id });
  assert.equal(h.torchLit, false);
  const delta = tracker.diff(shop.state);
  assert(delta.c?.heroes?.u?.some((hero) => hero['torchOwned'] === true && hero['torchLit'] === false));
  const restored = new Sim();
  restore(restored, snapshot(shop));
  assert(fixtureHero(restored).torchOwned);
  assert.equal(fixtureHero(restored).torchLit, false);
  for (const command of ['buyTorch', 'toggleTorch', 'devWaves'] as const)
    assert(PLAYER_COMMANDS.has(command));

  const scene = new THREE.Scene(),
    torch = new HandTorch(scene);
  torch.update(0.1, new THREE.Vector3(1, 2, 3), 0, true);
  assert(torch.root.visible && torch.light.intensity > 0);
  assert.equal(torch.light.castShadow, false);
  assert.equal(scene.children.filter((child) => child instanceof THREE.PointLight).length, 1);
  torch.update(0.1, new THREE.Vector3(), 0, false);
  assert(!torch.root.visible && torch.light.intensity === 0);
  // The fire bed follows ownership and the actual mine-light conditions, never outdoor night.
  const listener = Object.create(Audio.prototype) as unknown as {
    game: unknown;
    bedWeights(): { torch?: number };
  };
  const soundGame = {
    sim: shop,
    localHero: h.id,
    inSpace: false,
    indoors: false,
    under: true,
    cam: { target: { x: 0, z: 0 } },
  };
  listener.game = soundGame;
  h.torchLit = true;
  assert.equal(listener.bedWeights().torch, 1);
  h.torchLit = false;
  assert.equal(listener.bedWeights().torch, undefined);
  h.torchLit = true;
  h.torchOwned = false;
  assert.equal(listener.bedWeights().torch, undefined);
  h.torchOwned = true;
  soundGame.indoors = true;
  assert.equal(listener.bedWeights().torch, undefined);
  console.log(
    'PASS: dev-only wave pause, preserved deadlines, reinforcements and resume; torch purchase, toggle, saves and LAN; one shadowless light',
  );
});
