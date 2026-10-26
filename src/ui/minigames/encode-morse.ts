import type { Minigame, MinigameHost } from './types.ts';
import type { EncodeParams, EncodeMorse } from './encode-data.ts';
import { finisher, text, rrect, PAL } from './kit.ts';
import { W, H, topLine, glowSprite, setup } from './encode-drawing.ts';
/** The international code. */
const MORSE = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
};
const DECODE: Record<string, string> = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

export function createMorse(host: MinigameHost, p: EncodeParams): Minigame {
  if (!p.morse) throw new Error('encode: morse mode needs `morse`');
  const M: EncodeMorse = p.morse;
  const end = finisher(host);
  const timeLimit = p.time ?? 40;
  const unit = M.unit ?? 0.16;
  const tol = M.tolerance ?? 0.5;
  const slips = M.slips ?? 2;
  const letters = M.message
    .toUpperCase()
    .split('')
    .filter((ch): ch is keyof typeof MORSE => Object.hasOwn(MORSE, ch));
  if (letters.length === 0) throw new Error('Morse needs at least one encodable character');
  // cur is below letters.length until done; only owned Morse keys survive the filter.
  const gap = Math.max(2.6 * unit, 0.5); // a pause this long ends a letter
  const PX = 64; // tape px per second
  const PEN = 196; // where the pen writes on the tape

  // Presses on the tape use modulo NP; pN is incremented before an up event can read pN - 1.
  const NP = 64;
  const pDown = new Float32Array(NP);
  const pUp = new Float32Array(NP);
  const pOk = new Int8Array(NP); // 1 part of an accepted letter, -1 of a rejected one, 0 pending
  let pN = 0;
  // Letters decoded on the tape: where and what.
  const marks: { t: number; ch: string; ok: boolean }[] = [];

  let t = 0;
  let down = false;
  let downAt = 0;
  let lastUp = -10;
  let keyed = '';
  let pressStart = 0; // index of the first press of the letter being keyed
  let cur = 0; // the letter being sent
  let mistakes = 0;
  let sloppy = 0;
  let received = '';
  let lastIssue = '';
  let flash = 0;
  let flashOk = true;
  let done = false;
  let sounder = 0; // the sounder arm (1 down)
  const greenGlow = glowSprite(140, 255, 160);

  const issueOf = (got: string, want: string): string => {
    if (got.length < want.length && want.startsWith(got)) return 'a pause in the middle split the letter';
    if (got.length > want.length && got.startsWith(want))
      return 'no pause between letters, so they ran together';
    for (let i = 0; i < Math.min(got.length, want.length); i++) {
      if (got[i] === '.' && want[i] === '-') return 'a dash held too short reads as a dot';
      if (got[i] === '-' && want[i] === '.') return 'a dot held too long reads as a dash';
    }
    return 'the pattern didn’t match the code card';
  };

  function press(on: boolean): void {
    if (done || end.finished()) return;
    if (on && !down) {
      down = true;
      downAt = t;
      pDown[pN % NP] = t;
      pUp[pN % NP] = -1;
      pOk[pN % NP] = 0;
      if (!keyed) pressStart = pN;
      pN++;
      sounder = 1;
    } else if (!on && down) {
      down = false;
      const d = t - downAt;
      pUp[(pN - 1) % NP] = t;
      lastUp = t;
      const dash = d >= 2 * unit;
      keyed += dash ? '-' : '.';
      // Clean: a dot no longer than it should be, a dash near three dots.
      if (dash ? Math.abs(d - 3 * unit) > 3 * unit * tol : d > unit * (1 + tol)) sloppy++;
    }
  }

  function commit(): void {
    const want = MORSE[letters[cur]!];
    const ok = keyed === want;
    const ch = DECODE[keyed] ?? '?';
    for (let i = pressStart; i < pN; i++) pOk[i % NP] = ok ? 1 : -1;
    marks.push({ t: lastUp, ch, ok });
    flash = 1;
    flashOk = ok;
    if (ok) {
      received += ch;
      cur++;
    } else {
      mistakes++;
      lastIssue = issueOf(keyed, want);
      received += ch.toLowerCase();
    }
    keyed = '';
    const msg = letters.join('');
    if (cur >= letters.length) {
      done = true;
      const principle = p.words.principle ? ` ${p.words.principle}` : '';
      if (mistakes === 0 && sloppy <= 1)
        end.finish(2, `Clean dots and dashes: the far station read "${msg}" at once.${principle}`);
      else if (mistakes === 0)
        end.finish(2, `"${msg}" read at once, though some presses wavered.${principle}`);
      else
        end.finish(
          1,
          `"${msg}" got through after ${mistakes} resend${mistakes === 1 ? '' : 's'}: ${lastIssue}.`,
        );
    } else if (mistakes > slips) {
      done = true;
      end.finish(0, `The far station read "${received}" and gave up: ${lastIssue}.`);
    }
  }

  const ui = setup(host, p.words.goal, {
    down: () => press(true),
    up: () => press(false),
    key: (e, d) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (!e.repeat) press(d);
      return true;
    },
  });
  const g = ui.g;

  // The message's letters, laid out once.
  const letterW = Math.min(46, (W - 24) / Math.max(1, letters.length));
  const lx0 = W / 2 - (letterW * letters.length) / 2 + letterW / 2;

  function update(dt: number): void {
    t += dt;
    flash = Math.max(0, flash - dt * 2.5);
    sounder = down ? 1 : Math.max(0, sounder - dt * 12);
    if (!done && !end.finished()) {
      if (!down && keyed && t - lastUp >= gap) commit();
      if (t >= timeLimit) {
        done = true;
        end.finish(
          0,
          `The line closed with "${letters.slice(0, cur).join('')}" of "${letters.join('')}" sent — keep the presses coming.`,
        );
      }
    }

    // ---- Draw ----
    g.fillStyle = PAL.bg;
    g.fillRect(0, 0, W, H);
    topLine(g, p.words.goal, ui.goalSize, 1 - t / timeLimit);
    // The message, with its code under each letter.
    for (let i = 0; i < letters.length; i++) {
      const x = lx0 + i * letterW;
      const isCur = i === cur && !done;
      if (isCur) {
        g.fillStyle = 'rgba(233,196,106,0.12)';
        rrect(g, x - letterW / 2 + 3, 19, letterW - 6, 38, 5);
        g.fill();
        g.strokeStyle = PAL.gold;
        g.lineWidth = 1;
        g.stroke();
      }
      const col = i < cur ? PAL.good : isCur ? PAL.gold : PAL.ink;
      text(g, letters[i]!, x, 31, { size: 16, color: col, bold: true });
      // The code: dots and dashes drawn, not typed.
      const code = MORSE[letters[i]!];
      let wsum = 0;
      for (const s of code) wsum += s === '.' ? 3 : 9;
      wsum += (code.length - 1) * 3;
      let cx = x - wsum / 2;
      g.fillStyle = col;
      for (let k = 0; k < code.length; k++) {
        if (code[k] === '.') {
          g.beginPath();
          g.arc(cx + 1.5, 48, 1.6, 0, Math.PI * 2);
          g.fill();
          cx += 3;
        } else {
          g.fillRect(cx, 47, 9, 2.4);
          cx += 9;
        }
        if (isCur && k < keyed.length) {
          // What you've keyed so far for this letter, under it.
          g.fillStyle = keyed[k] === code[k] ? PAL.good : PAL.bad;
          g.fillRect(cx - (code[k] === '.' ? 3 : 9), 52, code[k] === '.' ? 3 : 9, 1.5);
          g.fillStyle = col;
        }
        cx += 3;
      }
    }
    // The paper tape.
    const ty = 66;
    const th = 30;
    g.fillStyle = '#e6d9b8';
    g.fillRect(0, ty, W, th);
    g.fillStyle = 'rgba(120,90,50,0.18)';
    for (let k = 0; k < 24; k++) {
      const x = (((k * 37 - t * PX) % W) + W) % W;
      g.fillRect(x, ty, 1, th);
    }
    // Ink: every press, dots short and dashes long.
    for (let i = Math.max(0, pN - NP); i < pN; i++) {
      const a = pDown[i % NP]!;
      const b = pUp[i % NP]! < 0 ? t : pUp[i % NP]!;
      const x0 = PEN - (t - a) * PX;
      const x1 = PEN - (t - b) * PX;
      if (x1 < -4) continue;
      const ok = pOk[i % NP]!;
      g.fillStyle = ok === 1 ? '#1f6a34' : ok === -1 ? '#a8382a' : '#2a1e10';
      g.fillRect(x0, ty + th / 2 - 3, Math.max(2, x1 - x0), 6);
    }
    for (const m of marks) {
      const x = PEN - (t - m.t) * PX - 10;
      if (x < -10) continue;
      text(g, m.ch, x, ty + 7, { size: 9, color: m.ok ? '#1f6a34' : '#a8382a', bold: true });
    }
    // The pen.
    g.fillStyle = down ? '#c8463a' : '#5a4a30';
    g.beginPath();
    g.moveTo(PEN, ty + th / 2 + 4);
    g.lineTo(PEN - 5, ty - 4);
    g.lineTo(PEN + 5, ty - 4);
    g.closePath();
    g.fill();
    // Ghost hint: the current letter's timing laid out ahead of the pen.
    if (host.guided && !done && cur < letters.length) {
      const code = MORSE[letters[cur]!];
      let x = PEN + 10;
      g.globalAlpha = 0.35 + 0.15 * Math.sin(t * 4);
      g.fillStyle = PAL.gold;
      for (let k = 0; k < code.length; k++) {
        const w = (code[k] === '.' ? unit : 3 * unit) * PX;
        g.fillRect(x, ty + th / 2 - 3, w, 6);
        x += w + unit * PX;
      }
      g.globalAlpha = 1;
    }
    // The far station's sounder: the current pulls its arm down onto the anvil — click.
    const sx = 62;
    const sy = 156;
    g.fillStyle = '#4a321c';
    rrect(g, sx - 44, sy + 12, 88, 12, 3);
    g.fill();
    // Two coils of copper wire: the electromagnet.
    for (const cx of [sx - 16, sx - 2]) {
      g.fillStyle = '#7a4a22';
      g.fillRect(cx - 5, sy - 6, 10, 18);
      g.strokeStyle = sounder > 0.5 ? '#ffb070' : '#c27a3e';
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        g.moveTo(cx - 5, sy - 4 + k * 3);
        g.lineTo(cx + 5, sy - 3 + k * 3);
      }
      g.stroke();
    }
    // The pivot post, the arm and the anvil it strikes.
    g.fillStyle = '#8a6a34';
    g.fillRect(sx + 22, sy - 14, 6, 26);
    g.fillRect(sx - 36, sy - 4, 6, 16);
    g.save();
    g.translate(sx + 25, sy - 12);
    g.rotate(-0.06 + sounder * 0.11);
    g.fillStyle = '#c9a24a';
    g.fillRect(-60, -2, 62, 4);
    g.fillStyle = '#d8d0c0';
    g.fillRect(-28, 1, 18, 3);
    g.restore();
    if (sounder > 0.6) {
      g.strokeStyle = 'rgba(255,233,160,0.75)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(sx - 34, sy - 8, 5 + (1 - sounder) * 10, Math.PI * 0.8, Math.PI * 1.6);
      g.stroke();
      text(g, 'click', sx - 30, sy - 24, { size: 8, color: PAL.gold });
    }
    text(g, 'the far station’s sounder', sx, sy + 34, { size: 8, color: PAL.faint });
    text(g, 'Received', sx + 58, 122, { size: 8, color: PAL.dim, align: 'left' });
    text(g, received || '—', sx + 58, 136, { size: 13, color: PAL.ink, align: 'left', bold: true });
    // The key: a brass lever on a wooden base.
    const kx = 300;
    const ky = 160;
    g.fillStyle = '#4a321c';
    rrect(g, kx - 58, ky + 10, 116, 16, 4);
    g.fill();
    g.save();
    g.translate(kx + 40, ky + 8);
    g.rotate(down ? -0.08 : -0.2);
    g.fillStyle = '#c9a24a';
    g.fillRect(-82, -3, 82, 5);
    g.fillStyle = '#2a1e10';
    g.beginPath();
    g.ellipse(-84, -4, 10, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.fillStyle = '#8a6a34';
    g.fillRect(kx + 34, ky - 2, 10, 12);
    text(g, down ? 'keying…' : 'press & hold (or Space)', kx, ky + 38, {
      size: 8.5,
      color: down ? PAL.gold : PAL.faint,
    });
    // The verdict on each letter.
    if (flash > 0) {
      g.globalAlpha = flash;
      if (flashOk) g.drawImage(greenGlow, lx0 + (cur - 1) * letterW - 20, 14, 40, 40);
      else text(g, '✗ again', lx0 + cur * letterW, 60, { size: 9, color: PAL.bad, bold: true });
      g.globalAlpha = 1;
    }
    const hint =
      host.guided && !done ? (p.words.hint ?? 'Short press: dot. Long press: dash. Pause: next letter.') : '';
    text(
      g,
      hint || `${mistakes ? `${mistakes} resent · ` : ''}a dot is short, a dash three times as long`,
      W / 2,
      106,
      { size: 9, color: hint ? PAL.gold : PAL.faint },
    );
  }

  return { update, dispose: ui.dispose };
}

// ---- Binary ---------------------------------------------------------------------------------------
