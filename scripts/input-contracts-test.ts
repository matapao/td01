import { fixtureHero } from './game-fixtures.ts';
import { test } from 'node:test';
/** Behavior at the extracted command ports, without a renderer or live browser. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Sim } from '../src/game/sim.ts';
import { snapshot } from '../src/game/save.ts';
import type { Command } from '../src/game/types.ts';
import { MINE_AT } from '../src/game/mines.ts';
import { earth } from '../src/game/excavation.ts';
import { enterBuilding, benchOf } from '../src/game/systems/rooms.ts';
import { spawnEnemy } from '../src/game/systems/enemies.ts';
import { UiState } from '../src/ui/state.ts';
import type { InputContext } from '../src/view/controls/context.ts';
import { MovementControls } from '../src/view/controls/movement.ts';
import { InteractionActions } from '../src/view/controls/interactions.ts';
import { CombatControls } from '../src/view/controls/combat.ts';
import { findPrompt } from '../src/view/controls/prompts.ts';
import type { Game } from '../src/view/game.ts';

test('input contracts', async () => {
  const sim = new Sim(),
    hero = fixtureHero(sim),
    ui = new UiState(hero.id);
  const commands: Command[] = [];
  const camera = new THREE.PerspectiveCamera();
  const game = {
    sim,
    indoors: false,
    cam: { look: 0, forward: { x: 0, z: 1 }, turn() {}, orbit() {}, zoom() {} },
    stage: { camera },
    mines: { pickRock: () => hit },
  } as unknown as Game; // Only the explicitly used view ports are fixture doubles.
  const host: InputContext = {
    game,
    ui,
    hero,
    cmd: (c) => commands.push(c),
    select: (s) => {
      ui.selected = s;
    },
    cancelModes() {
      ui.placing = null;
      ui.placingGem = null;
      ui.targeting = null;
    },
    onWorkshop() {
      throw Error('tool use must not open the workshop');
    },
    onOverview() {
      throw Error('tool use must not open the overview');
    },
  };
  const modes = { activityOpen: false, blastArmed: false };
  const dom = Object.assign(new EventTarget(), {
    clientWidth: 1280,
    clientHeight: 800,
  }) as unknown as HTMLElement;
  const descriptors = Object.fromEntries(
    ['window', 'document'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
  );
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: Object.assign(new EventTarget(), { pointerLockElement: null }),
  });
  let hit: THREE.Vector3 | null = null;
  try {
    const movement = new MovementControls(host, modes, dom, { leftClick() {}, rightClick() {}, key() {} });
    movement.setKey('KeyW', true);
    const before = snapshot(sim);
    movement.update(0.05);
    assert(commands.some((c) => c.t === 'pose' && c.moving && c.z > hero.z));
    assert.deepEqual(
      snapshot(sim),
      before,
      'movement sends poses through the command port, never writes the hero',
    );
    commands.length = 0;
    modes.activityOpen = true;
    movement.update(0.05);
    assert.equal(commands.length, 0, 'open activities lock movement');
    movement.clearMovement();
    modes.activityOpen = false;
    movement.update(0.05);
    assert.equal(commands.length, 0, 'closing an activity cannot resume a stale held key');
    movement.setKey('KeyW', true);
    window.dispatchEvent(new Event('blur'));
    movement.update(0.05);
    assert.equal(commands.length, 0, 'losing browser focus releases movement keys');
    movement.setKey('KeyW', true);
    hero.transit = {
      kind: 'door',
      t: 0,
      duration: 1,
      from: { x: hero.x, z: hero.z },
      edge: { x: hero.x, z: hero.z },
      switched: false,
    };
    movement.update(0.05);
    assert.equal(commands.length, 0, 'saved door/lift transit locks movement');
    delete hero.transit;
  } finally {
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }

  hero.x = hero.px = MINE_AT.x + 1.2;
  hero.z = hero.pz = MINE_AT.z;
  hero.facing = 0;
  hero.tools = ['pickaxe'];
  const contact = earth(sim).ray({ x: hero.x, y: 0.8, z: hero.z }, { x: 0, y: 0, z: 1 }, 3)!;
  assert(contact);
  hit = new THREE.Vector3(contact.x, contact.y, contact.z);
  const actions = new InteractionActions(host, modes, () => true, dom);
  const beforeTool = snapshot(sim);
  actions.useTerrain(640, 400);
  assert.deepEqual(commands.at(-1), {
    t: 'excavate',
    hero: hero.id,
    x: hit.x,
    y: hit.y,
    z: hit.z,
    tool: 'pickaxe',
    wide: true,
  });
  assert.deepEqual(snapshot(sim), beforeTool, 'aiming submits a command without digging directly');
  modes.blastArmed = true;
  actions.useTerrain(640, 400);
  assert.equal(commands.at(-1)?.t, 'blast');
  assert.equal(modes.blastArmed, false, 'one aimed click consumes placement mode');
  actions.useTool();
  assert.equal(commands.at(-1)?.t, 'excavate', 'X stays a tool action even beside a lift or bench');

  const workshop = sim.state.buildings.find((b) => b.kind === 'anvil')!;
  enterBuilding(sim, hero, workshop);
  Object.assign(hero, benchOf(workshop));
  const beforePrompt = snapshot(sim);
  assert.deepEqual(findPrompt(game, hero)?.sel, { kind: 'building', id: workshop.id });
  assert.deepEqual(snapshot(sim), beforePrompt, 'prompt discovery is read-only');

  hero.x = hero.px = 0;
  hero.z = hero.pz = 0;
  const near = spawnEnemy(sim, 'minion', 0, 0),
    far = spawnEnemy(sim, 'minion', 0, 0);
  Object.assign(near, { x: 0, z: 2, spawnT: 0 });
  Object.assign(far, { x: 0, z: 2.1, spawnT: 0 });
  const combat = new CombatControls(host);
  ui.selected = null;
  const selectionId = () => ui.selected?.id;
  combat.nextTarget();
  assert.equal(selectionId(), near.id);
  combat.nextTarget();
  assert.equal(selectionId(), far.id, 'Tab advances through nearby targets');
  commands.length = 0;
  combat.cast('slam');
  assert.deepEqual(commands.at(-1), { t: 'cast', hero: hero.id, ability: 'slam', target: far.id });
  hero.cds.slam = 1;
  combat.cast('slam');
  assert.equal(commands.length, 1, 'a recharging skill does not submit another cast');
  combat.stopFighting();
  assert.equal(ui.selected, null);
  assert.deepEqual(commands.at(-1), { t: 'stop', hero: hero.id, peace: true });
  console.log(
    'PASS: movement locks/focus, command-only aimed tools, read-only bench prompts and combat target cycling',
  );
});
