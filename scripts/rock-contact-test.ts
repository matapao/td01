import { fixtureHero, fixtureValue } from './game-fixtures.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Sim } from '../src/game/sim.ts';
import { cutDistance, earth, ROCK_CHUNK, type RockField } from '../src/game/excavation.ts';
import {
  MINE_BLOCK_SIZE,
  mineBlockCenter,
  mineBlockCuts,
  mineBlockSamples,
} from '../src/game/mine-blocks.ts';
import { MINE_AT, MINERALS } from '../src/game/mines.ts';
import { rockGeometry, rockGeometryWork } from '../src/view/rockmesh.ts';
import { snapshot, restore } from '../src/game/save.ts';
import type { BufferGeometry } from 'three';
import type { ItemId } from '../src/game/content.ts';
import { MINE_SEAMS } from '../src/game/mine-routes.ts';

function assertBlockFaces(field: RockField, geometry: BufferGeometry, triangles: Set<string>): void {
  const faces = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = fixtureValue(faces.attributes['position'], 'block positions'),
    normals = fixtureValue(faces.attributes['normal'], 'block normals');
  assert.equal(positions.count % 3, 0);
  for (const coordinate of positions.array) {
    assert(Number.isFinite(coordinate));
    assert(Math.abs(coordinate / MINE_BLOCK_SIZE - Math.round(coordinate / MINE_BLOCK_SIZE)) < 0.001);
  }
  for (let i = 0; i < positions.count; i += 3) {
    const normal = [normals.getX(i), normals.getY(i), normals.getZ(i)];
    assert(normal.every(Number.isFinite));
    assert.equal(normal.filter((v) => Math.abs(v) === 1).length, 1, 'one axis owns each flat face');
    assert.equal(normal.filter((v) => v === 0).length, 2, 'mine faces have no smoothed diagonal normals');
    const vertices: string[] = [];
    const center = [0, 0, 0];
    for (let j = i; j < i + 3; j++) {
      const point = [positions.getX(j), positions.getY(j), positions.getZ(j)];
      vertices.push(point.join(','));
      for (let axis = 0; axis < 3; axis++) center[axis]! += point[axis]! / 3;
      assert.deepEqual([normals.getX(j), normals.getY(j), normals.getZ(j)], normal);
    }
    const key = vertices.sort().join('|');
    assert(!triangles.has(key), 'adjacent chunks must not emit duplicate boundary triangles');
    triangles.add(key);
    const offset = MINE_BLOCK_SIZE / 10;
    assert(
      field.density(
        center[0]! - normal[0]! * offset,
        center[1]! - normal[1]! * offset,
        center[2]! - normal[2]! * offset,
      ) > 0,
      'every face has solid rock immediately inside',
    );
    assert(
      field.density(
        center[0]! + normal[0]! * offset,
        center[1]! + normal[1]! * offset,
        center[2]! + normal[2]! * offset,
      ) <= 0,
      'every face borders air, including faces on chunk boundaries',
    );
  }
  if (faces !== geometry) faces.dispose();
}

test('mine picks clear bounded microblock clusters and mesh only exposed square faces', () => {
  const sim = new Sim(),
    h = fixtureHero(sim);
  h.tools = ['pickaxe'];
  h.x = h.px = MINE_AT.x + 1.2;
  h.z = h.pz = MINE_AT.z;
  const f = earth(sim),
    origin = { x: h.x, y: 0.8, z: h.z },
    hit = f.ray(origin, { x: 0, y: 0, z: 1 }, 3)!;
  assert(hit);
  assert.equal(ROCK_CHUNK / MINE_BLOCK_SIZE, 64, 'tiny blocks remain batched inside two metre chunks');
  const cell = [
    Math.floor(hit.x / ROCK_CHUNK),
    Math.floor(hit.y / ROCK_CHUNK),
    Math.floor(hit.z / ROCK_CHUNK),
  ] as const;
  const before = rockGeometry(f, ...cell)!;
  assert(before);
  const center = {
    x: mineBlockCenter(hit.x - (hit.normal.x * MINE_BLOCK_SIZE) / 10),
    y: mineBlockCenter(hit.y - (hit.normal.y * MINE_BLOCK_SIZE) / 10),
    z: mineBlockCenter(hit.z - (hit.normal.z * MINE_BLOCK_SIZE) / 10),
  };
  const planned = mineBlockCuts(hit, false, (x, y, z) => f.density(x, y, z) > 0)[0]!;
  const removed = mineBlockSamples(
    planned,
    (x, y, z) => f.density(x, y, z) > 0,
    (x, y, z) => cutDistance(planned, x, y, z) < 0,
  );
  assert(removed.length > 32, 'a normal stroke removes a useful cluster of tiny blocks');
  const untouched = { x: center.x + 0.25, y: center.y, z: center.z };
  const untouchedDensity = f.density(untouched.x, untouched.y, untouched.z);
  assert(f.density(center.x, center.y, center.z) > 0);
  let event: { x: number; y: number; z: number; volume: number } | undefined;
  sim.events.on('earthHit', (e) => (event = e));
  sim.apply({ t: 'excavate', hero: h.id, x: hit.x, y: hit.y, z: hit.z, tool: 'pickaxe' });
  const cut = sim.state.earth!.cuts[0];
  assert(cut);
  assert.deepEqual({ x: cut.x, y: cut.y, z: cut.z }, center);
  assert.equal(cut.r, 0.09);
  assert.equal(cut.depth, undefined, 'mine strokes save compact spheres sampled at microblock centres');
  assert(
    event && Math.hypot(event.x - hit.x, event.y - hit.y, event.z - hit.z) < 0.003,
    'debris starts at the aimed first surface',
  );
  for (const dx of [-0.49, 0, 0.49])
    for (const dy of [-0.49, 0, 0.49])
      for (const dz of [-0.49, 0, 0.49])
        assert(
          f.density(
            center.x + dx * MINE_BLOCK_SIZE,
            center.y + dy * MINE_BLOCK_SIZE,
            center.z + dz * MINE_BLOCK_SIZE,
          ) < 0,
          'the full block is removed, including all corners',
        );
  for (const point of removed)
    assert(f.density(point.x, point.y, point.z) < 0, 'every harvested block is removed');
  assert.equal(
    f.density(untouched.x, untouched.y, untouched.z) > 0,
    untouchedDensity > 0,
    'distant neighboring occupancy is preserved',
  );
  assert.equal(
    event!.volume,
    removed.length * MINE_BLOCK_SIZE ** 3,
    'yield uses only removed solid microblock volume',
  );
  assert.equal(
    (h.bag.stone ?? 0) + (sim.state.earth!.haul.stone ?? 0),
    event!.volume * 180,
    'stone yield retains all fractional progress from a physical stroke',
  );
  const work = rockGeometryWork(f, ...cell);
  let result = work.next(),
    steps = 1,
    maxStep = 0;
  while (!result.done) {
    const t = performance.now();
    result = work.next();
    maxStep = Math.max(maxStep, performance.now() - t);
    steps++;
  }
  const after = result.value!;
  assert(after);
  assert(steps > 100, 'sampling and meshing yield bounded rows, not whole chunks');
  assert.notDeepEqual(
    fixtureValue(after.attributes['position'], 'cut positions').array,
    fixtureValue(before.attributes['position'], 'uncut positions').array,
    'removing tiny blocks changes visible geometry',
  );
  const triangles = new Set<string>();
  assertBlockFaces(f, after, triangles);
  const cuts = sim.state.earth!.cuts.length;
  h.earthAt = -1;
  sim.apply({ t: 'excavate', hero: h.id, x: hit.x, y: hit.y, z: hit.z + 0.7, tool: 'pickaxe' });
  assert.equal(
    sim.state.earth!.cuts.length,
    cuts,
    'a hidden interior target cannot be excavated through the face',
  );
  h.earthAt = -1;
  const fresh = f.ray(origin, { x: 0, y: 0, z: 1 }, 3)!;
  assert(fresh);
  assert(
    fresh.distance - hit.distance >= MINE_BLOCK_SIZE && fresh.distance - hit.distance < 0.16,
    'the next exposed face advances by several tiny block layers',
  );
  sim.apply({ t: 'excavate', hero: h.id, x: fresh.x, y: fresh.y, z: fresh.z, tool: 'pickaxe' });
  assert.equal(sim.state.earth!.cuts.length, cuts + 1);
  assert(
    f.density(center.x, center.y, fresh.z + MINE_BLOCK_SIZE) < 0,
    'repeated strikes dig farther into the block terrain',
  );
  const copy = new Sim();
  restore(copy, snapshot(sim));
  assert.deepEqual(copy.state.earth, sim.state.earth);
  assert.equal(earth(copy).density(center.x, center.y, center.z), f.density(center.x, center.y, center.z));
  before.dispose();
  after.dispose();
  // Audit both sides of a real chunk boundary. Interior solid-to-solid faces must be absent.
  triangles.clear();
  const left = rockGeometry(f, 880, 0, -210)!,
    right = rockGeometry(f, 881, 0, -210)!;
  assert(left && right);
  assertBlockFaces(f, left, triangles);
  assertBlockFaces(f, right, triangles);
  assert(triangles.size > 100, 'both neighboring chunks contain exposed block terrain');
  left.dispose();
  right.dispose();
  console.log(
    `PASS: tiny block clusters, bounded strokes, exact debris origin, culled axial faces, exposed-face validation, repeated depth and saved geometry; ${steps} mesh slices, largest measured slice ${maxStep.toFixed(2)} ms (local machine only)`,
  );
});

test('microblock harvest keeps mixed seam yield and never pays twice for removed cells', () => {
  const sim = new Sim();
  const h = fixtureHero(sim);
  const field = earth(sim);
  const seam = MINE_SEAMS[0]!;
  h.tools = ['pickaxe'];
  h.bag = {};
  h.x = h.px = seam.x - 0.6;
  h.z = h.pz = seam.z - 0.3;
  const totalYield = new Map<ItemId, number>();
  const removedCells = new Set<string>();
  for (let stroke = 0; stroke < 2; stroke++) {
    h.earthAt = -1;
    const hit = field.ray({ x: h.x, y: field.floor(h.x, h.z) + 0.5, z: h.z }, { x: 0, y: 1, z: 0 }, 3);
    assert(hit);
    const cut = mineBlockCuts(hit, true, (x, y, z) => field.density(x, y, z) > 0)[0]!;
    const samples = mineBlockSamples(
      cut,
      (x, y, z) => field.density(x, y, z) > 0,
      (x, y, z) => cutDistance(cut, x, y, z) < 0,
    );
    const volume = samples.length * MINE_BLOCK_SIZE ** 3;
    const perVolume = Math.min(180, 3 / volume);
    for (const cell of samples) {
      const key = `${cell.x},${cell.y},${cell.z}`;
      assert(!removedCells.has(key), 'later strokes cannot harvest a previously removed microcell');
      removedCells.add(key);
      const item = MINERALS[field.mineral(cell.x, cell.y, cell.z)].item;
      totalYield.set(item, (totalYield.get(item) ?? 0) + MINE_BLOCK_SIZE ** 3 * perVolume);
    }
    assert(totalYield.has('stone') && totalYield.has('coal'), 'the fixture crosses an ore boundary');
    sim.apply({ t: 'excavate', hero: h.id, x: hit.x, y: hit.y, z: hit.z, tool: 'pickaxe', wide: true });
    assert.equal(field.state.cuts.length, stroke + 1);
    for (const [item, expected] of totalYield)
      assert(
        Math.abs((h.bag[item] ?? 0) + (field.state.haul[item] ?? 0) - expected) < 1e-10,
        'each resource is awarded for its actual removed microcells',
      );
  }
});
