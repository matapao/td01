export type { ObserveSample } from './observe-data.ts';
export type { ObserveOption } from './observe-data.ts';
export type { ObserveWords } from './observe-data.ts';
export type { ObserveParams } from './observe-data.ts';
export { OBSERVE_EXAMPLES } from './observe-data.ts';
import { OBSERVE_EXAMPLES } from './observe-data.ts';
import type { ObserveSample, ObserveOption, ObserveParams } from './observe-data.ts';
/**
 * Test & observe (TECH_LINEAGE §4): experiment, then conclude.
 *
 * - 'rig': put samples in a test rig one at a time and watch — does the lamp light, does it float,
 *   how far does the spring stretch, how slow does the pendulum swing — then answer the question.
 *   With `fits` on the options, the first time strikes out every idea a test has disproved.
 * - 'radar': send a pulse up a road and watch the echo come back; the delay shows on the trace.
 *   Pulse a landmark whose distance you know, then the one you don't, and judge how far it is.
 *
 * Right after few tests is perfect, right after more is good, wrong is a miss. The playground runs
 * the demo; `?minigame=observe&demo=<name>` runs one of OBSERVE_EXAMPLES instead.
 */
import type { Minigame, MinigameDef, MinigameHost, Quality } from './types.ts';
import { canvasIn, finisher, text, rrect, PAL, FONT } from './kit.ts';

/** The playground's set-up: `?demo=<name>` picks an example. */
function pickDemo(): ObserveParams {
  const name = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('demo');
  return name && Object.hasOwn(OBSERVE_EXAMPLES, name)
    ? OBSERVE_EXAMPLES[name as keyof typeof OBSERVE_EXAMPLES]
    : OBSERVE_EXAMPLES['conduct'];
}

export const observe: MinigameDef<ObserveParams> = {
  kind: 'observe',
  name: 'Test & observe',
  demo: pickDemo(),
  create: (host, p) => createObserve(host, p),
};

// ---- Shared ---------------------------------------------------------------------------------------

const W = 380;
const H = 220;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const inBox = (b: Box, x: number, y: number): boolean =>
  x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

function glowSprite(r: number, g: number, b: number): HTMLCanvasElement {
  const s = document.createElement('canvas');
  s.width = s.height = 64;
  const x = s.getContext('2d')!;
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.95)`);
  grad.addColorStop(0.4, `rgba(${r},${g},${b},0.4)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  return s;
}

/** Splits `s` into lines that fit `w` px at `size`. */
function wrap(g: CanvasRenderingContext2D, s: string, w: number, size: number, bold = false): string[] {
  g.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
  const out: string[] = [];
  let line = '';
  for (const word of s.split(' ')) {
    const tryLine = line ? `${line} ${word}` : word;
    if (g.measureText(tryLine).width > w && line) {
      out.push(line);
      line = word;
    } else line = tryLine;
  }
  if (line) out.push(line);
  return out;
}

// ---- The minigame ---------------------------------------------------------------------------------

/** What a sample did in each rig, when it showed and when it didn't. */
const YES: Record<'lamp' | 'float' | 'spring' | 'swing', string> = {
  lamp: 'lit the lamp',
  float: 'floated',
  spring: 'stretched the spring far',
  swing: 'swung slowly',
};
const NO: Record<'lamp' | 'float' | 'spring' | 'swing', string> = {
  lamp: 'left the lamp dark',
  float: 'sank',
  spring: 'barely stretched it',
  swing: 'swung quickly',
};

function createObserve(host: MinigameHost, p: ObserveParams): Minigame {
  if (p.samples.length === 0 || p.options.length === 0 || !p.options[p.answer]!)
    throw new Error('Observation needs samples, choices and a valid answer');
  // Layout/readout arrays are created once in sample/option order; active/chosen come from bounded hit/key indices.
  const end = finisher(host);
  const radar = p.style === 'radar';
  const rig = p.rig ?? 'lamp';
  const timeLimit = p.time ?? 40;
  const enough = p.enough ?? 2;
  const samples = p.samples;
  const nS = samples.length;
  const speed = p.speed ?? 3e8;
  const unit = p.unit ?? 'µs';
  const unitScale = unit === 'µs' ? 1e6 : unit === 'ms' ? 1e3 : 1;

  // ---- State ----
  let t = 0;
  const tested = new Uint8Array(nS);
  let tests = 0;
  let active = -1; // the sample in the rig (or the road being pulsed)
  let testT = 0; // time since it went in
  const TEST = radar ? 1.6 : 1.3; // how long a test takes to watch
  let chosen = -1;
  let doneT = 0;

  // ---- Layout ----
  const panelX = 246;
  const optW = W - panelX - 6;
  const c = canvasIn(host, W, H, { down: onDown });
  const g = c.g;
  const pointer = c.pointer;
  let goalSize = 11;
  for (; goalSize > 8; goalSize -= 0.5) {
    g.font = `${goalSize}px ${FONT}`;
    if (g.measureText(p.words.goal).width <= W - 66) break;
  }
  const qLines = wrap(g, p.question, optW, 10, true);
  const optLines = p.options.map((o) => wrap(g, o.text, optW - 12, 9.5));
  const optBoxes: Box[] = [];
  {
    let y = 26 + qLines.length * 12 + 6;
    for (let i = 0; i < p.options.length; i++) {
      const h = 8 + optLines[i]!.length * 11;
      optBoxes.push({ x: panelX, y, w: optW, h });
      y += h + 4;
    }
  }
  // The tray (rig) or the roads (radar).
  const trayW = Math.min(40, 236 / nS);
  const trayBoxes: Box[] = samples.map((_, i) => ({ x: 6 + i * trayW, y: 160, w: trayW - 3, h: 40 }));
  const TX = 22; // radar: the tower
  const TY = 84;
  const MAP_R = 205; // px from the tower to the map's edge
  const maxDist = Math.max(...samples.map((s) => s.distance ?? 0), 1) * 1.25;
  const pxPerM = MAP_R / maxDist;
  const fogFrom = Math.min(
    ...samples.filter((s) => s.known).map((s) => (s.distance ?? 0) * 1.25),
    maxDist * 0.45,
  );
  const roadAng = samples.map((_, i) => (nS === 1 ? 0 : -0.3 + (0.6 * i) / (nS - 1)));
  const delayOf = (s: ObserveSample): number => (2 * (s.distance ?? 0)) / speed; // seconds
  const maxDelay = (2 * maxDist) / speed;
  const lampGlow = glowSprite(255, 214, 120);
  const pingGlow = glowSprite(255, 120, 100);

  const noun = (n: number): string => (radar ? (n === 1 ? 'pulse' : 'pulses') : n === 1 ? 'test' : 'tests');
  /** Has `opt` been disproved by what's been tested? */
  const disproved = (o: ObserveOption): boolean =>
    !!o.fits && samples.some((s, i) => tested[i] && o.fits!(s) !== s.shows >= 0.5);

  function test(i: number): void {
    if (active >= 0 || chosen >= 0 || end.finished()) return;
    active = i;
    testT = 0;
    if (!tested[i]) {
      tested[i] = 1;
      tests++;
    }
  }

  function choose(k: number): void {
    if (chosen >= 0 || end.finished() || tests === 0 || active >= 0) return;
    chosen = k;
    doneT = t;
  }

  function verdict(): { q: Quality; line: string } {
    const principle = p.words.principle ? ` ${p.words.principle}` : '';
    const opt = p.options[chosen]!;
    if (chosen !== p.answer) {
      // The evidence against it: best a sample you tested yourself; else the set-up's own words; else one you could have tested.
      const against = samples.findIndex((sm, i) => tested[i] && opt.fits && opt.fits(sm) !== sm.shows >= 0.5);
      const untested = samples.findIndex(
        (sm, i) => !tested[i] && opt.fits && opt.fits(sm) !== sm.shows >= 0.5,
      );
      if (against >= 0)
        return {
          q: 0,
          line: `Not so: your ${samples[against]!.name.toLowerCase()} ${samples[against]!.shows >= 0.5 ? YES[rig] : NO[rig]}.`,
        };
      if (opt.wrong)
        return { q: 0, line: `Not so: ${opt.wrong.charAt(0).toLowerCase()}${opt.wrong.slice(1)}` };
      if (untested >= 0)
        return {
          q: 0,
          line: `Not so — the ${samples[untested]!.name.toLowerCase()} would have shown it: test before you decide.`,
        };
      return { q: 0, line: 'Not so — look again at what the tests showed.' };
    }
    const lower = `${opt.text.charAt(0).toLowerCase()}${opt.text.slice(1)}`;
    const other = p.options.find((o, k) => k !== p.answer && o.fits && !disproved(o));
    if (other)
      return {
        q: 1,
        line: `${opt.text} — right, but a guess: nothing you tested ruled out “${other.text.toLowerCase()}”.`,
      };
    if (tests <= enough) return { q: 2, line: `${tests} ${noun(tests)} settled it — ${lower}.${principle}` };
    const advice = radar
      ? 'one echo you know and the one you don’t are enough'
      : 'test the samples that split the ideas';
    return {
      q: 1,
      line: `${opt.text} — right, after ${tests} ${noun(tests)} where ${enough} would do: ${advice}.`,
    };
  }

  /** The road nearest (x, y) on the map, or -1. */
  function roadAt(x: number, y: number): number {
    if (x < 6 || x > 242 || y < 20 || y > 152) return -1;
    let best = -1;
    let bd = 14;
    for (let i = 0; i < nS; i++) {
      const dx = x - TX;
      const dy = y - TY;
      const along = dx * Math.cos(roadAng[i]!) + dy * Math.sin(roadAng[i]!);
      const across = Math.abs(-dx * Math.sin(roadAng[i]!) + dy * Math.cos(roadAng[i]!));
      if (along > 8 && across < bd) {
        bd = across;
        best = i;
      }
    }
    return best;
  }

  function onDown(pt: { x: number; y: number }): void {
    if (end.finished() || chosen >= 0) return;
    for (let k = 0; k < p.options.length; k++) if (inBox(optBoxes[k]!, pt.x, pt.y)) return choose(k);
    if (radar) {
      const r = roadAt(pt.x, pt.y);
      if (r >= 0) test(r);
      return;
    }
    for (let i = 0; i < nS; i++) if (inBox(trayBoxes[i]!, pt.x, pt.y)) return test(i);
  }

  const onKey = (e: KeyboardEvent): void => {
    if (end.finished()) return;
    const k = e.key;
    if (k >= '1' && k <= '9' && Number(k) <= nS) {
      test(Number(k) - 1);
      e.preventDefault();
      e.stopPropagation();
    }
  };
  window.addEventListener('keydown', onKey, true);

  // ---- Drawing ----
  function drawSample(s: ObserveSample, x: number, y: number, k = 1): void {
    g.fillStyle = s.colour;
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 1;
    const sz = (0.6 + 0.6 * (s.size ?? 0.6)) * k;
    switch (s.shape ?? 'block') {
      case 'rod':
        rrect(g, x - 13 * k, y - 2.5 * k, 26 * k, 5 * k, 2 * k);
        g.fill();
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(x - 11 * k, y - 1.8 * k, 22 * k, 1.2 * k);
        break;
      case 'nail':
        g.fillRect(x - 12 * k, y - 1.5 * k, 22 * k, 3 * k);
        g.fillRect(x + 9 * k, y - 4 * k, 2.5 * k, 8 * k);
        g.beginPath();
        g.moveTo(x - 12 * k, y - 1.5 * k);
        g.lineTo(x - 16 * k, y);
        g.lineTo(x - 12 * k, y + 1.5 * k);
        g.fill();
        break;
      case 'coin':
        g.beginPath();
        g.ellipse(x, y, 8 * k, 6 * k, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.beginPath();
        g.ellipse(x, y, 5 * k, 3.5 * k, 0, 0, Math.PI * 2);
        g.stroke();
        break;
      case 'ball':
        g.beginPath();
        g.arc(x, y, 7 * sz, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.3)';
        g.beginPath();
        g.arc(x - 2 * sz, y - 2 * sz, 2.2 * sz, 0, Math.PI * 2);
        g.fill();
        break;
      case 'drop':
        g.beginPath();
        g.moveTo(x, y - 8 * k);
        g.quadraticCurveTo(x + 7 * k, y + 2 * k, x, y + 6 * k);
        g.quadraticCurveTo(x - 7 * k, y + 2 * k, x, y - 8 * k);
        g.fill();
        break;
      default:
        rrect(g, x - 9 * sz, y - 6 * sz, 18 * sz, 12 * sz, 2);
        g.fill();
        g.stroke();
    }
  }

  /** How strongly the active test shows right now (eases in). */
  const showing = (): number =>
    active < 0 ? 0 : Math.min(1, Math.max(0, (testT - 0.35) / 0.4)) * samples[active]!.shows;

  function drawLampRig(): void {
    // A battery, a lamp, a meter and two clips with a gap for the sample.
    const s = showing();
    const lx = 150;
    const ly = 44;
    g.strokeStyle = s > 0.05 ? '#d8a050' : '#8a6a3a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(40, 120);
    g.lineTo(40, 44);
    g.lineTo(lx - 7, 44);
    g.moveTo(lx + 7, 44);
    g.lineTo(206, 44);
    g.lineTo(206, 120);
    g.lineTo(150, 120);
    g.moveTo(40, 120);
    g.lineTo(98, 120);
    g.stroke();
    // Battery cells.
    g.fillStyle = '#2b3440';
    g.fillRect(31, 70, 18, 26);
    g.fillStyle = '#c8463a';
    g.fillRect(36, 66, 8, 4);
    text(g, '6 V', 22, 84, { size: 8, color: PAL.dim });
    // The lamp.
    if (s > 0.02) {
      g.globalAlpha = Math.min(1, s * 1.1);
      g.drawImage(lampGlow, lx - 34, ly - 34, 68, 68);
      g.globalAlpha = 1;
    }
    g.fillStyle =
      s > 0.05 ? `rgba(255,${220 + Math.round(30 * s)},${140 + Math.round(80 * s)},1)` : '#3a3632';
    g.beginPath();
    g.arc(lx, ly, 8, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#d8c79a';
    g.lineWidth = 1;
    g.stroke();
    // The meter: a needle that swings with the current.
    const mx = 178;
    const my = 92;
    g.fillStyle = '#e6d9b8';
    g.beginPath();
    g.arc(mx, my, 15, Math.PI, 0);
    g.closePath();
    g.fill();
    g.strokeStyle = '#5a4a30';
    g.stroke();
    const a = Math.PI + 0.25 + s * (Math.PI - 0.5);
    g.strokeStyle = '#a8382a';
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(mx, my);
    g.lineTo(mx + Math.cos(a) * 12, my + Math.sin(a) * 12);
    g.stroke();
    text(g, 'A', mx, my - 5, { size: 7, color: '#5a4a30', bold: true });
    // The clips and the gap.
    g.fillStyle = '#9a9a9a';
    g.fillRect(96, 116, 8, 8);
    g.fillRect(146, 116, 8, 8);
    if (active < 0) text(g, 'put a sample here', 125, 136, { size: 8, color: PAL.faint });
    if (s > 0.02) {
      // Current: dots along the loop.
      g.fillStyle = '#fff3b0';
      const ph = (t * 1.2) % 1;
      const loop: [number, number, number, number][] = [
        [40, 120, 40, 44],
        [40, 44, 206, 44],
        [206, 44, 206, 120],
        [206, 120, 150, 120],
        [100, 120, 40, 120],
      ];
      g.beginPath();
      for (const [x0, y0, x1, y1] of loop) {
        const len = Math.hypot(x1 - x0, y1 - y0);
        for (let d = (ph * 14) % 14; d < len; d += 14) {
          const f = d / len;
          const x = x0 + (x1 - x0) * f;
          const y = y0 + (y1 - y0) * f;
          g.moveTo(x + 1.3, y);
          g.arc(x, y, 1.3, 0, Math.PI * 2);
        }
      }
      g.fill();
    }
  }

  function drawFloatRig(): void {
    // A tank of water; the sample drops in and floats (high or low) or sinks.
    const tx = 50;
    const ty = 40;
    const tw = 150;
    const th = 96;
    const wl = ty + 28; // the water line
    g.fillStyle = 'rgba(70,140,200,0.35)';
    g.fillRect(tx, wl, tw, th - 28);
    g.strokeStyle = '#9fb8d0';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(tx, ty);
    g.lineTo(tx, ty + th);
    g.lineTo(tx + tw, ty + th);
    g.lineTo(tx + tw, ty);
    g.stroke();
    g.strokeStyle = 'rgba(160,210,255,0.8)';
    g.beginPath();
    g.moveTo(tx, wl);
    for (let x = 0; x <= tw; x += 6) g.lineTo(tx + x, wl + Math.sin(t * 3 + x * 0.2) * 1);
    g.stroke();
    if (active < 0) {
      text(g, 'drop a sample in', tx + tw / 2, ty + 12, { size: 8, color: PAL.faint });
      return;
    }
    const s = samples[active]!;
    const fall = Math.min(1, testT / 0.5);
    let y: number;
    const floats = s.shows >= 0.5;
    const rest = floats ? wl + 6 - (s.shows - 0.5) * 18 : ty + th - 8;
    if (testT < 0.5) y = ty - 4 + (wl - ty + 4) * fall * fall;
    else {
      const k = Math.min(1, (testT - 0.5) / (floats ? 0.4 : 0.6));
      y = wl + (rest - wl) * (1 - Math.pow(1 - k, 2)) + (floats ? Math.sin(testT * 6) * 1.2 * (1 - k) : 0);
    }
    if (testT > 0.45 && testT < 0.9) {
      g.strokeStyle = 'rgba(200,230,255,0.7)';
      g.beginPath();
      g.arc(tx + tw / 2, wl, (testT - 0.45) * 40, Math.PI, 0);
      g.stroke();
    }
    drawSample(s, tx + tw / 2, y, 1.3);
  }

  function drawSpringRig(): void {
    const ax = 120;
    const ay = 30;
    g.fillStyle = '#5a4a30';
    g.fillRect(ax - 40, ay - 6, 80, 6);
    const stretch = active < 0 ? 0 : Math.min(1, testT / 0.6) * samples[active]!.shows;
    const len = 30 + stretch * 60;
    g.strokeStyle = '#c9d6dd';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(ax, ay);
    for (let k = 0; k <= 12; k++)
      g.lineTo(ax + (k % 2 ? 7 : -7) * (k > 0 && k < 12 ? 1 : 0), ay + (len * k) / 12);
    g.stroke();
    // The scale.
    g.fillStyle = '#e6d9b8';
    g.fillRect(ax + 22, ay + 20, 14, 90);
    for (let k = 0; k <= 9; k++) {
      g.fillStyle = '#5a4a30';
      g.fillRect(ax + 22, ay + 30 + k * 9, k % 5 === 0 ? 7 : 4, 1);
    }
    g.fillStyle = '#a8382a';
    g.fillRect(ax + 8, ay + len, 16, 1.5);
    if (active >= 0) drawSample(samples[active]!, ax, ay + len + 9, 1.2);
    else text(g, 'hang a sample', ax, ay + 60, { size: 8, color: PAL.faint });
  }

  function drawSwingRig(): void {
    const ax = 125;
    const ay = 28;
    g.fillStyle = '#5a4a30';
    g.fillRect(ax - 50, ay - 6, 100, 6);
    if (active < 0) {
      text(g, 'hang a pendulum', ax, ay + 50, { size: 8, color: PAL.faint });
      return;
    }
    const s = samples[active]!;
    const L = 30 + (s.length ?? 0.6) * 80;
    const period = 0.6 + s.shows * 1.6;
    const amp = 0.5 * Math.min(1, testT / 0.3);
    const a = amp * Math.cos((testT * Math.PI * 2) / period);
    const bx = ax + Math.sin(a) * L;
    const by = ay + Math.cos(a) * L;
    g.strokeStyle = '#c9b48a';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
    drawSample(s, bx, by, 1.2);
    // A ticking count of the swings, to feel the beat.
    const beats = Math.floor((testT * 2) / period);
    for (let k = 0; k < Math.min(8, beats); k++) {
      g.fillStyle = PAL.gold;
      g.fillRect(ax + 56 + k * 7, ay - 4, 4, 4);
    }
  }

  function drawRadar(): void {
    // The map: the tower, its roads, the fog; a pulse runs out and its echo back.
    g.fillStyle = '#0e1410';
    rrect(g, 6, 20, 236, 132, 6);
    g.fill();
    g.save();
    rrect(g, 6, 20, 236, 132, 6);
    g.clip();
    for (let i = 0; i < nS; i++) {
      const a = roadAng[i]!;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const hover = active < 0 && chosen < 0 && roadAt(pointer.x, pointer.y) === i;
      g.strokeStyle = i === active ? '#8a7a5a' : hover ? '#6e5a35' : '#3d3a2c';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(TX, TY);
      g.lineTo(TX + ca * MAP_R * 1.2, TY + sa * MAP_R * 1.2);
      g.stroke();
      const s = samples[i]!;
      if (s.known && s.distance) {
        const d = s.distance * pxPerM;
        const x = TX + ca * d;
        const y = TY + sa * d;
        // A known landmark, with its distance on a signpost.
        g.fillStyle = '#8a6a48';
        g.fillRect(x - 5, y - 5, 10, 8);
        g.fillStyle = '#7a2e22';
        g.beginPath();
        g.moveTo(x - 6, y - 5);
        g.lineTo(x, y - 10);
        g.lineTo(x + 6, y - 5);
        g.fill();
        text(g, `${(s.distance / 1000).toLocaleString('en-GB')} km`, x, y + 10, { size: 8, color: PAL.gold });
      }
    }
    // Fog: beyond it, only echoes tell.
    const fx = TX + fogFrom * pxPerM;
    g.fillStyle = 'rgba(150,160,170,0.16)';
    g.fillRect(fx, 22, 240 - fx, 128);
    for (let k = 0; k < 14; k++) {
      const x = fx + ((k * 37 + t * 6) % (240 - fx));
      const y = 30 + ((k * 53) % 110);
      g.fillStyle = 'rgba(190,200,210,0.07)';
      g.beginPath();
      g.ellipse(x, y, 22, 7, 0, 0, Math.PI * 2);
      g.fill();
    }
    text(g, 'fog', fx + 14, 30, { size: 8, color: 'rgba(200,210,220,0.5)' });
    // Road names at their far ends.
    for (let i = 0; i < nS; i++) {
      const a = roadAng[i]!;
      const sa = Math.abs(Math.sin(a));
      const room = sa > 0.01 ? (a < 0 ? TY - 36 : 140 - TY) / sa : MAP_R;
      const along = Math.min(MAP_R - 4, room);
      const ex = TX + Math.cos(a) * along;
      const ey = TY + Math.sin(a) * along - 7;
      text(g, `${i + 1} ${samples[i]!.name}`, Math.min(236, ex), ey, {
        size: 8.5,
        color: i === active ? PAL.gold : PAL.ink,
        align: 'right',
      });
    }
    g.restore();
    // The tower with its dish.
    g.fillStyle = '#5a4a30';
    g.fillRect(TX - 5, TY - 2, 10, 16);
    g.strokeStyle = '#c9d6dd';
    g.lineWidth = 1.5;
    g.beginPath();
    const da = active >= 0 ? roadAng[active]! : 0;
    g.arc(TX, TY - 4, 6, da - 1.2, da + 1.2);
    g.stroke();
    // The pulse: out to its target and back, in real time scaled to watch.
    if (active >= 0) {
      const s = samples[active]!;
      const a = roadAng[active]!;
      const d = (s.distance ?? 0) * pxPerM;
      const total = TEST - 0.2;
      const f = Math.min(1, testT / total);
      const out = f < 0.5;
      const r = out ? d * (f / 0.5) : d * (1 - (f - 0.5) / 0.5);
      // The wavefront: going out green, the echo coming back red.
      g.strokeStyle = out ? 'rgba(160,255,190,0.35)' : 'rgba(255,170,140,0.35)';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(TX, TY, Math.max(1, r), a - 0.2, a + 0.2);
      g.stroke();
      g.strokeStyle = out ? '#b8ffcc' : '#ffb8a0';
      g.lineWidth = 2;
      g.stroke();
      if (!out && f < 0.62) {
        const x = TX + Math.cos(a) * d;
        const y = TY + Math.sin(a) * d;
        g.globalAlpha = 1 - (f - 0.5) / 0.12;
        g.drawImage(pingGlow, x - 10, y - 10, 20, 20);
        g.globalAlpha = 1;
      }
      // The clock runs while the pulse is out.
      const shownDelay = delayOf(s) * Math.min(1, f) * unitScale;
      text(g, `${Math.round(shownDelay)} ${unit}`, TX + 4, 140, {
        size: 10,
        color: f >= 1 ? PAL.gold : PAL.ink,
        align: 'left',
        bold: true,
      });
    }
    // The trace: each road's echo, a spike at its delay.
    const ax0 = 14;
    const ax1 = 234;
    const ay = 178;
    g.fillStyle = '#0c120e';
    rrect(g, 6, 156, 236, 34, 5);
    g.fill();
    g.strokeStyle = '#2e5a3a';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(ax0, ay);
    g.lineTo(ax1, ay);
    g.stroke();
    const step = maxDelay * unitScale > 60 ? 20 : 10;
    for (let v = 0; v <= maxDelay * unitScale; v += step) {
      const x = ax0 + ((ax1 - ax0) * v) / (maxDelay * unitScale);
      g.fillStyle = '#2e5a3a';
      g.fillRect(x, ay, 1, 3);
      text(g, `${v}`, x, ay + 8, { size: 7, color: '#5a8a6a' });
    }
    text(g, unit, ax1 - 2, 162, { size: 7, color: '#5a8a6a', align: 'right' });
    // The sent pulse at zero.
    g.strokeStyle = '#a0ffb8';
    g.beginPath();
    g.moveTo(ax0, ay);
    g.lineTo(ax0, ay - 14);
    g.stroke();
    for (let i = 0; i < nS; i++) {
      if (!tested[i]) continue;
      const fresh = i === active;
      if (fresh && testT < TEST - 0.2) continue;
      const x = ax0 + ((ax1 - ax0) * delayOf(samples[i]!)) / maxDelay;
      g.strokeStyle = samples[i]!.colour;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x - 3, ay);
      g.lineTo(x, ay - 12);
      g.lineTo(x + 3, ay);
      g.stroke();
      text(g, `${Math.round(delayOf(samples[i]!) * unitScale)}`, x, ay - 17, {
        size: 8,
        color: samples[i]!.colour,
        bold: true,
      });
    }
  }

  function update(dt: number): void {
    t += dt;
    if (active >= 0) {
      testT += dt;
      if (testT >= TEST + (radar ? 0.2 : 0.6)) active = -1;
    }
    if (chosen < 0 && !end.finished() && t >= timeLimit) {
      chosen = -2;
      end.finish(
        0,
        `Night fell before you decided — ${tests ? `${tests} ${noun(tests)}, no answer` : `no ${noun(2)}, no answer`}.`,
      );
    }
    if (chosen >= 0 && !end.finished() && t - doneT > 0.5) {
      const v = verdict();
      end.finish(v.q, v.line);
    }

    // ---- Draw ----
    g.fillStyle = PAL.bg;
    g.fillRect(0, 0, W, H);
    text(g, p.words.goal, 6, 9, { size: goalSize, color: PAL.gold, align: 'left' });
    const left = Math.max(0, 1 - t / timeLimit);
    g.fillStyle = '#2a2318';
    g.fillRect(W - 54, 6, 48, 4);
    g.fillStyle = left < 0.2 ? PAL.bad : '#8a7a5a';
    g.fillRect(W - 54, 6, 48 * left, 4);
    if (radar) drawRadar();
    else {
      g.fillStyle = '#17130e';
      rrect(g, 6, 20, 236, 132, 6);
      g.fill();
      if (rig === 'lamp') drawLampRig();
      else if (rig === 'float') drawFloatRig();
      else if (rig === 'spring') drawSpringRig();
      else drawSwingRig();
      // The sample in the rig, and what it showed.
      if (active >= 0) {
        const s = samples[active]!;
        if (rig === 'lamp') drawSample(s, 125, 120, 1.1);
        if (testT > 0.8)
          text(g, `${s.name}: ${s.reading ?? (s.shows >= 0.5 ? 'yes' : 'no')}`, 124, 146, {
            size: 9,
            color: s.shows >= 0.5 ? PAL.gold : PAL.dim,
            bold: true,
          });
      }
      // The tray: click to test; tested ones carry their result.
      samples.forEach((s, i) => {
        const b = trayBoxes[i]!;
        const hover = active < 0 && chosen < 0 && inBox(b, pointer.x, pointer.y);
        g.fillStyle = hover ? '#2c241a' : '#1b1610';
        rrect(g, b.x, b.y, b.w, b.h, 4);
        g.fill();
        g.strokeStyle = hover ? PAL.gold : tested[i] ? '#6e5a35' : '#3a3022';
        g.lineWidth = 1;
        g.stroke();
        if (i !== active) drawSample(s, b.x + b.w / 2, b.y + 14, 0.75);
        const words = s.name.split(' ');
        text(g, words[0]!, b.x + b.w / 2, b.y + 28, { size: 7, color: PAL.dim });
        if (words[1]) text(g, words.slice(1).join(' '), b.x + b.w / 2, b.y + 35, { size: 7, color: PAL.dim });
        if (tested[i] && i !== active) {
          const yes = s.shows >= 0.5;
          g.fillStyle = yes ? PAL.gold : '#5a4a3a';
          g.beginPath();
          g.arc(b.x + b.w - 5, b.y + 5, 3, 0, Math.PI * 2);
          g.fill();
        }
      });
    }
    // The question and the ideas to choose from.
    g.fillStyle = '#1b1610';
    rrect(g, panelX - 4, 18, W - panelX + 2, 186, 6);
    g.fill();
    qLines.forEach((l, k) =>
      text(g, l, panelX, 28 + k * 12, { size: 10, color: PAL.ink, align: 'left', bold: true }),
    );
    p.options.forEach((o, k) => {
      const b = optBoxes[k]!;
      const off = tests === 0 || active >= 0;
      const struck = host.guided && disproved(o);
      const hover = !off && chosen < 0 && inBox(b, pointer.x, pointer.y);
      const picked = chosen === k;
      g.fillStyle = picked ? (k === p.answer ? '#1f3a24' : '#3a1c18') : hover ? '#2c241a' : '#211b14';
      rrect(g, b.x, b.y, b.w, b.h, 5);
      g.fill();
      g.strokeStyle = picked ? (k === p.answer ? PAL.good : PAL.bad) : hover ? PAL.gold : '#5a4a30';
      g.lineWidth = picked ? 1.5 : 1;
      g.stroke();
      optLines[k]!.forEach((l, j) =>
        text(g, l, b.x + 6, b.y + 9 + j * 11, {
          size: 9.5,
          color: struck ? PAL.faint : off ? PAL.dim : PAL.ink,
          align: 'left',
        }),
      );
      if (struck) {
        g.strokeStyle = 'rgba(255,106,90,0.7)';
        g.lineWidth = 1;
        for (let j = 0; j < optLines[k]!.length; j++) {
          g.font = `9.5px ${FONT}`;
          const w = g.measureText(optLines[k]![j]!).width;
          g.beginPath();
          g.moveTo(b.x + 5, b.y + 9 + j * 11);
          g.lineTo(b.x + 7 + w, b.y + 9 + j * 11);
          g.stroke();
        }
      }
    });
    const lastBox = optBoxes[optBoxes.length - 1]!;
    text(
      g,
      `${tests} ${noun(tests)}${tests === 0 ? (radar ? ' — pulse before you decide' : ' — test before you decide') : ''}`,
      panelX,
      lastBox.y + lastBox.h + 10,
      { size: 8.5, color: PAL.faint, align: 'left' },
    );
    // The status line.
    const hint =
      host.guided && chosen < 0
        ? (p.words.hint ??
          (radar
            ? 'Click a road to send a pulse up it'
            : 'Click a sample to test it; then choose the idea that fits'))
        : '';
    text(
      g,
      hint ||
        (radar
          ? 'click a road (1–9) to pulse it · then choose'
          : 'click a sample (1–9) to test it · then choose'),
      W / 2,
      211,
      { size: 9, color: hint ? PAL.gold : PAL.faint },
    );
  }

  return {
    update,
    dispose: () => {
      window.removeEventListener('keydown', onKey, true);
      c.dispose();
    },
  };
}
