import type { Minigame, MinigameHost } from './types.ts';
import type { EncodeParams, EncodePixels } from './encode-data.ts';
import { finisher, text, rrect, PAL } from './kit.ts';
import { W, H, inBox, topLine, glowSprite, setup, type Box } from './encode-drawing.ts';
export function createPixels(host: MinigameHost, p: EncodeParams): Minigame {
  if (!p.pixels) throw new Error('encode: pixels mode needs `pixels`');
  const X: EncodePixels = p.pixels;
  if (X.picture.length === 0 || !X.picture.some((row) => row.length > 0))
    throw new Error('Pixel encoding needs a nonempty picture');
  // target rows are padded to cols; grid mirrors that rectangle. Hit indices are checked before drawing.
  const end = finisher(host);
  const timeLimit = p.time ?? 40;
  const rows = X.picture.length;
  const cols = Math.max(...X.picture.map((r) => r.length));
  const target: string[] = X.picture.map((r) => r.padEnd(cols, '.'));
  const colours: Record<string, string> = { '#': '#e8dcc0', ...(X.colours ?? {}) };
  const keys = [
    ...new Set(
      target
        .join('')
        .split('')
        .filter((ch) => ch !== '.'),
    ),
  ];
  const code = X.code ?? (keys.length > 1 ? 'letters' : 'bits');
  const grid: string[][] = target.map((r) => r.split('').map(() => '.'));
  let brush = keys[0]! ?? '#';
  let wrong = 0;
  let t = 0;
  let done = false;
  let doneT = 0;
  let stroke: 'paint' | 'erase' | null = null;
  let lastCell = -1;

  const cell = Math.min(20, 138 / rows, 150 / cols);
  const gx = 222 - (cell * cols) / 2;
  const gy = 22 + (146 - cell * rows) / 2;
  const codeX = gx - 10;
  const swatches: Box[] = keys.map((_, i) => ({ x: W - 44, y: 32 + i * 28, w: 34, h: 22 }));
  const glow = glowSprite(255, 236, 170);

  const rowCode = (r: number): string => {
    const row = target[r]!;
    if (code === 'bits')
      return row
        .split('')
        .map((ch) => (ch === '.' ? '0' : '1'))
        .join('');
    if (code === 'runs') {
      const runs: number[] = [];
      let on = false;
      let k = 0;
      for (const ch of row) {
        const isOn = ch !== '.';
        if (isOn === on) k++;
        else {
          runs.push(k);
          on = isOn;
          k = 1;
        }
      }
      runs.push(k);
      return runs.join(' ');
    }
    return row
      .split('')
      .map((ch) => (ch === '.' ? '·' : ch))
      .join(' ');
  };
  const codes = target.map((_, r) => rowCode(r));

  const cellAt = (x: number, y: number): number => {
    const c = Math.floor((x - gx) / cell);
    const r = Math.floor((y - gy) / cell);
    return c >= 0 && r >= 0 && c < cols && r < rows ? r * cols + c : -1;
  };
  const complete = (): boolean => grid.every((row, r) => row.every((ch, c) => ch === target[r]![c]));
  const doneShare = (): number => {
    let right = 0;
    let need = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (target[r]![c] !== '.') need++;
        if (target[r]![c] !== '.' && grid[r]![c] === target[r]![c]) right++;
      }
    return need ? right / need : 1;
  };

  function apply(i: number): void {
    if (i < 0 || done || end.finished()) return;
    const r = Math.floor(i / cols);
    const c = i % cols;
    if (stroke === 'erase') grid[r]![c] = '.';
    else {
      if (grid[r]![c] === brush) return;
      grid[r]![c] = brush;
      if (target[r]![c] !== brush) wrong++;
    }
    if (complete()) {
      done = true;
      doneT = t;
    }
  }

  const ui = setup(host, p.words.goal, {
    down: (pt) => {
      if (done || end.finished()) return;
      const s = swatches.findIndex((b) => inBox(b, pt.x, pt.y));
      if (s >= 0) {
        brush = keys[s]!;
        return;
      }
      const i = cellAt(pt.x, pt.y);
      if (i < 0) return;
      const r = Math.floor(i / cols);
      const c = i % cols;
      stroke = grid[r]![c] === brush ? 'erase' : 'paint';
      lastCell = i;
      apply(i);
    },
    up: () => {
      stroke = null;
      lastCell = -1;
    },
    key: (e, d) => {
      const k = e.key;
      if (k >= '1' && k <= '9' && Number(k) <= keys.length) {
        if (d) brush = keys[Number(k) - 1]!;
        return true;
      }
      return false;
    },
  });
  const g = ui.g;
  const pointer = ui.pointer;

  function update(dt: number): void {
    t += dt;
    if (stroke && pointer.down) {
      const i = cellAt(pointer.x, pointer.y);
      if (i >= 0 && i !== lastCell) {
        lastCell = i;
        apply(i);
      }
    }
    const principle = p.words.principle ? ` ${p.words.principle}` : '';
    const name = X.name ?? 'the picture';
    if (done && !end.finished() && t - doneT > 0.9) {
      if (wrong === 0)
        end.finish(2, `Row by row, the code became ${name} — not one square wrong.${principle}`);
      else
        end.finish(
          1,
          `${name.charAt(0).toUpperCase()}${name.slice(1)}, after ${wrong} wrong square${wrong === 1 ? '' : 's'}: read each row of code left to right.`,
        );
    }
    if (!done && !end.finished() && t >= timeLimit) {
      done = true;
      end.finish(
        0,
        `Out of time with the picture ${Math.round(doneShare() * 100)} % done — one row of code is one row of squares.`,
      );
    }
    g.fillStyle = PAL.bg;
    g.fillRect(0, 0, W, H);
    topLine(g, p.words.goal, ui.goalSize, 1 - t / timeLimit);
    // The code, row by row, beside the grid.
    for (let r = 0; r < rows; r++) {
      const y = gy + (r + 0.5) * cell;
      const rowDone = grid[r]!.every((ch, c) => ch === target[r]![c]);
      text(g, codes[r]!, codeX, y, {
        size: Math.min(11, cell * 0.8),
        color: rowDone ? PAL.good : PAL.ink,
        align: 'right',
      });
    }
    // The grid of lights.
    if (done) {
      g.globalAlpha = Math.min(1, (t - doneT) * 2) * 0.8;
      g.drawImage(glow, gx - 30, gy - 30, cell * cols + 60, cell * rows + 60);
      g.globalAlpha = 1;
    }
    g.fillStyle = '#0c0a08';
    g.fillRect(gx - 3, gy - 3, cell * cols + 6, cell * rows + 6);
    let openRow = -1;
    for (let r = 0; r < rows && openRow < 0; r++)
      for (let c = 0; c < cols; c++) if (grid[r]![c] !== target[r]![c]) openRow = r;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const ch = grid[r]![c]!;
        g.fillStyle = ch === '.' ? '#1d1912' : (colours[ch] ?? '#e8dcc0');
        g.fillRect(gx + c * cell + 1, gy + r * cell + 1, cell - 2, cell - 2);
        // Ghost hint: the first time, the squares of the first row not yet painted.
        if (host.guided && !done && r === openRow && target[r]![c] !== '.' && ch !== target[r]![c]) {
          g.strokeStyle = 'rgba(233,196,106,0.6)';
          g.lineWidth = 1;
          g.strokeRect(gx + c * cell + 1.5, gy + r * cell + 1.5, cell - 3, cell - 3);
        }
      }
    const hc = cellAt(pointer.x, pointer.y);
    if (hc >= 0 && !done) {
      g.strokeStyle = PAL.gold;
      g.lineWidth = 1;
      g.strokeRect(
        gx + (hc % cols) * cell + 0.5,
        gy + Math.floor(hc / cols) * cell + 0.5,
        cell - 1,
        cell - 1,
      );
    }
    // Brushes.
    if (keys.length > 1)
      keys.forEach((k, i) => {
        const b = swatches[i]!;
        g.fillStyle = colours[k] ?? '#e8dcc0';
        rrect(g, b.x, b.y, b.w, b.h, 4);
        g.fill();
        g.strokeStyle = k === brush ? PAL.gold : '#3a3022';
        g.lineWidth = k === brush ? 2 : 1;
        g.stroke();
        text(g, k, b.x - 8, b.y + b.h / 2, { size: 10, color: k === brush ? PAL.gold : PAL.dim, bold: true });
      });
    const legend =
      code === 'bits' ? '1 lit · 0 dark' : code === 'runs' ? 'dark, lit, dark… squares in a row' : '· dark';
    text(g, done ? `It's ${name}!` : legend, W / 2, 192, { size: 10, color: done ? PAL.good : PAL.dim });
    const hint =
      host.guided && !done ? (p.words.hint ?? 'Each row of code is one row of squares — click to paint') : '';
    text(
      g,
      hint || `${wrong ? `${wrong} wrong · ` : ''}click a square to paint it, again to clear`,
      W / 2,
      207,
      {
        size: 9,
        color: hint ? PAL.gold : PAL.faint,
      },
    );
  }

  return { update, dispose: ui.dispose };
}

// ---- Symbols: shutter codes -----------------------------------------------------------------------
