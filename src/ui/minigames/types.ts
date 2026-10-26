/**
 * The minigames of the Road of Invention (docs/TECH_LINEAGE.md §1, §4): one reusable kind each, set up
 * per milestone with its own parts, numbers and words. Every run is short (10–40 s), teaches one
 * principle by showing cause and effect, and ends in a result — miss, good or perfect — with one
 * line on *why* it went that way (kept in the Field Notes).
 *
 * A kind is a factory: given a host (where to draw, how to finish) and its parameters, it returns a
 * running minigame that the host updates every frame and disposes when it is done.
 */

/** The twelve kinds (TECH_LINEAGE §4): defined with the Road's data (game/road.ts). */
import type { MinigameKind } from '../../game/road.ts';
export type { MinigameKind };

/** 0 a miss (it failed, safely and visibly), 1 good, 2 perfect. */
export type Quality = 0 | 1 | 2;

export interface MinigameResult {
  quality: Quality;
  /** One line on why it went that way ("Too much tin: the bronze is brittle."). */
  why: string;
}

export interface MinigameHost {
  /** Where to draw: an empty element; the minigame fills it (about 380 × 240 CSS px). */
  root: HTMLElement;
  /** The first time: show ghost hints of what to do. */
  guided: boolean;
  /** Finish: the host takes the result and disposes the minigame. */
  done(result: MinigameResult): void;
}

/** A running minigame. */
export interface Minigame {
  /** Every frame (seconds since the last). */
  update(dt: number): void;
  /** Tear down: remove its DOM and listeners. */
  dispose(): void;
}

export type MinigameFactory<P> = (host: MinigameHost, params: P) => Minigame;

/** A kind: its factory, and a demo set-up for the playground (?minigame=<kind>). */
export interface MinigameDef<P> {
  kind: MinigameKind;
  /** Its name as the player sees it ("Mix the ratio"). */
  name: string;
  create: MinigameFactory<P>;
  demo: P;
}
