import { beginTransit } from '../transit-start.ts';
/**
 * Going into buildings, seamlessly: run at a building's door and you are inside its room, run out
 * of the room's doorway and you are back outside its door — no key, no wait. You keep your heading
 * through the door (turned with the building), so whoever is holding W just keeps running, and the
 * camera comes along the same way (the 'entered' event says how far it turned).
 * Inside, walking keeps to the open floor (stairs lead up to the loft), and the building's work is
 * done at its bench.
 */
import type { Sim } from '../sim.ts';
import { sizeOf, type BuildingKind } from '../content.ts';
import {
  INTERIORS,
  entryPoint,
  indoors,
  roomFrameAt,
  roomOpen,
  toWorld,
  type InteriorDef,
} from '../interiors.ts';
import type { Building, Hero } from '../types.ts';
import { MAP } from '../map.ts';

/** Where a building's door is along its front (m from the middle, + to its right seen from the front). */
const ENTRANCE: Partial<Record<BuildingKind, number>> = {
  shop: 0,
  anvil: -0.68,
  forge: -0.68,
  sawmill: -0.35,
  stonecutter: 0,
  arcanist: 0,
};

/** The building whose room (x, z) is in, with the point in the room's own frame. */
export function roomAt(
  sim: Sim,
  x: number,
  z: number,
): { b: Building; def: InteriorDef; lx: number; lz: number } | null {
  const f = roomFrameAt(x, z);
  if (!f) return null;
  const b = sim.state.buildings.find((o) => o.kind === f.kind && o.interior === f.slot);
  return b ? { b, def: f.def, lx: f.lx, lz: f.lz } : null;
}

/** Can a hero stand at (x, z) indoors? Open floor only — walls, furniture and the loft's edge are solid. */
export function roomWalkable(sim: Sim, x: number, z: number): boolean {
  const r = roomAt(sim, x, z);
  return !!r && roomOpen(r.def, r.lx, r.lz);
}

/** Is hero `h` inside building `b`'s room? */
export function insideOf(sim: Sim, h: Hero, b: Building): boolean {
  return roomAt(sim, h.x, h.z)?.b === b;
}

/** Where a building's work is done (world): its bench, inside. */
export function benchOf(b: Building): { x: number; z: number; face: number } | null {
  const def = INTERIORS[b.kind];
  if (!def || b.interior === undefined) return null;
  const p = toWorld(b.kind, b.interior, def.bench.x, def.bench.z);
  return { ...p, face: def.bench.face };
}

/** The room's doorway (world), at the wall's inner face. */
export function roomDoor(b: Building): { x: number; z: number } | null {
  const def = INTERIORS[b.kind];
  if (!def || b.interior === undefined) return null;
  return toWorld(b.kind, b.interior, def.door.x, def.hz);
}

/** The building's own door, a step in front of it (world): where you come out. */
export function frontDoor(b: Building, out = 0.62): { x: number; z: number } {
  const f = sizeOf(b.kind) / 2 + out;
  const side = ENTRANCE[b.kind] ?? 0;
  const s = Math.sin(b.rot);
  const c = Math.cos(b.rot);
  return { x: b.x + s * f + c * side, z: b.z + c * f - s * side };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function place(h: Hero, x: number, z: number, turn: number): void {
  h.x = h.px = x;
  h.z = h.pz = z;
  h.facing = wrap(h.facing + turn);
  h.look = wrap(h.look + turn);
  h.task = { k: 'idle' };
  h.path = [];
  h.pathGoal = null;
}

/**
 * In through the door: the hero stands just inside, heading on as they came (the door outside faces
 * the building's front, the room's faces +z, so everything turns by −rot).
 */
export function walkIntoBuilding(_sim: Sim, h: Hero, b: Building): void {
  if (b.interior === undefined || !INTERIORS[b.kind]) return;
  h.facing = h.look = b.rot + Math.PI;
  beginTransit(h, { kind: 'door', duration: 1.1, building: b.id, inside: true, edge: frontDoor(b, 0.05) });
}
export function walkOutOfBuilding(sim: Sim, h: Hero): void {
  const room = roomAt(sim, h.x, h.z),
    door = room && roomDoor(room.b);
  if (!room || !door) return;
  h.facing = h.look = 0;
  beginTransit(h, { kind: 'door', duration: 1.1, building: room.b.id, inside: false, edge: door });
}

export function enterBuilding(sim: Sim, h: Hero, b: Building): void {
  const def = INTERIORS[b.kind];
  if (!def || b.interior === undefined) return;
  const e = entryPoint(def);
  const p = toWorld(b.kind, b.interior, e.x, e.z);
  const turn = wrap(-b.rot);
  place(h, p.x, p.z, turn);
  sim.emit('entered', { hero: h.id, building: b.id, inside: true, x: p.x, z: p.z, turn });
}

/** Out of the door: the hero steps out in front of the building's door, heading on as they came. */
export function leaveBuilding(sim: Sim, h: Hero): void {
  const r = roomAt(sim, h.x, h.z);
  if (!r) return;
  const d = frontDoor(r.b);
  const turn = wrap(r.b.rot);
  place(h, d.x, d.z, turn);
  sim.emit('entered', { hero: h.id, building: r.b.id, inside: false, x: d.x, z: d.z, turn });
}

/** Is the hero close enough to its room's door to step out? */
export function atRoomDoor(sim: Sim, h: Hero): boolean {
  const r = roomAt(sim, h.x, h.z);
  if (!r) return false;
  return Math.hypot(r.lx - r.def.door.x, r.lz - r.def.hz) < 0.9;
}

/**
 * After a hero moved (`heading`: where they are walking): through a door if they walked into one.
 * Outside, pressing on a building's door goes in; inside, stepping into the doorway goes out.
 */
export function doorways(sim: Sim, h: Hero, heading: number): void {
  if (h.dead || h.transit) return;
  if (indoors(h.x)) {
    const r = roomAt(sim, h.x, h.z);
    if (r && r.lz > r.def.hz + 0.02 && Math.abs(r.lx - r.def.door.x) < r.def.door.hw)
      walkOutOfBuilding(sim, h);
    return;
  }
  const hx = Math.sin(heading);
  const hz = Math.cos(heading);
  for (const b of sim.state.buildings) {
    if (b.interior === undefined || b.hp <= 0 || !INTERIORS[b.kind]) continue;
    const half = sizeOf(b.kind) / 2;
    const dx = h.x - b.x;
    const dz = h.z - b.z;
    if (Math.abs(dx) > half + 1 || Math.abs(dz) > half + 1) continue;
    const s = Math.sin(b.rot);
    const c = Math.cos(b.rot);
    const along = dx * s + dz * c;
    const side = dx * c - dz * s;
    // At the door, heading into the building.
    if (
      along > half - 0.3 &&
      along < half + 0.45 &&
      Math.abs(side - (ENTRANCE[b.kind] ?? 0)) < 0.42 &&
      hx * s + hz * c < -0.35
    ) {
      walkIntoBuilding(sim, h, b);
      return;
    }
  }
}

/** Anyone inside a building that is going away is put out of its door first. */
export function emptyBuilding(sim: Sim, b: Building): void {
  if (b.interior === undefined) return;
  for (const h of sim.state.heroes) if (insideOf(sim, h, b)) leaveBuilding(sim, h);
}

/** Anyone left standing in the dark where no room is (a room pulled down, an old save) goes home. */
export function rescueLost(sim: Sim): void {
  for (const h of sim.state.heroes) {
    if (!indoors(h.x) || roomAt(sim, h.x, h.z)) continue;
    h.x = h.px = MAP.heroStart.x;
    h.z = h.pz = MAP.heroStart.z;
    h.task = { k: 'idle' };
    h.path = [];
    h.pathGoal = null;
  }
}
