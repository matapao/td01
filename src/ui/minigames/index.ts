/**
 * Every minigame kind, by name — and the playground (?minigame=<kind>) that runs one on its own with
 * its demo set-up, to try it and to screenshot it.
 */
import './minigames.css';
import type { Minigame, MinigameResult } from './types.ts';
import { AGES, type AgeId } from '../../game/road.ts';
import { AGE_FACE, facesReady } from '../fonts.ts';
import { KIND_GLYPH, glyph } from '../glyphs.ts';
import { setBoardFace } from './kit.ts';
import { loadMinigame, type PreparedMinigame } from './load.ts';
import { isMinigameKind } from './catalogue.ts';

export interface RunOptions {
  /** The age whose face the board wears (none: the UI serif). */
  age?: AgeId;
}

/**
 * Runs a minigame in `parent` (a panel with a title and the kind's own canvas) and resolves with its
 * result. `guided`: the first time, with hints. The board wears its age's face (fonts.ts): the panel's
 * words in CSS (.mg-face-*), the canvas's through the kit's FONT. "Name — principle" titles show the
 * name in the title face.
 */
export function runMinigame(
  parent: HTMLElement,
  def: PreparedMinigame,
  title: string,
  guided: boolean,
  opts: RunOptions = {},
): { result: Promise<MinigameResult>; cancel: () => void } {
  const face = opts.age ? AGE_FACE[opts.age] : 'serif';
  const panel = document.createElement('div');
  panel.className = `mg-panel panel pe mg-face-${face}`;
  if (opts.age) panel.dataset['age'] = opts.age;
  const cut = title.indexOf(' — ');
  const head =
    cut < 0
      ? `<span class="mg-name">${title}</span>`
      : `<span class="mg-name">${title.slice(0, cut)}</span><span class="mg-principle"> — ${title.slice(cut + 3)}</span>`;
  panel.innerHTML = `<div class="mg-title gold-text">${head}</div><div class="mg-kind">${glyph(KIND_GLYPH[def.kind])}${def.name}</div>`;
  const root = document.createElement('div');
  root.className = 'mg-root';
  panel.appendChild(root);
  parent.appendChild(panel);
  let raf = 0;
  let last = performance.now();
  let settle: (r: MinigameResult) => void = () => {};
  const result = new Promise<MinigameResult>((res) => (settle = res));
  let game: Minigame | null = null;
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game?.update(dt);
    raf = requestAnimationFrame(loop);
  };
  let closed = false;
  // A board measures and paints some of its words once, as it sets up: let its face arrive first (the
  // files are local and small — a frame or two, never long).
  facesReady(face === 'serif' ? ['serif', 'title'] : [face]).then(() => {
    if (closed) return;
    setBoardFace(face);
    game = def.create({ root, guided, done: (r) => close(r) });
    last = performance.now();
    raf = requestAnimationFrame(loop);
  });
  function close(r: MinigameResult): void {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    game?.dispose();
    setBoardFace('serif');
    panel.remove();
    settle(r);
  }
  return { result, cancel: () => close({ quality: 0, why: 'Called off.' }) };
}

/** ?minigame=<kind>: the kind alone on an empty page, with its demo set-up; the results are logged. */
export async function minigamePlayground(kind: string): Promise<boolean> {
  if (!isMinigameKind(kind)) return false;
  const def = await loadMinigame(kind);
  document.body.classList.add('mg-playground');
  const host = document.createElement('div');
  host.className = 'mg-stage';
  document.body.appendChild(host);
  const results: MinigameResult[] = [];
  (window as unknown as { __mgResults: MinigameResult[] }).__mgResults = results;
  // Its face: &age=<age>, or the age of the milestone whose set-up the demo is.
  const q = new URLSearchParams(location.search);
  const asked = q.get('age');
  const age = AGES.some((a) => a.id === asked) ? (asked as AgeId) : def.age;
  const go = (guided: boolean) =>
    runMinigame(host, def, `${def.name} (demo)`, guided, age ? { age } : {}).result.then((r) => {
      results.push(r);
      console.log('minigame result', JSON.stringify(r));
      go(false);
    });
  go(q.get('guided') !== '0');
  return true;
}
