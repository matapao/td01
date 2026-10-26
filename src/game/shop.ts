/** The shop's growing catalogue, shared by the window and authoritative purchase checks. */
import { STORES, type ItemId, type PlanId, type StoreId } from './content.ts';
import { valeAge, type AgeId, type RoadState } from './road.ts';

/** Material trading and research stock are deferred. The current shop only supplies durable utility. */
export const SHOP_STOCK: { age: AgeId; goods: ItemId[]; scrolls: PlanId[] }[] = [];

export function shopCatalogue(id: StoreId, road?: RoadState) {
  const age = valeAge(road ?? { done: [], best: {} });
  if (id !== 'market') return { ...STORES[id], age, next: undefined };
  return {
    ...STORES[id],
    age,
    goods: [] as ItemId[],
    scrolls: [] as PlanId[],
    next: undefined as undefined | { name: string; goods: ItemId[]; scrolls: PlanId[] },
  };
}
