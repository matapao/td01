import { MINE_REGION_X } from '../mines.ts';

export const MINING = {
  /** Seconds per pickaxe strike. */
  hitTime: 0.46,
  /** How far from a piece's middle a hero can hack at it. */
  reach: 1.45,
  /** Dynamite: fuse, blast radius, damage to creatures and to people nearby. */
  fuse: 3,
  blastR: 2.4,
  blastDamage: 160,
  heroDamage: 110,
  /** How much rock a charge brings down (m round it). */
  blastRock: 1.75,
  /** A cave-in blows open when the charge goes off this close to its middle (beyond its rubble's reach). */
  caveReach: 1.7,
  /** How close to a waiting wagon you must be to climb in. */
  board: 2.2,
};

/** Is a world point inside the mine's region? */
export const underground = (x: number): boolean => x > MINE_REGION_X;
