import type { Cut } from './excavation-types.ts';

/** Sixty-four microblocks span each two metre rock chunk. */
export const MINE_BLOCK_SIZE = 0.03125;

interface Point {
  x: number;
  y: number;
  z: number;
}
type Axis = keyof Point;
type Solid = (x: number, y: number, z: number) => boolean;
const AXES: readonly Axis[] = ['x', 'y', 'z'];
const CONTACT_EPSILON = 0.000001;

export function mineBlockCenter(value: number): number {
  return (Math.floor(value / MINE_BLOCK_SIZE) + 0.5) * MINE_BLOCK_SIZE;
}

/** Traverse every crossed cell, including tiny corner contacts, in first-hit order. */
export function mineBlockRay(origin: Point, dir: Point, far: number, solid: Solid) {
  const cell = {
    x: Math.floor(origin.x / MINE_BLOCK_SIZE),
    y: Math.floor(origin.y / MINE_BLOCK_SIZE),
    z: Math.floor(origin.z / MINE_BLOCK_SIZE),
  };
  const next = { x: Infinity, y: Infinity, z: Infinity };
  const step = { x: Math.sign(dir.x), y: Math.sign(dir.y), z: Math.sign(dir.z) };
  for (const axis of AXES)
    if (dir[axis] !== 0)
      next[axis] = ((cell[axis] + (step[axis] > 0 ? 1 : 0)) * MINE_BLOCK_SIZE - origin[axis]) / dir[axis];
  while (true) {
    let axis: Axis = 'x';
    if (next.y < next[axis]) axis = 'y';
    if (next.z < next[axis]) axis = 'z';
    const distance = next[axis] + CONTACT_EPSILON;
    if (distance >= far) return null;
    cell[axis] += step[axis];
    next[axis] += MINE_BLOCK_SIZE / Math.abs(dir[axis]);
    if (
      !solid(
        (cell.x + 0.5) * MINE_BLOCK_SIZE,
        (cell.y + 0.5) * MINE_BLOCK_SIZE,
        (cell.z + 0.5) * MINE_BLOCK_SIZE,
      )
    )
      continue;
    const point = { x: 0, y: 0, z: 0 };
    // Tied corner crossings visit each axis in order. Keep the hit inside that visited cell,
    // rather than jumping diagonally into a different block whose face may still be covered.
    for (const component of AXES)
      point[component] = Math.max(
        cell[component] * MINE_BLOCK_SIZE + CONTACT_EPSILON,
        Math.min(
          (cell[component] + 1) * MINE_BLOCK_SIZE - CONTACT_EPSILON,
          origin[component] + dir[component] * distance,
        ),
      );
    const normal = { x: 0, y: 0, z: 0 };
    normal[axis] = -step[axis];
    return { ...point, normal, distance };
  }
}

/** Return the nearest exposed block face, always aligned with one building axis. */
export function mineBlockNormal(x: number, y: number, z: number, solid: Solid): Point {
  const point = { x, y, z };
  const center = { x: mineBlockCenter(x), y: mineBlockCenter(y), z: mineBlockCenter(z) };
  const occupied = solid(center.x, center.y, center.z);
  let nearest = Infinity;
  let normal: Point = { x: 0, y: 1, z: 0 };
  for (const axis of AXES)
    for (const direction of [-1, 1]) {
      const neighbor = { ...center, [axis]: center[axis] + direction * MINE_BLOCK_SIZE };
      if (solid(neighbor.x, neighbor.y, neighbor.z) === occupied) continue;
      const distance = Math.abs(point[axis] - center[axis] - direction * MINE_BLOCK_SIZE * 0.5);
      if (distance >= nearest) continue;
      nearest = distance;
      normal = { x: 0, y: 0, z: 0 };
      normal[axis] = occupied ? direction : -direction;
    }
  return normal;
}

/** One compact saved stroke chips a cluster of microblocks without slowing digging to one tiny cell. */
export function mineBlockCuts(contact: Point & { normal: Point }, wide: boolean, solid: Solid): Cut[] {
  const center = {
    x: mineBlockCenter(contact.x - contact.normal.x * CONTACT_EPSILON * 0.25),
    y: mineBlockCenter(contact.y - contact.normal.y * CONTACT_EPSILON * 0.25),
    z: mineBlockCenter(contact.z - contact.normal.z * CONTACT_EPSILON * 0.25),
  };
  if (!solid(center.x, center.y, center.z)) return [];
  if (
    solid(
      center.x + contact.normal.x * MINE_BLOCK_SIZE,
      center.y + contact.normal.y * MINE_BLOCK_SIZE,
      center.z + contact.normal.z * MINE_BLOCK_SIZE,
    )
  )
    return [];
  return [{ ...center, r: wide ? 0.19 : 0.09, soil: false }];
}

/** Count only occupied microcells actually affected by a stroke, including its rough chipped rim. */
export function mineBlockSamples(cut: Cut, solid: Solid, removed: Solid): Point[] {
  // The existing spherical roughness is under one microblock; include that margin on all sides.
  const reach = cut.r + MINE_BLOCK_SIZE;
  const first = {
    x: Math.floor((cut.x - reach) / MINE_BLOCK_SIZE),
    y: Math.floor((cut.y - reach) / MINE_BLOCK_SIZE),
    z: Math.floor((cut.z - reach) / MINE_BLOCK_SIZE),
  };
  const last = {
    x: Math.floor((cut.x + reach) / MINE_BLOCK_SIZE),
    y: Math.floor((cut.y + reach) / MINE_BLOCK_SIZE),
    z: Math.floor((cut.z + reach) / MINE_BLOCK_SIZE),
  };
  const samples: Point[] = [];
  for (let z = first.z; z <= last.z; z++)
    for (let y = first.y; y <= last.y; y++)
      for (let x = first.x; x <= last.x; x++) {
        const px = (x + 0.5) * MINE_BLOCK_SIZE;
        const py = (y + 0.5) * MINE_BLOCK_SIZE;
        const pz = (z + 0.5) * MINE_BLOCK_SIZE;
        if (removed(px, py, pz) && solid(px, py, pz)) samples.push({ x: px, y: py, z: pz });
      }
  return samples;
}
