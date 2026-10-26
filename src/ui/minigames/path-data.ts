import type { Quality } from './types.ts';

// ---- Parameters ---------------------------------------------------------------------------------

/** A point on the board: [column, row], counted from the top left. */
export type GridPt = readonly [number, number];

/** What is laid: sets the look and what runs along it. */
export type PathLook = 'wire' | 'rail' | 'pipe' | 'belt' | 'link' | 'track';

/** Things in the way (nothing can be laid through them). */
export type PathObstacle = 'rock' | 'tree' | 'house' | 'water' | 'crater';

/** A size of wire (or pipe): how much it resists, how much it carries, what it costs. */
export interface PathGauge {
  name: string;
  /** Resistance of one square of it (ohms). */
  ohms: number;
  /** The flow it carries before it runs hot (amps). */
  amps: number;
  /** What one square of it costs. */
  cost: number;
}

/** The push: a dynamo, an intake, a battery. */
export interface PathSource {
  name: string;
  plus: GridPt;
  minus: GridPt;
  /** Its push (volts) and its own resistance (ohms; how much it sags under load, default 0.5). */
  volts: number;
  ohms?: number;
}

/** Something that draws current, with its rating plate. */
export interface PathLoad {
  name: string;
  /** Its two leads, on neighbouring points. */
  a: GridPt;
  b: GridPt;
  /** The push it is made for (volts) and what it draws then (watts). */
  volts: number;
  watts: number;
  icon?: 'lamp' | 'motor' | 'fence' | 'bell' | 'mast';
  /** Share of its push that counts as working (default 0.8) and as perfect (default 0.93). */
  works?: number;
  perfect?: number;
  /** It may be left unwired (the saw that can wait); wired, it must work like the rest. */
  optional?: boolean;
}

/** A fuse: the weak link that breaks first, on purpose. */
export interface PathFuse {
  a: GridPt;
  b: GridPt;
  amps: number;
}

/** A named point on a route board (a mine head, the forge, a lander, a sample). */
export interface PathStop {
  name: string;
  at: GridPt;
}

/** Pieces already in place, or a ghost hint: a line through corner points, in one gauge. */
export interface PathRun {
  path: GridPt[];
  gauge?: number;
}

export interface PathWords {
  /** What to do, and for what (the line at the top). */
  goal: string;
  /** The principle, added to the why when it works. */
  principle?: string;
  /** The run button ("Throw the lever"). */
  lever?: string;
  /** What the budget counts ("copper", "rails"). */
  piece?: string;
  /** The first-time hint. */
  hint?: string;
}

/** What decided a run. */
export type PathCause =
  | 'perfect' // it all works, as well as it can
  | 'over-par' // works, with more pieces than needed
  | 'short' // a wire straight from plus to minus
  | 'burnt' // a wire carried more than its gauge
  | 'fuse' // a fuse popped
  | 'popped' // a load got too much push
  | 'open' // a load isn't on a closed loop
  | 'chain' // a load shares its push with another in a chain
  | 'wires' // a long thin wire ate the push
  | 'sag' // the source was overloaded
  | 'gap';

// a stop isn't joined

export interface PathOutcome {
  quality: Quality;
  cause: PathCause;
  /** The pieces (budget) used. */
  used: number;
  /** circuit: each load's share of its rated push (0 = dark, 1 = as made for). */
  push: number[];
}

export interface PathParams {
  /** 'circuit': current from a source through loads, solved for real; 'route': join a start to its stops. */
  style: 'circuit' | 'route';
  /** Default: 'wire' for circuits, 'rail' for routes. */
  look?: PathLook;
  /** The board: cols × rows points (12 × 6 fits well). */
  cols: number;
  rows: number;
  /** circuit: the source, the loads and any fuses already in place. */
  source?: PathSource;
  loads?: PathLoad[];
  fuses?: PathFuse[];
  /** route: where it starts, and every stop it must reach. */
  start?: PathStop;
  stops?: PathStop[];
  obstacles?: { at: GridPt; kind?: PathObstacle }[];
  /** route: things run from the stops in to the start (ore to the forge) instead of out from it. */
  inbound?: boolean;
  /** Pieces already laid (the old line, the return rail); they can't be taken up. */
  laid?: PathRun[];
  /** circuit: the gauges on offer (default thin / medium / thick copper). */
  gauges?: PathGauge[];
  /** What you may spend, in gauge costs (a square of thin wire or a rail costs 1). */
  budget: number;
  /** The spend for a perfect (route default: the shortest joining). */
  par?: number;
  /** Seconds before it runs by itself (default 40). */
  time?: number;
  /** The ghost hint shown the first time. */
  hint?: PathRun[];
  words: PathWords;
  /** Your own why-line for an outcome (return nothing to keep the built-in one). */
  why?: (o: PathOutcome) => string | undefined;
}

// ---- Examples -----------------------------------------------------------------------------------

/** Ready set-ups: the switchboard lessons (TECH_LINEAGE §5) and a few routes. */
export const PATH_EXAMPLES: Record<
  'towers' | 'far' | 'workshop' | 'brownout' | 'rails' | 'rover' | 'pipes' | 'belts' | 'network',
  PathParams
> = {
  /** §5 lesson 2: two towers off one intake — chain or side by side. */
  towers: {
    style: 'circuit',
    cols: 12,
    rows: 6,
    source: { name: 'Intake', plus: [0, 1], minus: [0, 4], volts: 120 },
    loads: [
      { name: 'Gate tower', a: [4, 1], b: [4, 2], volts: 120, watts: 60, icon: 'lamp' },
      { name: 'Bridge tower', a: [9, 1], b: [9, 2], volts: 120, watts: 60, icon: 'lamp' },
    ],
    obstacles: [
      { at: [6, 3], kind: 'house' },
      { at: [2, 3], kind: 'tree' },
      { at: [11, 4], kind: 'tree' },
    ],
    budget: 30,
    par: 20,
    hint: [
      {
        path: [
          [0, 1],
          [9, 1],
        ],
      },
      {
        path: [
          [9, 2],
          [0, 2],
          [0, 4],
        ],
      },
    ],
    words: {
      goal: 'Light both towers for the night watch',
      principle: 'In a chain things share the push; side by side each gets all of it.',
      hint: 'Drag along the dots: + to each lamp, each lamp back to −',
    },
  },
  /** §5 lesson 3: the far tower — a long thin wire turns push into heat. */
  far: {
    style: 'circuit',
    cols: 12,
    rows: 6,
    source: { name: 'Intake', plus: [0, 1], minus: [0, 4], volts: 120 },
    loads: [{ name: 'Far lookout', a: [11, 1], b: [11, 2], volts: 120, watts: 100, icon: 'lamp' }],
    gauges: [
      { name: 'thin', ohms: 2.5, amps: 0.75, cost: 1 },
      { name: 'medium', ohms: 1, amps: 5, cost: 2 },
      { name: 'thick', ohms: 0.4, amps: 12, cost: 3 },
    ],
    obstacles: [
      { at: [5, 2], kind: 'rock' },
      { at: [6, 3], kind: 'tree' },
      { at: [8, 2], kind: 'tree' },
    ],
    budget: 75,
    hint: [
      {
        path: [
          [0, 1],
          [11, 1],
        ],
        gauge: 2,
      },
      {
        path: [
          [11, 2],
          [11, 4],
          [0, 4],
        ],
        gauge: 2,
      },
    ],
    words: {
      goal: 'Light the far lookout — it is a long way out',
      principle: 'A long, narrow path turns part of the push into heat.',
      hint: 'Pick a thick wire (3), then lay it out to the lamp and back',
    },
  },
  /** §5 lesson 4: a workshop motor — on the lamp circuit its small fuse pops; it needs its own line. */
  workshop: {
    style: 'circuit',
    cols: 12,
    rows: 6,
    source: { name: 'Intake', plus: [0, 1], minus: [0, 4], volts: 120 },
    fuses: [{ a: [1, 1], b: [2, 1], amps: 2 }],
    laid: [
      {
        path: [
          [0, 1],
          [1, 1],
        ],
      },
      {
        path: [
          [2, 1],
          [5, 1],
        ],
      },
      {
        path: [
          [5, 2],
          [5, 4],
          [0, 4],
        ],
      },
    ],
    loads: [
      { name: 'Lamp', a: [5, 1], b: [5, 2], volts: 120, watts: 60, icon: 'lamp' },
      {
        name: 'Saw motor',
        a: [8, 1],
        b: [8, 2],
        volts: 120,
        watts: 600,
        icon: 'motor',
        works: 0.65,
        perfect: 0.8,
      },
    ],
    obstacles: [
      { at: [10, 3], kind: 'house' },
      { at: [3, 3], kind: 'tree' },
    ],
    budget: 50,
    hint: [
      {
        path: [
          [0, 1],
          [0, 0],
          [8, 0],
          [8, 1],
        ],
        gauge: 1,
      },
      {
        path: [
          [8, 2],
          [8, 5],
          [0, 5],
          [0, 4],
        ],
        gauge: 1,
      },
    ],
    words: {
      goal: 'Power the saw motor — the lamp circuit is already wired',
      principle: 'More things on, more flow: a big draw needs its own, thicker line.',
      hint: 'Run a medium wire (2) of its own from + and − to the motor',
    },
  },
  /** §5 lesson 5: a small dynamo can't run everything at once — choose what runs. */
  brownout: {
    style: 'circuit',
    cols: 12,
    rows: 6,
    source: { name: 'Dynamo', plus: [0, 1], minus: [0, 4], volts: 120, ohms: 4 },
    loads: [
      { name: 'Lamp', a: [3, 1], b: [3, 2], volts: 120, watts: 60, icon: 'lamp', perfect: 0.88 },
      { name: 'Fence', a: [6, 1], b: [6, 2], volts: 120, watts: 40, icon: 'fence', perfect: 0.88 },
      { name: 'Radio mast', a: [9, 1], b: [9, 2], volts: 120, watts: 150, icon: 'mast', perfect: 0.88 },
      { name: 'Saw', a: [11, 3], b: [11, 4], volts: 120, watts: 500, icon: 'motor', optional: true },
    ],
    gauges: [
      { name: 'thin', ohms: 0.4, amps: 2, cost: 1 },
      { name: 'medium', ohms: 0.16, amps: 8, cost: 2 },
      { name: 'thick', ohms: 0.06, amps: 15, cost: 3 },
    ],
    obstacles: [{ at: [5, 4], kind: 'tree' }],
    budget: 64,
    hint: [
      {
        path: [
          [0, 1],
          [9, 1],
        ],
        gauge: 1,
      },
      {
        path: [
          [9, 2],
          [0, 2],
          [0, 4],
        ],
        gauge: 1,
      },
    ],
    words: {
      goal: 'Night watch: lamp, fence and mast on — the saw can wait till morning',
      principle: 'Power is push times flow, and a dynamo gives only so much: choose what runs.',
      hint: 'Wire the lamp, fence and mast side by side; leave the saw off',
    },
  },
  /** Rails: ore carts from the mine head to the forge. */
  rails: {
    style: 'route',
    look: 'rail',
    cols: 12,
    rows: 6,
    start: { name: 'Mine head', at: [0, 4] },
    stops: [{ name: 'Forge', at: [11, 1] }],
    obstacles: [
      { at: [3, 3], kind: 'rock' },
      { at: [3, 4], kind: 'rock' },
      { at: [3, 5], kind: 'rock' },
      { at: [6, 1], kind: 'water' },
      { at: [6, 2], kind: 'water' },
      { at: [7, 2], kind: 'water' },
      { at: [9, 3], kind: 'tree' },
      { at: [9, 4], kind: 'tree' },
      { at: [10, 0], kind: 'tree' },
    ],
    budget: 22,
    words: {
      goal: 'Lay rails from the mine head to the forge',
      principle: 'Iron rails let wheels roll with almost no friction.',
    },
  },
  /** The rover: a route round the rocks to the sample. */
  rover: {
    style: 'route',
    look: 'track',
    cols: 12,
    rows: 6,
    start: { name: 'Rover', at: [0, 2] },
    stops: [{ name: 'Sample', at: [11, 3] }],
    obstacles: [
      { at: [2, 1], kind: 'rock' },
      { at: [2, 2], kind: 'rock' },
      { at: [2, 3], kind: 'crater' },
      { at: [5, 2], kind: 'crater' },
      { at: [5, 3], kind: 'rock' },
      { at: [5, 4], kind: 'rock' },
      { at: [8, 1], kind: 'rock' },
      { at: [8, 2], kind: 'crater' },
      { at: [8, 3], kind: 'rock' },
      { at: [10, 4], kind: 'rock' },
    ],
    budget: 20,
    words: {
      goal: 'Plan the rover’s drive to the sample, round the rocks',
      principle: 'Between your commands the rover drives itself round what it sees.',
    },
  },
  /** Pipes: water from the spring to the fountain and the trough. */
  pipes: {
    style: 'route',
    look: 'pipe',
    cols: 12,
    rows: 6,
    start: { name: 'Spring', at: [0, 1] },
    stops: [
      { name: 'Fountain', at: [6, 4] },
      { name: 'Trough', at: [11, 2] },
    ],
    obstacles: [
      { at: [3, 0], kind: 'rock' },
      { at: [3, 1], kind: 'rock' },
      { at: [3, 2], kind: 'rock' },
      { at: [8, 2], kind: 'house' },
      { at: [8, 3], kind: 'tree' },
      { at: [5, 4], kind: 'tree' },
    ],
    budget: 24,
    words: {
      goal: 'Pipe the spring to the fountain and the trough',
      principle: 'Water runs wherever the pipe leads it — and out of any open end.',
    },
  },
  /** Conveyors: ore from two mine heads to the forge. */
  belts: {
    style: 'route',
    look: 'belt',
    cols: 12,
    rows: 6,
    start: { name: 'Forge', at: [11, 2] },
    stops: [
      { name: 'East shaft', at: [1, 0] },
      { name: 'West shaft', at: [2, 5] },
    ],
    obstacles: [
      { at: [6, 1], kind: 'rock' },
      { at: [6, 2], kind: 'rock' },
      { at: [6, 3], kind: 'rock' },
      { at: [4, 4], kind: 'tree' },
    ],
    inbound: true,
    budget: 26,
    words: {
      goal: 'Belt the ore from both shafts to the forge',
      principle: 'A belt moves things without anyone carrying them.',
    },
  },
  /** Networks: link three towers to the keep. */
  network: {
    style: 'route',
    look: 'link',
    cols: 12,
    rows: 6,
    start: { name: 'Keep', at: [1, 2] },
    stops: [
      { name: 'North tower', at: [6, 0] },
      { name: 'East tower', at: [10, 3] },
      { name: 'South tower', at: [5, 5] },
    ],
    obstacles: [
      { at: [4, 2], kind: 'water' },
      { at: [4, 3], kind: 'water' },
      { at: [5, 3], kind: 'water' },
      { at: [8, 1], kind: 'tree' },
      { at: [8, 4], kind: 'house' },
    ],
    budget: 26,
    words: {
      goal: 'Link all three towers to the keep with as little cable as you can',
      principle: 'Many machines can share one network of links.',
    },
  },
};
