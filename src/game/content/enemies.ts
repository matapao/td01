/** Enemy catalogue, wave affixes and road combat tuning. */
import type { EnemyKind, EnemyDef, WaveAffix } from '../content-types.ts';

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  minion: {
    kind: 'minion',
    name: 'Undead Soldier',
    blurb: 'An armed, human-sized soldier advancing on the gate.',
    hp: 60,
    speed: 1.29,
    armor: 0,
    armorClass: 'bone',
    gold: 3,
    leak: 1,
    damage: 6,
    attackRate: 1.0,
    radius: 0.225,
    scale: 1,
    traits: ['Swarm'],
  },
  runner: {
    kind: 'runner',
    name: 'Undead Skirmisher',
    blurb: 'Fast. Dashes when first struck. Takes the least-defended route.',
    hp: 45,
    speed: 2.13,
    armor: 0,
    armorClass: 'bone',
    gold: 4,
    leak: 1,
    damage: 5,
    attackRate: 1.25,
    radius: 0.225,
    scale: 1,
    smart: true,
    traits: ['Fast', 'Dashes', 'Route-seeker'],
  },
  warrior: {
    kind: 'warrior',
    name: 'Skeleton Warrior',
    blurb: 'Slow, shielded and plated. Hit it with impact or lightning.',
    hp: 220,
    speed: 0.97,
    armor: 0.3,
    armorClass: 'plate',
    gold: 9,
    leak: 1,
    damage: 14,
    attackRate: 0.85,
    radius: 0.275,
    scale: 1.1,
    traits: ['Armoured'],
  },
  necromancer: {
    kind: 'necromancer',
    name: 'Necromancer',
    blurb: 'Raises fallen skeletons and shields allies. Warded against magic.',
    hp: 150,
    speed: 1.09,
    armor: 0,
    armorClass: 'warded',
    gold: 12,
    leak: 1,
    damage: 8,
    attackRate: 0.8,
    radius: 0.25,
    scale: 1.05,
    traits: ['Raises the dead', 'Shields allies'],
  },
  wraith: {
    kind: 'wraith',
    name: 'Wraith',
    blurb: 'Flies fast, over the wall itself; weapons barely touch it. Burn or unravel it.',
    hp: 260,
    speed: 1.85,
    armor: 0,
    armorClass: 'spectral',
    gold: 9,
    leak: 1,
    damage: 0,
    attackRate: 1,
    flying: true,
    radius: 0.25,
    scale: 1,
    traits: ['Flying', 'Ignores footmen'],
  },
  crusher: {
    kind: 'crusher',
    name: 'Siege Breaker',
    blurb: 'Brings a wheeled battering ram to smash nearby towers and gate doors.',
    hp: 320,
    speed: 0.84,
    armor: 0.3,
    armorClass: 'plate',
    gold: 12,
    leak: 2,
    damage: 26,
    attackRate: 0.7,
    radius: 0.325,
    scale: 1.3,
    siege: true,
    traits: ['Siege', 'Armoured'],
  },
  digger: {
    kind: 'digger',
    name: 'Grave Digger',
    blurb:
      "Burrows under your defences and comes up past the wall, inside — unless a tower with a Seer's Emerald (or a Scrying Amethyst close by) forces it up first.",
    hp: 95,
    speed: 1.55,
    armor: 0.1,
    armorClass: 'bone',
    gold: 6,
    leak: 1,
    damage: 8,
    attackRate: 1.1,
    radius: 0.225,
    scale: 1,
    burrow: true,
    smart: true,
    traits: ['Burrows', 'Route-seeker'],
  },
  lich: {
    kind: 'lich',
    name: 'The Lich',
    blurb: 'Summons skeletons from the ground. Warded.',
    hp: 1400,
    speed: 0.78,
    armor: 0.1,
    armorClass: 'warded',
    gold: 100,
    leak: 3,
    damage: 30,
    attackRate: 0.7,
    radius: 0.45,
    scale: 1.8,
    boss: true,
    traits: ['Boss', 'Summons'],
  },
  colossus: {
    kind: 'colossus',
    name: 'Bone Colossus',
    blurb: 'Stomps blockers. Enrages when wounded. Shrugs off crowd control.',
    hp: 4200,
    speed: 0.65,
    armor: 0.3,
    armorClass: 'colossal',
    gold: 250,
    leak: 3,
    damage: 60,
    attackRate: 0.6,
    radius: 0.65,
    scale: 2.6,
    boss: true,
    traits: ['Boss', 'Stomps (hits buildings)', 'Enrages'],
  },
  // Down the mine (lairs only: they stand at a hero's measure — see game/mines.ts).
  wolf: {
    kind: 'wolf',
    name: 'Cave Wolf',
    blurb: 'Hunts in packs through the old workings. Quick, but thin-skinned.',
    hp: 85,
    speed: 2.1,
    armor: 0,
    armorClass: 'flesh',
    gold: 4,
    leak: 1,
    damage: 8,
    attackRate: 1.3,
    radius: 0.25,
    scale: 1,
    traits: ['Pack', 'Fast'],
  },
  orc: {
    kind: 'orc',
    name: 'Tunnel Raider',
    blurb:
      'Orcs who camp in worked-out tunnels and rob what the miners leave. Hits hard; no armour to speak of.',
    hp: 175,
    speed: 1.15,
    armor: 0.12,
    armorClass: 'flesh',
    gold: 9,
    leak: 1,
    damage: 13,
    attackRate: 0.9,
    radius: 0.27,
    scale: 1.05,
    traits: ['Brawler'],
  },
  golem: {
    kind: 'golem',
    name: 'Stone Golem',
    blurb:
      'Living rock that guards the richest seams. Slow, heavy and plated: hit it with impact or lightning.',
    hp: 560,
    speed: 0.8,
    armor: 0.35,
    armorClass: 'plate',
    gold: 20,
    leak: 2,
    damage: 24,
    attackRate: 0.6,
    radius: 0.42,
    scale: 1.5,
    traits: ['Guardian', 'Armoured'],
  },
};

/**
 * Bolstering: when one of the dead falls, those within `radius` m of it grow `gain` stronger (health
 * and blows) — at most `max` times each (packed at the shut gate it would otherwise snowball).
 */
export const BOLSTER = { radius: 6, gain: 0.12, max: 3 };

export const AFFIXES_WAVE: Record<WaveAffix, { name: string; blurb: string; color: string }> = {
  swift: { name: 'Swift', blurb: 'Enemies move 20% faster.', color: '#ffe066' },
  bolstering: {
    name: 'Bolstering',
    blurb: `When an enemy dies, nearby allies grow ${Math.round(BOLSTER.gain * 100)}% stronger (up to ${BOLSTER.max} times).`,
    color: '#ff8a5a',
  },
  shielded: {
    name: 'Bone-Warded',
    blurb: 'Enemies arrive with a bone shield (25% of their health).',
    color: '#c9a8ff',
  },
  frenzied: { name: 'Frenzied', blurb: 'Badly hurt enemies run 60% faster.', color: '#ff5a4a' },
  regenerating: {
    name: 'Regenerating',
    blurb: 'Enemies heal when left unharmed for a moment.',
    color: '#7dff6a',
  },
};

/**
 * Threat (WoW-style aggro). The dead ignore heroes and towers on their way to the keep; a walker
 * turns on a hero once that hero has dealt `aggro`% of its health (decaying `decay`%/s), or when
 * taunted, and follows them up to `leash` m from where it is.
 */
export const THREAT = { aggro: 35, decay: 9, leash: 6, taunt: 4, tauntRadius: 6 };

/**
 * The dead on the roads are far beyond any hero. One blow from any of them kills a hero outright, and
 * a hero's weapons and spells barely scratch them (they still feel it: hurt one and it turns on you).
 * Walk past and they let you be. The towers deal with them; heroes fight the camps out in the vale and
 * the creatures in the mines' lairs, which stand at a hero's measure.
 */
export const LANE_DEAD = {
  /** What's left of a hero's damage on them. */
  heroDamage: 0.03,
  why: 'One of the dead on the road: far beyond any hero. Leave it to the towers.',
};
