/** Reforge costs and authoritative eligibility checks, shared with the action UI. */
import type { Sim } from '../sim.ts';
import type { Hero, Building } from '../entity-types.ts';
import {
  WEAPONS,
  STATIONS,
  ITEMS,
  maxWeaponTier,
  weaponTier,
  sizeOf,
  type Parts,
  type ItemId,
  type StationKind,
} from '../content.ts';
import { insideOf } from './rooms.ts';
import { dist } from '../../core/math.ts';
/** What reforging a hero's class weapon one tier up costs (null: it is as good as it gets). */
export function reforgeCost(h: Hero): Parts | null {
  const tier = weaponTier(h);
  return tier < maxWeaponTier(h.cls) ? WEAPONS[h.cls].tiers[tier + 1]!.cost : null;
}

/** What lies on an anvil for a reforge to use: its input tray, and the parts of a batch under way (set aside for a weapon). */
function onAnvil(b: Building): Parts {
  const out: Parts = { ...b.input };
  const recipe = b.busy && !b.forgeFor ? STATIONS[b.kind as StationKind]?.recipes[b.recipe] : undefined;
  for (const k in recipe?.input ?? {})
    out[k as ItemId] = (out[k as ItemId] ?? 0) + (recipe!.input[k as ItemId] ?? 0);
  return out;
}

/** What of a reforge's parts is still missing — counting what the hero carries and what lies on the anvil. */
export function reforgeMissing(h: Hero, b: Building | null, cost: Parts): Parts {
  const tray = b ? onAnvil(b) : {};
  const out: Parts = {};
  for (const k in cost) {
    const item = k as ItemId;
    const n = (cost[item] ?? 0) - (h.bag[item] ?? 0) - (tray[item] ?? 0);
    if (n > 0) out[item] = n;
  }
  return out;
}

/** Why hero `h` can't put its weapon on anvil `b` now (null: it can). */
export function reforgeBlocker(sim: Sim, h: Hero, b: Building): string | null {
  if (b.kind !== 'anvil') return "Weapons are reforged at the Blacksmith's anvil";
  if (h.dead) return 'Not while you are down';
  const cost = reforgeCost(h);
  if (!cost) return `Your ${WEAPONS[h.cls].tiers[weaponTier(h)]!.name} is as fine as a smith can make it`;
  if (sim.state.buildings.some((o) => o.forgeFor === h.id)) return 'Your weapon is on the anvil already';
  if (b.forgeFor) return "Someone else's weapon is on the anvil";
  const inside =
    b.interior !== undefined ? insideOf(sim, h, b) : dist(h.x, h.z, b.x, b.z) < sizeOf(b.kind) / 2 + 2;
  if (!inside) return 'Go in to the anvil — it stands inside the smithy';
  if (sim.state.dev) return null;
  const missing = reforgeMissing(h, b, cost);
  const first = Object.keys(missing)[0] as ItemId | undefined;
  return first
    ? `Bring ${missing[first]} more ${ITEMS[first].name}${Object.keys(missing).length > 1 ? ' (and the rest)' : ''}`
    : null;
}
