/** A size on offer: a plain number, or one with its own label (and colour, for cells). */
export type SizesOption = number | { value: number; label: string; colour?: string };

/** What a slot is in the picture: gear teeth, cells, or a rocket's parts. */
export type SizesRole = 'driver' | 'driven' | 'series' | 'parallel' | 'cell' | 'stages' | 'fuel' | 'payload';

/** A part to size: its name, the sizes on offer, and what the picture draws it as. */
export interface SizesSlot {
  /** Its name ('Driver gear'). */
  name: string;
  /** The sizes on offer, smallest first. */
  options: SizesOption[];
  /** The unit after a plain number ('teeth'). */
  unit?: string;
  /** The option it starts on (index; default 0). */
  start?: number;
  /** What the picture draws it as (see SizesParams.style). */
  role?: SizesRole;
}

/** The result to hit: what it is, its unit, and its bands. */
export interface SizesTarget {
  /** What the result is ('Millstone speed'). */
  label: string;
  /** Its unit ('turns/min'). */
  unit: string;
  /** The good band, and the perfect band inside it. */
  lo: number;
  hi: number;
  perfectLo: number;
  perfectHi: number;
  /** The gauge's ends (default 0 to about one and a half times the band's top). */
  min?: number;
  max?: number;
  /** Decimals in the reading (default 0). */
  decimals?: number;
  /** What the band is called in the picture, if anything ('orbit'). */
  band?: string;
}

export interface SizesParams {
  /** What it's for, in a line ('The millstone grinds best at about 120 turns a minute.'). */
  goal: string;
  /** Two or three parts to size. */
  slots: SizesSlot[];
  /** The result of the chosen sizes (one value per slot, in order): pure, called on every change. */
  compute: (values: number[]) => number;
  target: SizesTarget;
  /** The gauge's end words for too low / too high (['too slow', 'too fast']). */
  words?: [string, string];
  /** The why-lines: too low, too high, good, perfect (name the principle and the cause). */
  whyLow: string;
  whyHigh: string;
  whyGood: string;
  whyPerfect: string;
  /**
   * The picture: 'gears' — two meshing gears (roles driver, driven) turning at the result; 'cells' —
   * a battery (roles series, parallel, cell) lighting a lamp as bright as the result; 'rocket' — a
   * staged rocket (roles stages, fuel, payload) that climbs as high as the result; 'generic' — a dial.
   */
  style?: 'gears' | 'cells' | 'rocket' | 'generic';
  /** The test button ('Run the mill', 'Launch'); Enter does the same (default 'Test'). */
  action?: string;
}

/** Rocket sums for the demo: each stage burns its fuel, then drops its empty tank. */
export function rocketSpeed(stages: number, fuel: number, payload: number): number {
  const ve = 3.4;
  const dry = 0.1 * fuel + 0.4;
  let m = payload + stages * (fuel + dry);
  let v = 0;
  for (let k = 0; k < stages; k++) {
    v += ve * Math.log(m / (m - fuel));
    m -= fuel + dry;
  }
  return Math.max(0, v - 1.4);
}

/** The demo set-ups: gears by default; ?variant=rocket | cells | transformer on the playground. */
export const SIZES_DEMOS: Record<'gears' | 'rocket' | 'cells' | 'transformer', SizesParams> = {
  gears: {
    goal: 'The wheel’s shaft turns 30 times a minute; the millstone grinds best at about 120.',
    style: 'gears',
    action: 'Run the mill',
    slots: [
      {
        name: 'Driver gear (on the shaft)',
        options: [16, 24, 32, 40, 48, 64],
        unit: 'teeth',
        start: 1,
        role: 'driver',
      },
      {
        name: 'Driven gear (on the stone)',
        options: [8, 12, 16, 20, 24],
        unit: 'teeth',
        start: 3,
        role: 'driven',
      },
    ],
    compute: ([a, b]) => {
      if (a === undefined || b === undefined) throw new Error('Gear calculation needs two sizes');
      return (30 * a) / b;
    },
    target: {
      label: 'Millstone',
      unit: 'turns/min',
      lo: 90,
      hi: 150,
      perfectLo: 110,
      perfectHi: 130,
      max: 250,
    },
    words: ['too slow', 'too fast'],
    whyLow: 'Too slow: the driver isn’t big enough against the driven gear — the stone barely turned.',
    whyHigh: 'Too fast: a big gear driving a tiny one spun the stone too hard — it scorched the flour.',
    whyGood: 'A big wheel driving a small one turns it faster: the stone runs near its speed.',
    whyPerfect: 'Four times the teeth, four times the turns: the stone runs just right.',
  },
  rocket: {
    goal: 'Put the payload in orbit: about 7.9 km/s, no more, no less.',
    style: 'rocket',
    action: 'Launch',
    slots: [
      { name: 'Stages', options: [1, 2, 3], role: 'stages' },
      { name: 'Fuel in each stage', options: [10, 20, 40, 80], unit: 't', start: 1, role: 'fuel' },
      { name: 'Payload', options: [1, 2, 4], unit: 't', start: 1, role: 'payload' },
    ],
    compute: ([s, f, p]) => {
      if (s === undefined || f === undefined || p === undefined)
        throw new Error('Rocket calculation needs stages, fuel and payload');
      return rocketSpeed(s, f, p);
    },
    target: {
      label: 'Speed',
      unit: 'km/s',
      lo: 7.4,
      hi: 8.5,
      perfectLo: 7.7,
      perfectHi: 8.1,
      max: 10,
      decimals: 1,
      band: 'orbit',
    },
    words: ['falls back', 'flies off'],
    whyLow: 'Too slow to stay up: more fuel is also more weight to lift — stages drop their empty tanks.',
    whyHigh: 'Too fast: it shot past the orbit and off into the dark.',
    whyGood: 'Fast enough to stay up: each stage dropped its empty tank, so the rest flew lighter.',
    whyPerfect: 'Right into orbit: stages shed their empty tanks and the payload reached just the speed.',
  },
  cells: {
    goal: 'The lantern’s lamp wants a push of about 6 volts.',
    style: 'cells',
    action: 'Switch on',
    slots: [
      { name: 'Cells in a chain', options: [1, 2, 3, 4, 5, 6, 7, 8], start: 1, role: 'series' },
      {
        name: 'Kind of cell',
        options: [
          { value: 0.9, label: 'Lemon, 0.9 V', colour: '#d9c24a' },
          { value: 1.1, label: 'Zinc, 1.1 V', colour: '#9aa3ad' },
          { value: 1.5, label: 'Dry, 1.5 V', colour: '#c9733f' },
          { value: 2, label: 'Lead, 2 V', colour: '#5d6168' },
        ],
        role: 'cell',
      },
    ],
    compute: ([n, v]) => {
      if (n === undefined || v === undefined) throw new Error('Cell calculation needs count and voltage');
      return n * v;
    },
    target: { label: 'Push', unit: 'V', lo: 5, hi: 7, perfectLo: 5.7, perfectHi: 6.3, max: 12, decimals: 1 },
    words: ['dim', 'pops'],
    whyLow: 'Too little push: the lamp only glowed dull red — cells in a chain add their push.',
    whyHigh: 'Too much push: the filament burnt through — it popped.',
    whyGood: 'Cells in a chain add their push: the lamp lights up.',
    whyPerfect: 'Just the push the lamp wants: cells in a chain add up to six volts.',
  },
  transformer: {
    goal: 'The far line wants about 2000 volts; the mill’s dynamo gives 230.',
    style: 'generic',
    action: 'Switch on',
    slots: [
      { name: 'Turns on the mill’s coil', options: [60, 80, 100, 120, 150, 200], start: 2, role: 'driver' },
      {
        name: 'Turns on the line’s coil',
        options: [200, 400, 600, 800, 1000, 1200],
        start: 1,
        role: 'driven',
      },
    ],
    compute: ([a, b]) => {
      if (a === undefined || b === undefined) throw new Error('Transformer calculation needs two coil sizes');
      return (230 * b) / a;
    },
    target: {
      label: 'Line push',
      unit: 'V',
      lo: 1700,
      hi: 2400,
      perfectLo: 1900,
      perfectHi: 2150,
      max: 4000,
    },
    words: ['too weak', 'arcs over'],
    whyLow: 'Too few turns on the line’s coil: the push stayed too low to reach far.',
    whyHigh: 'Too many turns on the line’s coil: the push jumped the insulators — sparks.',
    whyGood: 'More turns on the outgoing coil raise the push: the line reaches the far towers.',
    whyPerfect: 'Turns in the right ratio: high push, low flow — it travels far with little loss.',
  },
};
