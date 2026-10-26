import type { EnemyKind, Parts } from './content-types.ts';

export const MIN = {
  rock: 0,
  coal: 1,
  copper: 2,
  iron: 3,
  sulfur: 4,
  silver: 5,
  quartz: 6,
  gold: 7,
  ruby: 8,
  topaz: 9,
  sapphire: 10,
  emerald: 11,
  amethyst: 12,
} as const;

export type MineralId = (typeof MIN)[keyof typeof MIN];

export interface LairDef {
  name: string;
  x: number;
  z: number;
  leash: number;
  respawn: number;
  members: { kind: EnemyKind; count: number }[];
  /** What the creatures sat on: handed out when the lair is cleared. */
  spoils: Parts;
  gold: number;
  line: number;
  /** A den in an old working (its dressing) or a chamber's guardians. */
  den: 'wolves' | 'raiders' | 'dead' | 'guard';
}

// ---- Designing the lines ------------------------------------------------------------------------

/** A chamber's rock, as circles round its stop: (along, aside, radius), aside > 0 to the right of the line. */
export type Blob = [number, number, number];

/** A mineral in a chamber's rock: what, how it runs (veins, seams, pockets) and how much of the rock it takes. */
export type Ore = [MineralId, 'vein' | 'seam' | 'pocket', number];

export interface ChamberSpec {
  name: string;
  roof: number;
  blobs: Blob[];
  ores: Ore[];
  /** Where its lair sits (along, aside from the stop), if it has guardians. */
  guard?: [number, number];
}

export interface DenSpec {
  /** From the Grade I stop: the old working's drift (along, aside) points and its den. */
  drift: [number, number][];
  den: [number, number, number];
  lair: Omit<LairDef, 'x' | 'z' | 'line'>;
}

/** A patch of workable rock along a drift: from–to (distance along), which side, how deep. */
export interface PatchSpec {
  name: string;
  from: number;
  to: number;
  side: 1 | -1;
  depth: number;
  ores: Ore[];
}

export interface LineSpec {
  name: string;
  mineral: string;
  color: string;
  /** Heading out of the station: 0 east, 1 south, 2 west, 3 north. */
  dir: 0 | 1 | 2 | 3;
  /** P the station piece, S a straight, R / L a quarter turn right / left. */
  track: string;
  stopI: number;
  /** Cave-ins (distance along); those before stopI shut the whole line. */
  caves: number[];
  gradeI: ChamberSpec;
  gradeII: ChamberSpec;
  den?: DenSpec;
  guardII: Omit<LairDef, 'x' | 'z' | 'line'>;
  patches?: PatchSpec[];
}

export const LINE_SPECS: LineSpec[] = [
  {
    name: 'Copper Line',
    mineral: 'Copper',
    color: '#e07a3c',
    dir: 0,
    track: 'P SSSS SSSSSSS SS R SSSS SSS',
    stopI: 13.1,
    caves: [24.6],
    gradeI: {
      name: 'the Copper Face',
      roof: 2.35,
      blobs: [
        [-2.6, -1.3, 3.0],
        [1.0, -1.6, 3.4],
        [3.3, 0.8, 2.3],
        [-0.6, 1.6, 2.0],
      ],
      ores: [
        [MIN.topaz, 'pocket', 0.05],
        [MIN.copper, 'vein', 0.4],
        [MIN.coal, 'seam', 0.2],
      ],
    },
    gradeII: {
      name: 'the Ruby Gallery',
      roof: 2.55,
      blobs: [
        [-1.2, -1.4, 3.3],
        [1.3, 0.9, 3.2],
        [0.6, -3.2, 2.4],
        [2.6, 2.6, 2.2],
      ],
      ores: [
        [MIN.ruby, 'pocket', 0.07],
        [MIN.topaz, 'pocket', 0.05],
        [MIN.copper, 'vein', 0.5],
        [MIN.coal, 'seam', 0.12],
      ],
      guard: [0.4, -1.4],
    },
    den: {
      drift: [
        [1.4, -4.0],
        [2.4, -6.8],
        [2.0, -9.2],
      ],
      den: [2.3, -11.3, 3.0],
      lair: {
        name: 'the Old Working',
        leash: 6,
        respawn: 240,
        members: [{ kind: 'wolf', count: 3 }],
        spoils: { copper: 3, coal: 2, topaz: 1 },
        gold: 25,
        den: 'wolves',
      },
    },
    guardII: {
      name: 'the Ruby Gallery guardians',
      leash: 6,
      respawn: 300,
      members: [
        { kind: 'orc', count: 2 },
        { kind: 'wolf', count: 1 },
      ],
      spoils: { ruby: 1, copper: 2 },
      gold: 40,
      den: 'guard',
    },
    // Coal and copper showing in the drift's wall, a few steps from the lift.
    patches: [
      {
        name: 'the Copper Line drift',
        from: 5.4,
        to: 8.6,
        side: -1,
        depth: 1.8,
        ores: [
          [MIN.coal, 'seam', 0.45],
          [MIN.copper, 'vein', 0.3],
        ],
      },
    ],
  },
  {
    name: 'Iron Line',
    mineral: 'Iron',
    color: '#b5643a',
    dir: 1,
    track: 'P SS SSSS SSSSSSS SS R SSS L SSS',
    stopI: 15.6,
    caves: [5.6, 23.4],
    gradeI: {
      name: 'the Iron Face',
      roof: 2.35,
      blobs: [
        [-2.4, -1.2, 3.2],
        [1.4, -1.5, 3.3],
        [3.0, 1.2, 2.2],
        [-1.2, 1.7, 2.0],
      ],
      ores: [
        [MIN.sulfur, 'pocket', 0.08],
        [MIN.iron, 'vein', 0.4],
        [MIN.coal, 'seam', 0.18],
      ],
    },
    gradeII: {
      name: 'the Sapphire Deep',
      roof: 2.55,
      blobs: [
        [-1.3, 1.3, 3.3],
        [1.2, -1.0, 3.3],
        [3.0, 1.8, 2.3],
        [-0.4, -3.4, 2.2],
      ],
      ores: [
        [MIN.sapphire, 'pocket', 0.06],
        [MIN.emerald, 'pocket', 0.05],
        [MIN.iron, 'vein', 0.5],
        [MIN.sulfur, 'pocket', 0.08],
      ],
      guard: [0.3, 0.9],
    },
    den: {
      drift: [
        [1.0, -4.0],
        [1.9, -7.2],
      ],
      den: [1.5, -9.8, 3.2],
      lair: {
        name: "the Raiders' Den",
        leash: 6,
        respawn: 300,
        members: [{ kind: 'orc', count: 3 }],
        spoils: { ore: 3, sulfur: 2 },
        gold: 45,
        den: 'raiders',
      },
    },
    guardII: {
      name: 'the Sapphire Deep guardians',
      leash: 6,
      respawn: 360,
      members: [
        { kind: 'golem', count: 1 },
        { kind: 'orc', count: 2 },
      ],
      spoils: { sapphire: 1, emerald: 1, ore: 2 },
      gold: 60,
      den: 'guard',
    },
  },
  {
    name: 'Silver Line',
    mineral: 'Silver',
    color: '#d6dde6',
    dir: 2,
    track: 'P SS SSSSS SSSSSSS SS R SSSSS SSS',
    stopI: 16.9,
    caves: [5.6, 25.0],
    gradeI: {
      name: 'the Silver Face',
      roof: 2.4,
      blobs: [
        [-2.5, -1.3, 3.1],
        [1.2, -1.6, 3.4],
        [3.2, 1.1, 2.2],
        [-0.8, 1.7, 2.1],
      ],
      ores: [
        [MIN.silver, 'vein', 0.36],
        [MIN.quartz, 'seam', 0.2],
      ],
    },
    gradeII: {
      name: 'the Crystal Halls',
      roof: 2.6,
      blobs: [
        [-1.2, -1.4, 3.4],
        [1.4, 1.1, 3.3],
        [0.2, 3.6, 2.3],
        [2.8, -2.2, 2.2],
      ],
      ores: [
        [MIN.emerald, 'pocket', 0.06],
        [MIN.sapphire, 'pocket', 0.05],
        [MIN.silver, 'vein', 0.48],
        [MIN.quartz, 'seam', 0.2],
      ],
      guard: [0.2, -0.6],
    },
    den: {
      drift: [
        [0.8, -4.1],
        [1.8, -7.0],
      ],
      den: [1.6, -9.5, 3.1],
      lair: {
        name: 'the Lost Shift',
        leash: 6,
        respawn: 300,
        members: [
          { kind: 'minion', count: 3 },
          { kind: 'warrior', count: 1 },
          { kind: 'necromancer', count: 1 },
        ],
        spoils: { silver: 2, quartz: 2 },
        gold: 50,
        den: 'dead',
      },
    },
    guardII: {
      name: 'the Crystal Halls guardians',
      leash: 6,
      respawn: 360,
      members: [
        { kind: 'golem', count: 1 },
        { kind: 'warrior', count: 2 },
        { kind: 'necromancer', count: 1 },
      ],
      spoils: { emerald: 1, sapphire: 1, silver: 2 },
      gold: 70,
      den: 'guard',
    },
  },
  {
    name: 'Gold Line',
    mineral: 'Gold',
    color: '#ffd24a',
    dir: 3,
    track: 'P SS SSSSSS SSSSSSS SS R SSS L SS SSS',
    stopI: 18.1,
    caves: [5.6, 26.6],
    gradeI: {
      name: 'the Gold Face',
      roof: 2.4,
      blobs: [
        [-2.6, -1.3, 3.1],
        [1.1, -1.6, 3.4],
        [3.2, 1.0, 2.3],
        [-0.7, 1.7, 2.0],
      ],
      ores: [
        [MIN.sulfur, 'pocket', 0.06],
        [MIN.gold, 'vein', 0.28],
        [MIN.quartz, 'seam', 0.15],
        [MIN.coal, 'seam', 0.12],
      ],
    },
    gradeII: {
      name: 'the Amethyst Vault',
      roof: 2.7,
      blobs: [
        [-1.4, 1.3, 3.5],
        [1.3, -1.2, 3.4],
        [3.2, 1.6, 2.4],
        [-0.6, -3.6, 2.3],
      ],
      ores: [
        [MIN.amethyst, 'pocket', 0.07],
        [MIN.ruby, 'pocket', 0.03],
        [MIN.gold, 'vein', 0.42],
        [MIN.quartz, 'seam', 0.15],
      ],
      guard: [0.4, 0.4],
    },
    guardII: {
      name: 'the Vault Wardens',
      leash: 6.5,
      respawn: 420,
      members: [
        { kind: 'golem', count: 2 },
        { kind: 'necromancer', count: 1 },
        { kind: 'warrior', count: 2 },
      ],
      spoils: { amethyst: 2, nugget: 2, ruby: 1 },
      gold: 100,
      den: 'guard',
    },
  },
];
