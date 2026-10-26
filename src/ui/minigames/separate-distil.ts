import type { Minigame, MinigameHost } from './types.ts';
import { validateSeparation, type SeparateParams } from './separate-data.ts';
import { text, rrect, PAL } from './kit.ts';
import { W, PANEL_X, inBox, pct, glowSprite, frame, judge, type Box } from './separate-drawing.ts';
export function createDistil(host: MinigameHost, p: SeparateParams): Minigame {
  validateSeparation(p);
  // The target is validated; per-part buffers mirror parts. Particle loops are bounded by their allocated pool size.
  const parts = p.parts;
  const timeLimit = p.time ?? 35;
  const want = p.want;
  const total = 500; // ml in the pot
  const sum = parts.reduce((s, pt) => s + pt.share, 0) || 1;
  const pot = parts.map((pt) => (pt.share / sum) * total);
  const jarKeep = parts.map(() => 0);
  const jarWaste = parts.map(() => 0);
  const wantStart = pot[want]!;
  const cuts = parts.some((pt) => pt.value < parts[want]!.value);
  const bpMax = Math.max(...parts.map((pt) => pt.value));
  const tMax = bpMax + 25; // past this the pot boils over
  const tTop = tMax + 10;
  const AMB = 20;
  // Heat scales with the mixture's range, so a hotter still feels the same in the hand.
  const sc = (tMax - AMB) / 105;
  let T = AMB;
  let stoke = false;
  let toKeep = !cuts; // where the drips go
  let t = 0;
  let finished = false;
  let boilRate = 0;
  let dripT = 0;
  const flame = glowSprite(255, 150, 60);
  const ui = frame(host, p, {
    down: (pt) => {
      if (cuts && inBox(jarBox, pt.x, pt.y)) toKeep = !toKeep;
      else stoke = true;
    },
    up: () => (stoke = false),
    key: (e, d) => {
      if (e.key === ' ') {
        stoke = d;
        return true;
      }
      if (cuts && (e.key === 'Tab' || e.key === 's')) {
        if (d && !e.repeat) toKeep = !toKeep;
        return true;
      }
      return false;
    },
  });
  const g = ui.g;
  const jarBox: Box = { x: 154, y: 140, w: 82, h: 56 };

  const stats = (): { purity: number; kept: number; ml: number } => {
    const ml = jarKeep.reduce((a, b) => a + b, 0);
    return { purity: ml > 0 ? jarKeep[want]! / ml : 0, kept: jarKeep[want]! / wantStart, ml };
  };

  function finish(why?: string): void {
    if (finished || ui.end.finished()) return;
    finished = true;
    stoke = false;
    if (why) return ui.end.finish(0, why);
    const s = stats();
    const q = judge(p, s.purity, s.kept);
    const wn = parts[want]!.name.toLowerCase();
    const principle = p.words.principle ? ` ${p.words.principle}` : '';
    const hotter = parts.filter((pt) => pt.value > parts[want]!.value).sort((a, b) => a.value - b.value)[0];
    if (s.kept < (p.keep ?? 0.6))
      return ui.end.finish(
        0,
        `Only ${Math.round(jarKeep[want]!)} ml of ${wn} caught: it boils at ${parts[want]!.value} °C — the fire must hold that heat.`,
      );
    if (s.purity < p.purity) {
      const dirt = parts
        .map((_, i) => (i === want ? -1 : jarKeep[i]!))
        .reduce((bi, v, i, arr) => (v > arr[bi]! ? i : bi), want === 0 ? 1 : 0);
      const tooHot = parts[dirt]!.value > parts[want]!.value;
      return ui.end.finish(
        0,
        tooHot
          ? `${pct(s.purity)} ${wn}: past ${parts[dirt]!.value} °C the ${parts[dirt]!.name.toLowerCase()} boiled off too.`
          : `${pct(s.purity)} ${wn}: the ${parts[dirt]!.name.toLowerCase()} boils first, at ${parts[dirt]!.value} °C — catch it in the other jar.`,
      );
    }
    if (q === 2)
      return ui.end.finish(
        2,
        `${Math.round(s.ml)} ml at ${pct(s.purity)} ${wn}: held between ${parts[want]!.value} and ${hotter ? hotter.value : tMax} °C.${principle}`,
      );
    return ui.end.finish(
      1,
      `${pct(s.purity)} ${wn}, ${pct(s.kept)} caught — ${s.kept < 0.85 ? 'hold the heat a little longer' : `keep it further below ${hotter?.value ?? tMax} °C`}.`,
    );
  }
  ui.setDone(() => finish());

  function update(dt: number): void {
    t += dt;
    if (!finished) {
      // Heat in from the fire, out to the air, and into boiling — which holds the heat near a boiling point.
      const inHeat = stoke ? 22 * sc : 0;
      boilRate = 0;
      let cool = 0;
      for (let i = 0; i < parts.length; i++) {
        if (pot[i]! <= 0.01) continue;
        const f = Math.max(0, Math.min(2.2, (T - parts[i]!.value + 3 * sc) / (5 * sc)));
        const ml = Math.min(pot[i]!, 0.12 * pot[i]! * f * (stoke ? 1.15 : 0.7) * dt);
        pot[i]! -= ml;
        if (toKeep) jarKeep[i]! += ml;
        else jarWaste[i]! += ml;
        boilRate += ml / dt;
        cool += (ml / dt) * 0.5 * sc;
      }
      T += (inHeat - 0.12 * (T - AMB) - cool) * dt;
      T = Math.max(AMB, Math.min(tTop, T));
      if (T >= tMax)
        finish(
          `The pot boiled over at ${Math.round(T)} °C: too much fire — hold the heat between the boiling points.`,
        );
      if (pot[want]! < wantStart * 0.03 && !finished) finish();
      if (t >= timeLimit) finish();
    }
    dripT += dt * Math.min(12, boilRate * 0.6);
    const spoutX = cuts ? (toKeep ? 213 : 175) : 178;

    // ---- Draw ----
    ui.top(1 - t / timeLimit);
    // The fire under the pot.
    const fireX = 64;
    const fireY = 176;
    g.globalAlpha = 0.35 + (stoke ? 0.5 : 0.15);
    g.drawImage(flame, fireX - 34, fireY - 28, 68, 40);
    g.globalAlpha = 1;
    for (let k = 0; k < 5; k++) {
      const fx = fireX - 20 + k * 10;
      const fh = (stoke ? 14 : 6) + Math.sin(t * 12 + k * 1.7) * 3;
      g.fillStyle = stoke ? '#ffb040' : '#c8602a';
      g.beginPath();
      g.moveTo(fx - 4, fireY);
      g.quadraticCurveTo(fx, fireY - fh * 1.4, fx + 4, fireY);
      g.fill();
    }
    g.fillStyle = '#3a2a1a';
    g.fillRect(fireX - 28, fireY, 56, 6);
    // The pot: its liquid, bubbling as it boils.
    const potX = 64;
    const potY = 128;
    g.fillStyle = '#7a4a22';
    g.beginPath();
    g.ellipse(potX, potY, 34, 30, 0, 0, Math.PI * 2);
    g.fill();
    const level = pot.reduce((a, b) => a + b, 0) / total;
    g.save();
    g.beginPath();
    g.ellipse(potX, potY, 30, 26, 0, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#2a1a10';
    g.fillRect(potX - 31, potY - 27, 62, 54);
    const ly = potY + 26 - 52 * level;
    g.fillStyle = parts[parts.length - 1]!.colour;
    g.globalAlpha = 0.55;
    g.fillRect(potX - 31, ly, 62, 60);
    g.globalAlpha = 1;
    if (boilRate > 0.5)
      for (let k = 0; k < 6; k++) {
        const bx = potX - 22 + ((k * 13 + t * 20) % 44);
        const by = ly + 4 + ((k * 7 + t * 30) % 12);
        g.strokeStyle = 'rgba(255,255,255,0.6)';
        g.beginPath();
        g.arc(bx, by, 1.5 + (k % 3), 0, Math.PI * 2);
        g.stroke();
      }
    g.restore();
    // The pipe to the cooling coil, and the drips.
    g.strokeStyle = '#b87a3a';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(potX + 10, potY - 28);
    g.quadraticCurveTo(potX + 20, potY - 64, 130, 66);
    g.lineTo(160, 70);
    g.stroke();
    // A tub of cold water with the coil inside.
    g.fillStyle = 'rgba(70,130,180,0.35)';
    g.fillRect(150, 60, 56, 54);
    g.strokeStyle = '#8a8a8a';
    g.lineWidth = 1;
    g.strokeRect(150, 60, 56, 54);
    g.strokeStyle = '#c27a3e';
    g.lineWidth = 2;
    g.beginPath();
    for (let k = 0; k <= 6; k++) g.lineTo(162 + (k % 2) * 32, 70 + k * 6);
    g.lineTo(178, 118);
    g.lineTo(178, 128);
    g.stroke();
    if (boilRate > 0.2) {
      // Steam wisps at the pot, drips at the spout.
      g.fillStyle = 'rgba(230,240,255,0.25)';
      for (let k = 0; k < 3; k++) {
        const wy = (t * 30 + k * 12) % 30;
        g.beginPath();
        g.arc(potX + 6 + Math.sin(t * 3 + k) * 4, potY - 30 - wy, 4 + wy * 0.15, 0, Math.PI * 2);
        g.fill();
      }
      const dy = (dripT % 1) * 14;
      g.fillStyle = toKeep ? parts[want]!.colour : '#aaa';
      g.beginPath();
      g.arc(spoutX, 132 + dy, 1.8, 0, Math.PI * 2);
      g.fill();
    }
    if (cuts) {
      // The spout swings over the jar in use.
      g.strokeStyle = '#c27a3e';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(178, 127);
      g.lineTo(spoutX, 131);
      g.stroke();
    }
    // The jars: what's caught, layered by part.
    const drawJar = (x: number, jar: number[], label: string, active: boolean): void => {
      g.strokeStyle = active ? PAL.gold : '#6f6450';
      g.lineWidth = active ? 1.6 : 1;
      g.strokeRect(x, 150, 30, 40);
      let y = 190;
      for (let i = 0; i < parts.length; i++) {
        const h = Math.min(40, (jar[i]! / total) * 120);
        if (h <= 0) continue;
        g.fillStyle = parts[i]!.colour;
        g.globalAlpha = 0.8;
        g.fillRect(x + 1, y - h, 28, h);
        g.globalAlpha = 1;
        y -= h;
      }
      text(g, label, x + 15, 197, { size: 8, color: active ? PAL.gold : PAL.faint });
    };
    if (cuts) {
      drawJar(160, jarWaste, 'waste', !toKeep);
      drawJar(198, jarKeep, 'keep', toKeep);
      text(g, 'click a jar to switch', 152, 196, { size: 7.5, color: PAL.faint, align: 'right' });
    } else drawJar(163, jarKeep, `${Math.round(jarKeep.reduce((a, b) => a + b, 0))} ml`, true);
    // The thermometer, with each part's boiling point marked.
    const thX = PANEL_X + 8;
    const thTop = 28;
    const thBot = 150;
    const yOf = (v: number): number => thBot - ((v - AMB) / (tTop - AMB)) * (thBot - thTop);
    g.fillStyle = '#2a2318';
    rrect(g, thX - 4, thTop - 3, 8, thBot - thTop + 6, 4);
    g.fill();
    g.fillStyle = T >= tMax - 8 ? PAL.bad : '#e04a3a';
    g.fillRect(thX - 2, yOf(T), 4, thBot - yOf(T));
    g.beginPath();
    g.arc(thX, thBot + 5, 5.5, 0, Math.PI * 2);
    g.fill();
    for (const [i, pt] of parts.entries()) {
      const y = yOf(pt.value);
      g.fillStyle = i === want ? PAL.good : PAL.dim;
      g.fillRect(thX + 5, y, 7, 1.2);
      text(g, `${pt.name} ${pt.value}°`, thX + 15, y, {
        size: 8.5,
        color: i === want ? PAL.good : PAL.dim,
        align: 'left',
      });
    }
    g.fillStyle = 'rgba(255,106,90,0.5)';
    g.fillRect(thX + 5, yOf(tMax), 7, 1.2);
    text(g, 'boils over', thX + 15, yOf(tMax), { size: 8, color: '#ff8a7a', align: 'left' });
    text(g, `${Math.round(T)} °C`, W - 10, 166, { size: 11, color: PAL.ink, align: 'right', bold: true });
    const s = stats();
    text(g, `${pct(s.purity)} ${parts[want]!.name.toLowerCase()}`, PANEL_X + 2, 166, {
      size: 9,
      color: s.purity >= p.purity ? PAL.good : PAL.dim,
      align: 'left',
    });
    ui.button('Done', finished);
    const hint = host.guided && !finished ? (p.words.hint ?? 'Hold to stoke the fire') : '';
    ui.status(
      hint || `hold to stoke (or Space)${cuts ? ' · click the jar to switch' : ''} · Enter when done`,
      !!hint,
    );
  }

  return { update, dispose: ui.dispose };
}

// ---- Zone refining --------------------------------------------------------------------------------
