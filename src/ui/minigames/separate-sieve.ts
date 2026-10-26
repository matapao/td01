import type { Minigame, MinigameHost } from './types.ts';
import { validateSeparation, type SeparateParams } from './separate-data.ts';
import { text, PAL } from './kit.ts';
import { W, PANEL_X, pct, frame, counts, judge } from './separate-drawing.ts';
export function createSieve(host: MinigameHost, p: SeparateParams): Minigame {
  validateSeparation(p);
  // The target is validated; per-part buffers mirror parts. Particle loops are bounded by their allocated pool size.
  const parts = p.parts;
  const timeLimit = p.time ?? 35;
  const want = p.want;
  const meshes = p.meshes ?? [1];
  const D = meshes.length; // decks; level D is the pan below
  // Where each part belongs: the first deck whose mesh it can't pass.
  const home = parts.map((pt) => {
    for (let d = 0; d < D; d++) if (pt.value >= meshes[d]!) return d;
    return D;
  });
  const n = counts(parts, 90);
  const N = n.reduce((a, b) => a + b, 0);
  const gp = new Uint8Array(N);
  const lvl = new Uint8Array(N); // which deck it's on
  const gx = new Float32Array(N); // x on the deck (−1…1)
  const hop = new Float32Array(N);
  const fall = new Float32Array(N); // 0…1 while dropping to the next level
  const lost = new Uint8Array(N);
  const seed = new Float32Array(N);
  {
    let k = 0;
    n.forEach((cnt, i) => {
      for (let j = 0; j < cnt; j++, k++) {
        gp[k] = i;
        gx[k] = (Math.random() * 2 - 1) * 0.8;
        seed[k] = Math.random();
      }
    });
  }
  const wantTotal = n[want]!;
  const X0 = 22;
  const XW = 164;
  const levelY = (d: number): number => 50 + d * (118 / D);
  // Grains thrown over the frame, flying off.
  const FN = 40;
  const fxs = new Float32Array(FN);
  const fys = new Float32Array(FN);
  const fvx = new Float32Array(FN);
  const fvy = new Float32Array(FN);
  const fl = new Float32Array(FN);
  const fc = new Uint8Array(FN);
  let fnext = 0;
  let t = 0;
  let off = 0; // the stack's sideways offset (px)
  let vel = 0; // its speed, smoothed (px/s)
  let pressX = 0;
  let offAt = 0;
  let keyDir = 0;
  let finished = false;
  const GOOD = 60; // px/s: grains start to fall through
  const SPILL = 230; // px/s: grains fly over the edge

  const ui = frame(host, p, {
    down: (pt) => {
      pressX = pt.x;
      offAt = off;
    },
    key: (e, d) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'a' && e.key !== 'd') return false;
      if (d && !e.repeat) keyDir = e.key === 'ArrowLeft' || e.key === 'a' ? -1 : 1;
      return true;
    },
  });
  const g = ui.g;
  const pointer = ui.pointer;

  const stats = (): { purity: number; kept: number; spilt: number } => {
    let all = 0;
    let w = 0;
    let spilt = 0;
    for (let j = 0; j < N; j++) {
      if (lost[j]) {
        if (gp[j]! === want) spilt++;
        continue;
      }
      if (lvl[j]! === home[want]!) {
        all++;
        if (gp[j]! === want) w++;
      }
    }
    return { purity: all ? w / all : 0, kept: w / wantTotal, spilt: spilt / wantTotal };
  };

  function finish(): void {
    if (finished || ui.end.finished()) return;
    finished = true;
    const s = stats();
    const q = judge(p, s.purity, s.kept);
    const wn = parts[want]!.name.toLowerCase();
    const principle = p.words.principle ? ` ${p.words.principle}` : '';
    const keep = p.keep ?? 0.6;
    if (s.spilt > 1 - keep)
      return ui.end.finish(
        0,
        `Shaken too hard: ${s.spilt >= 1 ? 'all' : pct(s.spilt)} of the ${wn} flew over the edge.`,
      );
    if (s.kept < keep) {
      const mesh = meshes[Math.max(0, home[want]! - 1)]!;
      return ui.end.finish(
        0,
        `Too gentle: most of the ${wn} never got through the ${mesh} mm mesh — the grains must hop to find the holes.`,
      );
    }
    if (s.purity < p.purity)
      return ui.end.finish(
        0,
        `Only ${pct(s.purity)} ${wn}: shake longer, so the smaller grains fall through the mesh below.`,
      );
    if (q === 2) return ui.end.finish(2, `${pct(s.purity)} clean ${wn}, ${pct(s.kept)} kept.${principle}`);
    return ui.end.finish(
      1,
      `${pct(s.purity)} ${wn}, ${pct(s.kept)} kept — ${s.kept < 0.85 ? 'gentler shaking loses less' : 'a little more shaking would finish it'}.`,
    );
  }
  ui.setDone(finish);

  function update(dt: number): void {
    t += dt;
    // Shaking: the stack follows the hand (or the arrow keys); its speed sifts.
    const was = off;
    if (pointer.down && !finished) off = Math.max(-34, Math.min(34, offAt + (pointer.x - pressX)));
    else if (keyDir !== 0) {
      off += keyDir * 18;
      if (Math.abs(off) > 30) keyDir = 0;
      off = Math.max(-34, Math.min(34, off));
    } else off *= Math.exp(-dt * 6);
    const inst = Math.abs(off - was) / Math.max(dt, 1e-3);
    vel += (inst - vel) * Math.min(1, dt * 4);
    if (!finished) {
      for (let j = 0; j < N; j++) {
        if (lost[j]) continue;
        if (fall[j]! > 0) {
          fall[j]! += dt * 4;
          if (fall[j]! >= 1) {
            fall[j] = 0;
            lvl[j]!++;
          }
          continue;
        }
        hop[j] = Math.max(0, hop[j]! - dt * 20);
        if (vel > GOOD * 0.5 && Math.random() < dt * 6) hop[j] = Math.min(6, vel / 40) * (0.5 + seed[j]!);
        gx[j]! += (Math.random() - 0.5) * dt * vel * 0.01;
        gx[j] = Math.max(-0.95, Math.min(0.95, gx[j]!));
        const d = lvl[j]!;
        if (d < D && parts[gp[j]!]!.value < meshes[d]! && vel > GOOD) {
          // Smaller than the holes: through it goes, the faster for a firmer shake — but the holes take only so many.
          const rate = Math.min(1.6, ((vel - GOOD) / GOOD) * 1.2) * (1 - parts[gp[j]!]!.value / meshes[d]!);
          if (Math.random() < dt * rate) fall[j] = 0.001;
        }
        // Too hard: grains jump the frame, from the edges first.
        if (
          d < D &&
          vel > SPILL &&
          Math.random() < dt * ((vel - SPILL) / SPILL) * (Math.abs(gx[j]!) > 0.7 ? 2.4 : 0.8)
        ) {
          lost[j] = 1;
          const i = fnext++ % FN;
          const side = gx[j]! < 0 ? -1 : 1;
          fxs[i] = X0 + off + ((gx[j]! + 1) / 2) * XW;
          fys[i] = levelY(d) - 4;
          fvx[i] = side * (60 + Math.random() * 80);
          fvy[i] = -60 - Math.random() * 60;
          fl[i] = 0.9;
          fc[i] = gp[j]!;
        }
      }
      // Nothing left to fall: it's sorted.
      let moving = false;
      for (let j = 0; j < N; j++) if (!lost[j] && (fall[j]! > 0 || lvl[j]! < home[gp[j]!]!)) moving = true;
      if (!moving) finish();
      if (t >= timeLimit) finish();
    }

    // ---- Draw ----
    ui.top(1 - t / timeLimit);
    for (let d = 0; d <= D; d++) {
      const y = levelY(d);
      const x0 = X0 + (d < D ? off : off * 0.3);
      // The frame and its mesh (or the pan).
      g.fillStyle = '#5a3d22';
      g.fillRect(x0 - 6, y - 16, 6, 20);
      g.fillRect(x0 + XW, y - 16, 6, 20);
      if (d < D) {
        g.strokeStyle = '#a8a29a';
        g.lineWidth = 1;
        g.setLineDash([Math.max(1.5, 5 - meshes[d]!), Math.max(1, meshes[d]! * 1.2)]);
        g.beginPath();
        g.moveTo(x0, y + 2);
        g.lineTo(x0 + XW, y + 2);
        g.stroke();
        g.setLineDash([]);
        text(g, `${meshes[d]!} mm`, x0 + XW + 10, y - 4, { size: 8, color: PAL.faint, align: 'left' });
      } else {
        g.fillStyle = '#3a3e44';
        g.fillRect(x0, y, XW, 4);
        text(g, 'pan', x0 + XW + 10, y - 4, { size: 8, color: PAL.faint, align: 'left' });
      }
      if (d === home[want]!) {
        g.strokeStyle = 'rgba(233,196,106,0.45)';
        g.lineWidth = 1;
        g.strokeRect(x0 - 8, y - 20, XW + 16, 26);
      }
    }
    // Grains.
    for (let j = 0; j < N; j++) {
      if (lost[j]) continue;
      const d = lvl[j]!;
      const base = levelY(d) + (fall[j]! > 0 ? (levelY(d + 1) - levelY(d)) * fall[j]! : 0);
      const x0 = X0 + (d < D ? off : off * 0.3);
      const x = x0 + ((gx[j]! + 1) / 2) * XW;
      const size = Math.max(1.5, Math.min(6, 2 + Math.log10(parts[gp[j]!]!.value * 10 + 1) * 1.6));
      g.fillStyle = parts[gp[j]!]!.colour;
      g.beginPath();
      g.arc(x, base - size / 2 - hop[j]! - ((seed[j]! * 4) % 4), size / 2, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < FN; i++) {
      if (fl[i]! <= 0) continue;
      fl[i]! -= dt;
      fxs[i]! += fvx[i]! * dt;
      fys[i]! += fvy[i]! * dt;
      fvy[i]! += 300 * dt;
      g.globalAlpha = Math.max(0, fl[i]!);
      g.fillStyle = parts[fc[i]!]!.colour;
      g.fillRect(fxs[i]! - 1.5, fys[i]! - 1.5, 3, 3);
    }
    g.globalAlpha = 1;
    // Panel: the shake gauge, purity, kept.
    const bx = PANEL_X + 2;
    const bw = W - PANEL_X - 12;
    const maxV = SPILL * 1.4;
    text(g, 'Shake', bx, 30, { size: 9, color: PAL.dim, align: 'left' });
    text(g, `${Math.round(vel * 0.25)} cm/s`, W - 10, 30, {
      size: 9.5,
      color: vel > SPILL ? PAL.bad : PAL.ink,
      align: 'right',
      bold: true,
    });
    g.fillStyle = '#2a2318';
    g.fillRect(bx, 37, bw, 8);
    g.fillStyle = 'rgba(125,255,154,0.35)';
    g.fillRect(bx + (bw * GOOD) / maxV, 37, (bw * (SPILL - GOOD)) / maxV, 8);
    g.fillStyle = 'rgba(255,106,90,0.45)';
    g.fillRect(bx + (bw * SPILL) / maxV, 37, bw - (bw * SPILL) / maxV, 8);
    g.fillStyle = PAL.ink;
    g.fillRect(bx + Math.min(bw, (bw * vel) / maxV) - 1, 34, 2, 14);
    text(g, 'sifts', bx + (bw * GOOD) / maxV + 2, 53, { size: 7.5, color: PAL.faint, align: 'left' });
    text(g, 'spills', bx + bw, 53, { size: 7.5, color: '#ff8a7a', align: 'right' });
    const s = stats();
    ui.meter(
      72,
      `Clean ${parts[want]!.name.toLowerCase()}`,
      pct(s.purity),
      s.purity,
      p.purity,
      s.purity >= p.purity,
    );
    ui.meter(100, `${parts[want]!.name} kept`, pct(s.kept), s.kept, p.keep ?? 0.6, s.kept >= (p.keep ?? 0.6));
    parts.forEach((pt, i) => {
      g.fillStyle = pt.colour;
      g.beginPath();
      g.arc(bx + 3, 131 + i * 13, 3, 0, Math.PI * 2);
      g.fill();
      text(g, `${pt.name}, ${pt.value} mm`, bx + 10, 131 + i * 13, {
        size: 8.5,
        color: PAL.dim,
        align: 'left',
      });
    });
    ui.button('Done', finished);
    const hint = host.guided && !finished ? (p.words.hint ?? 'Drag side to side to shake') : '';
    ui.status(hint || 'drag side to side (or ← →) · Enter when it’s sorted', !!hint);
  }

  return { update, dispose: ui.dispose };
}

// ---- Distil ---------------------------------------------------------------------------------------
