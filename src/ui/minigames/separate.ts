export type { SeparatePart } from './separate-data.ts';
export type { SeparateWords } from './separate-data.ts';
export type { SeparateParams } from './separate-data.ts';
export { SEPARATE_EXAMPLES } from './separate-data.ts';
import { SEPARATE_EXAMPLES } from './separate-data.ts';
import type { SeparateParams } from './separate-data.ts';
/**
 * Separate (TECH_LINEAGE §4): sort or purify a mixture by the one property that tells its parts apart.
 *
 * - 'pan': swirl the pan (drag round and round) — the water lifts light grains over the rim while
 *   heavy ones sink and stay. Too gentle and the sand stays; too hard and the gold goes too.
 * - 'sieve': shake the stack of sieves (drag side to side, or ← →) — grains smaller than a mesh fall
 *   through it. Too gentle and nothing falls; too hard and grains fly over the edge.
 * - 'distil': hold to stoke the fire under the still — a part boils off when the heat passes its
 *   boiling point and drips into the jar. Hold the heat between the boiling points.
 * - 'zone': drag the hot ring along the rod, pass after pass — impurities stay in the molten zone and
 *   ride with it to the far end, which is cut off. Steady and not too fast.
 *
 * Pure enough is good; purer, with little lost, is perfect. The playground runs the demo;
 * `?minigame=separate&demo=<name>` runs one of SEPARATE_EXAMPLES instead.
 */
import type { MinigameDef } from './types.ts';
import { createPan } from './separate-pan.ts';
import { createSieve } from './separate-sieve.ts';
import { createDistil } from './separate-distil.ts';
import { createZone } from './separate-zone.ts';

/** The playground's set-up: `?demo=<name>` picks an example. */
function pickDemo(): SeparateParams {
  const name = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('demo');
  return name && Object.hasOwn(SEPARATE_EXAMPLES, name)
    ? SEPARATE_EXAMPLES[name as keyof typeof SEPARATE_EXAMPLES]
    : SEPARATE_EXAMPLES['pan'];
}

export const separate: MinigameDef<SeparateParams> = {
  kind: 'separate',
  name: 'Separate',
  demo: pickDemo(),
  create: (host, p) => {
    switch (p.style) {
      case 'sieve':
        return createSieve(host, p);
      case 'distil':
        return createDistil(host, p);
      case 'zone':
        return createZone(host, p);
      default:
        return createPan(host, p);
    }
  },
};

// ---- Shared ---------------------------------------------------------------------------------------
