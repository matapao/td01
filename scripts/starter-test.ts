import { fixtureHero, fixtureValue } from './game-fixtures.ts';
import { test } from 'node:test';
/** Compact starter layout, entrances and save compatibility. Run: node scripts/starter-test.ts */
import assert from 'node:assert/strict';
import { CRAFTER_KIT, crafterKitPrice } from '../src/game/content.ts';
import { AGES, MILESTONES, MILESTONE_ORDER } from '../src/game/road.ts';
import { shopCatalogue } from '../src/game/shop.ts';
import { occupyFootprint } from '../src/game/systems/footprint.ts';
import { PLAYER_COMMANDS } from '../src/net/protocol.ts';
import { Sim } from '../src/game/sim.ts';
import { MAP, resamplePath } from '../src/game/map.ts';
import { INTERIORS } from '../src/game/interiors.ts';
import { bodyFree } from '../src/game/systems/heroes.ts';
import { benchOf, enterBuilding, frontDoor, leaveBuilding, roomWalkable } from '../src/game/systems/rooms.ts';
import { snapshot, restore } from '../src/game/save.ts';

test('starter', async () => {
  const sim = new Sim();
  assert.equal(sim.state.mines.length, 1);
  assert.equal(sim.state.buildings.length, 2);
  assert.equal(
    sim.props.filter((p) => p.model.startsWith('building_')).length,
    2,
    'mine and stable are scenery; workshop and shop are simulation buildings',
  );
  assert.equal(sim.state.sites.length, 0, 'no watermill blueprint');
  assert.equal(sim.world.bridges.length, 0);
  assert.equal(sim.world.fords.length, 0);
  assert.equal(sim.world.river.xs.length, 0);
  assert.equal(sim.world.brook.xs.length, 0);
  assert(sim.world.heights.every((y) => Number.isFinite(y) && y > MAP.waterLevel));
  assert.equal(resamplePath([], 0.5).xs.length, 0);
  assert.deepEqual([...resamplePath([{ x: 2, z: 3 }], 0.5).xs], [2]);
  sim.step();
  assert.deepEqual(sim.state.discovered, ['market'], 'removed stores must not reappear through exploration');
  const h = fixtureHero(sim);
  const b = fixtureValue(sim.state.buildings[0], 'workshop');
  const room = INTERIORS[b.kind]!;
  assert.equal(room.levels.length, 0, 'starter room is a single storey');
  assert(room.pieces.some((p) => p.kit === 'dungeon' && p.model === 'wall_doorway'));
  for (const p of [h, frontDoor(b), fixtureValue(sim.state.mines[0], 'mine').exit])
    assert(bodyFree(sim, p.x, p.z), 'start and entrances must be walkable');
  enterBuilding(sim, h, b);
  assert(roomWalkable(sim, h.x, h.z));
  const bench = benchOf(b)!;
  assert(roomWalkable(sim, bench.x, bench.z));
  leaveBuilding(sim, h);
  assert(bodyFree(sim, h.x, h.z));
  const saved = snapshot(sim);
  const resumed = new Sim();
  restore(resumed, saved);
  assert.deepEqual(snapshot(resumed), saved, 'new layout saves round-trip');
  const old = snapshot(sim);
  fixtureValue((old.state['nodes'] as { x: number }[])[0], 'legacy node').x += 100;
  const migrated = new Sim();
  restore(migrated, old);
  assert.equal(migrated.state.buildings.length, 2, 'old layouts migrate to the compact yard');
  assert(bodyFree(migrated, fixtureHero(migrated).x, fixtureHero(migrated).z));
  // One atomic tool purchase, including old saves with some tools already owned.
  assert(PLAYER_COMMANDS.has('buyCrafterKit'), 'LAN players can buy the same package');
  assert(
    sim.state.buildings.some((b) => b.kind === 'shop' && b.interior !== undefined),
    'shop must be enterable',
  );
  const shop = new Sim();
  const buyer = fixtureHero(shop);
  const purchase = () => shop.apply({ t: 'buyCrafterKit', hero: buyer.id, store: 'market' });
  shop.state.gold = 100;
  buyer.x = MAP.minX;
  buyer.z = MAP.minZ;
  purchase();
  assert.equal(buyer.tools.length, 0, 'cannot buy from across the map');
  assert.equal(shop.state.gold, 100);
  const shopBuilding = shop.state.buildings.find((b) => b.kind === 'shop')!;
  assert(bodyFree(shop, frontDoor(shopBuilding).x, frontDoor(shopBuilding).z));
  enterBuilding(shop, buyer, shopBuilding);
  assert(roomWalkable(shop, buyer.x, buyer.z));
  const counter = benchOf(shopBuilding)!;
  assert(roomWalkable(shop, counter.x, counter.z));
  buyer.x = buyer.px = counter.x;
  buyer.z = buyer.pz = counter.z;
  shop.state.gold = 33;
  purchase();
  assert.equal(buyer.tools.length, 0, 'insufficient funds must not grant part of the package');
  assert.equal(shop.state.gold, 33);
  shop.state.gold = 100;
  purchase();
  assert.deepEqual(buyer.tools, CRAFTER_KIT.tools);
  assert.equal(shop.state.gold, 66);
  purchase();
  assert.equal(shop.state.gold, 66, 'complete kits cannot be bought twice');
  assert.equal(new Set(buyer.tools).size, 6);
  buyer.tools = ['axe'];
  assert.equal(crafterKitPrice(buyer.tools), 24);
  purchase();
  assert.equal(shop.state.gold, 42, 'credit the axe already owned');
  assert.equal(new Set(buyer.tools).size, 6);
  assert.equal(buyer.tools.length, 6);
  const equipped = new Sim();
  restore(equipped, snapshot(shop));
  assert.deepEqual(fixtureHero(equipped).tools, buyer.tools, 'kit ownership survives save/load');
  console.log(
    'PASS: compact layout, entrances, saves and migration; visible supplies; atomic Crafter Kit purchase, ownership credit and LAN command',
  );

  // The current shop is utility-only in every era; later research stock is deliberately deferred.
  for (let i = 0; i < AGES.length; i++) {
    const ages = AGES.slice(0, i + 1).map((a) => a.id);
    const done = MILESTONE_ORDER.filter((id) => ages.includes(MILESTONES[id].age));
    const stock = shopCatalogue('market', { done, best: {} });
    assert.equal(stock.age, fixtureValue(AGES[i], 'age').id);
    assert.deepEqual(stock.goods, []);
    assert.deepEqual(stock.scrolls, []);
  }
  shop.state.gold = 100;
  shop.apply({ t: 'buy', hero: buyer.id, store: 'market', item: 'ingot' });
  assert.equal(shop.state.gold, 100);
  assert.equal(buyer.bag.ingot ?? 0, 0);
  leaveBuilding(shop, buyer);
  const goldOutside = shop.state.gold;
  shop.apply({ t: 'buy', hero: buyer.id, store: 'market', item: 'wood' });
  assert.equal(shop.state.gold, goldOutside, 'trading requires being inside the shop');
  assert(bodyFree(shop, buyer.x, buyer.z));
  // A two-location save acquires the shop without restarting the mine, gold or learned progress.
  const beforeShop = new Sim();
  const oldShop = beforeShop.state.buildings.find((b) => b.kind === 'shop')!;
  beforeShop.remove(oldShop.id);
  occupyFootprint(beforeShop, oldShop.cx, oldShop.cz, 0, 3);
  beforeShop.compactNow();
  beforeShop.state.gold = 123;
  fixtureValue(beforeShop.state.mines[0], 'legacy mine').open[0] = true;
  const preShopSave = snapshot(beforeShop);
  const updated = new Sim();
  restore(updated, preShopSave);
  assert.equal(updated.state.buildings.filter((b) => b.kind === 'shop').length, 1);
  assert.equal(updated.state.gold, 123);
  assert(fixtureValue(updated.state.mines[0], 'migrated mine').open[0]);
  const storedCounter = updated.state.pois.find((p) => p.store === 'market')!;
  const updatedShop = updated.state.buildings.find((b) => b.kind === 'shop')!;
  assert.equal(storedCounter.x, benchOf(updatedShop)!.x);
  console.log(
    'PASS: shop entrance/counter/exit, utility-only stock, material/outdoor purchase rejection and additive old-save upgrade',
  );
});
