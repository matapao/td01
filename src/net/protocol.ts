/**
 * LAN protocol, shared by the server (server/) and the browser.
 *
 * The server runs the one true simulation. A browser that joins gets a full snapshot, then one
 * message per tick: what changed (only the fields that changed, numbers rounded) plus the
 * simulation's events, so its mirror of the game — and every view, sound and HUD element built
 * on it — stays in step. Players' own heroes are moved by their own browsers (poses), like the
 * fps game does with its players.
 */
import { freshEarth, type EarthState, type Cut } from '../game/excavation.ts';
import type { SaveData } from '../game/save.ts';
import type { Command, GameState } from '../game/types.ts';
import type { HeroClass } from '../game/content.ts';

export interface PlayerInfo {
  hero: number;
  name: string;
  color: string;
  online: boolean;
}

export type ServerMsg =
  | { type: 'hello'; addresses: string[]; version: string; update: boolean; paused: boolean }
  | { type: 'welcome'; hero: number; name: string; color: string }
  | { type: 'full'; save: SaveData; tick: number }
  | { type: 'tick'; tick: number; d: Delta; ev: [string, unknown][] }
  | { type: 'players'; list: PlayerInfo[] }
  | { type: 'feed'; text: string }
  | { type: 'pong'; t: number }
  | { type: 'update'; ready: boolean }
  | { type: 'updating'; by: string | null }
  | { type: 'paused'; paused: boolean; by: string | null }
  | { type: 'saved'; code: string; by: string | null }
  | { type: 'saves'; list: { code: string; at: string; wave: number }[] }
  | { type: 'error'; text: string };

export type ClientMsg =
  | { type: 'join'; name: string; token: string; cls?: HeroClass }
  | { type: 'cmd'; cmd: Command }
  | { type: 'wave' }
  | { type: 'speed'; speed: number }
  | { type: 'pause'; on: boolean }
  | { type: 'save' }
  | { type: 'load'; code: string }
  | { type: 'newGame' }
  | { type: 'listSaves' }
  | { type: 'ping'; t: number }
  | { type: 'update' };

/** Commands a browser may send for its own hero (anything else is ignored). */
export const PLAYER_COMMANDS = new Set<Command['t']>([
  'queueTower',
  'hammerTower',
  'shipTower',
  'prepareBlast',
  'makeCharges',
  'mount',
  'excavate',
  'plant',
  'pose',
  'steer',
  'move',
  'attack',
  'interact',
  'stop',
  'cast',
  'beat',
  'place',
  'placeGem',
  'removeGem',
  'upgradeGem',
  'upgradeTop',
  'invent',
  'stackPayload',
  'launch',
  'launchHome',
  'upgradeBuilding',
  'cancelSite',
  'turnSite',
  'demolish',
  'mode',
  'rally',
  'socket',
  'buy',
  'buyGear',
  'buyCrate',
  'buyCrafterKit',
  'buyTorch',
  'toggleTorch',
  'buyout',
  'sell',
  'sellGear',
  'deposit',
  'withdraw',
  'depositGear',
  'withdrawGear',
  'placeDevice',
  'removeDevice',
  'dropItem',
  'dropGear',
  'study',
  'callWave',
  'ride',
  'dig',
  'blast',
  'chooseClass',
  'droneMove',
  'devMode',
  'devWaves',
  'setTime',
  'leave',
  'reforge',
  'gate',
]);

/** Entity arrays in GameState and the registry type of their members. */
export const COLLECTIONS = {
  heroes: 'hero',
  units: 'unit',
  nodes: 'node',
  drops: 'drop',
  chests: 'chest',
  sites: 'site',
  buildings: 'building',
  enemies: 'enemy',
  projs: 'proj',
  fires: 'fire',
  corpses: 'corpse',
  camps: 'camp',
  pois: 'poi',
} as const;

export type CollectionKey = keyof typeof COLLECTIONS;

export interface Delta {
  ec?: Cut[];
  er?: boolean;
  eh?: EarthState['haul'];
  eb?: EarthState['beds'];
  /** Top-level values that changed (sent whole). */
  s?: Record<string, unknown>;
  /** Per collection: new entities (whole), changed fields of known ones (with id), removed ids. */
  c?: Partial<
    Record<CollectionKey, { n?: Record<string, unknown>[]; u?: Record<string, unknown>[]; r?: number[] }>
  >;
  /** Cells explored this tick. */
  x?: number[];
  /** Occupancy changes as flat [cell, id, cell, id, …]. */
  o?: number[];
  /** The mine: what changed of it but its rock (sent whole: which cave-ins are open)… */
  mm?: Record<string, unknown>[];
  /** …the pieces of rock dug out since (as [mine, [cell, …]])… */
  md?: [number, number[]][];
  /** …and the strikes on the pieces being dug, when they change (as [mine, strikes]). */
  mg?: [number, Record<number, number>][];
}

const round = (v: number) => Math.round(v * 1000) / 1000;

type Prim = string | number | boolean | null;

/** Remembers what was last sent and produces per-tick deltas (server side). */
export class DeltaTracker {
  private ents = new Map<string, Map<number, Map<string, Prim>>>();
  private tops = new Map<string, string>();
  private explored: Uint8Array;
  private occupied: Int32Array;
  /** The mine goes as changes: its other fields as JSON, the pieces dug out by count, the strikes as JSON. */
  private earthCount = 0;
  private earthHaul = '';
  private earthBeds = '';
  private mineMeta: string[] = [];
  private mineDug: number[] = [];
  private mineDmg: string[] = [];

  constructor(state: GameState) {
    this.explored = state.explored.slice();
    this.occupied = state.occupied.slice();
    this.reset(state);
  }

  /** Takes the state as the new baseline (after a full snapshot went out). */
  reset(state: GameState): void {
    this.ents.clear();
    this.tops.clear();
    this.earthCount = 0;
    this.earthHaul = '';
    this.earthBeds = '';
    this.mineMeta = [];
    this.mineDug = [];
    this.mineDmg = [];
    this.explored.set(state.explored);
    this.occupied.set(state.occupied);
    this.diff(state);
  }

  diff(state: GameState): Delta {
    const d: Delta = {};
    const st = state as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(st)) {
      if (k in COLLECTIONS || k === 'explored' || k === 'occupied') continue;
      if (k === 'earth') {
        const e = state.earth;
        if (e) {
          if (e.cuts.length < this.earthCount) {
            d.er = true;
            this.earthCount = 0;
          }
          if (e.cuts.length > this.earthCount) d.ec = e.cuts.slice(this.earthCount);
          this.earthCount = e.cuts.length;
          const haul = JSON.stringify(e.haul),
            beds = JSON.stringify(e.beds);
          if (haul !== this.earthHaul) {
            d.eh = { ...e.haul };
            this.earthHaul = haul;
          }
          if (beds !== this.earthBeds) {
            d.eb = e.beds.map((b) => ({ ...b }));
            this.earthBeds = beds;
          }
        }
        continue;
      }
      if (k === 'mines') {
        this.diffMines(state, d);
        continue;
      }
      const json = JSON.stringify(v);
      if (this.tops.get(k) !== json) {
        this.tops.set(k, json);
        (d.s ??= {})[k] = v;
      }
    }
    for (const coll of Object.keys(COLLECTIONS) as CollectionKey[]) {
      const list = st[coll] as { id: number }[];
      let seen = this.ents.get(coll);
      if (!seen) this.ents.set(coll, (seen = new Map()));
      const alive = new Set<number>();
      let n: Record<string, unknown>[] | undefined;
      let u: Record<string, unknown>[] | undefined;
      for (const e of list) {
        alive.add(e.id);
        const prev = seen.get(e.id);
        const rec = e as unknown as Record<string, unknown>;
        if (!prev) {
          const fields = new Map<string, Prim>();
          for (const [f, v] of Object.entries(rec))
            fields.set(
              f,
              typeof v === 'number'
                ? round(v)
                : v !== null && typeof v === 'object'
                  ? JSON.stringify(v)
                  : (v as Prim),
            );
          seen.set(e.id, fields);
          (n ??= []).push(rec);
          continue;
        }
        let changed: Record<string, unknown> | null = null;
        for (const [f, v] of Object.entries(rec)) {
          const now =
            typeof v === 'number'
              ? round(v)
              : v !== null && typeof v === 'object'
                ? JSON.stringify(v)
                : (v as Prim);
          if (prev.get(f) === now) continue;
          prev.set(f, now);
          (changed ??= { id: e.id })[f] = typeof v === 'number' ? now : v;
        }
        if (changed) (u ??= []).push(changed);
      }
      let r: number[] | undefined;
      for (const id of seen.keys()) {
        if (alive.has(id)) continue;
        seen.delete(id);
        (r ??= []).push(id);
      }
      if (n || u || r) (d.c ??= {})[coll] = { ...(n && { n }), ...(u && { u }), ...(r && { r }) };
    }
    for (let i = 0; i < state.explored.length; i++) {
      if (state.explored[i] && !this.explored[i]) {
        this.explored[i] = 1;
        (d.x ??= []).push(i);
      }
    }
    for (let i = 0; i < state.occupied.length; i++) {
      // The loop bounds are the typed buffer's allocation, so this cell exists.
      const occupied = state.occupied[i]!;
      if (occupied !== this.occupied[i]) {
        this.occupied[i] = occupied;
        (d.o ??= []).push(i, occupied);
      }
    }
    return d;
  }

  private diffMines(state: GameState, d: Delta): void {
    for (const m of state.mines) {
      const { dug, dmg, ...meta } = m;
      const json = JSON.stringify(meta);
      if (this.mineMeta[m.id] !== json) {
        this.mineMeta[m.id] = json;
        (d.mm ??= []).push(meta);
      }
      const sent = this.mineDug[m.id] ?? 0;
      if (dug.length > sent) {
        (d.md ??= []).push([m.id, dug.slice(sent)]);
        this.mineDug[m.id] = dug.length;
      }
      const strikes = JSON.stringify(dmg);
      if (this.mineDmg[m.id] !== strikes) {
        this.mineDmg[m.id] = strikes;
        (d.mg ??= []).push([m.id, dmg]);
      }
    }
  }
}

/** The bits of the client's Sim the mirror needs (keeps this file free of the Sim import cycle). */
export interface MirrorSim {
  state: GameState;
  add(type: string, e: unknown): void;
  get(id: number): { type: string; e: unknown } | undefined;
  remove(id: number): void;
  compactNow(): void;
}

/**
 * Applies a delta to the browser's mirror. Removals come back separately so the caller can replay
 * the tick's events first (they often refer to things that died this tick).
 * `keep(coll, id)` names fields to leave alone (the player's own, locally moved hero).
 */
export function applyDelta(
  sim: MirrorSim,
  d: Delta,
  keep?: (coll: CollectionKey, id: number) => ReadonlySet<string> | null,
): number[] {
  const st = sim.state as unknown as Record<string, unknown>;
  if (d.s) for (const [k, v] of Object.entries(d.s)) st[k] = v;
  if (d.er) sim.state.earth = freshEarth();
  if (d.ec || d.eh || d.eb) {
    const e = (sim.state.earth ??= freshEarth());
    if (d.ec) e.cuts.push(...d.ec);
    if (d.eh) e.haul = d.eh;
    if (d.eb) e.beds = d.eb;
  }
  const removed: number[] = [];
  for (const [coll, c] of Object.entries(d.c ?? {}) as [
    CollectionKey,
    NonNullable<Delta['c']>[CollectionKey],
  ][]) {
    if (!c) continue;
    for (const e of c.n ?? []) if (!sim.get(e['id'] as number)) sim.add(COLLECTIONS[coll], e);
    for (const f of c.u ?? []) {
      const ent = sim.get(f['id'] as number);
      if (!ent) continue;
      const skip = keep?.(coll, f['id'] as number);
      const target = ent.e as Record<string, unknown>;
      for (const [k, v] of Object.entries(f)) if (!skip?.has(k)) target[k] = v;
    }
    if (c.r) removed.push(...c.r);
  }
  for (const i of d.x ?? []) sim.state.explored[i] = 1;
  const o = d.o ?? [];
  for (let i = 0; i < o.length; i += 2) {
    const cell = o[i],
      value = o[i + 1];
    if (cell !== undefined && value !== undefined) sim.state.occupied[cell] = value;
  }
  for (const meta of d.mm ?? []) {
    const mine = sim.state.mines[meta['id'] as number];
    if (mine) Object.assign(mine, meta);
  }
  for (const [id, cells] of d.md ?? []) sim.state.mines[id]?.dug.push(...cells);
  for (const [id, dmg] of d.mg ?? []) {
    const mine = sim.state.mines[id];
    if (mine) mine.dmg = dmg;
  }
  return removed;
}

/** Finishes a delta: drops the entities that left this tick. */
export function applyRemovals(sim: MirrorSim, removed: number[]): void {
  if (!removed.length) return;
  for (const id of removed) sim.remove(id);
  sim.compactNow();
}
