/**
 * Power and light. The electric grid: generators (the repaired watermill) feed poles; a pole
 * carries power on to any pole within POWER.link m; every building within POWER.reach m of a live
 * pole or generator is on the grid. Poles stand in town and up on the wall-walk; beyond the wall
 * the towers carry the line on themselves — a tower within POWER.link m of a live pole or a live
 * tower is live too — so power runs from the wall out along the roads, tower to tower. Powered
 * workshops work faster; lamps light up the night; towers' devices run.
 * Light: at night a tower sees less far unless a brazier, a lit lamp or the torches along the wall
 * are near (a brazier or a lamp up on the wall-walk reaches further: NIGHT.beacon).
 */
import type { Sim } from '../sim.ts';
import {
  AURA,
  DEVICE,
  NIGHT,
  POWER,
  PLANS,
  GEM_LEVELS,
  daylight,
  gemLevel,
  todNow,
  type DevicePlan,
  type DeviceId,
} from '../content.ts';
import { onWall, wallDist } from '../map.ts';
import { dist } from '../../core/math.ts';
import type { Building } from '../types.ts';

/** Live grid nodes (generators and connected poles) and the links between them, for the views. */
export function gridOf(buildings: readonly Building[]): { nodes: Building[]; links: [Building, Building][] } {
  const gens = buildings.filter((b) => b.kind === 'hydro' && !b.site);
  // Poles carry it, and out beyond the wall the towers do (a tower standing, not a blueprint).
  const poles = buildings.filter((b) => b.kind === 'pole' || (b.kind === 'tower' && b.hp > 0));
  const live = new Set<Building>(gens);
  const links: [Building, Building][] = [];
  const queue = [...gens];
  while (queue.length) {
    const a = queue.shift()!;
    for (const p of poles) {
      if (live.has(p) || dist(a.x, a.z, p.x, p.z) > POWER.link + (a.kind === 'hydro' ? 3 : 0)) continue;
      // (The line goes out to the towers from the poles; the watermill feeds poles only.)
      if (p.kind === 'tower' && a.kind === 'hydro') continue;
      live.add(p);
      links.push([a, p]);
      queue.push(p);
    }
  }
  return { nodes: [...live], links };
}

export function updatePower(sim: Sim): void {
  if (sim.state.tick % 10 !== 0) return;
  const all = sim.state.buildings;
  const { nodes } = gridOf(all);
  for (const b of all) {
    b.powered =
      nodes.includes(b) ||
      nodes.some((n) => dist(n.x, n.z, b.x, b.z) <= POWER.reach + (n.kind === 'hydro' ? 3 : 0));
  }
  updateDevices(sim);
  // Braziers, and towers with a sun topaz in a window.
  const fires = all.filter((b) => b.kind === 'brazier' || b.gems?.includes('sun'));
  const lamps = all.filter((b) => b.kind === 'lamp' && b.powered);
  for (const b of all) {
    if (!b.stats) continue;
    b.lit =
      // A live searchlight lights its own tower.
      (!!b.devicesOn && !!b.devices?.includes('searchlight')) ||
      wallDist(b.x, b.z) <= NIGHT.town ||
      fires.some(
        (f) =>
          dist(f.x, f.z, b.x, b.z) <=
          (f.kind === 'brazier'
            ? onWall(f.x, f.z)
              ? NIGHT.beacon
              : NIGHT.brazier
            : AURA.sun * (0.8 + 0.2 * GEM_LEVELS[gemLevel(f, 'sun')].k)),
      ) ||
      lamps.some((l) => dist(l.x, l.z, b.x, b.z) <= (onWall(l.x, l.z) ? NIGHT.beacon : NIGHT.lamp));
  }
}

/** Watts a device draws (a solar roof makes them instead, so it draws none). */
const wattsOf = (d: DeviceId) => (d === 'solar' ? 0 : (PLANS[d] as DevicePlan).watts);

/**
 * The grid's budget: the generators make DEVICE.hydroWatts each; lamps and towers' devices draw. A
 * tower's devices run if its own solar roof covers them (by day), or if it is on the grid and the
 * grid can carry everything — asked for more than it makes, the devices go dark (the lamps stay on).
 */
export function updateDevices(sim: Sim): void {
  const all = sim.state.buildings;
  const sun = daylight(todNow(sim.state));
  // Each watermill makes its watts — twice as many with a magnet dynamo.
  const supply = all
    .filter((b) => b.kind === 'hydro' && !b.site && b.powered)
    .reduce((n, b) => n + DEVICE.hydroWatts * (b.upgrades?.includes('dynamo') ? 2 : 1), 0);
  let demand = all.filter((b) => b.kind === 'lamp' && b.powered).length * DEVICE.lampWatts;
  // First what solar roofs cover by themselves; the rest is asked of the grid.
  const fromGrid: { b: Building; watts: number }[] = [];
  for (const b of all) {
    if (!b.devices?.length) {
      b.devicesOn = false;
      continue;
    }
    const need = b.devices.reduce((n, d) => n + wattsOf(d), 0);
    const own = b.devices.includes('solar') ? DEVICE.solarWatts * sun : 0;
    if (own >= need) {
      b.devicesOn = true;
      continue;
    }
    b.devicesOn = false;
    if (b.powered) fromGrid.push({ b, watts: need - own });
  }
  for (const f of fromGrid) demand += f.watts;
  const ok = demand <= supply;
  for (const f of fromGrid) f.b.devicesOn = ok;
  sim.state.grid = { supply: Math.round(supply * 10) / 10, demand: Math.round(demand * 10) / 10 };
}

/** Does tower `b` have device `d`, running? */
export const liveDevice = (b: Building, d: DeviceId): boolean => !!b.devicesOn && !!b.devices?.includes(d);

/** How dark it is now: 0 by day … 1 at the dead of night. */
export function darkness(sim: Sim): number {
  return 1 - daylight(todNow(sim.state));
}

/** How far a tower sees now: by night up to NIGHT.rangeLoss less — unless it is lit. */
export function sightRange(sim: Sim, b: Building): number {
  const range = b.stats?.range ?? 0;
  return b.lit ? range : range * (1 - NIGHT.rangeLoss * darkness(sim));
}
