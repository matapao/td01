/** Repair material selection and buffered building maintenance. */
import type { Building, Hero } from '../../entity-types.ts';
import type { ItemId } from '../../item-data.ts';
import { REPAIR } from '../../content/structures.ts';
import type { Sim } from '../../sim.ts';

export function repairMaterial(h: Hero): ItemId | null {
  for (const m of REPAIR.materials) if ((h.bag[m] ?? 0) > 0) return m;
  return null;
}

export function isRepairing(h: Hero, b: Building): boolean {
  return !b.site && b.hp < b.maxHp && (b.repairBuf > 0 || !!repairMaterial(h));
}

export function repairWork(sim: Sim, h: Hero, b: Building, amount: number): boolean {
  let left = amount;
  while (left > 0 && b.hp < b.maxHp) {
    if (b.repairBuf <= 0) {
      const m = repairMaterial(h);
      if (!m) break;
      sim.takeFromBag(h, m, 1);
      b.repairBuf += m === 'planks' || m === 'blocks' ? REPAIR.processed : REPAIR.raw;
    }
    const heal = Math.min(left, b.repairBuf, b.maxHp - b.hp);
    b.hp += heal;
    b.repairBuf -= heal;
    left -= heal;
    if (heal <= 0) break;
  }
  if (amount - left > 0) sim.emit('repaired', { building: b.id, amount: amount - left, hero: h.id });
  return b.hp < b.maxHp && (b.repairBuf > 0 || !!repairMaterial(h));
}
