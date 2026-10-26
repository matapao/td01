/**
 * The picture. Tune: 'radio' (static clears into a voice and a message), 'focus' (a far tower
 * sharpens in a spyglass), 'pendulum' (a clock's tick against the bell's), 'meter' (a needle).
 * Moment: 'fall' (a capsule or lander coming down: brake in time), 'sweep' (a needle sweeping a dial).
 */
export type SweetLook = 'radio' | 'focus' | 'pendulum' | 'meter' | 'fall' | 'sweep';

/** Tune: the dial, the hidden value, and how close is close enough. */
export interface SweetTune {
  /** The dial's ends and unit. */
  min: number;
  max: number;
  unit: string;
  /** Decimals on the dial (default 0). */
  decimals?: number;
  /** Where the dial starts (default: the end further from the target). */
  start?: number;
  /** The hidden value: fixed, or picked anew each run between these two. */
  target: number | [number, number];
  /** How close counts as good, and as perfect (dial units). */
  good: number;
  perfect: number;
  /** How far off the feedback first shows (default 6 × good). */
  reach?: number;
  /** Hold it within `good` this long to lock it in (s, default 2). */
  hold?: number;
  /** The hidden value wanders slowly by up to this much, so it has to be held by feel. */
  drift?: number;
}

/** Moment: how long it runs, and when the right moment is. */
export interface SweetMoment {
  /** From the start to too late (s). */
  duration: number;
  /** The good and perfect windows, as parts of the run (0–1). */
  good: [number, number];
  perfect: [number, number];
  /** Each run shifts the windows by up to this much (0–1), so you go by what you see, not by counting. */
  jitter?: number;
  /** 'sweep': how many times the needle crosses the dial in the run (default 3). */
  sweeps?: number;
  /** 'sweep': the window drifts by up to this much (0–1) as it runs. */
  drift?: number;
  /** 'sweep': the windows narrow by this share by the end (0–1). */
  shrink?: number;
  /**
   * Readouts as it goes: from → to over the run (`curve` > 1 changes slowly at first, < 1 fast);
   * `braked`: where it settles when the moment is right (a speed under the parachute; 0 m once landed).
   */
  readouts?: {
    label: string;
    unit: string;
    from: number;
    to: number;
    curve?: number;
    decimals?: number;
    braked?: number;
  }[];
  /** 'fall': where it comes down and how it brakes — at home through the air on a parachute, or out in airless space on its landing rockets. */
  world?: 'home' | 'space';
}

export interface SweetParams {
  mode: 'tune' | 'moment';
  look: SweetLook;
  /** What to do, in a line ('Tune in the far lookout.'). */
  goal: string;
  tune?: SweetTune;
  moment?: SweetMoment;
  /** Words for the two sides: too low / too high (tune), or too early / too late (moment). */
  words: [string, string];
  /** The why-lines: too low (or early), too high (or late), good, perfect — the principle and the cause. */
  whyLow: string;
  whyHigh: string;
  whyGood: string;
  whyPerfect: string;
  /** Moment: the why-line when it's never pressed at all (default: the too-late line). */
  whyMissed?: string;
  /** 'radio': what comes through once it's tuned. */
  message?: string;
  /** Moment: the button ('Open the parachute'); Space, Enter or a click on the picture do the same. */
  action?: string;
  /** Tune: how long you have (s, default 30); then it's a miss on whichever side you're on. */
  time?: number;
}

/** The demo set-ups: the radio by default; ?variant=focus | pendulum | solar | parachute | landing | sweep on the playground. */
export const SWEET_DEMOS: Record<
  'radio' | 'focus' | 'pendulum' | 'solar' | 'parachute' | 'landing' | 'sweep',
  SweetParams
> = {
  radio: {
    mode: 'tune',
    look: 'radio',
    goal: 'Tune in the far lookout: turn slowly, and hold it where the voice is clearest.',
    tune: {
      min: 500,
      max: 1600,
      unit: 'kHz',
      target: [700, 1400],
      good: 16,
      perfect: 6,
      reach: 130,
      hold: 2,
      drift: 4,
    },
    words: ['lower', 'higher'],
    message: 'Lookout to the keep: the dead are on the east road. Light the towers!',
    whyLow: 'Below the station: only static — tuning picks one wave out of all the air.',
    whyHigh: 'Past the station: only static — tuning picks one wave out of all the air.',
    whyGood: 'Tuned in: the set picks one wave out of the air, and the voice comes through.',
    whyPerfect: 'Right on the station: one wave picked out of all of them — clear as a bell.',
    time: 30,
  },
  focus: {
    mode: 'tune',
    look: 'focus',
    goal: 'Focus the spyglass on the far tower: slide the lens until the picture is sharp.',
    tune: {
      min: 5,
      max: 40,
      unit: 'cm',
      decimals: 1,
      target: [14, 31],
      good: 0.9,
      perfect: 0.35,
      reach: 8,
      hold: 1.5,
    },
    words: ['too near', 'too far'],
    whyLow: 'The lens sat too close: the light met before it focused — all blur.',
    whyHigh: 'The lens sat too far: the light crossed past its focus — all blur.',
    whyGood: 'In focus: a lens bends the light to meet in one spot — the tower comes sharp.',
    whyPerfect: 'Pin-sharp: right where the lens brings the light together.',
    time: 25,
  },
  pendulum: {
    mode: 'tune',
    look: 'pendulum',
    goal: 'Set the pendulum so the clock ticks with the bell: once a second.',
    tune: {
      min: 0.25,
      max: 2,
      unit: 'm',
      decimals: 2,
      target: 0.994,
      good: 0.045,
      perfect: 0.016,
      reach: 0.45,
      hold: 2.5,
    },
    words: ['ticks too fast', 'ticks too slow'],
    whyLow: 'Too short: a short pendulum swings faster — the clock ran ahead of the bell.',
    whyHigh: 'Too long: a long pendulum swings slower — the clock fell behind the bell.',
    whyGood: 'In step: a pendulum takes the same time every swing — its length sets the beat.',
    whyPerfect: 'Just under a metre: one swing a second, every second — a clock to set the towers by.',
    time: 30,
  },
  solar: {
    mode: 'tune',
    look: 'meter',
    goal: 'Aim the solar panel at the sun: turn it until the meter peaks, and hold it there.',
    tune: { min: 0, max: 90, unit: '°', target: [25, 65], good: 3, perfect: 1.2, reach: 28, hold: 2 },
    words: ['too flat', 'too steep'],
    whyLow: 'Too flat: the light came in at a slant and knocked few charges loose.',
    whyHigh: 'Too steep: the light came in at a slant and knocked few charges loose.',
    whyGood: 'Facing the sun: light knocks charges loose in silicon — the more light, the more current.',
    whyPerfect: 'Square to the sun: every bit of light lands, and the panel gives all it can.',
    time: 25,
  },
  parachute: {
    mode: 'moment',
    look: 'fall',
    goal: 'Bring the capsule home: open the parachute once the air has slowed it — but in time.',
    moment: {
      duration: 11,
      good: [0.36, 0.66],
      perfect: [0.38, 0.47],
      jitter: 0.07,
      world: 'home',
      readouts: [
        { label: 'Height', unit: 'km', from: 30, to: 0, curve: 0.25, decimals: 1 },
        { label: 'Speed', unit: 'm/s', from: 1600, to: 60, curve: 0.12, braked: 8 },
      ],
    },
    words: ['too early', 'too late'],
    action: 'Open the chute',
    whyLow: 'Too early: it was still going so fast that the parachute tore to ribbons.',
    whyHigh: 'Too late: too little air left to slow it — it thumped into a field.',
    whyGood: 'The air braked it first, then the parachute: it came down gently.',
    whyPerfect:
      'Just as the glow died: the air did the hard braking, and the parachute had all the time it needed.',
  },
  landing: {
    mode: 'moment',
    look: 'fall',
    goal: 'Come down on the small grey world: no air to brake — light the rockets in time.',
    moment: {
      duration: 9,
      good: [0.5, 0.74],
      perfect: [0.55, 0.64],
      jitter: 0.06,
      world: 'space',
      readouts: [
        { label: 'Height', unit: 'm', from: 3000, to: 0, curve: 1.6, braked: 0 },
        { label: 'Speed', unit: 'm/s', from: 40, to: 160, curve: 0.8, braked: 1 },
      ],
    },
    words: ['too early', 'too late'],
    action: 'Fire rockets',
    whyLow: 'Too early: the fuel ran out high up, and it fell the rest of the way.',
    whyHigh: 'Too late: the rockets couldn’t stop it in time — it hit hard.',
    whyGood: 'With no air to slow it, the rockets did all the braking: it settled on its legs.',
    whyPerfect: 'Lit just in time: the rockets braked it to a whisper, and it touched down on its legs.',
  },
  sweep: {
    mode: 'moment',
    look: 'sweep',
    goal: 'Course correction: fire the thrusters as the needle swings onto the course.',
    moment: {
      duration: 10,
      sweeps: 4,
      good: [0.52, 0.66],
      perfect: [0.56, 0.62],
      jitter: 0.12,
      drift: 0.04,
      shrink: 0.4,
    },
    words: ['left of the line', 'right of the line'],
    action: 'Fire',
    whyLow: 'Fired with the needle short of the line: the push sent it off to the left.',
    whyHigh: 'Fired with the needle past the line: the push sent it off to the right.',
    whyMissed: 'Never fired: the craft drifted on, off its course.',
    whyGood: 'A small push at the right moment: back on course.',
    whyPerfect: 'Fired dead on the line: a small push, at just the right moment, sets the whole course.',
  },
};
