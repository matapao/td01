import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MINE_BLOCK_SIZE,
  mineBlockCenter,
  mineBlockCuts,
  mineBlockRay,
  mineBlockSamples,
} from '../src/game/mine-blocks.ts';
import { Sim } from '../src/game/sim.ts';
import { cutDistance, earth, earthWalkable } from '../src/game/excavation.ts';
import { MINE_AT } from '../src/game/mines.ts';
import { MINE_SEAMS, TUNNELS, tunnelWorld } from '../src/game/mine-routes.ts';
import { minePath } from '../src/game/systems/mining.ts';

const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
const center = (cell: number) => (cell + 0.5) * MINE_BLOCK_SIZE;
const pointKey = (x: number, y: number, z: number) =>
  cellKey(Math.floor(x / MINE_BLOCK_SIZE), Math.floor(y / MINE_BLOCK_SIZE), Math.floor(z / MINE_BLOCK_SIZE));

test('corner rays retain the occupied visited cell and an exposed face in both directions', () => {
  for (const direction of [-1, 1])
    for (const diagonalOnly of [false, true]) {
      const first = direction > 0 ? 0 : -1;
      const crossed = first + direction;
      const target = { x: crossed, y: diagonalOnly ? crossed : first, z: first };
      const solid = (x: number, y: number, z: number) =>
        pointKey(x, y, z) === cellKey(target.x, target.y, target.z);
      const origin = { x: center(first), y: center(first), z: center(first) };
      const dir = { x: direction * Math.SQRT1_2, y: direction * Math.SQRT1_2, z: 0 };
      assert.equal(
        mineBlockRay(origin, dir, MINE_BLOCK_SIZE / 2, solid),
        null,
        'rays stop at their supplied reach',
      );
      const hit = mineBlockRay(origin, dir, MINE_BLOCK_SIZE * 3, solid);
      assert(
        hit,
        `${direction > 0 ? 'positive' : 'negative'} ${diagonalOnly ? 'diagonal' : 'intermediate'} cell is hit`,
      );
      assert(solid(hit.x, hit.y, hit.z), 'a tied crossing reports a point inside its visited occupied cell');
      assert.deepEqual(
        hit.normal,
        diagonalOnly ? { x: 0, y: -direction, z: 0 } : { x: -direction, y: 0, z: 0 },
      );
      assert(
        !solid(
          hit.x + hit.normal.x * MINE_BLOCK_SIZE,
          hit.y + hit.normal.y * MINE_BLOCK_SIZE,
          hit.z + hit.normal.z * MINE_BLOCK_SIZE,
        ),
        'the normal points into the preceding empty cell',
      );
      const cuts = mineBlockCuts(hit, false, solid);
      assert.equal(cuts.length, 1, 'the hit remains a valid exposed block for the authoritative pick');
      assert.deepEqual(cuts[0], {
        x: center(target.x),
        y: center(target.y),
        z: center(target.z),
        r: 0.09,
        soil: false,
      });
      assert.equal(mineBlockCenter(hit.x), center(target.x));
      assert.equal(mineBlockCenter(hit.y), center(target.y));
    }
});

test('microblock strokes keep their physical size and save one bounded edit', () => {
  assert.equal(MINE_BLOCK_SIZE, 0.03125, 'blocks are four times smaller per side than the previous mine');
  for (const normalX of [-1, 1]) {
    const plane = normalX < 0 ? 2 : -3;
    const solid = (x: number) =>
      normalX < 0 ? x >= plane * MINE_BLOCK_SIZE : x < (plane + 1) * MINE_BLOCK_SIZE;
    const hit = {
      x: center(plane) + normalX * (MINE_BLOCK_SIZE / 2 - 0.000001),
      y: center(0),
      z: center(0),
      normal: { x: normalX, y: 0, z: 0 },
    };
    let preciseCount = 0;
    for (const wide of [false, true]) {
      const cuts = mineBlockCuts(hit, wide, solid);
      assert.equal(cuts.length, 1, 'each stroke persists as one compact edit');
      const cut = cuts[0]!;
      assert.equal(cut.r, wide ? 0.19 : 0.09);
      assert.deepEqual({ x: cut.x, y: cut.y, z: cut.z }, { x: center(plane), y: center(0), z: center(0) });
      const removed = mineBlockSamples(cut, solid, (x, y, z) => cutDistance(cut, x, y, z) < 0);
      assert(
        removed.length >= 32,
        'a stroke clears many tiny blocks rather than multiplying the gathering grind',
      );
      assert.equal(new Set(removed.map((p) => pointKey(p.x, p.y, p.z))).size, removed.length);
      for (const sample of removed) {
        assert(solid(sample.x), 'air does not count toward harvested volume');
        assert(cutDistance(cut, sample.x, sample.y, sample.z) < 0);
        assert(Math.hypot(sample.x - cut.x, sample.y - cut.y, sample.z - cut.z) < cut.r + 0.025);
        assert.equal(mineBlockCenter(sample.x), sample.x);
        assert.equal(mineBlockCenter(sample.y), sample.y);
        assert.equal(mineBlockCenter(sample.z), sample.z);
      }
      const volume = removed.length * MINE_BLOCK_SIZE ** 3;
      assert(volume > (wide ? 0.005 : 0.0008));
      assert(volume < (wide ? 0.03 : 0.003));
      if (wide) assert(removed.length > preciseCount * 4, 'Shift clears a substantially wider patch');
      else preciseCount = removed.length;
    }
    assert.deepEqual(
      mineBlockCuts(hit, false, () => true),
      [],
      'a covered target is rejected',
    );
    assert.deepEqual(
      mineBlockCuts(hit, false, () => false),
      [],
      'an empty target is rejected',
    );
  }
});

test('mine walkability rejects visible solid cells while preserving connected working routes', () => {
  const sim = new Sim();
  const field = earth(sim);
  const blocked = { x: MINE_AT.x - 2.125, z: MINE_AT.z - 1.25 };
  assert(
    field.density(blocked.x, field.floor(blocked.x, blocked.z) + 0.65, blocked.z) > 0,
    'the edge regression fixture contains a solid head cell',
  );
  assert(!earthWalkable(sim, blocked.x, blocked.z), 'small positive density is solid underground');
  let walkable = 0;
  const audit = (x: number, z: number) => {
    if (!earthWalkable(sim, x, z)) return;
    const y = field.floor(x, z);
    assert(field.density(x, y + 0.18, z) <= 0, `walkable feet overlap visible rock at ${x},${z}`);
    assert(field.density(x, y + 0.65, z) <= 0, `walkable head overlaps visible rock at ${x},${z}`);
    walkable++;
  };
  for (let x = -3; x <= 4; x += 0.125)
    for (let z = -3; z <= 3; z += 0.125) audit(MINE_AT.x + x, MINE_AT.z + z);
  for (const route of TUNNELS)
    for (const points of [route.points, route.branch])
      for (const point of points) {
        const world = tunnelWorld(point);
        assert(earthWalkable(sim, world.x, world.z), `${route.name} remains open at its authored waypoints`);
        audit(world.x, world.z);
      }
  assert(walkable > 500, 'the bounded hub scan includes substantial open walkable space');
  assert(
    minePath(sim, MINE_AT.x - 3.1, MINE_AT.z, MINE_AT.x + 6, MINE_AT.z - 12),
    'the lift remains connected to the copper working',
  );
});

test('each small block keeps one mineral across contacts near authored seam boundaries', () => {
  const field = earth(new Sim());
  let mineralBlocks = 0;
  for (const seam of MINE_SEAMS)
    for (const boundary of [false, true]) {
      const block = {
        x: mineBlockCenter(seam.x + (boundary ? seam.r - 0.02 : 0)),
        y: mineBlockCenter(seam.y),
        z: mineBlockCenter(seam.z),
      };
      const mineral = field.mineral(block.x, block.y, block.z);
      if (mineral !== 0) mineralBlocks++;
      for (const dx of [-0.49, 0.49])
        for (const dy of [-0.49, 0.49])
          for (const dz of [-0.49, 0.49])
            assert.equal(
              field.mineral(
                block.x + dx * MINE_BLOCK_SIZE,
                block.y + dy * MINE_BLOCK_SIZE,
                block.z + dz * MINE_BLOCK_SIZE,
              ),
              mineral,
              'paint, contact and yield identify the same mineral throughout the block',
            );
    }
  assert(mineralBlocks >= 3, 'the coherence fixtures include authored ore blocks');
});
