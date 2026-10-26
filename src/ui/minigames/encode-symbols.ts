import type { Minigame, MinigameHost } from './types.ts';
import type { EncodeParams, EncodeSymbols } from './encode-data.ts';
import { finisher, text, rrect, PAL } from './kit.ts';
import { W, H, inBox, topLine, button, glowSprite, setup, type Box } from './encode-drawing.ts';
export function createSymbols(host: MinigameHost, p: EncodeParams): Minigame {
  if (!p.symbols) throw new Error('encode: symbols mode needs `symbols`');
  const S: EncodeSymbols = p.symbols;
  if (S.book.length === 0 || S.say.length === 0)
    throw new Error('Shutter coding needs a code book and message');
  // cur stays in the message until done, after which drawing clamps to its final item.
  // Book indices come from matching bookBoxes; shutter indices are checked by shutterAt.
  const end = finisher(host);
  const timeLimit = p.time ?? 40;
  const fc = S.cols ?? 2;
  const fr = S.rows ?? 3;
  const nSh = fc * fr;
  const shut = new Uint8Array(nSh); // 1 open (light shows)
  const book = S.book;
  const say = S.say;
  const patOf = (meaning: string): string => book.find((b) => b.meaning === meaning)?.pattern ?? '';
  const meaningOf = (pat: string): string | null => book.find((b) => b.pattern === pat)?.meaning ?? null;
  let t = 0;
  let cur = 0;
  let flips = 0;
  let extra = 0;
  let startPat = '';
  let done = false;
  let flash = 0;
  let sent = '';
  const glow = glowSprite(255, 226, 150);
  const shW = 20;
  const shH = 15;
  const fx = 22;
  const fy = 52;
  const sendBtn: Box = { x: 14, y: 168, w: 70, h: 24 };
  const bookX = 236;
  const bookBoxes: Box[] = book.map((_, i) => ({ x: bookX, y: 32 + i * 20, w: W - bookX - 6, h: 18 }));

  let patStr = '0'.repeat(nSh);
  const pat = (): string => patStr;
  const flipShutter = (i: number): void => {
    shut[i]! ^= 1;
    patStr = Array.from(shut, (v) => (v ? '1' : '0')).join('');
  };
  const hamming = (a: string, b: string): number => {
    let c = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) c++;
    return c;
  };
  startPat = pat();
  const shutterAt = (x: number, y: number): number => {
    const c = Math.floor((x - fx) / (shW + 4));
    const r = Math.floor((y - fy) / (shH + 4));
    return c >= 0 && r >= 0 && c < fc && r < fr ? r * fc + c : -1;
  };

  function next(): void {
    flash = 1;
    cur++;
    startPat = pat();
    flips = 0;
    if (cur >= say.length) {
      done = true;
      const principle = p.words.principle ? ` ${p.words.principle}` : '';
      if (extra <= 0) end.finish(2, `Every word carried, not one shutter wasted.${principle}`);
      else
        end.finish(
          1,
          `Every word carried, with ${extra} shutter move${extra === 1 ? '' : 's'} more than needed — read the book first.`,
        );
    }
  }

  function send(): void {
    if (done || end.finished() || cur >= say.length || say[cur]!.read) return;
    const item = say[cur]!;
    const want = patOf(item.meaning);
    const got = pat();
    sent = got;
    if (got !== want) {
      done = true;
      const reads = meaningOf(got);
      end.finish(
        0,
        `The next tower read ${reads ? `"${reads}"` : 'nonsense'}, not "${item.meaning}": one shutter wrong changes the whole meaning.`,
      );
      return;
    }
    extra += flips - hamming(startPat, want);
    next();
  }

  function pick(i: number): void {
    if (done || end.finished() || cur >= say.length || !say[cur]!.read) return;
    const item = say[cur]!;
    if (book[i]!.meaning !== item.meaning) {
      done = true;
      end.finish(
        0,
        `You read "${book[i]!.meaning}", but the tower said "${item.meaning}": check each shutter against the book.`,
      );
      return;
    }
    next();
  }

  const ui = setup(host, p.words.goal, {
    down: (pt) => {
      if (done || end.finished()) return;
      if (inBox(sendBtn, pt.x, pt.y)) return send();
      const s = shutterAt(pt.x, pt.y);
      if (s >= 0 && !say[cur]!?.read) {
        flipShutter(s);
        flips++;
        return;
      }
      const b = bookBoxes.findIndex((bb) => inBox(bb, pt.x, pt.y));
      if (b >= 0) pick(b);
    },
    key: (e, d) => {
      if (e.key === 'Enter') {
        if (d) send();
        return true;
      }
      return false;
    },
  });
  const g = ui.g;
  const pointer = ui.pointer;

  function drawFrame(x: number, y: number, w: number, h: number, pattern: string, lit: boolean): void {
    g.fillStyle = '#3a2a18';
    g.fillRect(x - 4, y - 4, fc * (w + 4) + 4, fr * (h + 4) + 4);
    for (let i = 0; i < nSh; i++) {
      const c = i % fc;
      const r = Math.floor(i / fc);
      const open = pattern[i] === '1';
      const sx = x + c * (w + 4);
      const sy = y + r * (h + 4);
      if (open && lit) {
        g.globalAlpha = 0.6;
        g.drawImage(glow, sx - w * 0.5, sy - h * 0.6, w * 2, h * 2.2);
        g.globalAlpha = 1;
      }
      g.fillStyle = open ? '#ffe9a8' : '#1a140e';
      g.fillRect(sx, sy, w, h);
      if (!open) {
        // A shut shutter: slats.
        g.strokeStyle = '#4a3a26';
        g.lineWidth = 1;
        g.beginPath();
        for (let k = 1; k < 4; k++) {
          g.moveTo(sx, sy + (h * k) / 4);
          g.lineTo(sx + w, sy + (h * k) / 4);
        }
        g.stroke();
      }
    }
  }

  function update(dt: number): void {
    t += dt;
    flash = Math.max(0, flash - dt * 2);
    if (!done && !end.finished() && t >= timeLimit) {
      done = true;
      end.finish(0, `Night fell with ${cur} of ${say.length} words passed on.`);
    }
    g.fillStyle = PAL.bg;
    g.fillRect(0, 0, W, H);
    topLine(g, p.words.goal, ui.goalSize, 1 - t / timeLimit);
    const item = say[Math.min(cur, say.length - 1)]!;
    const reading = !done && item.read;
    // Your tower's shutters.
    text(g, reading ? 'Your tower' : 'Your shutters', fx + (fc * (shW + 4)) / 2 - 2, 38, {
      size: 9,
      color: PAL.dim,
    });
    drawFrame(fx, fy, shW, shH, pat(), true);
    const hs = shutterAt(pointer.x, pointer.y);
    if (hs >= 0 && !reading && !done) {
      g.strokeStyle = PAL.gold;
      g.lineWidth = 1.5;
      g.strokeRect(
        fx + (hs % fc) * (shW + 4) - 1,
        fy + Math.floor(hs / fc) * (shH + 4) - 1,
        shW + 2,
        shH + 2,
      );
    }
    button(g, sendBtn, 'Send', {
      hover: inBox(sendBtn, pointer.x, pointer.y) && !reading && !done,
      off: !!reading,
      size: 11,
    });
    // The message: what to say, or what to read.
    const mx = 100;
    text(g, 'Message', mx, 38, { size: 9, color: PAL.dim, align: 'left' });
    say.forEach((s, i) => {
      const y = 54 + i * 18;
      const isCur = i === cur && !done;
      const col = i < cur ? PAL.good : isCur ? PAL.gold : PAL.dim;
      text(g, `${i < cur ? '✓' : isCur ? '▸' : '·'} ${s.read ? 'Read' : 'Send'}:`, mx, y, {
        size: 9.5,
        color: col,
        align: 'left',
      });
      text(g, s.read && i >= cur ? '?' : s.meaning, mx + 46, y, {
        size: 9.5,
        color: col,
        align: 'left',
        bold: isCur,
      });
    });
    // The next tower, far off: it shows what it says (reading) or repeats what you sent.
    const tx = 128;
    const ty = 128;
    g.fillStyle = '#2a2016';
    g.fillRect(tx + 12, ty + 30, 14, 40);
    const farPat = reading ? patOf(item.meaning) : sent || '0'.repeat(nSh);
    drawFrame(tx + 4, ty, 10, 7, farPat, true);
    text(g, reading ? 'the next tower says…' : 'the next tower', tx + 60, ty + 40, {
      size: 8,
      color: reading ? PAL.gold : PAL.faint,
      align: 'left',
    });
    // The code book.
    text(g, reading ? 'Code book — click what it says' : 'Code book', bookX, 22, {
      size: 9,
      color: reading ? PAL.gold : PAL.dim,
      align: 'left',
    });
    book.forEach((b, i) => {
      const bb = bookBoxes[i]!;
      const hover = reading && inBox(bb, pointer.x, pointer.y);
      const target = !done && !reading && b.meaning === item.meaning && host.guided;
      g.fillStyle = hover ? '#2c241a' : target ? 'rgba(233,196,106,0.12)' : '#1b1610';
      rrect(g, bb.x, bb.y, bb.w, bb.h, 4);
      g.fill();
      if (hover || target) {
        g.strokeStyle = PAL.gold;
        g.lineWidth = 1;
        g.stroke();
      }
      // A tiny frame of its pattern.
      for (let k = 0; k < nSh; k++) {
        g.fillStyle = b.pattern[k] === '1' ? '#ffe9a8' : '#3a2e20';
        g.fillRect(bb.x + 4 + (k % fc) * 5, bb.y + 2 + Math.floor(k / fc) * 5, 4, 4);
      }
      text(g, b.meaning, bb.x + 8 + fc * 5, bb.y + bb.h / 2 + 0.5, {
        size: 9,
        color: PAL.ink,
        align: 'left',
      });
    });
    if (flash > 0) {
      g.globalAlpha = flash;
      text(g, '✓ passed on', 140, 112, { size: 10, color: PAL.good, bold: true });
      g.globalAlpha = 1;
    }
    const hint =
      host.guided && !done
        ? reading
          ? 'Find the far tower’s shutters in the code book and click it'
          : (p.words.hint ?? 'Click shutters open to match the book, then Send')
        : '';
    text(
      g,
      hint || (reading ? 'match the far shutters to the book' : 'click shutters · Enter sends'),
      228,
      205,
      {
        size: 9,
        color: hint ? PAL.gold : PAL.faint,
      },
    );
  }

  return { update, dispose: ui.dispose };
}
