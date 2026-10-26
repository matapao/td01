/** Hero classes, abilities and scouting/crewing constants. */
import type { AbilityId, AbilityDef, HeroClass, ClassDef } from '../content-types.ts';

/** One bag slot holds this many of a kind. */
export const BAG_STACK = 20;

export const HERO = {
  name: 'The Warlord',
  hp: 420,
  hpPerLevel: 60,
  damage: 24,
  damagePerLevel: 6,
  rate: 0.9,
  range: 0.75,
  speed: 2.6,
  armor: 0.3,
  regen: 3,
  regenPerLevel: 1,
  respawn: 12,
  aggroRange: 3,
  sight: 10,
  /** Bag slots; each holds one stack of a kind (up to BAG_STACK) or one enchanted part. */
  bag: 16,
  /** Reach for gathering / delivering / working (m, from the target's edge). */
  reach: 0.55,
  xpLevels: [0, 100, 260, 480, 760],
};

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  // Tank
  slam: {
    id: 'slam',
    name: 'Shield Bash',
    cooldown: 8,
    targeted: true,
    range: 2.2,
    damage: 45,
    damagePerLevel: 12,
    stun: 1.6,
    blurb: 'Bash an enemy with your shield: damage, a stun — and it turns on you.',
  },
  cry: {
    id: 'cry',
    name: 'Battle Cry',
    cooldown: 18,
    targeted: false,
    radius: 6,
    blurb:
      "Taunt: camp creatures within 6 m turn on you. From the wall-walk it holds the dead below the wall, unable to reach you — under the towers' fire.",
  },
  wall: {
    id: 'wall',
    name: 'Shield Wall',
    cooldown: 30,
    targeted: false,
    duration: 6,
    blurb: 'Raise your shield: take 60% less damage for 6 s.',
  },
  // Support
  mend: {
    id: 'mend',
    name: 'Mend',
    cooldown: 14,
    targeted: false,
    radius: 7,
    heal: 0.35,
    blurb: 'Heal heroes and footmen within 7 m (35% of their health) and patch up the buildings there.',
  },
  rally: {
    id: 'rally',
    name: 'Rally',
    cooldown: 24,
    targeted: false,
    radius: 10,
    haste: 0.4,
    duration: 8,
    blurb: 'Towers within 10 m attack 40% faster for 8 s.',
  },
  repulse: {
    id: 'repulse',
    name: 'Repulse',
    cooldown: 12,
    targeted: false,
    radius: 4.5,
    damage: 30,
    damagePerLevel: 10,
    knock: 4.5,
    slow: 0.4,
    slowTime: 2,
    blurb: 'War-stomp: knocks nearby foes back and slows them.',
  },
  drone: {
    id: 'drone',
    name: 'Scout Drone',
    cooldown: 25,
    targeted: false,
    blurb:
      'Launch your drone and fly it (WASD) up to 45 m away: it uncovers the land and shows the dead it sees. You stand still with the controls. Wraiths and necromancers can shoot it down. 4 again (or Esc) calls it home.',
  },
  // Magic
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    cooldown: 5,
    targeted: true,
    range: 13,
    damage: 95,
    damagePerLevel: 25,
    blurb: 'Hurl fire at an enemy: heavy damage, and it burns.',
  },
  nova: {
    id: 'nova',
    name: 'Frost Nova',
    cooldown: 14,
    targeted: false,
    radius: 5,
    damage: 40,
    damagePerLevel: 10,
    slow: 0.6,
    slowTime: 3,
    blurb: 'A ring of frost around you: damages and slows foes within 5 m.',
  },
  meteor: {
    id: 'meteor',
    name: 'Meteor',
    cooldown: 26,
    targeted: true,
    range: 15,
    radius: 3,
    damage: 170,
    damagePerLevel: 40,
    blurb: 'Call a burning rock down on an enemy: big damage to everything within 3 m, and the ground burns.',
  },
};

export const CLASSES: Record<HeroClass, ClassDef> = {
  tank: {
    id: 'tank',
    role: 'Tank',
    name: 'Knight',
    hp: 600,
    armor: 0.5,
    reach: 0.75,
    ranged: false,
    damageMul: 0.9,
    abilities: ['slam', 'cry', 'wall'],
    blurb:
      'Sword and shield. Takes the hits in the camps and down the mines. The dead on the roads are beyond any hero, but from the wall-walk his Battle Cry holds them below it and his shield covers the tower he crews.',
  },
  support: {
    id: 'support',
    role: 'Support',
    name: 'Warchief',
    hp: 460,
    armor: 0.3,
    reach: 0.75,
    ranged: false,
    damageMul: 1,
    abilities: ['mend', 'rally', 'repulse', 'drone'],
    blurb:
      'Keeps everyone standing: heals heroes and footmen, patches buildings, drives the towers faster, knocks foes back — and scouts ahead with a drone.',
  },
  magic: {
    id: 'magic',
    role: 'Magic',
    name: 'Mage',
    hp: 320,
    armor: 0.1,
    reach: 6,
    ranged: true,
    damageMul: 0.85,
    abilities: ['fireball', 'nova', 'meteor'],
    blurb:
      'Fire and frost from range — the most damage, on one or on many, in the camps and down the mines. Fragile: keep your distance.',
  },
};
export const CLASS_ORDER: HeroClass[] = ['tank', 'support', 'magic'];

/**
 * The Warchief's scout drone: how far from its pilot it can go, how long its battery lasts, how
 * fast it flies, its health and how far it sees. Wraiths (close) and casters (from range) shoot at it.
 */
export const DRONE = {
  range: 45,
  battery: 40,
  speed: 8,
  hp: 120,
  sight: 14,
  altitude: 3,
  downCooldown: 60,
  wraithReach: 2.6,
  wraithDps: 14,
  casterReach: 9,
  casterDamage: 18,
  casterRate: 1.6,
};
/**
 * Over the wall: heroes never set foot beyond it — the field out there is the towers' and the
 * dead's. Everything about a tower is done from the wall-walk: its plan laid out on the field below,
 * its parts swung over, its hammer beats called down, its gems, devices and roofs set, its mending;
 * the spoils of the dead are hauled up over the battlements too. And the walk is a hero's battle
 * post: up there beside a tower they crew it — the archers fight harder for them (faster and
 * further), each class adding its own touch: the Knight shields them (the tower takes less damage),
 * the Warchief drives them on (faster still), the Mage enchants their bolts (more damage). Out of
 * reach of the dead below, the hero sees far over the field.
 */
export const OVER_WALL = {
  /** How far out from the wall (m) a tower can stand: within it, it is raised and worked from the walk. */
  reach: 48,
  /** A hero on the walk crews the nearest tower within this (m). */
  crew: 18,
  /** Every crewing hero: the crew's attack speed and range. */
  rate: 0.25,
  range: 1.5,
  /** Knight: the tower takes this much less damage. */
  shield: 0.5,
  /** Warchief: on top of `rate`. */
  drive: 0.25,
  /** Mage: more damage per shot. */
  enchant: 0.35,
  /** Skills that reach round the hero (Battle Cry) reach this much further down from the walk. */
  skillReach: 4,
  /** From the walk a hero sees over the field this far (m). */
  sight: 40,
  /** Spoils on the field within this (m) of a hero on the walk are hauled up to them by themselves (the rest: F, or click them). */
  haul: 16,
  /** A watch gem's tower with a hero crewing it sees (and spots burrowers) this much further. */
  lookout: 1.5,
};

/** A hero's class (saves from before classes default to the tank). */
export const classOf = (h: { cls?: HeroClass }): ClassDef => CLASSES[h.cls ?? 'tank'];

export const ABILITY_ORDER = Object.keys(ABILITIES) as AbilityId[];
