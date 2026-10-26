import { type EnemyKind } from '../../game/content.ts';

export interface EnemyAnims {
  walk: string;
  walkRef: number;
  attack: [string, ...string[]];
  idle: string;
  cast?: string;
  death: string;
  /** In a camp: how it gets up when it comes (the dead claw up off the floor). */
  rise?: string;
}

/**
 * How each of the dead moves (Character Animations 1.1; the Skeleton Golem on Rig_Large). `walkRef`:
 * the speed (m/s) at which its walk plays at 1× — the cadence the old cast walked at.
 */
export const ENEMY_ANIMS: Record<EnemyKind, EnemyAnims> = {
  minion: {
    walk: 'Skeletons_Walking',
    walkRef: 1.3,
    attack: ['Melee_1H_Attack_Chop', 'Melee_1H_Attack_Slice_Horizontal'],
    idle: 'Skeletons_Idle',
    death: 'Skeletons_Death',
  },
  runner: {
    walk: 'Running_B',
    walkRef: 3.6,
    attack: ['Melee_Dualwield_Attack_Stab', 'Melee_1H_Attack_Stab'],
    idle: 'Skeletons_Idle',
    death: 'Skeletons_Death',
  },
  warrior: {
    walk: 'Walking_B',
    walkRef: 1.2,
    attack: ['Melee_1H_Attack_Chop', 'Melee_Block_Attack'],
    idle: 'Melee_Blocking',
    death: 'Skeletons_Death',
  },
  necromancer: {
    walk: 'Walking_C',
    walkRef: 1.2,
    attack: ['Melee_1H_Attack_Stab'],
    idle: 'Skeletons_Idle',
    cast: 'Ranged_Magic_Summon',
    death: 'Skeletons_Death',
  },
  wraith: { walk: 'Idle_B', walkRef: 99, attack: ['Ranged_Magic_Shoot'], idle: 'Idle_B', death: 'Death_A' },
  crusher: {
    walk: 'Walking_A',
    walkRef: 1.1,
    attack: ['Melee_2H_Attack', 'Melee_1H_Slash'],
    idle: 'Idle_A',
    death: 'Death_A',
  },
  digger: {
    walk: 'Running_B',
    walkRef: 3.7,
    attack: ['Melee_1H_Attack_Stab'],
    idle: 'Skeletons_Idle',
    death: 'Skeletons_Death',
  },
  lich: {
    walk: 'Walking_C',
    walkRef: 1.4,
    attack: ['Melee_2H_Attack_Stab'],
    idle: 'Skeletons_Idle',
    cast: 'Ranged_Magic_Summon',
    death: 'Skeletons_Death',
  },
  colossus: {
    walk: 'Walking_A',
    walkRef: 1.9,
    attack: ['Melee_2H_Slam', 'Melee_2H_Attack'],
    idle: 'Idle_B',
    death: 'Death_A',
  },
  // The mine's creatures (they get up off the floor of their den when they come).
  wolf: {
    walk: 'Running_A',
    walkRef: 3.4,
    attack: ['Melee_Unarmed_Attack_Punch_A', 'Melee_Unarmed_Attack_Kick'],
    idle: 'Idle_B',
    death: 'Death_A',
    rise: 'Spawn_Ground',
  },
  orc: {
    walk: 'Walking_B',
    walkRef: 1.3,
    attack: ['Melee_1H_Attack_Chop', 'Melee_1H_Attack_Slice_Diagonal'],
    idle: 'Melee_Unarmed_Idle',
    death: 'Death_B',
    rise: 'Spawn_Ground',
  },
  golem: {
    walk: 'Walking_A',
    walkRef: 1.0,
    attack: ['Melee_2H_Slam', 'Melee_Unarmed_Punch'],
    idle: 'Idle_A',
    death: 'Death_A',
    rise: 'Flexing',
  },
};
