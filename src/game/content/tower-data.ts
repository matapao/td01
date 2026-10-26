/** Tower, gem and device constants, without plan or calculation dependencies. */
import type { WatchDef, TowerStats, GemColor, GemLevel, TopLevel } from '../content-types.ts';

/** The watch gems: a seer's emerald (a lookout) and a scrying amethyst (radar). */
export const WATCH: Record<'lookout' | 'scrying' | 'radar', WatchDef> = {
  radar: { sight: 10, detect: 18, radar: 40, radarEvery: 3, intel: 2 },
  lookout: { sight: 17, detect: 13, radar: 0, radarEvery: 0, intel: 1 },
  scrying: { sight: 8, detect: 10, radar: 32, radarEvery: 4, intel: 2 },
};

/**
 * Gem auras. A sun topaz lights its tower and everything within `sun` m like a brazier; a
 * warheart ruby makes towers within `warheart` m (its own too) attack `haste` faster (warhearts
 * don't stack); a rime sapphire slows the dead within `rime` m by `slow`.
 */
export const AURA = { sun: 7, warheart: 8, haste: 0.12, rime: 6, slow: 0.2 };

const baseStats = (s: Partial<TowerStats>): TowerStats => ({
  range: 0,
  rate: 1,
  damage: 0,
  damageType: 'pierce',
  hitsAir: false,
  hitsGround: true,
  crit: 0,
  shooters: 0,
  splash: 0,
  burn: 0,
  chain: 0,
  slow: 0,
  cluster: 0,
  twin: false,
  soldiers: 0,
  soldierHp: 0,
  soldierDamage: 0,
  soldierRate: 1,
  soldierArmor: 0,
  respawn: 10,
  rally: 0,
  captain: false,
  banner: false,
  pierce: 0,
  goldMul: 1,
  lootMul: 1,
  bonusMagic: 0,
  ...s,
});

/** The archer on top of every tower: what it does before any gem is set in. */
export const ARCHER: TowerStats = baseStats({
  range: 10,
  rate: 1.15,
  damage: 17,
  damageType: 'pierce',
  hitsAir: true,
  crit: 0.05,
  shooters: 1,
});

// ---- Gems -------------------------------------------------------------------------------------

export const GEM_COLORS: Record<GemColor, { name: string; color: string; family: string }> = {
  ruby: { name: 'Ruby', color: '#e8364f', family: 'fire and force' },
  sapphire: { name: 'Sapphire', color: '#3d7dff', family: 'frost and binding' },
  topaz: { name: 'Topaz', color: '#ffc331', family: 'speed, storm and light' },
  amethyst: { name: 'Amethyst', color: '#a65cff', family: 'the arcane' },
  emerald: { name: 'Emerald', color: '#2fd27a', family: 'sight' },
};
export const COLOR_ORDER: GemColor[] = ['ruby', 'sapphire', 'topaz', 'amethyst', 'emerald'];

/**
 * A tower's windows. The lower row holds its gems: one window for each colour — a tower takes one
 * ruby, one sapphire, one topaz, one amethyst and one emerald, each upgraded in place. The upper
 * row is for devices (radar, lights… powered from the grid; to come). For each window: the yaw of
 * its face in the tower's own frame (+z is its front) and the height of the opening's centre (m);
 * `r` is how far out the wall face is.
 */
const U = 2.95;
const L = 1.4;
export const TOWER_WINDOWS = {
  r: 1.333,
  gem: {
    ruby: { yaw: Math.PI / 6, y: L },
    sapphire: { yaw: -Math.PI / 6, y: L },
    topaz: { yaw: Math.PI / 2, y: L },
    amethyst: { yaw: -Math.PI / 2, y: L },
    emerald: { yaw: (Math.PI * 5) / 6, y: L },
  } as Record<GemColor, { yaw: number; y: number }>,
  upper: [
    { yaw: Math.PI / 6, y: U },
    { yaw: -Math.PI / 6, y: U },
    { yaw: (Math.PI * 5) / 6, y: U },
    { yaw: (-Math.PI * 5) / 6, y: U },
  ],
};
/** Gem windows: one per colour. */
export const SOCKETS = COLOR_ORDER.length;

export const MAX_GEM_LEVEL = 3;
export const GEM_LEVELS: Record<GemLevel, { name: string; k: number }> = {
  1: { name: 'Rough', k: 0.7 },
  2: { name: 'Polished', k: 1 },
  3: { name: 'Radiant', k: 1.4 },
};

/**
 * The archer's top, one step at a time: the open platform he starts on, a roofed turret he shoots
 * from the windows of, then a gallery right round under a wide roof that he walks to face his mark.
 * Covered, nothing that flies can get at him (or at a hero up there with him); the gallery sees further.
 */
export const TOWER_TOPS: Record<
  TopLevel,
  { name: string; model: string; covered: boolean; rangeAdd: number; blurb: string }
> = {
  1: {
    name: 'Open Platform',
    model: 'building_tower_base_blue',
    covered: false,
    rangeAdd: 0,
    blurb:
      'Open to the sky: a wraith that passes dives at the archer — he ducks and stops shooting while it is near — and at any hero up there.',
  },
  2: {
    name: 'Roofed Turret',
    model: 'building_tower_A_blue',
    covered: true,
    rangeAdd: 0,
    blurb:
      'A turret room under a tiled roof: the archer shoots from its windows, out of reach of anything that flies.',
  },
  3: {
    name: 'Gallery Roof',
    model: 'building_tower_B_blue',
    covered: true,
    rangeAdd: 1.5,
    blurb:
      'A gallery right round the top under a wide roof: the archer walks round to his mark under cover, and sees 1.5 m further.',
  },
};
export const MAX_TOP = 3;

/**
 * Tower devices sit in the four upper windows and run on power: a tower on the grid (a live pole
 * within reach) draws their watts from the generators; a solar roof feeds its own tower by day. When
 * the grid is asked for more than it makes, the devices go dark first.
 * - searchlight: by night the tower is lit, and the dead in its beam (within `searchCone` rad of its
 *   aim) take `searchBonus` more damage;
 * - radar: a radar watch (see WATCH.radar) — everything on the roads near it shows, burrowers too;
 * - targeter: the nearly dead first (below `targeterLow` health), and `targeterCrit` more crits;
 * - relay: towers with live relays within `relayReach` of each other share targets: `relayRate` faster;
 * - solar: `solarWatts` by day for its own tower.
 */
export const DEVICE = {
  slots: 4,
  hydroWatts: 14,
  lampWatts: 1,
  searchBonus: 0.15,
  searchCone: 0.45,
  targeterCrit: 0.1,
  targeterLow: 0.35,
  relayRate: 0.1,
  relayReach: 15,
  solarWatts: 4,
};
/**
 * Flyers dive at open tops: one passing within `reach` (m, across the ground — towers stand beside the
 * road) makes the archer duck, and stings a hero up there (hp/s). He gets his shots in until it dives.
 */
export const DIVE = { reach: 6, heroDps: 9 };
