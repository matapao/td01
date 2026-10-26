/** Hands-on crafting progress and the read-only action description. */
import type { ActionKind, StationKind } from '../../content-types.ts';
import type { Hero, Site } from '../../entity-types.ts';
import type { Id } from '../../entity-types.ts';
import { PLANS } from '../../content/plans.ts';
import { REPAIR } from '../../content/structures.ts';
import { STATIONS, WORK } from '../../content/workshop.ts';
import { STATION_DISCIPLINE, siteComplete, siteSteps, workRate } from './site-rules.ts';
import type { Sim } from '../../sim.ts';
import { addStationWork, stationSteps, tryStartBatch } from './stations.ts';
import { completeSite } from './site-completion.ts';
import { gateRammed, mendGate } from '../wall.ts';
import { isRepairing, repairWork } from './repair.ts';

export function workTick(sim: Sim, h: Hero, target: Id, dt: number): boolean {
  const ent = sim.get(target);
  if (!ent) return false;
  if (ent.type === 'site') {
    const site = ent.e;
    if (site.delivery) return false;
    if (!siteComplete(site)) return false;
    addSiteWork(sim, site, WORK.heroPassive * workRate(h, PLANS[site.plan].discipline) * dt);
    return sim.alive(site.id);
  }
  if (ent.type === 'building' && isRepairing(h, ent.e)) {
    return repairWork(sim, h, ent.e, WORK.heroPassive * REPAIR.passive * dt);
  }
  // Mending the gate.
  if (ent.type === 'poi' && ent.e.kind === 'gate')
    return mendGate(sim, h, WORK.heroPassive * (gateRammed(sim) ? REPAIR.gatePassive : REPAIR.passive) * dt);
  if (ent.type === 'building' && ent.e.kind in STATIONS) {
    const b = ent.e;
    if (!b.busy) tryStartBatch(sim, b);
    if (!b.busy) return false;
    b.workedAt = sim.state.tick;
    addStationWork(sim, b, WORK.heroPassive * workRate(h, STATION_DISCIPLINE[b.kind as StationKind]) * dt);
    return true;
  }
  return false;
}

export function applyBeat(sim: Sim, h: Hero, quality: 0 | 1 | 2): void {
  if (h.task.k !== 'work' || h.beatCd > 0) return;
  const ent = sim.get(h.task.target);
  if (!ent) return;
  h.beatCd = 0.16;
  const add = quality === 2 ? WORK.perfect : quality === 1 ? WORK.good : WORK.miss;
  if (quality === 2) sim.state.stats.perfects++;
  if (ent.type === 'building' && isRepairing(h, ent.e)) {
    sim.emit('workBeat', { hero: h.id, target: ent.e.id, quality, action: 'hammer' });
    repairWork(sim, h, ent.e, add * REPAIR.beat);
    h.animT = 0;
    return;
  }
  if (ent.type === 'poi' && ent.e.kind === 'gate') {
    sim.emit('workBeat', { hero: h.id, target: ent.e.id, quality, action: 'hammer' });
    mendGate(sim, h, add * (gateRammed(sim) ? REPAIR.gateBeat : REPAIR.beat));
    h.animT = 0;
    return;
  }
  if (ent.type === 'site') {
    const site = ent.e;
    if (site.delivery) return;
    if (!siteComplete(site)) return;
    const step = siteSteps(site)[site.step];
    if (!step) return;
    sim.emit('workBeat', { hero: h.id, target: site.id, quality, action: step.action });
    addSiteWork(sim, site, add * workRate(h, PLANS[site.plan].discipline));
  } else if (ent.type === 'building' && ent.e.busy) {
    const b = ent.e;
    const step = stationSteps(b)[b.step];
    if (!step) return;
    if (quality === 2) b.perfects++;
    sim.emit('workBeat', { hero: h.id, target: b.id, quality, action: step.action });
    addStationWork(sim, b, add * workRate(h, STATION_DISCIPLINE[b.kind as StationKind]));
  }
  h.animT = 0;
}

// Site steps advance synchronously inside this length-bounded loop.
function addSiteWork(sim: Sim, site: Site, amount: number): void {
  const steps = siteSteps(site);
  site.work += amount;
  while (site.step < steps.length && site.work >= steps[site.step]!.work) {
    site.work -= steps[site.step]!.work;
    site.step++;
    sim.emit('stepDone', { target: site.id, step: site.step, of: steps.length });
  }
  if (site.step >= steps.length) completeSite(sim, site);
}

export function workAction(
  sim: Sim,
  h: Hero,
): { action: ActionKind; label: string; progress: number; target: Id } | null {
  if (h.task.k !== 'work') return null;
  const ent = sim.get(h.task.target);
  if (!ent) return null;
  if (ent.type === 'site') {
    const steps = siteSteps(ent.e);
    const st = steps[ent.e.step];
    if (!st || !siteComplete(ent.e)) return null;
    return {
      action: st.action,
      label: st.label,
      progress: (ent.e.step + ent.e.work / st.work) / steps.length,
      target: ent.e.id,
    };
  }
  if (ent.type === 'poi' && ent.e.kind === 'gate') {
    const g = sim.state.gate;
    return g.hp < g.maxHp
      ? { action: 'hammer', label: 'Mend the gate', progress: g.hp / g.maxHp, target: ent.e.id }
      : null;
  }
  if (ent.type === 'building') {
    const b = ent.e;
    if (isRepairing(h, b))
      return { action: 'hammer', label: 'Repair', progress: b.hp / b.maxHp, target: b.id };
    if (b.busy) {
      const steps = stationSteps(b);
      const st = steps[b.step];
      if (!st) return null;
      return {
        action: st.action,
        label: st.label,
        progress: (b.step + b.work / st.work) / steps.length,
        target: b.id,
      };
    }
  }
  return null;
}
