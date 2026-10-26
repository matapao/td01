import type { Game } from '../game.ts';
import type { Sel, UiState } from '../../ui/state.ts';
import { sizeOf, type BuildingKind } from '../../game/content.ts';
import type { Command } from '../../game/types.ts';
import type { Hero } from '../../game/types.ts';

/** Narrow command port shared by input collaborators. Gameplay state changes only through cmd. */
export interface InputContext {
  readonly game: Game;
  readonly ui: UiState;
  readonly hero: Hero;
  cmd(command: Command): void;
  select(selection: Sel | null): void;
  cancelModes(): void;
  onWorkshop(): void;
  onOverview(): void;
}
export interface InputModes {
  activityOpen: boolean;
  blastArmed: boolean;
}
export interface Prompt {
  sel: Sel;
  text: string;
}
/** A building's footprint plus one step, shared by prompts and selection rings. */
export const buildingR = (kind: BuildingKind) => sizeOf(kind) / 2 + 0.3;
