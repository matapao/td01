/** Persistent rock cuts, planting spots and deposit estimates. */
import type { Parts } from './content-types.ts';
import type { MineralId } from './mine-line-data.ts';

/** Old saves and charges retain spherical cuts. Pick strokes store a shallow face-aligned flake. */
export interface Cut {
  x: number;
  y: number;
  z: number;
  r: number;
  soil: boolean;
  nx?: number;
  ny?: number;
  nz?: number;
  depth?: number;
}

export interface EarthState {
  cuts: Cut[];
  haul: Parts;
  beds: { x: number; z: number; planted: boolean }[];
}

export interface Deposit {
  x: number;
  y: number;
  z: number;
  r: number;
  mineral: MineralId;
}
