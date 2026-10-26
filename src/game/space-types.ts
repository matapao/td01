/** Payload, flight and off-world state contracts. */
import type { Parts } from './content-types.ts';
import type { Id } from './entity-types.ts';

export type PayloadId = 'lander' | 'solarfarm' | 'habitat' | 'crew' | 'rover' | 'drill' | 'oxygen' | 'ascent';

export interface PayloadDef {
  id: PayloadId;
  /** Where it stands at the base (from the base's middle, m). */
  slot: { x: number; z: number };
  /** Half its footprint (m): nobody walks through it. */
  half: number;
  /** What it does there, in a line. */
  does: string;
}

export type Cargo = Parts;

/**
 * The phases of a flight: the climb, the long cruise, then the way down — out there a braking burn and
 * a powered descent (there is no air); home, entry behind the heat shield and the parachute.
 */
export type FlightPhase = 'ascent' | 'cruise' | 'braking' | 'entry' | 'parachute' | 'descent' | 'touchdown';

export interface Flight {
  id: Id;
  payload: PayloadId;
  /** Outbound to Space, or the minerals coming home. */
  home: boolean;
  /** Seconds since launch. */
  t: number;
  phase: FlightPhase;
  /** A hero riding along (0: none). */
  crew: Id;
  cargo: Parts;
}

export interface SpaceState {
  /** What has landed at the base, and where it stands. */
  modules: { id: Id; kind: PayloadId; x: number; z: number; landedAt: number }[];
  flights: Flight[];
  /** Minerals the rover and drill have brought in, waiting for the ascent vehicle. */
  depot: Parts;
  /** When each kind of base work last brought something in. */
  workT: Record<string, number>;
}
