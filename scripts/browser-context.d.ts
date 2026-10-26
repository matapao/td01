import type { Game } from '../src/view/game.ts';
import type { Hud } from '../src/ui/hud.ts';
import type { DebugAPI } from '../src/view/debug.ts';
import type { Input } from '../src/view/input.ts';
import type { Hero } from '../src/game/entity-types.ts';
import type { Audio } from '../src/view/audio.ts';

/** Installed game surfaces: browser scenarios call ready() before accessing these. */
declare global {
  interface Window {
    __ready: boolean;
    __game: Game;
    __hud: Hud;
    __debug: DebugAPI;
    __audio: Audio;
    __test: { input: Input; hero(): Hero; require<T>(value: T | undefined | null): T };
  }
}
