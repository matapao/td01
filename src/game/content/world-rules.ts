/** Economy, difficulty and day/night clock rules. */

// ---- Economy ----------------------------------------------------------------------------------

export const ECONOMY = {
  startGold: 40,
  startLives: 40,
  /** The first wave starts this long after the first tower is finished… */
  firstWaveAfterTower: 35,
  /** …or at the latest this many seconds into the game. */
  firstWaveLatest: 140,
  waveBonusBase: 15,
  waveBonusPerWave: 4,
  maxEarlyBonus: 50,
  /** Loose items on the ground fade after this long. */
  dropLifetime: 60,
  /** Gold coins are vacuumed from this far. */
  goldPickup: 1.4,
};

/** Sigil (keyed difficulty) scaling — Normal is sigil 0. */
export const SIGIL = {
  hpPerLevel: 1.2,
  damagePerLevel: 1.1,
  goldPerLevel: 1.05,
  ilvlPerLevel: 2,
};

// ---- Day and night ------------------------------------------------------------------------------

/** One day in the vale: about eight minutes of play, starting in the morning. */
export const DAY = { length: 480, start: 0.3 };

/** Time of day 0–1 (0.25 sunrise, 0.5 noon, 0.75 sunset, 0 midnight) at a moment of game time. */
export function timeOfDay(time: number): number {
  return (((time / DAY.length + DAY.start) % 1) + 1) % 1;
}

/**
 * The time of day in a game (0–1): its clock, as dev mode may have set it (`dayShift`, seconds
 * added to the game time) or stopped it (`dayHold`).
 */
export function todNow(s: { time: number; dayShift?: number; dayHold?: number | null }): number {
  return s.dayHold ?? timeOfDay(s.time + (s.dayShift ?? 0));
}

/** How much daylight there is (0 at night, 1 by day), with soft dawns and dusks. */
export function daylight(t: number): number {
  const s = Math.sin((t - 0.25) * Math.PI * 2);
  return Math.min(1, Math.max(0, (s + 0.12) / 0.32));
}

export function dayPart(t: number): 'Dawn' | 'Day' | 'Dusk' | 'Night' {
  if (t >= 0.2 && t < 0.3) return 'Dawn';
  if (t >= 0.3 && t < 0.7) return 'Day';
  if (t >= 0.7 && t < 0.8) return 'Dusk';
  return 'Night';
}
