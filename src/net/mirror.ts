/**
 * Turns a Game into a LAN mirror: the server's snapshot and per-tick changes drive its Sim (and so
 * every view, sound and HUD element), commands go to the server, and the player's own hero is moved
 * right here at frame rate (poses, sent ~30 times a second) so walking stays instant.
 */
import type { Game } from '../view/game.ts';
import type { UiState } from '../ui/state.ts';
import { TPS } from '../game/config.ts';
import { restore } from '../game/save.ts';
import type { Command } from '../game/types.ts';
import { applyDelta, applyRemovals, type MirrorSim, type PlayerInfo, type ServerMsg } from './protocol.ts';
import type { LanClient } from './client.ts';

/** Fields of your own hero that your browser owns while you walk (the server's echo lags behind). */
const LOCAL_FIELDS = new Set([
  'x',
  'z',
  'px',
  'pz',
  'facing',
  'look',
  'gait',
  'anim',
  'moveT',
  'droneX',
  'droneZ',
]);
/** Stand-in hero id while spectating before you join (never used by the server). */
const GHOST = 999_999_999;

export interface Mirror {
  players: PlayerInfo[];
  paused: boolean;
  speed: number;
  joined: boolean;
  onFeed: (text: string) => void;
  onChange: () => void;
  onSaved: (code: string, by: string | null) => void;
  onError: (text: string) => void;
}

export function attachMirror(game: Game, ui: UiState, client: LanClient): Mirror {
  const sim = game.sim;
  const mirror: Mirror = {
    players: [],
    paused: false,
    speed: 1,
    joined: false,
    onFeed: () => {},
    onChange: () => {},
    onSaved: () => {},
    onError: () => {},
  };
  game.net = { lastTickAt: performance.now(), interval: 1000 / TPS };
  const local = sim.apply.bind(sim);
  let pose: Command | null = null;
  let poseAt = 0;
  let movingUntil = 0;
  /** Your drone's latest position, waiting to go out with the next pose flush. */
  let flight: Command | null = null;
  // Commands go to the server; poses (and your drone's flight) move here first.
  sim.apply = (cmd: Command) => {
    if (cmd.t === 'pose' || cmd.t === 'droneMove') {
      local(cmd);
      if (cmd.t === 'droneMove' || cmd.moving) movingUntil = performance.now() + 400;
      if (cmd.t === 'pose') pose = cmd;
      else flight = cmd;
      if ((cmd.t === 'pose' && !cmd.moving) || performance.now() - poseAt > 33) flushPose();
      return;
    }
    client.send({ type: 'cmd', cmd });
  };
  const flushPose = () => {
    if ((!pose && !flight) || !mirror.joined) return;
    if (pose) client.send({ type: 'cmd', cmd: pose });
    if (flight) client.send({ type: 'cmd', cmd: flight });
    pose = null;
    flight = null;
    poseAt = performance.now();
  };
  setInterval(flushPose, 33);
  sim.callWave = () => client.send({ type: 'wave' });
  // The speed button asks the server (which owns the clock).
  Object.defineProperty(game, 'speed', {
    get: () => mirror.speed,
    set: (v: number) => client.send({ type: 'speed', speed: v < 1 ? 1 : v }),
  });

  let ghost = sim.state.heroes[0] ? structuredClone(sim.state.heroes[0]) : null;
  const setLocal = (id: number) => {
    ui.heroId = id;
    game.localHero = id;
    game.views.localHero = id;
  };

  /** Your hero, once the server has named it: it arrives with the next tick, so the stand-in waits for it. */
  let pending = 0;
  const takeOver = () => {
    if (!pending || !sim.getAs(pending, 'hero')) return;
    const gi = sim.state.heroes.findIndex((h) => h.id === GHOST);
    if (gi >= 0) sim.state.heroes.splice(gi, 1);
    sim.remove(GHOST);
    setLocal(pending);
    pending = 0;
    mirror.onChange();
  };

  client.handlers.full = (m) => {
    restore(sim, m.save);
    // Until you join you watch as a stand-in at the gate (it never reaches the server).
    if (!mirror.joined && ghost) {
      ghost = { ...ghost, id: GHOST };
      (sim as unknown as MirrorSim).add('hero', ghost);
      setLocal(GHOST);
    } else if (!sim.getAs(ui.heroId, 'hero') && ghost) {
      (sim as unknown as MirrorSim).add('hero', { ...ghost, id: GHOST });
      setLocal(GHOST);
    }
    game.net!.lastTickAt = performance.now();
    takeOver();
    mirror.onChange();
  };
  client.handlers.welcome = (m) => {
    mirror.joined = true;
    // The stand-in steps aside for your real hero as soon as it is here.
    pending = m.hero;
    client.resumed();
    takeOver();
    mirror.onChange();
  };
  client.handlers.tick = (m) => {
    const now = performance.now();
    const removed = applyDelta(sim as unknown as MirrorSim, m.d, (coll, id) =>
      coll === 'heroes' && id === ui.heroId && now < movingUntil ? LOCAL_FIELDS : null,
    );
    const emit = sim.events.emit.bind(sim.events) as (k: string, e: unknown) => void;
    for (const [k, e] of m.ev) emit(k, e);
    applyRemovals(sim as unknown as MirrorSim, removed);
    game.net!.lastTickAt = now;
    takeOver();
  };
  client.handlers.players = (m) => {
    mirror.players = m.list;
    mirror.onChange();
  };
  client.handlers.paused = (m: Extract<ServerMsg, { type: 'paused' }>) => {
    mirror.paused = m.paused;
    if (m.by) mirror.onFeed(`${m.by} ${m.paused ? 'paused' : 'resumed'} the game`);
    mirror.onChange();
  };
  client.handlers.saved = (m) => mirror.onSaved(m.code, m.by);
  client.handlers.feed = (m) => mirror.onFeed(m.text);
  client.handlers.error = (m) => mirror.onError(m.text);
  client.handlers.hello = (m) => {
    mirror.paused = m.paused;
    mirror.onChange();
  };
  return mirror;
}
