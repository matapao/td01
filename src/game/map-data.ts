/** Authored vale layout and its deterministic world scaling. */
import type { Vec2 } from './path-resampling.ts';
import type { EnemyKind, Loot } from './content-types.ts';
import { INTERIOR_REGION_X } from './interiors.ts';
export interface LaneDef {
  name: string;
  /** Which crypt (spawn) feeds this route. */
  crypt: number;
  points: Vec2[];
  opensAtWave: number;
  /** Half width of the road surface. */
  half: number;
  /** A narrow trail (fords rivers instead of bridging them). */
  trail?: boolean;
}

export const CRYPTS = ['North Crypt', 'South Crypt'];

export interface CampDef extends Vec2 {
  name: string;
  members: { kind: EnemyKind; count: number }[];
  /** Leash radius around the camp. */
  leash: number;
  respawn: number;
}

export interface ChestDef extends Vec2 {
  id: number;
  name: string;
  loot: Loot;
  golden?: boolean;
}

/** Mines live in their own regions past this x (far off the map): see game/mines.ts. */
export const MINE_REGION_X = 1500;
/** Building interiors (rooms) sit west of the map, beyond this x. */
export { INTERIOR_REGION_X };

/**
 * World scale. The vale is laid out below in design units and stretched by this, so the land feels
 * vast around a half-unit-tall person: keep to crypts is ~290 person-heights (think a capital's gate
 * to the next village), a minute's run, and the dead walk it for a couple of minutes, out of sight.
 */
export const WORLD = 1.6;
/** Scales a design-space coordinate or distance. */
export const w = (v: number): number => Math.round(v * WORLD * 100) / 100;
const wp = <T extends Vec2>(p: T): T => ({ ...p, x: w(p.x), z: w(p.z) });

const DESIGN = {
  name: 'Hollowmere Vale',
  seed: 20261017,
  /** The back of our side: the mountain the keep is built into. */
  minX: -12,
  maxX: 100,
  minZ: -40,
  maxZ: 40,
  /** Width of the mountain/cliff frame around the playable area. */
  border: 9,
  roadHalf: 2.0,
  waterLevel: 0,
  /** Defensive destination at the back of the starter yard (no separate keep building). */
  keep: { x: -4, z: 0 },
  keepRadius: 2,
  /**
   * The wall runs north–south across the pass where the vale is narrowest, with the gate on the road.
   * Everything we own is on this side of it (west): a narrow ward between the keep and the wall.
   * Beyond it the land opens out wide — the roads the dead walk in on, and the towers we raise there.
   */
  wallX: 14,
  /** The gate in the wall, where the roads end and the high street begins (see GATE). */
  gate: { x: 14, z: 0 },
  /** Half the pass's width at the wall; outside it opens out (see passHalfAt). */
  passHalf: 12,
  /** Half the ward's width inside the wall: the mountains close in either side. */
  innerHalf: 8,
  /** Where the hero starts and respawns: just inside the gate. */
  heroStart: { x: 7, z: 0.5 },
  /** The keep's storehouse, on the gate square (store and fetch parts here). */
  storehouse: { x: 2.8, z: -1.4 },
  stores: {
    market: { x: 3, z: 3.6 },
    smithy: { x: -7.6, z: 5 },
    arcane: { x: -10.4, z: -6.4 },
    guild: { x: -7.6, z: -5 },
    dwarven: { x: 12.6, z: 8.2 },
  },
  /** Starter supplies and the single workshop beside the short yard path. */
  market: { x: 3, z: 3.6 },
  workshops: { x: 3, z: -4 },
  launch: { x: -9, z: -6.6 },
  camps: [] as CampDef[],
  lanes: [
    {
      name: 'North Road',
      crypt: 0,
      half: 2.0,
      opensAtWave: 1,
      points: [
        { x: 88, z: -24 },
        { x: 82, z: -27.5 },
        { x: 75, z: -27 },
        { x: 69, z: -21 },
        { x: 65, z: -13 },
        { x: 59, z: -8.5 },
        { x: 53, z: -12 },
        { x: 47, z: -18 },
        { x: 40, z: -19 },
        { x: 34, z: -14 },
        { x: 29, z: -7 },
        { x: 23, z: -2.5 },
        { x: 18, z: -0.3 },
        { x: 14, z: 0 },
      ],
    },
    {
      name: 'South Road',
      crypt: 1,
      half: 2.0,
      opensAtWave: 4,
      points: [
        { x: 88, z: 24 },
        { x: 82, z: 27.5 },
        { x: 75, z: 27 },
        { x: 70, z: 20.5 },
        { x: 63, z: 18 },
        { x: 56, z: 22.5 },
        { x: 49, z: 26.5 },
        { x: 42, z: 22.5 },
        { x: 38, z: 14 },
        { x: 33, z: 7.5 },
        { x: 27, z: 3.5 },
        { x: 21, z: 0.8 },
        { x: 14, z: 0 },
      ],
    },
    {
      name: 'Hollow Trail',
      crypt: 0,
      half: 1.35,
      trail: true,
      opensAtWave: 6,
      points: [
        { x: 88, z: -24 },
        { x: 82, z: -27.5 },
        { x: 77, z: -21 },
        { x: 75, z: -12 },
        { x: 71, z: -4 },
        { x: 65, z: 2 },
        { x: 58, z: 4.5 },
        { x: 50, z: 2 },
        { x: 43, z: -2.5 },
        { x: 36, z: -2 },
        { x: 29, z: 1.5 },
        { x: 22, z: 0.5 },
        { x: 14, z: 0 },
      ],
    },
  ] as LaneDef[],
  /** The starter yard is dry land: no waterways or crossings. */
  river: [] as Vec2[],
  riverHalf: 2.2,
  brook: [] as Vec2[],
  brookHalf: 1.6,
  lake: { x: 66, z: 10.5, rx: 0, rz: 0 },
  streets: [
    {
      half: 1.5,
      points: [
        { x: 14, z: 0 },
        { x: 8, z: 0 },
        { x: 3, z: 0 },
        { x: 3, z: -2 },
      ],
    },
    {
      half: 1.1,
      points: [
        { x: 3, z: 0 },
        { x: 3, z: 2.4 },
      ],
    },
    {
      half: 1.1,
      points: [
        { x: 8, z: 0 },
        { x: 9, z: 3 },
        { x: 9, z: 5 },
      ],
    },
  ] as { half: number; points: Vec2[] }[],
  hills: [
    { x: 46, z: -27, r: 6, h: 1.4 },
    { x: 78, z: 8, r: 6, h: 1.2 },
    { x: 33, z: 22, r: 5, h: 1.0 },
    { x: 62, z: -26, r: 5, h: 0.9 },
  ],
  chests: [] as ChestDef[],
  /** Reserved position for a future hydro plan; no watermill is spawned in the starter yard. */
  hydro: { x: -3.6, z: -8.2 } as Vec2,
  /**
   * The mine head (design units): at the foot of the southern mountain, a short walk from the gate,
   * its mouth toward the gate square.
   */
  caves: [{ x: 9, z: 6.6, front: { x: 9, z: 1.6 } }] as [Vec2 & { front?: Vec2 }],
};

function scaleMap(d: typeof DESIGN): typeof DESIGN {
  return {
    ...d,
    minX: Math.round(d.minX * WORLD),
    maxX: Math.round(d.maxX * WORLD),
    minZ: Math.round(d.minZ * WORLD),
    maxZ: Math.round(d.maxZ * WORLD),
    border: d.border * 1.3,
    keep: wp(d.keep),
    keepRadius: d.keepRadius * 1.35,
    wallX: w(d.wallX),
    gate: wp(d.gate),
    passHalf: w(d.passHalf),
    innerHalf: w(d.innerHalf),
    heroStart: wp(d.heroStart),
    storehouse: wp(d.storehouse),
    stores: Object.fromEntries(Object.entries(d.stores).map(([k, v]) => [k, wp(v)])) as typeof d.stores,
    market: wp(d.market),
    workshops: wp(d.workshops),
    launch: wp(d.launch),
    camps: d.camps.map((c) => ({ ...wp(c), leash: c.leash * 1.25 })),
    lanes: d.lanes.map((l) => ({ ...l, points: l.points.map(wp) })),
    river: d.river.map(wp),
    riverHalf: d.riverHalf * 1.25,
    brook: d.brook.map(wp),
    brookHalf: d.brookHalf * 1.25,
    streets: d.streets.map((s) => ({ half: s.half, points: s.points.map(wp) })),
    lake: { x: w(d.lake.x), z: w(d.lake.z), rx: d.lake.rx * WORLD, rz: d.lake.rz * WORLD },
    hills: d.hills.map((h) => ({ x: w(h.x), z: w(h.z), r: h.r * WORLD, h: h.h * 1.35 })),
    chests: d.chests.map(wp),
    caves: [{ ...wp(d.caves[0]), ...(d.caves[0].front && { front: wp(d.caves[0].front) }) }],
    hydro: wp(d.hydro),
  };
}

export const MAP = scaleMap(DESIGN);
