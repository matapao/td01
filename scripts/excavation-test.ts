import { fixtureHero } from './game-fixtures.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/game/sim.ts';
import { earth, earthWalkable, scannerReadings } from '../src/game/excavation.ts';
import { MINE_AT, MINERALS } from '../src/game/mines.ts';
import { snapshot, restore } from '../src/game/save.ts';
import { updateNodes } from '../src/game/systems/craft.ts';
import { rockGeometry } from '../src/view/rockmesh.ts';
import { groundHeight, MAP, sampleHeights } from '../src/game/map.ts';
import { MINE_BLOCK_SIZE, mineBlockCenter } from '../src/game/mine-blocks.ts';
import { MINE_SEAMS, TUNNELS, tunnelWorld } from '../src/game/mine-routes.ts';
import { minePath } from '../src/game/systems/mining.ts';

test('excavation', async () => {
  const sim = new Sim(),
    h = fixtureHero(sim);
  h.tools = ['axe', 'pickaxe', 'shovel', 'hammer', 'scanner', 'seedPouch'];
  assert.equal(
    sim.state.camps.filter((c) => c.tunnel !== undefined).length,
    6,
    'two occupied pockets per route',
  );
  assert(
    sim.state.camps.every((c) => !c.lair),
    'no legacy preset mine lairs',
  );
  assert(
    sim.state.nodes.filter((n) => n.x < 1500 && n.z > -3000).every((n) => n.kind === 'tree'),
    'resources come from terrain, not rock props',
  );
  assert(sim.state.nodes.filter((n) => n.kind === 'tree').length >= 12, 'trees spread throughout the yard');
  const tree = sim.state.nodes.find(
    (n) => n.kind === 'tree' && Math.hypot(n.x - MAP.workshops.x, n.z - MAP.workshops.z) > 3,
  )!;
  tree.amount = 0;
  tree.regrowT = 1;
  updateNodes(sim, 500);
  assert.equal(tree.amount, 0, 'trees never regrow on their own');
  h.x = tree.x + 0.6;
  h.z = tree.z;
  sim.apply({ t: 'plant', hero: h.id, x: tree.x, z: tree.z });
  assert(tree.prepared && !tree.planted);
  sim.apply({ t: 'plant', hero: h.id, x: tree.x, z: tree.z });
  assert(tree.planted);
  updateNodes(sim, 89);
  assert.equal(tree.amount, 0);
  updateNodes(sim, 2);
  assert.equal(tree.amount, tree.max);
  tree.amount = 0;
  updateNodes(sim, 500);
  assert.equal(tree.amount, 0, 'each felling requires another seed');
  const seedCount = sim.state.nodes.length;
  h.x = 0;
  h.z = 0;
  sim.apply({ t: 'plant', hero: h.id, x: 0, z: 0 });
  sim.apply({ t: 'plant', hero: h.id, x: 0, z: 0 });
  assert.equal(sim.state.nodes.length, seedCount + 1, 'planting can establish a new tree on green ground');
  assert(!('soil' in h.bag), 'no soil resource');
  h.x = MINE_AT.x + 1.2;
  h.z = MINE_AT.z;
  h.px = h.x;
  h.pz = h.z;
  h.earthAt = -1;
  let f = earth(sim);
  assert(f.density(MINE_AT.x, 1, MINE_AT.z) < 0);
  assert(f.density(MINE_AT.x + 5, 4, MINE_AT.z) > 0);
  assert(earthWalkable(sim, MINE_AT.x, MINE_AT.z));
  const hit = f.ray({ x: h.x, y: 0.8, z: h.z }, { x: 0, y: 0, z: 1 }, 4)!;
  assert(hit);
  const remote = f.density(MINE_AT.x + 10, 0.8, MINE_AT.z);
  let impacts = 0;
  sim.events.on('earthHit', () => impacts++);
  sim.apply({ t: 'excavate', hero: h.id, x: hit.x, y: hit.y, z: hit.z, tool: 'pickaxe' });
  assert.equal(impacts, 1);
  assert.equal(sim.state.earth!.cuts.length, 1);
  assert(f.density(hit.x, hit.y, hit.z) < 0, 'a complete small mine block is removed');
  assert.equal(f.density(MINE_AT.x + 10, 0.8, MINE_AT.z), remote, 'far rock does not regenerate or change');
  sim.apply({ t: 'excavate', hero: h.id, x: hit.x, y: hit.y, z: hit.z, tool: 'pickaxe' });
  assert.equal(impacts, 1, 'strikes are paced');
  const saved = snapshot(sim);
  const copy = new Sim();
  restore(copy, saved);
  assert.deepEqual(
    copy.state.nodes.filter((n) => n.kind === 'tree'),
    sim.state.nodes.filter((n) => n.kind === 'tree'),
    'planted trees and felled stumps must persist without a world reset',
  );
  assert.deepEqual(copy.state.earth, sim.state.earth);
  assert.equal(earth(copy).density(hit.x, hit.y, hit.z), f.density(hit.x, hit.y, hit.z));
  const readings = scannerReadings(sim, h);
  assert(readings.length > 0);
  assert(readings.every((p) => p.low <= p.high && p.distance < 12));
  const geo = rockGeometry(f, Math.floor(hit.x / 2), 0, Math.floor(hit.z / 2));
  assert(geo);
  const position = geo.getAttribute('position'),
    normal = geo.getAttribute('normal');
  assert(position && normal);
  assert(position.count > 0);
  assert(Array.from(position.array).every(Number.isFinite));
  assert(Array.from(normal.array).every(Number.isFinite));
  geo.dispose();
  // Mine quantization must not change smooth surface density or painted mountain normals.
  const surface = MAP.heroStart;
  const surfaceHeight = sampleHeights(sim.world.heights, surface.x, surface.z);
  assert(Number.isFinite(groundHeight(sim.world, surface.x, surface.z)));
  assert(Math.abs(f.density(surface.x, surfaceHeight - 0.01, surface.z) - 0.01) < 1e-8);
  assert(Math.abs(f.density(surface.x, surfaceHeight + 0.01, surface.z) + 0.01) < 1e-8);
  const surfaceMesh = rockGeometry(
    f,
    Math.floor(surface.x / 2),
    Math.floor(surfaceHeight / 2),
    Math.floor(surface.z / 2),
  );
  assert(surfaceMesh);
  assert(
    Array.from(surfaceMesh.getAttribute('position').array).some(
      (v) => Math.abs(v / MINE_BLOCK_SIZE - Math.round(v / MINE_BLOCK_SIZE)) > 0.01,
    ),
    'surface vertices retain continuous positions',
  );
  assert(
    Array.from(surfaceMesh.getAttribute('normal').array).some(
      (v) => Math.abs(v) > 0.01 && Math.abs(v) < 0.99,
    ),
    'surface normals retain smooth slopes',
  );
  surfaceMesh.dispose();
  const before = sim.state.earth!.cuts.length;
  sim.apply({ t: 'excavate', hero: h.id, x: NaN, y: 0, z: 0, tool: 'pickaxe' });
  assert.equal(sim.state.earth!.cuts.length, before);
  console.log(
    'PASS: permanent precise excavation, paced impacts, small block mesh, scan estimates, non-regrowing trees, shovel/seed cycle, new planting and save persistence',
  );
  // Network updates append only new cuts, preserving local field caches and permanent geometry.
  const { DeltaTracker, applyDelta } = await import('../src/net/protocol.ts');
  const mirror = new Sim();
  restore(mirror, snapshot(sim));
  const tracker = new DeltaTracker(sim.state);
  const identity = mirror.state.earth;
  const legacyCut = {
    x: mineBlockCenter(MINE_AT.x + 5),
    y: mineBlockCenter(4),
    z: mineBlockCenter(MINE_AT.z),
    r: 0.2,
    soil: false,
  };
  assert(
    f.density(legacyCut.x, legacyCut.y, legacyCut.z) > 0,
    'the legacy spherical edit starts in solid rock',
  );
  const legacyFlake = { ...legacyCut, x: legacyCut.x + 0.5, r: 0.1, nx: 0, ny: 0, nz: 1, depth: 0.07 };
  assert(
    f.density(legacyFlake.x, legacyFlake.y, legacyFlake.z) > 0,
    'the legacy shallow edit starts in solid rock',
  );
  sim.state.earth!.cuts.push(legacyCut, legacyFlake);
  const delta = tracker.diff(sim.state);
  assert.equal(delta.ec!.length, 2);
  assert(!delta.s?.['earth']);
  applyDelta(mirror, structuredClone(delta));
  assert.equal(mirror.state.earth, identity);
  assert.deepEqual(mirror.state.earth!.cuts, sim.state.earth!.cuts);
  f.sync();
  assert(
    earth(mirror).density(legacyCut.x, legacyCut.y, legacyCut.z) < 0,
    'incremental legacy spherical cuts remove the corresponding blocks',
  );
  assert.equal(
    earth(mirror).density(legacyCut.x, legacyCut.y, legacyCut.z),
    f.density(legacyCut.x, legacyCut.y, legacyCut.z),
  );
  const legacyCopy = new Sim();
  restore(legacyCopy, snapshot(sim));
  assert.deepEqual(
    legacyCopy.state.earth,
    sim.state.earth,
    'old spherical and shallow cuts keep their serialized shape',
  );
  assert(
    earth(legacyCopy).density(legacyCut.x, legacyCut.y, legacyCut.z) < 0,
    'old spherical cuts restore as permanent block cavities',
  );
  assert(
    earth(mirror).density(legacyFlake.x, legacyFlake.y, legacyFlake.z) < 0,
    'legacy shallow cuts also update block occupancy incrementally',
  );
  assert(
    earth(legacyCopy).density(legacyFlake.x, legacyFlake.y, legacyFlake.z) < 0,
    'legacy shallow cuts restore permanently',
  );
  const oldest = snapshot(new Sim());
  delete oldest.state['earth'];
  const untouchedCopy = new Sim();
  restore(untouchedCopy, oldest);
  assert.equal(
    earth(untouchedCopy).state.cuts.length,
    0,
    'saves predating excavation default to untouched terrain',
  );
  // Audit natural terrain access on the village side: only actual scenery/structures block it.
  let audited = 0;
  const { insideWalls, wallAt } = await import('../src/game/map.ts');
  const { bodyFree } = await import('../src/game/systems/heroes.ts');
  for (let z = -10; z <= 10; z += 2)
    for (let x = -10; x <= 18; x += 2) {
      if (
        !insideWalls(x, z) ||
        wallAt(x, z) ||
        sim.state.buildings.some((b) => Math.hypot(b.x - x, b.z - z) < 3) ||
        sim.collides(x, z, 0.3)
      )
        continue;
      assert(bodyFree(sim, x, z), `natural terrain unexpectedly blocked at ${x},${z}`);
      audited++;
    }
  assert(audited > 50);
  console.log(
    `PASS: incremental LAN excavation, stable field identity, ${audited} natural terrain access points`,
  );
});

test('scanner follows remaining authored ore in tunnel walls even when its centre is already air', () => {
  for (let index = 0; index < 2; index++) {
    const sim = new Sim();
    const h = fixtureHero(sim);
    h.tools = ['pickaxe', 'scanner'];
    const field = earth(sim);
    const seam = MINE_SEAMS[index]!;
    const route = TUNNELS[index]!;
    const approach = tunnelWorld(route.points[1]!);
    h.x = h.px = approach.x;
    h.z = h.pz = approach.z;
    const matches = (reading: { x: number; y: number; z: number }) =>
      reading.x === seam.x && reading.y === seam.y && reading.z === seam.z;
    assert(
      field.density(seam.x, seam.y, seam.z) <= 0,
      'the old tunnel has already opened the deposit centre',
    );
    const distant = scannerReadings(sim, h).find(matches);
    assert(distant, `${MINERALS[seam.mineral].name} remains detectable in the wall`);
    assert(minePath(sim, MINE_AT.x - 3.1, MINE_AT.z, seam.x, seam.z), 'the reading has a connected approach');
    assert(earthWalkable(sim, seam.x, seam.z));
    h.x = h.px = seam.x;
    h.z = h.pz = seam.z;
    const near = scannerReadings(sim, h).find(matches);
    assert(near && near.distance < distant.distance, 'following the bearing brings the scanner closer');
    const origin = { x: h.x, y: field.floor(h.x, h.z) + 0.5, z: h.z };
    const contact = field.ray(origin, { x: 0, y: 1, z: 0 }, 3);
    assert(contact, 'ore is exposed in a reachable roof face');
    assert.equal(field.mineral(contact.x, contact.y, contact.z), seam.mineral);
    sim.apply({
      t: 'excavate',
      hero: h.id,
      x: contact.x,
      y: contact.y,
      z: contact.z,
      tool: 'pickaxe',
      wide: true,
    });
    assert.equal(
      field.state.cuts.length,
      1,
      'the detected seam accepts an authoritative exposed-face stroke',
    );
    const item = MINERALS[seam.mineral].item;
    assert(
      (h.bag[item] ?? 0) + (field.state.haul[item] ?? 0) > 0,
      'following the scan produces the indicated mineral',
    );
    // Simulate complete depletion with the same saved-cut format used by blasting.
    field.state.cuts.push({ x: seam.x, y: seam.y, z: seam.z, r: seam.r + 0.1, soil: false });
    field.sync();
    assert(!scannerReadings(sim, h).some(matches), 'a fully excavated deposit no longer emits a reading');
    const copy = new Sim();
    restore(copy, snapshot(sim));
    const restored = fixtureHero(copy);
    assert(!scannerReadings(copy, restored).some(matches), 'depleted readings stay absent after restore');
  }
});
