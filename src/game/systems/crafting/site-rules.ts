/** Part requirements, learning costs and work rates shared by crafting operations. */
import type { Discipline, Parts, PlanId, StationKind, Step } from '../../content-types.ts';
import type { Hero, Site } from '../../entity-types.ts';
import { ITEMS } from '../../item-data.ts';
import type { ItemId } from '../../item-data.ts';
import { MASTERY } from '../../content/workshop.ts';
import { PLANS } from '../../content/plans.ts';
import type { Sim } from '../../sim.ts';

export const STATION_DISCIPLINE: Record<StationKind, Discipline> = {
  sawmill: 'carpentry',
  stonecutter: 'masonry',
  forge: 'smithing',
  anvil: 'smithing',
  arcanist: 'arcana',
};

export function needHammer(sim: Sim, h: Hero): boolean {
  if (sim.state.dev || h.tools.includes('hammer')) return true;
  sim.emit('denied', {
    hero: h.id,
    reason: "You need a builder's hammer — buy the Crafter Kit at the counter inside the shop",
  });
  return false;
}

export const BUYOUT_MARKUP = 1.3;

export function partPrice(item: ItemId): number {
  return Math.ceil(ITEMS[item].price * BUYOUT_MARKUP);
}

export function buyoutCost(site: Site): number {
  const missing = siteMissing(site);
  let cost = 0;
  for (const k in missing) cost += partPrice(k as ItemId) * (missing[k as ItemId] ?? 0);
  return cost;
}

export function planCost(plan: PlanId): number {
  const parts = PLANS[plan].parts;
  let cost = 0;
  for (const k in parts) cost += partPrice(k as ItemId) * (parts[k as ItemId] ?? 0);
  return cost;
}

export function buyOut(sim: Sim, h: Hero, site: Site): boolean {
  const cost = buyoutCost(site);
  if (cost <= 0) return true;
  if (!sim.pay(cost)) {
    sim.emit('denied', { hero: h.id, reason: `Not enough gold (${cost}g needed)` });
    return false;
  }
  const missing = siteMissing(site);
  for (const k in missing)
    site.have[k as ItemId] = (site.have[k as ItemId] ?? 0) + (missing[k as ItemId] ?? 0);
  sim.emit('boughtOut', { hero: h.id, site: site.id, cost, x: site.x, z: site.z });
  return true;
}

export function needOf(site: Site, item: ItemId): number {
  const socketed = site.sockets.filter((s) => s.base === item).length;
  return Math.max(0, (site.need[item] ?? 0) - (site.have[item] ?? 0) - socketed);
}

export function siteMissing(site: Site): Parts {
  const out: Parts = {};
  for (const k in site.need) {
    const n = needOf(site, k as ItemId);
    if (n > 0) out[k as ItemId] = n;
  }
  return out;
}

export function siteComplete(site: Site): boolean {
  for (const k in site.need) if (needOf(site, k as ItemId) > 0) return false;
  return true;
}

export function siteSteps(site: Site): Step[] {
  return PLANS[site.plan].steps;
}

export function studyTime(h: Hero, plan: PlanId): number {
  const p = PLANS[plan];
  const m = h.mastery[p.discipline];
  const top = Math.max(...Object.values(h.mastery));
  const t =
    p.learnTime *
    Math.max(0.4, 1 - MASTERY.learnDiscount * m) *
    (1 + MASTERY.crossPenalty * Math.max(0, top - m));
  return Math.max(2, t);
}

export function scrollPrice(h: Hero | undefined, plan: PlanId): number {
  const p = PLANS[plan];
  if (!h) return p.learnGold;
  return Math.round(p.learnGold * Math.max(0.5, 1 - MASTERY.learnDiscount * h.mastery[p.discipline]));
}

export function workRate(h: Hero, d: Discipline): number {
  return 1 + MASTERY.workBonus * h.mastery[d];
}
