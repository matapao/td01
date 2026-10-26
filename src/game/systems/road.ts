/**
 * Inventing: a hero at a milestone's workshop does its minigame (in the UI) and reports how it went;
 * a good or perfect result marks the milestone invented for the whole team, takes what the try uses
 * up, and opens its plans to study. A failed try costs nothing but time — failing is safe.
 */
import type { Sim } from '../sim.ts';
import { basePlanFor, sizeOf } from '../content.ts';
import { MILESTONES, roadBlocker, type MilestoneId, type RoadState } from '../road.ts';
import { MAP } from '../map.ts';
import type { Command, Hero } from '../types.ts';
import { dist } from '../../core/math.ts';
import { insideOf } from './rooms.ts';

/** The team's road (made the first time it's needed). */
export function roadOf(sim: Sim): RoadState {
  return (sim.state.road ??= { done: [], best: {} });
}

/** Is the hero where milestone `id` is invented: at (or inside) a workshop of its kind, or by the keep? */
export function atWorkshop(sim: Sim, h: Hero, id: MilestoneId): boolean {
  const at = MILESTONES[id].at;
  if (at === 'keep') return dist(h.x, h.z, MAP.keep.x, MAP.keep.z) < 9;
  return sim.state.buildings.some(
    (b) =>
      b.kind === at &&
      b.hp > 0 &&
      (insideOf(sim, h, b) || dist(h.x, h.z, b.x, b.z) <= sizeOf(b.kind) / 2 + 2),
  );
}

/** Why hero `h` can't try milestone `id` now (null: they can). */
export function inventBlocker(sim: Sim, h: Hero, id: MilestoneId): string | null {
  const why = roadBlocker(roadOf(sim), id);
  if (why) return why;
  if (!atWorkshop(sim, h, id)) {
    const at = MILESTONES[id].at;
    return at === 'keep' ? 'Invent it at the keep' : `Invent it at a ${basePlanFor(at).name}`;
  }
  if (!sim.state.dev)
    for (const k in MILESTONES[id].cost)
      if ((h.bag[k as keyof typeof h.bag] ?? 0) < (MILESTONES[id].cost[k as keyof typeof h.bag] ?? 0))
        return 'Bring what the try uses up';
  return null;
}

export function applyRoadCommand(sim: Sim, cmd: Command): boolean {
  if (cmd.t !== 'invent') return false;
  const h = sim.getAs(cmd.hero, 'hero');
  const id = cmd.milestone as MilestoneId;
  if (!h || h.dead || !MILESTONES[id]) return true;
  const why = inventBlocker(sim, h, id);
  if (why) {
    sim.emit('denied', { hero: h.id, reason: why });
    return true;
  }
  const quality = Math.max(0, Math.min(2, Math.round(cmd.quality)));
  if (quality === 0) {
    sim.emit('invented', { hero: h.id, milestone: id, quality: 0 });
    return true;
  }
  const ms = MILESTONES[id];
  if (!sim.state.dev)
    for (const k in ms.cost)
      sim.takeFromBag(h, k as keyof typeof h.bag, ms.cost[k as keyof typeof h.bag] ?? 0);
  const road = roadOf(sim);
  road.done.push(id);
  road.best[id] = quality;
  for (const p of ms.unlocks) if (!sim.state.library.includes(p)) sim.state.library.push(p);
  sim.emit('invented', { hero: h.id, milestone: id, quality });
  return true;
}
