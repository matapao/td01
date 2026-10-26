/** Labels and kind validation stay tiny; implementations are imported only when played. */
import type { MinigameKind } from './types.ts';
export const MINIGAME_NAMES = {
  band: 'Hold the band',
  ratio: 'Mix the ratio',
  sizes: 'Pick the sizes',
  path: 'Lay the path',
  beat: 'Keep the beat',
  steady: 'Steady hand',
  separate: 'Separate',
  order: 'Build in order',
  decide: 'Decide',
  sweet: 'Find the sweet spot',
  observe: 'Test & observe',
  encode: 'Encode',
} as const satisfies Record<MinigameKind, string>;
export const isMinigameKind = (value: string): value is MinigameKind => Object.hasOwn(MINIGAME_NAMES, value);
