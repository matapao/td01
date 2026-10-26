import type { AbilityId, GemId, BasePlanId, StoreId } from '../game/content.ts';
import type { Id } from '../game/types.ts';

/** 'wagon' (a mine wagon: its index in the mine's plan) and 'cavein' (one of the mine's cave-ins): F prompts too. */
/** 'cell': a piece of the mine's rock (its dig-grid cell). */
export type SelKind =
  | 'hero'
  | 'unit'
  | 'enemy'
  | 'building'
  | 'site'
  | 'chest'
  | 'drop'
  | 'node'
  | 'poi'
  | 'wagon'
  | 'cavein'
  | 'cell'
  | 'leave';

export interface Sel {
  kind: SelKind;
  id: Id;
}

export type UiWindow =
  | { kind: 'shop'; store: StoreId }
  | { kind: 'storage' }
  | { kind: 'book' }
  | { kind: 'road' }
  | { kind: 'buy' }
  | { kind: 'menu' }
  | { kind: 'class' }
  | null;

/** UI-only state shared by input, HUD and views. Never part of the simulation. */
export class UiState {
  public heroId: Id;

  selected: Sel | null = null;
  hover: Sel | null = null;
  placing: BasePlanId | null = null;
  /** The plan being placed was bought outright (parts paid on placement). */
  placingBuy = false;
  /** The way the planned building will face (turned with R); null: towards the road, as it would by itself. */
  placingRot: number | null = null;
  placingGem: GemId | null = null;
  targeting: AbilityId | null = null;
  window: UiWindow = null;
  alt = false;
  /** Screen position of the mouse. */
  mouse = { x: 0, y: 0 };
  /** Short message near the cursor (placement errors…). */
  cursorHint = '';
  cursorHintT = 0;

  constructor(heroId: Id) {
    this.heroId = heroId;
  }

  hint(msg: string): void {
    this.cursorHint = msg;
    this.cursorHintT = 1.6;
  }
}
