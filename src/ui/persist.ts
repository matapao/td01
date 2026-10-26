/**
 * Keeps a single-player game across reloads — a refresh, a crash, the dev server reloading after a
 * code change: the exact game is stored in this browser now and then (and when the page goes) and
 * picked up again at the next start. Menu → New game starts over. LAN games live on the host.
 */
import type { Sim } from '../game/sim.ts';
import { canRead, restore, snapshot, type SaveData } from '../game/save.ts';

const KEY = 'browserdefense:game';
/** Set by New game: the page is going, and must not store the game it is leaving. */
let dropped = false;

/** Picks up the stored game, if there is one this build can read. */
export function resumeGame(sim: Sim): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as { save?: SaveData };
    if (!data.save || !canRead(data.save.v)) return false;
    restore(sim, data.save);
    return true;
  } catch {
    // Unreadable (an older build, a broken write): start fresh.
    forgetGame();
    return false;
  }
}

/** Stores the game every few seconds and whenever the page goes away (not in LAN games). */
export function keepGame(sim: Sim, isLan: () => boolean): void {
  const store = () => {
    if (isLan() || dropped) return;
    if (sim.state.phase === 'won' || sim.state.phase === 'lost') {
      forgetGame();
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), save: snapshot(sim) }));
    } catch {
      /* storage full or blocked: the game just isn't kept */
    }
  };
  setInterval(store, 10000);
  addEventListener('pagehide', store);
  addEventListener('beforeunload', store);
  import.meta.hot?.on('vite:beforeFullReload', store);
}

/** Forget the stored game; `forGood` also stops storing this one (New game, before a reload). */
export function forgetGame(forGood = false): void {
  dropped ||= forGood;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
