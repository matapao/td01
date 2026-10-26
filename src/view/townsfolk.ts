// Definitions require paths/actions; route loops stay within sequence bounds. Streets have paired coordinate arrays and alongStreet clamps neighbor indices.
/**
 * The townsfolk: the people of the vale going about their day inside the walls — guards at the gate
 * and up on the wall-walk, a trader at her crates and a shopper on the market square, someone on
 * their way up the high street, the old scholar between the hall and the well, a cleric off to bless
 * the fields, a gardener, a farmer in the beds by the windmill, a picker in the orchard, the
 * stablehand, a fisher on the quay, two regulars at the tavern's tables. They are what the wall is
 * there to keep safe.
 *
 * View only (the simulation never sees them; heroes walk through them like any game's townsfolk).
 * Each keeps a round on the game's clock, so every screen in a LAN game shows them in the same place;
 * they stop and wave when you come by. At night most go indoors (the guards keep watch). Drawn and
 * animated only when in sight and near the lens.
 */
import * as THREE from 'three';
import type { Sim } from '../game/sim.ts';
import { LANE_STEP, MAP, WALL, groundHeight, w } from '../game/map.ts';
import { daylight, todNow } from '../game/content.ts';
import type { Hero } from '../game/types.ts';
import { dampAngle } from '../core/math.ts';
import type { Assets } from './assets.ts';
import { CHAR, CharacterView, SPECS, TOOL_HELD, type CharacterSpec } from './characters.ts';
import { Sight } from './entity/context.ts';

/** What someone does at a stop on their round, and for how long (s). */
interface Act {
  anim: string;
  t: number;
}

/** One of the townsfolk: who, where they go, what they do there. */
interface FolkDef {
  spec: CharacterSpec;
  /** Their round (world points); one point: they stay there. */
  path: { x: number; z: number }[];
  /** Round and round (else there and back again). */
  loop?: boolean;
  /** Walking speed (m/s). */
  speed?: number;
  /** At each stop, by turns. */
  acts: Act[];
  /** Which way they face at their stops (else the way they were going). */
  face?: number;
  /** Out at night too (the guards). */
  night?: boolean;
  /** Standing height, where the ground isn't it (the quay's deck). */
  y?: number;
  /** Where in their round they are when the game starts (s). */
  phase: number;
}

type Leg =
  | { walk: true; ax: number; az: number; bx: number; bz: number; t: number }
  | { walk: false; x: number; z: number; anim: string; t: number; face: number };

/** Walking_A plays at 1× at this speed (m/s), for a person of the townsfolk's size. */
const WALK_REF = 1.15;
/** Townsfolk further from the lens than this aren't drawn. */
const FAR = 62;

class Folk {
  public readonly def: FolkDef;

  readonly ch: CharacterView;
  private legs: Leg[] = [];
  private period = 0;
  /** Seconds this one has spent standing about (waving) off their round: their clock runs behind by it. */
  private lag = 0;
  private hold = 0;
  private waveT = 0;
  private anim = '';
  /** Out (true) or indoors for the night (false); null until the first frame decides. */
  private shown: boolean | null = null;
  private heading = 0;

  constructor(assets: Assets, def: FolkDef) {
    this.def = def;

    this.ch = new CharacterView(assets, def.spec);
    const pts = def.path;
    if (!pts.length || !def.acts.length) throw new Error('Townsperson needs a path and actions');
    const seq = pts.length < 2 ? pts : def.loop ? [...pts, pts[0]!] : [...pts, ...pts.slice(0, -1).reverse()];
    let k = 0;
    const act = (x: number, z: number, face: number) => {
      const a = def.acts[k++ % def.acts.length]!;
      this.legs.push({ walk: false, x, z, anim: a.anim, t: a.t, face: def.face ?? face });
    };
    if (seq.length < 2) for (let i = 0; i < def.acts.length; i++) act(seq[0]!.x, seq[0]!.z, def.face ?? 0);
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1]!;
      const b = seq[i]!;
      this.legs.push({
        walk: true,
        ax: a.x,
        az: a.z,
        bx: b.x,
        bz: b.z,
        t: Math.hypot(b.x - a.x, b.z - a.z) / (def.speed ?? 1),
      });
      // A stop at each end of the way (and, going round, at every point).
      if (def.loop || i === seq.length - 1 || i === pts.length - 1)
        act(b.x, b.z, Math.atan2(b.x - a.x, b.z - a.z));
    }
    this.period = this.legs.reduce((s, l) => s + l.t, 0);
  }

  /** Where they are and what they're doing at their clock time `c`. */
  private at(c: number, out: { x: number; z: number; face: number; anim: string }): void {
    let t = (((c + this.def.phase) % this.period) + this.period) % this.period;
    for (const l of this.legs) {
      if (t > l.t) {
        t -= l.t;
        continue;
      }
      if (l.walk) {
        const f = l.t > 0 ? t / l.t : 1;
        out.x = l.ax + (l.bx - l.ax) * f;
        out.z = l.az + (l.bz - l.az) * f;
        out.face = Math.atan2(l.bx - l.ax, l.bz - l.az);
        out.anim = 'Walking_A';
      } else {
        out.x = l.x;
        out.z = l.z;
        out.face = l.face;
        out.anim = l.anim;
      }
      return;
    }
  }

  private now = { x: 0, z: 0, face: 0, anim: '' };

  update(
    sim: Sim,
    dt: number,
    clock: number,
    me: Hero | undefined,
    sight: Sight,
    lens: THREE.Vector3,
    dark: boolean,
  ): void {
    const root = this.ch.root;
    // Waving at a hero who comes by: they stop their round for a moment (their clock waits).
    this.waveT -= dt;
    if (this.hold > 0) {
      this.hold -= dt;
      this.lag += dt;
    }
    const n = this.now;
    this.at(clock - this.lag, n);
    const y = this.def.y ?? groundHeight(sim.world, n.x, n.z);
    root.position.set(n.x, y, n.z);
    const near = !!me && !me.dead && Math.hypot(me.x - n.x, me.z - n.z) < 3.4;
    if (near && this.shown !== false && this.waveT <= 0 && this.hold <= 0 && n.anim !== 'Fishing_Idle') {
      this.hold = 2.2;
      this.waveT = 45;
      this.ch.once('Waving', 'Idle_A', 1);
      this.anim = 'Waving';
    }
    const goal = this.hold > 0 && me ? Math.atan2(me.x - n.x, me.z - n.z) : n.face;
    this.heading = this.shown === null ? goal : dampAngle(this.heading, goal, 6, dt);
    root.rotation.y = this.heading;
    // At night they're indoors (not the guards); they go or come back out of sight, never in view.
    const onScreen = lens.distanceToSquared(root.position) < FAR * FAR && sight.sees(root.position, 1);
    const want = !dark || !!this.def.night;
    if (this.shown === null || (want !== this.shown && !onScreen)) this.shown = want;
    root.visible = this.shown && onScreen;
    if (!root.visible) return;
    if (this.hold <= 0 && n.anim !== this.anim) {
      this.anim = n.anim;
      this.ch.play(n.anim, 0.25, n.anim === 'Walking_A' ? (this.def.speed ?? 1) / WALK_REF : 1);
    }
    this.ch.update(dt);
  }
}

/** The vale's townsfolk and their rounds (laid out from the town as buildScenery made it). */
export class Townsfolk {
  private sim: Sim;
  private camera: THREE.PerspectiveCamera;

  readonly group = new THREE.Group();
  private folk: Folk[] = [];
  private sight: Sight;
  private lens = new THREE.Vector3();

  constructor(sim: Sim, assets: Assets, camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.sim = sim;
    this.camera = camera;

    this.sight = new Sight(camera, scene);
    for (const def of townRounds(sim)) {
      const f = new Folk(assets, def);
      this.group.add(f.ch.root);
      this.folk.push(f);
    }
  }

  update(dt: number, me: Hero | undefined): void {
    this.sight.update();
    this.camera.getWorldPosition(this.lens);
    const st = this.sim.state;
    const dark = daylight(todNow(st)) < 0.2;
    for (const f of this.folk) f.update(this.sim, dt, st.time, me, this.sight, this.lens, dark);
  }
}

// ---- Who goes where ------------------------------------------------------------------------------

const person = (model: CharacterSpec['model'], extra: Partial<CharacterSpec> = {}): CharacterSpec => ({
  model,
  scale: 0.62 * CHAR,
  ...extra,
});

/** Points along a town street from `d0` to `d1` m, `side` m to its left (negative: right). */
function alongStreet(sim: Sim, si: number, d0: number, d1: number, side: number): { x: number; z: number }[] {
  const s = sim.world.streets[si];
  const out: { x: number; z: number }[] = [];
  if (!s || s.xs.length < 3) return out;
  for (let d = d0; d <= d1; d += 2) {
    const i = Math.max(1, Math.min(s.xs.length - 2, Math.round(d / LANE_STEP)));
    const tx = s.xs[i + 1]! - s.xs[i - 1]!;
    const tz = s.zs[i + 1]! - s.zs[i - 1]!;
    const l = Math.hypot(tx, tz) || 1;
    out.push({ x: s.xs[i]! - (tz / l) * side, z: s.zs[i]! + (tx / l) * side });
  }
  return out;
}

/** The townsfolk's rounds, from the town as it stands (the props say where the quay, the tavern and the gardens are). */
export function townRounds(sim: Sim): FolkDef[] {
  const props = sim.props;
  const out: FolkDef[] = [];
  const WX = WALL.x;
  const M = MAP.market;
  // The gate: two guards just inside it, either side of the way in.
  for (const s of [-1, 1]) {
    out.push({
      spec: SPECS.footman,
      path: [{ x: WX - 2.8, z: s * 3 }],
      acts: [
        { anim: 'Idle_A', t: 9 },
        { anim: 'Idle_B', t: 5 },
      ],
      face: -Math.PI / 2 + s * 0.35,
      night: true,
      phase: s * 3,
    });
  }
  // Up on the wall-walk: a guard each side of the gate walks the battlements, stopping to look out.
  const mid = WX + (WALL.walk0 + WALL.walk1) / 2;
  for (const s of [-1, 1]) {
    out.push({
      spec: SPECS.footman,
      path: [
        { x: mid, z: s * (WALL.gatePiece + 1.5) },
        { x: mid, z: s * (WALL.walkEnd - 2.5) },
      ],
      speed: 0.7,
      acts: [
        { anim: 'Idle_A', t: 6 },
        { anim: 'Idle_B', t: 4 },
      ],
      face: Math.PI / 2,
      night: true,
      phase: s > 0 ? 11 : 0,
    });
  }
  // The market square: a trader behind her crates; a shopper going round the stalls.
  out.push({
    spec: person('Farmer_B'),
    path: [{ x: M.x - 3.3, z: M.z - 1.5 }],
    acts: [
      { anim: 'Idle_B', t: 6 },
      { anim: 'Interact', t: 2.4 },
      { anim: 'Idle_A', t: 5 },
    ],
    face: 0,
    phase: 2,
  });
  out.push({
    spec: person('Farmer_A'),
    path: [
      { x: M.x - 1.6, z: M.z + 1.6 },
      { x: M.x + 2.4, z: M.z + 1.8 },
      { x: M.x + 3, z: M.z - 2 },
      { x: M.x - 1.2, z: M.z - 2.4 },
    ],
    loop: true,
    speed: 0.75,
    acts: [
      { anim: 'Idle_A', t: 3 },
      { anim: 'Interact', t: 2.2 },
      { anim: 'Idle_B', t: 2.5 },
      { anim: 'PickUp', t: 2 },
    ],
    phase: 7,
  });
  // On their way up the high street from the market to the old town's square, and back.
  out.push({
    spec: person('Farmer_A'),
    path: alongStreet(sim, 0, 18, 66, 0.7),
    speed: 1,
    acts: [
      { anim: 'Idle_A', t: 5 },
      { anim: 'Interact', t: 2.4 },
    ],
    phase: 20,
  });
  // Down the lane to the orchard and back.
  out.push({
    spec: person('Farmer_B'),
    path: alongStreet(sim, 4, 2, 18, -0.6),
    speed: 0.9,
    acts: [
      { anim: 'Idle_B', t: 4 },
      { anim: 'Idle_A', t: 3 },
    ],
    phase: 4,
  });
  // A cleric of the church up the lane to the fields (a blessing for the wheat) and back.
  out.push({
    spec: person('Cleric'),
    path: alongStreet(sim, 3, 3, 24, 0.6),
    speed: 0.7,
    acts: [
      { anim: 'Ranged_Magic_Raise', t: 2.6 },
      { anim: 'Idle_A', t: 5 },
    ],
    phase: 12,
  });
  // The old scholar, between the hall and the well.
  out.push({
    spec: person('Lorekeeper'),
    path: [
      { x: -50.4, z: -8.2 },
      { x: -47.4, z: -3.6 },
    ],
    speed: 0.6,
    acts: [
      { anim: 'Idle_B', t: 7 },
      { anim: 'Interact', t: 3 },
    ],
    phase: 1,
  });
  // A gardener at work in one of the gardens behind the high street.
  const plot = props.find(
    (p) => p.model === 'dirt_plot' && p.x < -24 && p.x > -45 && Math.abs(p.z) > 8 && Math.abs(p.z) < 16,
  );
  if (plot) {
    const side = plot.z > 0 ? 1 : -1;
    out.push({
      spec: person('Farmer_B', { held: [TOOL_HELD.shovel] }),
      path: [{ x: plot.x + 0.75, z: plot.z }],
      acts: [
        { anim: 'Digging', t: 8 },
        { anim: 'Idle_A', t: 3 },
      ],
      face: -Math.PI / 2 + side * 0.2,
      phase: 3,
    });
  }
  // A farmer in the beds by the windmill, from one row to the next.
  const bx = w(-33);
  const bz = w(-12);
  out.push({
    spec: person('Farmer_A', { held: [TOOL_HELD.shovel] }),
    path: [
      { x: bx - 0.9, z: bz },
      { x: bx + 4.7, z: bz + 2 },
    ],
    speed: 0.6,
    acts: [
      { anim: 'Digging', t: 9 },
      { anim: 'Digging', t: 7 },
    ],
    phase: 5,
  });
  // A picker in the orchard, down the row between the first two lines of trees.
  const ox = w(-35.5);
  const oz = w(13.5) + 1.9;
  out.push({
    spec: person('Farmer_B'),
    path: [0, 1, 2, 3, 4].map((c) => ({ x: ox + c * 3.6 + 0.9, z: oz })),
    speed: 0.6,
    acts: [
      { anim: 'PickUp', t: 2.2 },
      { anim: 'Idle_B', t: 2.5 },
      { anim: 'Interact', t: 2 },
    ],
    phase: 9,
  });
  // The stablehand by the trough, the horses round him.
  out.push({
    spec: person('Farmer_A'),
    path: [{ x: w(-17.4), z: w(10.2) - 1 }],
    acts: [
      { anim: 'Idle_B', t: 6 },
      { anim: 'Interact', t: 3 },
    ],
    face: 0,
    phase: 6,
  });
  // A fisher at the end of the quay.
  const quay = props.find((p) => p.model === 'building_docks_yellow');
  if (quay) {
    out.push({
      spec: person('Farmer_A', { held: [{ kit: 'town', model: 'fishing_rod', hand: 'r' }] }),
      path: [{ x: quay.x + 2.1, z: quay.z - 0.35 }],
      acts: [
        { anim: 'Fishing_Idle', t: 14 },
        { anim: 'Fishing_Reeling', t: 4 },
      ],
      face: Math.PI / 2,
      y: (quay.y ?? 0) + 0.44 * quay.scale,
      phase: 0,
    });
  }
  // Two regulars at the tavern's tables, mugs in hand.
  const tavern = props.find((p) => p.tag === 'tavern');
  if (tavern) {
    const mug = { model: 'mug_full', hand: 'r' as const };
    out.push({
      spec: person('Farmer_B', { held: [mug] }),
      path: [{ x: tavern.x - 2.2 - 1.05, z: tavern.z - 4.4 + 0.2 }],
      acts: [
        { anim: 'Idle_A', t: 7 },
        { anim: 'Cheering', t: 2.4 },
      ],
      face: Math.PI / 2,
      phase: 0,
    });
    out.push({
      spec: person('Farmer_A', { held: [mug] }),
      path: [{ x: tavern.x + 1.9 + 1.05, z: tavern.z - 4.6 }],
      acts: [
        { anim: 'Idle_B', t: 6 },
        { anim: 'Interact', t: 2 },
      ],
      face: -Math.PI / 2,
      phase: 3,
    });
  }
  // Map layouts can omit streets used by these rounds. Never create a Folk with an empty path.
  return out.filter((def) => def.path.length > 0);
}
