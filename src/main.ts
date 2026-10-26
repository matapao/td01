import './style.css';
import { Assets } from './view/assets.ts';
import { Game } from './view/game.ts';
import { installDebug } from './view/debug.ts';
import { Input } from './view/input.ts';
import { isMinigameKind } from './ui/minigames/catalogue.ts';
import { FirstLoop } from './ui/firstloop.ts';
import { Lighting } from './view/lighting.ts';
import { Icons } from './ui/icons.ts';
import { UiState } from './ui/state.ts';
import { Hud } from './ui/hud.ts';
import { LanPanel } from './ui/lan.ts';
import { Audio } from './view/audio.ts';
import { detectLan, LanClient } from './net/client.ts';
import { attachMirror } from './net/mirror.ts';
import { keepGame, resumeGame } from './ui/persist.ts';

declare global {
  interface Window {
    __ready?: boolean;
    __game?: Game;
    __hud?: Hud;
  }
}

/**
 * No loading screens, ever: the vale (terrain, water, grass, sky) is generated and on screen at
 * once; scenery, characters and the HUD stream in as soon as the models arrive. In a LAN game the
 * server's world replaces the local one the moment its snapshot lands.
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  // ?minigame=<kind>: one Road of Invention minigame alone, with its demo set-up (to try and screenshot).
  const mg = params.get('minigame');
  if (mg && isMinigameKind(mg)) {
    const { minigamePlayground } = await import('./ui/minigames/index.ts');
    await minigamePlayground(mg);
    return;
  }
  const container = document.getElementById('app') as HTMLElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;
  const game = new Game(container, uiRoot, {
    fog: params.get('fog') === '1',
    sigil: Number(params.get('sigil') ?? 0),
  });
  const light = new Lighting(game.stage);
  // Keep state: a reload (or the dev server picking up a code change) carries on the same game.
  const resumed = resumeGame(game.sim);
  let lanGame = false;
  keepGame(game.sim, () => lanGame);
  const initialHero = game.sim.state.heroes[0];
  if (!initialHero) throw new Error('A local game must have an initial hero');
  game.localHero = initialHero.id;
  game.start();
  window.__game = game;

  const lan = detectLan();
  const assets = new Assets();
  await assets.load(() => {});
  game.attach(assets);
  const icons = new Icons(assets);
  icons.warm();
  const ui = new UiState(game.localHero);
  const input = new Input(game, ui);
  game.views.localHero = ui.heroId;
  game.input = input;
  const hud = params.get('hud') === '0' ? null : new Hud(game, ui, input, icons, uiRoot);
  new FirstLoop(game, input, ui);
  const audio = new Audio(game);
  // UI clicks get a soft tick.
  uiRoot.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.slot, .btn, .card, .addon, .mopt, .mslot')) audio.play('click');
  });
  game.onFrame((dt) => {
    light.setUnderground(game.under && !game.indoors, dt);
    light.room = game.indoors;
    light.space = game.inSpace;
    light.tod = game.tod;
    light.update();
    input.update(dt);
    hud?.update(dt);
    audio.update(dt);
  });
  const camParam = params.get('cam');
  if (camParam) {
    const [x, z, d] = camParam.split(',').map(Number);
    const h = game.sim.state.heroes[0];
    if (h && x !== undefined && z !== undefined && Number.isFinite(x) && Number.isFinite(z)) {
      h.x = h.px = x;
      h.z = h.pz = z;
      if (d && Number.isFinite(d)) game.cam.zoomTo(d, true);
    }
  }
  // A LAN server answers /lan.json: play its world instead of a local one.
  const info = await lan;
  if (!info && !resumed) hud?.toggle({ kind: 'class' });
  if (info) {
    lanGame = true;
    const client = new LanClient();
    const mirror = attachMirror(game, ui, client);
    new LanPanel(client, mirror, uiRoot, info.addresses, (text, kind) => hud?.note(text, kind ?? 'info'));
    if (hud) hud.onPlayAgain = () => client.send({ type: 'newGame' });
  }
  if (hud) window.__hud = hud;
  installDebug(game);
  let frames = 0;
  game.onFrame(() => {
    if (++frames === 8) window.__ready = true;
  });
}

boot().catch((e) => console.error(e));
