import { type GemLevel } from '../game/content.ts';

/** A flight's phases, as the HUD names them. */
export const PHASE_NAMES = {
  ascent: 'climbing',
  cruise: 'in cruise',
  braking: 'braking burn',
  entry: 'entry — burning in',
  parachute: 'under the parachute',
  descent: 'powered descent',
  touchdown: 'touchdown',
} as const;

/** How a gem looks at each level (its window shows it). */
export const LEVEL_LOOK: Record<GemLevel, string> = {
  1: 'a small, matte stone',
  2: 'the full stone, glowing',
  3: 'too big for its window, alight',
};

/** "Chop" → "Chopping", "Mine" → "Mining", "Dig" → "Digging", "Harvest" → "Harvesting". */
export function gerund(verb: string): string {
  if (verb.endsWith('e')) return `${verb.slice(0, -1)}ing`;
  if (/[^aeiou][aeiou][bdgmnprt]$/i.test(verb)) return `${verb}${verb.at(-1)}ing`;
  return `${verb}ing`;
}

/**
 * The fewest lives a won game has cost at Sigil `sigil` on this machine (null: no win yet); with
 * `lost`, a win just now is counted first. Kept in the browser's storage (it may be off: then none).
 */
export function bestRun(sigil: number, lost?: number): number | null {
  const KEY = 'browserdefense.best';
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
    if (lost !== undefined && (all[sigil] === undefined || lost < all[sigil])) {
      all[sigil] = lost;
      localStorage.setItem(KEY, JSON.stringify(all));
    }
    return all[sigil] ?? null;
  } catch {
    return lost ?? null;
  }
}
