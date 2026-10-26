// World grids share cell dimensions; free() checks cell validity and wet() checks inGrid before reading.
/**
 * Which Forest Nature model stands where, in which colours and at what size. All of it is view only:
 * the sim never sees it, and nothing here touches the sim's random numbers (each choice hashes the
 * prop's index or the spot, so it is the same on every load, in every LAN client).
 *
 * - Every tree node keeps its spot, collider and gameplay. It becomes a KayKit tree of its kind
 *   (broad leafy trees for the oaks, umbrella crowns for lone meadow trees, conifers for the pines,
 *   slender trees for the birches, bare snags for the dead), sized so its trunk fills the collider
 *   and it stands about as tall as the tree it replaces.
 * - Seasons by region: summer greens in the home ring by the gate, turning to autumn further out —
 *   orange (the kit's palette 6), golden and a few red — while the conifers stay evergreen (a few
 *   larches turn gold); bare snags by the crypts.
 * - Stone nodes become KayKit rocks: grey near home, darker out in the autumn woods.
 * - Dressing: bushes and grass tufts at the feet of trees, pebbles by the rocks, a few flowering
 *   shrubs in the home meadows, boulders bedded where the cliffs rise, stones and tufts along the
 *   river banks. Big things only where nobody can walk; what stands where you walk is small enough
 *   to walk through, and none of it in the tower band by the gate.
 */
import { hash32 } from '../core/rng.ts';
import { Noise2D } from '../core/noise.ts';
import { clamp, smoothstep } from '../core/math.ts';
import { CELL, GRID_W, MAP, WALL, edgeDist, groundHeight, inGrid, w, wallDist } from '../game/map.ts';
import type { Prop } from '../game/scenery.ts';
import type { Sim } from '../game/sim.ts';
import { BARK, LEAF, STONE, type NatureKit, type NatureModel, type Palette } from './nature.ts';

export type Category = 'tree' | 'rock' | 'bush' | 'grass' | 'pebble';

export interface Placement {
  model: string;
  cat: Category;
  x: number;
  y: number;
  z: number;
  rot: number;
  /** Uniform scale, `sx` stretching it across (x and z) and `sy` up. */
  s: number;
  sx: number;
  sy: number;
  pal: Palette;
  /** The prop it dresses as (a node's visual), or -1 for dressing. */
  prop: number;
  /** World footprint radius (dressing hides under new buildings) and trunk radius (trees). */
  r: number;
  trunk: number;
  /** World crown reach (for the blob shadow under a tree). */
  reach: number;
}

type Pick = readonly [model: string, weight: number];

/** The oaks: big rounded crowns on a stout trunk. */
const BROAD: Pick[] = [
  ['Tree_2_E', 3],
  ['Tree_2_D', 2],
  ['Tree_1_C', 1],
  ['Tree_7_B', 1],
];
/** A lone tree out in a meadow: a wide crown that hangs low (in a wood it would hide the way). */
const LONE: Pick[] = [
  ['Tree_3_C', 1],
  ['Tree_1_C', 1],
];
/** The pines. */
const CONIFER: Pick[] = [['Tree_5_F', 1]];
/** The birches: tall and slender. */
const SLENDER: Pick[] = [
  ['Tree_7_C', 2],
  ['Tree_6_C', 2],
  ['Tree_6_B', 1],
  ['Tree_7_B', 1],
];
/** Dead snags (the blight round the crypts, graveyards). */
const BARE: Pick[] = [
  ['Tree_Bare_2_B', 2],
  ['Tree_Bare_1_C', 2],
  ['Tree_Bare_2_A', 1],
];
/** Stone to quarry: layered outcrops, blocks and boulders. */
const OUTCROP: Pick[] = [
  ['Rock_1_J', 1],
  ['Rock_1_K', 1],
  ['Rock_2_E', 1],
  ['Rock_3_K', 1],
  ['Rock_3_N', 1],
];
const BUSH: Pick[] = [
  ['Bush_1_D', 2],
  ['Bush_2_E', 1],
  ['Bush_4_E', 2],
];
/** Flowering shrubs: a small round bush in pink, red or gold. */
const FLOWERS: Pick[] = [['Bush_1_D', 1]];
const GRASS: Pick[] = [
  ['Grass_1_C', 1],
  ['Grass_2_B', 1],
];
const PEBBLES: Pick[] = [
  ['Rock_5_C', 1],
  ['Rock_3_C', 1],
];
/** Boulders at the mountain foot (not the outcrops you quarry). */
const BOULDERS: Pick[] = [
  ['Rock_3_Q', 2],
  ['Rock_3_R', 2],
  ['Rock_3_O', 1],
  ['Rock_4_H', 1],
];

/** Height of each generated tree kind (model units × its prop scale = metres). */
const GEN_HEIGHT: Record<string, number> = { oak: 0.78, autumn: 0.79, pine: 1.05, birch: 0.78, dead: 0.58 };

/** A deterministic number in [0, 1) for (seed, salt). */
function h01(seed: number, salt: number): number {
  return hash32(Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) / 4294967296;
}

function pick(list: readonly Pick[], u: number): string {
  let total = 0;
  for (const [, wt] of list) total += wt;
  let t = u * total;
  for (const [m, wt] of list) if ((t -= wt) < 0) return m;
  const last = list.at(-1);
  if (!last) throw new Error('A forest model distribution must not be empty');
  return last[0];
}

const noise = new Noise2D(MAP.seed ^ 0x6e61);
/** The middle of our lands: the town by the bridge. */
const TOWN = { x: w(-8), z: 0 };

/** How far into autumn the land is here: 0 round the town and the gate, 1 out in the back woods. */
export function autumnAt(x: number, z: number): number {
  const d = Math.hypot(x - TOWN.x, (z - TOWN.z) * 1.15);
  const wob = 14 * noise.noise(x * 0.03, z * 0.03);
  let a = smoothstep(52, 84, d + wob);
  // The dead's side of the wall: the blighted woods by the crypts.
  if (x > w(66)) a = Math.max(a, 0.92);
  return a;
}

/**
 * Colours of a tree by kind and season (`u`, `v` decide the mix): summer greens on brown trunks
 * (birch-white for some slender ones), autumn's orange, gold and red on the kit's pale autumn trunks,
 * evergreen conifers (a few larches turn), bleached or ashen snags.
 */
function treePalette(
  kind: 'broad' | 'conifer' | 'slender' | 'bare',
  autumn: boolean,
  u: number,
  v: number,
): Palette {
  if (kind === 'bare') return [LEAF.green, v < 0.6 ? BARK.pale : BARK.ash, STONE.grey];
  if (kind === 'conifer') {
    if (autumn && u < 0.25) return [u < 0.12 ? LEAF.golden : LEAF.orange, BARK.pale, STONE.grey];
    return [
      u < (autumn ? 0.75 : 0.55) ? LEAF.emerald : LEAF.green,
      v < 0.6 ? BARK.dark : BARK.brown,
      STONE.grey,
    ];
  }
  if (autumn)
    return [
      u < 0.55 ? LEAF.orange : u < 0.87 ? LEAF.golden : LEAF.red,
      v < 0.75 ? BARK.pale : BARK.light,
      STONE.grey,
    ];
  const lime = kind === 'slender' ? 0.35 : 0.12;
  return [
    u < lime ? LEAF.lime : LEAF.green,
    kind === 'slender' && v < 0.5 ? BARK.pale : v < 0.6 ? BARK.dark : BARK.brown,
    STONE.grey,
  ];
}

/**
 * How much wider (>1) or slimmer a model must be drawn for its trunk to fill a `trunk` collider
 * at `height` (both metres): a property of the model's build against the prop's, whatever its size.
 */
function girth(m: NatureModel, trunk: number, height: number): number {
  return (trunk * m.height) / (m.trunk * height);
}

/**
 * Scale for a model so it stands about `height` tall with its trunk filling `trunk`: it is stretched
 * a little across first (a 5th slimmer to a 4th wider, aiming at a trunk just inside the collider so
 * you walk right up to the bark), and gives up height (up to 30%) only past that.
 */
function fit(m: NatureModel, trunk: number, height: number): { s: number; sx: number } {
  const sx = clamp(girth(m, trunk, height) * 0.88, 0.82, 1.25);
  let s = height / m.height;
  const fill = (m.trunk * s * sx) / trunk;
  if (fill < 0.7) s *= Math.min(1.3, 0.7 / fill);
  else if (fill > 1.05) s *= Math.max(0.75, 1.05 / fill);
  return { s, sx };
}

/** The lowest ground under a footprint (so nothing floats on a slope). */
function lowGround(sim: Sim, x: number, z: number, r: number): number {
  let y = groundHeight(sim.world, x, z);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    y = Math.min(y, groundHeight(sim.world, x + Math.cos(a) * r, z + Math.sin(a) * r));
  }
  return y;
}

/** A tree node's KayKit look. `lone`: no other tree near (a meadow tree). */
export function treeLook(kit: NatureKit, p: Prop, i: number, y: number, lone: boolean): Placement {
  const gen = p.model.replace(/_\d+$/, '');
  const kind = gen === 'pine' ? 'conifer' : gen === 'birch' ? 'slender' : gen === 'dead' ? 'bare' : 'broad';
  const autumn = gen === 'autumn' || h01(i, 1) < autumnAt(p.x, p.z);
  const trunk = p.trunk ?? p.scale * 0.04;
  const height = (GEN_HEIGHT[gen] ?? 0.8) * p.scale * (0.92 + 0.18 * h01(i, 4));
  // Of the models of its kind, those built like it (its trunk for its height); else any of the kind.
  const all =
    kind === 'conifer'
      ? CONIFER
      : kind === 'slender'
        ? SLENDER
        : kind === 'bare'
          ? BARE
          : lone && h01(i, 2) < 0.6
            ? LONE
            : BROAD;
  const built = all.filter(([n]) => {
    const g = girth(kit.get(n), trunk, height);
    return g > 0.55 && g < 1.85;
  });
  const m = kit.get(pick(built.length ? built : all, h01(i, 3)));
  const { s, sx } = fit(m, trunk, height);
  const wide = sx * (0.96 + 0.08 * h01(i, 5));
  return {
    model: m.name,
    cat: 'tree',
    x: p.x,
    y,
    z: p.z,
    rot: p.rot,
    s,
    sx: wide,
    sy: 1,
    pal: treePalette(kind, autumn, h01(i, 6), h01(i, 7)),
    prop: i,
    r: m.reach * s * wide,
    trunk: m.trunk * s * wide,
    reach: m.reach * s * wide,
  };
}

/** A stone node's KayKit look: about as wide as its collider, a little lower than the kit has it. */
export function rockLook(kit: NatureKit, p: Prop, i: number, y: number): Placement {
  const m = kit.get(pick(OUTCROP, h01(i, 11)));
  const trunk = p.trunk ?? 0.5;
  const s = (trunk * 1.18) / m.trunk;
  const dark = h01(i, 12) < autumnAt(p.x, p.z) * 0.8;
  return {
    model: m.name,
    cat: 'rock',
    x: p.x,
    y: y - 0.04 * m.height * s,
    z: p.z,
    rot: p.rot,
    s,
    sx: 1,
    sy: 0.82,
    pal: [LEAF.green, BARK.dark, dark ? STONE.dark : STONE.grey],
    prop: i,
    r: m.reach * s,
    trunk: trunk,
    reach: m.reach * s,
  };
}

/**
 * The undergrowth: dressing the sim never sees. `trees` and `rocks` are the node looks (dressed at
 * their feet). Deterministic: a view-only seed per spot.
 */
export function dressing(kit: NatureKit, sim: Sim, trees: Placement[], rocks: Placement[]): Placement[] {
  const out: Placement[] = [];
  const world = sim.world;
  const cell = (x: number, z: number) => {
    const cx = Math.floor(x - MAP.minX);
    const cz = Math.floor(z - MAP.minZ);
    return inGrid(cx, cz) ? cz * GRID_W + cx : -1;
  };
  /**
   * Open ground you walk on, off the roads and out of the water and the tower band by the gate.
   * `clear`: away from every prop's footprint too (else only buildings and walls count, so a tuft
   * may hug a trunk or a rock).
   */
  const free = (x: number, z: number, roadGap = 0.9, clear = true) => {
    const k = cell(x, z);
    if (k < 0 || !(clear ? sim.walkStatic[k] : sim.walkFine[k])) return false;
    if (groundHeight(world, x, z) < MAP.waterLevel + 0.2) return false;
    const ld = world.laneDist[k]!;
    if (ld < MAP.roadHalf + roadGap || world.streetDist[k]! < 1.7 + roadGap * 0.6) return false;
    // The tower band along the roads beyond the wall stays clear.
    if (x > WALL.x && ld < MAP.roadHalf + 8) return false;
    return true;
  };
  const add = (
    model: string,
    cat: Category,
    x: number,
    z: number,
    height: number,
    pal: Palette,
    seed: number,
    y?: number,
  ) => {
    const m = kit.get(model);
    const s = height / m.height;
    const r = m.reach * s;
    out.push({
      model,
      cat,
      x,
      y: y ?? lowGround(sim, x, z, Math.min(r, 1.5)) - 0.02,
      z,
      rot: h01(seed, 21) * Math.PI * 2,
      s,
      sx: 0.9 + 0.2 * h01(seed, 22),
      sy: 1,
      pal,
      prop: -1,
      r,
      trunk: 0,
      reach: r,
    });
  };
  const bushPal = (x: number, z: number, u: number): Palette => {
    const a = u < autumnAt(x, z);
    return [
      a ? (u < 0.3 ? LEAF.golden : LEAF.orange) : u > 0.85 ? LEAF.emerald : LEAF.green,
      BARK.dark,
      STONE.grey,
    ];
  };
  const grassPal = (x: number, z: number, u: number): Palette => [
    u < autumnAt(x, z) * 0.7 ? (u < 0.2 ? LEAF.orange : LEAF.golden) : LEAF.green,
    BARK.dark,
    STONE.grey,
  ];

  // At the feet of the trees: a bush or two, a few tufts hugging the trunk, now and then a flowering shrub.
  trees.forEach((t, ti) => {
    const seed = 1000 + ti * 13;
    const bare = t.model.startsWith('Tree_Bare');
    const tufts = 1 + Math.floor(h01(seed, 1) * 3);
    for (let k = 0; k < tufts; k++) {
      const a = h01(seed, 10 + k) * Math.PI * 2;
      const d = t.trunk + 0.08 + h01(seed, 20 + k) * 0.8;
      const x = t.x + Math.cos(a) * d;
      const z = t.z + Math.sin(a) * d;
      if (!free(x, z, 0.6, false)) continue;
      add(
        pick(GRASS, h01(seed, 30 + k)),
        'grass',
        x,
        z,
        0.24 + 0.16 * h01(seed, 40 + k),
        bare ? [LEAF.golden, BARK.dark, STONE.grey] : grassPal(x, z, h01(seed, 50 + k)),
        seed + k,
      );
    }
    if (bare) return;
    const bushes = h01(seed, 2) < 0.55 ? 1 + (h01(seed, 3) < 0.3 ? 1 : 0) : 0;
    for (let k = 0; k < bushes; k++) {
      const a = h01(seed, 60 + k) * Math.PI * 2;
      const d = t.trunk + 1.0 + h01(seed, 70 + k) * 1.9;
      const x = t.x + Math.cos(a) * d;
      const z = t.z + Math.sin(a) * d;
      if (!free(x, z)) continue;
      add(
        pick(BUSH, h01(seed, 80 + k)),
        'bush',
        x,
        z,
        0.42 + 0.4 * h01(seed, 90 + k),
        bushPal(x, z, h01(seed, 100 + k)),
        seed + 50 + k,
      );
    }
    if (autumnAt(t.x, t.z) < 0.3 && h01(seed, 4) < 0.14) {
      const a = h01(seed, 110) * Math.PI * 2;
      const d = t.trunk + 1.2 + h01(seed, 111) * 2.2;
      const x = t.x + Math.cos(a) * d;
      const z = t.z + Math.sin(a) * d;
      const u = h01(seed, 112);
      if (free(x, z))
        add(
          pick(FLOWERS, h01(seed, 113)),
          'bush',
          x,
          z,
          0.2 + 0.12 * h01(seed, 114),
          [u < 0.45 ? LEAF.pink : u < 0.75 ? LEAF.red : LEAF.golden, BARK.dark, STONE.grey],
          seed + 90,
        );
    }
  });

  // Pebbles and tufts round the rocks.
  rocks.forEach((rk, ri) => {
    const seed = 50000 + ri * 17;
    const n = 1 + Math.floor(h01(seed, 1) * 3);
    for (let k = 0; k < n; k++) {
      const a = h01(seed, 10 + k) * Math.PI * 2;
      const d = rk.trunk * 1.15 + 0.1 + h01(seed, 20 + k) * 0.9;
      const x = rk.x + Math.cos(a) * d;
      const z = rk.z + Math.sin(a) * d;
      if (!free(x, z, 0.4, false)) continue;
      const pal: Palette = [LEAF.green, BARK.dark, rk.pal[2]];
      if (k === 0 || h01(seed, 30 + k) < 0.5)
        add(pick(PEBBLES, h01(seed, 40 + k)), 'pebble', x, z, 0.14 + 0.16 * h01(seed, 50 + k), pal, seed + k);
      else
        add(
          pick(GRASS, h01(seed, 60 + k)),
          'grass',
          x,
          z,
          0.24 + 0.14 * h01(seed, 70 + k),
          grassPal(x, z, h01(seed, 80 + k)),
          seed + 20 + k,
        );
    }
  });

  // The mountain foot: boulders bedded in the rising cliffs (where nobody walks), shrubs and tufts
  // along the edge of the walkable land below them.
  const edge = (x: number, z: number) => edgeDist(x, z);
  const nearThing = (x: number, z: number) =>
    MAP.caves.some((c) => Math.hypot(x - c.x, z - c.z) < 9) ||
    wallDist(x, z) < 5 ||
    world.lanes.some((l) => Math.hypot(x - l.xs[0]!, z - l.zs[0]!) < 14);
  /** The cliffs start where you can't walk any more (see map.ts: CELL.BORDER). */
  const foot = MAP.border - 1.5;
  const STEP = 3.4;
  for (let gz = MAP.minZ + 2; gz < MAP.maxZ - 2; gz += STEP) {
    for (let gx = MAP.minX + 2; gx < MAP.maxX - 2; gx += STEP) {
      const seed = 90000 + Math.round(gx * 7.3) * 1009 + Math.round(gz * 3.1);
      const x = gx + (h01(seed, 1) - 0.5) * STEP * 0.9;
      const z = gz + (h01(seed, 2) - 0.5) * STEP * 0.9;
      const e = edge(x, z);
      if (e < foot - 2.6 || e > MAP.border + 2.5 || nearThing(x, z)) continue;
      const u = h01(seed, 3);
      if (e < foot - 0.1) {
        if (u > 0.55) continue;
        // Its foot reaches no more than a step past the cliff's into the walkable land.
        const m = kit.get(pick(BOULDERS, h01(seed, 12)));
        const size = Math.min(0.9 + 1.5 * h01(seed, 13), foot + 0.3 - e);
        if (size < 0.6 || groundHeight(world, x, z) < 0.6) continue;
        // Never taller than a cottage (a tall model sized by its foot would tower).
        const s = Math.min(size / m.trunk, 3 / m.height);
        const dark = h01(seed, 14) < autumnAt(x, z) * 0.8;
        out.push({
          model: m.name,
          cat: 'rock',
          x,
          y: lowGround(sim, x, z, size * 0.8) - 0.12 * m.height * s,
          z,
          rot: h01(seed, 15) * Math.PI * 2,
          s,
          sx: 1,
          sy: 0.8 + 0.4 * h01(seed, 16),
          pal: [LEAF.green, BARK.dark, dark ? STONE.dark : STONE.grey],
          prop: -1,
          r: m.reach * s,
          trunk: size,
          reach: m.reach * s,
        });
      } else if (u < 0.22 && free(x, z, 2)) {
        add(
          pick(BUSH, h01(seed, 17)),
          'bush',
          x,
          z,
          0.45 + 0.45 * h01(seed, 18),
          bushPal(x, z, h01(seed, 19)),
          seed,
        );
        if (h01(seed, 20) < 0.6) {
          const x2 = x + (h01(seed, 21) - 0.5) * 1.6;
          const z2 = z + (h01(seed, 22) - 0.5) * 1.6;
          if (free(x2, z2, 2))
            add(
              pick(GRASS, h01(seed, 23)),
              'grass',
              x2,
              z2,
              0.26 + 0.14 * h01(seed, 24),
              grassPal(x2, z2, h01(seed, 25)),
              seed + 1,
            );
        }
      }
    }
  }

  // Rounded stones and tufts along the river banks and the lake shore.
  const wet = (cx: number, cz: number) =>
    inGrid(cx, cz) && (world.cells[cz * GRID_W + cx]! & CELL.WATER) !== 0;
  for (let cz = 1; cz < world.cells.length / GRID_W - 1; cz++) {
    for (let cx = 1; cx < GRID_W - 1; cx++) {
      if (
        wet(cx, cz) ||
        !(
          wet(cx + 1, cz) ||
          wet(cx - 1, cz) ||
          wet(cx, cz + 1) ||
          wet(cx, cz - 1) ||
          wet(cx + 2, cz) ||
          wet(cx - 2, cz) ||
          wet(cx, cz + 2) ||
          wet(cx, cz - 2)
        )
      )
        continue;
      const seed = 200000 + cz * 977 + cx;
      const u = h01(seed, 1);
      if (u > 0.24) continue;
      const x = MAP.minX + cx + h01(seed, 2);
      const z = MAP.minZ + cz + h01(seed, 3);
      if (!free(x, z, 1.2)) continue;
      if (u < 0.13)
        add(
          pick(PEBBLES, h01(seed, 4)),
          'pebble',
          x,
          z,
          0.16 + 0.22 * h01(seed, 5),
          [LEAF.green, BARK.dark, h01(seed, 6) < autumnAt(x, z) * 0.8 ? STONE.dark : STONE.grey],
          seed,
        );
      else
        add(
          pick(GRASS, h01(seed, 7)),
          'grass',
          x,
          z,
          0.26 + 0.16 * h01(seed, 8),
          grassPal(x, z, h01(seed, 9)),
          seed + 1,
        );
    }
  }
  return out.filter((p) => p.cat !== 'rock' && p.cat !== 'pebble');
}
