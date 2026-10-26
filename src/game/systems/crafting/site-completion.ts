/** Authoritative site completion, cancellation cleanup and socket salvage. */
import { BUILDING_HP, SALVAGE, isTower, sizeOf } from '../../content/structures.ts';
import type { BasePlan, GemId, GemPlan } from '../../content-types.ts';
import type { Building, Site } from '../../entity-types.ts';
import { INTERIORS } from '../../interiors.ts';
import type { ItemId } from '../../item-data.ts';
import { MAX_GEM_LEVEL } from '../../content/tower-data.ts';
import { PLANS } from '../../content/plans.ts';
import type { Sim } from '../../sim.ts';
import { computeTowerStats, gemLevel, rawIn, towerStats } from '../../content/tower-rules.ts';
import { ejectFromFootprint } from '../hero/reach.ts';
import { nearestRoad } from './orientation.ts';
import { payloadStacked } from '../space-payload.ts';
import { occupyFootprint as occupy } from '../footprint.ts';

const siteSize = (site: Site): number => sizeOf((PLANS[site.plan] as BasePlan).building);

export function removeSite(sim: Sim, site: Site): void {
  if (site.building) {
    const b = sim.getAs(site.building, 'building');
    if (b && b.site === site.id) b.site = 0;
  } else occupy(sim, site.cx, site.cz, 0, siteSize(site));
  sim.remove(site.id);
}

export function forceCompleteSite(sim: Sim, site: Site, lv?: number): void {
  site.have = { ...site.need };
  if (lv !== undefined) site.lv = lv;
  completeSite(sim, site);
}

export function completeSite(sim: Sim, site: Site): void {
  const plan = PLANS[site.plan];
  sim.state.stats.built++;
  const affixes = site.sockets.flatMap((g) => g.affixes);
  const relics = site.sockets.map((g) => g.name);
  if (plan.type === 'upgrade') {
    const b = sim.getAs(site.building, 'building');
    sim.remove(site.id);
    if (!b) return;
    b.site = 0;
    for (const k in site.need)
      b.spent[k as ItemId] = (b.spent[k as ItemId] ?? 0) + (site.need[k as ItemId] ?? 0);
    if (!(b.upgrades ??= []).includes(plan.id)) b.upgrades.push(plan.id);
    sim.emit('buildingDone', { building: b.id, kind: b.kind, x: b.x, z: b.z });
    return;
  }
  if (plan.type === 'payload') {
    // A payload stacked on the Port's rocket: it stands ready to launch.
    const b = sim.getAs(site.building, 'building');
    sim.remove(site.id);
    if (!b) return;
    b.site = 0;
    payloadStacked(b, plan.id);
    sim.emit('buildingDone', { building: b.id, kind: b.kind, x: b.x, z: b.z });
    return;
  }
  if (plan.type === 'device') {
    // A device into the next free upper window.
    const b = sim.getAs(site.building, 'building');
    sim.remove(site.id);
    if (!b) return;
    b.site = 0;
    for (const k in site.need)
      b.spent[k as ItemId] = (b.spent[k as ItemId] ?? 0) + (site.need[k as ItemId] ?? 0);
    if (!(b.devices ??= []).includes(plan.id)) b.devices.push(plan.id);
    sim.emit('deviceSet', { building: b.id, device: plan.id, x: b.x, z: b.z });
    return;
  }
  if (plan.type === 'top') {
    // A new top on its tower: covered from the air (the gallery sees further too).
    const b = sim.getAs(site.building, 'building');
    sim.remove(site.id);
    if (!b) return;
    b.site = 0;
    for (const k in site.need)
      b.spent[k as ItemId] = (b.spent[k as ItemId] ?? 0) + (site.need[k as ItemId] ?? 0);
    b.top = plan.level;
    b.stats = towerStats(b);
    sim.emit('topBuilt', { building: b.id, top: b.top, x: b.x, z: b.z });
    return;
  }
  if (plan.type === 'gem') {
    const b = sim.getAs(site.building, 'building');
    sim.remove(site.id);
    if (!b) return;
    b.site = 0;
    for (const k in site.need)
      b.spent[k as ItemId] = (b.spent[k as ItemId] ?? 0) + (site.need[k as ItemId] ?? 0);
    if (b.gems.includes(plan.id)) {
      // An upgrade: the gem grows a level.
      const i = b.gems.indexOf(plan.id);
      const lv = Math.min(MAX_GEM_LEVEL, site.lv ?? gemLevel(b, plan.id) + 1);
      (b.gemLv ??= [])[i] = lv;
      b.stats = towerStats(b);
      sim.emit('gemSet', { building: b.id, gem: plan.id, lv });
      return;
    }
    b.gems.push(plan.id);
    (b.gemLv ??= []).length = b.gems.length - 1;
    const lv = Math.min(MAX_GEM_LEVEL, Math.max(1, site.lv ?? 1));
    b.gemLv.push(lv);
    b.affixes.push(...affixes);
    b.relics.push(...relics);
    b.gear.push(...site.sockets);
    b.stats = towerStats(b);
    sim.emit('gemSet', { building: b.id, gem: plan.id, lv });
    return;
  }
  const bp = plan as BasePlan;
  sim.remove(site.id);
  const road = nearestRoad(sim, site.x, site.z);
  const b: Building = {
    id: sim.newId(),
    kind: bp.building,
    x: site.x,
    z: site.z,
    cx: site.cx,
    cz: site.cz,
    rot: site.rot,
    ...(site.turned !== undefined ? { turned: site.turned } : {}),
    gems: [],
    affixes,
    relics,
    spent: { ...bp.parts },
    stats: isTower(bp.building) ? computeTowerStats([], affixes) : null,
    gear: [...site.sockets],
    hp: BUILDING_HP[bp.building],
    maxHp: BUILDING_HP[bp.building],
    repairBuf: 0,
    radarT: 1,
    cooldown: 0.4,
    cooldown2: 0.8,
    mode: 'first',
    rallyX: road.x,
    rallyZ: road.z,
    hasteT: 0,
    shots: 0,
    aimX: road.x,
    aimZ: road.z,
    input: {},
    output: {},
    busy: false,
    recipe: 0,
    step: 0,
    work: 0,
    perfects: 0,
    workedAt: -1,
    site: 0,
    builtAt: sim.state.time,
  };
  // A building you can walk into gets a room of its own.
  if (INTERIORS[b.kind]) b.interior = sim.state.rooms = (sim.state.rooms ?? 0) + 1;
  sim.add('building', b);
  occupy(sim, b.cx, b.cz, b.id, sizeOf(b.kind));
  ejectFromFootprint(sim, b.x, b.z, sizeOf(b.kind));
  if (b.kind === 'hydro') {
    // Electricity! Its first uses go straight into the library.
    for (const plan of ['pole', 'lamp'] as const) {
      if (!sim.state.library.includes(plan)) {
        sim.state.library.push(plan);
        sim.emit('scrollFound', { hero: 0, plan });
      }
    }
    sim.emit('powerOn', { building: b.id, x: b.x, z: b.z });
  }
  sim.emit('buildingDone', { building: b.id, kind: b.kind, x: b.x, z: b.z });
  // The first tower starts the clock on the first wave.
  if (isTower(b.kind)) sim.onTowerBuilt();
}

export function removeGems(sim: Sim, b: Building, ids: GemId[]): void {
  const out = ids.filter((m) => b.gems.includes(m));
  if (!out.length) return;
  for (const id of out) {
    const p = PLANS[id] as GemPlan;
    const lv = gemLevel(b, id);
    for (const k in p.parts) {
      // Every raw gem melted into it comes back; half of the rest.
      const n = k === p.color ? rawIn(lv) : (p.parts[k as ItemId] ?? 0) * lv;
      b.spent[k as ItemId] = Math.max(0, (b.spent[k as ItemId] ?? 0) - n);
      const back = k === p.color ? n : Math.floor(n * SALVAGE);
      for (let i = 0; i < back; i++) sim.spawnDrop(k as ItemId, b.x, b.z);
    }
  }
  const q = b.gems.map((m) => gemLevel(b, m));
  // q maps this unchanged gem list, so each level retains its corresponding gem index.
  b.gemLv = q.filter((_, i) => !out.includes(b.gems[i]!));
  b.gems = b.gems.filter((m) => !out.includes(m));
  b.stats = towerStats(b);
  sim.emit('gemsRemoved', { building: b.id, gems: out, x: b.x, z: b.z });
}
