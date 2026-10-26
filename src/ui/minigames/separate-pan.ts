import type { Minigame, MinigameHost } from './types.ts';
import { validateSeparation, type SeparateParams } from './separate-data.ts';
import { text, PAL } from './kit.ts';
import { W, PANEL_X, pct, glowSprite, frame, counts, judge } from './separate-drawing.ts';
export function createPan(host: MinigameHost, p: SeparateParams): Minigame {
  validateSeparation(p);
  // The target is validated; per-part buffers mirror parts. Particle loops are bounded by their allocated pool size.
  const parts = p.parts;
  const timeLimit = p.time ?? 35;
  const want = p.want;
  // The swirl (turns a second) at which water carries each part off its bed.
  const carry = parts.map((pt) => 0.42 * Math.pow(Math.max(0.05, pt.value - 1), 0.4));
  const n = counts(parts, 110);
  const N = n.reduce((a, b) => a + b, 0);
  const gp = new Uint8Array(N); // part
  const gr = new Float32Array(N); // radius (0–1 of the pan)
  const ga = new Float32Array(N); // angle
  const gone = new Uint8Array(N);
  const seed = new Float32Array(N);
  {
    let k = 0;
    n.forEach((cnt, i) => {
      for (let j = 0; j < cnt; j++, k++) {
        gp[k] = i;
        gr[k] = Math.sqrt(Math.random()) * 0.72;
        ga[k] = Math.random() * Math.PI * 2;
        seed[k] = Math.random();
      }
    });
  }
  const wantTotal = n[want]!;
  // Where the others start to wash away: the gauge's green band.
  let lightest = Infinity;
  let heaviestOther = 0;
  carry.forEach((c, i) => {
    if (i === want) return;
    lightest = Math.min(lightest, c);
    heaviestOther = Math.max(heaviestOther, c);
  });
  const CX = 118;
  const CY = 112;
  const R = 80;
  let t = 0;
  let omega = 0; // rad/s, smoothed
  let lastAng = 0;
  let had = false;
  let swirlAng = 0;
  let finished = false;
  // Splashes over the rim.
  const SN = 40;
  const sx = new Float32Array(SN);
  const sy = new Float32Array(SN);
  const svx = new Float32Array(SN);
  const svy = new Float32Array(SN);
  const sl = new Float32Array(SN);
  const sc = new Uint8Array(SN);
  let sn = 0;
  const sparkle = glowSprite(255, 230, 120);

  const ui = frame(host, p, {});
  const g = ui.g;
  const pointer = ui.pointer;

  const left = (i: number): number => {
    let k = 0;
    for (let j = 0; j < N; j++) if (!gone[j] && gp[j]! === i) k++;
    return k;
  };
  const stats = (): { purity: number; kept: number } => {
    let all = 0;
    let w = 0;
    for (let j = 0; j < N; j++)
      if (!gone[j]) {
        all++;
        if (gp[j]! === want) w++;
      }
    return { purity: all ? w / all : 0, kept: w / wantTotal };
  };

  function finish(): void {
    if (finished || ui.end.finished()) return;
    finished = true;
    const s = stats();
    const q = judge(p, s.purity, s.kept);
    const wn = parts[want]!.name.toLowerCase();
    const principle = p.words.principle ? ` ${p.words.principle}` : '';
    if (s.kept < (p.keep ?? 0.6))
      return ui.end.finish(
        0,
        `Swirled too hard: ${s.kept <= 0 ? 'all' : pct(1 - s.kept)} of the ${wn} washed out with the rest — even heavy grains lift in fast water.`,
      );
    if (s.purity < p.purity)
      return ui.end.finish(
        0,
        `Still only ${pct(s.purity)} ${wn}: swirl harder, so the water lifts the lighter grains over the rim.`,
      );
    if (q === 2)
      return ui.end.finish(
        2,
        `${pct(s.purity)} ${wn}, ${pct(s.kept)} of it kept: the light grains washed away, the heavy stayed.${principle}`,
      );
    return ui.end.finish(
      1,
      `${pct(s.purity)} ${wn} with ${pct(s.kept)} kept — ${s.kept < 0.85 ? 'a gentler swirl loses less' : 'a little more swirling would wash out the rest'}.`,
    );
  }
  ui.setDone(finish);

  function update(dt: number): void {
    t += dt;
    // The swirl: how fast the hand goes round the pan's middle.
    if (pointer.down && !finished) {
      const a = Math.atan2(pointer.y - CY, pointer.x - CX);
      if (had) {
        let d = a - lastAng;
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        const inst = Math.hypot(pointer.x - CX, pointer.y - CY) > 12 ? d / Math.max(dt, 1e-3) : 0;
        omega += (inst - omega) * Math.min(1, dt * 5);
      }
      lastAng = a;
      had = true;
    } else {
      had = false;
      omega *= Math.exp(-dt * 2.2);
    }
    const turns = Math.abs(omega) / (Math.PI * 2);
    swirlAng += omega * 0.6 * dt;
    // Grains: lifted outwards while the water is faster than they can hold, else settling to the middle.
    for (let j = 0; j < N; j++) {
      if (gone[j]) continue;
      const c = carry[gp[j]!]!;
      if (turns > c) {
        // Out towards the rim, the faster the more the water outruns what holds it down.
        gr[j]! += (0.15 + 1.2 * Math.pow(turns - c, 1.2)) * dt * (0.6 + seed[j]! * 0.8);
        ga[j]! += omega * 0.45 * dt;
        if (gr[j]! > 1) {
          gone[j] = 1;
          const ang = ga[j]!;
          const i = sn++ % SN;
          sx[i] = CX + Math.cos(ang) * R;
          sy[i] = CY + Math.sin(ang) * R;
          svx[i] = Math.cos(ang) * 40 - Math.sin(ang) * omega * 6;
          svy[i] = Math.sin(ang) * 40 + Math.cos(ang) * omega * 6;
          sl[i] = 0.6;
          sc[i] = gp[j]!;
        }
      } else if (gr[j]! > 0.08 + seed[j]! * 0.25) gr[j]! -= dt * 0.035 * Math.sqrt(parts[gp[j]!]!.value);
    }
    // You decide when it's clean (as panners do); the light fails at the end.
    if (!finished && t >= timeLimit) finish();

    // ---- Draw ----
    ui.top(1 - t / timeLimit);
    // The pan: steel, its rim, the water.
    g.fillStyle = '#2f3236';
    g.beginPath();
    g.arc(CX, CY, R + 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#4a4e54';
    g.beginPath();
    g.arc(CX, CY, R + 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3a3e44';
    g.beginPath();
    g.arc(CX, CY, R, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(70,130,180,0.35)';
    g.beginPath();
    g.arc(CX, CY, R - 2, 0, Math.PI * 2);
    g.fill();
    // Grains (gold sparkles).
    for (let j = 0; j < N; j++) {
      if (gone[j]) continue;
      const x = CX + Math.cos(ga[j]!) * gr[j]! * R;
      const y = CY + Math.sin(ga[j]!) * gr[j]! * R;
      const pt = gp[j]!;
      g.fillStyle = parts[pt]!.colour;
      const s = pt === want ? 3 : 2.4;
      g.fillRect(x - s / 2, y - s / 2, s, s);
      if (pt === want && Math.floor(t * 3 + seed[j]! * 10) % 7 === 0) {
        g.globalAlpha = 0.7;
        g.drawImage(sparkle, x - 5, y - 5, 10, 10);
        g.globalAlpha = 1;
      }
    }
    // The swirl in the water.
    g.strokeStyle = `rgba(190,225,255,${Math.min(0.5, 0.08 + turns * 0.18)})`;
    g.lineWidth = 1.2;
    for (let k = 0; k < 5; k++) {
      const r = R * (0.3 + k * 0.14);
      const a0 = swirlAng * (1.2 - k * 0.12) + k * 1.3;
      g.beginPath();
      g.arc(CX, CY, r, a0, a0 + 0.8);
      g.stroke();
    }
    // Splashes.
    for (let i = 0; i < SN; i++) {
      if (sl[i]! <= 0) continue;
      sl[i]! -= dt;
      sx[i]! += svx[i]! * dt;
      sy[i]! += svy[i]! * dt;
      g.globalAlpha = Math.max(0, sl[i]! / 0.6);
      g.fillStyle = sc[i]! === want ? parts[want]!.colour : 'rgba(170,210,255,0.9)';
      g.fillRect(sx[i]! - 1, sy[i]! - 1, 2, 2);
    }
    g.globalAlpha = 1;
    // Ghost hint: an arrow round the pan.
    if (host.guided && t < 8 && !pointer.down) {
      g.strokeStyle = `rgba(233,196,106,${0.35 + 0.2 * Math.sin(t * 4)})`;
      g.lineWidth = 2;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.arc(CX, CY, R * 0.6, t * 2, t * 2 + 4.5);
      g.stroke();
      g.setLineDash([]);
    }
    // The panel: swirl gauge, purity, kept.
    const bx = PANEL_X + 2;
    const bw = W - PANEL_X - 12;
    const maxT = carry[want]! * 1.6;
    text(g, 'Swirl', bx, 30, { size: 9, color: PAL.dim, align: 'left' });
    text(g, `${turns.toFixed(1)} turns/s`, W - 10, 30, {
      size: 9.5,
      color: PAL.ink,
      align: 'right',
      bold: true,
    });
    g.fillStyle = '#2a2318';
    g.fillRect(bx, 37, bw, 8);
    g.fillStyle = 'rgba(125,255,154,0.35)';
    g.fillRect(bx + (bw * lightest) / maxT, 37, (bw * (carry[want]! - lightest)) / maxT, 8);
    g.fillStyle = 'rgba(255,106,90,0.45)';
    g.fillRect(bx + (bw * carry[want]!) / maxT, 37, bw - (bw * carry[want]!) / maxT, 8);
    g.fillStyle = 'rgba(125,255,154,0.6)';
    g.fillRect(bx + (bw * heaviestOther) / maxT, 37, 1, 8);
    g.fillStyle = PAL.ink;
    g.fillRect(bx + Math.min(bw, (bw * turns) / maxT) - 1, 34, 2, 14);
    text(g, 'stays', bx + 4, 53, { size: 7.5, color: PAL.faint, align: 'left' });
    text(g, `${parts[want]!.name.toLowerCase()} washes`, bx + bw, 53, {
      size: 7.5,
      color: '#ff8a7a',
      align: 'right',
    });
    const s = stats();
    ui.meter(72, `${parts[want]!.name} in the pan`, pct(s.purity), s.purity, p.purity, s.purity >= p.purity);
    ui.meter(100, `${parts[want]!.name} kept`, pct(s.kept), s.kept, p.keep ?? 0.6, s.kept >= (p.keep ?? 0.6));
    // What's left, by part.
    parts.forEach((pt, i) => {
      g.fillStyle = pt.colour;
      g.fillRect(bx, 128 + i * 13, 6, 6);
      text(g, `${pt.name}: ${left(i)} of ${n[i]!}`, bx + 10, 131 + i * 13, {
        size: 8.5,
        color: PAL.dim,
        align: 'left',
      });
    });
    ui.button('Done', finished, s.purity >= p.purity && s.kept >= (p.keep ?? 0.6));
    const hint = host.guided && !finished ? (p.words.hint ?? 'Hold and swirl round the pan') : '';
    ui.status(hint || 'hold and swirl round the pan · Enter when it’s clean', !!hint);
  }

  return { update, dispose: ui.dispose };
}

// ---- Sieve ----------------------------------------------------------------------------------------
