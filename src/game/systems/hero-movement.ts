import { betweenWaves } from '../maintenance.ts';
import type { Ent, Sim } from '../sim.ts';
import { ENEMIES, HERO, sizeOf, PLANS } from '../content.ts';
import {
  GRID_W,
  MAP,
  WALL,
  deckAt,
  inGrid,
  outsideWalls,
  wallAt,
  wallSpot,
  waterDepth,
  type Vec2,
} from '../map.ts';
import { inDoorway } from './wall.ts';
import type { Hero, Id } from '../types.ts';
import { dist } from '../../core/math.ts';
import { minePath } from './mining-navigation.ts';
import { underground } from './mining-rules.ts';
import { benchOf, frontDoor, insideOf, roomWalkable } from './rooms.ts';
import { earthWalkable } from '../excavation.ts';
import { indoors } from '../interiors.ts';
import { inSpace } from '../space.ts';
import { spaceWalkable } from './space-state.ts';

/**
 * Where a hero goes to work on something, and how close counts as there (`look`: what to face once
 * there, if not that point).
 */
export function approach(
  sim: Sim,
  id: Id,
  h?: Hero,
): { x: number; z: number; r: number; look?: Vec2 } | null {
  const ent = sim.get(id);
  if (!ent) return null;
  // Out on the field beyond the wall — a tower, its plan, the spoils of the dead: worked from the
  // wall-walk, at the point on it nearest (heroes never go out there).
  const field = onField(ent);
  if (h && field && !betweenWaves(sim)) {
    const p = postSpot(sim, field.x, field.z);
    return { x: p.x, z: p.z, r: 0.5, look: field };
  }
  // Inside a building, its work is done at the bench.
  if (h && ent.type === 'building' && ent.e.interior !== undefined) {
    if (insideOf(sim, h, ent.e)) {
      const bench = benchOf(ent.e);
      if (bench) return { x: bench.x, z: bench.z, r: 0.35 };
    } else {
      // From outside: to its door (and in).
      const d = frontDoor(ent.e);
      return { x: d.x, z: d.z, r: 0.45 };
    }
  }
  switch (ent.type) {
    case 'node':
      return { x: ent.e.x, z: ent.e.z, r: ent.e.radius + HERO.reach };
    case 'drop':
      return { x: ent.e.x, z: ent.e.z, r: 0.9 };
    case 'chest':
      return { x: ent.e.x, z: ent.e.z, r: 1.6 };
    case 'site': {
      const plan = PLANS[ent.e.plan];
      const size = sizeOf(plan.type === 'building' ? plan.building : 'tower');
      return { x: ent.e.x, z: ent.e.z, r: size / 2 + HERO.reach + 0.2 };
    }
    case 'building':
      return { x: ent.e.x, z: ent.e.z, r: sizeOf(ent.e.kind) / 2 + HERO.reach + 0.2 };
    case 'poi':
      return { x: ent.e.x, z: ent.e.z, r: ent.e.r + HERO.reach + 0.6 };
    case 'enemy':
      return { x: ent.e.x, z: ent.e.z, r: ENEMIES[ent.e.kind].radius + HERO.range };
    default:
      return null;
  }
}

export function setPath(sim: Sim, h: Hero, x: number, z: number): boolean {
  // Down the mine, through its drifts (the vale's grid knows nothing of them).
  const path = underground(h.x) ? minePath(sim, h.x, h.z, x, z) : sim.pf.find(h.x, h.z, x, z);
  if (!path) {
    h.path = [];
    h.pathGoal = null;
    return false;
  }
  h.path = path;
  h.pathIdx = 0;
  h.pathGoal = { x, z };
  return true;
}

/** Heroes wade knee-deep water a little slower and swim much slower. */
export function waterPace(sim: Sim, x: number, z: number): number {
  const d = waterDepth(sim.world, x, z);
  return d > 0.28 ? 0.55 : d > 0.06 ? 0.8 : 1;
}

/** How fast a hero moves where it stands. */
export function heroSpeed(sim: Sim, h: Hero): number {
  return HERO.speed * waterPace(sim, h.x, h.z) * (h.horse?.riding ? 2.2 : 1);
}

/** Moves along the current path. Returns true once the path is used up. */
export function followPath(sim: Sim, h: Hero, dt: number): boolean {
  let budget = heroSpeed(sim, h) * dt;
  while (budget > 0 && h.pathIdx < h.path.length) {
    const tx = h.path[h.pathIdx];
    const tz = h.path[h.pathIdx + 1];
    if (tx === undefined || tz === undefined) return true;
    const dx = tx - h.x;
    const dz = tz - h.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) {
      h.pathIdx += 2;
      continue;
    }
    h.facing = Math.atan2(dx, dz);
    if (d <= budget) {
      h.x = tx;
      h.z = tz;
      budget -= d;
      h.pathIdx += 2;
    } else {
      h.x += (dx / d) * budget;
      h.z += (dz / d) * budget;
      budget = 0;
    }
  }
  if (h.pathIdx < h.path.length) {
    h.anim = 'run';
    return false;
  }
  return true;
}

/** Walk until within `r` of (x, z). Returns true when in reach. */
export function walkTo(sim: Sim, h: Hero, x: number, z: number, r: number, dt: number): boolean {
  if (dist(h.x, h.z, x, z) <= r) {
    h.path = [];
    h.pathGoal = null;
    return true;
  }
  if (!h.pathGoal || dist(h.pathGoal.x, h.pathGoal.z, x, z) > 0.75 || h.pathIdx >= h.path.length) {
    if (!setPath(sim, h, x, z)) {
      // Direct steer as a fallback (e.g. target sitting in an odd cell).
      const d = dist(h.x, h.z, x, z);
      const step = Math.min(d, heroSpeed(sim, h) * dt);
      h.facing = Math.atan2(x - h.x, z - h.z);
      steerMove(sim, h, ((x - h.x) / d) * step, ((z - h.z) / d) * step);
      h.anim = 'run';
      return dist(h.x, h.z, x, z) <= r;
    }
  }
  followPath(sim, h, dt);
  return dist(h.x, h.z, x, z) <= r;
}

/** Hero-sized collision against terrain, scenery and buildings (blueprints are walkable). */
export function walkableAt(sim: Sim, x: number, z: number): boolean {
  if (underground(x)) return earthWalkable(sim, x, z);
  if (indoors(x)) return roomWalkable(sim, x, z);
  if (inSpace(z)) return spaceWalkable(sim, x, z);
  // Repair sorties may cross the gate only while the roads are clear.
  if (outsideWalls(x, z) && !betweenWaves(sim)) return false;
  // The wall: its walk and stairs (at their height); the rest of it — battlements, railing, the
  // gatehouse and its doorway, the stairs' sides — is solid (finer than the grid).
  if (Math.abs(x - WALL.x) < WALL.half + 2.5) {
    const wa = wallAt(x, z);
    if (wa === 'solid' || (wa === 'gate' && !(betweenWaves(sim) && inDoorway(x, z)))) return false;
    if (wa === 'gate' && betweenWaves(sim) && inDoorway(x, z)) return true;
  }
  // A bridge is one surface between its parapets (the grid's cells are too coarse for it).
  const deck = deckAt(sim.world, x, z, 0);
  if (deck) return deck === 'deck';
  const cx = Math.floor(x - MAP.minX);
  const cz = Math.floor(z - MAP.minZ);
  if (!inGrid(cx, cz)) return false;
  const k = cz * GRID_W + cx;
  if (!sim.walkFine[k] && !earthWalkable(sim, x, z)) return false;
  const occ = sim.state.occupied[k];
  return !occ || sim.get(occ)?.type !== 'building';
}

export function bodyFree(sim: Sim, x: number, z: number): boolean {
  const r = 0.13;
  if (sim.collides(x, z, r)) return false;
  return (
    walkableAt(sim, x, z) &&
    walkableAt(sim, x + r, z) &&
    walkableAt(sim, x - r, z) &&
    walkableAt(sim, x, z + r) &&
    walkableAt(sim, x, z - r)
  );
}

/**
 * Where a body at (x, z) ends up after trying to move (dx, dz): slides along obstacles, and is
 * free to walk out of anything it is already stuck in. Shared by the sim and the client.
 */
export function slide(sim: Sim, x: number, z: number, dx: number, dz: number): { x: number; z: number } {
  if (!bodyFree(sim, x, z))
    return walkableAt(sim, x + dx, z + dz) || !walkableAt(sim, x, z) ? { x: x + dx, z: z + dz } : { x, z };
  if (bodyFree(sim, x + dx, z + dz)) return { x: x + dx, z: z + dz };
  if (bodyFree(sim, x + dx, z)) return { x: x + dx, z };
  if (bodyFree(sim, x, z + dz)) return { x, z: z + dz };
  return { x, z };
}

/** Moves with sliding along obstacles. */
export function steerMove(sim: Sim, h: Hero, dx: number, dz: number): void {
  const p = slide(sim, h.x, h.z, dx, dz);
  h.x = p.x;
  h.z = p.z;
}

/** Where something out on the field beyond the wall stands (a tower, its plan, spoils) — null if it is on our side. */
export function onField(ent: Ent): Vec2 | null {
  if (ent.type !== 'site' && ent.type !== 'building' && ent.type !== 'drop') return null;
  return outsideWalls(ent.e.x, ent.e.z) ? ent.e : null;
}

/** Where on the wall-walk a hero stands to work on something at (x, z) out on the field: the nearest free spot. */
export function postSpot(sim: Sim, x: number, z: number): Vec2 {
  const p = wallSpot(x, z);
  // Round a brazier or a pole stood on the walk.
  for (let i = 0; i < 24; i++) {
    const dz = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.5;
    const q = wallSpot(p.x, p.z + dz);
    if (Math.sign(q.z) === Math.sign(p.z) && bodyFree(sim, q.x, q.z)) return q;
  }
  return p;
}
