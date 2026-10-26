import { test } from 'node:test';
/** Lazy preparation keeps typed factories paired with their original setup and display metadata. */
import assert from 'node:assert/strict';
import { MINIGAME_NAMES, isMinigameKind } from '../src/ui/minigames/catalogue.ts';
import { loadMinigame } from '../src/ui/minigames/load.ts';
import { milestoneGame } from '../src/ui/minigames/milestones.ts';
import { band, BAND_EXAMPLES } from '../src/ui/minigames/band.ts';
import { ratio, RATIO_DEMOS } from '../src/ui/minigames/ratio.ts';
import { order } from '../src/ui/minigames/order.ts';
import type { BandParams } from '../src/ui/minigames/band.ts';
import type { OrderParams } from '../src/ui/minigames/order.ts';
import type { MinigameDef, MinigameHost } from '../src/ui/minigames/types.ts';

test('minigame loading', async () => {
  const host = {} as MinigameHost; // Factories below are replaced at their typed port; no DOM is used.
  async function parameters<P>(
    def: MinigameDef<P>,
    load: () => ReturnType<typeof milestoneGame>,
  ): Promise<P> {
    const create = def.create;
    let actual: P | undefined;
    def.create = (h, params) => {
      assert.equal(h, host);
      actual = params;
      return { update() {}, dispose() {} };
    };
    try {
      const prepared = await load();
      assert.equal(prepared.name, MINIGAME_NAMES[prepared.kind]);
      prepared.create(host);
      assert(actual);
      return actual;
    } finally {
      def.create = create;
    }
  }
  assert(isMinigameKind('ratio'));
  for (const key of ['constructor', '__proto__', 'not-a-game']) assert(!isMinigameKind(key));
  assert.equal(
    await parameters(ratio, () => milestoneGame('steel')),
    RATIO_DEMOS['steel'],
    'steel must keep its alloy proportions, not fall back to bronze',
  );
  assert.equal(
    await parameters(band, () => milestoneGame('entry')),
    BAND_EXAMPLES.landing,
    'Space entry keeps its landing challenge',
  );
  const feedback: BandParams = await parameters(band, () => milestoneGame('feedback'));
  assert.equal(feedback.label, 'Furnace heat');
  assert.equal(feedback.high?.fails, 'end');
  assert.equal(feedback.low?.fails, 'never');
  const robots: OrderParams = await parameters(order, () => milestoneGame('robots'));
  assert.equal(robots.what, 'a gathering drone');
  assert.deepEqual(robots.parts.find((p) => p.id === 'brain')?.needs, ['sensors', 'motors']);
  const demo = await loadMinigame('ratio');
  assert.equal(demo.age, 'metal', 'the playground keeps the demo setup’s historical age');
  console.log(
    'PASS: lazy kind validation, unchanged alloy/landing setups, custom feedback/robot lessons and playground metadata',
  );
});
