/** Standing-building management and attachment salvage. */
import type { Command } from '../../command-types.ts';
import type { ItemId } from '../../item-data.ts';
import { PLANS } from '../../content/plans.ts';
import { SALVAGE, sizeOf } from '../../content/structures.ts';
import type { Sim } from '../../sim.ts';
import { dist } from '../../../core/math.ts';
import { emptyBuilding } from '../rooms.ts';
import { nearestRoad } from './orientation.ts';
import { removeGems, removeSite } from './site-completion.ts';
import { occupyFootprint as occupy } from '../footprint.ts';

export function applyBuildingCommand(sim: Sim, cmd: Command): void {
  const s = sim.state;
  switch (cmd.t) {
    case 'removeDevice': {
      const h = sim.getAs(cmd.hero, 'hero');
      const b = sim.getAs(cmd.building, 'building');
      if (!h || !b || !b.devices?.includes(cmd.device)) return;
      if (b.site)
        return void sim.emit('denied', {
          hero: h.id,
          reason: 'Finish (or cancel) the work on this tower first',
          x: b.x,
          z: b.z,
        });
      // Half its parts come back, like anything taken apart.
      const plan = PLANS[cmd.device];
      for (const k in plan.parts) {
        const n = Math.floor((plan.parts[k as ItemId] ?? 0) * SALVAGE);
        b.spent[k as ItemId] = Math.max(0, (b.spent[k as ItemId] ?? 0) - (plan.parts[k as ItemId] ?? 0));
        for (let i = 0; i < n; i++) sim.spawnDrop(k as ItemId, b.x, b.z);
      }
      b.devices = b.devices.filter((d) => d !== cmd.device);
      sim.emit('devicesRemoved', { building: b.id, devices: [cmd.device], x: b.x, z: b.z });
      return;
    }
    case 'demolish': {
      const b = sim.getAs(cmd.building, 'building');
      if (!b || b.kind === 'shop') return;
      emptyBuilding(sim, b);
      for (const k in b.spent) {
        const n = Math.floor((b.spent[k as ItemId] ?? 0) * SALVAGE);
        for (let i = 0; i < n; i++) sim.spawnDrop(k as ItemId, b.x, b.z);
      }
      for (const g of b.gear) sim.spawnDrop(g.base, b.x, b.z, b.x, b.z, 0, g);
      if (b.site) {
        const site = sim.getAs(b.site, 'site');
        if (site) removeSite(sim, site);
      }
      for (const u of s.units) if (u.tower === b.id) sim.remove(u.id);
      occupy(sim, b.cx, b.cz, 0, sizeOf(b.kind));
      sim.remove(b.id);
      sim.emit('demolished', { building: b.id, kind: b.kind, x: b.x, z: b.z });
      return;
    }
    case 'removeGem': {
      const h = sim.getAs(cmd.hero, 'hero');
      const b = sim.getAs(cmd.building, 'building');
      if (!h || !b || !b.gems.includes(cmd.gem)) return;
      if (b.site) {
        sim.emit('denied', {
          hero: h.id,
          reason: 'Finish (or cancel) the gem being set first',
          x: b.x,
          z: b.z,
        });
        return;
      }
      removeGems(sim, b, [cmd.gem]);
      return;
    }
    case 'mode': {
      const b = sim.getAs(cmd.building, 'building');
      if (b) b.mode = cmd.mode;
      return;
    }
    case 'rally': {
      const b = sim.getAs(cmd.building, 'building');
      if (!b || !b.stats?.rally) return;
      const p = nearestRoad(sim, cmd.x, cmd.z);
      if (dist(p.x, p.z, b.x, b.z) > b.stats.rally + 0.5) {
        sim.emit('denied', { hero: 0, reason: 'Rally point out of range', x: cmd.x, z: cmd.z });
        return;
      }
      b.rallyX = p.x;
      b.rallyZ = p.z;
      return;
    }
  }
}
