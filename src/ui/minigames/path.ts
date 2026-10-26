import { validatePathGrid } from './path-grid.ts';
import { createCircuit } from './path-circuit.ts';
export type { GridPt } from './path-data.ts';
export type { PathLook } from './path-data.ts';
export type { PathObstacle } from './path-data.ts';
export type { PathGauge } from './path-data.ts';
export type { PathSource } from './path-data.ts';
export type { PathLoad } from './path-data.ts';
export type { PathFuse } from './path-data.ts';
export type { PathStop } from './path-data.ts';
export type { PathRun } from './path-data.ts';
export type { PathWords } from './path-data.ts';
export type { PathCause } from './path-data.ts';
export type { PathOutcome } from './path-data.ts';
export type { PathParams } from './path-data.ts';
export { PATH_EXAMPLES } from './path-data.ts';
import { PATH_EXAMPLES } from './path-data.ts';
import type {
  GridPt,
  PathLook,
  PathObstacle,
  PathGauge,
  PathRun,
  PathCause,
  PathOutcome,
  PathParams,
} from './path-data.ts';
/**
 * Lay the path (TECH_LINEAGE §4, §5): connect things on a small board — wires from the intake to the
 * lamps, rails from the mine head to the forge, pipes, belts, network links, a rover's route round
 * the rocks — then throw the lever and watch it run.
 *
 * Two styles:
 * - 'circuit': wires of a chosen gauge carry current from a source through loads. The board is solved
 *   as a real resistive network (Ohm's law at every point), so lamps glow as bright as they would,
 *   lamps in a chain share the push, a long thin wire dims a far lamp, an overloaded wire warms
 *   yellow → red and a fuse pops.
 * - 'route': join a start to its stops round the obstacles within a budget of pieces; the shortest
 *   joining is perfect.
 *
 * Draw by dragging from point to point (back over the last piece takes it up again); tap a piece to
 * take it away; 1–3 pick the gauge, Z undoes, Enter runs. The playground runs the demo;
 * `?minigame=path&demo=<name>` runs one of PATH_EXAMPLES instead.
 */
import type { Minigame, MinigameDef, MinigameHost, Quality } from './types.ts';
import { canvasIn, finisher, text, rrect, PAL, FONT } from './kit.ts';

/** Copper wire in three sizes: thin is cheap but resists and heats; thick costs more ore. */
export const WIRE_GAUGES: PathGauge[] = [
  { name: 'thin', ohms: 0.4, amps: 2, cost: 1 },
  { name: 'medium', ohms: 0.16, amps: 5, cost: 2 },
  { name: 'thick', ohms: 0.06, amps: 12, cost: 3 },
];

/** The playground's set-up: `?demo=<name>` picks an example. */
function pickDemo(): PathParams {
  const name = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('demo');
  return name && Object.hasOwn(PATH_EXAMPLES, name)
    ? PATH_EXAMPLES[name as keyof typeof PATH_EXAMPLES]
    : PATH_EXAMPLES['towers'];
}

export const path: MinigameDef<PathParams> = {
  kind: 'path',
  name: 'Lay the path',
  demo: pickDemo(),
  create: (host, p) => createPath(host, p),
};

// ---- Looks --------------------------------------------------------------------------------------

const W = 380;
const H = 220;
const TOP = 18; // the board starts below the goal line…
const BOARD_B = 186; // …and ends above the tool row
const ROW_Y = 192;
const ROW_H = 24;
const SPEED = 7; // squares a second for things running along a route

/** Per look: the run button, what the budget counts, how pieces are counted, and what a loose end does. */
const LOOKS: Record<PathLook, { lever: string; piece: string; unit: string; lost: string }> = {
  wire: {
    lever: 'Throw the lever',
    piece: 'copper',
    unit: 'squares of wire',
    lost: 'The pulse died at a loose end',
  },
  rail: {
    lever: 'Send the cart',
    piece: 'rails',
    unit: 'rails',
    lost: 'The cart ran off the end of the rails',
  },
  pipe: {
    lever: 'Open the sluice',
    piece: 'pipe',
    unit: 'lengths of pipe',
    lost: 'The water spilled out of an open end',
  },
  belt: {
    lever: 'Start the belt',
    piece: 'belt',
    unit: 'lengths of belt',
    lost: 'The crates fell off the end of the belt',
  },
  link: {
    lever: 'Send a message',
    piece: 'cable',
    unit: 'links',
    lost: 'The message got lost at a loose end',
  },
  track: {
    lever: 'Drive',
    piece: 'charge',
    unit: 'squares',
    lost: 'The rover stopped at the end of its route',
  },
};

/** Wire colours from cold copper through yellow to cherry red (index by heat). */
const HEAT: string[] = (() => {
  // Five colour stops, read only as adjacent pairs inside the interpolation loop.
  const stops: [number, number, number, number][] = [
    [0, 194, 122, 62],
    [0.45, 214, 140, 70],
    [1, 255, 214, 90],
    [1.5, 255, 70, 30],
    [2, 255, 190, 170],
  ];
  const out: string[] = [];
  for (let i = 0; i < 32; i++) {
    const h = (i / 31) * 2;
    let k = 0;
    while (k < stops.length - 2 && h > stops[k + 1]![0]) k++;
    const [h0, r0, g0, b0] = stops[k]!;
    const [h1, r1, g1, b1] = stops[k + 1]!;
    const t = Math.min(1, Math.max(0, (h - h0) / (h1 - h0)));
    out.push(
      `rgb(${Math.round(r0 + (r1 - r0) * t)},${Math.round(g0 + (g1 - g0) * t)},${Math.round(b0 + (b1 - b0) * t)})`,
    );
  }
  return out;
})();
// Heat and bulb palette indices are rounded and clamped to their allocated ranges.
const heatColour = (h: number): string => HEAT[Math.max(0, Math.min(31, Math.round((h / 2) * 31)))]!;

/** Bulb glass from dark to full glow. */
const BULB: string[] = Array.from({ length: 16 }, (_, i) => {
  const t = i / 15;
  return `rgb(${Math.round(58 + 197 * t)},${Math.round(54 + 190 * t)},${Math.round(46 + 130 * t)})`;
});

const fmtV = (v: number): string => `${Math.round(v)} V`;
const fmtA = (a: number): string => {
  const x = Math.abs(a);
  return `${Number.isInteger(x) || x >= 10 ? Math.round(x) : x.toFixed(x < 1 ? 2 : 1)} A`;
};
const pct = (x: number): string => `${Math.round(x * 100)} %`;

/** A soft glow sprite (made once). */
function glowSprite(r: number, g: number, b: number): HTMLCanvasElement {
  const s = document.createElement('canvas');
  s.width = s.height = 64;
  const x = s.getContext('2d')!;
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.95)`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},0.45)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  return s;
}

/** A small deterministic wobble so rocks and trees don't all look alike. */
const wob = (i: number, k: number): number => {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function drawObstacle(
  g: CanvasRenderingContext2D,
  kind: PathObstacle,
  x: number,
  y: number,
  s: number,
  seed: number,
): void {
  const r = s * 0.36;
  switch (kind) {
    case 'rock': {
      g.fillStyle = '#6d675f';
      g.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const rr = r * (0.8 + wob(seed, k) * 0.35);
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr * 0.85;
        if (k) g.lineTo(px, py);
        else g.moveTo(px, py);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = '#3e3a35';
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = '#8f887d';
      g.beginPath();
      g.ellipse(x - r * 0.25, y - r * 0.3, r * 0.35, r * 0.2, -0.4, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'tree':
      g.fillStyle = '#5a3d22';
      g.fillRect(x - 1.5, y, 3, r);
      g.fillStyle = '#2d6233';
      g.beginPath();
      g.arc(x, y - 1, r * 0.95, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3f8445';
      g.beginPath();
      g.arc(x - r * 0.3, y - r * 0.35, r * 0.45, 0, Math.PI * 2);
      g.fill();
      break;
    case 'house':
      g.fillStyle = '#8a6a48';
      g.fillRect(x - r, y - r * 0.2, r * 2, r * 1.2);
      g.fillStyle = '#7a2e22';
      g.beginPath();
      g.moveTo(x - r * 1.2, y - r * 0.15);
      g.lineTo(x, y - r * 1.1);
      g.lineTo(x + r * 1.2, y - r * 0.15);
      g.closePath();
      g.fill();
      g.fillStyle = '#3a2a1a';
      g.fillRect(x - r * 0.25, y + r * 0.3, r * 0.5, r * 0.7);
      break;
    case 'water':
      g.fillStyle = '#1f4a73';
      rrect(g, x - s * 0.5, y - s * 0.5, s, s, 4);
      g.fill();
      g.strokeStyle = '#4f86b8';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x - r * 0.8, y - 2);
      g.quadraticCurveTo(x - r * 0.3, y - 5, x + r * 0.2, y - 2);
      g.moveTo(x - r * 0.2, y + 4);
      g.quadraticCurveTo(x + r * 0.3, y + 1, x + r * 0.8, y + 4);
      g.stroke();
      break;
    case 'crater':
      g.fillStyle = '#15161a';
      g.beginPath();
      g.ellipse(x, y, r * 1.05, r * 0.85, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#8d9098';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(x, y, r * 1.05, r * 0.85, 0, Math.PI * 1.05, Math.PI * 2.1);
      g.stroke();
      break;
  }
}

// ---- The minigame -------------------------------------------------------------------------------

interface Btn {
  x: number;
  y: number;
  w: number;
  h: number;
}
const inBtn = (b: Btn, x: number, y: number): boolean =>
  x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

function createPath(host: MinigameHost, p: PathParams): Minigame {
  validatePathGrid(p);
  // Dense node/edge buffers share the validated board dimensions; geometry, hits and BFS stay inside them.
  const end = finisher(host);
  const circuit = p.style === 'circuit';
  const look: PathLook = p.look ?? (circuit ? 'wire' : 'rail');
  const L = LOOKS[look];
  const leverWord = p.words.lever ?? L.lever;
  const pieceWord = p.words.piece ?? L.piece;
  const gauges: PathGauge[] = circuit
    ? (p.gauges ?? WIRE_GAUGES)
    : [p.gauges?.[0] ?? { name: pieceWord, ohms: 0, amps: Infinity, cost: 1 }];
  const timeLimit = p.time ?? 40;
  const { cols, rows } = p;
  const N = cols * rows;
  const HE = (cols - 1) * rows;
  const E = HE + cols * (rows - 1);

  // Geometry: the grid of points, centred in the board area (room on the left for the source).
  const sp = Math.min((W - 56) / (cols - 1), (BOARD_B - TOP - 24) / (rows - 1));
  const ox = Math.round((W - sp * (cols - 1)) / 2);
  const oy = Math.round(TOP + 2 + (BOARD_B - TOP - sp * (rows - 1)) / 2);
  const NX = new Float32Array(N);
  const NY = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    NX[i] = ox + (i % cols) * sp;
    NY[i] = oy + Math.floor(i / cols) * sp;
  }
  const id = (q: GridPt): number => q[1] * cols + q[0];
  const eu = new Int16Array(E);
  const ev = new Int16Array(E);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols - 1; c++) {
      const e = r * (cols - 1) + c;
      eu[e] = r * cols + c;
      ev[e] = r * cols + c + 1;
    }
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cols; c++) {
      const e = HE + r * cols + c;
      eu[e] = r * cols + c;
      ev[e] = (r + 1) * cols + c;
    }
  const edgeBetween = (u: number, v: number): number => {
    const cu = u % cols;
    const ru = (u - cu) / cols;
    const cv = v % cols;
    const rv = (v - cv) / cols;
    if (ru === rv && Math.abs(cu - cv) === 1) return ru * (cols - 1) + Math.min(cu, cv);
    if (cu === cv && Math.abs(ru - rv) === 1) return HE + Math.min(ru, rv) * cols + cu;
    return -1;
  };

  // The board's pieces.
  const wire = new Int8Array(E).fill(-1); // gauge laid by the player
  const fixed = new Int8Array(E).fill(-1); // gauge laid before
  const blockedE = new Uint8Array(E); // a part's body sits on it
  const blockedN = new Uint8Array(N); // something in the way
  const studN = new Uint8Array(N); // a terminal: 1 plus, 2 minus, 3 a lead, 4 a stop, 5 the start
  for (const o of p.obstacles ?? []) blockedN[id(o.at)] = 1;
  const src = p.source;
  const loads = p.loads ?? [];
  const fuses = p.fuses ?? [];
  const nL = loads.length;
  const nF = fuses.length;
  const loadE = new Int16Array(nL);
  const fuseE = new Int16Array(nF);
  loads.forEach((l, k) => {
    const e = edgeBetween(id(l.a), id(l.b));
    loadE[k] = e;
    if (e >= 0) blockedE[e] = 1;
    studN[id(l.a)] = 3;
    studN[id(l.b)] = 3;
  });
  fuses.forEach((f, k) => {
    const e = edgeBetween(id(f.a), id(f.b));
    fuseE[k] = e;
    if (e >= 0) blockedE[e] = 1;
    studN[id(f.a)] = 3;
    studN[id(f.b)] = 3;
  });
  const plusN = src ? id(src.plus) : -1;
  const minusN = src ? id(src.minus) : -1;
  if (src) {
    studN[plusN] = 1;
    studN[minusN] = 2;
  }
  const startN = p.start ? id(p.start.at) : -1;
  const stops = p.stops ?? [];
  const stopN = stops.map((s) => id(s.at));
  for (const n of stopN) studN[n] = 4;
  if (startN >= 0) studN[startN] = 5;

  /** Lays a run of pieces through corner points into `into` (edges along the way). */
  // Consecutive points are read with i starting at one and strictly below run.path.length.
  const runEdges = (run: PathRun, each: (e: number) => void): void => {
    for (let i = 1; i < run.path.length; i++) {
      let [c, r] = run.path[i - 1]!;
      const [tc, tr] = run.path[i]!;
      let guard = 0;
      while ((c !== tc || r !== tr) && guard++ < 64) {
        const nc = c + Math.sign(tc - c);
        const nr = c !== tc ? r : r + Math.sign(tr - r);
        const e = edgeBetween(r * cols + c, nr * cols + nc);
        if (e >= 0) each(e);
        c = nc;
        r = nr;
      }
    }
  };
  for (const run of p.laid ?? [])
    runEdges(run, (e) => (fixed[e] = Math.min(gauges.length - 1, run.gauge ?? 0)));
  const hintE = new Int8Array(E).fill(-1);
  for (const run of p.hint ?? [])
    runEdges(run, (e) => (hintE[e] = Math.min(gauges.length - 1, run.gauge ?? 0)));

  const laidAt = (e: number): number => (fixed[e]! >= 0 ? fixed[e]! : wire[e]!);

  // ---- Route: the shortest joining (for a perfect) and the ghost hint ----------------------------
  let optimal = 0;
  if (!circuit && startN >= 0) {
    const tree = new Uint8Array(N);
    tree[startN] = 1;
    const left = new Set(stopN);
    const dist = new Int16Array(N);
    const from = new Int16Array(N);
    const queue = new Int16Array(N);
    while (left.size) {
      dist.fill(-1);
      let qh = 0;
      let qt = 0;
      for (let i = 0; i < N; i++)
        if (tree[i]!) {
          dist[i] = 0;
          from[i] = -1;
          queue[qt++] = i;
        }
      let hit = -1;
      while (qh < qt && hit < 0) {
        const u = queue[qh++]!;
        const uc = u % cols;
        for (let k = 0; k < 4; k++) {
          const v =
            k === 0
              ? uc > 0
                ? u - 1
                : -1
              : k === 1
                ? uc < cols - 1
                  ? u + 1
                  : -1
                : k === 2
                  ? u - cols
                  : u + cols;
          if (v < 0 || v >= N || dist[v]! >= 0 || blockedN[v]!) continue;
          dist[v] = dist[u]! + 1;
          from[v] = u;
          if (left.has(v)) {
            hit = v;
            break;
          }
          queue[qt++] = v;
        }
      }
      if (hit < 0) break; // a stop that can't be reached: a broken set-up
      left.delete(hit);
      optimal += dist[hit]!;
      for (let v = hit; v >= 0 && !tree[v]!; v = from[v]!) {
        tree[v] = 1;
        if (from[v]! >= 0 && !p.hint) hintE[edgeBetween(v, from[v]!)] = 0;
      }
    }
  }
  const par = p.par ?? (circuit ? Infinity : optimal);

  // ---- Static layer: the board, drawn once --------------------------------------------------------
  const bg = document.createElement('canvas');
  bg.width = W * 2;
  bg.height = H * 2;
  {
    const b = bg.getContext('2d')!;
    b.scale(2, 2);
    b.fillStyle = PAL.bg;
    b.fillRect(0, 0, W, H);
    // A grey, airless rocky body for the rover; earth and grass in the vale.
    const ground = look === 'track' ? '#24262c' : look === 'rail' || look === 'belt' ? '#1d1a12' : '#181510';
    b.fillStyle = ground;
    rrect(b, 3, TOP, W - 6, BOARD_B - TOP, 6);
    b.fill();
    b.strokeStyle = '#3a3022';
    b.lineWidth = 1;
    b.stroke();
    if (look === 'track') {
      // Grey grit and pebbles.
      for (let i = 0; i < 160; i++) {
        b.fillStyle = wob(i, 1) > 0.5 ? 'rgba(200,205,215,0.10)' : 'rgba(0,0,0,0.35)';
        b.fillRect(
          6 + wob(i, 2) * (W - 12),
          TOP + 3 + wob(i, 3) * (BOARD_B - TOP - 6),
          1.5 + wob(i, 4) * 2,
          1.5 + wob(i, 5) * 2,
        );
      }
    }
    for (let i = 0; i < N; i++) {
      if (blockedN[i]!) continue;
      b.fillStyle = '#4a3f2e';
      b.beginPath();
      b.arc(NX[i]!, NY[i]!, 1.3, 0, Math.PI * 2);
      b.fill();
    }
    (p.obstacles ?? []).forEach((o, k) =>
      drawObstacle(b, o.kind ?? 'rock', NX[id(o.at)]!, NY[id(o.at)]!, sp, k + 1),
    );
  }

  // Glow sprites.
  const lampGlow = glowSprite(255, 214, 120);
  const hotGlow = glowSprite(255, 90, 40);
  const goodGlow = glowSprite(140, 255, 160);

  // ---- Buttons ------------------------------------------------------------------------------------
  const gaugeBtns: Btn[] =
    gauges.length > 1 ? gauges.map((_, i) => ({ x: 4 + i * 58, y: ROW_Y, w: 54, h: ROW_H })) : [];
  const leverBtn: Btn = { x: W - 104, y: ROW_Y, w: 100, h: ROW_H };
  const undoBtn: Btn = { x: W - 136, y: ROW_Y, w: 28, h: ROW_H };

  // ---- State --------------------------------------------------------------------------------------
  let gauge = 0;
  let used = 0;
  let t = 0;
  let flashBudget = 0;
  let running = false;
  let runT = 0;
  let runDur = 2.4;
  let judged = false;
  interface Change {
    e: number;
    was: number;
  }
  const undo: Change[][] = [];
  let stroke: Change[] | null = null;
  let strokeNodes: number[] = [];
  let cur = -1;
  let pressX = 0;
  let pressY = 0;
  let pressEdge = -1;
  let mode: 'none' | 'draw' | 'erase' = 'none';

  const costOf = (gi: number): number => (gi >= 0 ? gauges[gi]!.cost : 0);
  const setWire = (e: number, gi: number): void => {
    used += costOf(gi) - costOf(wire[e]!);
    wire[e] = gi;
  };

  // Particles: smoke, sparks, splashes (a fixed pool).
  // Particle positions/lifetimes use the same 80 slots, visited below PN or selected modulo PN.
  const PN = 80;
  const px = new Float32Array(PN);
  const py = new Float32Array(PN);
  const pvx = new Float32Array(PN);
  const pvy = new Float32Array(PN);
  const plife = new Float32Array(PN);
  const pkind = new Uint8Array(PN); // 0 smoke, 1 spark, 2 water, 3 dust
  let pnext = 0;
  const spawn = (x: number, y: number, vx: number, vy: number, life: number, kind: number): void => {
    const i = pnext;
    pnext = (pnext + 1) % PN;
    px[i] = x;
    py[i] = y;
    pvx[i] = vx;
    pvy[i] = vy;
    plife[i] = life;
    pkind[i] = kind;
  };

  // ---- Circuit: a real resistive network ----------------------------------------------------------
  const { before, after, fuseOpen, fusePop, loadPop, uf, find, join, runCircuit } = createCircuit({
    N,
    E,
    src,
    loads,
    fuses,
    plusN,
    minusN,
    eu,
    ev,
    gauges,
    laidAt,
    id,
  });

  // ---- Route: what is joined -----------------------------------------------------------------------
  const rdist = new Int16Array(N).fill(-1);
  const rfrom = new Int16Array(N).fill(-1);
  let maxDist = 0;
  interface Traveller {
    // Every route includes the validated start (even a disconnected destination travels to the nearest reached node).
    path: number[];
    delay: number;
    lost: boolean; // ends at a loose end, not at its stop
  }
  const travellers: Traveller[] = [];
  const reached: boolean[] = stops.map(() => false);
  const deadEnds: number[] = [];
  function runRoute(): void {
    rdist.fill(-1);
    if (startN < 0) return;
    const queue = new Int16Array(N);
    let qh = 0;
    let qt = 0;
    rdist[startN] = 0;
    queue[qt++] = startN;
    while (qh < qt) {
      const u = queue[qh++]!;
      const uc = u % cols;
      for (let k = 0; k < 4; k++) {
        const v =
          k === 0
            ? uc > 0
              ? u - 1
              : -1
            : k === 1
              ? uc < cols - 1
                ? u + 1
                : -1
              : k === 2
                ? u - cols
                : u + cols;
        if (v < 0 || v >= N || rdist[v]! >= 0) continue;
        const e = edgeBetween(u, v);
        if (e < 0 || laidAt(e) < 0) continue;
        rdist[v] = rdist[u]! + 1;
        rfrom[v] = u;
        maxDist = Math.max(maxDist, rdist[v]!);
        queue[qt++] = v;
      }
    }
    // Loose ends: reached points with one piece that aren't stops.
    for (let i = 0; i < N; i++) {
      if (rdist[i]! <= 0 || stopN.includes(i)) continue;
      let deg = 0;
      const ic = i % cols;
      if (ic > 0 && laidAt(edgeBetween(i, i - 1)) >= 0) deg++;
      if (ic < cols - 1 && laidAt(edgeBetween(i, i + 1)) >= 0) deg++;
      if (i - cols >= 0 && laidAt(edgeBetween(i, i - cols)) >= 0) deg++;
      if (i + cols < N && laidAt(edgeBetween(i, i + cols)) >= 0) deg++;
      if (deg === 1) deadEnds.push(i);
    }
    stops.forEach((_, k) => {
      let goal = stopN[k]!;
      let lost = false;
      if (rdist[goal]! < 0) {
        // Head for the reached point nearest the stop: that's where it stops short.
        lost = true;
        let best = -1;
        let bd = 1e9;
        for (let i = 0; i < N; i++) {
          if (rdist[i]! < 0) continue;
          const d =
            Math.abs((i % cols) - (goal % cols)) + Math.abs(Math.floor(i / cols) - Math.floor(goal / cols));
          if (d < bd || (d === bd && (best < 0 || rdist[i]! > rdist[best]!))) {
            bd = d;
            best = i;
          }
        }
        goal = best;
      } else reached[k] = true;
      const pathNodes: number[] = [];
      if (p.inbound && lost)
        pathNodes.push(stopN[k]!); // nothing can get on: it waits at its stop
      else {
        for (let v = goal; v >= 0; v = rdist[v]! > 0 ? rfrom[v]! : -1) pathNodes.push(v);
        if (!p.inbound) pathNodes.reverse();
      }
      travellers.push({ path: pathNodes, delay: k * 0.35, lost });
    });
    let longest = 0;
    for (const tr of travellers) longest = Math.max(longest, tr.path.length - 1 + tr.delay * SPEED);
    runDur = Math.min(6, Math.max(1.8, (look === 'pipe' ? maxDist : longest) / SPEED + 1.2));
  }

  // ---- Judging --------------------------------------------------------------------------------------
  function outcome(): { o: PathOutcome; line: string } {
    const push = loads.map((l, k) => after.vl[k]! / l.volts);
    const mk = (quality: Quality, cause: PathCause, line: string): { o: PathOutcome; line: string } => ({
      o: { quality, cause, used, push },
      line,
    });
    const principle = p.words.principle ? ` ${p.words.principle}` : '';
    if (!circuit) {
      const miss = stops.findIndex((_, k) => !reached[k]);
      const home = p.start?.name ?? 'the start';
      if (miss >= 0)
        return mk(
          0,
          'gap',
          p.inbound
            ? `${stops[miss]!.name} isn't joined: nothing from it can reach ${home}.`
            : `${L.lost}: ${stops[miss]!.name} isn't joined to ${home}.`,
        );
      const what =
        stops.length === 2 ? 'Both joined' : stops.length > 2 ? `All ${stops.length} joined` : 'Joined';
      if (used <= par)
        return mk(2, 'perfect', `${what} in ${used} ${L.unit} — the shortest way.${principle}`);
      return mk(1, 'over-par', `${what}, but with ${used} ${L.unit} where ${par} would do.${principle}`);
    }
    if (!src) return mk(0, 'open', 'No source of push on the board.');
    // Nets: points joined by wire alone.
    for (let i = 0; i < N; i++) uf[i] = i;
    for (let e = 0; e < E; e++) if (laidAt(e) >= 0) join(eu[e]!, ev[e]!);
    for (let k = 0; k < nF; k++) if (!fuseOpen[k]!) join(id(fuses[k]!.a), id(fuses[k]!.b));
    const netP = find(plusN);
    const netM = find(minusN);
    if (netP === netM)
      return mk(
        0,
        'short',
        `Short circuit: ${fmtA(after.isrc)} rushed from + straight back to −, past everything.`,
      );
    let hot = -1;
    let hotR = 1;
    for (let e = 0; e < E; e++) {
      if (laidAt(e) < 0) continue;
      const r = Math.abs(after.ie[e]!) / gauges[laidAt(e)]!.amps;
      if (r > hotR) {
        hotR = r;
        hot = e;
      }
    }
    if (hot >= 0) {
      const gg = gauges[laidAt(hot)]!;
      return mk(
        0,
        'burnt',
        `A ${gg.name} wire glowed red: it carried ${fmtA(after.ie[hot]!)}, more than its ${fmtA(gg.amps)} — too much flow for its size.`,
      );
    }
    const fz = fusePop.indexOf(1);
    if (fz >= 0)
      return mk(
        0,
        'fuse',
        `The ${fmtA(fuses[fz]!.amps)} fuse popped at ${fmtA(before.ifz[fz]!)}: too much flow on one line — it broke first, on purpose.`,
      );
    const lp = loadPop.indexOf(1);
    if (lp >= 0)
      return mk(
        0,
        'popped',
        `${loads[lp]!.name} popped: ${fmtV(before.vl[lp]!)} on a ${fmtV(loads[lp]!.volts)} rating — too much push.`,
      );
    // The weakest load decides (an optional one only if it was wired up).
    const judged = loads.map(
      (ld, k) => !(ld.optional && Math.abs(after.il[k]!) < 1e-4 && find(id(ld.a)) !== find(id(ld.b))),
    );
    let worst = -1;
    let wp = Infinity;
    for (let k = 0; k < nL; k++) {
      if (!judged[k]!) continue;
      const share = push[k]! / (loads[k]!.works ?? 0.8);
      if (share < wp) {
        wp = share;
        worst = k;
      }
    }
    if (worst < 0) return mk(0, 'open', 'Nothing to power.');
    const l = loads[worst]!;
    const lpush = push[worst]!;
    const across = (() => {
      const na = find(id(l.a));
      const nb = find(id(l.b));
      return (na === netP && nb === netM) || (na === netM && nb === netP);
    })();
    const noun = l.icon === 'motor' ? 'motor' : 'lamp';
    const why = (): { cause: PathCause; line: string } => {
      if (find(id(l.a)) === find(id(l.b)))
        return {
          cause: 'open',
          line: `${l.name} is bypassed: a wire joins both its leads, so the current goes round it.`,
        };
      if (Math.abs(after.il[worst]!) < 1e-4)
        return {
          cause: 'open',
          line: `${l.name} isn't on a closed loop: current needs a way there and back.`,
        };
      if (!across)
        return {
          cause: 'chain',
          line: `In a chain they share the push: ${l.name} got only ${fmtV(after.vl[worst]!)} of ${fmtV(after.vt)}.`,
        };
      if (after.vt < 0.9 * src.volts)
        return {
          cause: 'sag',
          line: `Too much on at once: the ${src.name.toLowerCase()} sagged to ${fmtV(after.vt)} — it gives only so much.`,
        };
      return {
        cause: 'wires',
        line: `${l.name} got ${pct(lpush)} of its push: the long thin wire turned the rest into heat.`,
      };
    };
    if (push.some((x, k) => judged[k]! && x < (loads[k]!.works ?? 0.8))) {
      const w = why();
      return mk(0, w.cause, w.line);
    }
    const weakest = loads.reduce(
      (m, ld, k) => (judged[k]! ? Math.min(m, push[k]! / (ld.perfect ?? 0.93)) : m),
      Infinity,
    );
    if (weakest < 1) {
      const w = why();
      return mk(
        1,
        w.cause,
        `It works, but ${w.cause === 'chain' ? `the ${noun}s share the push in a chain` : w.cause === 'sag' ? `the ${src.name.toLowerCase()} sagged to ${fmtV(after.vt)}` : `${l.name} got ${pct(lpush)} of its push — thin wire wastes it as heat`}.`,
      );
    }
    if (used > par)
      return mk(1, 'over-par', `Bright, but ${used} ${pieceWord} where ${par} would do.${principle}`);
    const on = loads.filter((_, k) => judged[k]!);
    let low = worst;
    for (let k = 0; k < nL; k++) if (judged[k]! && push[k]! < push[low]!) low = k;
    const first = on[0];
    if (!first) throw new Error('A judged load must remain after finding the worst load');
    const same = on.every((ld) => (ld.icon ?? 'lamp') === (first.icon ?? 'lamp'));
    const kind = `${first.icon ?? 'lamp'}s`;
    const n = on.length;
    const line =
      n === 1
        ? `${first.name} got ${pct(push[low]!)} of its push (${fmtV(after.vl[low]!)}).`
        : `${n === 2 ? (same ? `Both ${kind}` : 'Both') : same ? `All ${n} ${kind}` : `All ${n}`} got ${pct(push[low]!)} or more of their push.`;
    return mk(2, 'perfect', `${line}${principle}`);
  }

  // ---- Input ------------------------------------------------------------------------------------------
  const nodeAt = (x: number, y: number): number => {
    const c = Math.round((x - ox) / sp);
    const r = Math.round((y - oy) / sp);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return -1;
    return r * cols + c;
  };
  /** The laid piece nearest (x, y) within `tol` px of its middle part, or -1. */
  const edgeAt = (x: number, y: number, tol: number): number => {
    let best = -1;
    let bd = tol;
    const c0 = Math.floor((x - ox) / sp);
    const r0 = Math.floor((y - oy) / sp);
    for (let dc = -1; dc <= 1; dc++)
      for (let dr = -1; dr <= 1; dr++) {
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const n = r * cols + c;
        for (const m of [n + 1, n + cols]) {
          if ((m === n + 1 && c >= cols - 1) || m >= N) continue;
          const e = edgeBetween(n, m);
          if (e < 0 || wire[e]! < 0) continue;
          const mx = (NX[n]! + NX[m]!) / 2;
          const my = (NY[n]! + NY[m]!) / 2;
          const along = m === n + 1 ? Math.abs(x - mx) : Math.abs(y - my);
          const across = m === n + 1 ? Math.abs(y - my) : Math.abs(x - mx);
          if (along > sp * 0.38) continue;
          if (across < bd) {
            bd = across;
            best = e;
          }
        }
      }
    return best;
  };

  function begin(n: number): void {
    mode = 'draw';
    cur = n;
    stroke = [];
    strokeNodes = [n];
  }

  function stepTo(target: number): void {
    let guard = 0;
    while (cur !== target && guard++ < 48) {
      const cc = cur % cols;
      const cr = (cur - cc) / cols;
      const tc = target % cols;
      const tr = (target - tc) / cols;
      let nc = cc;
      let nr = cr;
      if (Math.abs(tc - cc) >= Math.abs(tr - cr)) nc += Math.sign(tc - cc);
      else nr += Math.sign(tr - cr);
      const nxt = nr * cols + nc;
      if (stroke && strokeNodes.length >= 2 && strokeNodes[strokeNodes.length - 2] === nxt) {
        // Back over the last piece: take it up again.
        const ch = stroke.pop()!;
        setWire(ch.e, ch.was);
        strokeNodes.pop();
        cur = nxt;
        continue;
      }
      if (blockedN[nxt]!) break;
      const e = edgeBetween(cur, nxt);
      if (e < 0 || blockedE[e]! || fixed[e]! >= 0) {
        if (e >= 0 && fixed[e]! >= 0 && stroke) {
          // Along a piece that was there before: walk it without laying.
          stroke.push({ e, was: wire[e]! });
          strokeNodes.push(nxt);
          cur = nxt;
          continue;
        }
        break;
      }
      const was = wire[e]!;
      if (was !== gauge) {
        if (used + costOf(gauge) - costOf(was) > p.budget) {
          flashBudget = 1;
          break;
        }
        setWire(e, gauge);
      }
      stroke!.push({ e, was });
      strokeNodes.push(nxt);
      cur = nxt;
    }
  }

  function finishStroke(): void {
    if (stroke && stroke.some((ch) => wire[ch.e]! !== ch.was)) undo.push(stroke);
    stroke = null;
    strokeNodes = [];
    cur = -1;
    mode = 'none';
  }

  function doUndo(): void {
    const last = undo.pop();
    if (!last) return;
    for (let i = last.length - 1; i >= 0; i--) setWire(last[i]!.e, last[i]!.was);
  }

  function throwLever(): void {
    if (running || end.finished()) return;
    finishStroke();
    running = true;
    runT = 0;
    if (circuit) runDur = runCircuit() ? 2.9 : 2.5;
    else runRoute();
  }

  function onDown(pt: { x: number; y: number }): void {
    if (running || end.finished()) return;
    if (pt.y >= ROW_Y - 2) {
      gaugeBtns.forEach((b, i) => {
        if (inBtn(b, pt.x, pt.y)) gauge = i;
      });
      if (inBtn(undoBtn, pt.x, pt.y)) doUndo();
      if (inBtn(leverBtn, pt.x, pt.y)) throwLever();
      return;
    }
    pressX = pt.x;
    pressY = pt.y;
    const n = nodeAt(pt.x, pt.y);
    pressEdge = edgeAt(pt.x, pt.y, 7);
    const nearNode = n >= 0 && Math.hypot(pt.x - NX[n]!, pt.y - NY[n]!) < sp * 0.3;
    if (pressEdge >= 0 && !nearNode) {
      mode = 'erase';
      return;
    }
    if (n >= 0 && !blockedN[n]!) begin(n);
  }

  function onUp(pt: { x: number; y: number }): void {
    if (mode === 'erase') {
      if (Math.hypot(pt.x - pressX, pt.y - pressY) < 8 && pressEdge >= 0 && wire[pressEdge]! >= 0) {
        undo.push([{ e: pressEdge, was: wire[pressEdge]! }]);
        setWire(pressEdge, -1);
      }
      mode = 'none';
      return;
    }
    if (mode === 'draw') finishStroke();
  }

  const c = canvasIn(host, W, H, { down: onDown, up: onUp });
  const g = c.g;
  const pointer = c.pointer;
  // The goal line, as large as fits beside the time bar.
  let goalSize = 11;
  for (; goalSize > 8; goalSize -= 0.5) {
    g.font = `${goalSize}px ${FONT}`;
    if (g.measureText(p.words.goal).width <= W - 66) break;
  }

  const onKey = (e: KeyboardEvent): void => {
    if (end.finished()) return;
    const k = e.key;
    let handled = true;
    if (k >= '1' && k <= '9' && Number(k) <= gauges.length && gauges.length > 1) gauge = Number(k) - 1;
    else if (k === 'Enter' || k === ' ') throwLever();
    else if (k === 'z' || k === 'Z' || k === 'Backspace') {
      if (!running) doUndo();
    } else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  window.addEventListener('keydown', onKey, true);

  // ---- Drawing --------------------------------------------------------------------------------------
  const heatShown = new Float32Array(E);
  const loadShown = new Float32Array(nL);
  const goalText = p.words.goal;
  const hintText =
    p.words.hint ??
    (circuit
      ? 'Drag along the dots: from + to each lamp, and back to −'
      : `Drag from the ${p.start?.name ?? 'start'} along the dots to ${stops.length > 1 ? 'every stop' : (stops[0]!?.name ?? 'the stop')}`);

  function drawPiece(e: number, colour: string, width: number): void {
    const x0 = NX[eu[e]!]!;
    const y0 = NY[eu[e]!]!;
    const x1 = NX[ev[e]!]!;
    const y1 = NY[ev[e]!]!;
    const horiz = y0 === y1;
    switch (look) {
      case 'rail': {
        g.strokeStyle = '#6b4a2b';
        g.lineWidth = 2;
        g.beginPath();
        for (let k = 0; k < 4; k++) {
          const f = (k + 0.5) / 4;
          const mx = x0 + (x1 - x0) * f;
          const my = y0 + (y1 - y0) * f;
          if (horiz) {
            g.moveTo(mx, my - 4.5);
            g.lineTo(mx, my + 4.5);
          } else {
            g.moveTo(mx - 4.5, my);
            g.lineTo(mx + 4.5, my);
          }
        }
        g.stroke();
        g.strokeStyle = colour;
        g.lineWidth = 1.4;
        g.beginPath();
        for (const o of [-2.6, 2.6]) {
          if (horiz) {
            g.moveTo(x0 - 1, y0 + o);
            g.lineTo(x1 + 1, y1 + o);
          } else {
            g.moveTo(x0 + o, y0 - 1);
            g.lineTo(x1 + o, y1 + 1);
          }
        }
        g.stroke();
        break;
      }
      case 'pipe':
        g.strokeStyle = '#3c4247';
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        g.strokeStyle = colour;
        g.lineWidth = 5;
        g.stroke();
        break;
      case 'belt':
        g.strokeStyle = '#2a2420';
        g.lineWidth = 8;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        g.strokeStyle = colour;
        g.lineWidth = 6;
        g.stroke();
        break;
      case 'link':
        g.strokeStyle = colour;
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        break;
      case 'track':
        g.strokeStyle = colour;
        g.lineWidth = 2;
        g.setLineDash([3, 3]);
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        g.setLineDash([]);
        break;
      default:
        g.strokeStyle = colour;
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
    }
  }

  const baseColour = (): string => {
    switch (look) {
      case 'rail':
        return '#aab3bd';
      case 'pipe':
        return '#7d868e';
      case 'belt':
        return '#4a403a';
      case 'link':
        return '#6ad1ff';
      case 'track':
        return '#e7c79a';
      default:
        return HEAT[0]!;
    }
  };
  const gaugeWidth = (gi: number): number => 1.6 + gi * 1.35;

  function drawLoad(k: number, bright: number, dead: boolean): void {
    const l = loads[k]!;
    const ax = NX[id(l.a)]!;
    const ay = NY[id(l.a)]!;
    const bx = NX[id(l.b)]!;
    const by = NY[id(l.b)]!;
    const x = (ax + bx) / 2;
    const y = (ay + by) / 2;
    // Leads.
    g.strokeStyle = '#8a7a5a';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
    const icon = l.icon ?? 'lamp';
    if (icon === 'lamp') {
      if (bright > 0.02) {
        const R = 10 + 16 * Math.min(1.4, bright);
        g.globalAlpha = Math.min(1, bright * 1.1);
        g.drawImage(lampGlow, x - R, y - R, R * 2, R * 2);
        g.globalAlpha = 1;
      }
      g.fillStyle = dead ? '#2c2925' : BULB[Math.max(0, Math.min(15, Math.round(Math.min(1, bright) * 15)))]!;
      g.beginPath();
      g.arc(x, y, 6.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = dead ? '#5a5048' : '#d8c79a';
      g.lineWidth = 1;
      g.stroke();
      // Filament (or the broken one).
      g.strokeStyle = dead ? '#6a5a4a' : bright > 0.05 ? '#fff8d8' : '#7a6a50';
      g.beginPath();
      if (dead) {
        g.moveTo(x - 3, y - 1);
        g.lineTo(x - 0.5, y + 1.5);
        g.moveTo(x + 0.5, y - 1.5);
        g.lineTo(x + 3, y + 1);
      } else {
        g.moveTo(x - 3, y + 1);
        g.lineTo(x - 1.5, y - 1.5);
        g.lineTo(x, y + 1);
        g.lineTo(x + 1.5, y - 1.5);
        g.lineTo(x + 3, y + 1);
      }
      g.stroke();
    } else if (icon === 'motor') {
      // A drum with a rotor that spins with the power it gets.
      g.fillStyle = '#34424a';
      g.beginPath();
      g.arc(x, y, 8, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = bright > 0.5 ? '#9fd8ff' : '#7a8c96';
      g.lineWidth = 1.2;
      g.stroke();
      const a = rotor[k]!;
      g.strokeStyle = dead ? '#555' : '#cfe6f0';
      g.beginPath();
      for (let j = 0; j < 3; j++) {
        const aa = a + (j * Math.PI * 2) / 3;
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(aa) * 5.5, y + Math.sin(aa) * 5.5);
      }
      g.stroke();
      text(g, 'M', x, y, { size: 7, color: '#e9f4f8', bold: true });
    } else {
      // Fence, bell, mast: a plate with its sign, lit by the power it gets.
      if (bright > 0.05) {
        g.globalAlpha = Math.min(0.8, bright * 0.7);
        g.drawImage(lampGlow, x - 16, y - 16, 32, 32);
        g.globalAlpha = 1;
      }
      g.fillStyle = '#2c2a26';
      rrect(g, x - 8, y - 8, 16, 16, 3);
      g.fill();
      const on = bright > 0.3;
      g.strokeStyle = on ? '#ffe9a0' : '#8a7a5a';
      g.lineWidth = 1.3;
      g.beginPath();
      if (icon === 'fence') {
        g.moveTo(x + 2, y - 6);
        g.lineTo(x - 3, y + 1);
        g.lineTo(x + 1, y + 1);
        g.lineTo(x - 2, y + 6);
      } else if (icon === 'bell') {
        g.moveTo(x - 4, y + 3);
        g.quadraticCurveTo(x - 4, y - 5, x, y - 5);
        g.quadraticCurveTo(x + 4, y - 5, x + 4, y + 3);
        g.closePath();
        g.moveTo(x - 5, y + 3);
        g.lineTo(x + 5, y + 3);
      } else {
        g.moveTo(x, y - 6);
        g.lineTo(x - 4, y + 6);
        g.moveTo(x, y - 6);
        g.lineTo(x + 4, y + 6);
        g.moveTo(x - 2.5, y + 1);
        g.lineTo(x + 2.5, y + 1);
      }
      g.stroke();
    }
    // Name (and readings when running), on the side with room, over a soft backdrop so wires don't hide it.
    const right = x < W - 70;
    const tx = right ? x + 11 : x - 11;
    const reading = running && runT > 0.35 ? `${fmtV(after.vl[k]!)} · ${fmtA(after.il[k]!)}` : '';
    g.font = `9px ${FONT}`;
    const tw = Math.max(g.measureText(l.name).width, reading ? g.measureText(reading).width : 0) + 6;
    g.fillStyle = 'rgba(20,17,13,0.72)';
    rrect(g, right ? tx - 3 : tx - tw + 3, y - (reading ? 11 : 6), tw, reading ? 22 : 12, 3);
    g.fill();
    text(g, l.name, tx, y - (reading ? 5 : 0), { size: 9, color: PAL.dim, align: right ? 'left' : 'right' });
    if (reading) {
      const push = after.vl[k]! / l.volts;
      const col = loadPop[k]
        ? PAL.bad
        : push >= (l.perfect ?? 0.93)
          ? PAL.good
          : push >= (l.works ?? 0.8)
            ? PAL.gold
            : PAL.bad;
      text(g, reading, tx, y + 6, { size: 9, color: col, align: right ? 'left' : 'right' });
    }
  }
  const rotor = new Float32Array(nL);

  function drawSource(): void {
    if (!src) return;
    const px0 = NX[plusN]!;
    const py0 = NY[plusN]!;
    const px1 = NX[minusN]!;
    const py1 = NY[minusN]!;
    const vertical = Math.abs(px0 - px1) < 1;
    const bx = vertical ? px0 - 19 : (px0 + px1) / 2;
    const by = vertical ? (py0 + py1) / 2 : py0 - 19;
    const bw = vertical ? 22 : Math.abs(px1 - px0) + 16;
    const bh = vertical ? Math.abs(py1 - py0) + 16 : 22;
    g.fillStyle = '#2b2419';
    rrect(g, bx - bw / 2, by - bh / 2, bw, bh, 4);
    g.fill();
    g.strokeStyle = '#8a6a34';
    g.lineWidth = 1;
    g.stroke();
    // Leads out to the studs.
    g.strokeStyle = '#8a7a5a';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(bx + (vertical ? bw / 2 : 0), py0);
    g.lineTo(px0, py0);
    g.moveTo(bx + (vertical ? bw / 2 : 0), py1);
    g.lineTo(px1, py1);
    g.stroke();
    // A spinning dynamo wheel.
    const spin = running ? runT * 9 : t * 0.6;
    g.strokeStyle = '#c9a24a';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(bx, by, 6, 0, Math.PI * 2);
    for (let j = 0; j < 4; j++) {
      const a = spin + (j * Math.PI) / 2;
      g.moveTo(bx, by);
      g.lineTo(bx + Math.cos(a) * 6, by + Math.sin(a) * 6);
    }
    g.stroke();
    g.font = `8px ${FONT}`;
    const nameW = g.measureText(src.name).width;
    text(g, src.name, Math.max(4 + nameW / 2, bx), by - bh / 2 - 6, { size: 8, color: PAL.gold });
    text(g, fmtV(src.volts), bx, by + 14, { size: 8, color: PAL.dim });
    if (running && runT > 0.35) text(g, fmtA(after.isrc), bx, by + bh / 2 + 7, { size: 8, color: PAL.ink });
  }

  function drawStud(n: number, kind: number): void {
    const x = NX[n]!;
    const y = NY[n]!;
    if (kind === 1 || kind === 2) {
      g.fillStyle = kind === 1 ? '#c8463a' : '#3a6ec8';
      g.beginPath();
      g.arc(x, y, 4.5, 0, Math.PI * 2);
      g.fill();
      text(g, kind === 1 ? '+' : '−', x, y + 0.5, { size: 8, color: '#fff', bold: true });
    } else if (kind === 3) {
      g.fillStyle = '#c9a24a';
      g.beginPath();
      g.arc(x, y, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawStop(n: number, name: string, isStart: boolean, ok: boolean, lost: boolean): void {
    const x = NX[n]!;
    const y = NY[n]!;
    if (ok) {
      g.globalAlpha = 0.8;
      g.drawImage(goodGlow, x - 16, y - 16, 32, 32);
      g.globalAlpha = 1;
    }
    g.fillStyle = isStart ? '#3a2f1e' : '#1e2a1e';
    g.beginPath();
    g.arc(x, y, 6.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = lost ? PAL.bad : ok ? PAL.good : PAL.gold;
    g.lineWidth = 1.6;
    g.stroke();
    if (isStart) {
      g.fillStyle = PAL.gold;
      g.beginPath();
      g.arc(x, y, 2.5, 0, Math.PI * 2);
      g.fill();
    } else {
      g.strokeStyle = ok ? PAL.good : PAL.gold;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.stroke();
    }
    const above = Math.floor(n / cols) > 0;
    const ly = above ? y - 12 : y + 12;
    const lx = Math.max(30, Math.min(W - 30, x));
    text(g, name, lx, ly, { size: 9, color: ok ? PAL.good : lost ? PAL.bad : PAL.ink });
  }

  function drawFuse(k: number): void {
    const f = fuses[k]!;
    const ax = NX[id(f.a)]!;
    const ay = NY[id(f.a)]!;
    const bx = NX[id(f.b)]!;
    const by = NY[id(f.b)]!;
    const x = (ax + bx) / 2;
    const y = (ay + by) / 2;
    const horiz = Math.abs(ay - by) < 1;
    const blown = running && runT > 0.6 && fusePop[k];
    g.strokeStyle = '#8a7a5a';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
    g.fillStyle = 'rgba(200,220,230,0.25)';
    g.strokeStyle = '#c9d6dd';
    g.lineWidth = 1;
    if (horiz) rrect(g, x - 8, y - 4, 16, 8, 3);
    else rrect(g, x - 4, y - 8, 8, 16, 3);
    g.fill();
    g.stroke();
    g.strokeStyle = blown ? '#3a3a3a' : '#e0c080';
    g.beginPath();
    if (blown) {
      if (horiz) {
        g.moveTo(x - 6, y);
        g.lineTo(x - 2, y + 1);
        g.moveTo(x + 2, y - 1);
        g.lineTo(x + 6, y);
      } else {
        g.moveTo(x, y - 6);
        g.lineTo(x + 1, y - 2);
        g.moveTo(x - 1, y + 2);
        g.lineTo(x, y + 6);
      }
    } else if (horiz) {
      g.moveTo(x - 6, y);
      g.lineTo(x + 6, y);
    } else {
      g.moveTo(x, y - 6);
      g.lineTo(x, y + 6);
    }
    g.stroke();
    text(g, fmtA(f.amps), horiz ? x : x + 8, horiz ? y - 9 : y, {
      size: 8,
      color: blown ? PAL.bad : PAL.dim,
      align: horiz ? 'center' : 'left',
    });
  }

  function drawButton(b: Btn, label: string, on: boolean, hot: boolean, size = 10): void {
    const hover = !running && inBtn(b, pointer.x, pointer.y);
    g.fillStyle = on ? '#3a2f1c' : hover ? '#2c241a' : '#1e1912';
    rrect(g, b.x, b.y, b.w, b.h, 5);
    g.fill();
    g.strokeStyle = on ? PAL.gold : hot ? '#b0503a' : '#5a4a30';
    g.lineWidth = on ? 1.5 : 1;
    g.stroke();
    text(g, label, b.x + b.w / 2, b.y + b.h / 2 + 0.5, { size, color: on ? PAL.gold : PAL.ink });
  }

  function drawTools(): void {
    if (gauges.length > 1) {
      gauges.forEach((gg, i) => {
        const b = gaugeBtns[i]!;
        drawButton(b, '', i === gauge, false);
        g.strokeStyle = HEAT[0]!;
        g.lineWidth = gaugeWidth(i);
        g.beginPath();
        g.moveTo(b.x + 7, b.y + 8);
        g.lineTo(b.x + b.w - 7, b.y + 8);
        g.stroke();
        text(g, `${i + 1} ${gg.name}`, b.x + b.w / 2, b.y + 17, {
          size: 9,
          color: i === gauge ? PAL.gold : PAL.dim,
        });
      });
    }
    // The budget.
    const bx = gauges.length > 1 ? 4 + gauges.length * 58 + 4 : 8;
    const left = p.budget - used;
    const fl = flashBudget > 0 && Math.floor(flashBudget * 8) % 2 === 0;
    text(g, pieceWord.charAt(0).toUpperCase() + pieceWord.slice(1), bx, ROW_Y + 7, {
      size: 9,
      color: PAL.dim,
      align: 'left',
    });
    text(g, `${left} left`, bx, ROW_Y + 18, {
      size: 10,
      color: fl ? PAL.bad : left <= 2 ? PAL.hot : PAL.ink,
      align: 'left',
      bold: true,
    });
    drawButton(undoBtn, '↶', false, false, 13);
    drawButton(leverBtn, '', running, true);
    // The lever: a handle that drops when thrown.
    const lx = leverBtn.x + 14;
    const ly = leverBtn.y + leverBtn.h / 2;
    const tipX = lx - 4;
    const tipY = running ? ly + 6 : ly - 7;
    g.fillStyle = '#5a4a30';
    g.fillRect(lx - 3, ly - 1, 6, 3);
    g.strokeStyle = '#c9a24a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(lx, ly);
    g.lineTo(tipX, tipY);
    g.stroke();
    g.fillStyle = '#c8463a';
    g.beginPath();
    g.arc(tipX, tipY, 2.4, 0, Math.PI * 2);
    g.fill();
    text(g, leverWord, leverBtn.x + 58, ly + 0.5, { size: 10, color: running ? PAL.gold : PAL.ink });
  }

  function drawTop(): void {
    text(g, goalText, 6, 9, { size: goalSize, color: PAL.gold, align: 'left' });
    if (circuit && running && runT > 0.35) {
      // What the wires waste: push × flow turned into heat.
      const s = runT < 0.6 ? before : after;
      let loss = 0;
      for (let e = 0; e < E; e++) if (laidAt(e) >= 0) loss += s.ie[e]! * s.ie[e]! * gauges[laidAt(e)]!.ohms;
      const out = s.vt * s.isrc;
      text(g, `Wires: ${Math.round(loss)} W of ${Math.round(out)} W lost as heat`, W - 10, TOP + 9, {
        size: 9,
        color: loss > out * 0.12 ? PAL.hot : PAL.dim,
        align: 'right',
      });
    }
    // Time left: a thin bar.
    const left = Math.max(0, 1 - t / timeLimit);
    g.fillStyle = '#2a2318';
    g.fillRect(W - 54, 6, 48, 4);
    g.fillStyle = left < 0.2 ? PAL.bad : '#8a7a5a';
    g.fillRect(W - 54, 6, 48 * left, 4);
  }

  function drawParticles(dt: number): void {
    for (let i = 0; i < PN; i++) {
      if (plife[i]! <= 0) continue;
      plife[i]! -= dt;
      px[i]! += pvx[i]! * dt;
      py[i]! += pvy[i]! * dt;
      const k = pkind[i]!;
      if (k === 1 || k === 2 || k === 3) pvy[i]! += 120 * dt;
      else pvx[i]! *= 0.98;
      const a = Math.max(0, Math.min(1, plife[i]! * 1.5));
      if (k === 0) {
        g.globalAlpha = a * 0.55;
        g.fillStyle = '#8a827a';
        g.beginPath();
        g.arc(px[i]!, py[i]!, 1.5 + (1.2 - plife[i]!) * 2.5, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      g.globalAlpha = a;
      g.fillStyle = k === 1 ? '#ffe9a0' : k === 2 ? '#6ab8ff' : '#b08a62';
      g.fillRect(px[i]! - 0.8, py[i]! - 0.8, 1.6, 1.6);
    }
    g.globalAlpha = 1;
  }

  /** Where a traveller is, `d` squares along its path. */
  const along = (tr: Traveller, d: number, out: { x: number; y: number; dx: number; dy: number }): void => {
    const last = tr.path.length - 1;
    if (last <= 0) {
      out.x = NX[tr.path[0]!]!;
      out.y = NY[tr.path[0]!]!;
      out.dx = 1;
      out.dy = 0;
      return;
    }
    const dd = Math.max(0, Math.min(last, d));
    const i = Math.min(last - 1, Math.floor(dd));
    const f = dd - i;
    const a = tr.path[i]!;
    const b = tr.path[i + 1]!;
    out.x = NX[a]! + (NX[b]! - NX[a]!) * f;
    out.y = NY[a]! + (NY[b]! - NY[a]!) * f;
    out.dx = Math.sign(NX[b]! - NX[a]!);
    out.dy = Math.sign(NY[b]! - NY[a]!);
  };
  const tmpPos = { x: 0, y: 0, dx: 0, dy: 0 };

  function drawTraveller(tr: Traveller): void {
    const last = tr.path.length - 1;
    const d = (runT - tr.delay) * SPEED;
    if (d < 0) return;
    along(tr, d, tmpPos);
    const { x, y } = tmpPos;
    const stopped = d >= last;
    const tilt = stopped && tr.lost ? Math.min(0.7, (d - last) * 0.5) : 0;
    g.save();
    g.translate(x, y);
    const ang = Math.atan2(tmpPos.dy, tmpPos.dx);
    switch (look) {
      case 'rail':
        g.rotate(tilt);
        g.fillStyle = '#d8b25a';
        g.beginPath();
        g.arc(-3, -5, 2.6, 0, Math.PI * 2);
        g.arc(1, -6, 3, 0, Math.PI * 2);
        g.arc(4, -4.5, 2.2, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#9a6234';
        g.beginPath();
        g.moveTo(-7.5, -4.5);
        g.lineTo(7.5, -4.5);
        g.lineTo(6, 3);
        g.lineTo(-6, 3);
        g.closePath();
        g.fill();
        g.strokeStyle = '#3a2410';
        g.lineWidth = 1;
        g.stroke();
        g.fillStyle = '#1a1a1a';
        g.beginPath();
        g.arc(-3.5, 3.5, 2, 0, Math.PI * 2);
        g.arc(3.5, 3.5, 2, 0, Math.PI * 2);
        g.fill();
        break;
      case 'belt':
        g.rotate(tilt);
        g.fillStyle = '#9a6a3a';
        g.fillRect(-3.5, -3.5, 7, 7);
        g.strokeStyle = '#5a3a1a';
        g.lineWidth = 1;
        g.strokeRect(-3.5, -3.5, 7, 7);
        break;
      case 'link':
      case 'wire':
        g.drawImage(lampGlow, -7, -7, 14, 14);
        g.fillStyle = look === 'link' ? '#cfefff' : '#fff6c8';
        g.fillRect(-1.8, -1.8, 3.6, 3.6);
        break;
      case 'track': {
        // A six-wheeled rover with its solar deck and camera mast, facing the way it drives.
        g.rotate(ang);
        g.fillStyle = '#1c1c1c';
        for (const wx of [-5.5, 0, 5.5]) {
          g.beginPath();
          g.arc(wx, -6, 2.3, 0, Math.PI * 2);
          g.arc(wx, 6, 2.3, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#d9d2c3';
        g.fillRect(-7, -4.5, 14, 9);
        g.fillStyle = '#3a4f78';
        g.fillRect(-6, -3.5, 7, 7);
        g.strokeStyle = '#7a8fb8';
        g.lineWidth = 0.6;
        g.beginPath();
        g.moveTo(-2.5, -3.5);
        g.lineTo(-2.5, 3.5);
        g.moveTo(-6, 0);
        g.lineTo(1, 0);
        g.stroke();
        g.fillStyle = '#f0ece2';
        g.fillRect(3, -2, 4, 4);
        g.fillStyle = '#222';
        g.fillRect(6, -1, 1.5, 2);
        break;
      }
      default:
        break;
    }
    g.restore();
    if (stopped && tr.lost && Math.floor(runT * 3) % 2 === 0)
      text(g, '?', x + 6, y - 9, { size: 11, color: PAL.bad, bold: true });
  }

  function step(dt: number): void {
    t += dt;
    flashBudget = Math.max(0, flashBudget - dt * 1.6);
    if (!running && !end.finished() && t >= timeLimit) throwLever();
    if (mode === 'draw' && pointer.down && !running) {
      const n = nodeAt(pointer.x, pointer.y);
      if (n >= 0 && n !== cur) stepTo(n);
    }
    if (running) {
      const was = runT;
      runT += dt;
      if (circuit) {
        // Pops: sparks at the fuse or bulb that gave way.
        if (was < 0.6 && runT >= 0.6) {
          for (let k = 0; k < nF; k++)
            if (fusePop[k]) {
              const x = (NX[id(fuses[k]!.a)]! + NX[id(fuses[k]!.b)]!) / 2;
              const y = (NY[id(fuses[k]!.a)]! + NY[id(fuses[k]!.b)]!) / 2;
              for (let j = 0; j < 14; j++)
                spawn(x, y, (Math.random() - 0.5) * 120, -Math.random() * 90, 0.6 + Math.random() * 0.4, 1);
            }
          for (let k = 0; k < nL; k++)
            if (loadPop[k]) {
              const x = (NX[id(loads[k]!.a)]! + NX[id(loads[k]!.b)]!) / 2;
              const y = (NY[id(loads[k]!.a)]! + NY[id(loads[k]!.b)]!) / 2;
              for (let j = 0; j < 16; j++)
                spawn(x, y, (Math.random() - 0.5) * 140, -Math.random() * 100, 0.7 + Math.random() * 0.4, 1);
            }
        }
        // Hot wires smoke.
        const s = runT < 0.6 ? before : after;
        for (let e = 0; e < E; e++) {
          const gi = laidAt(e);
          if (gi < 0) {
            heatShown[e] = 0;
            continue;
          }
          const h = Math.abs(s.ie[e]!) / gauges[gi]!.amps;
          heatShown[e]! += (h - heatShown[e]!) * Math.min(1, dt * 1.8);
          if (heatShown[e]! > 1.05 && Math.random() < dt * 1.6 * heatShown[e]!) {
            const f = Math.random();
            spawn(
              NX[eu[e]!]! + (NX[ev[e]!]! - NX[eu[e]!]!) * f,
              NY[eu[e]!]! + (NY[ev[e]!]! - NY[eu[e]!]!) * f,
              (Math.random() - 0.5) * 8,
              -12 - Math.random() * 10,
              1.2,
              0,
            );
          }
        }
        for (let k = 0; k < nL; k++) {
          const target =
            runT < 0.6 ? before.vl[k]! / loads[k]!.volts : loadPop[k] ? 0 : after.vl[k]! / loads[k]!.volts;
          const ramp = Math.min(1, runT / 0.35);
          const bright = target * target * ramp;
          loadShown[k]! += (bright - loadShown[k]!) * Math.min(1, dt * 10);
          rotor[k]! += dt * 14 * loadShown[k]!;
        }
      } else {
        // Loose ends spill, tip or lose things once the run reaches them.
        const front = runT * SPEED;
        if (look === 'pipe') {
          for (const n of deadEnds)
            if (rdist[n]! <= front && Math.random() < dt * 14)
              spawn(NX[n]!, NY[n]!, (Math.random() - 0.5) * 50, -20 - Math.random() * 40, 0.6, 2);
        } else
          for (const tr of travellers) {
            const last = tr.path.length - 1;
            if (!tr.lost || (runT - tr.delay) * SPEED < last || Math.random() > dt * 10) continue;
            const n = tr.path[last]!;
            spawn(
              NX[n]!,
              NY[n]!,
              (Math.random() - 0.5) * 40,
              -15 - Math.random() * 30,
              0.5,
              look === 'link' || look === 'wire' ? 1 : 3,
            );
          }
      }
      if (runT >= runDur && !judged) {
        judged = true;
        const { o, line } = outcome();
        end.finish(o.quality, p.why?.(o) ?? line);
      }
    }
  }

  function draw(dt: number): void {
    g.drawImage(bg, 0, 0, W, H);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // Ghost hint (first time): the pieces still to lay.
    if (host.guided && !running) {
      g.globalAlpha = 0.35 + 0.2 * Math.sin(t * 4);
      g.lineCap = 'butt';
      g.setLineDash([3, 4]);
      g.strokeStyle = PAL.gold;
      for (let e = 0; e < E; e++) {
        if (hintE[e]! < 0 || laidAt(e) === hintE[e]!) continue;
        g.lineWidth = circuit ? gaugeWidth(hintE[e]!) + 0.5 : 2;
        g.beginPath();
        g.moveTo(NX[eu[e]!]!, NY[eu[e]!]!);
        g.lineTo(NX[ev[e]!]!, NY[ev[e]!]!);
        g.stroke();
      }
      g.setLineDash([]);
      g.globalAlpha = 1;
      g.lineCap = 'round';
    }
    // Pieces.
    const front = runT * SPEED;
    for (let e = 0; e < E; e++) {
      const gi = laidAt(e);
      if (gi < 0) continue;
      let colour = baseColour();
      if (circuit && running) colour = heatColour(heatShown[e]!);
      drawPiece(e, colour, gaugeWidth(gi));
      if (circuit && running && heatShown[e]! > 0.95) {
        const R = 8 + 6 * Math.min(1, heatShown[e]! - 0.95);
        g.globalAlpha = Math.min(0.7, (heatShown[e]! - 0.95) * 1.5);
        g.drawImage(
          hotGlow,
          (NX[eu[e]!]! + NX[ev[e]!]!) / 2 - R,
          (NY[eu[e]!]! + NY[ev[e]!]!) / 2 - R,
          R * 2,
          R * 2,
        );
        g.globalAlpha = 1;
      }
      // Route: water fills the pipe as far as the front has run.
      if (look === 'pipe' && running && rdist[eu[e]!]! >= 0) {
        const d0 = Math.min(rdist[eu[e]!]!, rdist[ev[e]!]!);
        const d1 = Math.max(rdist[eu[e]!]!, rdist[ev[e]!]!);
        const f = Math.max(0, Math.min(1, front - d0));
        if (f > 0 && d1 === d0 + 1) {
          const a = rdist[eu[e]!]! <= rdist[ev[e]!]! ? eu[e]! : ev[e]!;
          const b = a === eu[e]! ? ev[e]! : eu[e]!;
          g.strokeStyle =
            look === 'pipe' ? '#4aa3ff' : look === 'link' ? '#bff0ff' : 'rgba(255,230,150,0.55)';
          g.lineWidth = look === 'pipe' ? 3 : look === 'link' ? 2 : 1.2;
          g.beginPath();
          g.moveTo(NX[a]!, NY[a]!);
          g.lineTo(NX[a]! + (NX[b]! - NX[a]!) * f, NY[a]! + (NY[b]! - NY[a]!) * f);
          g.stroke();
        }
      }
    }
    // Route: what has run along a piece glows behind it.
    if (!circuit && running && look !== 'pipe') {
      g.strokeStyle =
        look === 'link' ? '#bff0ff' : look === 'track' ? 'rgba(255,240,200,0.75)' : 'rgba(255,226,140,0.6)';
      g.lineWidth = look === 'link' ? 2 : 1.4;
      g.beginPath();
      for (const tr of travellers) {
        const d = Math.min(tr.path.length - 1, (runT - tr.delay) * SPEED);
        for (let i = 0; i < d; i++) {
          const a = tr.path[i]!;
          const b = tr.path[i + 1]!;
          const f = Math.min(1, d - i);
          g.moveTo(NX[a]!, NY[a]!);
          g.lineTo(NX[a]! + (NX[b]! - NX[a]!) * f, NY[a]! + (NY[b]! - NY[a]!) * f);
        }
      }
      g.stroke();
    }
    // Junctions: where three or more pieces meet.
    if (circuit) {
      g.fillStyle = HEAT[2]!;
      for (let i = 0; i < N; i++) {
        let deg = 0;
        const ic = i % cols;
        if (ic > 0 && laidAt(edgeBetween(i, i - 1)) >= 0) deg++;
        if (ic < cols - 1 && laidAt(edgeBetween(i, i + 1)) >= 0) deg++;
        if (i - cols >= 0 && laidAt(edgeBetween(i, i - cols)) >= 0) deg++;
        if (i + cols < N && laidAt(edgeBetween(i, i + cols)) >= 0) deg++;
        if (deg >= 3) {
          g.beginPath();
          g.arc(NX[i]!, NY[i]!, 2.4, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    // Current: dots moving along every wire, faster for more flow.
    if (circuit && running) {
      const s = runT < 0.6 ? before : after;
      const ramp = Math.min(1, runT / 0.35);
      g.fillStyle = look === 'pipe' ? '#9fd0ff' : '#fff3b0';
      g.beginPath();
      for (let e = 0; e < E; e++) {
        const I = s.ie[e]!;
        if (laidAt(e) < 0 || Math.abs(I) < 0.004) continue;
        const speed = Math.min(5, 0.5 + Math.abs(I) * 1.6) * ramp;
        const ph = (runT * speed) % 0.5;
        for (let k = 0; k < 2; k++) {
          let f = ph + k * 0.5;
          if (I < 0) f = 1 - f;
          const x = NX[eu[e]!]! + (NX[ev[e]!]! - NX[eu[e]!]!) * f;
          const y = NY[eu[e]!]! + (NY[ev[e]!]! - NY[eu[e]!]!) * f;
          g.moveTo(x + 1.4, y);
          g.arc(x, y, 1.4, 0, Math.PI * 2);
        }
      }
      g.fill();
    }
    // Parts.
    drawSource();
    for (let k = 0; k < nF; k++) drawFuse(k);
    for (let k = 0; k < nL; k++)
      drawLoad(k, running ? loadShown[k]! : 0, running && runT > 0.6 && loadPop[k] === 1);
    for (let i = 0; i < N; i++) if (studN[i]! && studN[i]! <= 3) drawStud(i, studN[i]!);
    if (!circuit) {
      if (p.start) drawStop(startN, p.start.name, true, false, false);
      stops.forEach((s, k) => {
        const tr = travellers[k]!;
        const arrived = running && reached[k] && tr && (runT - tr.delay) * SPEED >= tr.path.length - 1;
        const lost = running && !reached[k] && runT > runDur - 0.9;
        drawStop(stopN[k]!, s.name, false, !!arrived, lost);
      });
      if (running && look !== 'pipe') for (const tr of travellers) drawTraveller(tr);
    }
    // The pen: where the stroke is.
    if (mode === 'draw' && cur >= 0) {
      g.strokeStyle = PAL.gold;
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(NX[cur]!, NY[cur]!, 5, 0, Math.PI * 2);
      g.stroke();
    } else if (!running && pointer.y < ROW_Y - 4 && pointer.y > TOP) {
      const n = nodeAt(pointer.x, pointer.y);
      if (n >= 0 && !blockedN[n]! && Math.hypot(pointer.x - NX[n]!, pointer.y - NY[n]!) < sp * 0.45) {
        g.strokeStyle = 'rgba(233,196,106,0.45)';
        g.lineWidth = 1;
        g.beginPath();
        g.arc(NX[n]!, NY[n]!, 4.5, 0, Math.PI * 2);
        g.stroke();
      }
    }
    drawParticles(dt);
    // The first-time hint.
    if (host.guided && !running) {
      let todo = 0;
      for (let e = 0; e < E; e++) if (hintE[e]! >= 0 && laidAt(e) !== hintE[e]!) todo++;
      const s = todo === 0 && undo.length > 0 ? `Now ${leverWord.toLowerCase()} (Enter)` : hintText;
      g.font = `10px ${FONT}`;
      const w = Math.min(W - 16, g.measureText(s).width + 16);
      g.fillStyle = 'rgba(10,8,6,0.78)';
      rrect(g, W / 2 - w / 2, BOARD_B - 17, w, 14, 7);
      g.fill();
      text(g, s, W / 2, BOARD_B - 10, { size: 10, color: PAL.gold });
    }
    drawTop();
    drawTools();
  }

  return {
    update: (dt) => {
      step(dt);
      draw(dt);
    },
    dispose: () => {
      window.removeEventListener('keydown', onKey, true);
      c.dispose();
    },
  };
}
