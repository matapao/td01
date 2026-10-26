export type { Cut, EarthState, Deposit } from './excavation-types.ts';
import type { Cut, EarthState, Deposit } from './excavation-types.ts';
import { tunnelDensity, tunnelSample, rockRelief, MINE_SEAMS } from './mine-routes.ts';
/** Permanent free-form excavation. Positive density is solid; edits are smooth, saved cavities. */
import type { Sim } from './sim.ts';
import type { Command, Hero } from './types.ts';
import { NODES, type ItemId } from './content.ts';
import { smoothstep } from '../core/math.ts';
import { MAP, WALL, MINE_REGION_X, groundHeight, sampleHeights, wallDist, type World } from './map.ts';
import { MINE_AT, MINERALS, type MineralId } from './mines.ts';
import { indoors } from './interiors.ts';
import {
  MINE_BLOCK_SIZE,
  mineBlockCenter,
  mineBlockCuts,
  mineBlockNormal,
  mineBlockRay,
  mineBlockSamples,
} from './mine-blocks.ts';
export { MINE_BLOCK_SIZE, mineBlockCenter } from './mine-blocks.ts';

export const ROCK_CHUNK = 2;
export const ROCK_STEP = 0.08;

export function cutDistance(c: Cut, x: number, y: number, z: number): number {
  const dx = x - c.x,
    dy = y - c.y,
    dz = z - c.z;
  if (c.depth === undefined)
    return Math.hypot(dx, dy, dz) - c.r + (c.soil ? 0 : 0.025 * wave(x * 3.4, y * 3.1, z * 3.7));
  const a = dx * c.nx! + dy * c.ny! + dz * c.nz!;
  // An ellipsoid in the contact frame, with a bounded, persistent chipped rim.
  return (
    Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - a * a) + ((a * c.r) / c.depth) ** 2) -
    c.r +
    0.004 * Math.abs(Math.sin(x * 21 + y * 17 + z * 13))
  );
}

export const freshEarth = (): EarthState => ({ cuts: [], haul: {}, beds: [] });
const wave = (x: number, y: number, z: number) =>
  Math.sin(x * 2.3 + Math.sin(z * 1.7)) * Math.sin(y * 2.7 + z * 1.3);
const hash = (x: number, y: number, z: number) => {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const key = (x: number, y: number, z: number) =>
  `${Math.floor(x / ROCK_CHUNK)},${Math.floor(y / ROCK_CHUNK)},${Math.floor(z / ROCK_CHUNK)}`;

/** Deterministic pockets continue as far as a player chooses to tunnel. No chamber boundaries. */
export function depositsNear(x: number, y: number, z: number, reach: number): Deposit[] {
  const out: Deposit[] = MINE_SEAMS.filter((p) => Math.hypot(x - p.x, y - p.y, z - p.z) < reach + p.r);
  const S = 5;
  for (let k = Math.floor((z - reach) / S); k <= Math.floor((z + reach) / S); k++)
    for (let j = Math.floor((y - reach) / S); j <= Math.floor((y + reach) / S); j++)
      for (let i = Math.floor((x - reach) / S); i <= Math.floor((x + reach) / S); i++) {
        const h = hash(i, j, k);
        if (h > 0.76) continue;
        const mineral = (1 + Math.floor(hash(i + 17, j - 7, k + 33) * 12)) as MineralId;
        out.push({
          x: (i + 0.2 + hash(i, j + 2, k) * 0.6) * S,
          y: (j + 0.2 + hash(i, j, k + 2) * 0.6) * S,
          z: (k + 0.2 + hash(i + 2, j, k) * 0.6) * S,
          r: 0.65 + h * 1.3,
          mineral,
        });
      }
  return out;
}

export class RockField {
  public readonly world: World;
  public readonly state: EarthState;

  private indexed = 0;
  private buckets = new Map<string, Cut[]>();
  private ores = new Map<string, Deposit[]>();
  constructor(world: World, state: EarthState) {
    this.world = world;
    this.state = state;
  }
  sync(): void {
    if (this.indexed > this.state.cuts.length) {
      this.indexed = 0;
      this.buckets.clear();
    }
    while (this.indexed < this.state.cuts.length) {
      // Saved cuts are validated dense records; the cursor is bounded by their current length.
      const c = this.state.cuts[this.indexed++]!;
      for (let z = Math.floor((c.z - c.r - 0.1) / 2); z <= Math.floor((c.z + c.r + 0.1) / 2); z++)
        for (let y = Math.floor((c.y - c.r - 0.1) / 2); y <= Math.floor((c.y + c.r + 0.1) / 2); y++)
          for (let x = Math.floor((c.x - c.r - 0.1) / 2); x <= Math.floor((c.x + c.r + 0.1) / 2); x++) {
            const k = `${x},${y},${z}`;
            const list = this.buckets.get(k) ?? [];
            list.push(c);
            this.buckets.set(k, list);
          }
    }
  }
  base(x: number, y: number, z: number, column?: ReturnType<typeof tunnelSample>, height?: number): number {
    if (x > MINE_REGION_X) {
      const dx = x - MINE_AT.x,
        dz = z - MINE_AT.z;
      const floor = 0.035 * wave(x, 0, z);
      const radius = 2.5 + 0.22 * Math.sin(dx * 0.9 + dz * 0.7);
      const roof = 2.6 + 0.32 * wave(x, y * 0.5, z);
      const relief = rockRelief(x, y, z);
      const hub = Math.max(Math.hypot(dx, dz) - radius + relief, floor - y, y - roof + relief);
      const shaft = Math.max(Math.abs(dx + 3.1) - 1.15, Math.abs(dz) - 0.85, -y, y - 2.2);
      return Math.min(hub, shaft, tunnelDensity(x, y, z, column));
    }
    return (height ?? sampleHeights(this.world.heights, x, z)) - y;
  }
  /** Meshing reuses one route/floor lookup for the entire vertical sample column. */
  columnSampler(x: number, z: number): (y: number) => number {
    if (x > MINE_REGION_X) {
      x = mineBlockCenter(x);
      z = mineBlockCenter(z);
    }
    const column = x > MINE_REGION_X ? tunnelSample(x, z) : undefined;
    const height = column ? undefined : sampleHeights(this.world.heights, x, z);
    return (y) => this.density(x, y, z, column, height);
  }
  /** A conservative all-height bound lets meshing skip untouched columns outside every cavity. */
  solidColumn(x: number, z: number): boolean {
    if (x <= MINE_REGION_X) return false;
    x = mineBlockCenter(x);
    z = mineBlockCenter(z);
    if (this.columns(x, z).length > 0 || tunnelSample(x, z).distance <= 0.45) return false;
    const dx = x - MINE_AT.x;
    const dz = z - MINE_AT.z;
    // Bedding and joints together lower the hub's radial density by at most 0.16 m.
    const hub = Math.hypot(dx, dz) - (2.5 + 0.22 * Math.sin(dx * 0.9 + dz * 0.7)) - 0.16;
    const shaft = Math.max(Math.abs(dx + 3.1) - 1.15, Math.abs(dz) - 0.85);
    return hub > 0 && shaft > 0;
  }
  density(
    x: number,
    y: number,
    z: number,
    column?: ReturnType<typeof tunnelSample>,
    height?: number,
  ): number {
    if (x > MINE_REGION_X) {
      x = mineBlockCenter(x);
      y = mineBlockCenter(y);
      z = mineBlockCenter(z);
    }
    let d = this.base(x, y, z, column, height);
    for (const c of this.buckets.get(key(x, y, z)) ?? []) {
      d = Math.min(d, cutDistance(c, x, y, z));
    }
    return d;
  }
  normal(x: number, y: number, z: number): { x: number; y: number; z: number } {
    if (x > MINE_REGION_X) return mineBlockNormal(x, y, z, (px, py, pz) => this.density(px, py, pz) > 0);
    const e = 0.025;
    const dx = this.density(x - e, y, z) - this.density(x + e, y, z);
    const dy = this.density(x, y - e, z) - this.density(x, y + e, z);
    const dz = this.density(x, y, z - e) - this.density(x, y, z + e);
    const n = Math.hypot(dx, dy, dz) || 1;
    return { x: dx / n, y: dy / n, z: dz / n };
  }
  ray(origin: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, far = 45) {
    this.sync();
    if (origin.x > MINE_REGION_X)
      return mineBlockRay(origin, dir, far, (x, y, z) => this.density(x, y, z) > 0);
    let prev = 0;
    // Short steps preserve tiny visible lips; binary refinement supplies precise cursor contact.
    for (let t = 0.08; t < far; t += Math.min(0.12, 0.04 + t * 0.004)) {
      const x = origin.x + dir.x * t,
        y = origin.y + dir.y * t,
        z = origin.z + dir.z * t;
      if (x < MAP.minX || x > MAP.maxX || z < MAP.minZ || z > MAP.maxZ) {
        if (x < MINE_REGION_X) continue;
      }
      if (this.density(x, y, z) <= 0) {
        prev = t;
        continue;
      }
      let a = prev,
        b = t;
      for (let n = 0; n < 9; n++) {
        const m = (a + b) / 2;
        if (this.density(origin.x + dir.x * m, origin.y + dir.y * m, origin.z + dir.z * m) > 0) b = m;
        else a = m;
      }
      const d = (a + b) / 2;
      const p = { x: origin.x + dir.x * d, y: origin.y + dir.y * d, z: origin.z + dir.z * d };
      return { ...p, ...{ normal: this.normal(p.x, p.y, p.z) }, distance: d };
    }
    return null;
  }
  floor(x: number, z: number): number {
    const deep = x > MINE_REGION_X;
    if (deep) {
      x = mineBlockCenter(x);
      z = mineBlockCenter(z);
    }
    const q = deep ? tunnelSample(x, z) : null;
    const base = deep
      ? Math.hypot(x - MINE_AT.x, z - MINE_AT.z) < 2.3 || q!.distance > 0.2
        ? 0
        : q!.floor
      : sampleHeights(this.world.heights, x, z);
    let bottom = base - 0.15,
      top = base + 1;
    // Only edited columns need a floor search. Search the lowest walkable cavity, not the mountain top.
    let edited = false;
    // Floor queries cache column edits separately to avoid scanning all excavated terrain.
    const cuts = this.columns(x, z);
    for (const c of cuts)
      if (Math.hypot(c.x - x, c.z - z) < c.r) {
        edited = true;
        bottom = Math.min(bottom, c.y - c.r - 0.1);
        top = Math.max(top, c.y + c.r + 0.9);
      }
    if (!edited && !deep) return base;
    if (deep) {
      // The upper face of a solid block supports the feet; scan edited depths as well as natural steps.
      const first = Math.floor(bottom / MINE_BLOCK_SIZE);
      const last = Math.ceil(top / MINE_BLOCK_SIZE);
      for (let cell = first; cell <= last; cell++) {
        const y = (cell + 0.5) * MINE_BLOCK_SIZE;
        if (
          this.density(x, y, z) > 0 &&
          this.density(x, y + MINE_BLOCK_SIZE, z) <= 0 &&
          this.density(x, y + 0.65, z) <= 0
        )
          return (cell + 1) * MINE_BLOCK_SIZE;
      }
      return Math.round(base / MINE_BLOCK_SIZE) * MINE_BLOCK_SIZE;
    }
    // Large untouched mountain tops need not be searched when a tunnel lies far below them.
    if (!deep) top = Math.min(top, Math.max(...cuts.map((c) => c.y + c.r + 1), bottom + 1.2));
    for (let y = bottom; y < top; y += 0.06) {
      if (this.density(x, y, z) > 0 && this.density(x, y + 0.08, z) <= 0 && this.density(x, y + 0.65, z) <= 0)
        return y + 0.07;
    }
    return base;
  }
  private columnCount = 0;
  private columnCuts = new Map<string, Cut[]>();
  columns(x: number, z: number): Cut[] {
    if (this.columnCount > this.state.cuts.length) {
      this.columnCuts.clear();
      this.columnCount = 0;
    }
    while (this.columnCount < this.state.cuts.length) {
      // This independent cursor follows the same validated, dense cut history.
      const c = this.state.cuts[this.columnCount++]!;
      for (let i = Math.floor((c.x - c.r - 0.1) / 2); i <= Math.floor((c.x + c.r + 0.1) / 2); i++)
        for (let k = Math.floor((c.z - c.r - 0.1) / 2); k <= Math.floor((c.z + c.r + 0.1) / 2); k++) {
          const id = `${i},${k}`,
            list = this.columnCuts.get(id) ?? [];
          list.push(c);
          this.columnCuts.set(id, list);
        }
    }
    return this.columnCuts.get(`${Math.floor(x / 2)},${Math.floor(z / 2)}`) ?? [];
  }
  mineral(x: number, y: number, z: number): MineralId {
    if (x > MINE_REGION_X) {
      x = mineBlockCenter(x);
      y = mineBlockCenter(y);
      z = mineBlockCenter(z);
    }
    if (x > MINE_REGION_X && Math.hypot(x - MINE_AT.x, y, z - MINE_AT.z) < 3.5) return 0;
    const id = `${Math.floor(x / 5)},${Math.floor(y / 5)},${Math.floor(z / 5)}`;
    let list = this.ores.get(id);
    if (!list) {
      list = depositsNear(x, y, z, 2.2);
      this.ores.set(id, list);
    }
    for (const p of MINE_SEAMS) if (Math.hypot(x - p.x, y - p.y, z - p.z) < p.r) return p.mineral;
    for (const p of list)
      if (Math.hypot(x - p.x, (y - p.y) * 1.2, z - p.z) < p.r + wave(x * 2, y * 2, z * 2) * 0.12)
        return p.mineral;
    return 0;
  }
}
/** Match the painted terrain: steep faces and high exposed ridges are rock, green ground is plantable. */
export function surfaceTool(field: RockField, x: number, y: number, z: number): 'pickaxe' | 'shovel' {
  if (x > MINE_REGION_X) return 'pickaxe';
  const normal = field.normal(x, y, z);
  const rock = Math.max(
    smoothstep(0.22, 0.42, 1 - normal.y),
    smoothstep(5.5, 9, sampleHeights(field.world.heights, x, z)) * 0.85,
  );
  return rock < 0.5 ? 'shovel' : 'pickaxe';
}
const fields = new WeakMap<Sim, RockField>();
export function earth(sim: Sim): RockField {
  sim.state.earth ??= freshEarth();
  let f = fields.get(sim);
  if (!f || f.state !== sim.state.earth) {
    f = new RockField(sim.world, sim.state.earth);
    fields.set(sim, f);
  }
  f.sync();
  return f;
}
export function earthFloor(sim: Sim, x: number, z: number): number {
  return earth(sim).floor(x, z);
}
export function earthWalkable(sim: Sim, x: number, z: number): boolean {
  const f = earth(sim),
    y = f.floor(x, z);
  if (x > MINE_REGION_X) return f.density(x, y + 0.18, z) <= 0 && f.density(x, y + 0.65, z) <= 0;
  return f.density(x, y + 0.18, z) < 0.06 && f.density(x, y + 0.65, z) < 0.03;
}

export function applyEarthCommand(sim: Sim, cmd: Command): boolean {
  if (cmd.t !== 'excavate' && cmd.t !== 'plant') return false;
  const h = sim.getAs(cmd.hero, 'hero');
  if (!h || h.dead || h.ride || h.transit || indoors(h.x)) return true;
  const deny = (reason: string) => sim.emit('denied', { hero: h.id, reason });
  if (![cmd.x, cmd.z].every(Number.isFinite)) return true;
  const f = earth(sim);
  if (cmd.t === 'plant') {
    if (!h.tools.includes('shovel')) return (deny('The Crafter Kit includes the shovel'), true);
    if (Math.hypot(h.x - cmd.x, h.z - cmd.z) > 2.4) return (deny('Walk closer to the planting spot'), true);
    if (
      cmd.x > MINE_REGION_X ||
      cmd.x < MAP.minX + 1 ||
      cmd.x > WALL.x - 3 ||
      cmd.z < MAP.minZ + 1 ||
      cmd.z > MAP.maxZ - 1
    )
      return (deny('Plant on green ground inside the village'), true);
    if (sim.state.buildings.some((b) => Math.hypot(b.x - cmd.x, b.z - cmd.z) < 2.5))
      return (deny('Leave the doorway and foundations clear'), true);
    const n = sim.state.nodes.find(
      (n) => n.kind === 'tree' && n.amount <= 0 && Math.hypot(n.x - cmd.x, n.z - cmd.z) < 1,
    );
    if (n?.planted) return (deny('This seed is already growing'), true);
    const bed = f.state.beds.find((b) => Math.hypot(b.x - cmd.x, b.z - cmd.z) < 0.6);
    if (!n?.prepared && !bed) {
      if (surfaceTool(f, cmd.x, sampleHeights(sim.world.heights, cmd.x, cmd.z), cmd.z) !== 'shovel')
        return (deny('Use green ground for planting'), true);
      if (n) n.prepared = true;
      else f.state.beds.push({ x: cmd.x, z: cmd.z, planted: false });
      h.earthAt = sim.state.time + 0.35;
      h.earthTool = 'shovel';
      h.anim = 'mine';
      sim.emit('denied', {
        hero: h.id,
        reason: 'Planting hole ready — use again to sow from the seed pouch',
      });
      return true;
    }
    if (bed?.planted) return (deny('This seed is already growing'), true);
    if (!h.tools.includes('seedPouch'))
      return (deny('The Crafter Kit includes the reusable seed pouch'), true);
    if (n) {
      n.planted = true;
      n.regrowT = 90;
      n.prepared = false;
    } else {
      if (sim.state.nodes.some((n) => n.amount > 0 && Math.hypot(n.x - cmd.x, n.z - cmd.z) < 1.5))
        return (deny('Leave a little room for the new tree'), true);
      sim.add('node', {
        id: sim.newId(),
        kind: 'tree',
        x: bed!.x,
        z: bed!.z,
        radius: 0.32,
        amount: 0,
        max: NODES.tree.amount,
        regrowT: 90,
        prop: -1,
        planted: true,
      });
      bed!.planted = true;
    }
    sim.emit('denied', { hero: h.id, reason: 'Seed planted — a new pine will grow here in 90 seconds' });
    return true;
  }
  if (!Number.isFinite(cmd.y) || (cmd.tool !== 'pickaxe' && cmd.tool !== 'shovel')) return true;
  if (!h.tools.includes(cmd.tool)) return (deny('Buy the complete Crafter Kit at the shop counter'), true);
  if ((h.earthAt ?? -1) > sim.state.time) return true;
  const floor = groundHeight(sim.world, h.x, h.z);
  if (Math.hypot(cmd.x - h.x, cmd.y - floor - 0.4, cmd.z - h.z) > 3)
    return (deny('Walk closer to the rock or ground'), true);
  const deep = cmd.x > MINE_REGION_X;
  if (
    !deep &&
    (cmd.x < MAP.minX + 0.2 || cmd.x > MAP.maxX - 0.2 || cmd.z < MAP.minZ + 0.2 || cmd.z > MAP.maxZ - 0.2)
  )
    return true;
  if (!deep && wallDist(cmd.x, cmd.z) < WALL.half + 0.5)
    return (deny('Keep the defensive wall and stairs supported'), true);
  if (!deep && sim.state.buildings.some((b) => Math.hypot(b.x - cmd.x, b.z - cmd.z) < 2.1))
    return (deny('Keep the building foundations supported'), true);
  // Resolve the first surface from the hero, not a nearby arbitrary point or a hidden back face.
  const origin = { x: h.x, y: floor + 0.5, z: h.z };
  const reach = Math.hypot(cmd.x - origin.x, cmd.y - origin.y, cmd.z - origin.z);
  if (reach < 0.05) return true;
  const direction = {
    x: (cmd.x - origin.x) / reach,
    y: (cmd.y - origin.y) / reach,
    z: (cmd.z - origin.z) / reach,
  };
  const contact = f.ray(origin, direction, reach + 0.16);
  if (!contact || Math.abs(contact.distance - reach) > 0.075)
    return (deny('Work the exposed face first'), true);
  const normal = contact.normal;
  const soil = surfaceTool(f, cmd.x, cmd.y, cmd.z) === 'shovel';
  if (cmd.tool === 'shovel' && !soil)
    return (deny('Use the pickaxe on rock; the shovel works green ground'), true);
  if (cmd.tool === 'pickaxe' && soil) return (deny('Use the shovel on green ground'), true);
  if (soil && cmd.tool === 'shovel')
    return applyEarthCommand(sim, { t: 'plant', hero: h.id, x: cmd.x, z: cmd.z });
  const blocks = deep ? mineBlockCuts(contact, cmd.wide ?? false, (x, y, z) => f.density(x, y, z) > 0) : null;
  if (blocks && !blocks.length) return true;
  const incidence = Math.max(0, -(normal.x * direction.x + normal.y * direction.y + normal.z * direction.z));
  const r = cmd.wide ? 0.23 : 0.1;
  const mineral = f.mineral(contact.x, contact.y, contact.z);
  // Six local probes distinguish a supported face from an exposed lip. No connected-rock search.
  let exposed = 0;
  for (const [x, y, z] of [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ] as const)
    if (f.density(contact.x + x * r, contact.y + y * r, contact.z + z * r) < 0) exposed++;
  const joint =
    1 -
    Math.abs(Math.sin((contact.x - MINE_AT.x) * 1.25 + (contact.z - MINE_AT.z) * 0.74 - contact.y * 0.22));
  const hardness = 1 + (MINERALS[mineral].hits - 2) * 0.12;
  const depth = Math.min(
    r * 0.9,
    ((cmd.wide ? 0.16 : 0.075) * (0.55 + 0.45 * incidence) * (0.94 + exposed * 0.02 + joint * 0.08)) /
      hardness,
  );
  const c: Cut = blocks?.[0] ?? {
    x: contact.x - normal.x * depth * 0.15,
    y: contact.y - normal.y * depth * 0.15,
    z: contact.z - normal.z * depth * 0.15,
    r,
    soil,
    nx: normal.x,
    ny: normal.y,
    nz: normal.z,
    depth,
  };
  const samples = blocks
    ? mineBlockSamples(
        c,
        (x, y, z) => f.density(x, y, z) > 0,
        (x, y, z) => cutDistance(c, x, y, z) < 0,
      )
    : null;
  let solid = samples?.length ?? 0,
    total = 0;
  if (!samples)
    for (let z = -1; z <= 1; z++)
      for (let y = -1; y <= 1; y++)
        for (let x = -1; x <= 1; x++) {
          const d = Math.hypot(x, y, z) * 0.5;
          if (d > 1) continue;
          total++;
          const px = c.x + x * r * 0.5,
            py = c.y + y * r * 0.5,
            pz = c.z + z * r * 0.5;
          if (cutDistance(c, px, py, pz) < 0 && f.density(px, py, pz) > 0) solid++;
        }
  if (!solid) return true;
  h.earthAimY = Math.atan2(cmd.y - floor - 0.5, Math.hypot(cmd.x - h.x, cmd.z - h.z));
  h.earthAt = sim.state.time + 0.33;
  h.earthTool = cmd.tool;
  h.anim = 'mine';
  h.animT = 0;
  h.facing = Math.atan2(cmd.x - h.x, cmd.z - h.z);
  const item: ItemId = MINERALS[mineral].item;
  f.state.cuts.push(...(blocks ?? [c]));
  f.sync();
  const volume = samples
    ? samples.length * MINE_BLOCK_SIZE ** 3
    : ((4 / 3) * Math.PI * r ** 3 * solid) / total;
  const yields = new Map<ItemId, number>();
  if (samples)
    for (const block of samples) {
      const resource = MINERALS[f.mineral(block.x, block.y, block.z)].item;
      yields.set(resource, (yields.get(resource) ?? 0) + MINE_BLOCK_SIZE ** 3);
    }
  else yields.set(item, volume);
  const yieldPerVolume = volume * 180 <= 3 ? 180 : 3 / volume;
  for (const [resource, removedVolume] of yields) {
    f.state.haul[resource] = (f.state.haul[resource] ?? 0) + removedVolume * yieldPerVolume;
    const count = Math.floor(f.state.haul[resource] ?? 0);
    if (!count) continue;
    f.state.haul[resource]! -= count;
    const added = sim.addToBag(h, resource, count);
    for (let i = added; i < count; i++) sim.spawnDrop(resource, h.x, h.z, cmd.x, cmd.z, h.id);
  }
  sim.emit('earthHit', { hero: h.id, ...c, x: contact.x, y: contact.y, z: contact.z, mineral, item, volume });
  return true;
}

export function scannerReadings(sim: Sim, h: Hero) {
  const f = earth(sim),
    y = groundHeight(sim.world, h.x, h.z) + 0.5;
  return depositsNear(h.x, y, h.z, 12)
    .filter((p) => {
      const d = Math.hypot(p.x - h.x, p.y - y, p.z - h.z);
      return d < 12;
    })
    .flatMap((p) => {
      // Approximate remaining solid volume. A radar return is an estimate, never exact inventory.
      let remaining = 0;
      for (const [dx, dy, dz] of [
        [0, 0, 0],
        [0.5, 0, 0],
        [-0.5, 0, 0],
        [0, 0.5, 0],
        [0, -0.5, 0],
        [0, 0, 0.5],
        [0, 0, -0.5],
        [0.85, 0, 0],
        [-0.85, 0, 0],
        [0, 0.85, 0],
        [0, -0.85, 0],
        [0, 0, 0.85],
        [0, 0, -0.85],
      ] as const)
        if (
          f.density(p.x + dx * p.r, p.y + dy * p.r, p.z + dz * p.r) > 0 &&
          f.mineral(p.x + dx * p.r, p.y + dy * p.r, p.z + dz * p.r) === p.mineral
        )
          remaining++;
      if (!remaining) return [];
      const amount = Math.max(1, Math.round((((4 / 3) * Math.PI * p.r ** 3 * remaining) / 13) * 22));
      return [
        {
          ...p,
          distance: Math.hypot(p.x - h.x, p.y - y, p.z - h.z),
          low: Math.max(1, Math.floor((amount * 0.65) / 5) * 5),
          high: Math.ceil((amount * 1.3) / 5) * 5,
          name: MINERALS[p.mineral].name,
        },
      ];
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 12);
}
