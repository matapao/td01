/** Building damage, destruction and the contribution of a hero crewing its wall-walk. */
import { OVER_WALL, classOf } from '../../content/heroes.ts';
import { sizeOf } from '../../content/structures.ts';
import type { HeroClass } from '../../content-types.ts';
import type { Building, Hero, Id } from '../../entity-types.ts';
import type { ItemId } from '../../item-data.ts';
import type { Sim } from '../../sim.ts';
import { occupyFootprint } from '../footprint.ts';
import { emptyBuilding } from '../rooms.ts';

/** The hero crewing tower `b` from the wall-walk, if anyone is (see heroes.postOf). */
export function crewOf(sim: Sim, b: Building): Hero | undefined {
  return sim.state.heroes.find((h) => h.post === b.id && !h.dead);
}

export function damageBuilding(sim: Sim, b: Building, amount: number, by: Id): void {
  if (b.hp <= 0 || !sim.alive(b.id)) return;
  // A Knight crewing it from the wall shields the crew.
  if (crewOf(sim, b)?.cls === 'tank') amount *= 1 - OVER_WALL.shield;
  b.hp -= amount;
  sim.emit('buildingHit', { building: b.id, amount, by });
  if (b.hp <= 0) destroyBuilding(sim, b);
}

/** A fallen building leaves salvage and returns its enchanted parts. */
export function destroyBuilding(sim: Sim, b: Building): void {
  b.hp = 0;
  for (const k in b.spent) {
    const n = Math.floor((b.spent[k as ItemId] ?? 0) * 0.3);
    for (let i = 0; i < n; i++) sim.spawnDrop(k as ItemId, b.x, b.z);
  }
  for (const g of b.gear) sim.spawnDrop(g.base, b.x, b.z, b.x, b.z, 0, g);
  if (b.site) {
    const site = sim.getAs(b.site, 'site');
    if (site) {
      for (const k in site.have)
        for (let i = 0; i < (site.have[k as ItemId] ?? 0); i++) sim.spawnDrop(k as ItemId, b.x, b.z);
      for (const g of site.sockets) sim.spawnDrop(g.base, b.x, b.z, b.x, b.z, 0, g);
      sim.remove(site.id);
    }
  }
  for (const u of sim.state.units) if (u.tower === b.id) sim.remove(u.id);
  for (const e of sim.state.enemies) if (e.siege === b.id) e.siege = 0;
  emptyBuilding(sim, b);
  occupyFootprint(sim, b.cx, b.cz, 0, sizeOf(b.kind));
  sim.remove(b.id);
  sim.emit('buildingDestroyed', { building: b.id, kind: b.kind, x: b.x, z: b.z });
}

/**
 * How a hero crewing a tower from the wall-walk lifts its archers: they shoot faster and further; the Warchief
 * drives them faster still, the Mage's enchantment hits harder (the Knight's shield: damageBuilding).
 */
export function crewBoost(h: { cls?: HeroClass } | undefined): {
  rate: number;
  range: number;
  damage: number;
} {
  if (!h) return { rate: 1, range: 0, damage: 1 };
  const cls = classOf(h).id;
  return {
    rate: 1 + OVER_WALL.rate + (cls === 'support' ? OVER_WALL.drive : 0),
    range: OVER_WALL.range,
    damage: cls === 'magic' ? 1 + OVER_WALL.enchant : 1,
  };
}
