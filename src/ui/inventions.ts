/** Owns a single invention attempt, including cancellation while its code is still arriving. */
import { MILESTONES, type MilestoneId } from '../game/road.ts';
import { inventBlocker } from '../game/systems/road.ts';
import type { Game } from '../view/game.ts';
import type { UiState } from './state.ts';
import { el } from './dom.ts';

export class Inventions {
  private game: Game;
  private ui: UiState;
  private root: HTMLElement;
  private closeWindows: () => void;
  private note: (text: string, kind: string) => void;

  private playing: { cancel(): void } | null = null;
  private playedKinds = new Set<string>();
  private status: HTMLElement | null = null;
  constructor(
    game: Game,
    ui: UiState,
    root: HTMLElement,
    closeWindows: () => void,
    note: (text: string, kind: string) => void,
  ) {
    this.game = game;
    this.ui = ui;
    this.root = root;
    this.closeWindows = closeWindows;
    this.note = note;
  }

  start(id: MilestoneId): void {
    const h = this.game.sim.getAs(this.ui.heroId, 'hero');
    if (!h) return;
    const why = inventBlocker(this.game.sim, h, id);
    if (why) return this.note(why, 'bad');
    this.playing?.cancel();
    this.status?.remove();
    if (this.ui.window) this.closeWindows();
    const ms = MILESTONES[id];
    const status = el('div', 'panel pe mg-loading');
    status.append(el('span', '', `Preparing ${ms.name}…`));
    const cancel = el('button', 'btn tiny', 'Cancel');
    status.append(cancel);
    this.root.append(status);
    this.status = status;
    let cancelled = false;
    const pending = {
      cancel: () => {
        cancelled = true;
        status.remove();
      },
    };
    cancel.onclick = () => {
      pending.cancel();
      if (this.playing === pending) this.playing = null;
    };
    this.playing = pending;
    void Promise.all([import('./minigames/index.ts'), import('./minigames/milestones.ts')])
      .then(async ([runtime, setups]) =>
        cancelled ? null : { runtime, def: await setups.milestoneGame(id) },
      )
      .then((loaded) => {
        if (!loaded || cancelled) return;
        const { runtime, def } = loaded;
        // A save/load or a new player position may have changed what is allowed during the fetch.
        const current = this.game.sim.getAs(h.id, 'hero');
        const blocked =
          !current || current !== h
            ? 'The game changed; try the invention again'
            : inventBlocker(this.game.sim, current, id);
        if (blocked) {
          pending.cancel();
          this.playing = null;
          this.note(blocked, 'bad');
          return;
        }
        status.remove();
        const guided = !this.playedKinds.has(def.kind);
        this.playedKinds.add(def.kind);
        const run = runtime.runMinigame(this.root, def, `${ms.name} — ${ms.principle}`, guided, {
          age: ms.age,
        });
        this.playing = run;
        run.result.then((r) => {
          if (this.playing === run) this.playing = null;
          this.game.sim.apply({ t: 'invent', hero: h.id, milestone: id, quality: r.quality });
          if (r.quality === 0) this.note(`${ms.name} — not yet: ${r.why}`, 'bad');
        });
      })
      .catch(() => {
        if (cancelled) return;
        this.playing = null;
        status.replaceChildren(el('span', '', 'The activity could not load.'));
        const retry = el('button', 'btn tiny', 'Reload game');
        // Browsers cache rejected module imports; a fresh page can fetch a repaired chunk.
        retry.onclick = () => location.reload();
        cancel.textContent = 'Close';
        cancel.onclick = () => status.remove();
        status.append(retry, cancel);
      });
  }
}
