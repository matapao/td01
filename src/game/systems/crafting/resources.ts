/** Dropped-item collection and planted-tree regrowth. */
import { ECONOMY } from '../../content/world-rules.ts';
import { GRID_W, MAP, onWall, outsideWalls } from '../../map.ts';
import type { Hero } from '../../entity-types.ts';
import type { Id } from '../../entity-types.ts';
import type { ItemId } from '../../item-data.ts';
import type { ItemInstance } from '../../loot-types.ts';
import { OVER_WALL } from '../../content/heroes.ts';
import type { Sim } from '../../sim.ts';
import { dist } from '../../../core/math.ts';

export function pickUp(sim: Sim, h: Hero, dropId: Id): boolean {
  const d = sim.getAs(dropId, 'drop');
  if (!d) return false;
  if (d.item === 'gold') {
    sim.state.gold += d.amount;
    sim.remove(d.id);
    sim.emit('pickedUp', {
      hero: h.id,
      drop: d.id,
      item: 'gold',
      amount: d.amount,
      inst: null,
      x: d.x,
      z: d.z,
    });
    return true;
  }
  if (d.inst ? sim.bagFree(h) < 1 : sim.bagSpace(h, d.item as ItemId) < 1) {
    sim.emit('bagFull', { hero: h.id });
    return false;
  }
  if (d.inst) h.gear.push(d.inst as ItemInstance);
  else sim.addToBag(h, d.item, 1);
  sim.remove(d.id);
  sim.emit('pickedUp', { hero: h.id, drop: d.id, item: d.item, amount: 1, inst: d.inst, x: d.x, z: d.z });
  return true;
}

export function updateDrops(sim: Sim, dt: number): void {
  const s = sim.state;
  for (const d of s.drops) {
    d.t += dt;
    // Enchanted parts never fade; everything else does eventually.
    if (!d.inst && d.t > ECONOMY.dropLifetime) {
      sim.remove(d.id);
      continue;
    }
    if (d.t < 0.35) continue;
    for (const h of s.heroes) {
      if (h.dead || h.task.k === 'study') continue;
      if (d.owner === -1 && d.t < 3) continue;
      if (d.owner > 0 && d.owner !== h.id && d.t < 1.5) continue;
      // Out on the field, the spoils come up over the wall to a hero on the walk within reach.
      const r = outsideWalls(d.x, d.z)
        ? onWall(h.x, h.z)
          ? OVER_WALL.haul
          : 0
        : d.item === 'gold'
          ? ECONOMY.goldPickup
          : 1.7;
      const fits = d.item === 'gold' || (d.inst ? sim.bagFree(h) > 0 : sim.bagSpace(h, d.item as ItemId) > 0);
      if (dist(h.x, h.z, d.x, d.z) < r && fits) {
        pickUp(sim, h, d.id);
        break;
      }
    }
  }
}

export function updateNodes(sim: Sim, dt: number): void {
  for (const n of sim.state.nodes) {
    if (n.amount > 0) continue;
    if (n.kind === 'tree' && !n.planted) continue;
    if (n.kind !== 'tree') continue;
    n.regrowT -= dt;
    // A stump something has been built over stays a stump.
    if (
      n.regrowT <= 0 &&
      sim.state.occupied[Math.floor(n.z - MAP.minZ) * GRID_W + Math.floor(n.x - MAP.minX)]
    )
      n.regrowT = 30;
    if (n.regrowT <= 0) {
      n.amount = n.max;
      n.planted = false;
      n.prepared = false;
      sim.emit('nodeRegrown', { node: n.id });
    }
  }
}
