/** Interaction reach, footprint escape and wall-walk tower posts. */
import type { Sim } from '../../sim.ts';
import type { Building, Hero, Id } from '../../entity-types.ts';
import { dist } from '../../../core/math.ts';
import { OVER_WALL } from '../../content/heroes.ts';
import { isTower } from '../../content/structures.ts';
import { betweenWaves } from '../../maintenance.ts';
import { onWall, outsideWalls, wallDist } from '../../map.ts';
import { indoors } from '../../interiors.ts';
import { inSpace } from '../../space.ts';
import { underground } from '../mining-rules.ts';
import { approach, bodyFree, onField } from '../hero-movement.ts';

export function tooFar(sim: Sim, h: Hero, target: Id, limit: number): boolean {
  // Something out on the field: the hero walks up onto the wall-walk for it from anywhere in town (not
  // from down the mine, indoors or in Space) — as long as it is within reach from up there.
  const ent = sim.get(target);
  const field = ent && onField(ent);
  if (field && !betweenWaves(sim)) {
    const why =
      underground(h.x) || indoors(h.x) || inSpace(h.z)
        ? 'Too far away'
        : wallDist(field.x, field.z) > OVER_WALL.reach + 4
          ? 'Too far out — beyond reach from the wall-walk'
          : '';
    if (!why) return false;
    sim.emit('denied', { hero: h.id, reason: why, x: field.x, z: field.z });
    return true;
  }
  const a = approach(sim, target, h);
  if (!a) return true;
  if (dist(h.x, h.z, a.x, a.z) - a.r > limit) {
    sim.emit('denied', { hero: h.id, reason: 'Too far away', x: a.x, z: a.z });
    return true;
  }
  return false;
}

/**
 * A building just went up at (x, z): anyone standing on its footprint steps out to the nearest
 * free spot beside it, instead of being stuck inside the walls.
 */
export function ejectFromFootprint(sim: Sim, x: number, z: number, size: number): void {
  const half = size / 2 + 0.3;
  const out = (b: { x: number; z: number; px: number; pz: number }) => {
    if (Math.abs(b.x - x) > half || Math.abs(b.z - z) > half) return;
    let best: { x: number; z: number } | null = null;
    let bd = Infinity;
    for (let r = half + 0.2; r < half + 6 && !best; r += 0.5) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const px = x + Math.sin(a) * r;
        const pz = z + Math.cos(a) * r;
        if (!bodyFree(sim, px, pz)) continue;
        const d = Math.hypot(px - b.x, pz - b.z);
        if (d < bd) {
          bd = d;
          best = { x: px, z: pz };
        }
      }
    }
    if (best) {
      b.x = best.x;
      b.z = best.z;
    }
  };
  for (const h of sim.state.heroes) out(h);
  for (const u of sim.state.units) out(u);
}

/** Why a hero can't go somewhere beyond the wall. */
export const OVER_WALL_WHY = 'The attack is underway — repair trips outside resume when the roads are clear';

/** Can hero `h` work on something at (x, z) from where they stand — within `r` of it, or (out on the field) up on the wall-walk? */
export function inReachOf(h: Hero, x: number, z: number, r: number): boolean {
  if (outsideWalls(x, z) && !outsideWalls(h.x, h.z))
    return onWall(h.x, h.z) && wallDist(x, z) <= OVER_WALL.reach + 4;
  return dist(h.x, h.z, x, z) <= r;
}

/** The tower a hero up on the wall-walk crews: the nearest standing one within OVER_WALL.crew (none off the walk). */
export function postOf(sim: Sim, h: Hero): Building | undefined {
  if (h.dead || !onWall(h.x, h.z)) return undefined;
  let best: Building | undefined;
  let bd = OVER_WALL.crew;
  for (const b of sim.state.buildings) {
    if (!isTower(b.kind) || b.hp <= 0) continue;
    const d = dist(b.x, b.z, h.x, h.z);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/** Keeps a hero's post (the tower they crew) up to date; says so when they take up a new one. */
export function takePost(sim: Sim, h: Hero): void {
  const b = postOf(sim, h);
  const id = b?.id ?? 0;
  if ((h.post ?? 0) === id) return;
  h.post = id;
  if (b) sim.emit('crewed', { hero: h.id, building: b.id, x: b.x, z: b.z });
}
