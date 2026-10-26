import { GameMetrics, type ReportMetric } from './metrics.ts';
// The match on the LAN: one simulation, one hero per player (by browser tab), shared gold, plans
// and waves. Every browser gets a full snapshot, then each tick's changes and events. Players move
// their own heroes in their browsers and send poses; everything else is a command the server runs.

import type { WebSocket } from 'ws';
import { Sim } from '../src/game/sim.ts';
import { restore, snapshot } from '../src/game/save.ts';
import type { Command } from '../src/game/types.ts';
import { CLASSES, type HeroClass } from '../src/game/content.ts';
import { setClass } from '../src/game/systems/heroes.ts';
import { DeltaTracker, PLAYER_COMMANDS, type PlayerInfo, type ServerMsg } from '../src/net/protocol.ts';
import { cleanCode, type SavedGame, type SaveStore } from './saves.ts';
import { LAN_LIMITS, MessageBudget, parseClientMessage } from './security.ts';

const COLORS = ['#e8524a', '#3d8bfd', '#f2b33d', '#3fbf7f', '#b36bff', '#ff7ab8', '#2ec4c4', '#f28b30'];

interface Player {
  token: string;
  name: string;
  color: string;
  hero: number;
  socket: WebSocket | null;
}

export interface RoomOptions {
  /** Optional local statistics sink; never contains names, tokens or hero identifiers. */
  reportMetric?: ReportMetric;
  addresses: string[];
  version: string;
  saves: SaveStore;
  /** A game handed over by the previous server (update or crash), or loaded by code. */
  restore?: SavedGame | null;
  /** Explicit local-host opt-in; ordinary LAN players cannot enable development cheats. */
  allowDevCommands?: boolean;
}

export class Room {
  private opts: RoomOptions;
  private metrics!: GameMetrics;

  sim!: Sim;
  private tracker!: DeltaTracker;
  private events: [string, unknown][] = [];
  readonly sockets = new Set<WebSocket>();
  /** Players by browser-tab token, kept when they leave so they get their hero back. */
  private players = new Map<string, Player>();
  private bySocket = new Map<WebSocket, Player>();
  private budgets = new Map<WebSocket, MessageBudget>();
  private storageBusy = false;
  paused = false;
  speed = 1;
  updateReady = false;
  /** Set by the server when it can switch to new code: (by) => … */
  onUpdate: ((by: string | null) => void) | null = null;

  constructor(opts: RoomOptions) {
    this.opts = opts;

    if (opts.restore) this.load(opts.restore, false);
    else this.fresh();
  }

  private fresh(): void {
    this.sim = this.watch(new Sim({ players: 0 }));
    this.metrics = new GameMetrics(this.sim.state, this.opts.reportMetric);
    this.tracker = new DeltaTracker(this.sim.state);
  }

  /** Records every event the simulation emits, to send with the next tick. */
  private watch(sim: Sim): Sim {
    const emit = sim.emit.bind(sim);
    sim.emit = ((k: string, e: unknown) => {
      this.events.push([k, e]);
      (emit as (k: string, e: unknown) => void)(k, e);
    }) as Sim['emit'];
    return sim;
  }

  connect(socket: WebSocket): void {
    socket.on('error', () => socket.terminate());
    if (this.sockets.size >= LAN_LIMITS.sockets) {
      socket.close(1008, 'Room connection limit');
      return;
    }
    this.sockets.add(socket);
    this.budgets.set(socket, new MessageBudget());
    send(socket, {
      type: 'hello',
      addresses: this.opts.addresses,
      version: this.opts.version,
      update: this.updateReady,
      paused: this.paused,
    });
    send(socket, { type: 'full', save: snapshot(this.sim), tick: this.sim.state.tick });
    send(socket, { type: 'players', list: this.playerList() });
    socket.on('message', (data) => this.receive(socket, data.toString()));
    socket.on('close', () => this.disconnect(socket));
  }

  receive(socket: WebSocket, data: string): void {
    if (!this.sockets.has(socket)) return;
    if (!this.budgets.get(socket)?.take()) {
      socket.close(1008, 'Message rate exceeded');
      return;
    }
    const msg = parseClientMessage(data);
    if (!msg) return;
    const player = this.bySocket.get(socket);
    switch (msg.type) {
      case 'join':
        if (!player) this.join(socket, msg.name, msg.token, msg.cls);
        break;
      case 'cmd':
        if (player) this.command(player, msg.cmd);
        break;
      case 'wave':
        if (player) this.sim.callWave();
        break;
      case 'speed':
        if (player && Number.isFinite(msg.speed)) {
          this.speed = Math.max(1, Math.min(3, Math.round(msg.speed)));
          this.broadcast({ type: 'feed', text: `${player.name} set the speed to ${this.speed}×` });
        }
        break;
      case 'pause':
        if (player) this.pause(!!msg.on, player.name);
        break;
      case 'save':
        if (player) this.storage(socket, () => this.save(player.name));
        break;
      case 'load':
        if (player) this.storage(socket, () => this.loadCode(msg.code, player.name, socket));
        break;
      case 'newGame':
        if (player) this.newGame(player.name);
        break;
      case 'listSaves':
        if (player)
          this.storage(socket, async () =>
            send(socket, { type: 'saves', list: await this.opts.saves.list() }),
          );
        break;
      case 'ping':
        if (Number.isFinite(msg.t)) send(socket, { type: 'pong', t: msg.t });
        break;
      case 'update':
        if (player) this.requestUpdate(player.name);
        break;
    }
  }

  // token identifies the browser tab, so a reload or an update brings back your hero.
  private join(socket: WebSocket, name: unknown, token: unknown, cls?: unknown): void {
    let tok = cleanToken(token);
    let p = tok ? this.players.get(tok) : undefined;
    if (p?.socket) {
      tok = null; // a duplicated tab plays a new hero
      p = undefined;
    }
    if (!p) {
      if (this.players.size >= LAN_LIMITS.players) {
        send(socket, { type: 'error', text: 'This room has reached its player limit' });
        return;
      }
      const n = cleanName(name) || `Hero ${this.players.size + 1}`;
      const hero = this.sim.addHero(
        this.players.size,
        n,
        typeof cls === 'string' && Object.hasOwn(CLASSES, cls) ? (cls as HeroClass) : 'tank',
      );
      p = { token: tok ?? randomToken(), name: n, color: this.pickColor(), hero: hero.id, socket };
      this.players.set(p.token, p);
      this.broadcast({ type: 'feed', text: `${p.name} joined` });
    } else {
      p.socket = socket;
      this.broadcast({ type: 'feed', text: `${p.name} is back` });
    }
    this.bySocket.set(socket, p);
    send(socket, { type: 'welcome', hero: p.hero, name: p.name, color: p.color });
    this.broadcast({ type: 'players', list: this.playerList() });
  }

  private command(p: Player, cmd: unknown): void {
    if (!cmd || typeof cmd !== 'object') return;
    const c = cmd as Command & Record<string, unknown>;
    if (!PLAYER_COMMANDS.has(c.t)) return;
    if (['devMode', 'devWaves', 'setTime'].includes(c.t) && !this.opts.allowDevCommands) {
      if (p.socket)
        send(p.socket, { type: 'error', text: 'Development controls are disabled on this LAN server' });
      return;
    }
    // Numbers must be numbers, and you only ever command your own hero.
    for (const v of Object.values(c)) if (typeof v === 'number' && !Number.isFinite(v)) return;
    if ('hero' in c) (c as { hero: number }).hero = p.hero;
    this.sim.apply(c);
    this.metrics.update(this.sim.state);
  }

  private storage(socket: WebSocket, operation: () => Promise<unknown>): void {
    if (this.storageBusy) {
      send(socket, { type: 'error', text: 'A save operation is already running' });
      return;
    }
    this.storageBusy = true;
    void operation()
      .catch(() =>
        send(socket, {
          type: 'error',
          text: 'The save operation failed; the running game is still available',
        }),
      )
      .finally(() => {
        this.storageBusy = false;
      });
  }

  private pickColor(): string {
    const taken = new Set([...this.players.values()].map((p) => p.color));
    // COLORS is a nonempty palette; modulo stays within its allocation.
    return COLORS.find((c) => !taken.has(c)) ?? COLORS[this.players.size % COLORS.length]!;
  }

  disconnect(socket: WebSocket): void {
    this.sockets.delete(socket);
    this.budgets.delete(socket);
    const p = this.bySocket.get(socket);
    if (!p) return;
    this.bySocket.delete(socket);
    p.socket = null;
    this.broadcast({ type: 'feed', text: `${p.name} left` });
    this.broadcast({ type: 'players', list: this.playerList() });
    if (this.updateReady && this.bySocket.size === 0) this.onUpdate?.(null);
  }

  /** One server tick: step the world (unless paused) and send what changed. */
  tick(): void {
    if (this.paused) return;
    for (let i = 0; i < this.speed; i++) this.sim.step();
    this.metrics.update(this.sim.state);
    if (this.sockets.size === 0) {
      this.events.length = 0;
      this.tracker.diff(this.sim.state);
      return;
    }
    const d = this.tracker.diff(this.sim.state);
    const ev = this.events.splice(0);
    this.broadcast({ type: 'tick', tick: this.sim.state.tick, d, ev });
  }

  // ---------- Pause, save and load ----------

  pause(on: boolean, by: string | null): void {
    if (this.paused === on) return;
    this.paused = on;
    this.broadcast({ type: 'paused', paused: on, by });
  }

  /** Pauses and stores the game exactly as it is; returns the code to resume it with. */
  async save(by: string | null): Promise<string> {
    this.pause(true, by);
    const code = await this.opts.saves.save(this.saveState());
    this.broadcast({ type: 'saved', code, by });
    this.broadcast({ type: 'feed', text: `${by ?? 'The server'} saved the game as ${code}` });
    return code;
  }

  private async loadCode(code: unknown, by: string, socket: WebSocket): Promise<void> {
    const c = cleanCode(code);
    const game = c ? await this.opts.saves.load(c) : null;
    if (!game) {
      send(socket, { type: 'error', text: `No saved game called ${String(code)}` });
      return;
    }
    this.load(game, true);
    this.broadcast({
      type: 'feed',
      text: `${by} loaded game ${c} — paused; press Resume when everyone is ready`,
    });
  }

  /** Starts over in a fresh vale (after a lost game, say): everyone online gets a new hero of their class. */
  newGame(by: string): void {
    const classes = new Map(
      [...this.players.values()].map(
        (p) => [p.token, this.sim.getAs(p.hero, 'hero')?.cls ?? 'tank'] as const,
      ),
    );
    this.load({ save: snapshot(new Sim({ players: 0 })), players: [] }, true);
    for (const p of this.players.values()) {
      const h = this.sim.getAs(p.hero, 'hero');
      const cls = classes.get(p.token);
      if (h && cls && h.cls !== cls) setClass(this.sim, h, cls);
    }
    this.pause(false, by);
    this.broadcast({ type: 'feed', text: `${by} started a new game` });
  }

  /** Puts a saved game in place; everyone keeps (or gets back) their own hero. */
  load(game: SavedGame, live: boolean): void {
    const sim = this.watch(new Sim({ players: 0 }));
    restore(sim, game.save);
    this.sim = sim;
    this.metrics = new GameMetrics(sim.state, this.opts.reportMetric);
    this.tracker = new DeltaTracker(sim.state);
    this.events.length = 0;
    const online = [...this.players.values()]
      .filter((p) => p.socket)
      .map((p) => ({ token: p.token, name: p.name, socket: p.socket! }));
    this.players.clear();
    this.bySocket.clear();
    for (const r of game.players) {
      // (A game from an older vale starts again in the new one: its heroes got new ids.)
      const hero = sim.heroRemap.get(r.hero) ?? r.hero;
      if (!sim.getAs(hero, 'hero')) continue;
      this.players.set(r.token, { token: r.token, name: r.name, color: r.color, hero, socket: null });
    }
    if (!live) return;
    this.paused = true;
    for (const socket of this.sockets)
      send(socket, { type: 'full', save: snapshot(sim), tick: sim.state.tick });
    // Players who were in the saved game get their hero back; anyone new gets a fresh one.
    for (const o of online) {
      let p = this.players.get(o.token);
      if (!p) {
        const hero = sim.addHero(this.players.size, o.name);
        p = { token: o.token, name: o.name, color: this.pickColor(), hero: hero.id, socket: null };
        this.players.set(p.token, p);
      }
      p.socket = o.socket;
      this.bySocket.set(o.socket, p);
      send(o.socket, { type: 'welcome', hero: p.hero, name: p.name, color: p.color });
    }
    this.broadcast({ type: 'paused', paused: true, by: null });
    this.broadcast({ type: 'players', list: this.playerList() });
  }

  // ---------- Updates ----------

  // Newer code is waiting, or not any more. The players choose when to switch, unless nobody is playing.
  offerUpdate(ready: boolean): void {
    this.updateReady = ready;
    this.broadcast({ type: 'update', ready });
    if (ready && this.bySocket.size === 0) this.onUpdate?.(null);
  }

  requestUpdate(by: string | null): void {
    if (this.updateReady) this.onUpdate?.(by);
  }

  /** The whole game and who plays whom, for the next server (or a save) to pick up. */
  saveState(): SavedGame {
    return {
      save: snapshot(this.sim),
      players: [...this.players.values()].map(({ token, name, color, hero }) => ({
        token,
        name,
        color,
        hero,
      })),
    };
  }

  playerList(): PlayerInfo[] {
    return [...this.players.values()].map((p) => ({
      hero: p.hero,
      name: p.name,
      color: p.color,
      online: !!p.socket,
    }));
  }

  broadcast(msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    for (const socket of this.sockets) sendRaw(socket, data);
  }
}

function send(socket: WebSocket, msg: ServerMsg): void {
  sendRaw(socket, JSON.stringify(msg));
}

function sendRaw(socket: WebSocket, data: string): void {
  if (socket.readyState !== socket.OPEN) return;
  if (socket.bufferedAmount + Buffer.byteLength(data) > LAN_LIMITS.bufferedBytes) {
    socket.terminate();
    return;
  }
  socket.send(data);
}

function cleanName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 16);
}

function cleanToken(token: unknown): string | null {
  return typeof token === 'string' && /^[0-9a-f]{8,64}$/.test(token) ? token : null;
}

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
}
