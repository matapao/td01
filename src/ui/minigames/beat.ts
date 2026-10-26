import { SPARK, DUST, PUFF, CHIP, Fx } from './beat-particles.ts';
export type { BeatStyle } from './beat-data.ts';
export type { BeatParams } from './beat-data.ts';
export { BEAT_EXAMPLES } from './beat-data.ts';
import { BEAT_EXAMPLES } from './beat-data.ts';
import type { BeatStyle, BeatParams } from './beat-data.ts';
/**
 * Keep the beat (TECH_LINEAGE §4): act in rhythm with a moving mark — hammer blows, saw strokes, the
 * turns of a coil, a bell's pattern, an engine's valve. Marks run along a lane to the strike line
 * (rests are gaps, and the tempo may speed up) and the scene moves with them: the ring closes on the
 * iron, the saw comes back to its mark, the crank's handle comes over the top, the bell swings up to
 * its balance. Each press is judged by how far off the beat it lands; too many misses and it fails —
 * the iron bends, the saw binds, the wire tangles, the clapper drops out.
 *
 * BEAT_EXAMPLES shows how milestones set it up; the playground runs one with
 * ?minigame=beat&demo=<name>.
 */
import type { MinigameDef, Quality } from './types.ts';
import { canvasIn, finisher, text, rrect, PAL } from './kit.ts';

/** The playground's ?demo=<name> picks an example; the forge by default. */
function demoFromUrl(): BeatParams {
  const name =
    typeof location === 'undefined' ? '' : (new URLSearchParams(location.search).get('demo') ?? '');
  return Object.hasOwn(BEAT_EXAMPLES, name)
    ? BEAT_EXAMPLES[name as keyof typeof BEAT_EXAMPLES]
    : BEAT_EXAMPLES.forge;
}

// ---- Drawing helpers --------------------------------------------------------------------------------

const W = 380;
const H = 220;
/** Seconds the ending plays before the verdict. */
const OUTRO = 1;
const TAU = Math.PI * 2;
/** The lane: where marks run to the strike line, and how fast (px a second). */
const LX0 = 14;
const LX1 = 366;
const LY = 178;
const LH = 20;
const HIT_X = 64;
const SPEED = (LX1 - HIT_X) / 2;
/** What a press is judged as. */
const MISS = 1;
const GOOD = 2;
const PERFECT = 3;

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const ease = (u: number): number => u * u * (3 - 2 * u);

/** An offscreen canvas the size of the scene (at twice the resolution), painted once. */
function layer(paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = W * 2;
  cv.height = H * 2;
  const g = cv.getContext('2d')!;
  g.scale(2, 2);
  paint(g);
  return cv;
}

/** A dark wall of planks or stone behind a scene, and the floor. */
function room(g: CanvasRenderingContext2D, stone: boolean): void {
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, stone ? '#1c1612' : '#1f1812');
  grd.addColorStop(1, '#0c0a07');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  let seed = 7;
  const r = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  if (stone)
    for (let row = 0; row < 9; row++)
      for (let x = -(row % 2) * 22; x < W; x += 44) {
        const k = 34 + r() * 16;
        g.fillStyle = `rgba(${k | 0},${(k * 0.8) | 0},${(k * 0.62) | 0},0.5)`;
        rrect(g, x + 1.5, row * 19 - 5, 41, 16, 3);
        g.fill();
      }
  else
    for (let x = 0; x < W; x += 26) {
      const k = 36 + r() * 14;
      g.fillStyle = `rgba(${k | 0},${(k * 0.74) | 0},${(k * 0.5) | 0},0.55)`;
      g.fillRect(x + 1, 0, 24, 172);
    }
  g.fillStyle = '#0e0b08';
  g.fillRect(0, 168, W, H - 168);
}

// ---- Particles --------------------------------------------------------------------------------------

// ---- The run, as the looks see it ---------------------------------------------------------------

/** What a look draws from, every frame. */
interface View {
  t: number;
  dt: number;
  /** Cue times: the count-in beats, then the strikes (from `first`). */
  cues: Float64Array;
  first: number;
  /** Per strike: 0 to come, MISS, GOOD, PERFECT. */
  result: Int8Array;
  /** The cue being approached, how far through its gap (0–1), and its gap in seconds. */
  ahead: number;
  phase: number;
  gap: number;
  /** Strikes judged so far, of them good or better. */
  judged: number;
  hits: number;
  /** Seconds since the last press, and how it was judged (0 none). */
  since: number;
  lastQ: number;
  end: '' | 'win' | 'fail';
  outro: number;
}

/** A look: draws the scene each frame; hears each judged press; `cue` is where the moving mark meets its mark. */
interface Look {
  draw(g: CanvasRenderingContext2D, s: View): void;
  judged(q: number, s: View): void;
  cue: [number, number];
}

const strikesOf = (s: View): number => s.result.length;

/** 'hammer': an anvil with a glowing bar; a ring closes on it for each blow, and the hammer comes down. */
function hammerLook(fx: Fx): Look {
  const cx = 206;
  const cy = 104;
  // Nine bar samples, visited with 0..8 or a random interior index 1..7.
  const kinks = new Float32Array(9);
  const bg = layer((g) => {
    room(g, true);
    // The stump and the anvil: horn to the left, a waist and a foot.
    g.fillStyle = '#4a3322';
    g.fillRect(170, 156, 72, 16);
    g.fillStyle = '#3a2819';
    g.fillRect(166, 168, 80, 6);
    const iron = g.createLinearGradient(0, 110, 0, 160);
    iron.addColorStop(0, '#6a707a');
    iron.addColorStop(0.15, '#3c4148');
    iron.addColorStop(1, '#22262b');
    g.fillStyle = iron;
    g.beginPath();
    g.moveTo(112, 112);
    g.quadraticCurveTo(140, 110, 152, 110);
    g.lineTo(262, 110);
    g.lineTo(262, 124);
    g.lineTo(240, 128);
    g.lineTo(232, 146);
    g.lineTo(252, 152);
    g.lineTo(252, 158);
    g.lineTo(160, 158);
    g.lineTo(160, 152);
    g.lineTo(180, 146);
    g.lineTo(172, 128);
    g.lineTo(152, 124);
    g.quadraticCurveTo(132, 122, 112, 112);
    g.closePath();
    g.fill();
    g.fillStyle = '#8a9099';
    g.fillRect(152, 110, 110, 2);
  });
  let swing = 9;
  let shake = 0;
  return {
    cue: [cx, cy],
    judged(q, s) {
      swing = 0;
      if (q === MISS) {
        // A glancing blow: a dull puff and a new kink in the bar.
        fx.burst(PUFF, cx, cy - 4, 3, 30, 10, 0.6);
        kinks[1 + Math.floor(Math.random() * 7)]! += (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3);
        shake = 1;
      } else {
        fx.burst(SPARK, cx, cy - 2, q === PERFECT ? 22 : 12, q === PERFECT ? 200 : 140, 70, 0.55);
        for (let k = 0; k < 9; k++) kinks[k]! *= q === PERFECT ? 0.4 : 0.65;
      }
      void s;
    },
    draw(g, s) {
      const u = s.end ? clamp(s.outro / OUTRO, 0, 1) : 0;
      g.drawImage(bg, 0, 0, W, H);
      swing += s.dt;
      shake = Math.max(0, shake - s.dt * 4);
      // The bar draws out longer and flatter with every good blow; a failed one ends up bent.
      const k = s.hits / strikesOf(s);
      const len = 44 + 34 * k;
      const thick = 8 - 3 * k;
      const bend = s.end === 'fail' ? ease(u) : 0;
      const hot = s.end === 'win' ? 1 : 0.75;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (let pass = 0; pass < 2; pass++) {
        g.strokeStyle = pass ? (hot > 0.9 ? '#ffe9a0' : '#ffb347') : '#c2410c';
        g.lineWidth = pass ? thick * 0.45 : thick;
        g.beginPath();
        for (let i = 0; i < 9; i++) {
          const x = cx - len / 2 + (len * i) / 8;
          const y = cy + kinks[i]! + Math.sin(i * 1.3) * 14 * bend + Math.sin(s.t * 40) * shake;
          if (i) g.lineTo(x, y - bend * 10 * Math.sin((i / 8) * Math.PI));
          else g.moveTo(x, y);
        }
        g.stroke();
      }
      g.lineCap = 'butt';
      // Rings close on the bar, one for each blow to come; the gold ring is where they must meet.
      if (!s.end) {
        g.strokeStyle = 'rgba(233,196,106,0.5)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(cx, cy, 12, 0, TAU);
        g.stroke();
        for (let i = Math.max(s.first, s.ahead - 1); i < s.cues.length; i++) {
          const dt = s.cues[i]! - s.t;
          if (dt > 1.15) break;
          if (dt < -0.15 || s.result[i - s.first]) continue;
          const r = 12 + (64 * Math.max(0, dt)) / 1.15;
          g.globalAlpha = clamp(1.25 - dt, 0, 1);
          g.strokeStyle = Math.abs(dt) < 0.06 ? '#fff3c4' : PAL.gold;
          g.lineWidth = 2.5;
          g.beginPath();
          g.arc(cx, cy, r, 0, TAU);
          g.stroke();
        }
        g.globalAlpha = 1;
      }
      // The hammer: raised, lifting higher as the blow nears, then down on the press.
      const rest = -2.2 - 0.26 * ease(s.ahead >= s.first ? s.phase : 0);
      const hit = -3.02;
      let a = rest;
      if (swing < 0.07) a = lerp(rest, hit, swing / 0.07);
      else if (swing < 0.36) a = lerp(hit, rest, ease((swing - 0.07) / 0.29));
      if (s.end === 'fail') a = rest + Math.sin(u * 20) * 0.3 * (1 - u);
      g.save();
      g.translate(304, 100);
      g.rotate(a);
      g.fillStyle = '#6b4a2c';
      g.fillRect(0, -2.5, 96, 5);
      g.fillStyle = '#2d3136';
      g.fillRect(90, -11, 16, 22);
      g.fillStyle = '#5a6068';
      g.fillRect(90, -11, 16, 3);
      g.restore();
      fx.draw(g);
    },
  };
}

/** 'saw': a hand saw in a plank on trestles; it draws back to its mark, and each press drives a stroke. */
function sawLook(fx: Fx): Look {
  const kx = 214;
  const top = 112;
  const ang = -0.62;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const bg = layer((g) => {
    room(g, false);
    // Trestles.
    g.strokeStyle = '#4a3220';
    g.lineWidth = 5;
    g.beginPath();
    for (const x of [86, 300]) {
      g.moveTo(x - 18, 170);
      g.lineTo(x, 124);
      g.lineTo(x + 18, 170);
    }
    g.stroke();
  });
  let push = 9;
  let depth = 0;
  let wander = 0;
  let jolt = 0;
  // Where the handle sits when the saw is drawn right back.
  const markX = kx + ca * 36 + 44 * ca + 12 * sa;
  const markY = top + sa * 36 + 44 * sa - 12 * ca;
  return {
    cue: [markX, markY],
    judged(q) {
      push = 0;
      if (q === MISS) {
        jolt = 1;
        wander += (Math.random() - 0.5) * 3;
        fx.burst(PUFF, kx, top, 2, 20, 10, 0.5);
      } else {
        for (let i = 0; i < (q === PERFECT ? 12 : 7); i++)
          fx.spawn(
            DUST,
            kx + (Math.random() - 0.5) * 4,
            top + depth + 2,
            (Math.random() - 0.5) * 50,
            10 + Math.random() * 30,
            0.7 + Math.random() * 0.4,
          );
      }
    },
    draw(g, s) {
      const u = s.end ? clamp(s.outro / OUTRO, 0, 1) : 0;
      g.drawImage(bg, 0, 0, W, H);
      push += s.dt;
      jolt = Math.max(0, jolt - s.dt * 3);
      depth += ((16 * s.hits) / strikesOf(s) - depth) * Math.min(1, s.dt * 10);
      // The plank, and its end dropping off once it is cut through.
      const drop = s.end === 'win' ? ease(u) : 0;
      g.fillStyle = '#c89a62';
      g.fillRect(40, top, kx - 40, 16);
      g.save();
      g.translate(kx, top + 16);
      g.rotate(drop * 0.5);
      g.translate(0, drop * 40);
      g.fillRect(0, -16, 330 - kx, 16);
      g.restore();
      g.strokeStyle = 'rgba(110,70,30,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(44, top + 5);
      g.lineTo(kx - 4, top + 6);
      g.moveTo(52, top + 11);
      g.lineTo(kx - 6, top + 10);
      g.stroke();
      // The kerf: straight when the strokes are even, wandering when they are not.
      g.strokeStyle = '#2a1a0c';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(kx, top);
      g.lineTo(kx + wander, top + depth);
      g.stroke();
      if (s.end === 'fail') {
        // Bound in the cut: the plank splits off crooked.
        g.strokeStyle = '#2a1a0c';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(kx + wander, top + depth);
        g.lineTo(kx + 14 * u, top + 9);
        g.lineTo(kx + 30 * u, top + 16);
        g.stroke();
      }
      // Where the saw sits: drawn back (at its mark) at each cue, driven forward by a press.
      let off = 1;
      if (push < 0.14) off = lerp(1, -1, ease(push / 0.14));
      else {
        const back = s.ahead >= s.first || s.ahead > 0 ? clamp((s.phase - 0.3) / 0.7, 0, 1) : 1;
        off = push < 0.14 + s.gap ? lerp(-1, 1, ease(back)) : 1;
      }
      if (s.end === 'fail') off = 0.2 + Math.sin(u * 30) * 0.2 * (1 - u);
      const sx = kx + ca * off * 36 + Math.sin(s.t * 60) * jolt * 2;
      const sy = top + sa * off * 36;
      // The mark the handle comes back to: a ring it must meet on the beat.
      if (!s.end) {
        const k = ease(s.phase);
        g.strokeStyle = k > 0.92 ? '#fff3c4' : PAL.gold;
        g.globalAlpha = 0.35 + 0.65 * k;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(markX, markY, 15, 0, TAU);
        g.stroke();
        g.globalAlpha = 1;
      }
      g.save();
      g.translate(sx, sy + Math.max(0, depth - 2) * 0.4);
      g.rotate(ang);
      // The blade, its teeth along the lower edge, then the handle at the far end.
      g.fillStyle = '#c9ced6';
      g.beginPath();
      g.moveTo(-74, 2);
      g.lineTo(34, -2);
      g.lineTo(34, -20);
      g.lineTo(-74, -8);
      g.closePath();
      g.fill();
      g.fillStyle = '#8a9099';
      g.beginPath();
      for (let x = -74; x < 34; x += 5) {
        g.moveTo(x, 2 - (x + 74) * 0.037);
        g.lineTo(x + 2.5, 5 - (x + 74) * 0.037);
        g.lineTo(x + 5, 2 - (x + 77) * 0.037);
      }
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(-60, -9, 80, 1.5);
      g.fillStyle = '#7a4a26';
      rrect(g, 32, -26, 24, 28, 7);
      g.fill();
      g.fillStyle = '#1f1812';
      rrect(g, 40, -18, 10, 12, 4);
      g.fill();
      g.restore();
      fx.draw(g);
    },
  };
}

/** 'coil': a bobbin turned by a crank; each turn lays a winding — neat in time, tangled when not. */
function coilLook(fx: Fx): Look {
  const ax = 92;
  const ay = 100;
  const x0 = 130;
  const x1 = 270;
  const bg = layer((g) => {
    room(g, false);
    // The frame, the bobbin's core and its flanges.
    g.fillStyle = '#3a2a1c';
    g.fillRect(84, 100, 8, 70);
    g.fillRect(286, 100, 8, 70);
    g.fillRect(70, 166, 238, 6);
    g.fillStyle = '#5a5248';
    g.fillRect(92, 98, 196, 4);
    const core = g.createLinearGradient(0, 86, 0, 114);
    core.addColorStop(0, '#9a8466');
    core.addColorStop(0.5, '#c8b08a');
    core.addColorStop(1, '#6e5a40');
    g.fillStyle = core;
    g.fillRect(x0, 88, x1 - x0, 24);
    g.fillStyle = '#4a3420';
    rrect(g, x0 - 10, 70, 10, 60, 3);
    g.fill();
    rrect(g, x1, 70, 10, 60, 3);
    g.fill();
    // The supply reel up on the right.
    g.fillStyle = '#4a3420';
    g.beginPath();
    g.arc(318, 40, 20, 0, TAU);
    g.fill();
    g.fillStyle = '#b87333';
    g.beginPath();
    g.arc(318, 40, 14, 0, TAU);
    g.fill();
    g.fillStyle = '#2a1c10';
    g.beginPath();
    g.arc(318, 40, 4, 0, TAU);
    g.fill();
  });
  // How each turn was laid: 0 not yet, 1 tangled, 2 a little off, 3 neat.
  // Coil turns stop at 64; drawing visits only completed turns.
  const laid = new Uint8Array(64);
  const skew = new Float32Array(64);
  let turns = 0;
  let spin = 0;
  return {
    cue: [ax, ay - 26],
    judged(q) {
      if (turns < 64) {
        laid[turns] = q;
        skew[turns] = q === PERFECT ? 0 : (Math.random() - 0.5) * (q === GOOD ? 3 : 8);
        turns++;
      }
      if (q !== MISS) fx.burst(CHIP, x0 + 6 + turns * 4, 88, 3, 40, 20, 0.3);
      else fx.burst(PUFF, x0 + turns * 4, 84, 2, 20, 10, 0.5);
    },
    draw(g, s) {
      const u = s.end ? clamp(s.outro / OUTRO, 0, 1) : 0;
      g.drawImage(bg, 0, 0, W, H);
      const n = strikesOf(s);
      const step = Math.min(7, (x1 - x0 - 6) / n);
      // The windings laid so far.
      g.lineCap = 'round';
      for (let i = 0; i < turns; i++) {
        const x = x0 + 4 + i * step;
        if (laid[i] === MISS) {
          g.strokeStyle = '#b06a2e';
          g.lineWidth = 1.6;
          g.beginPath();
          g.moveTo(x, 88);
          g.bezierCurveTo(x + 14, 66 + skew[i]!, x - 12, 62, x + 2, 112);
          g.stroke();
        } else {
          g.strokeStyle = laid[i] === PERFECT ? '#d9893f' : '#c07636';
          g.lineWidth = Math.max(2, step - 1.2);
          g.beginPath();
          g.moveTo(x, 88);
          g.lineTo(x + 2 + skew[i]!, 112);
          g.stroke();
          g.strokeStyle = 'rgba(255,220,170,0.45)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x - 0.5, 89);
          g.lineTo(x + 1 + skew[i]!, 100);
          g.stroke();
        }
      }
      if (s.end === 'fail') {
        // A bird's nest of wire.
        g.strokeStyle = '#c07636';
        g.lineWidth = 1.3;
        g.beginPath();
        const cx = x0 + 4 + turns * step;
        for (let i = 0; i < 9; i++) {
          const a = i * 2.3 + u * 3;
          g.moveTo(cx, 100);
          g.bezierCurveTo(
            cx + Math.cos(a) * 30 * u,
            100 + Math.sin(a) * 22 * u,
            cx + Math.cos(a + 2) * 26 * u,
            100 + Math.sin(a + 2) * 18 * u,
            cx + 4,
            100,
          );
        }
        g.stroke();
      }
      if (s.end === 'win') {
        // A glint runs along the finished coil.
        const gx = x0 + (x1 - x0) * u;
        g.fillStyle = 'rgba(255,240,200,0.5)';
        g.fillRect(gx - 4, 86, 8, 28);
      }
      // The wire from the reel to where the next turn goes.
      const wx = x0 + 4 + Math.min(turns, n) * step;
      g.strokeStyle = '#b87333';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(312, 54);
      g.quadraticCurveTo(300, 80, wx + 1, 88);
      g.stroke();
      g.lineCap = 'butt';
      // The crank: its handle comes over the top on every cue.
      let a = -Math.PI / 2 + TAU * s.phase;
      if (s.end === 'fail') spin += s.dt * 30 * (1 - u);
      if (s.end) a = -Math.PI / 2 + spin;
      g.strokeStyle = PAL.gold;
      g.globalAlpha = 0.35 + 0.65 * ease(s.phase);
      g.lineWidth = 2;
      g.beginPath();
      g.arc(ax, ay, 26, -Math.PI / 2 - 0.22, -Math.PI / 2 + 0.22);
      g.stroke();
      g.globalAlpha = 1;
      const hx = ax + Math.cos(a) * 22;
      const hy = ay + Math.sin(a) * 22;
      g.strokeStyle = '#6a6f78';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(hx, hy);
      g.stroke();
      g.fillStyle = '#7a4a26';
      g.beginPath();
      g.arc(hx, hy, 5, 0, TAU);
      g.fill();
      g.fillStyle = '#9aa0a8';
      g.beginPath();
      g.arc(ax, ay, 4, 0, TAU);
      g.fill();
      fx.draw(g);
    },
  };
}

/** 'bell': a bell in its frame, swinging up to its balance on every cue; a pull rings it. */
function bellLook(fx: Fx): Look {
  const bx = 206;
  const by = 46;
  const bg = layer((g) => {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#141a26');
    sky.addColorStop(1, '#2a2218');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // The belfry: posts, the beam, the floor.
    g.fillStyle = '#4a3220';
    g.fillRect(132, 30, 10, 140);
    g.fillRect(270, 30, 10, 140);
    g.fillStyle = '#5a3c24';
    g.fillRect(124, 30, 164, 10);
    g.fillStyle = '#2a1e14';
    g.fillRect(0, 166, W, H - 166);
  });
  // Rings of sound, spreading out (start time and quality).
  // Eight ringing slots, selected modulo eight and drawn with i < 8.
  const rings = new Float32Array(8);
  const ringQ = new Uint8Array(8);
  let ringN = 0;
  let pull = 9;
  let clapper = 0;
  let bronze: CanvasGradient | null = null;
  // The mark it swings up to next (the guide points there).
  const cue: [number, number] = [bx, by + 24];
  return {
    cue,
    judged(q, s) {
      pull = 0;
      rings[ringN % 8] = s.t;
      ringQ[ringN % 8] = q;
      ringN++;
      if (q === MISS) fx.burst(PUFF, bx, by + 30, 2, 20, 10, 0.5);
    },
    draw(g, s) {
      const u = s.end ? clamp(s.outro / OUTRO, 0, 1) : 0;
      g.drawImage(bg, 0, 0, W, H);
      pull += s.dt;
      // It swings from one side to the other across each gap, up to its balance on the cue.
      const side = s.ahead % 2 ? 1 : -1;
      let a = side * 0.55 * Math.cos(Math.PI * s.phase);
      if (s.end) a *= 1 - u * 0.6;
      // The marks it swings up to: the lip's place at each end of the swing, the next one lit.
      if (!s.end)
        for (let sd = -1; sd <= 1; sd += 2) {
          const lit = sd === -side;
          // The leading lip at the top of the swing: (∓28, 46) turned by ±0.55.
          const mx = bx - sd * (28 * Math.cos(0.55) + 46 * Math.sin(0.55));
          const my = by + 46 * Math.cos(0.55) - 28 * Math.sin(0.55);
          if (lit) {
            cue[0] = mx;
            cue[1] = my;
          }
          g.globalAlpha = lit ? 0.35 + 0.65 * ease(s.phase) : 0.25;
          g.strokeStyle = lit && s.phase > 0.92 ? '#fff3c4' : PAL.gold;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(mx, my, 7, 0, TAU);
          g.stroke();
          g.globalAlpha = 1;
        }
      // Sound rings.
      for (let i = 0; i < 8; i++) {
        if (!ringQ[i]) continue;
        const age = s.t - rings[i]!;
        if (age > 1.2 || age < 0) continue;
        const q = ringQ[i];
        g.globalAlpha = (1 - age / 1.2) * (q === MISS ? 0.4 : 0.8);
        g.strokeStyle = q === PERFECT ? '#ffe08a' : q === GOOD ? '#e8f0ff' : '#7a7068';
        g.lineWidth = q === MISS ? 1 : 2;
        const r = 30 + age * (q === MISS ? 30 : 120);
        g.beginPath();
        g.arc(bx, by + 30, r, -0.2, Math.PI + 0.2, true);
        g.stroke();
      }
      g.globalAlpha = 1;
      // The bell, its clapper (which drops out when it fails), the wheel and the rope.
      g.save();
      g.translate(bx, by);
      g.rotate(a);
      g.fillStyle = '#5a3c24';
      g.fillRect(-26, -10, 52, 8);
      if (!bronze) {
        bronze = g.createLinearGradient(-26, 0, 26, 0);
        bronze.addColorStop(0, '#7a5a24');
        bronze.addColorStop(0.35, '#e0b45a');
        bronze.addColorStop(1, '#6a4a1c');
      }
      g.fillStyle = bronze;
      g.beginPath();
      g.moveTo(-12, 0);
      g.quadraticCurveTo(-16, 2, -17, 22);
      g.quadraticCurveTo(-19, 40, -28, 46);
      g.lineTo(28, 46);
      g.quadraticCurveTo(19, 40, 17, 22);
      g.quadraticCurveTo(16, 2, 12, 0);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(-28, 43, 56, 3);
      clapper += ((pull < 0.1 ? side * 0.5 : -a * 0.7) - clapper) * Math.min(1, s.dt * 12);
      if (s.end !== 'fail') {
        g.save();
        g.translate(0, 8);
        g.rotate(clapper);
        g.fillStyle = '#3a3a3a';
        g.fillRect(-1.5, 0, 3, 34);
        g.beginPath();
        g.arc(0, 36, 5, 0, TAU);
        g.fill();
        g.restore();
      }
      g.restore();
      if (s.end === 'fail') {
        // The clapper drops out and clonks on the floor.
        const fy = Math.min(166, by + 44 + 260 * u * u);
        g.fillStyle = '#3a3a3a';
        g.save();
        g.translate(bx + 6, fy);
        g.rotate(u * 2.5);
        g.fillRect(-1.5, -34, 3, 34);
        g.beginPath();
        g.arc(0, 0, 5, 0, TAU);
        g.fill();
        g.restore();
      }
      // The rope: pulled down on a press, its striped grip swinging with the bell.
      const ry = 128 + (pull < 0.25 ? 12 * Math.sin((pull / 0.25) * Math.PI) : 0) + a * 8;
      g.strokeStyle = '#c9b48a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(bx + Math.sin(a) * 20, by + 4);
      g.lineTo(bx + 34, ry - 30);
      g.lineTo(bx + 34, ry + 16);
      g.stroke();
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? '#e8e0cc' : '#c0392b';
        g.fillRect(bx + 31, ry - 4 + i * 5, 6, 5);
      }
      fx.draw(g);
    },
  };
}

/** 'generic': a brass plate with rings closing on it — for any steady rhythm (an engine's valve, a pump). */
function plainLook(fx: Fx): Look {
  const cx = 200;
  const cy = 90;
  const bg = layer((g) => {
    room(g, true);
    const brass = g.createRadialGradient(cx - 8, cy - 8, 2, cx, cy, 26);
    brass.addColorStop(0, '#f6dc94');
    brass.addColorStop(1, '#8a6a24');
    g.fillStyle = brass;
    g.beginPath();
    g.arc(cx, cy, 22, 0, TAU);
    g.fill();
    g.fillStyle = '#3a2c18';
    g.beginPath();
    g.arc(cx, cy, 9, 0, TAU);
    g.fill();
  });
  let flash = 0;
  let flashQ = 0;
  return {
    cue: [cx, cy],
    judged(q) {
      flash = 1;
      flashQ = q;
      if (q !== MISS) fx.burst(SPARK, cx, cy, q === PERFECT ? 16 : 8, 160, 30, 0.5);
    },
    draw(g, s) {
      g.drawImage(bg, 0, 0, W, H);
      flash = Math.max(0, flash - s.dt * 3);
      if (flash > 0) {
        g.globalAlpha = flash * 0.8;
        g.strokeStyle = flashQ === PERFECT ? '#ffe08a' : flashQ === GOOD ? '#9ee6a8' : '#ff8a7a';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(cx, cy, 24 + (1 - flash) * 20, 0, TAU);
        g.stroke();
        g.globalAlpha = 1;
      }
      if (!s.end)
        for (let i = Math.max(s.first, s.ahead - 1); i < s.cues.length; i++) {
          const dt = s.cues[i]! - s.t;
          if (dt > 1.2) break;
          if (dt < -0.15 || s.result[i - s.first]) continue;
          g.globalAlpha = clamp(1.3 - dt, 0, 1);
          g.strokeStyle = Math.abs(dt) < 0.06 ? '#fff3c4' : PAL.gold;
          g.lineWidth = 2.5;
          g.beginPath();
          g.arc(cx, cy, 24 + (70 * Math.max(0, dt)) / 1.2, 0, TAU);
          g.stroke();
        }
      g.globalAlpha = 1;
      fx.draw(g);
    },
  };
}

// ---- The kind -----------------------------------------------------------------------------------

const COUNT_WORDS: Record<BeatStyle, string> = {
  hammer: 'blows',
  saw: 'strokes',
  coil: 'turns',
  bell: 'strokes',
  generic: 'beats',
};

export const beat: MinigameDef<BeatParams> = {
  kind: 'beat',
  name: 'Keep the beat',
  demo: demoFromUrl(),
  create: (host, p) => {
    const end = finisher(host);
    const n = Math.max(1, Math.round(p.strikes));
    // An empty authored pattern uses the existing single-beat default, so modulo indexing is defined.
    const pattern = p.pattern.length ? p.pattern : [1];
    const tempoEnd = p.tempoEnd ?? p.tempo;
    const perfectWin = p.perfect ?? 0.06;
    const goodWin = Math.max(perfectWin, p.good ?? 0.14);
    const early = goodWin + 0.22;
    const countIn = Math.max(0, Math.round(p.countIn ?? 3));
    const allowed = p.misses ?? Math.floor(n / 4);
    const share = p.perfectShare ?? 0.7;
    // The cues: count-in beats at the starting tempo, then the strikes, the tempo easing to its end.
    // n is at least one: cue reads use bounded strike/count-in indices; result/err have exactly n slots.
    const cues = new Float64Array(countIn + n);
    const spb0 = 60 / p.tempo;
    let at = 0.9;
    for (let i = 0; i < countIn; i++) {
      cues[i] = at;
      at += spb0;
    }
    for (let i = 0; i < n; i++) {
      cues[countIn + i] = at;
      const bpm = lerp(p.tempo, tempoEnd, n > 1 ? i / (n - 1) : 0);
      at += Math.max(0.125, pattern[i % pattern.length]!) * (60 / bpm);
    }
    const lastCue = cues[cues.length - 1]!;
    // The grid: a faint line on every beat, rests included.
    const grid: number[] = [];
    for (let tt = cues[0]!; tt <= lastCue + 0.01;) {
      grid.push(tt);
      const k = clamp((tt - cues[countIn]!) / Math.max(0.01, lastCue - cues[countIn]!), 0, 1);
      tt += 60 / lerp(p.tempo, tempoEnd, k);
    }
    const gridT = Float64Array.from(grid);
    const err = new Float32Array(n);

    const fx = new Fx();
    const look =
      p.style === 'saw'
        ? sawLook(fx)
        : p.style === 'coil'
          ? coilLook(fx)
          : p.style === 'bell'
            ? bellLook(fx)
            : p.style === 'generic'
              ? plainLook(fx)
              : hammerLook(fx);
    const s: View = {
      t: 0,
      dt: 0,
      cues,
      first: countIn,
      result: new Int8Array(n),
      ahead: 0,
      phase: 0,
      gap: spb0,
      judged: 0,
      hits: 0,
      since: 9,
      lastQ: 0,
      end: '',
      outro: 0,
    };
    let next = 0;
    let misses = 0;
    let perfects = 0;
    let lastErr = 0;
    let quality: Quality = 0;
    let why = '';
    let wall = performance.now();
    let doneT = -1;

    const judge = (i: number, q: number, e: number): void => {
      s.result[i] = q;
      err[i] = e;
      s.judged++;
      s.lastQ = q;
      s.since = 0;
      lastErr = e;
      if (q === MISS) misses++;
      else {
        s.hits++;
        if (q === PERFECT) perfects++;
      }
      look.judged(q, s);
      if (misses > allowed && !s.end) stop('fail', 0, p.words.fail);
    };

    /** Why it failed: mostly early, mostly late, or all over the place. */
    const failWhy = (): string => {
      let sum = 0;
      let m = 0;
      for (let k = 0; k < n; k++)
        if (s.result[k] && !Number.isNaN(err[k]!)) {
          sum += err[k]!;
          m++;
        }
      const mean = m ? sum / m : 0;
      return mean < -0.035 && p.words.early
        ? p.words.early
        : mean > 0.035 && p.words.late
          ? p.words.late
          : p.words.fail;
    };

    const stop = (how: 'win' | 'fail', q: Quality, line: string): void => {
      s.end = how;
      s.outro = 0;
      quality = q;
      why = line;
    };

    const press = (): void => {
      if (s.end) return;
      // When it was pressed, between frames.
      const tp = s.t + clamp((performance.now() - wall) / 1000, 0, 0.1);
      let best = -1;
      let bestD = 0;
      for (let i = next; i < n; i++) {
        const d = tp - cues[countIn + i]!;
        if (d < -early) break;
        if (s.result[i]) continue;
        if (best < 0 || Math.abs(d) < Math.abs(bestD)) {
          best = i;
          bestD = d;
        }
      }
      if (best < 0) {
        // Just after a strike that went by unpressed: it was late (the miss stands, but now we know why).
        const i = next - 1;
        if (
          i >= 0 &&
          s.result[i] === MISS &&
          Number.isNaN(err[i]!) &&
          tp - cues[countIn + i]! < goodWin + 0.3
        ) {
          err[i] = tp - cues[countIn + i]!;
          lastErr = err[i]!;
          s.since = 0;
        }
        return;
      }
      const ad = Math.abs(bestD);
      if (ad <= perfectWin) judge(best, PERFECT, bestD);
      else if (ad <= goodWin) judge(best, GOOD, bestD);
      else if (bestD < 0) judge(best, MISS, bestD);
    };

    const c = canvasIn(host, W, H, { down: () => press() });
    const g = c.g;
    const key = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' && e.code !== 'KeyF') return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) press();
    };
    const keyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space' || e.code === 'KeyF') e.preventDefault();
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', keyUp, true);
    // For tests and the playground: the run as it stands (read it, don't change it).
    (c.canvas as unknown as { mg: View }).mg = s;

    const step = (): void => {
      // Strikes whose window has passed unpressed are misses.
      while (next < n && (s.result[next] || s.t > cues[countIn + next]! + goodWin)) {
        if (!s.result[next]) judge(next, MISS, Number.NaN);
        next++;
        if (s.end) return;
      }
      if (next >= n && doneT < 0) doneT = s.t;
      if (doneT >= 0 && s.t - doneT > 0.35) {
        const best = misses === 0 && perfects >= share * n;
        stop('win', best ? 2 : 1, best ? p.words.perfect : p.words.good);
      }
    };

    const verdictWord = (q: number): string => (q === PERFECT ? 'Perfect' : q === GOOD ? 'Good' : 'Miss');
    const countWord = (p.words.count ?? COUNT_WORDS[p.style]).toUpperCase();

    const overlay = (): void => {
      // The tally: a dot per strike, coloured as it went.
      const gap = Math.min(7.5, 200 / n);
      const boxW = Math.max(96, 22 + n * gap);
      g.fillStyle = 'rgba(8,6,4,0.62)';
      rrect(g, 6, 5, boxW, 30, 6);
      g.fill();
      text(g, countWord, 13, 13, { size: 8.5, color: PAL.dim, align: 'left' });
      text(g, `${s.judged} / ${n}`, boxW, 13, { size: 8.5, color: PAL.dim, align: 'right' });
      for (let i = 0; i < n; i++) {
        const q = s.result[i];
        g.fillStyle = q === PERFECT ? '#ffd36a' : q === GOOD ? '#7fcf8a' : q === MISS ? '#e0604e' : '#3a3024';
        g.beginPath();
        g.arc(16 + i * gap, 26, Math.min(2.6, gap * 0.38), 0, TAU);
        g.fill();
      }
      // The tempo, in beats a minute.
      const k = clamp((s.t - cues[countIn]!) / Math.max(0.01, lastCue - cues[countIn]!), 0, 1);
      text(g, `${Math.round(lerp(p.tempo, tempoEnd, k))} beats a minute`, W - 10, 13, {
        size: 9,
        color: PAL.faint,
        align: 'right',
      });
      // The lane: beats run to the strike line; the gold window is where a strike counts.
      g.fillStyle = 'rgba(8,6,4,0.7)';
      g.fillRect(0, LY - 8, W, H - LY + 8);
      g.fillStyle = '#1d1710';
      rrect(g, LX0, LY, LX1 - LX0, LH, 5);
      g.fill();
      g.save();
      g.beginPath();
      g.rect(LX0, LY, LX1 - LX0, LH);
      g.clip();
      g.fillStyle = 'rgba(233,196,106,0.16)';
      g.fillRect(HIT_X - goodWin * SPEED, LY, goodWin * SPEED * 2, LH);
      g.fillStyle = 'rgba(255,224,138,0.28)';
      g.fillRect(HIT_X - perfectWin * SPEED, LY, perfectWin * SPEED * 2, LH);
      g.strokeStyle = 'rgba(233,196,106,0.16)';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < gridT.length; i++) {
        const x = HIT_X + (gridT[i]! - s.t) * SPEED;
        if (x < LX0 - 2 || x > LX1 + 2) continue;
        g.moveTo(x, LY + 3);
        g.lineTo(x, LY + LH - 3);
      }
      g.stroke();
      // The count-in: small dots, numbered as they reach the line.
      for (let i = 0; i < countIn; i++) {
        const x = HIT_X + (cues[i]! - s.t) * SPEED;
        if (x < LX0 - 6 || x > LX1 + 6) continue;
        g.fillStyle = 'rgba(233,196,106,0.55)';
        g.beginPath();
        g.arc(x, LY + LH / 2, 2.5, 0, TAU);
        g.fill();
      }
      for (let i = 0; i < n; i++) {
        const x = HIT_X + (cues[countIn + i]! - s.t) * SPEED;
        if (x < LX0 - 8) continue;
        if (x > LX1 + 8) break;
        const q = s.result[i];
        g.globalAlpha = q ? clamp((x - LX0 + 10) / 40, 0, 1) : 1;
        g.fillStyle = q === PERFECT ? '#ffd36a' : q === GOOD ? '#7fcf8a' : q === MISS ? '#e0604e' : PAL.gold;
        g.beginPath();
        g.moveTo(x, LY + 3);
        g.lineTo(x + 6, LY + LH / 2);
        g.lineTo(x, LY + LH - 3);
        g.lineTo(x - 6, LY + LH / 2);
        g.closePath();
        g.fill();
        if (!q) {
          g.fillStyle = 'rgba(255,250,230,0.7)';
          g.fillRect(x - 1, LY + LH / 2 - 1, 2, 2);
        }
      }
      g.globalAlpha = 1;
      g.restore();
      // The strike line, pulsing on every beat.
      let pulse = 0;
      for (let i = 0; i < cues.length; i++) {
        const d = s.t - cues[i]!;
        if (d >= 0 && d < 0.15) pulse = 1 - d / 0.15;
      }
      g.fillStyle = PAL.gold;
      g.globalAlpha = 0.7 + 0.3 * pulse;
      g.fillRect(HIT_X - 1, LY - 4, 2 + pulse * 2, LH + 8);
      g.globalAlpha = 1;
      g.strokeStyle = '#5a4a30';
      g.lineWidth = 1;
      rrect(g, LX0, LY, LX1 - LX0, LH, 5);
      g.stroke();
      // The count-in numbers, then how each press went (and which way it was off).
      for (let i = 0; i < countIn; i++) {
        const d = s.t - cues[i]!;
        if (d >= -0.05 && d < 0.5) {
          g.globalAlpha = 1 - clamp(d / 0.5, 0, 1);
          text(g, `${countIn - i}`, HIT_X, LY - 16 - d * 20, { size: 15, bold: true, color: PAL.gold });
          g.globalAlpha = 1;
        }
      }
      if (s.lastQ && s.since < 0.7) {
        g.globalAlpha = 1 - s.since / 0.7;
        const col = s.lastQ === PERFECT ? '#ffe08a' : s.lastQ === GOOD ? '#9ee6a8' : '#ff8a7a';
        const off = s.lastQ === PERFECT || Number.isNaN(lastErr) ? '' : lastErr < 0 ? ' · early' : ' · late';
        text(g, verdictWord(s.lastQ) + off, HIT_X + 4, LY - 14 - s.since * 16, {
          size: 12,
          bold: true,
          color: col,
          align: 'left',
        });
        g.globalAlpha = 1;
      }
      text(g, `${p.words.act} · click, Space or F`, W / 2, 210, { size: 10, color: PAL.dim });
      // The first time: "now!" on the first few strikes, and what to watch.
      if (host.guided && !s.end) {
        for (let i = 0; i < Math.min(3, n); i++) {
          const d = cues[countIn + i]! - s.t;
          if (d < -0.1 || d > 0.6 || s.result[i]) continue;
          const k2 = clamp(1 - Math.abs(d) / 0.6, 0, 1);
          g.globalAlpha = k2;
          g.strokeStyle = PAL.gold;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(look.cue[0], look.cue[1], 8 + (1 - k2) * 18, 0, TAU);
          g.stroke();
          text(g, 'now!', look.cue[0], look.cue[1] - 30, { size: 11, bold: true, color: PAL.gold });
          g.globalAlpha = 1;
        }
        if (s.t < cues[countIn]!) {
          g.globalAlpha = 0.75 + 0.25 * Math.sin(s.t * 6);
          text(g, 'strike as each mark reaches the line', W / 2, LY - 20, {
            size: 10,
            bold: true,
            color: PAL.gold,
          });
          g.globalAlpha = 1;
        }
      }
    };

    return {
      update(dt) {
        s.dt = dt;
        s.t += dt;
        wall = performance.now();
        s.since += dt;
        // The cue being approached and how far through its gap.
        let a = s.ahead;
        while (a < cues.length && cues[a]! <= s.t) a++;
        s.ahead = a;
        const prev = a > 0 ? cues[a - 1]! : cues[0]! - spb0;
        const nextCue = a < cues.length ? cues[a]! : prev + spb0;
        s.gap = nextCue - prev;
        s.phase = a < cues.length ? clamp((s.t - prev) / s.gap, 0, 1) : 1;
        if (!s.end) step();
        else {
          s.outro += dt;
          if (s.outro >= OUTRO) end.finish(quality, quality ? why : failWhy());
        }
        fx.step(dt);
        look.draw(g, s);
        overlay();
      },
      dispose() {
        window.removeEventListener('keydown', key, true);
        window.removeEventListener('keyup', keyUp, true);
        c.dispose();
      },
    };
  },
};
