import assert from 'node:assert/strict';
import { test } from 'node:test';
import { earth, type Cut } from '../src/game/excavation.ts';
import { mineBlockCenter } from '../src/game/mine-blocks.ts';
import { MINE_AT } from '../src/game/mines.ts';
import { MAP } from '../src/game/map.ts';
import { TUNNELS, tunnelWorld } from '../src/game/mine-routes.ts';
import { Sim } from '../src/game/sim.ts';

test('guaranteed solid columns agree with exact density and preserve every natural working', () => {
  const field = earth(new Sim());
  assert(!field.solidColumn(MAP.heroStart.x, MAP.heroStart.z), 'surface columns keep their terrain sampler');
  let skipped = 0;
  let open = 0;
  for (let dx = -8; dx <= 16; dx += 0.375)
    for (let dz = -16; dz <= 18; dz += 0.375) {
      const x = MINE_AT.x + dx;
      const z = MINE_AT.z + dz;
      const guaranteed = field.solidColumn(x, z);
      if (guaranteed) skipped++;
      for (let y = -8; y <= 6; y += 0.25) {
        const solid = field.density(x, y, z) > 0;
        if (guaranteed) assert(solid, `solid-column bound rejected a cavity at ${x},${y},${z}`);
        if (!solid) {
          open++;
          assert(!guaranteed, 'an open density sample always retains full column meshing');
        }
      }
    }
  assert(skipped > 1000, 'the bound removes substantial surrounding solid rock work');
  assert(open > 1000, 'the audit includes the hub and substantial open tunnel surfaces');
  assert(!field.solidColumn(MINE_AT.x, MINE_AT.z), 'the lift station remains sampled');
  assert(!field.solidColumn(MINE_AT.x - 3.1, MINE_AT.z), 'the lift shaft remains sampled');
  for (const route of TUNNELS)
    for (const points of [route.points, route.branch])
      for (const point of points) {
        const p = tunnelWorld(point);
        assert(!field.solidColumn(p.x, p.z), `${route.name} retains every authored route point`);
      }
});

test('saved cuts at any height and across column boundaries disable the solid-column shortcut', () => {
  for (const height of [-20, 20]) {
    const sim = new Sim();
    const field = earth(sim);
    const x = mineBlockCenter(MINE_AT.x + 24);
    const z = mineBlockCenter(MINE_AT.z + 24);
    assert(field.solidColumn(x, z), 'the edit fixture starts outside natural workings');
    const cut: Cut = { x, y: height, z, r: 0.19, soil: false };
    field.state.cuts.push(cut);
    assert(!field.solidColumn(x, z), 'new edits disable the bound without a vertical search limit');
    field.sync();
    assert(field.density(x, height, z) < 0, 'the distant-height cut contains actual removed rock');

    const boundary = Math.floor((x + 2) / 2) * 2;
    const across = mineBlockCenter(boundary);
    const edge: Cut = { x: boundary - 0.2, y: height, z, r: 0.19, soil: false };
    field.state.cuts.push(edge);
    assert(!field.solidColumn(across, z), 'the chipped edge margin is indexed across neighboring columns');
  }
});
