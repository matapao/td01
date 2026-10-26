/** Station tray batches and weapon reforging share one synchronous work lifecycle. */
import type { Building, Hero } from '../../entity-types.ts';
import type { ItemId } from '../../item-data.ts';
import { PERFECT_BONUS_CHANCE, STATIONS, STATION_TRAY, WORK, stationInputs } from '../../content/workshop.ts';
import { POWER } from '../../content/structures.ts';
import type { Parts, StationKind, Step } from '../../content-types.ts';
import { REFORGE, maxWeaponTier, weaponTier } from '../../content/equipment.ts';
import type { Sim } from '../../sim.ts';
import { reforgeBlocker, reforgeCost } from '../reforge-rules.ts';

export function stationSteps(b: Building): Step[] {
  // A weapon on the anvil is heated and hammered out instead of the usual batch.
  return b.forgeFor ? REFORGE.steps : STATIONS[b.kind as StationKind].steps;
}

export function loadStation(sim: Sim, h: Hero, b: Building): void {
  for (const item of stationInputs(b.kind as StationKind)) {
    const room = STATION_TRAY - (b.input[item] ?? 0);
    const n = sim.takeFromBag(h, item, room);
    if (n > 0) {
      b.input[item] = (b.input[item] ?? 0) + n;
      sim.emit('delivered', { hero: h.id, target: b.id, item, count: n });
    }
  }
}

export function collectOutput(sim: Sim, h: Hero, b: Building): void {
  for (const k in b.output) {
    const item = k as ItemId;
    const n = sim.addToBag(h, item, b.output[item] ?? 0);
    if (n > 0) {
      b.output[item] = (b.output[item] ?? 0) - n;
      if (!b.output[item]) delete b.output[item];
      sim.emit('collected', { hero: h.id, station: b.id, item, count: n });
    }
  }
}

function outputCount(b: Building): number {
  let n = 0;
  for (const k in b.output) n += b.output[k as ItemId] ?? 0;
  return n;
}

export function tryStartBatch(sim: Sim, b: Building): void {
  if (b.busy || outputCount(b) >= STATION_TRAY) return;
  const recipes = STATIONS[b.kind as StationKind].recipes;
  const ri = recipes.findIndex((r) =>
    Object.keys(r.input).every((k) => (b.input[k as ItemId] ?? 0) >= (r.input[k as ItemId] ?? 0)),
  );
  if (ri < 0) return;
  // ri came from findIndex on this unchanged recipe array.
  const r = recipes[ri]!;
  for (const k in r.input) {
    b.input[k as ItemId] = (b.input[k as ItemId] ?? 0) - (r.input[k as ItemId] ?? 0);
    if (!b.input[k as ItemId]) delete b.input[k as ItemId];
  }
  b.busy = true;
  b.recipe = ri;
  b.step = 0;
  b.work = 0;
  b.perfects = 0;
  sim.emit('batchStarted', { station: b.id });
}

// Station steps advance synchronously inside this length-bounded loop.
export function addStationWork(sim: Sim, b: Building, amount: number): void {
  const steps = stationSteps(b);
  b.work += amount * (b.powered ? POWER.stationBoost : 1);
  while (b.busy && b.step < steps.length && b.work >= steps[b.step]!.work) {
    b.work -= steps[b.step]!.work;
    b.step++;
    sim.emit('stepDone', { target: b.id, step: b.step, of: steps.length });
  }
  if (b.busy && b.step >= steps.length && b.forgeFor) {
    finishReforge(sim, b);
    return;
  }
  if (b.busy && b.step >= steps.length) {
    const recipe = STATIONS[b.kind as StationKind].recipes[b.recipe];
    if (!recipe) throw new Error(`Unknown station recipe ${b.kind}:${b.recipe}`);
    const out: Parts = { ...recipe.output };
    const perfect = b.perfects > 0;
    const bonus = perfect && sim.rng.chance(PERFECT_BONUS_CHANCE);
    if (bonus) {
      const first = Object.keys(out)[0] as ItemId;
      out[first] = (out[first] ?? 0) + 1;
    }
    for (const k in out) b.output[k as ItemId] = (b.output[k as ItemId] ?? 0) + (out[k as ItemId] ?? 0);
    b.busy = false;
    b.step = 0;
    b.work = 0;
    sim.state.stats.crafted++;
    sim.emit('crafted', { station: b.id, output: out, perfect, bonus });
    tryStartBatch(sim, b);
  }
}

export function startReforge(sim: Sim, h: Hero, b: Building): void {
  const why = reforgeBlocker(sim, h, b);
  if (why) {
    sim.emit('denied', { hero: h.id, reason: why, x: b.x, z: b.z });
    return;
  }
  // The blocker above rejects the final tier, so the next weapon cost exists.
  const cost = reforgeCost(h)!;
  // A weapon comes first: a batch under way is set aside (its parts back on the tray, to be made after).
  if (b.busy) {
    const recipe = STATIONS[b.kind as StationKind].recipes[b.recipe];
    for (const k in recipe?.input ?? {})
      b.input[k as ItemId] = (b.input[k as ItemId] ?? 0) + (recipe!.input[k as ItemId] ?? 0);
  }
  if (!sim.state.dev) {
    for (const k in cost) {
      const item = k as ItemId;
      const left = (cost[item] ?? 0) - sim.takeFromBag(h, item, cost[item] ?? 0);
      if (left > 0) {
        b.input[item] = (b.input[item] ?? 0) - left;
        if (!b.input[item]) delete b.input[item];
      }
    }
  }
  b.busy = true;
  b.forgeFor = h.id;
  b.recipe = 0;
  b.step = 0;
  b.work = 0;
  b.perfects = 0;
  h.task = { k: 'work', target: b.id };
  h.path = [];
  h.pathGoal = null;
  sim.emit('reforgeStarted', { hero: h.id, station: b.id, tier: weaponTier(h) + 1 });
}

function finishReforge(sim: Sim, b: Building): void {
  const h = sim.getAs(b.forgeFor ?? 0, 'hero');
  b.busy = false;
  b.forgeFor = 0;
  b.step = 0;
  b.work = 0;
  b.perfects = 0;
  if (h) {
    h.weaponTier = Math.min(maxWeaponTier('tank'), (h.weaponTier ?? 0) + 1);
    sim.emit('reforged', { hero: h.id, station: b.id, tier: h.weaponTier, x: b.x, z: b.z });
  }
  tryStartBatch(sim, b);
}

export function updateStations(sim: Sim, dt: number): void {
  for (const b of sim.state.buildings) {
    if (!(b.kind in STATIONS)) continue;
    if (!b.busy) tryStartBatch(sim, b);
    if (b.busy && b.workedAt !== sim.state.tick) addStationWork(sim, b, WORK.stationIdle * dt);
  }
}
