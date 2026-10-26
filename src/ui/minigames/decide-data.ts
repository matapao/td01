// ---- Parameters ---------------------------------------------------------------------------------

/** A square on a program's yard: [column, row] from the top left. */
export type DecideCell = readonly [number, number];

export type DecideIcon = 'moon' | 'eye' | 'bell' | 'rain' | 'fire' | 'key' | 'gate' | 'lamp' | 'cart';

/** A condition the logic reads (a sensor or a switch). */
export interface DecideInput {
  key: string;
  /** Its words when true ("Night") and when false ("Day"). */
  on: string;
  off: string;
  icon?: DecideIcon;
  /** A letter or two for the truth table, when icons alone could be mixed up ("N", "S"). */
  short?: string;
}

/** What the logic drives, and what it should do in every case. */
export interface DecideOutput {
  name: string;
  /** Its words when driven ("lamps on") and not ("lamps off"). */
  on: string;
  off: string;
  icon?: 'lamp' | 'gate' | 'bell';
  /** Should it be on, for these conditions? */
  want: (s: Record<string, boolean>) => boolean;
}

/** A switch on offer: shut while its input is true — or, with `not`, a relay that opens then. */
export interface DecidePart {
  input: string;
  not?: boolean;
  /** How many there are (default: as many as you like). */
  count?: number;
}

export interface DecideLogic {
  inputs: DecideInput[];
  outputs: DecideOutput[];
  parts: DecidePart[];
  /** Side-by-side branches per output (default 2) and switches per branch (default 2). */
  branches?: number;
  slots?: number;
  /** Switches for a perfect (default: the fewest that do it). */
  par?: number;
  /** The ghost hint shown the first time: a part (index into `parts`) per place, -1 for none. */
  hint?: number[];
}

/** An instruction card. */
export type DecideOp = 'move' | 'left' | 'right' | 'ifRock' | 'act' | 'repeat';

export interface DecideProgram {
  /** The yard the machine works in. */
  cols: number;
  rows: number;
  start: DecideCell;
  facing: 'n' | 'e' | 's' | 'w';
  rocks?: DecideCell[];
  /** Squares to act on (samples to drill, holes to punch): all of them, to succeed. */
  targets: DecideCell[];
  /** Acting where there is no target is a mistake (a hole punched in the wrong place). */
  strict?: boolean;
  /** The deck on offer. */
  cards: { op: DecideOp; count?: number }[];
  /** How many cards the reader takes (default 6, at most 8). */
  slots?: number;
  /** Cards for a perfect (default: the fewest that do it). */
  par?: number;
  /** Steps before it gives up (default 40). */
  steps?: number;
  machine?: 'rover' | 'cart' | 'cutter';
  /** Which way IF ROCK turns (default right). */
  turn?: 'left' | 'right';
  /** The ghost hint shown the first time: a good program. */
  hint?: DecideOp[];
}

export interface DecideWords {
  /** What to do, and for what (the line at the top). */
  goal: string;
  /** The principle, added to the why when it works. */
  principle?: string;
  /** program: the act card ("DRILL", "PUNCH", "DROP") and what it acts on ("sample"). */
  act?: string;
  target?: string;
  /** The first-time hint. */
  hint?: string;
}

export interface DecideParams {
  mode: 'logic' | 'program';
  logic?: DecideLogic;
  program?: DecideProgram;
  /** Seconds to set up before it runs by itself (default 45). */
  time?: number;
  words: DecideWords;
}

// ---- Examples -----------------------------------------------------------------------------------

/** Ready set-ups: relay logic lessons and a rover program. */
export const DECIDE_EXAMPLES: Record<
  'lamps' | 'gate' | 'alarm' | 'gatehouse' | 'rover' | 'cutter',
  DecideParams
> = {
  /** Relays: lamps on when it is night AND a lookout sees the dead. */
  lamps: {
    mode: 'logic',
    logic: {
      inputs: [
        { key: 'night', on: 'Night', off: 'Day', icon: 'moon' },
        { key: 'seen', on: 'Dead seen', off: 'All quiet', icon: 'eye' },
      ],
      outputs: [
        {
          name: 'Tower lamps',
          on: 'lamps on',
          off: 'lamps off',
          icon: 'lamp',
          want: (s) => s['night'] === true && s['seen'] === true,
        },
      ],
      parts: [
        { input: 'night' },
        { input: 'seen' },
        { input: 'night', not: true },
        { input: 'seen', not: true },
      ],
      hint: [0, 1],
    },
    words: {
      goal: 'Lamps on by themselves: at night, when a lookout sees the dead',
      principle: 'Switches in a chain mean AND; side by side, OR.',
      hint: 'Drag Night and Dead seen into one branch, one after the other',
    },
  },
  /** Relays with NOT: the gate shuts when the dead are seen, unless a cart is coming in. */
  gate: {
    mode: 'logic',
    logic: {
      inputs: [
        { key: 'seen', on: 'Dead seen', off: 'All quiet', icon: 'eye' },
        { key: 'cart', on: 'Cart at gate', off: 'No cart', icon: 'cart' },
      ],
      outputs: [
        {
          name: 'Gate',
          on: 'gate shut',
          off: 'gate open',
          icon: 'gate',
          want: (s) => s['seen'] === true && !(s['cart'] === true),
        },
      ],
      parts: [
        { input: 'seen' },
        { input: 'cart' },
        { input: 'seen', not: true },
        { input: 'cart', not: true },
      ],
      hint: [0, 3],
    },
    words: {
      goal: 'Shut the gate when the dead are seen — but not on a cart coming in',
      principle: 'A relay that opens when its input is on means NOT.',
      hint: 'Dead seen, then a "not Cart" relay, in one branch',
    },
  },
  /** Relays: the alarm bell rings if either lookout sees the dead. */
  alarm: {
    mode: 'logic',
    logic: {
      inputs: [
        { key: 'north', on: 'North sees', off: 'North quiet', icon: 'eye', short: 'N' },
        { key: 'south', on: 'South sees', off: 'South quiet', icon: 'eye', short: 'S' },
        { key: 'night', on: 'Night', off: 'Day', icon: 'moon' },
      ],
      outputs: [
        {
          name: 'Alarm bell',
          on: 'bell rings',
          off: 'bell quiet',
          icon: 'bell',
          want: (s) => s['north'] === true || s['south'] === true,
        },
      ],
      parts: [{ input: 'north' }, { input: 'south' }, { input: 'night' }, { input: 'night', not: true }],
      hint: [0, -1, 1, -1],
    },
    words: {
      goal: 'Ring the bell if either lookout sees the dead, day or night',
      principle: 'Side by side, any one switch will do: that is OR.',
      hint: 'North sees in one branch, South sees in the other',
    },
  },
  /** Two outputs from the same conditions: the gatehouse lamps and the gate. */
  gatehouse: {
    mode: 'logic',
    logic: {
      inputs: [
        { key: 'night', on: 'Night', off: 'Day', icon: 'moon' },
        { key: 'seen', on: 'Dead seen', off: 'All quiet', icon: 'eye' },
      ],
      outputs: [
        {
          name: 'Lamps',
          on: 'lamps on',
          off: 'lamps off',
          icon: 'lamp',
          want: (s) => s['night'] === true || s['seen'] === true,
        },
        { name: 'Gate', on: 'gate shut', off: 'gate open', icon: 'gate', want: (s) => s['seen'] === true },
      ],
      parts: [
        { input: 'night' },
        { input: 'seen' },
        { input: 'night', not: true },
        { input: 'seen', not: true },
      ],
      hint: [0, -1, 1, -1, 1, -1, -1, -1],
    },
    words: {
      goal: 'Lamps on at night or when the dead are seen; the gate shuts only for the dead',
      principle: 'One set of switches can drive many things, each with its own logic.',
    },
  },
  /** Punched cards: drive the rover round the canyon to the sample. */
  rover: {
    mode: 'program',
    program: {
      cols: 7,
      rows: 4,
      start: [0, 3],
      facing: 'e',
      rocks: [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0],
        [6, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [3, 1],
        [4, 1],
        [6, 1],
        [0, 2],
        [1, 2],
        [2, 2],
        [3, 2],
        [4, 2],
        [6, 2],
        [6, 3],
      ],
      targets: [[5, 0]],
      cards: [
        { op: 'move' },
        { op: 'left' },
        { op: 'right' },
        { op: 'ifRock' },
        { op: 'act' },
        { op: 'repeat' },
      ],
      slots: 6,
      par: 4,
      turn: 'left',
      machine: 'rover',
      hint: ['move', 'ifRock', 'act', 'repeat'],
    },
    words: {
      goal: 'Program the rover: up the canyon to drill the sample',
      principle: 'A machine follows its program: steps, a decision and a loop.',
      act: 'DRILL',
      target: 'sample',
      hint: 'MOVE, IF ROCK, DRILL, REPEAT — the loop drives it all the way',
    },
  },
  /** A cutting tool punches three holes in a row. */
  cutter: {
    mode: 'program',
    program: {
      cols: 7,
      rows: 3,
      start: [0, 1],
      facing: 'e',
      targets: [
        [2, 1],
        [4, 1],
        [6, 1],
      ],
      strict: true,
      cards: [{ op: 'move' }, { op: 'act' }, { op: 'repeat' }, { op: 'left' }, { op: 'right' }],
      slots: 6,
      steps: 30,
      machine: 'cutter',
      hint: ['move', 'move', 'act', 'repeat'],
    },
    words: {
      goal: 'Program the cutter: punch the three marked holes',
      principle: 'A program can guide a cutting tool; a loop repeats the same moves.',
      act: 'PUNCH',
      target: 'hole',
    },
  },
};
