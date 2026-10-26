/** Small solid blocks, with only exposed faces sent to the GPU, as in fps01's building mesh. */
import * as THREE from 'three';
import { MINE_BLOCK_SIZE, ROCK_CHUNK, type RockField } from '../game/excavation.ts';
import { MINERALS } from '../game/mines.ts';

const FACES = [
  {
    n: [1, 0, 0],
    corners: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
    tangents: [1, 2],
    shade: 0.86,
  },
  {
    n: [-1, 0, 0],
    corners: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
    tangents: [1, 2],
    shade: 0.73,
  },
  {
    n: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    tangents: [0, 2],
    shade: 1,
  },
  {
    n: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    tangents: [0, 2],
    shade: 0.64,
  },
  {
    n: [0, 0, 1],
    corners: [
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
      [0, 0, 1],
    ],
    tangents: [0, 1],
    shade: 0.91,
  },
  {
    n: [0, 0, -1],
    corners: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
    tangents: [0, 1],
    shade: 0.8,
  },
] as const;
const ORE_COLORS = Object.values(MINERALS).map((m) => new THREE.Color(m.stain));
const STONE = new THREE.Color('#a6967f');
const BEDROCK = new THREE.Color('#837969');

export function* mineBlockGeometryWork(
  field: RockField,
  cx: number,
  cy: number,
  cz: number,
): Generator<void, THREE.BufferGeometry | null> {
  field.sync();
  const size = MINE_BLOCK_SIZE;
  const count = Math.round(ROCK_CHUNK / size);
  const width = count + 2;
  const ox = cx * ROCK_CHUNK;
  const oy = cy * ROCK_CHUNK;
  const oz = cz * ROCK_CHUNK;
  // One cell of neighboring occupancy culls internal chunk faces and shades shared corners identically.
  const cells = new Uint8Array(width ** 3);
  const at = (x: number, y: number, z: number) => x + 1 + width * (y + 1 + width * (z + 1));
  const solid = (x: number, y: number, z: number) => cells[at(x, y, z)]!;
  let anySolid = false;
  let anyAir = false;
  for (let z = -1; z <= count; z++) {
    const columns = Array.from({ length: width }, (_, i) =>
      field.columnSampler(ox + (i - 0.5) * size, oz + (z + 0.5) * size),
    );
    const solidColumns = Array.from({ length: width }, (_, i) =>
      field.solidColumn(ox + (i - 0.5) * size, oz + (z + 0.5) * size),
    );
    for (let y = -1; y <= count; y++) {
      for (let x = -1; x <= count; x++) {
        const occupied = solidColumns[x + 1] || columns[x + 1]!(oy + (y + 0.5) * size) > 0;
        cells[at(x, y, z)] = Number(occupied);
        anySolid ||= occupied;
        anyAir ||= !occupied;
      }
      yield;
    }
  }
  if (!anySolid || !anyAir) return null;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();
  for (let z = 0; z < count; z++)
    for (let y = 0; y < count; y++) {
      for (let x = 0; x < count; x++) {
        if (!solid(x, y, z)) continue;
        const wx = ox + (x + 0.5) * size;
        const wy = oy + (y + 0.5) * size;
        const wz = oz + (z + 0.5) * size;
        let painted = false;
        let tint = 1;
        for (const face of FACES) {
          const [nx, ny, nz] = face.n;
          const ax = x + nx;
          const ay = y + ny;
          const az = z + nz;
          if (solid(ax, ay, az)) continue;
          if (!painted) {
            tint = 0.96 + 0.04 * Math.sin(wx * 71 + wy * 113 + wz * 97);
            const mineral = field.mineral(wx, wy, wz);
            const band = ((Math.floor(wy / size / 4) % 3) + 3) % 3;
            color.copy(STONE).lerp(BEDROCK, band * 0.14);
            if (mineral) color.lerp(ORE_COLORS[mineral]!, 0.68);
            painted = true;
          }
          const base = positions.length / 3;
          for (const corner of face.corners) {
            const u: [number, number, number] = [0, 0, 0];
            const v: [number, number, number] = [0, 0, 0];
            u[face.tangents[0]] = corner[face.tangents[0]] ? 1 : -1;
            v[face.tangents[1]] = corner[face.tangents[1]] ? 1 : -1;
            const side1 = solid(ax + u[0], ay + u[1], az + u[2]);
            const side2 = solid(ax + v[0], ay + v[1], az + v[2]);
            const diagonal = solid(ax + u[0] + v[0], ay + u[1] + v[1], az + u[2] + v[2]);
            const occlusion = side1 && side2 ? 3 : side1 + side2 + diagonal;
            const light = face.shade * tint * (1 - occlusion * 0.08);
            positions.push(
              ox + (x + corner[0]) * size,
              oy + (y + corner[1]) * size,
              oz + (z + corner[2]) * size,
            );
            normals.push(nx, ny, nz);
            colors.push(color.r * light, color.g * light, color.b * light);
          }
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
      yield;
    }
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
