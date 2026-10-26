/** Keep storage transfers and deliberate item drops. */
import type { Command } from '../../command-types.ts';
import type { Hero } from '../../entity-types.ts';
import type { ItemId } from '../../item-data.ts';
import { MAP } from '../../map.ts';
import type { Parts } from '../../content-types.ts';
import type { Sim } from '../../sim.ts';
import { dist } from '../../../core/math.ts';

function nearKeep(_sim: Sim, h: Hero): boolean {
  return (
    dist(h.x, h.z, MAP.storehouse.x, MAP.storehouse.z) < 6 || dist(h.x, h.z, MAP.keep.x, MAP.keep.z) < 10
  );
}

export function depositAll(sim: Sim, h: Hero): void {
  const parts: Parts = {};
  for (const k in h.bag) {
    const n = h.bag[k as ItemId] ?? 0;
    if (n <= 0) continue;
    sim.state.storage[k as ItemId] = (sim.state.storage[k as ItemId] ?? 0) + n;
    parts[k as ItemId] = n;
  }
  h.bag = {};
  sim.emit('deposited', { hero: h.id, parts });
}

export function applyStorageCommand(sim: Sim, cmd: Command): void {
  const s = sim.state;
  switch (cmd.t) {
    case 'deposit': {
      const h = sim.getAs(cmd.hero, 'hero');
      if (!h || !nearKeep(sim, h)) return;
      depositAll(sim, h);
      return;
    }
    case 'withdraw': {
      const h = sim.getAs(cmd.hero, 'hero');
      if (!h || !nearKeep(sim, h)) return;
      const have = s.storage[cmd.item] ?? 0;
      const n = Math.min(have, cmd.count, sim.bagSpace(h, cmd.item));
      if (n <= 0) return;
      s.storage[cmd.item] = have - n;
      if (!s.storage[cmd.item]) delete s.storage[cmd.item];
      sim.addToBag(h, cmd.item, n);
      return;
    }
    case 'depositGear': {
      const h = sim.getAs(cmd.hero, 'hero');
      if (!h || !nearKeep(sim, h)) return;
      const idx = h.gear.findIndex((g) => g.uid === cmd.uid);
      if (idx >= 0) s.storageGear.push(h.gear.splice(idx, 1)[0]!);
      return;
    }
    case 'withdrawGear': {
      const h = sim.getAs(cmd.hero, 'hero');
      if (!h || !nearKeep(sim, h) || sim.bagFree(h) <= 0) return;
      const idx = s.storageGear.findIndex((g) => g.uid === cmd.uid);
      if (idx >= 0) h.gear.push(s.storageGear.splice(idx, 1)[0]!);
      return;
    }
    case 'dropItem': {
      const h = sim.getAs(cmd.hero, 'hero');
      if (!h) return;
      const n = sim.takeFromBag(h, cmd.item, cmd.count);
      for (let i = 0; i < n; i++) sim.spawnDrop(cmd.item, h.x, h.z, h.x, h.z, -1);
      return;
    }
    case 'dropGear': {
      const h = sim.getAs(cmd.hero, 'hero');
      if (!h) return;
      const idx = h.gear.findIndex((g) => g.uid === cmd.uid);
      if (idx < 0) return;
      // A successful findIndex above identifies the element removed synchronously here.
      const inst = h.gear.splice(idx, 1)[0]!;
      sim.spawnDrop(inst.base, h.x, h.z, h.x, h.z, -1, inst);
      return;
    }
  }
}
