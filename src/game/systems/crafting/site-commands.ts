/** Site placement, attachment plans, cancellation and enchanted part delivery. */
import type { Command } from '../../command-types.ts';
import type { GemPlan, TopPlan } from '../../content-types.ts';
import { ITEMS } from '../../item-data.ts';
import type { ItemId } from '../../item-data.ts';
import { MAX_GEM_LEVEL } from '../../content/tower-data.ts';
import { PLANS } from '../../content/plans.ts';
import type { Sim } from '../../sim.ts';
import type { Site } from '../../entity-types.ts';
import {
  basePlanFor,
  deviceBlocker,
  gemBlocker,
  gemLevel,
  nextTop,
  upgradeParts,
} from '../../content/tower-rules.ts';
import { buyOut, needOf, planCost, siteComplete } from './site-rules.ts';
import { cellCenter, outsideWalls } from '../../map.ts';
import { faceRoad, turnFor } from './orientation.ts';
import { forceCompleteSite, removeSite } from './site-completion.ts';
import { inReachOf } from '../hero/reach.ts';
import { isTower, sizeOf } from '../../content/structures.ts';
import { placementBlocker } from '../placement-rules.ts';
import { occupyFootprint as occupy } from '../footprint.ts';

export function applySiteCommand(sim: Sim, cmd: Command): void {
  const s = sim.state;
  switch (cmd.t) {
    case 'place': {
      const h = sim.getAs(cmd.hero, 'hero');
      const plan = PLANS[cmd.plan];
      if (!h || !plan || plan.type !== 'building') return;
      if (plan.building === 'tower' && !s.dev) {
        sim.emit('denied', {
          hero: h.id,
          reason: 'Build a tower kit at the workshop platform, then ship it from the overview post',
        });
        return;
      }
      if (!sim.knows(h, plan.id)) {
        sim.emit('denied', { hero: h.id, reason: `Learn the ${plan.name} plan first` });
        return;
      }
      const c = cellCenter(cmd.cx, cmd.cz);
      const why = placementBlocker(sim, cmd.cx, cmd.cz, sizeOf(plan.building), plan.building);
      if (why) {
        sim.emit('denied', { hero: h.id, reason: why, x: c.x, z: c.z });
        return;
      }
      if (cmd.buy && !sim.canPay(planCost(plan.id))) {
        sim.emit('denied', {
          hero: h.id,
          reason: `Not enough gold (${planCost(plan.id)}g needed)`,
          x: c.x,
          z: c.z,
        });
        return;
      }
      const site: Site = {
        id: sim.newId(),
        plan: plan.id,
        x: c.x,
        z: c.z,
        cx: cmd.cx,
        cz: cmd.cz,
        rot:
          cmd.rot !== undefined && Number.isFinite(cmd.rot)
            ? turnFor(cmd.rot, sizeOf(plan.building))
            : faceRoad(sim, c.x, c.z, sizeOf(plan.building) > 1),
        ...(cmd.rot !== undefined ? { turned: true } : {}),
        need: { ...plan.parts },
        have: {},
        step: 0,
        work: 0,
        building: 0,
        placedBy: h.id,
        sockets: [],
      };
      sim.add('site', site);
      occupy(sim, cmd.cx, cmd.cz, site.id, sizeOf(plan.building));
      sim.emit('sitePlaced', { site: site.id, plan: plan.id, x: site.x, z: site.z });
      // Dev mode: it stands at once.
      if (s.dev) forceCompleteSite(sim, site);
      else if (cmd.buy) buyOut(sim, h, site);
      return;
    }
    case 'buyout': {
      const h = sim.getAs(cmd.hero, 'hero');
      const site = sim.getAs(cmd.site, 'site');
      if (h && site) buyOut(sim, h, site);
      return;
    }
    case 'placeGem': {
      const h = sim.getAs(cmd.hero, 'hero');
      const plan = PLANS[cmd.plan] as GemPlan;
      const b = sim.getAs(cmd.building, 'building');
      if (!h || !b || !plan || plan.type !== 'gem' || !isTower(b.kind)) return;
      if (!sim.knows(h, plan.id)) {
        sim.emit('denied', { hero: h.id, reason: `Learn the ${plan.name} plan first` });
        return;
      }
      const why = b.site ? 'A gem is already being set into this tower' : gemBlocker(b.gems, plan.id);
      if (why) {
        sim.emit('denied', { hero: h.id, reason: why, x: b.x, z: b.z });
        return;
      }
      const site: Site = {
        id: sim.newId(),
        plan: plan.id,
        x: b.x,
        z: b.z,
        cx: b.cx,
        cz: b.cz,
        rot: b.rot,
        need: { ...plan.parts },
        have: {},
        step: 0,
        work: 0,
        building: b.id,
        placedBy: h.id,
        sockets: [],
      };
      sim.add('site', site);
      b.site = site.id;
      sim.emit('sitePlaced', { site: site.id, plan: plan.id, x: site.x, z: site.z });
      // Dev mode: the gem is in at once.
      if (s.dev) forceCompleteSite(sim, site);
      return;
    }
    case 'upgradeGem': {
      // Grow a set gem a level: more raw gems of its colour and its other parts, melted onto it.
      const h = sim.getAs(cmd.hero, 'hero');
      const b = sim.getAs(cmd.building, 'building');
      if (!h || !b || !b.gems.includes(cmd.gem)) return;
      const lv = gemLevel(b, cmd.gem);
      const deny = (reason: string) => sim.emit('denied', { hero: h.id, reason, x: b.x, z: b.z });
      if (lv >= MAX_GEM_LEVEL) return deny(`The ${PLANS[cmd.gem].name} is as great as it gets`);
      if (!sim.knows(h, cmd.gem)) return deny(`Learn the ${PLANS[cmd.gem].name} plan to cut it finer`);
      if (b.site) return deny('A gem is already being worked on this tower');
      const site: Site = {
        id: sim.newId(),
        plan: cmd.gem,
        x: b.x,
        z: b.z,
        cx: b.cx,
        cz: b.cz,
        rot: b.rot,
        need: upgradeParts(cmd.gem, lv + 1),
        have: {},
        step: 0,
        work: 0,
        building: b.id,
        placedBy: h.id,
        sockets: [],
        lv: lv + 1,
      };
      sim.add('site', site);
      b.site = site.id;
      sim.emit('sitePlaced', { site: site.id, plan: cmd.gem, x: site.x, z: site.z });
      if (s.dev) forceCompleteSite(sim, site);
      return;
    }
    case 'upgradeBuilding': {
      // An upgrade for a standing building: a plan placed on it, its parts brought, then built in.
      const h = sim.getAs(cmd.hero, 'hero');
      const b = sim.getAs(cmd.building, 'building');
      const plan = PLANS[cmd.plan];
      if (!h || !b || !plan || plan.type !== 'upgrade') return;
      const deny = (reason: string) => sim.emit('denied', { hero: h.id, reason, x: b.x, z: b.z });
      if (b.kind !== plan.target)
        return deny(`The ${plan.name} goes into a ${basePlanFor(plan.target).name}`);
      if (!sim.knows(h, plan.id)) return deny(`Learn the ${plan.name} plan first`);
      if (b.upgrades?.includes(plan.id)) return deny('It has one already');
      if (b.site) return deny('Finish the work on it first');
      const site: Site = {
        id: sim.newId(),
        plan: plan.id,
        x: b.x,
        z: b.z,
        cx: b.cx,
        cz: b.cz,
        rot: b.rot,
        need: { ...plan.parts },
        have: {},
        step: 0,
        work: 0,
        building: b.id,
        placedBy: h.id,
        sockets: [],
      };
      sim.add('site', site);
      b.site = site.id;
      sim.emit('sitePlaced', { site: site.id, plan: plan.id, x: site.x, z: site.z });
      if (s.dev) forceCompleteSite(sim, site);
      return;
    }
    case 'placeDevice': {
      // A device for an upper window: a plan placed on the tower, its parts brought, then built in.
      const h = sim.getAs(cmd.hero, 'hero');
      const b = sim.getAs(cmd.building, 'building');
      const plan = PLANS[cmd.plan];
      if (!h || !b || !plan || plan.type !== 'device' || !isTower(b.kind)) return;
      const deny = (reason: string) => sim.emit('denied', { hero: h.id, reason, x: b.x, z: b.z });
      if (!sim.knows(h, plan.id)) return deny(`Learn the ${plan.name} plan first`);
      const why = b.site ? 'Finish the work on this tower first' : deviceBlocker(b.devices ?? [], plan.id);
      if (why) return deny(why);
      const site: Site = {
        id: sim.newId(),
        plan: plan.id,
        x: b.x,
        z: b.z,
        cx: b.cx,
        cz: b.cz,
        rot: b.rot,
        need: { ...plan.parts },
        have: {},
        step: 0,
        work: 0,
        building: b.id,
        placedBy: h.id,
        sockets: [],
      };
      sim.add('site', site);
      b.site = site.id;
      sim.emit('sitePlaced', { site: site.id, plan: plan.id, x: site.x, z: site.z });
      if (s.dev) forceCompleteSite(sim, site);
      return;
    }
    case 'upgradeTop': {
      // The tower's next top: a plan placed on it, its parts brought, then built (like a gem).
      const h = sim.getAs(cmd.hero, 'hero');
      const b = sim.getAs(cmd.building, 'building');
      if (!h || !b || !isTower(b.kind)) return;
      const deny = (reason: string) => sim.emit('denied', { hero: h.id, reason, x: b.x, z: b.z });
      const id = nextTop(b);
      if (!id) return deny('Its top is as fine as it gets');
      if (!sim.knows(h, id)) return deny(`Learn the ${PLANS[id].name} plan first`);
      if (b.site) return deny('Finish the work on this tower first');
      const plan = PLANS[id] as TopPlan;
      const site: Site = {
        id: sim.newId(),
        plan: id,
        x: b.x,
        z: b.z,
        cx: b.cx,
        cz: b.cz,
        rot: b.rot,
        need: { ...plan.parts },
        have: {},
        step: 0,
        work: 0,
        building: b.id,
        placedBy: h.id,
        sockets: [],
        lv: plan.level,
      };
      sim.add('site', site);
      b.site = site.id;
      sim.emit('sitePlaced', { site: site.id, plan: id, x: site.x, z: site.z });
      if (s.dev) forceCompleteSite(sim, site);
      return;
    }
    case 'turnSite': {
      // A blueprint turns freely until it is built (a gem's site is part of its tower).
      const site = sim.getAs(cmd.site, 'site');
      const plan = site && PLANS[site.plan];
      if (!site || !plan || plan.type !== 'building' || site.building || !Number.isFinite(cmd.rot)) return;
      site.rot = turnFor(cmd.rot, sizeOf(plan.building));
      site.turned = true;
      return;
    }
    case 'cancelSite': {
      const site = sim.getAs(cmd.site, 'site');
      if (!site) return;
      for (const k in site.have)
        for (let i = 0; i < (site.have[k as ItemId] ?? 0); i++) sim.spawnDrop(k as ItemId, site.x, site.z);
      for (const inst of site.sockets) sim.spawnDrop(inst.base, site.x, site.z, site.x, site.z, 0, inst);
      removeSite(sim, site);
      sim.emit('siteCancelled', { site: site.id, refund: site.have });
      return;
    }
    case 'socket': {
      const h = sim.getAs(cmd.hero, 'hero');
      const site = sim.getAs(cmd.site, 'site');
      if (!h || !site) return;
      if (!inReachOf(h, site.x, site.z, 4.5)) {
        sim.emit('denied', {
          hero: h.id,
          reason: outsideWalls(site.x, site.z)
            ? 'Up onto the wall-walk first: it is worked over the wall'
            : 'Walk up to the site first',
          x: site.x,
          z: site.z,
        });
        return;
      }
      const idx = h.gear.findIndex((g) => g.uid === cmd.uid);
      if (idx < 0) return;
      const inst = h.gear[idx];
      if (!inst) return;
      if (!(site.need[inst.base] ?? 0)) {
        sim.emit('denied', { hero: h.id, reason: `This plan uses no ${ITEMS[inst.base].name}` });
        return;
      }
      if (needOf(site, inst.base) <= 0) {
        // Swap a plain part back out to make room for the enchanted one.
        if ((site.have[inst.base] ?? 0) <= 0) {
          sim.emit('denied', { hero: h.id, reason: 'Every slot already holds an enchanted part' });
          return;
        }
        site.have[inst.base] = (site.have[inst.base] ?? 0) - 1;
        if (sim.addToBag(h, inst.base, 1) < 1) sim.spawnDrop(inst.base, h.x, h.z, site.x, site.z, h.id);
      }
      h.gear.splice(idx, 1);
      site.sockets.push(inst);
      sim.emit('socketed', { hero: h.id, site: site.id, inst });
      if (siteComplete(site)) sim.emit('siteReady', { site: site.id });
      return;
    }
  }
}
