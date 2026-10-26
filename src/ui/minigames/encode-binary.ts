import type { Minigame, MinigameHost } from './types.ts';
import type { EncodeParams, EncodeBinary } from './encode-data.ts';
import { finisher, text, rrect, PAL } from './kit.ts';
import { W, H, inBox, topLine, button, glowSprite, setup, type Box } from './encode-drawing.ts';
export function createBinary(host: MinigameHost, p: EncodeParams): Minigame {
  if (!p.binary) throw new Error('encode: binary mode needs `binary`');
  const B: EncodeBinary = p.binary;
  if (B.targets.length === 0) throw new Error('Binary needs at least one target');
  // cur advances only on success; drawing clamps to the final target after completion.
  const end = finisher(host);
  const timeLimit = p.time ?? 40;
  const n = Math.max(1, Math.min(8, B.bits));
  const bits = new Uint8Array(n); // bits[0] is the biggest place
  const place = (i: number): number => 1 << (n - 1 - i);
  let t = 0;
  let cur = 0;
  let flips = 0;
  let extra = 0;
  let startState = 0;
  let flash = 0;
  let done = false;
  const spacing = Math.min(52, 300 / n);
  const bx0 = W / 2 - (spacing * (n - 1)) / 2;
  const sendBtn: Box = { x: W - 82, y: 176, w: 74, h: 26 };
  const lamp = glowSprite(255, 214, 120);

  const value = (): number => {
    let v = 0;
    for (let i = 0; i < n; i++) if (bits[i]!) v += place(i);
    return v;
  };
  const state = (): number => value();
  const sumText = (v: number): string => {
    const parts: number[] = [];
    for (let i = 0; i < n; i++) if (v & place(i)) parts.push(place(i));
    return parts.length ? parts.join(' + ') : '0';
  };
  const pattern = (v: number): string => {
    let s = '';
    for (let i = 0; i < n; i++) s += v & place(i) ? '1' : '0';
    return s;
  };
  const hamming = (a: number, b: number): number => {
    let x = a ^ b;
    let c = 0;
    while (x) {
      c += x & 1;
      x >>= 1;
    }
    return c;
  };

  function flip(i: number): void {
    if (done || end.finished() || i < 0 || i >= n) return;
    bits[i]! ^= 1;
    flips++;
  }

  function send(): void {
    if (done || end.finished()) return;
    const tg = B.targets[cur]!;
    const v = value();
    const principle = p.words.principle ? ` ${p.words.principle}` : '';
    if (v !== tg.value) {
      done = true;
      end.finish(
        0,
        `Sent ${pattern(v)} = ${v} (${sumText(v)}), not ${tg.value} (${sumText(tg.value)}).${principle}`,
      );
      return;
    }
    extra += flips - hamming(startState, tg.value);
    flips = 0;
    flash = 1;
    cur++;
    startState = state();
    if (cur >= B.targets.length) {
      done = true;
      if (extra <= 0)
        end.finish(2, `${pattern(v)} is ${sumText(v)} = ${v}: not one wasted flip.${principle}`);
      else
        end.finish(
          1,
          `All right, with ${extra} flip${extra === 1 ? '' : 's'} more than needed — try the biggest place that fits first.`,
        );
    }
  }

  const switchAt = (x: number, y: number): number => {
    if (y < 64 || y > 150) return -1;
    const i = Math.round((x - bx0) / spacing);
    return i >= 0 && i < n && Math.abs(x - (bx0 + i * spacing)) < spacing * 0.45 ? i : -1;
  };

  const ui = setup(host, p.words.goal, {
    down: (pt) => {
      if (inBox(sendBtn, pt.x, pt.y)) send();
      else flip(switchAt(pt.x, pt.y));
    },
    key: (e, d) => {
      const k = e.key;
      if (k === 'Enter') {
        if (d) send();
        return true;
      }
      if (k >= '1' && k <= '8' && Number(k) <= n) {
        if (d && !e.repeat) flip(Number(k) - 1);
        return true;
      }
      return false;
    },
  });
  const g = ui.g;
  const pointer = ui.pointer;

  function update(dt: number): void {
    t += dt;
    flash = Math.max(0, flash - dt * 2);
    if (!done && !end.finished() && t >= timeLimit) {
      done = true;
      end.finish(0, `The order board closed with ${cur} of ${B.targets.length} sent.`);
    }
    g.fillStyle = PAL.bg;
    g.fillRect(0, 0, W, H);
    topLine(g, p.words.goal, ui.goalSize, 1 - t / timeLimit);
    const tg = B.targets[Math.min(cur, B.targets.length - 1)]!;
    // The order.
    text(g, done && cur >= B.targets.length ? 'All sent' : `Make ${tg.value}`, W / 2, 30, {
      size: 16,
      color: PAL.gold,
      bold: true,
    });
    if (tg.label && !(done && cur >= B.targets.length))
      text(g, tg.label, W / 2, 46, { size: 10, color: PAL.dim });
    // Orders so far.
    for (let k = 0; k < B.targets.length; k++) {
      const x = 14 + k * 16;
      g.fillStyle = k < cur ? PAL.good : k === cur ? PAL.gold : '#4a3f2e';
      g.beginPath();
      g.arc(x, 30, 4, 0, Math.PI * 2);
      g.fill();
    }
    // The switches: lamp, switch, its place's worth.
    const v = value();
    for (let i = 0; i < n; i++) {
      const x = bx0 + i * spacing;
      const on = bits[i]! === 1;
      if (on) g.drawImage(lamp, x - 22, 78 - 22, 44, 44);
      g.fillStyle = on ? '#fff3b0' : '#3a3632';
      g.beginPath();
      g.arc(x, 78, 9, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#d8c79a';
      g.lineWidth = 1;
      g.stroke();
      // A lever switch.
      const hover = !done && switchAt(pointer.x, pointer.y) === i;
      g.fillStyle = hover ? '#2c241a' : '#1e1912';
      rrect(g, x - 11, 98, 22, 34, 4);
      g.fill();
      g.strokeStyle = hover ? PAL.gold : '#5a4a30';
      g.stroke();
      g.strokeStyle = '#c9a24a';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x, 115);
      g.lineTo(x, on ? 102 : 128);
      g.stroke();
      g.fillStyle = on ? '#c8463a' : '#6f6450';
      g.beginPath();
      g.arc(x, on ? 102 : 128, 3.5, 0, Math.PI * 2);
      g.fill();
      text(g, `${place(i)}`, x, 143, { size: 11, color: on ? PAL.gold : PAL.dim, bold: on });
      if (host.guided && !done) text(g, `${i + 1}`, x + 13, 100, { size: 7, color: PAL.faint });
    }
    // The readout: what the lamps say.
    const okNow = !done && v === tg.value;
    text(g, `${pattern(v)} = ${sumText(v)} = ${v}`, W / 2 - 40, 166, {
      size: 11,
      color: okNow ? PAL.good : PAL.ink,
    });
    button(g, sendBtn, 'Send', { hover: inBox(sendBtn, pointer.x, pointer.y) && !done, size: 11 });
    if (flash > 0) {
      g.globalAlpha = flash;
      text(g, '✓ sent', W / 2, 60, { size: 11, color: PAL.good, bold: true });
      g.globalAlpha = 1;
    }
    const hint =
      host.guided && !done ? (p.words.hint ?? 'Click switches to light places that add up; Enter sends') : '';
    text(g, hint || 'click a switch (or 1–8) · Enter sends', W / 2 - 40, 192, {
      size: 9,
      color: hint ? PAL.gold : PAL.faint,
    });
  }

  return { update, dispose: ui.dispose };
}

// ---- Pixels ---------------------------------------------------------------------------------------
