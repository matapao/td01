export type { SaveData } from './save-types.ts';
import type { SaveData } from './save-types.ts';
import { ensureTowerwork } from './towerwork.ts';
/**
 * Saving and restoring a game exactly: the simulation is deterministic and all of its state is
 * plain data (plus the random generator), and the world is rebuilt from its seed. A save is JSON
 * (typed arrays as base64); restoring it into a fresh Sim gives the very same game, which then
 * plays on identically.
 */
import type { Sim } from './sim.ts';
import { CLASSES, HERO, isTower, towerStats } from './content.ts';
import type { GameState, Hero } from './types.ts';
import { restoreMine, underground } from './systems/mining.ts';
import { assertSaveData } from './save-format.ts';

export const SAVE_VERSION = 6;

/** Can this build read a save of version `v` (its own, or one it brings up to date)? */
export const canRead = (v: number): boolean => v === SAVE_VERSION || v === 5 || v === 4;

const TYPED = ['explored', 'occupied'] as const;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** A JSON-safe copy of the whole game. */
export function snapshot(sim: Sim): SaveData {
  const state: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sim.state)) {
    if (v instanceof Uint8Array || v instanceof Int32Array)
      state[k] = toBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    else state[k] = v;
  }
  return JSON.parse(JSON.stringify({ v: SAVE_VERSION, rng: sim.rng.state, state }));
}

/** What a hero takes from the old vale into the new one: who they are and everything they carry or know. */
const CARRIED = [
  'name',
  'cls',
  'level',
  'xp',
  'bag',
  'tools',
  'torchOwned',
  'torchLit',
  'gear',
  'known',
  'scrolls',
  'mastery',
  'weaponTier',
] as const;

/**
 * v5 (and older) → v6: the vale was reshaped. The wall moved out across the pass, and everything we
 * own stands inside it now — the town and its workshops, the woods, quarries and mine head, the
 * Port's field — with only the dead's roads and the towers beyond it. Nothing built in the old vale
 * fits the new one, so the game begins again in the new vale, keeping what the heroes carry: each
 * hero (name, class, level, bag, tools, enchanted parts, the plans they learned, their mastery and
 * their weapon), the team's library of plans, the Road of Invention's inventions, the gold and the
 * storehouse — and the base in Space, which the vale's new shape doesn't touch (flights under way
 * are called off). Heroes get new ids: `sim.heroRemap` says which old id is which (for LAN players).
 */
function fromOldVale(sim: Sim, data: SaveData): void {
  const old = data.state as Partial<GameState> & { library?: string[] };
  const s = sim.state;
  for (const h of s.heroes) sim.remove(h.id);
  s.heroes = [];
  sim.heroRemap.clear();
  for (const oh of (old.heroes ?? []) as Partial<Hero>[]) {
    const cls = oh.cls && oh.cls in CLASSES ? oh.cls : 'tank';
    const h = sim.addHero(oh.player ?? s.heroes.length, oh.name ?? HERO.name, cls);
    const keep = h as unknown as Record<string, unknown>;
    for (const k of CARRIED) if (oh[k] !== undefined) keep[k] = structuredClone(oh[k]);
    h.maxHp = CLASSES[h.cls].hp + HERO.hpPerLevel * (h.level - 1);
    h.hp = h.maxHp;
    if (oh.id !== undefined) sim.heroRemap.set(oh.id, h.id);
  }
  if (typeof old.gold === 'number') s.gold = old.gold;
  if (old.storage) s.storage = structuredClone(old.storage);
  if (old.storageGear) s.storageGear = structuredClone(old.storageGear);
  if (old.library) s.library = structuredClone(old.library) as typeof s.library;
  if (old.road) s.road = structuredClone(old.road);
  if (old.space) s.space = { ...structuredClone(old.space), flights: [] };
  if (typeof old.sigil === 'number') s.sigil = old.sigil;
  if (old.earth) s.earth = structuredClone(old.earth);
  if (old.dev) s.dev = true;
  if (old.dev && old.wavesOff) s.wavesOff = true;
  sim.rebuildRegistry();
}

/**
 * Was the save made in the vale as this build lays it out (its trees, rocks and veins where they
 * stand now)? A game saved while the town was still being laid out wasn't, and comes in like an old one.
 */
function sameVale(sim: Sim, data: SaveData): boolean {
  const saved = ((data.state['nodes'] ?? []) as { x: number; z: number; prop?: number }[]).filter(
    (n) => !underground(n.x) && (n.prop ?? 0) >= 0,
  );
  const now = sim.state.nodes.filter((n) => !underground(n.x) && n.prop >= 0);
  return (
    saved.length === now.length &&
    // The length check above and dense validated save arrays bound every matching node.
    saved.every((n, i) => Math.abs(n.x - now[i]!.x) < 0.01 && Math.abs(n.z - now[i]!.z) < 0.01)
  );
}

/** Puts a saved game into `sim` (built from the same seed). Grids are copied in place. */
export function restore(sim: Sim, data: SaveData): void {
  assertSaveData(data);
  if (!canRead(data.v))
    throw new Error(`Save version ${data.v} is not supported (this game reads ${SAVE_VERSION})`);
  // A game from the vale before the wall moved out (or from another layout of it): a new game in
  // the vale as it is, the heroes kept.
  if (data.v < 6 || !sameVale(sim, data)) {
    fromOldVale(sim, data);
    return;
  }
  const s = sim.state as unknown as Record<string, unknown>;
  // Decode every grid before changing anything; a truncated/corrupt base64 field is not a reset.
  const grids = new Map<string, Uint8Array>();
  for (const key of TYPED) {
    const target = s[key] as Uint8Array | Int32Array;
    if (typeof data.state[key] !== 'string') throw Error(`Missing saved ${key}`);
    const bytes = fromBase64(data.state[key] as string);
    if (bytes.length !== target.byteLength) throw Error(`Invalid saved ${key} length`);
    grids.set(key, bytes);
  }
  for (const [k, v] of Object.entries(data.state)) {
    if (
      !Object.hasOwn(s, k) &&
      ![
        'dev',
        'wavesOff',
        'dayShift',
        'dayHold',
        'space',
        'grid',
        'road',
        'rooms',
        'waveLeaks',
        'towerCrates',
        'earth',
      ].includes(k)
    )
      continue;
    if ((TYPED as readonly string[]).includes(k)) {
      const target = s[k] as Uint8Array | Int32Array;
      const bytes = grids.get(k)!;
      new Uint8Array(target.buffer, target.byteOffset, target.byteLength).set(
        bytes.subarray(0, target.byteLength),
      );
    } else s[k] = structuredClone(v);
  }
  sim.rng.state = data.rng;
  // Heroes saved before weapons were reforged carry the weapon they started with.
  for (const h of sim.state.heroes) h.weaponTier ??= 0;
  // Towers fight by today's numbers (gems and tops retuned since the game was saved).
  for (const b of sim.state.buildings) if (b.stats && isTower(b.kind)) b.stats = towerStats(b);
  sim.rebuildRegistry();
  // A game saved before the mine was reworked gets the mine as it is now (everyone's things kept).
  restoreMine(sim);
  sim.ensureTunnelCamps();
  ensureTowerwork(sim);
  sim.ensureShop();
}
