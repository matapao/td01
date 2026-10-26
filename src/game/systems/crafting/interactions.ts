/** Arrival routing and deliveries into sites, stations, shops and storage. */
import type { Hero, Site } from '../../entity-types.ts';
import type { Id } from '../../entity-types.ts';
import type { ItemId } from '../../item-data.ts';
import { STATIONS } from '../../content/workshop.ts';
import type { Sim } from '../../sim.ts';
import { boardLift } from '../mining.ts';
import { collectOutput, loadStation, tryStartBatch } from './stations.ts';
import { depositAll } from './storage.ts';
import { gateArrive } from '../wall.ts';
import { insideOf, walkIntoBuilding } from '../rooms.ts';
import { nearStore } from './trade.ts';
import { needHammer, needOf, siteComplete } from './site-rules.ts';
import { pickUp } from './resources.ts';
import { repairMaterial } from './repair.ts';

export function interactArrive(sim: Sim, h: Hero, target: Id): void {
  const ent = sim.get(target);
  h.task = { k: 'idle' };
  if (!ent) return;
  switch (ent.type) {
    case 'drop':
      pickUp(sim, h, ent.e.id);
      return;
    case 'chest': {
      const c = ent.e;
      if (c.opened) return;
      c.opened = true;
      sim.emit('chestOpened', { chest: c.id, hero: h.id, loot: c.loot, x: c.x, z: c.z });
      sim.grantLoot(c.loot, c.x, c.z, h.id);
      sim.dropGear(c.x, c.z, c.golden ? 2 : 1);
      return;
    }
    case 'site': {
      const site = ent.e;
      if (site.delivery) return;
      deliverToSite(sim, h, site);
      if (siteComplete(site) && needHammer(sim, h)) h.task = { k: 'work', target: site.id };
      return;
    }
    case 'building': {
      const b = ent.e;
      if (b.site) {
        const site = sim.getAs(b.site, 'site');
        if (site) {
          deliverToSite(sim, h, site);
          if (siteComplete(site) && needHammer(sim, h)) h.task = { k: 'work', target: site.id };
          return;
        }
      }
      if (b.hp < b.maxHp && sim.state.dev) {
        // Dev mode: good as new, at once.
        const amount = b.maxHp - b.hp;
        b.hp = b.maxHp;
        sim.emit('repaired', { building: b.id, amount, hero: h.id });
        return;
      }
      if (b.hp < b.maxHp) {
        if (b.repairBuf > 0 || repairMaterial(h)) {
          if (needHammer(sim, h)) h.task = { k: 'work', target: b.id };
          return;
        }
        if (!(b.kind in STATIONS)) {
          sim.emit('denied', {
            hero: h.id,
            reason: 'Bring wood, stone, planks or blocks to repair it',
            x: b.x,
            z: b.z,
          });
          return;
        }
      }
      // A building you can walk into: from outside, its door takes you in — the work is done inside.
      if (b.interior !== undefined && !insideOf(sim, h, b)) {
        walkIntoBuilding(sim, h, b);
        return;
      }
      if (b.kind === 'shop') {
        if (nearStore(sim, h, 'market')) sim.emit('shopOpen', { hero: h.id, store: 'market' });
        return;
      }
      if (b.kind in STATIONS) {
        collectOutput(sim, h, b);
        loadStation(sim, h, b);
        tryStartBatch(sim, b);
        if (b.busy) h.task = { k: 'work', target: b.id };
      }
      return;
    }
    case 'poi': {
      const p = ent.e;
      if (p.kind === 'gate') {
        gateArrive(sim, h, p.id);
        return;
      }
      if (p.kind === 'mine' || p.kind === 'lift') {
        boardLift(sim, h, p.mine ?? 0, p.kind === 'mine');
        return;
      }
      if (p.kind === 'keep') {
        if (sim.bagCount(h) > 0) depositAll(sim, h);
        sim.emit('storageOpen', { hero: h.id });
      } else if (p.store && sim.state.discovered.includes(p.store))
        sim.emit('shopOpen', { hero: h.id, store: p.store });
      return;
    }
    default:
      return;
  }
}

function deliverToSite(sim: Sim, h: Hero, site: Site): void {
  let any = false;
  for (const k in site.need) {
    const item = k as ItemId;
    const n = sim.takeFromBag(h, item, needOf(site, item));
    if (n > 0) {
      site.have[item] = (site.have[item] ?? 0) + n;
      sim.emit('delivered', { hero: h.id, target: site.id, item, count: n });
      any = true;
    }
  }
  // Out of plain parts? Enchanted ones of the right kind go in too.
  for (let i = h.gear.length - 1; i >= 0; i--) {
    // Reverse traversal removes only its current dense gear slot.
    const inst = h.gear[i]!;
    if (needOf(site, inst.base) <= 0) continue;
    h.gear.splice(i, 1);
    site.sockets.push(inst);
    sim.emit('socketed', { hero: h.id, site: site.id, inst });
    any = true;
  }
  if (any && siteComplete(site)) sim.emit('siteReady', { site: site.id });
  if (!any && !siteComplete(site))
    sim.emit('denied', { hero: h.id, reason: 'You carry none of the parts it needs', x: site.x, z: site.z });
}
