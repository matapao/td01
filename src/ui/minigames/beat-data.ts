/** The look: an anvil, a saw in a plank, a coil on its crank, a bell in its frame, or a plain target. */
export type BeatStyle = 'hammer' | 'saw' | 'coil' | 'bell' | 'generic';

export interface BeatParams {
  style: BeatStyle;
  /** Beats a minute at the start, and at the end (it speeds up — or slows — evenly between; default the same). */
  tempo: number;
  tempoEnd?: number;
  /** The gaps between strikes, in beats, played round and round: [1] is steady, [1, 1, 2] two strikes and a rest. */
  pattern: number[];
  /** How many strikes in all. */
  strikes: number;
  /** How far off a strike may land, in seconds: within `perfect` it is perfect, within `good` good (defaults 0.06, 0.14). */
  perfect?: number;
  good?: number;
  /** Beats counted in before the first strike (default 3). */
  countIn?: number;
  /** Misses allowed before it fails (default a quarter of the strikes). */
  misses?: number;
  /** For a perfect: the share of strikes that are perfect, with none missed (default 0.7). */
  perfectShare?: number;
  words: {
    /** The hint: when to strike ("Strike as the ring closes on the iron"). */
    act: string;
    /** What a strike is called on the tally ("blows"). */
    count?: string;
    /** Why it went that way: perfect, good, failed — and failed mostly early or mostly late. */
    perfect: string;
    good: string;
    fail: string;
    early?: string;
    late?: string;
  };
}

/** Ready set-ups, one per use: milestones can take one as it is or change its numbers and words. */
export const BEAT_EXAMPLES: Record<'forge' | 'saw' | 'coil' | 'bell' | 'engine', BeatParams> = {
  // The smith at the anvil: even blows draw the iron out straight.
  forge: {
    style: 'hammer',
    tempo: 92,
    tempoEnd: 112,
    pattern: [1],
    strikes: 16,
    words: {
      act: 'Strike as the ring closes on the iron',
      count: 'blows',
      perfect: 'Even blows in a steady rhythm: the iron drew out straight and true.',
      good: 'The iron took its shape — a steady rhythm keeps every blow even.',
      fail: 'Blows out of time: the iron bent crooked. Keep a steady rhythm.',
      early: 'Rushed: the blows came before the iron was set square, and it bent crooked.',
      late: 'Dragged: the iron cooled between blows and would not shape.',
    },
  },
  // Sawing: long even strokes let every tooth bite.
  saw: {
    style: 'saw',
    tempo: 76,
    tempoEnd: 88,
    pattern: [1],
    strikes: 14,
    words: {
      act: 'Push as the handle comes back to its mark',
      count: 'strokes',
      perfect: 'Long, even strokes in rhythm: every tooth bit and the cut ran straight.',
      good: 'Through the plank — an even rhythm lets every tooth bite.',
      fail: 'Strokes out of rhythm: the saw jumped and bound in the cut.',
      early: 'Rushed strokes: the saw jumped before it was drawn back, and bound in the cut.',
      late: 'Hesitant strokes: the saw stuck and the cut wandered.',
    },
  },
  // Motors: wind the coil in even turns, side by side.
  coil: {
    style: 'coil',
    tempo: 100,
    tempoEnd: 132,
    pattern: [1],
    strikes: 22,
    good: 0.13,
    words: {
      act: 'Turn as the handle comes over the top',
      count: 'turns',
      perfect: 'Even turns, side by side: a neat coil makes the strongest magnet.',
      good: 'The coil holds — more even turns make a stronger magnet.',
      fail: 'Uneven turns: the wire bunched and tangled into a knot.',
      early: 'Too hasty: the wire overlapped itself and tangled.',
      late: 'Too slow: the wire went slack and looped into a tangle.',
    },
  },
  // Bells & alarms: a pattern everyone agreed on — three strokes and a rest.
  bell: {
    style: 'bell',
    tempo: 104,
    pattern: [1, 1, 2],
    strikes: 12,
    words: {
      act: 'Pull as the bell swings up to its mark',
      count: 'strokes',
      perfect:
        'Rung clean and in time: a pattern everyone agreed on carries far, and all know what it means.',
      good: 'The vale heard it — a sound everyone agreed on carries a message.',
      fail: 'Rung out of time: the pattern was lost and no one could tell what it meant.',
      early: 'Pulled too soon: the bell had not swung up, and it only clonked.',
      late: 'Pulled too late: the bell had swung back, and the pattern fell apart.',
    },
  },
  // Engines: let the steam in at the top of each stroke, faster and faster.
  engine: {
    style: 'generic',
    tempo: 72,
    tempoEnd: 132,
    pattern: [1],
    strikes: 20,
    words: {
      act: 'Open the valve as the ring closes on the mark',
      count: 'strokes',
      perfect: 'Steam let in at the top of every stroke: the engine ran up smooth and fast.',
      good: 'The engine ran — steam pushes best let in at the top of the stroke.',
      fail: 'Steam let in at the wrong moments: the engine shook and stalled.',
      early: 'Too early: the steam pushed against the rising piston and the engine shook.',
      late: 'Too late: the piston had passed the top and the push was wasted.',
    },
  },
};
