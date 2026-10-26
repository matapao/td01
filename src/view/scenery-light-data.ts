import type { Color } from 'three';
import { GLOW_COLORS } from './glowlights.ts';

/**
 * Props that are lights, many and alike, drawn instanced (not one by one): where the flame is (model
 * units), the colour of its halo and of the pool it lays on the ground, how far that reaches, the
 * halo's size, how bright it is by day, how fast it flickers.
 */
export const LIT_PROPS: Record<
  string,
  {
    at: [number, number, number];
    color: string;
    glow: Color;
    reach: number;
    size: number;
    day: number;
    flicker: number;
  }
> = {
  // The town's street lamps: the lantern hangs from the post's arm (up it, out along +z).
  streetlamp: {
    at: [0, 2.42, 1.08],
    color: '#ffb455',
    glow: GLOW_COLORS.lantern,
    reach: 5.5,
    size: 0.9,
    day: 0.3,
    flicker: 7,
  },
  // The torches on the wall's battlements.
  walltorch: {
    at: [0, 1.2, 0],
    color: '#ffcf7a',
    glow: GLOW_COLORS.torch,
    reach: 5.5,
    size: 1.1,
    day: 0.3,
    flicker: 11,
  },
};
