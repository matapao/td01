/**
 * The look: a weld seam; a bar on a lathe (the path is the profile to cut along its top, left to
 * right); a pane of glass; a drill into rock (top to bottom); a lander coming down (the path ends on
 * the pad); or a chip and its legs on a board.
 */
export type SteadyStyle = 'weld' | 'lathe' | 'cut' | 'drill' | 'land' | 'generic';

/**
 * The path: a named shape along the work — left to right, or top to bottom for the drill and the
 * landing — or points (0–1 across and down the work).
 */
export type SteadyPath = 'line' | 'arc' | 'circle' | 'zigzag' | 'wave' | [number, number][];

export interface SteadyParams {
  style: SteadyStyle;
  path: SteadyPath;
  /** Teeth of a zigzag, waves of a wave (default 4 and 2), or how far an arc bows (default 0.35). */
  turns?: number;
  /** How far off the line still counts, in CSS px; perfect is within half of it. */
  tolerance: number;
  /** How long the whole path should take, in seconds: quicker than the first is too fast, slower than the second too slow. */
  pace: [number, number];
  /** Seconds standing still before it burns through (or, landing, how fast hovering burns fuel; default 1.6). */
  burn?: number;
  /** The last share of the path that must not be rushed, or it fails at once — a touchdown (default 0). */
  softEnd?: number;
  /** The most seconds the run may take (default 40). */
  limit?: number;
  /** Real units for the speed gauge: what it reads at the ideal pace ({ unit: 'mm/s', at: 4 }). */
  speed?: { unit: string; at: number };
  words: {
    /** The hint ("Hold and draw the torch along the seam"). */
    act: string;
    /** The meter that fills when too slow ("heat", "fuel", "pressure"). */
    meter?: string;
    /** Why it went that way: perfect, good, and failed by rushing, by dawdling, or off the line. */
    perfect: string;
    good: string;
    fast: string;
    slow: string;
    off: string;
  };
}

/** Ready set-ups, one per use: milestones can take one as it is or change its numbers and words. */
export const STEADY_EXAMPLES: Record<
  'weld' | 'lathe' | 'glass' | 'drill' | 'landing' | 'bond',
  SteadyParams
> = {
  // Welding a seam: heat and pace together.
  weld: {
    style: 'weld',
    path: 'wave',
    turns: 1.5,
    tolerance: 7,
    pace: [6, 16],
    speed: { unit: 'mm/s', at: 4 },
    words: {
      act: 'Hold and draw the torch along the seam',
      perfect: 'A steady hand at a steady pace: the bead ran even, and the joint is as strong as the plate.',
      good: 'The seam holds — heat and pace together melt the two edges into one.',
      fast: 'Too fast: the bead ran thin and full of holes, and the joint cracked.',
      slow: 'Too slow: the heat built up and burnt a hole through the plate.',
      off: 'Off the seam: the bead missed the joint, and the plates came apart.',
    },
  },
  // Precision: a lathe tool along a shaft's profile.
  lathe: {
    style: 'lathe',
    path: [
      [0, 0.25],
      [0.28, 0.25],
      [0.32, 0.6],
      [0.62, 0.6],
      [0.75, 0.38],
      [1, 0.38],
    ],
    tolerance: 6,
    pace: [7, 18],
    speed: { unit: 'mm/s', at: 2 },
    words: {
      act: 'Hold and guide the tool along the line',
      perfect: 'Cut true to the line: a part that fits exactly — measure, then cut steady.',
      good: 'Close to the line: near enough to fit, after a little filing.',
      fast: 'Too fast: the tool chattered and tore the surface.',
      slow: 'Too slow: the tool rubbed instead of cutting and burnt the steel blue.',
      off: 'Off the line: the part came out the wrong size and will not fit.',
    },
  },
  // Glass: score a round lens blank in one even pass.
  glass: {
    style: 'cut',
    path: 'circle',
    tolerance: 6,
    pace: [6, 15],
    speed: { unit: 'mm/s', at: 30 },
    words: {
      act: 'Hold and score round the line in one pass',
      meter: 'pressure',
      perfect: 'One clean, even score: the glass snapped exactly along it.',
      good: 'Scored well enough — glass breaks along the line you weaken.',
      fast: 'Too fast: the wheel skipped, the score has gaps, and it snapped the wrong way.',
      slow: 'Pressed too long in one place: the score crushed and the glass cracked.',
      off: 'Off the line: the glass broke where you scored, not where you meant.',
    },
  },
  // The drill: feed it down through dust and rock to the vein.
  drill: {
    style: 'drill',
    path: 'line',
    tolerance: 6,
    pace: [6, 15],
    speed: { unit: 'cm/min', at: 8 },
    words: {
      act: 'Hold and feed the drill down steadily',
      perfect: 'A steady feed: the bit cut through dust and rock to the vein, and a clean core came up.',
      good: 'Down to the vein — a steady push lets the bit cut instead of grind.',
      fast: 'Pushed too hard: the bit jammed and snapped.',
      slow: 'Too slow: the bit ground in one place and overheated.',
      off: 'Off the line: the hole wandered and the bit bent.',
    },
  },
  // Landing out in space: no air to slow it, so the engine does it all, down onto the pad.
  landing: {
    style: 'land',
    path: [
      [0.06, 0],
      [0.3, 0.12],
      [0.55, 0.36],
      [0.72, 0.66],
      [0.78, 1],
    ],
    tolerance: 11,
    pace: [6, 14],
    burn: 2.2,
    softEnd: 0.14,
    speed: { unit: 'm/s', at: 3 },
    words: {
      act: 'Hold and guide the lander down onto the pad',
      meter: 'fuel',
      perfect:
        'A steady burn all the way down: it touched down softly on the pad — with no air, only the engine slows it.',
      good: 'Down on its legs — with no air to slow it, the engine does all the work.',
      fast: 'Came down too fast: the legs buckled and it toppled over.',
      slow: 'Hovered too long: the fuel ran out and it dropped the last stretch.',
      off: 'Off the line: it came down beside the pad, on the rocks, and tipped over.',
    },
  },
  // Chips: bond a fine wire from a pad to its leg, gently.
  bond: {
    style: 'generic',
    path: 'arc',
    turns: 0.5,
    tolerance: 5,
    pace: [6, 14],
    speed: { unit: 'mm/s', at: 1 },
    words: {
      act: 'Hold and draw the wire from the pad to its leg',
      perfect: 'A clean, even loop: the hair-thin wire carries the signal from the chip to the world.',
      good: 'The wire is bonded — a steady hand matters most where things are smallest.',
      fast: 'Too fast: the wire snapped mid-loop.',
      slow: 'Too slow: the heat welded the wire into a blob.',
      off: 'Off the line: the wire touched its neighbour and shorted.',
    },
  },
};
