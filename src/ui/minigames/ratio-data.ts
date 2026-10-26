/** How a test piece fails: it cracks (too hard), bends (too soft), crumbles (won't bind) or fizzles (won't burn). */
export type RatioLook = 'crack' | 'bend' | 'crumble' | 'fizzle';

/** One ingredient: its spout, its share of the mix, and what too little or too much of it does. */
export interface RatioIngredient {
  /** Its name, on its spout and gauge ('Tin'). */
  name: string;
  /** Its colour ('#rrggbb'): the spout, the pour and its part of the mix. */
  colour: string;
  /** Its share of a perfect mix, in % (the shares add up to 100). */
  share: number;
  /**
   * How far its share may stray, in percentage points: [good, perfect]. Leave it out for the bulk of
   * the mix (judged through the others); every ingredient with one gets a gauge.
   */
  tolerance?: [number, number];
  /** The gauge's end words: what too little / too much of it makes (['soft', 'brittle']). */
  words?: [string, string];
  /** The why-line when there's too little / too much of it (default: made from the words). */
  whyLow?: string;
  whyHigh?: string;
  /** How the test piece fails from too little / too much of it (default: by the test). */
  looks?: [RatioLook, RatioLook];
  /** Tiny shares (carbon in steel, a dopant): it goes in a pinch at a time — tap, or hold to trickle. */
  pinch?: boolean;
  /** The gauge's top end, in % (default: about twice the share). */
  max?: number;
}

export interface RatioParams {
  /** What comes out ('Bronze'), named over the gauges. */
  product: string;
  /** What it's mixed in: a crucible over a fire (molten), a vat (liquid) or a bowl (powder, paste). */
  vessel: 'crucible' | 'vat' | 'bowl';
  /** How the batch is tested: cast into a bar and struck, left to set as a block, or lit. */
  test: 'cast' | 'set' | 'burn';
  /** Two or three, the bulk first. */
  ingredients: RatioIngredient[];
  /** The button that ends the mixing ('Fire it', 'Set it', 'Light it'); Enter does the same. */
  action: string;
  /** The why-lines for a good and a perfect mix: the principle, and the cause. */
  whyGood: string;
  whyPerfect: string;
  /** How full the vessel must be before it can be fired, 0–1 (default 0.6). */
  minFill?: number;
}

/** The demo set-ups: bronze by default; ?variant=steel | gunpowder | cement on the playground. */
export const RATIO_DEMOS: Record<'bronze' | 'steel' | 'gunpowder' | 'cement', RatioParams> = {
  bronze: {
    product: 'Bronze',
    vessel: 'crucible',
    test: 'cast',
    action: 'Fire it',
    ingredients: [
      { name: 'Copper', colour: '#d9733b', share: 88 },
      {
        name: 'Tin',
        colour: '#cdd5dc',
        share: 12,
        tolerance: [3.5, 1.2],
        words: ['soft', 'brittle'],
        whyLow: 'Too little tin: the bronze stayed soft as copper — it bent.',
        whyHigh: 'Too much tin: the bronze is hard but brittle — it cracked.',
      },
    ],
    whyGood: 'Copper with a little tin: two metals mixed are harder than either alone.',
    whyPerfect: 'One part tin to about seven of copper: hard, tough bronze — it rings true.',
  },
  steel: {
    product: 'Steel',
    vessel: 'crucible',
    test: 'cast',
    action: 'Fire it',
    ingredients: [
      { name: 'Iron', colour: '#9aa1a8', share: 99.2 },
      {
        name: 'Carbon',
        colour: '#55524e',
        share: 0.8,
        tolerance: [0.4, 0.15],
        words: ['soft iron', 'brittle'],
        pinch: true,
        whyLow: 'Too little carbon: soft iron — it bent under the hammer.',
        whyHigh: 'Too much carbon: hard but brittle, like cast iron — it snapped.',
      },
    ],
    whyGood: 'A pinch of carbon in iron makes steel: harder and stronger than iron alone.',
    whyPerfect: 'Under one part carbon in a hundred: strong, springy steel.',
  },
  gunpowder: {
    product: 'Black powder',
    vessel: 'bowl',
    test: 'burn',
    action: 'Light it',
    ingredients: [
      { name: 'Saltpetre', colour: '#ece7da', share: 75 },
      {
        name: 'Charcoal',
        colour: '#4d4844',
        share: 15,
        tolerance: [4, 1.5],
        words: ['slow', 'smoky'],
        whyLow: 'Too little charcoal: not enough fuel — it fizzled.',
        whyHigh: 'Too much charcoal: more fuel than the saltpetre can burn — it smouldered.',
      },
      {
        name: 'Sulfur',
        colour: '#e6c63a',
        share: 10,
        tolerance: [3.5, 1.2],
        words: ['hard to light', 'fizzles'],
        whyLow: 'Too little sulfur: the fire never caught — it fizzled.',
        whyHigh: 'Too much sulfur: it burns slow and sour — it fizzled.',
      },
    ],
    whyGood: 'Saltpetre feeds the fire its air, charcoal burns, sulfur lights it: mixed right, they flash.',
    whyPerfect: 'Seventy-five, fifteen, ten: each part in its share, and it all burns in an instant.',
  },
  cement: {
    product: 'Cement',
    vessel: 'vat',
    test: 'set',
    action: 'Set it',
    ingredients: [
      { name: 'Lime', colour: '#e6e2d6', share: 75 },
      {
        name: 'Clay',
        colour: '#b4673c',
        share: 25,
        tolerance: [6, 2],
        words: ['crumbly', 'cracks'],
        looks: ['crumble', 'crack'],
        whyLow: 'Too little clay: lime alone won’t bind — it crumbled.',
        whyHigh: 'Too much clay: it shrank as it dried — it cracked.',
      },
    ],
    whyGood: 'Lime and clay, burnt and mixed, set hard as stone.',
    whyPerfect: 'Three parts lime to one of clay: it sets like stone and holds a tonne.',
  },
};
