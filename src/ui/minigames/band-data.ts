/** A side of the band: what happens out there, and the words for it. */
export interface BandEdge {
  /**
   * When straying this way fails the run: 'band' once it has been out of the band for `grace`
   * seconds, 'end' when it reaches the end of the gauge, 'never' (it only stops the count and spoils
   * a perfect).
   */
  fails: 'band' | 'end' | 'never';
  /** Shown while it is out this way ("too hot"). */
  word: string;
  /** Why it failed this way, in one line naming the cause ("Too hot: the crucible cracked."). */
  why: string;
}

/**
 * The look: a forge fire, a needle dial, a capsule coming home through the air, a boat settling to
 * its load line, a lander coming down on its engine.
 */
export type BandStyle = 'fire' | 'gauge' | 'capsule' | 'load' | 'lander';

export interface BandParams {
  style: BandStyle;
  /** What is measured, and its unit, as the gauge says them ("Heat", "°C"). */
  label: string;
  unit: string;
  /** Decimals on the readout (default 0). */
  decimals?: number;
  /** The gauge's ends, and where the value starts. */
  min: number;
  max: number;
  start: number;
  /** The band to hold, and its perfect middle: [low, high]. */
  band: [number, number];
  perfect: [number, number];
  /**
   * A moving band: how far the band (and its middle) has moved after `t` seconds, with `done` (0–1)
   * of the hold behind it — glass cooling down its curve, a lander's safe speed shrinking near the
   * ground.
   */
  shift?: (t: number, done: number) => number;
  /** 'hold': hold to push, let go and it drifts (bellows, a relief valve); 'updown': push it up or down (a lever). Default 'hold'. */
  control?: 'hold' | 'updown';
  /** Units per second while held ('updown': up adds it, down takes it away); negative pushes it down (a relief valve). */
  push: number;
  /** Units per second it moves by itself, all the time (a fire cooling, pressure building). */
  drift: number;
  /** Seconds it takes to answer: a fire is slow, a needle quick (default 0.25). */
  lag?: number;
  /**
   * Disturbances, the same every run for one seed: kicks that shove the value (up to `kick` units a
   * second, about one every `every` seconds, `up` the share that push it up), and a wobble about it
   * (± `wobble` units: waves on a hull, a needle's shiver). Both grow to `grow` times by the end.
   */
  disturb?: { kick?: number; every?: number; up?: number; wobble?: number; grow?: number; seed?: number };
  /** Seconds it must spend in the band, and the most the run may take (default 2.5 × hold, at most 40). */
  hold: number;
  limit?: number;
  /** Seconds it may stay out on a side that fails at the band (default 0.5). */
  grace?: number;
  /** For a perfect: the share of the hold spent in the perfect middle (default 0.6), with no slip out of the band. */
  perfectShare?: number;
  /** Above the band, and below it. */
  high: BandEdge;
  low: BandEdge;
  /** The hint (what holding does) and the why-lines for a perfect and a good run. */
  words: { hold: string; perfect: string; good: string };
  /** Small touches: what sits in the fire, and what drives the dial (a boiler's relief valve, or a lever on a cell). */
  look?: { piece?: 'crucible' | 'pot' | 'glass'; device?: 'valve' | 'lever' };
}

/** Ready set-ups, one per use: milestones can take one as it is or change its numbers and words. */
export const BAND_EXAMPLES: Record<
  'forge' | 'kiln' | 'glass' | 'steam' | 'entry' | 'boat' | 'oxygen' | 'landing',
  BandParams
> = {
  // Bellows & charcoal: today's smelt — more air, a hotter fire.
  forge: {
    style: 'fire',
    label: 'Heat',
    unit: '°C',
    min: 600,
    max: 1500,
    start: 820,
    band: [1100, 1250],
    perfect: [1150, 1215],
    push: 300,
    drift: -115,
    lag: 0.35,
    disturb: { kick: 140, every: 2.4, wobble: 5, seed: 3 },
    hold: 9,
    limit: 26,
    high: {
      fails: 'end',
      word: 'too hot',
      why: 'Too hot: the crucible cracked and the copper ran out. More air, hotter fire — ease off sooner.',
    },
    low: {
      fails: 'never',
      word: 'too cool',
      why: 'Too cool: the copper never melted. More air makes a fire hotter — pump harder.',
    },
    words: {
      hold: 'Hold to pump the bellows',
      perfect: 'More air, hotter fire: you held the heat just where copper runs.',
      good: 'More air made the fire hot enough — the copper ran, though the heat wandered.',
    },
    look: { piece: 'crucible' },
  },
  // Clay & ceramics: heat turns soft clay into something like stone.
  kiln: {
    style: 'fire',
    label: 'Heat',
    unit: '°C',
    min: 400,
    max: 1300,
    start: 620,
    band: [900, 1050],
    perfect: [945, 1010],
    push: 230,
    drift: -85,
    lag: 0.4,
    disturb: { kick: 90, every: 2.6, wobble: 4, seed: 31 },
    hold: 10,
    limit: 26,
    high: {
      fails: 'end',
      word: 'too hot',
      why: 'Too hot: the pot bloated and cracked. Ease off the bellows sooner.',
    },
    low: {
      fails: 'never',
      word: 'too cool',
      why: 'Too cool: the clay stayed soft and crumbly. It takes long, steady heat to turn it to stone.',
    },
    words: {
      hold: 'Hold to pump the bellows',
      perfect: 'Fired just right: the heat turned soft clay into hard pottery that rings when tapped.',
      good: 'Fired through — heat turns soft clay into something like stone.',
    },
    look: { piece: 'pot' },
  },
  // Glass: cool it slowly down its curve, or it cracks.
  glass: {
    style: 'fire',
    label: 'Heat',
    unit: '°C',
    min: 150,
    max: 800,
    start: 580,
    band: [540, 620],
    perfect: [560, 600],
    shift: (t) => -Math.min(330, Math.max(0, t - 2.5) * 26),
    push: 140,
    drift: -62,
    lag: 0.3,
    disturb: { kick: 50, every: 2.2, wobble: 3, seed: 8 },
    hold: 14,
    limit: 22,
    grace: 0.6,
    high: {
      fails: 'never',
      word: 'too hot',
      why: 'Too hot for too long: the glass slumped out of shape. Let it cool with the band.',
    },
    low: {
      fails: 'band',
      word: 'cooling too fast',
      why: 'Cooled too fast: the outside set first and the strain split the glass. Cool it slowly.',
    },
    words: {
      hold: 'Hold to keep the kiln fired',
      perfect: 'Cooled slowly, the strain eased out: the glass came out clear and whole.',
      good: 'Cooled slowly enough to hold together, with a little strain left in it.',
    },
    look: { piece: 'glass' },
  },
  // Steam: the fire builds the pressure; open the relief valve in time.
  steam: {
    style: 'gauge',
    label: 'Pressure',
    unit: 'bar',
    decimals: 1,
    min: 0,
    max: 12,
    start: 2.5,
    band: [6, 9],
    perfect: [7, 8.2],
    push: -3,
    drift: 1.15,
    lag: 0.2,
    disturb: { kick: 1.1, every: 2.6, up: 0.85, wobble: 0.07, seed: 11 },
    hold: 10,
    limit: 28,
    high: {
      fails: 'end',
      word: 'too high',
      why: 'Past the red: the safety plug blew. Steam takes a thousand times the room — let it out in time.',
    },
    low: {
      fails: 'never',
      word: 'too low',
      why: 'Too little steam: the engine stalled. Let the pressure build before you vent it.',
    },
    words: {
      hold: 'Hold to open the relief valve',
      perfect: 'Steam held just right: it pushed the piston and the pump never missed a stroke.',
      good: 'The pump ran: steam pushes hard, and you let it out before it burst the boiler.',
    },
    look: { device: 'valve' },
  },
  // Minerals home: the capsule comes back through the air, inside the corridor.
  entry: {
    style: 'capsule',
    label: 'Entry angle',
    unit: '°',
    decimals: 1,
    min: 2,
    max: 14,
    start: 4.5,
    band: [5.5, 7.5],
    perfect: [6.2, 7],
    push: -2.4,
    drift: 1,
    lag: 0.3,
    disturb: { kick: 0.9, every: 2.1, wobble: 0.05, seed: 5 },
    hold: 10,
    limit: 24,
    grace: 0.7,
    high: {
      fails: 'band',
      word: 'too steep',
      why: 'Too steep: it dived into the thick air too fast and burnt up. The air must slow it gently.',
    },
    low: {
      fails: 'band',
      word: 'too shallow',
      why: 'Too shallow: it skipped off the air like a stone off a pond, back out into space.',
    },
    words: {
      hold: 'Hold to lift the nose',
      perfect:
        'Right down the corridor: the air slowed it gently and the shield took the heat — the minerals are home.',
      good: 'Through the corridor and home: the air slowed it, though the shield ran hot.',
    },
  },
  // Boats: load her to the line, with room for the waves.
  boat: {
    style: 'load',
    label: 'Load',
    unit: 't',
    decimals: 1,
    min: 0,
    max: 30,
    start: 2,
    band: [16, 24],
    perfect: [18, 21.5],
    control: 'updown',
    push: 3.2,
    drift: 0,
    lag: 0.3,
    disturb: { wobble: 1, grow: 1.9, seed: 9 },
    hold: 8,
    limit: 26,
    grace: 0.8,
    high: {
      fails: 'band',
      word: 'past the line',
      why: 'Past the load line: the waves came over the side and she sank. Leave room for the waves.',
    },
    low: {
      fails: 'never',
      word: 'half empty',
      why: 'Half empty: she floats high but carries little. Load her down to the line.',
    },
    words: {
      hold: 'Pour ore in, or shovel some back',
      perfect: 'Loaded to the line: she pushes aside her own weight of water, with room for the waves.',
      good: 'She floats loaded: a boat settles until it pushes aside its own weight of water.',
    },
  },
  // Landing on rockets: no air to slow it, so the engine holds the sinking speed safe all the way down.
  landing: {
    style: 'lander',
    label: 'Sinking',
    unit: 'm/s',
    decimals: 1,
    min: 0,
    max: 10,
    start: 5.6,
    band: [3.2, 6],
    perfect: [3.9, 5.2],
    shift: (_t, done) => -2.8 * done,
    push: -3.4,
    drift: 1.6,
    lag: 0.35,
    disturb: { kick: 0.8, every: 2.4, wobble: 0.05, seed: 17 },
    hold: 11,
    limit: 26,
    grace: 0.8,
    high: {
      fails: 'band',
      word: 'too fast',
      why: 'Down too fast: with no air to slow it, it hit hard and the legs buckled.',
    },
    low: {
      fails: 'never',
      word: 'hovering',
      why: 'Hovered too long: the fuel ran out before it was down, and it dropped.',
    },
    words: {
      hold: 'Hold to fire the engine',
      perfect:
        'A long, steady burn, a hover and a soft touch on its legs — with no air, only the engine slows it.',
      good: 'Down on its legs: with no air to slow it, the engine did all the braking.',
    },
  },
  // Oxygen from ice: current through the meltwater splits it into oxygen and hydrogen.
  oxygen: {
    style: 'gauge',
    label: 'Current',
    unit: 'A',
    min: 0,
    max: 60,
    start: 8,
    band: [30, 42],
    perfect: [34, 39],
    control: 'updown',
    push: 9,
    drift: 1.2,
    lag: 0.3,
    disturb: { kick: 6, every: 2, wobble: 0.3, seed: 21 },
    hold: 10,
    limit: 28,
    high: {
      fails: 'end',
      word: 'too much',
      why: 'Too much current: the water boiled instead of splitting, and the plates burnt.',
    },
    low: {
      fails: 'never',
      word: 'too little',
      why: 'Too little current: hardly a bubble. It takes a steady push to split water.',
    },
    words: {
      hold: 'Turn the current up or down',
      perfect: 'A steady current split the water: oxygen bubbled off one plate, hydrogen off the other.',
      good: 'Current splits water into oxygen and hydrogen — it bubbled, in fits and starts.',
    },
    look: { device: 'lever' },
  },
};
