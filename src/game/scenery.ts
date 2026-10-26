import { STABLE } from './maintenance.ts';
/** Compact starter yard. The simulation and view share these props and their collision sizes. */
import { RNG } from '../core/rng.ts';
import { caveFacing, WALL, MAP, sampleHeights, type World } from './map.ts';
import type { NodeKind } from './content.ts';

/** 'proc' = procedural models made by the view (crystal clusters, ore veins); 'town' streams in after the world. */
export type Kit = 'medieval' | 'halloween' | 'dungeon' | 'proc' | 'trees' | 'town' | 'resources' | 'tools';

export interface Prop {
  kit: Kit;
  model: string;
  x: number;
  z: number;
  rot: number;
  scale: number;
  /** Blocks building (and the coarse path grid) within this radius. */
  block: number;
  /**
   * Fine collision radius for walking (a tree trunk, a barrel): the hero walks right up to and
   * between these, instead of around a whole grid cell. Props without it block the walk grid.
   */
  trunk?: number;
  /** Solid oriented box: half-extents along the model's local x (its length) and local z — walls. */
  box?: [number, number];
  /** Offset added to the ground height. */
  dy?: number;
  /** Absolute height (overrides ground height). */
  y?: number;
  /** Behaviour hook for the view: animated parts, interaction. */
  tag?: string;
  /** Instanced with wind sway. */
  sway?: boolean;
  /** Gatherable resource node. */
  node?: NodeKind;
  /** Multiplier on the node's amount (big clusters hold more). */
  nodeAmount?: number;
}

/** Uniform scales that bring each kit to the shared world scale (characters ≈ 1.4 m). */
export const SCALE = {
  character: 0.62,
  building: 3.0,
  tower: 3.3,
  prop: 3.0,
  tree: 3.6,
  rock: 4.2,
  halloween: 0.62,
  crypt: 0.9,
  dungeon: 0.7,
  /** KayKit's furniture, resource and farm bits (made for characters 2.4 units tall). */
  bits: 0.62,
};

const P = (
  kit: Kit,
  model: string,
  x: number,
  z: number,
  rot: number,
  scale: number,
  block: number,
  extra: Partial<Prop> = {},
): Prop => ({
  kit,
  model,
  x,
  z,
  rot,
  scale,
  block,
  ...extra,
});

/** A small, dry starting yard: the workshop is a simulation building; the mine is scenery. */
export function buildScenery(world: World): Prop[] {
  const props: Prop[] = [];
  const rng = new RNG(MAP.seed + 101);
  // Keep the defensive boundary, without towers, flags, torches or town clutter.
  props.push(
    P('medieval', 'wall_straight_gate', WALL.x, 0, Math.PI / 2, WALL.scale, 0, {
      tag: 'keep-gate',
      y: world.wallY,
    }),
  );
  for (const side of [-1, 1]) {
    for (let k = 1; WALL.piece * (k - 0.5) < WALL.reach; k++) {
      props.push(
        P('medieval', 'wall_straight', WALL.x, side * WALL.piece * k, Math.PI / 2, WALL.scale, 0, {
          y: world.wallY,
        }),
      );
    }
    const stair = WALL.stairs.find((s) => s.dir === side)!;
    props.push(
      P(
        'proc',
        `wall_stair:${stair.run}:${(stair.x1 - stair.x0).toFixed(2)}:${WALL.walkH.toFixed(2)}:${WALL.landing}`,
        (stair.x0 + stair.x1) / 2,
        (stair.foot + stair.head) / 2,
        side > 0 ? Math.PI : 0,
        1,
        0,
        { y: world.wallY, tag: 'stair' },
      ),
    );
  }
  const cave = MAP.caves[0];
  props.push(
    P('medieval', 'building_mine_blue', cave.x, cave.z, caveFacing(cave), 3.2, 2.3, { tag: 'cave' }),
  );
  // Trees are spread through the village. Every felled tree needs deliberate replanting.
  for (let z = -10; z <= 12; z += 4.5)
    for (let x = -7; x <= WALL.x - 4; x += 4.5) {
      const px = x + rng.range(-0.7, 0.7),
        pz = z + rng.range(-0.7, 0.7);
      if (Math.hypot(px - STABLE.x, pz - STABLE.z) < 2.5) continue;
      if (
        Math.hypot(px - MAP.workshops.x, pz - MAP.workshops.z) < 3.2 ||
        Math.hypot(px - MAP.stores.market.x, pz - MAP.stores.market.z) < 3.2 ||
        Math.hypot(px - cave.x, pz - cave.z) < 3.8
      )
        continue;
      const k = Math.floor(pz - MAP.minZ) * Math.round(MAP.maxX - MAP.minX) + Math.floor(px - MAP.minX);
      // This planting loop stays inside the map; streetDist shares the full cell extent.
      if (world.streetDist[k]! < 2.4 || sampleHeights(world.heights, px, pz) > 5) continue;
      props.push(
        P('trees', `pine_${rng.int(0, 4)}`, px, pz, rng.range(0, Math.PI * 2), 5.4 + rng.next(), 0.35, {
          node: 'tree',
          trunk: 0.25,
        }),
      );
    }
  props.push(
    P('town', 'building_stables_yellow', STABLE.x, STABLE.z, 0, 1.5, 1.1, { trunk: 1.1, tag: 'stable' }),
  );
  return props;
}
