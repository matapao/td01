/** KayKit dungeon pieces at the characters' scale (their characters stand ~2.4 units tall). */
export const IN_SCALE = 0.21;

/** One KayKit unit indoors (m). */
export const U = IN_SCALE;

/** Kits a room is furnished from ('town' streams in after the world; its pieces join the room when it lands). */
export type KitPiece = 'dungeon' | 'tools' | 'medieval' | 'resources' | 'town';

/** The four walls: back (−z), front (+z, the door), left (−x), right (+x). */
export type Side = 'back' | 'front' | 'left' | 'right';

/** One model in a room, in the room's frame (origin: the middle of the floor; +z towards the door; m). */
export interface Piece {
  kit: KitPiece;
  model: string;
  x: number;
  z: number;
  y?: number;
  rot?: number;
  /** Tipped over about its own x first (tools laid flat). */
  rx?: number;
  scale: number;
  /** The walls it belongs to: it goes when any of them is cut away. */
  sides?: Side[];
  /** Take only this part of the model (a node inside it: the lumbermill's saw blade). */
  part?: string;
}

/**
 * Things in a room made in code or moving with the work: the sawmill's spinning blade, the forge's
 * bellows that pump, the arcanist's rune circle that turns over the bench, crystals that glow.
 */
export interface Fixture {
  kind: 'saw' | 'bellows' | 'runes' | 'crystal' | 'moulds';
  x: number;
  y: number;
  z: number;
  rot: number;
  /** Size (m). */
  s: number;
}

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** A raised floor (a balcony): the top you walk on. */
export interface Level extends Rect {
  y: number;
}

/** Stairs: the floor climbs from `ya` at the low-coordinate end to `yb` at the other, along `axis`. */
export interface Ramp extends Rect {
  axis: 'x' | 'z';
  ya: number;
  yb: number;
}

export interface InteriorDef {
  name: string;
  /** Half the floor's size inside the walls (m). */
  hx: number;
  hz: number;
  pieces: Piece[];
  /** Floor nobody stands on: furniture, the hearth, the balcony's edge, the stair's side. */
  solids: Rect[];
  levels: Level[];
  ramps: Ramp[];
  /** The doorway in the front wall: its middle (x) and half its width (m). */
  door: { x: number; hw: number };
  /** Where you stand to work, and which way you face there (yaw). */
  bench: { x: number; z: number; face: number };
  /** Where the station's input and output show (on a crate, on the workbench). */
  trays: { input: { x: number; y: number; z: number }; output: { x: number; y: number; z: number } };
  /** Open fires: where their flames burn. */
  fires: { x: number; y: number; z: number; size: number }[];
  /** Torches on the walls: where (their foot), how high, which way they point into the room, and their wall. */
  torches: { x: number; y: number; z: number; rot: number; side: Side }[];
  /** A stone forge, if the room has one: its footprint, the height of its coal bed, and its chimney's top. */
  hearth?: { x0: number; z0: number; x1: number; z1: number; h: number; top: number };
  /** Made in code / moving with the work (see Fixture). */
  fixtures?: Fixture[];
  /** Soft coloured lights that aren't flames: a cauldron's glow, crystals (painted pools). */
  glows?: { x: number; y: number; z: number; color: string; r: number }[];
}

// ---- Building a room ----------------------------------------------------------------------------

export type WallKind =
  | 'wall'
  | 'wall_scaffold'
  | 'wall_window_open'
  | 'wall_window_closed'
  | 'wall_window_open_scaffold'
  | 'wall_window_closed_scaffold'
  | 'wall_archedwindow_open'
  | 'wall_archedwindow_gated'
  | 'wall_gated'
  | 'wall_shelves'
  | 'wall_arched'
  | 'wall_cracked'
  | 'wall_doorway'
  | 'wall_doorway_scaffold';

/**
 * Lays a room out in KayKit units (a wall piece is 4 wide, 4 tall, 1 thick), centred on the floor;
 * everything comes out in metres.
 */
export class RoomBuilder {
  public readonly w: number;
  public readonly d: number;

  readonly pieces: Piece[] = [];
  readonly solids: Rect[] = [];
  readonly levels: Level[] = [];
  readonly ramps: Ramp[] = [];
  /** Inner half-size (units). */
  readonly ix: number;
  readonly iz: number;

  /** `w` × `d` wall pieces: the walls' middles run round the edge of that grid. */
  constructor(w: number, d: number) {
    this.w = w;
    this.d = d;

    this.ix = w * 2 - 0.5;
    this.iz = d * 2 - 0.5;
  }

  /** A piece at (x, z) units, `y` units up, turned `rot`, at `s` × the room scale. */
  add(
    kit: KitPiece,
    model: string,
    x: number,
    z: number,
    o: {
      y?: number;
      rot?: number;
      rx?: number;
      s?: number;
      sides?: Side[];
      block?: [number, number];
      part?: string;
    } = {},
  ): void {
    this.pieces.push({
      kit,
      model,
      x: x * U,
      z: z * U,
      y: (o.y ?? 0) * U,
      rot: o.rot ?? 0,
      ...(o.rx !== undefined ? { rx: o.rx } : {}),
      scale: (o.s ?? 1) * U,
      ...(o.sides !== undefined ? { sides: o.sides } : {}),
      ...(o.part !== undefined ? { part: o.part } : {}),
    });
    if (o.block) this.solid(x - o.block[0], z - o.block[1], x + o.block[0], z + o.block[1]);
  }

  /** A fixture (see Fixture) at (x, z) units, `y` units up, `s` units big. */
  readonly fixtures: Fixture[] = [];
  fixture(
    kind: Fixture['kind'],
    x: number,
    z: number,
    o: { y?: number; rot?: number; s?: number; block?: [number, number] } = {},
  ): void {
    this.fixtures.push({ kind, x: x * U, y: (o.y ?? 0) * U, z: z * U, rot: o.rot ?? 0, s: (o.s ?? 1) * U });
    if (o.block) this.solid(x - o.block[0], z - o.block[1], x + o.block[0], z + o.block[1]);
  }

  /** Floor nobody walks on (units). */
  solid(x0: number, z0: number, x1: number, z1: number): void {
    this.solids.push({ x0: x0 * U, z0: z0 * U, x1: x1 * U, z1: z1 * U });
  }

  level(x0: number, z0: number, x1: number, z1: number, y: number): void {
    this.levels.push({ x0: x0 * U, z0: z0 * U, x1: x1 * U, z1: z1 * U, y: y * U });
  }

  ramp(x0: number, z0: number, x1: number, z1: number, axis: 'x' | 'z', ya: number, yb: number): void {
    this.ramps.push({ x0: x0 * U, z0: z0 * U, x1: x1 * U, z1: z1 * U, axis, ya: ya * U, yb: yb * U });
  }

  /**
   * The four walls, storey by storey: for each side, its pieces from left to right as seen from
   * inside the room (back: −x → +x; front: +x → −x; left: front → back; right: back → front).
   */
  walls(storeys: Record<Side, WallKind[]>[]): void {
    const hx = this.w * 2;
    const hz = this.d * 2;
    storeys.forEach((s, k) => {
      const y = k * 4;
      s.back.forEach((m, i) => this.add('dungeon', m, -hx + 2 + i * 4, -hz, { y, sides: ['back'] }));
      s.front.forEach((m, i) =>
        this.add('dungeon', m, hx - 2 - i * 4, hz, { y, rot: Math.PI, sides: ['front'] }),
      );
      s.left.forEach((m, i) =>
        this.add('dungeon', m, -hx, hz - 2 - i * 4, { y, rot: Math.PI / 2, sides: ['left'] }),
      );
      s.right.forEach((m, i) =>
        this.add('dungeon', m, hx, -hz + 2 + i * 4, { y, rot: -Math.PI / 2, sides: ['right'] }),
      );
      // Pillars close the corners.
      for (const [x, z, sides] of [
        [-hx, -hz, ['back', 'left']],
        [hx, -hz, ['back', 'right']],
        [-hx, hz, ['front', 'left']],
        [hx, hz, ['front', 'right']],
      ] as const) {
        this.add('dungeon', 'pillar', x, z, { y, sides: [...sides] });
      }
    });
  }

  /** The ground floor: big tiles, `pick` choosing each one's model (null: leave it bare). */
  floor(pick: (i: number, j: number) => string | null): void {
    for (let i = 0; i < this.w; i++) {
      for (let j = 0; j < this.d; j++) {
        const m = pick(i, j);
        if (m)
          this.add('dungeon', m, -this.w * 2 + 2 + i * 4, -this.d * 2 + 2 + j * 4, {
            rot: ((i * 7 + j * 3) % 4) * (Math.PI / 2),
          });
      }
    }
  }

  build(
    o: Omit<InteriorDef, 'hx' | 'hz' | 'pieces' | 'solids' | 'levels' | 'ramps' | 'fixtures'>,
  ): InteriorDef {
    return {
      ...o,
      hx: this.ix * U,
      hz: this.iz * U,
      pieces: this.pieces,
      solids: this.solids,
      levels: this.levels,
      ramps: this.ramps,
      fixtures: this.fixtures,
    };
  }
}
