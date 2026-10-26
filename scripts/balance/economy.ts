/** Labour and gold estimates for offline strategy probes. */
import type { Sim } from '../../src/game/sim.ts';
import type { Hero } from '../../src/game/entity-types.ts';
import {
  PLANS,
  REPAIR,
  WORK,
  type Parts,
  type ItemId,
  type PlanId,
  type DeviceId,
} from '../../src/game/content.ts';
import { partPrice } from '../../src/game/systems/craft.ts';
import type { Econ } from './contracts.ts';
// ---- The economy model (measured: see the header) ------------------------------------------------

/** Labour-seconds a gold coin stands for, when choosing how to pay (buying out wood, gears, ingots saves ~0.35–0.45 s a coin). */
export const KAPPA = 0.4;
/**
 * Labour-seconds per unit gathered or mined by an efficient hero, the walking amortised (a bot
 * batching towers from the home ring: ~1.4 s a wood or stone; the mine's chambers: 4–6 s a raw gem
 * once there, ~8 s with the rides).
 */
const GATHER: Partial<Record<ItemId, number>> = {
  wood: 1.4,
  stone: 1.4,
  ore: 2,
  coal: 2,
  copper: 2.5,
  crystal: 2.5,
  quartz: 4,
  silver: 4,
  sulfur: 3,
  nugget: 5,
  ruby: 8,
  sapphire: 8,
  topaz: 8,
  amethyst: 8,
  emerald: 8,
};
/** Crafted at a workshop, the parts gathered too (labour-seconds), once the workshop stands. */
const CRAFT: Partial<Record<ItemId, { l: number; station: Station }>> = {
  planks: { l: 2.4, station: 'sawmill' },
  blocks: { l: 3.8, station: 'stonecutter' },
  ingot: { l: 6.5, station: 'forge' },
  gears: { l: 5.3, station: 'anvil' },
  rune: { l: 14, station: 'arcanist' },
};
type Station = 'sawmill' | 'stonecutter' | 'forge' | 'anvil' | 'arcanist';
/** Raising a workshop (labour-seconds, gold for its plan if no reward brought it): the anvil needs the forge, the bench both. */
const STATION_COST: Record<Station, { l: number; plan: PlanId | null; needs: Station[] }> = {
  sawmill: { l: 16, plan: null, needs: [] },
  stonecutter: { l: 20, plan: 'stonecutter', needs: [] },
  forge: { l: 28, plan: 'forge', needs: ['stonecutter'] },
  anvil: { l: 26, plan: 'anvil', needs: ['forge'] },
  arcanist: { l: 26, plan: 'arcanist', needs: ['forge', 'anvil'] },
};
/** Store prices by the gate (market, smithy) and in town; everything else only through the porters (partPrice). */
const SHOP: Partial<Record<ItemId, number>> = {
  wood: 3,
  stone: 3,
  ore: 6,
  coal: 4,
  planks: 8,
  blocks: 9,
  ingot: 16,
  gears: 12,
  crystal: 10,
  rune: 45,
};
/** Walking to a store, per unit bought there. */
const SHOP_L = 0.25;
/** Hands-on work per build (place it, carry the parts up the walk and over, the steps): labour-seconds. */
export const OVERHEAD = { tower: 10, gem: 6, up: 6, top: 8, dev: 8, brazier: 5 };
/**
 * First trips to the mine's chambers (labour-seconds, gold for dynamite): the Copper Face is open;
 * everything else lies past cave-ins (dynamite from the Dwarven Trading Post, found once: POST) and
 * the Grade II chambers have guardians.
 */
const UNLOCK: Record<string, { l: number; g: number; items: ItemId[] }> = {
  copper: { l: 12, g: 0, items: ['topaz', 'copper', 'coal'] },
  ruby: { l: 40, g: 18, items: ['ruby'] },
  iron: { l: 15, g: 18, items: ['sulfur'] },
  sapphire: { l: 45, g: 36, items: ['sapphire', 'emerald'] },
  silver: { l: 15, g: 18, items: ['silver', 'quartz'] },
  vault: { l: 60, g: 36, items: ['amethyst', 'nugget'] },
};
const POST = 50;
/**
 * Mending: HP a plank gives (REPAIR.processed); HP a hero hammers into a building a second, and into
 * the gate (good and perfect beats ~every 0.6 s: the hammer's ring closes in 0.85 s).
 */
export const PLANK_HP = REPAIR.processed;
export const MEND_RATE =
  ((0.7 * WORK.good + 0.3 * WORK.perfect) / 0.6) * REPAIR.beat + WORK.heroPassive * REPAIR.passive;
export const GATE_RATE =
  ((0.7 * WORK.good + 0.3 * WORK.perfect) / 0.6) * REPAIR.gateBeat + WORK.heroPassive * REPAIR.gatePassive;
/** Research and the grid before the first device (the Road of Invention to the electric age, the watermill, poles to the wall). */
export const GRID_COST = { l: 260, g: 120 };
/** Gold a labour-second fetches when it is gold that is short: wood, ore, copper or raw gems sold at the stores' half price. */
const SELL = 1.2;
/**
 * The vale's chests (MAP.chests: 270 gold, nine plans and some parts), fetched on one run round the
 * vale (~300 m, the camps by two of them fought): labour-seconds.
 */
export const CHEST_RUN = {
  l: 170,
  gold: 270,
  scrolls: [
    'stonecutter',
    'arcanist',
    'arcane',
    'blast',
    'frost',
    'fury',
    'far',
    'storm',
    'rime',
  ] as PlanId[],
};
export const DEVICE_RESEARCH = { l: 45, g: 20 };

export const ECONS: Record<'smart' | 'average' | 'poor', Econ> = {
  smart: { name: 'smart', labourEff: 1, goldEff: 0.95, overhead: 1, hold: 95, react: 12, beta: 1 },
  average: { name: 'average', labourEff: 0.85, goldEff: 0.85, overhead: 1.15, hold: 60, react: 20, beta: 1 },
  poor: { name: 'poor', labourEff: 0.6, goldEff: 0.7, overhead: 1.4, hold: 0, react: 40, beta: 1 },
};

// ---- Costs ---------------------------------------------------------------------------------------

export interface Wallet {
  gold: () => number;
  spendGold: (g: number) => void;
  labour: number;
}

interface Need {
  parts: Parts;
  /** Labour on top (hands-on, study). */
  l: number;
  /** Gold on top (scrolls). */
  g: number;
  plans: PlanId[];
}

export const GEM_OF_ITEM: Partial<Record<ItemId, string>> = {};
for (const [k, u] of Object.entries(UNLOCK)) for (const it of u.items) GEM_OF_ITEM[it] = k;

export class Economy {
  private sim: Sim;
  private h: Hero;
  private econ: Econ;
  private w: Wallet;

  unlocked = new Set<string>(['__']);
  stations = new Set<Station>();
  postFound = false;
  grid = false;
  research = new Set<DeviceId>();
  spentG = 0;
  spentL = 0;
  buys: Record<string, [number, number]> = {};
  constructor(sim: Sim, h: Hero, econ: Econ, w: Wallet) {
    this.sim = sim;
    this.h = h;
    this.econ = econ;
    this.w = w;
  }

  /** How to source one unit of `item`: [labour, gold] for each way, with what it unlocks. */
  private ways(item: ItemId): { l: number; g: number; unlock?: string; station?: Station }[] {
    const out: { l: number; g: number; unlock?: string; station?: Station }[] = [];
    const gather = GATHER[item];
    if (gather !== undefined) {
      const u = GEM_OF_ITEM[item];
      if (!u || this.unlocked.has(u)) out.push({ l: gather, g: 0 });
      else out.push({ l: gather, g: 0, unlock: u });
    }
    const craft = CRAFT[item];
    if (craft)
      out.push({ l: craft.l, g: 0, ...(this.stations.has(craft.station) ? {} : { station: craft.station }) });
    const shop = SHOP[item];
    if (shop !== undefined) out.push({ l: SHOP_L, g: shop });
    out.push({ l: 0, g: partPrice(item) });
    return out;
  }

  private unlockCost(u: string): { l: number; g: number } {
    const d = UNLOCK[u];
    if (!d) throw new Error(`Unknown mine unlock ${u}`);
    return { l: d.l + (d.g > 0 && !this.postFound ? POST : 0), g: d.g };
  }

  private stationCost(st: Station, seen = new Set<Station>()): { l: number; g: number } {
    if (this.stations.has(st) || seen.has(st)) return { l: 0, g: 0 };
    seen.add(st);
    const d = STATION_COST[st];
    let l = d.l;
    let g = d.plan && !this.sim.state.library.includes(d.plan) ? PLANS[d.plan].learnGold : 0;
    if (d.plan) l += PLANS[d.plan].learnTime;
    for (const n of d.needs) {
      const c = this.stationCost(n, seen);
      l += c.l;
      g += c.g;
    }
    return { l, g };
  }

  /** Mined items the plan will want, by chamber (one-time trips are judged against it). */
  demand = new Map<string, number>();

  /**
   * Pays for `need` if the pools allow, the cheapest way (labour + KAPPA × gold, one-time costs —
   * a chamber's first trip, a workshop — spread over what they will serve). Each item is sourced by
   * its cheapest open way; if the pools can't pay that, by gold (stores, the porters) or by labour.
   */
  pay(need: Need, tag: string): boolean {
    const ov = this.econ.overhead;
    const scale = 1 / this.econ.beta;
    type Way = { l: number; g: number; unlock?: string; station?: Station };
    const plans: { l: number; g: number } = { l: need.l, g: need.g };
    for (const p of need.plans) {
      if (this.h.known.includes(p)) continue;
      plans.l += PLANS[p].learnTime;
      if (!this.sim.state.library.includes(p)) plans.g += PLANS[p].learnGold;
    }
    const items = Object.entries(need.parts).filter(([, n]) => (n ?? 0) > 0) as [ItemId, number][];
    const options: { l: number; g: number; v: number; unlocks: Set<string>; stations: Set<Station> }[] = [];
    for (const mode of ['best', 'gold', 'labour'] as const) {
      let l = plans.l * ov;
      let g = plans.g;
      let v = l + KAPPA * g;
      const unlocks = new Set<string>();
      const stations = new Set<Station>();
      for (const [item, n] of items) {
        const all: Way[] = this.ways(item);
        const ways =
          mode === 'gold'
            ? all.filter((w) => w.g > 0)
            : mode === 'labour'
              ? all.filter((w) => w.g === 0)
              : all;
        const cost = (w: Way) => {
          let ol = 0;
          let og = 0;
          let ov1 = 0;
          if (w.unlock && !unlocks.has(w.unlock)) {
            const u = this.unlockCost(w.unlock);
            ol += u.l;
            og += u.g;
            ov1 += (u.l * ov + KAPPA * u.g) / Math.max(1, this.demand.get(w.unlock) ?? 1);
          }
          if (w.station && !stations.has(w.station)) {
            const s = this.stationCost(w.station);
            ol += s.l;
            og += s.g;
            ov1 += (s.l * ov + KAPPA * s.g) / 8;
          }
          return { l: (w.l * n + ol) * ov, g: w.g * n + og, v: (w.l * ov + KAPPA * w.g) * n + ov1 };
        };
        const pool = ways.length ? ways : all;
        // ways always contains the porter option, even when gathering/crafting is unavailable.
        let pick = pool[0]!;
        let pc = cost(pick);
        for (const w of pool.slice(1)) {
          const c = cost(w);
          if (c.v < pc.v) {
            pick = w;
            pc = c;
          }
        }
        l += pc.l;
        g += pc.g;
        v += pc.v;
        if (pick.unlock) unlocks.add(pick.unlock);
        if (pick.station) stations.add(pick.station);
      }
      options.push({ l: l * scale, g: g * scale, v, unlocks, stations });
    }
    let ok = options.filter((o) => o.l <= this.w.labour + 1e-9 && o.g <= this.w.gold() + 1e-9);
    let sold = 0;
    if (!ok.length) {
      // Short of gold with labour to spare: gather and sell for the rest.
      const gold = Math.max(0, this.w.gold());
      const viaSale = options
        .map((o) => ({ ...o, l: o.l + Math.max(0, o.g - gold) / SELL, sale: Math.max(0, o.g - gold) }))
        .filter((o) => o.l <= this.w.labour + 1e-9);
      if (!viaSale.length) return false;
      const b = viaSale.reduce((a, c) => (c.v + c.sale / SELL < a.v + a.sale / SELL ? c : a));
      sold = b.sale;
      ok = [b];
    }
    const best = ok.reduce((a, b) => (b.v < a.v ? b : a));
    if (sold > 0) this.w.spendGold(-sold);
    this.w.labour -= best.l;
    this.w.spendGold(best.g);
    this.spentL += best.l;
    this.spentG += best.g;
    const rec = (this.buys[tag] ??= [0, 0]);
    rec[0]++;
    rec[1] += best.l + KAPPA * best.g;
    for (const u of best.unlocks) {
      this.unlocked.add(u);
      if (UNLOCK[u]!.g > 0) this.postFound = true;
    }
    for (const st of best.stations) this.addStation(st);
    for (const p of need.plans) if (!this.h.known.includes(p)) this.h.known.push(p);
    return true;
  }

  private addStation(st: Station): void {
    this.stations.add(st);
    for (const n of STATION_COST[st].needs) this.addStation(n);
  }
}

/** What a build costs an efficient player, in labour-seconds (gold at KAPPA), mines and workshops already open. */
export function lseCost(parts: Parts, overhead: number): number {
  let v = overhead;
  for (const [it, n] of Object.entries(parts) as [ItemId, number][]) {
    const ways = [
      GATHER[it],
      CRAFT[it]?.l,
      SHOP[it] !== undefined ? SHOP_L + KAPPA * SHOP[it]! : undefined,
      KAPPA * partPrice(it),
    ].filter((x): x is number => x !== undefined);
    v += Math.min(...ways) * n;
  }
  return v;
}
