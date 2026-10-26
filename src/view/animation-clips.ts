import * as THREE from 'three';
import { type Assets, type Rig } from './assets.ts';

// ---- Clips ---------------------------------------------------------------------------------------

/**
 * The KayKit 1.0 clip names the game played → their names in Character Animations 1.1 (Rig_Medium).
 * Asking for an old name still plays the new clip.
 */
export const CLIP_MAP: Readonly<Record<string, string>> = {
  Idle: 'Idle_A',
  Idle_Combat: 'Skeletons_Idle',
  Unarmed_Idle: 'Melee_Unarmed_Idle',
  '1H_Melee_Attack_Chop': 'Melee_1H_Attack_Chop',
  '1H_Melee_Attack_Jump_Chop': 'Melee_1H_Attack_Jump_Chop',
  '1H_Melee_Attack_Slice_Diagonal': 'Melee_1H_Attack_Slice_Diagonal',
  '1H_Melee_Attack_Slice_Horizontal': 'Melee_1H_Attack_Slice_Horizontal',
  '1H_Melee_Attack_Stab': 'Melee_1H_Attack_Stab',
  '2H_Melee_Attack_Chop': 'Melee_2H_Attack_Chop',
  '2H_Melee_Attack_Slice': 'Melee_2H_Attack_Slice',
  '2H_Melee_Attack_Spin': 'Melee_2H_Attack_Spin',
  '2H_Melee_Attack_Spinning': 'Melee_2H_Attack_Spinning',
  '2H_Melee_Attack_Stab': 'Melee_2H_Attack_Stab',
  '2H_Melee_Idle': 'Melee_2H_Idle',
  Dualwield_Melee_Attack_Chop: 'Melee_Dualwield_Attack_Chop',
  Dualwield_Melee_Attack_Slice: 'Melee_Dualwield_Attack_Slice',
  Unarmed_Melee_Attack_Kick: 'Melee_Unarmed_Attack_Kick',
  Unarmed_Melee_Attack_Punch_A: 'Melee_Unarmed_Attack_Punch_A',
  Block: 'Melee_Block',
  Block_Attack: 'Melee_Block_Attack',
  Block_Hit: 'Melee_Block_Hit',
  Blocking: 'Melee_Blocking',
  '1H_Ranged_Aiming': 'Ranged_1H_Aiming',
  '1H_Ranged_Reload': 'Ranged_1H_Reload',
  '1H_Ranged_Shoot': 'Ranged_1H_Shoot',
  '2H_Ranged_Aiming': 'Ranged_2H_Aiming',
  '2H_Ranged_Reload': 'Ranged_2H_Reload',
  '2H_Ranged_Shoot': 'Ranged_2H_Shoot',
  '2H_Ranged_Shooting': 'Ranged_2H_Shooting',
  Spellcast_Shoot: 'Ranged_Magic_Shoot',
  Spellcast_Raise: 'Ranged_Magic_Raise',
  Spellcast_Summon: 'Ranged_Magic_Summon',
  Spellcast_Long: 'Ranged_Magic_Spellcasting_Long',
  Spellcasting: 'Ranged_Magic_Spellcasting',
  Cheer: 'Cheering',
  Taunt: 'Skeletons_Taunt',
  Running_C: 'Running_B',
  Walking_D_Skeletons: 'Skeletons_Walking',
  Death_C_Skeletons: 'Skeletons_Death',
  Death_C_Skeletons_Resurrect: 'Skeletons_Death_Resurrect',
  Death_C_Pose: 'Skeletons_Death_Pose',
  Spawn_Ground_Skeletons: 'Skeletons_Spawn_Ground',
};

/** What a Rig_Large body (the Skeleton Golem) plays for a Rig_Medium clip its own library lacks. */
export const LARGE_CLIPS: Readonly<Record<string, string>> = {
  Walking_B: 'Walking_A',
  Walking_C: 'Walking_A',
  Skeletons_Walking: 'Walking_A',
  Walking_Backwards: 'Walking_A',
  Running_B: 'Running_A',
  Skeletons_Idle: 'Idle_B',
  Melee_1H_Attack_Chop: 'Melee_1H_Slash',
  Melee_1H_Attack_Slice_Diagonal: 'Melee_1H_Slash',
  Melee_1H_Attack_Slice_Horizontal: 'Melee_1H_Slash',
  Melee_1H_Attack_Stab: 'Melee_1H_Stab',
  Melee_1H_Attack_Jump_Chop: 'Melee_2H_Slam',
  Melee_2H_Attack_Chop: 'Melee_2H_Attack',
  Melee_2H_Attack_Slice: 'Melee_2H_Attack',
  Melee_2H_Attack_Stab: 'Melee_1H_Stab',
  Melee_Dualwield_Attack_Chop: 'Melee_Dualwield_Slash',
  Melee_Dualwield_Attack_Slice: 'Melee_Dualwield_SlashCombo',
  Melee_Unarmed_Attack_Punch_A: 'Melee_Unarmed_Punch',
  Melee_Unarmed_Attack_Kick: 'Melee_Unarmed_Kick',
  Skeletons_Death: 'Death_A',
  Death_B: 'Death_A',
  Hit_B: 'Hit_A',
  Skeletons_Taunt: 'Flexing',
  Skeletons_Taunt_Longer: 'Flexing',
  Cheering: 'Flexing',
  Dodge_Backward: 'Dodge_Backwards',
};

/** A clip by the name the game asks for, from the rig's library (old names and Rig_Large stand-ins resolved). */
export function clipFor(assets: Assets, rig: Rig, name: string): THREE.AnimationClip | undefined {
  const n = CLIP_MAP[name] ?? name;
  return assets.clip(rig, n) ?? (rig === 'large' ? assets.clip(rig, LARGE_CLIPS[n] ?? '') : undefined);
}
