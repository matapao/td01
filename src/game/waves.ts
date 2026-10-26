import { ENEMIES, type EnemyKind, type Loot, type WaveAffix } from './content.ts';

export interface SpawnGroup {
  kind: EnemyKind;
  count: number;
  /** Crypt index (0 = North, 1 = South). The route is chosen when each enemy spawns. */
  crypt: number;
  /** Seconds between spawns in this group. */
  every: number;
  /** Seconds after the wave starts. */
  delay: number;
}

export interface WaveDef {
  title: string;
  groups: SpawnGroup[];
  /** Seconds from the end of spawning to the next wave (varies on purpose). */
  gap: number;
  /** Reward when every enemy of this wave is dead — plans arrive in teaching order. */
  reward: Loot;
  /** HP multiplier for this wave. */
  hp: number;
  affixes: WaveAffix[];
}

const g = (kind: EnemyKind, count: number, crypt: number, every: number, delay = 0): SpawnGroup => ({
  kind,
  count,
  crypt,
  every,
  delay,
});

/**
 * The first patrols teach one threat at a time. All raiders are human-sized or larger.
 * A clear field earns a full repair break before the next attack.
 */
export const WAVES: WaveDef[] = [
  {
    title: 'The dead stir',
    groups: [g('minion', 4, 0, 2.6)],
    gap: 62,
    hp: 0.9,
    affixes: [],
    reward: { scrolls: ['swift'], parts: { planks: 2 } },
  },
  {
    title: 'Runners',
    groups: [g('minion', 6, 0, 1.8), g('runner', 2, 0, 3, 9)],
    gap: 66,
    hp: 1.0,
    affixes: [],
    reward: { scrolls: ['stonecutter', 'forge', 'seer'], gold: 20 },
  },
  {
    title: 'Shields',
    groups: [g('minion', 6, 0, 1.5), g('warrior', 2, 0, 5, 6)],
    gap: 72,
    hp: 1.05,
    affixes: [],
    reward: { scrolls: ['anvil', 'ember'], parts: { ore: 4 } },
  },
  {
    title: 'The South Crypt opens',
    groups: [g('minion', 8, 1, 1.4), g('runner', 3, 1, 2, 8), g('warrior', 2, 0, 4, 4)],
    gap: 62,
    hp: 1.2,
    affixes: [],
    reward: { scrolls: ['far', 'frost'], gold: 30 },
  },
  {
    title: 'Wings and hammers',
    groups: [
      g('wraith', 2, 0, 2.2),
      g('minion', 8, 1, 1.3),
      g('crusher', 1, 1, 1, 9),
      g('warrior', 2, 1, 4, 8),
    ],
    gap: 64,
    hp: 1.3,
    affixes: ['swift'],
    reward: { scrolls: ['fury', 'blast', 'scry'], gold: 30 },
  },
  {
    title: 'The Lich',
    groups: [
      g('lich', 1, 0, 1, 2),
      g('minion', 6, 0, 1.2),
      g('minion', 6, 1, 1.2, 4),
      g('necromancer', 1, 1, 1, 10),
      g('digger', 2, 0, 4, 8),
    ],
    gap: 80,
    hp: 1.4,
    affixes: [],
    reward: { scrolls: ['twin', 'storm'], gold: 60 },
  },
  {
    title: 'Pressure',
    groups: [
      g('runner', 5, 0, 1),
      g('runner', 5, 1, 1, 2),
      g('minion', 6, 0, 1, 6),
      g('warrior', 2, 1, 3, 8),
      g('crusher', 1, 0, 1, 10),
    ],
    gap: 42,
    hp: 1.4,
    affixes: ['bolstering'],
    reward: { scrolls: ['arcane', 'rime'], gold: 40 },
  },
  {
    title: 'Necromancy',
    groups: [
      g('necromancer', 2, 0, 6, 4),
      g('warrior', 4, 0, 2.4),
      g('minion', 6, 1, 1, 6),
      g('digger', 1, 1, 3, 5),
    ],
    gap: 66,
    hp: 1.45,
    affixes: ['shielded'],
    reward: { scrolls: ['warheart', 'sun'], gold: 50 },
  },
  {
    title: 'The marching host',
    groups: [
      g('minion', 14, 0, 0.55),
      g('minion', 10, 1, 0.6, 3),
      g('runner', 6, 1, 0.8, 8),
      g('wraith', 4, 0, 0.5, 10),
      g('digger', 1, 0, 2, 6),
    ],
    gap: 52,
    hp: 1.5,
    affixes: ['frenzied'],
    reward: { gold: 60 },
  },
  {
    title: 'Iron and bone',
    groups: [
      g('warrior', 6, 0, 1.8),
      g('warrior', 5, 1, 2, 4),
      g('necromancer', 2, 1, 5, 6),
      g('crusher', 2, 1, 4, 8),
    ],
    gap: 70,
    hp: 1.6,
    affixes: ['regenerating'],
    reward: { gold: 80, parts: { rune: 1 } },
  },
  {
    title: 'All the dead',
    groups: [
      g('lich', 1, 1, 1, 0),
      g('minion', 12, 0, 0.6),
      g('runner', 8, 1, 0.7, 4),
      g('warrior', 5, 0, 1.6, 8),
      g('necromancer', 2, 0, 6, 10),
      g('wraith', 5, 1, 0.5, 6),
      g('crusher', 2, 0, 5, 12),
      g('digger', 1, 1, 2, 9),
    ],
    gap: 90,
    hp: 1.7,
    affixes: ['bolstering', 'swift'],
    reward: { gold: 100 },
  },
  {
    title: 'The Bone Colossus',
    groups: [
      g('colossus', 1, 1, 1, 3),
      g('warrior', 5, 0, 2, 0),
      g('minion', 12, 1, 0.8, 6),
      g('wraith', 5, 0, 0.5, 10),
      g('necromancer', 2, 1, 6, 12),
      g('crusher', 2, 0, 4, 8),
      g('digger', 1, 1, 3, 16),
    ],
    gap: 0,
    hp: 1.8,
    affixes: ['frenzied'],
    reward: {},
  },
];

export function waveDuration(w: WaveDef): number {
  let end = 0;
  for (const gr of w.groups) end = Math.max(end, gr.delay + (gr.count - 1) * gr.every);
  return end;
}

export function waveCrypts(w: WaveDef): number[] {
  return [...new Set(w.groups.map((gr) => gr.crypt))].sort();
}

export interface WaveIntel {
  index: number;
  title: string;
  kinds: { kind: EnemyKind; traits: string[]; count?: number }[];
  affixes: WaveAffix[];
  /** Revealed by surveillance only. */
  crypts?: number[];
  duration?: number;
  boss: boolean;
}

/**
 * What you know about a wave before it comes. Base: features only (kinds, traits, affixes).
 * A seer's emerald reveals which crypts it comes from; a scrying amethyst's radar adds counts and how long it lasts.
 */
export function waveIntel(index: number, intel: number): WaveIntel | null {
  const w = WAVES[index];
  if (!w) return null;
  const totals = new Map<EnemyKind, number>();
  for (const gr of w.groups) totals.set(gr.kind, (totals.get(gr.kind) ?? 0) + gr.count);
  // Each kind comes from totals, so the count lookup below is always present.
  const kinds = [...totals.keys()].map((kind) => ({
    kind,
    traits: ENEMIES[kind].traits,
    ...(intel >= 2 ? { count: totals.get(kind)! } : {}),
  }));
  return {
    index,
    title: w.title,
    kinds,
    affixes: w.affixes,
    ...(intel >= 1 ? { crypts: waveCrypts(w) } : {}),
    ...(intel >= 2 ? { duration: Math.ceil(waveDuration(w)) } : {}),
    boss: kinds.some((k) => ENEMIES[k.kind].boss),
  };
}
