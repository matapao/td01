// ---- Parameters ---------------------------------------------------------------------------------

export interface ObserveSample {
  name: string;
  /** Its colour, and its shape on the tray. */
  colour: string;
  shape?: 'rod' | 'block' | 'ball' | 'coin' | 'drop' | 'nail';
  /** How strongly it shows when tested, 0–1: the lamp's glow, how high it floats (below ½ it sinks), the spring's stretch, how slow the swing. */
  shows: number;
  /** The reading in real units once tested ("0.5 A", "1.4 s a swing"). */
  reading?: string;
  /** What anyone can see of it, for the ideas to reason with ("metal", "shiny", "heavy"). */
  tags?: string[];
  /** Drawing: the size of the block or bob, and the length of the string (0–1). */
  size?: number;
  length?: number;
  /** radar: how far up its road it is (metres), and whether that is known (written on the map). */
  distance?: number;
  known?: boolean;
}

/** An idea to choose: the conclusion. */
export interface ObserveOption {
  text: string;
  /** What this idea predicts: does the sample show (light the lamp, float, swing slow)? */
  fits?: (s: ObserveSample) => boolean;
  /** Said if you choose it and it's wrong. */
  wrong?: string;
}

export interface ObserveWords {
  /** What to find out, and for what (the line at the top). */
  goal: string;
  /** The principle, added to the why when you get it right. */
  principle?: string;
  /** The first-time hint. */
  hint?: string;
}

export interface ObserveParams {
  style: 'rig' | 'radar';
  /** rig: what the test shows with (default 'lamp'). */
  rig?: 'lamp' | 'float' | 'spring' | 'swing';
  samples: ObserveSample[];
  question: string;
  options: ObserveOption[];
  /** The right option (index). */
  answer: number;
  /** Tests for a perfect (default 2). */
  enough?: number;
  /** radar: the pulse's speed in m/s (default 300 000 000, radio) and the delay's unit (default 'µs'). */
  speed?: number;
  unit?: 'µs' | 'ms' | 's';
  /** Seconds before night falls (default 40). */
  time?: number;
  words: ObserveWords;
}

// ---- Examples -----------------------------------------------------------------------------------

export const has =
  (tag: string) =>
  (s: ObserveSample): boolean =>
    !!s.tags?.includes(tag);

/** Ready set-ups: one for each rig, and the radar. */
export const OBSERVE_EXAMPLES: Record<'conduct' | 'float' | 'spring' | 'swing' | 'radar', ObserveParams> = {
  /** Which materials carry current? (for wires and insulators) */
  conduct: {
    style: 'rig',
    rig: 'lamp',
    samples: [
      {
        name: 'Copper wire',
        colour: '#c27a3e',
        shape: 'rod',
        shows: 1,
        reading: '0.50 A',
        tags: ['metal', 'shiny', 'hard'],
      },
      {
        name: 'Glass rod',
        colour: '#bfe3e8',
        shape: 'rod',
        shows: 0,
        reading: '0 A',
        tags: ['shiny', 'hard'],
      },
      { name: 'Wooden peg', colour: '#9a6a3a', shape: 'rod', shows: 0, reading: '0 A', tags: ['hard'] },
      {
        name: 'Rusty nail',
        colour: '#7a5a46',
        shape: 'nail',
        shows: 0.85,
        reading: '0.43 A',
        tags: ['metal', 'hard'],
      },
      { name: 'Rubber', colour: '#2e2e2e', shape: 'block', shows: 0, reading: '0 A', tags: ['soft'] },
      {
        name: 'Silver coin',
        colour: '#d0d4da',
        shape: 'coin',
        shows: 1,
        reading: '0.50 A',
        tags: ['metal', 'shiny', 'hard'],
      },
    ],
    question: 'What lets current through?',
    options: [
      { text: 'Anything hard', fits: has('hard'), wrong: 'Hard glass and wood left the lamp dark.' },
      {
        text: 'Anything shiny',
        fits: has('shiny'),
        wrong: 'Shiny glass left the lamp dark, and a dull rusty nail lit it.',
      },
      { text: 'Metals', fits: has('metal') },
    ],
    answer: 2,
    enough: 2,
    words: {
      goal: 'Find what carries current — for the grid’s wires and its insulators',
      principle: 'Metals carry current; glass, wood and rubber hold it back.',
      hint: 'Click a sample to put it in the rig; pick samples that split the ideas',
    },
  },
  /** What floats? (for boats) */
  float: {
    style: 'rig',
    rig: 'float',
    samples: [
      {
        name: 'Big log',
        colour: '#8a5a32',
        shape: 'block',
        size: 1,
        shows: 0.75,
        reading: 'floats',
        tags: ['big', 'heavy', 'light-for-size'],
      },
      {
        name: 'Iron nail',
        colour: '#7a7f86',
        shape: 'nail',
        size: 0.3,
        shows: 0.1,
        reading: 'sinks',
        tags: ['small', 'light'],
      },
      {
        name: 'Cork',
        colour: '#c9a070',
        shape: 'block',
        size: 0.4,
        shows: 0.9,
        reading: 'floats high',
        tags: ['small', 'light', 'light-for-size'],
      },
      {
        name: 'Stone',
        colour: '#6d675f',
        shape: 'ball',
        size: 0.6,
        shows: 0.05,
        reading: 'sinks',
        tags: ['big', 'heavy'],
      },
      {
        name: 'Ice',
        colour: '#cfeaf5',
        shape: 'block',
        size: 0.6,
        shows: 0.55,
        reading: 'floats low',
        tags: ['big', 'light-for-size'],
      },
    ],
    question: 'What decides whether a thing floats?',
    options: [
      {
        text: 'Being small and light',
        fits: has('light'),
        wrong: 'The little nail sank and the big heavy log floated.',
      },
      { text: 'Being big', fits: has('big'), wrong: 'The big stone sank.' },
      { text: 'Being lighter than water for its size', fits: has('light-for-size') },
    ],
    answer: 2,
    enough: 2,
    words: {
      goal: 'Find what floats — before the boatyard builds a hull',
      principle: 'A thing floats when it pushes aside water as heavy as itself.',
    },
  },
  /** What does a spring's stretch follow? (for spring balances at the market) */
  spring: {
    style: 'rig',
    rig: 'spring',
    samples: [
      {
        name: 'One weight',
        colour: '#7a7f86',
        shape: 'block',
        size: 0.3,
        shows: 0.25,
        reading: 'stretches 2 cm',
        tags: ['light', 'small'],
      },
      {
        name: 'Two weights',
        colour: '#7a7f86',
        shape: 'block',
        size: 0.5,
        shows: 0.5,
        reading: 'stretches 4 cm',
        tags: ['heavy', 'small'],
      },
      {
        name: 'Wool sack',
        colour: '#d8ccb0',
        shape: 'block',
        size: 1,
        shows: 0.25,
        reading: 'stretches 2 cm',
        tags: ['light', 'big'],
      },
      {
        name: 'Four weights',
        colour: '#7a7f86',
        shape: 'block',
        size: 0.8,
        shows: 1,
        reading: 'stretches 8 cm',
        tags: ['heavy', 'small'],
      },
    ],
    question: 'What does the stretch follow?',
    options: [
      {
        text: 'How big the load is',
        fits: has('big'),
        wrong: 'The big wool sack stretched it no more than one small weight.',
      },
      { text: 'How heavy the load is', fits: has('heavy') },
      {
        text: 'Nothing: a spring always stretches the same',
        fits: () => false,
        wrong: 'Four weights stretched it four times as far as one.',
      },
    ],
    answer: 1,
    enough: 2,
    words: {
      goal: 'Find what a spring measures — for honest scales at the market',
      principle: 'A spring stretches in step with the weight on it: twice the weight, twice the stretch.',
    },
  },
  /** What sets a pendulum's beat? (for clocks) */
  swing: {
    style: 'rig',
    rig: 'swing',
    samples: [
      {
        name: 'Short, light',
        colour: '#c9a24a',
        shape: 'ball',
        size: 0.3,
        length: 0.35,
        shows: 0.25,
        reading: '0.9 s a swing',
        tags: ['short', 'light'],
      },
      {
        name: 'Short, heavy',
        colour: '#7a7f86',
        shape: 'ball',
        size: 0.9,
        length: 0.35,
        shows: 0.25,
        reading: '0.9 s a swing',
        tags: ['short', 'heavy'],
      },
      {
        name: 'Long, light',
        colour: '#c9a24a',
        shape: 'ball',
        size: 0.3,
        length: 1,
        shows: 0.8,
        reading: '1.6 s a swing',
        tags: ['long', 'light'],
      },
      {
        name: 'Long, heavy',
        colour: '#7a7f86',
        shape: 'ball',
        size: 0.9,
        length: 1,
        shows: 0.8,
        reading: '1.6 s a swing',
        tags: ['long', 'heavy'],
      },
    ],
    question: 'What makes a pendulum swing slower?',
    options: [
      {
        text: 'A heavier weight',
        fits: has('heavy'),
        wrong: 'Heavy and light swung in the same time when the strings matched.',
      },
      { text: 'A longer string', fits: has('long') },
      {
        text: 'Neither: they all swing alike',
        fits: () => false,
        wrong: 'The long ones took longer each swing.',
      },
    ],
    answer: 1,
    enough: 2,
    words: {
      goal: 'Find what sets a pendulum’s beat — the clockmaker needs to know',
      principle: 'A pendulum’s swing takes the same time every swing, set by its length alone.',
    },
  },
  /** Radar: how far is what the echo came back from? */
  radar: {
    style: 'radar',
    samples: [
      { name: 'Mill road', colour: '#c9a24a', shows: 1, distance: 1500, known: true },
      { name: 'North road', colour: '#ff6a5a', shows: 1, distance: 4500 },
      { name: 'River road', colour: '#6aa8ff', shows: 1, distance: 3000 },
    ],
    question: 'How far up the North road are the dead?',
    options: [
      {
        text: '1.5 km',
        wrong: 'Its echo came back three times later than the mill’s: it is three times as far.',
      },
      { text: '4.5 km' },
      { text: '9 km', wrong: 'The delay counts the way there and back — half of it is the way there.' },
    ],
    answer: 1,
    enough: 2,
    words: {
      goal: 'Find the dead on the North road through the night fog',
      principle: 'A pulse comes back from what it hits; the delay tells how far.',
      hint: 'Click a road to send a pulse up it — the Mill road’s distance is known',
    },
  },
};
