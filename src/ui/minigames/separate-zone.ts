import type { Minigame, MinigameHost } from './types.ts';
import { validateSeparation, type SeparateParams } from './separate-data.ts';
import { text, PAL } from './kit.ts';
import { W, PANEL_X, glowSprite, frame } from './separate-drawing.ts';
export function createZone(host: MinigameHost, p: SeparateParams): Minigame {
  validateSeparation(p);
  // The target is validated; per-part buffers mirror parts. Particle loops are bounded by their allocated pool size.
  const parts = p.parts;
  const timeLimit = p.time ?? 40;
  const passes = p.passes ?? 3;
  const keep = p.keep ?? 0.75;
  const imp = parts.findIndex((_, i) => i !== p.want);
  const k0 = Math.max(0.0001, Math.min(1, parts[imp]?.value ?? 0.1));
  const sum = parts.reduce((s, pt) => s + pt.share, 0) || 1;
  const startImp = (parts[imp]?.share ?? 1) / sum; // the impurity's share at the start
  const NC = 120;
  if (!(keep > 0 && keep <= 1) || Math.floor(NC * keep) < 1)
    throw new Error('Zone refining must retain at least one complete rod cell');
  // The molten front starts at ZW and advances only below NC. Speckles have four entries per cell; palette indices are clamped.
  const ZW = 10; // cells molten at once
  const c = new Float64Array(NC).fill(1); // impurity, relative to the start
  const X0 = 14;
  const X1 = 232;
  const cw = (X1 - X0) / NC;
  const RY = 110;
  const VSTAR = 30; // cells a second: a good steady pace
  let t = 0;
  let pass = 1;
  let zf = ZW; // the zone's front (cells); the zone is [zf − ZW, zf)
  let S = 0; // impurity in the melt
  for (let i = 0; i < ZW; i++) S += c[i]!;
  let speed = 0; // cells/s, smoothed
  let returning = 0; // > 0 while the ring slides back for the next pass
  let dwell = 0; // seconds spent too slow
  let fastShare = 0;
  let finished = false;
  let cutT = -1;
  let held = false;
  const glow = glowSprite(255, 140, 50);
  // The rod's colour from clean blue-grey to dirty, by impurity on a log scale (made once).
  const ROD: string[] = Array.from({ length: 24 }, (_, k) => {
    const d = k / 23;
    return `rgb(${Math.round(140 - 70 * d)},${Math.round(155 - 85 * d)},${Math.round(176 - 110 * d)})`;
  });
  // Specks: a fixed scatter per cell, shown as the impurity there grows.
  const speckY = new Float32Array(NC * 4);
  const speckX = new Float32Array(NC * 4);
  for (let i = 0; i < NC * 4; i++) {
    speckX[i] = Math.random();
    speckY[i] = Math.random();
  }

  const ui = frame(host, p, {
    down: () => (held = true),
    up: () => (held = false),
  });
  const g = ui.g;
  const pointer = ui.pointer;

  const keptImp = (): number => {
    const n = Math.floor(NC * keep);
    let s = 0;
    for (let i = 0; i < n; i++) s += c[i]!;
    return (s / n) * startImp;
  };
  const purityText = (x: number): string => {
    const v = (1 - x) * 100;
    const digits = Math.min(6, Math.max(1, Math.ceil(-Math.log10(Math.max(1e-9, x * 100))) + 1));
    return `${v.toFixed(digits)} %`;
  };

  /** Moves the zone's front one cell on: the back freezes (taking only a share of the melt's impurity), the front melts. */
  function advance(kEff: number): void {
    if (zf >= NC) return;
    const CL = S / ZW;
    const cs = kEff * CL;
    c[zf - ZW] = cs;
    S += c[zf]! - cs;
    zf++;
  }

  function endPass(): void {
    // The last of the melt freezes at the far end, with all it gathered.
    const CL = S / ZW;
    for (let i = NC - ZW; i < NC; i++) c[i] = CL;
    if (pass >= passes) {
      cutT = t;
      return;
    }
    pass++;
    returning = 0.7;
  }

  function finish(): void {
    if (finished || ui.end.finished()) return;
    finished = true;
    const x = keptImp();
    const target = 1 - p.purity;
    const principle = p.words.principle ? ` ${p.words.principle}` : '';
    const name = parts[p.want]!.name.toLowerCase();
    if (x > target) {
      const why =
        fastShare > 0.4
          ? 'the ring went too fast for the impurities to stay in the melt'
          : 'more slow, steady passes carry more of them along';
      return ui.end.finish(0, `Only ${purityText(x)} pure: ${why}.`);
    }
    if (x <= target / 2)
      return ui.end.finish(
        2,
        `${purityText(x)} pure ${name}: ${passes} steady passes swept the impurities to the end, cut away.${principle}`,
      );
    return ui.end.finish(
      1,
      `${purityText(x)} pure — good, but ${fastShare > 0.15 ? 'a steadier, slower ring leaves less behind' : 'a slower pace leaves less behind'}.`,
    );
  }
  ui.setDone(() => {
    if (cutT < 0 && !finished) cutT = t;
  });

  function update(dt: number): void {
    t += dt;
    if (!finished && cutT < 0) {
      if (returning > 0) {
        returning -= dt;
        if (returning <= 0) {
          zf = ZW;
          S = 0;
          for (let i = 0; i < ZW; i++) S += c[i]!;
          held = false;
        }
      } else {
        // The ring follows the hand, forwards only.
        const target = held && pointer.down ? (pointer.x - X0) / cw + ZW / 2 : zf;
        const want = Math.max(zf, Math.min(NC, target));
        const moved = Math.floor(want - zf);
        const inst = moved / Math.max(dt, 1e-3);
        speed += (inst - speed) * Math.min(1, dt * 5);
        // Too fast and the crystal freezes in what it meets; steady and slow, the melt keeps it.
        const kEff = k0 + (1 - k0) * Math.max(0, Math.min(1, (speed - VSTAR * 1.6) / (VSTAR * 2.4)));
        for (let s = 0; s < moved && zf < NC; s++) advance(kEff);
        if (moved > 0) fastShare += ((kEff > k0 + 0.05 ? 1 : 0) - fastShare) * Math.min(1, moved / NC);
        // Dwelling too long: the molten zone grows until it drips.
        if (speed < VSTAR * 0.12 && zf > ZW) dwell += dt;
        else dwell = Math.max(0, dwell - dt * 2);
        if (dwell > 3.2) {
          finished = true;
          ui.end.finish(
            0,
            'The ring stood still: the molten zone grew too long and dripped off the rod — keep it moving.',
          );
        }
        if (zf >= NC) endPass();
      }
      if (t >= timeLimit && !finished && cutT < 0) cutT = t;
    }
    if (cutT >= 0 && !finished && t - cutT > 1.1) finish();

    // ---- Draw ----
    ui.top(1 - t / timeLimit);
    // The rod: clean silicon is blue-grey, impure darker with specks.
    const cutX = X0 + NC * keep * cw;
    const drop = cutT >= 0 ? Math.min(30, (t - cutT) * (t - cutT) * 60) : 0;
    for (let i = 0; i < NC; i++) {
      const x = X0 + i * cw;
      const dirt = Math.max(0, Math.min(1, (Math.log10(Math.max(1e-6, c[i]!)) + 3) / 4)); // 0 at 1/1000, 1 at 10× the start
      const dy = i >= NC * keep ? drop : 0;
      g.fillStyle = ROD[Math.round(dirt * 23)]!;
      g.fillRect(x, RY - 9 + dy, cw + 0.5, 18);
      const specks = Math.min(4, Math.round(c[i]! * 2));
      g.fillStyle = '#2a1a10';
      for (let s = 0; s < specks; s++)
        g.fillRect(x + speckX[i * 4 + s]! * cw, RY - 7 + speckY[i * 4 + s]! * 14 + dy, 1.2, 1.2);
    }
    // A shine along the top.
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(X0, RY - 7, cutT >= 0 ? cutX - X0 : X1 - X0, 2);
    // Where it will be cut.
    g.strokeStyle = 'rgba(233,196,106,0.6)';
    g.setLineDash([3, 3]);
    g.beginPath();
    g.moveTo(cutX, RY - 18);
    g.lineTo(cutX, RY + 18);
    g.stroke();
    g.setLineDash([]);
    text(g, 'kept', (X0 + cutX) / 2, RY + 26, { size: 8, color: PAL.faint });
    text(g, 'cut off', (cutX + X1) / 2, RY + 26 + drop, { size: 8, color: PAL.faint });
    // The molten zone and the heater ring.
    if (returning <= 0 && cutT < 0 && !finished) {
      const zx0 = X0 + (zf - ZW) * cw;
      const zx1 = X0 + zf * cw;
      const hot = Math.min(1, 0.5 + dwell * 0.2);
      g.globalAlpha = 0.85;
      g.drawImage(glow, zx0 - 14, RY - 26 - dwell * 3, zx1 - zx0 + 28, 52 + dwell * 6);
      g.globalAlpha = 1;
      g.fillStyle = `rgba(255,${Math.round(170 - 60 * hot)},60,0.9)`;
      g.fillRect(zx0, RY - 9 - dwell, zx1 - zx0, 18 + dwell * 2);
      // Impurities riding in the melt.
      const inMelt = Math.min(14, Math.round((S / ZW) * 3));
      g.fillStyle = '#4a2010';
      for (let s = 0; s < inMelt; s++) {
        const fx = (s * 0.37 + t * 0.6) % 1;
        g.fillRect(zx0 + fx * (zx1 - zx0), RY - 6 + ((s * 7) % 12), 1.5, 1.5);
      }
      // The ring.
      const rx = (zx0 + zx1) / 2;
      g.strokeStyle = '#c27a3e';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(rx, RY, 7, 16, 0, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = '#ffd27a';
      g.lineWidth = 1;
      g.stroke();
      if (host.guided && zf === ZW && !pointer.down) {
        g.strokeStyle = `rgba(233,196,106,${0.4 + 0.2 * Math.sin(t * 4)})`;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(rx + 12, RY - 26);
        g.lineTo(rx + 52, RY - 26);
        g.lineTo(rx + 46, RY - 31);
        g.moveTo(rx + 52, RY - 26);
        g.lineTo(rx + 46, RY - 21);
        g.stroke();
      }
    }
    // Above the rod: the pass, the pace.
    text(
      g,
      cutT >= 0
        ? 'Cutting off the dirty end'
        : `Pass ${pass} of ${passes}${returning > 0 ? ' — back to the start' : ''}`,
      X0,
      34,
      { size: 10, color: PAL.ink, align: 'left', bold: true },
    );
    text(g, 'the zone melts at 1414 °C', X0, 48, { size: 8, color: PAL.faint, align: 'left' });
    const mmMin = speed * 0.1; // the rod is 12 mm a second at a good pace… shown per minute as the real ones go
    const bx = 14;
    const bw = 216;
    const maxV = VSTAR * 4.5;
    g.fillStyle = '#2a2318';
    g.fillRect(bx, 62, bw, 6);
    g.fillStyle = 'rgba(125,255,154,0.35)';
    g.fillRect(bx + (bw * VSTAR * 0.12) / maxV, 62, (bw * (VSTAR * 1.6 - VSTAR * 0.12)) / maxV, 6);
    g.fillStyle = 'rgba(255,106,90,0.4)';
    g.fillRect(bx + (bw * VSTAR * 1.6) / maxV, 62, bw - (bw * VSTAR * 1.6) / maxV, 6);
    g.fillStyle = PAL.ink;
    g.fillRect(bx + Math.min(bw, (bw * speed) / maxV) - 1, 59, 2, 12);
    text(g, `pace ${mmMin.toFixed(1)} mm/min`, bx + bw, 48, {
      size: 8.5,
      color: speed > VSTAR * 1.6 ? PAL.bad : PAL.dim,
      align: 'right',
    });
    text(g, 'steady', bx + (bw * VSTAR * 0.5) / maxV, 75, { size: 7.5, color: PAL.faint });
    text(g, 'too fast', bx + (bw * VSTAR * 3) / maxV, 75, { size: 7.5, color: '#ff8a7a' });
    // The panel: purity of what's kept.
    const x = keptImp();
    text(g, 'Kept part', PANEL_X + 2, 30, { size: 9, color: PAL.dim, align: 'left' });
    text(g, purityText(x), W - 10, 46, {
      size: 12,
      color: x <= 1 - p.purity ? PAL.good : PAL.ink,
      align: 'right',
      bold: true,
    });
    text(g, `need ${purityText(1 - p.purity)}`, W - 10, 62, { size: 8.5, color: PAL.faint, align: 'right' });
    text(g, `impurities: ${Math.round(x * 1e6)} in a million`, PANEL_X + 2, 80, {
      size: 8.5,
      color: PAL.dim,
      align: 'left',
    });
    if (dwell > 1.2 && !finished)
      text(g, 'the melt is spreading — move on!', PANEL_X + 2, 98, {
        size: 8.5,
        color: PAL.bad,
        align: 'left',
        bold: true,
      });
    else {
      // Impurity along the rod, on a log scale: each pass drains the start and piles it up at the end.
      const gx0 = PANEL_X + 2;
      const gw = W - PANEL_X - 12;
      const gy0 = 104;
      const gh = 54;
      g.fillStyle = '#14110d';
      g.fillRect(gx0, gy0, gw, gh);
      const yOf = (v: number): number =>
        gy0 + gh - Math.max(0, Math.min(1, (Math.log10(Math.max(1e-4, v)) + 3) / 4)) * gh;
      g.strokeStyle = 'rgba(191,179,154,0.35)';
      g.lineWidth = 1;
      g.setLineDash([2, 2]);
      g.beginPath();
      g.moveTo(gx0, yOf(1));
      g.lineTo(gx0 + gw, yOf(1));
      g.moveTo(gx0 + gw * keep, gy0);
      g.lineTo(gx0 + gw * keep, gy0 + gh);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = '#e9c46a';
      g.lineWidth = 1.3;
      g.beginPath();
      for (let i = 0; i < NC; i++) {
        const x = gx0 + (gw * (i + 0.5)) / NC;
        if (i) g.lineTo(x, yOf(c[i]!));
        else g.moveTo(x, yOf(c[i]!));
      }
      g.stroke();
      text(g, 'impurity along the rod', gx0, gy0 + gh + 8, { size: 7.5, color: PAL.faint, align: 'left' });
      text(g, 'as it began', gx0 + 3, yOf(1) - 5, { size: 7, color: PAL.faint, align: 'left' });
    }
    ui.button(cutT >= 0 ? 'Cut' : 'Cut now', cutT >= 0 || finished);
    const hint = host.guided && !finished ? (p.words.hint ?? 'Drag the ring slowly to the right') : '';
    ui.status(hint || 'press and drag the ring to the right, pass after pass', !!hint);
  }

  return { update, dispose: ui.dispose };
}
