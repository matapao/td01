import type { HeroClass } from '../../game/content.ts';
/** The crew's glow when a hero crews them from the wall: Knight's shield blue, Warchief's war-paint orange, Mage's arcane violet. */
export const CREW_COLOR: Record<HeroClass, string> = {
  tank: '#7fc8ff',
  support: '#ffb04a',
  magic: '#c49bff',
};
