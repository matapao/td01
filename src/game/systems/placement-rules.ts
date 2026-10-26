import type { Sim } from '../sim.ts';
import { OVER_WALL, STATIONS, isTower, type BuildingKind } from '../content.ts';
import { CELL, GRID_W, cellCenter, inGrid, insideWalls, outsideWalls, wallDist } from '../map.ts';

// ---- Placement --------------------------------------------------------------------------------

/**
 * Where a kind of building may stand. Beyond the wall only towers (and what is built onto them: their
 * gems, tops and devices), within reach of the wall-walk they are raised from (OVER_WALL); up on the
 * walk lights and poles; everything else — every workshop, now and to come, the Port, the watermill —
 * in our lands inside the walls.
 */
export function buildZone(kind: BuildingKind): 'out' | 'in' | 'inOrWall' {
  if (isTower(kind)) return 'out';
  if (kind === 'brazier' || kind === 'lamp' || kind === 'pole') return 'inOrWall';
  return 'in';
}

/** Why a building of `kind` may not stand on the cells round (cx, cz) by the wall's rule (null: it may). */
export function zoneBlocker(
  sim: Sim,
  kind: BuildingKind,
  cx: number,
  cz: number,
  size: number,
): string | null {
  const zone = buildZone(kind);
  const half = (size - 1) / 2;
  for (let dz = -half; dz <= half; dz++) {
    for (let dx = -half; dx <= half; dx++) {
      if (!inGrid(cx + dx, cz + dz)) return 'Outside the vale';
      const c = cellCenter(cx + dx, cz + dz);
      // inGrid above bounds this cell inside the fixed world buffer.
      const f = sim.world.cells[(cz + dz) * GRID_W + cx + dx]!;
      if (zone === 'out') {
        if (!outsideWalls(c.x, c.z))
          return "Towers stand beyond the wall, out on the dead's side — our side of it is for the town";
        if (wallDist(c.x, c.z) > OVER_WALL.reach)
          return `Too far out: towers are raised from the wall-walk, within ${OVER_WALL.reach} m of the wall`;
        continue;
      }
      if (zone === 'inOrWall' && f & CELL.WALK) continue;
      if (insideWalls(c.x, c.z) && !(f & CELL.WALL)) continue;
      if (f & CELL.WALL)
        return zone === 'inOrWall'
          ? 'Up on the wall-walk itself, or down in town — not on the wall'
          : 'Not on the wall: it stands in town';
      if (kind in STATIONS) return 'Workshops stand inside the walls: the work is done indoors, in town';
      if (zone === 'inOrWall')
        return 'Beyond the wall only towers stand: set it inside, or up on the wall-walk';
      return 'Beyond the wall only towers stand: build it inside the walls';
    }
  }
  return null;
}

/** Why a building plan can't go at (cx, cz) — null if it can. With `kind`, the wall's rule too (zoneBlocker). */
export function placementBlocker(
  sim: Sim,
  cx: number,
  cz: number,
  size: number,
  kind?: BuildingKind,
): string | null {
  if (kind) {
    const zone = zoneBlocker(sim, kind, cx, cz, size);
    if (zone) return zone;
  }
  const half = (size - 1) / 2;
  for (let dz = -half; dz <= half; dz++) {
    for (let dx = -half; dx <= half; dx++) {
      const x = cx + dx;
      const z = cz + dz;
      if (!inGrid(x, z)) return 'Outside the vale';
      const k = z * GRID_W + x;
      // inGrid above bounds this cell inside the fixed world buffer.
      const f = sim.world.cells[k]!;
      if (!sim.state.explored[k]) return 'Explore here first';
      if (f & CELL.WATER) return 'Not on water';
      if (f & CELL.ROAD) return 'Not on the road';
      if (f & (CELL.STEEP | CELL.BORDER)) return 'Too steep';
      if (f & CELL.NOBUILD) return 'Too close to the keep or a crypt';
      if (sim.state.occupied[k]) return 'Something is already here';
      if (!sim.walkFine[k]) return 'Blocked by scenery';
      const cc = cellCenter(x, z);
      if (sim.collides(cc.x, cc.z, 0.45)) return 'A tree or rock is in the way — clear it first';
    }
  }
  return null;
}
