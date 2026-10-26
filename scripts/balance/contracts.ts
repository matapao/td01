/** Contracts for offline balance experiments; no simulation or process ownership. */
import type { HeroClass, GemId, DeviceId } from '../../src/game/content.ts';
export interface Econ {
  name: string;
  /** Labour-seconds a second of game time (a slower player wastes more of it). */
  labourEff: number;
  /** Share of the kill gold hauled up from the field. */
  goldEff: number;
  /** Hands-on work takes this much longer. */
  overhead: number;
  /** No tower finishes before this (a careful player readies the first towers before the first wave is called). */
  hold: number;
  /** Seconds to get back to a broken gate. */
  react: number;
  /** Scales every income (labour and gold): the least a build needs to win is found by searching it. */
  beta: number;
  /** Scales the dead's health (probes: how much tougher a defence could take). */
  hpMul?: number;
  /** Probes: the game counts as won once this wave is cleared. */
  upto?: number;
}
// ---- Strategies ------------------------------------------------------------------------------------

/** One step of a build plan: a tower (at the strategy's next spot), a rough gem, a gem a level up, the next top, a device. */
export type Act =
  ['T'] | ['G', number, GemId] | ['U', number, GemId] | ['P', number] | ['D', number, DeviceId];

export interface Strategy {
  name: string;
  family: string;
  cls: HeroClass;
  /** Spot indices (see spots()), in build order: tower t stands at spots[t]. */
  spots: number[];
  acts: Act[];
  /** A post on the wall-walk in the waves from wave `postFrom` on: crew the gate tower (and Battle Cry / Rally), or keep the gate. */
  post: 'none' | 'crew' | 'keeper';
  postFrom: number;
  /** Mend the gate and patch the towers between waves (and run to a broken gate). */
  mend: boolean;
  /** Braziers on the wall-walk for towers the wall's torches don't reach. */
  light: boolean;
  /** The run round the vale's chests: once wave `chests` is out (−1: never). */
  chests: number;
  econ?: string;
}

export interface Result {
  won: boolean;
  lives: number;
  /** Waves fully cleared. */
  cleared: number;
  /** The wave the game ended in (lost) or 12. */
  wave: number;
  firstLoss: number;
  lostBy: number[];
  gateBreaks: number;
  towers: number;
  gems: number;
  gemLv: number;
  goldIn: number;
  labourIn: number;
  spentG: number;
  spentL: number;
  /** Unspent labour + KAPPA × gold at the end. */
  slack: number;
  acts: number;
  /** HP share of the last wave killed (for partial credit). */
  frac: number;
  time: number;
  /** What each kind of build bought: count and its labour-equivalent cost. */
  buys: Record<string, [number, number]>;
  /** Lives lost, by what got through (over the wall, under it, or through a broken gate). */
  leaks: Record<string, number>;
}
