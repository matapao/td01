/** Presentation capabilities shared by HUD panels; commands remain simulation-owned. */
import type { Hero } from '../../game/entity-types.ts';
import type { Game } from '../../view/game.ts';
import type { Input } from '../../view/input.ts';
import type { Icons } from '../icons.ts';
import type { UiState } from '../state.ts';
import type { Tooltip } from '../tooltip.ts';

export interface HudPanelContext {
  readonly game: Game;
  readonly ui: UiState;
  readonly input: Input;
  readonly icons: Icons;
  readonly tip: Tooltip;
  readonly hero: () => Hero;
}
