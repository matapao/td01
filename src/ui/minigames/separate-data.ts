// ---- Parameters ---------------------------------------------------------------------------------

/** One part of the mixture. */
export interface SeparatePart {
  name: string;
  colour: string;
  /** Its share of the mix (any scale: shares are compared with each other). */
  share: number;
  /**
   * The property that separates it — pan: density (g/cm³, heavy stays); sieve: grain size (mm, small
   * falls through); distil: boiling point (°C, low boils first); zone: how readily the freezing
   * crystal takes it in (1 for the material itself, less for impurities, which stay in the melt).
   */
  value: number;
}

export interface SeparateWords {
  /** What to do, and for what (the line at the top). */
  goal: string;
  /** The principle, added to the why when it works. */
  principle?: string;
  /** The first-time hint. */
  hint?: string;
}

export interface SeparateParams {
  style: 'pan' | 'sieve' | 'distil' | 'zone';
  parts: SeparatePart[];
  /** The part you are after (index). */
  want: number;
  /** How pure what you keep must be for a good (0–1); perfect is halfway from there to pure. */
  purity: number;
  /** The share of the wanted part you must keep (default 0.6); zone: the share of the rod kept (default 0.75). */
  keep?: number;
  /** sieve: the meshes, coarse to fine (mm). */
  meshes?: number[];
  /** zone: passes of the hot zone (default 3). */
  passes?: number;
  /** Seconds (default 35). */
  time?: number;
  words: SeparateWords;
}

// ---- Examples -----------------------------------------------------------------------------------

/** Ready set-ups, one per style. */
export const SEPARATE_EXAMPLES: Record<'pan' | 'sieve' | 'distil' | 'oil' | 'zone', SeparateParams> = {
  /** Panning for gold in the river. */
  pan: {
    style: 'pan',
    parts: [
      { name: 'Sand', colour: '#cdb68a', share: 60, value: 2.65 },
      { name: 'Black sand', colour: '#3a3a40', share: 28, value: 5.2 },
      { name: 'Gold', colour: '#ffd34d', share: 12, value: 19.3 },
    ],
    want: 2,
    purity: 0.75,
    words: {
      goal: 'Pan the river gravel for gold',
      principle: 'Moving water lifts light grains first; the heaviest stay behind.',
      hint: 'Hold and swirl round the pan — gently enough that the gold stays',
    },
  },
  /** Sieving sand for the glassworks. */
  sieve: {
    style: 'sieve',
    parts: [
      { name: 'Pebbles', colour: '#8a8278', share: 22, value: 8 },
      { name: 'Sand', colour: '#e0c890', share: 50, value: 0.5 },
      { name: 'Silt', colour: '#7a6248', share: 28, value: 0.05 },
    ],
    want: 1,
    meshes: [2, 0.2],
    purity: 0.85,
    words: {
      goal: 'Sieve clean sand for the glassworks',
      principle: 'A mesh lets through only what is smaller than its holes.',
      hint: 'Drag side to side to shake — firmly, but not so hard it spills',
    },
  },
  /** Distilling spirit from wine (for lamps and the chemist's bench). */
  distil: {
    style: 'distil',
    parts: [
      { name: 'Spirit', colour: '#e8f4ff', share: 20, value: 78 },
      { name: 'Water', colour: '#7ab8ff', share: 80, value: 100 },
    ],
    want: 0,
    purity: 0.8,
    words: {
      goal: 'Distil spirit from wine for the lamps',
      principle: 'Each liquid boils at its own heat: hold it between the two and only one boils off.',
      hint: 'Hold to stoke the fire; keep the heat between 78° and 100°',
    },
  },
  /** Lamp oil from rock oil: the middle cut. */
  oil: {
    style: 'distil',
    parts: [
      { name: 'Naphtha', colour: '#f4f0d0', share: 25, value: 60 },
      { name: 'Lamp oil', colour: '#e8c060', share: 40, value: 180 },
      { name: 'Tar', colour: '#3a2a1a', share: 35, value: 300 },
    ],
    want: 1,
    purity: 0.75,
    time: 40,
    words: {
      goal: 'Draw lamp oil from rock oil: let the light part go first',
      principle: 'Each part boils at its own heat, so heat it in steps and catch each part apart.',
      hint: 'Boil off the naphtha into the waste jar, then switch jars (click) for the lamp oil',
    },
  },
  /** Zone refining silicon for the first chips. */
  zone: {
    style: 'zone',
    parts: [
      { name: 'Silicon', colour: '#8a9ab0', share: 999, value: 1 },
      { name: 'Impurities', colour: '#5a3a2a', share: 1, value: 0.1 },
    ],
    want: 0,
    purity: 0.9999,
    passes: 3,
    words: {
      goal: 'Purify the silicon rod: sweep the molten zone along it',
      principle: 'Impurities prefer the melt, so the molten zone carries them to one end.',
      hint: 'Drag the hot ring slowly to the right — keep it in the green',
    },
  },
};

/** The authored mixture must have a target and at least one other material to separate from it. */
export function validateSeparation(p: SeparateParams): void {
  if (p.parts.length < 2 || p.parts.length > 256 || !Number.isInteger(p.want) || !p.parts[p.want])
    throw new Error('Separation needs a mixture and a valid target part');
  if (p.style === 'sieve' && p.meshes?.length === 0) throw new Error('Sieving needs at least one mesh');
}
