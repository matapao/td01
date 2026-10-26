import type { Minigame, MinigameHost, Quality } from './types.ts';
import type { DecideOp, DecideProgram, DecideParams } from './decide-data.ts';
import { canvasIn, finisher, text, rrect, PAL } from './kit.ts';
import { W, H, inBox, glowSprite, button, fitSize, topLine, type Box } from './decide-drawing.ts';
import { cardArt } from './cardart.ts';
import { drawCardArt } from './decide-card.ts';
import { DIRS, simulate, type Trace } from './decide-program-rules.ts';
export function createProgram(host: MinigameHost, p: DecideParams): Minigame {
  if (!p.program) throw new Error('decide: program mode needs `program`');
  const P: DecideProgram = p.program;
  if (
    P.cards.length === 0 ||
    !Number.isInteger(P.cols) ||
    !Number.isInteger(P.rows) ||
    P.cols < 1 ||
    P.rows < 1 ||
    !Number.isInteger(P.slots ?? 6) ||
    (P.slots ?? 6) < 1
  )
    throw new Error('Programming needs cards, a grid and positive whole slots');
  // Program entries are deck indices from bounded hits; trace arrays are appended together, then read below nSteps.

  const end = finisher(host);
  const timeLimit = p.time ?? 45;
  const machine = P.machine ?? 'rover';
  const actWord = p.words.act ?? (machine === 'cutter' ? 'PUNCH' : machine === 'cart' ? 'DROP' : 'DRILL');
  const targetWord =
    p.words.target ?? (machine === 'cutter' ? 'hole' : machine === 'cart' ? 'drop' : 'sample');
  const Machine = machine === 'cutter' ? 'The cutter' : machine === 'cart' ? 'The cart' : 'The rover';
  const nSlots = Math.min(8, P.slots ?? 6);
  const limit = P.steps ?? 40;
  const turnWord = (P.turn ?? 'right') === 'right' ? 'RIGHT' : 'LEFT';
  const rockSet = new Set((P.rocks ?? []).map((q) => q[1] * P.cols + q[0]));
  const rock = (x: number, y: number): boolean =>
    x < 0 || y < 0 || x >= P.cols || y >= P.rows || rockSet.has(y * P.cols + x);
  const deck = P.cards;
  const LABEL: Record<DecideOp, string> = {
    move: 'MOVE',
    left: 'LEFT',
    right: 'RIGHT',
    ifRock: 'IF ROCK',
    act: actWord,
    repeat: 'REPEAT',
  };
  const LONG: Record<DecideOp, string> = {
    move: 'MOVE ahead',
    left: 'TURN LEFT',
    right: 'TURN RIGHT',
    ifRock: `IF ROCK: ${turnWord}`,
    act: `${actWord} here`,
    repeat: 'REPEAT all',
  };
  // Each card's punched holes (two rows of five): holes in a card are the instruction.
  const HOLES: Record<DecideOp, number> = {
    move: 0b1000010000,
    left: 0b0100001000,
    right: 0b0010000100,
    ifRock: 0b1100000011,
    act: 0b0001100010,
    repeat: 0b1010110101,
  };

  // The fewest cards that do it, if not given: try every program, shortest first.
  const par =
    P.par ??
    (() => {
      const ops = [...new Set(deck.map((d) => d.op))];
      const prog: DecideOp[] = [];
      let budget = 400000;
      for (let len = 1; len <= Math.min(nSlots, 6); len++) {
        const idx = new Array<number>(len).fill(0);
        for (;;) {
          for (let i = 0; i < len; i++) prog[i] = ops[idx[i]!]!;
          prog.length = len;
          if (simulate(prog, P, rock, limit) === 'done') return len;
          if (--budget <= 0) return nSlots;
          let k = len - 1;
          while (k >= 0 && ++idx[k]! === ops.length) idx[k--] = 0;
          if (k < 0) break;
        }
      }
      return nSlots;
    })();

  // ---- Layout ----
  const cell = Math.min(200 / P.cols, 118 / P.rows);
  const yx = 6 + (200 - cell * P.cols) / 2;
  const yy = 20 + (118 - cell * P.rows) / 2;
  const cx = (x: number): number => yx + (x + 0.5) * cell;
  const cy = (y: number): number => yy + (y + 0.5) * cell;
  const cardBoxes: Box[] = deck.map((_, j) => ({
    x: 214 + (j % 2) * 82,
    y: 22 + Math.floor(j / 2) * 29,
    w: 78,
    h: 25,
  }));
  const slotW = Math.min(38, (312 - 6) / nSlots - 3);
  const slotBoxes: Box[] = Array.from({ length: nSlots }, (_, i) => ({
    x: 6 + i * (slotW + 3),
    y: 150,
    w: slotW,
    h: 30,
  }));
  const runBtn: Box = { x: 322, y: 150, w: 54, h: 30 };

  // ---- State ----
  const prog: number[] = []; // deck indices, in order
  let t = 0;
  let running = false;
  let runT = 0;
  let trace: Trace | null = null;
  let drag = -1;
  let dragFrom = -1;
  let pressX = 0;
  let pressY = 0;
  let judged = false;
  const STEP = 0.24;
  const sparkle = glowSprite(255, 236, 150);
  const doneCells = new Uint8Array(P.cols * P.rows);
  const used = (j: number): number => {
    let n = 0;
    for (const d of prog) if (d === j) n++;
    return n;
  };
  const avail = (j: number): boolean => deck[j]!.count === undefined || used(j) < deck[j]!.count!;
  const slotAt = (x: number, y: number): number => {
    for (let i = 0; i < nSlots; i++) {
      const b = slotBoxes[i]!;
      if (x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 8 && y <= b.y + b.h + 8) return i;
    }
    return -1;
  };

  function run(): void {
    if (running || end.finished()) return;
    drag = -1;
    running = true;
    runT = 0;
    trace = { x: [], y: [], dir: [], pc: [], kind: [], end: 'out' };
    trace.end = simulate(
      prog.map((j) => deck[j]!.op),
      P,
      rock,
      limit,
      trace,
    );
  }

  function onDown(pt: { x: number; y: number }): void {
    if (running || end.finished()) return;
    pressX = pt.x;
    pressY = pt.y;
    if (inBox(runBtn, pt.x, pt.y)) return run();
    for (let j = 0; j < deck.length; j++)
      if (inBox(cardBoxes[j]!, pt.x, pt.y) && avail(j)) {
        drag = j;
        dragFrom = -1;
        return;
      }
    const at = slotAt(pt.x, pt.y);
    if (at >= 0 && at < prog.length) {
      drag = prog[at]!;
      dragFrom = at;
      prog.splice(at, 1);
    }
  }

  function onUp(pt: { x: number; y: number }): void {
    if (drag < 0) return;
    const click = Math.hypot(pt.x - pressX, pt.y - pressY) < 5;
    const at = slotAt(pt.x, pt.y);
    if (click) {
      if (dragFrom < 0 && prog.length < nSlots) prog.push(drag);
    } else if (at >= 0 && prog.length < nSlots) prog.splice(Math.min(at, prog.length), 0, drag);
    else if (dragFrom >= 0 && at >= 0) prog.splice(dragFrom, 0, drag);
    drag = -1;
    dragFrom = -1;
  }

  const c = canvasIn(host, W, H, { down: onDown, up: onUp });
  const g = c.g;
  const pointer = c.pointer;
  const goalSize = fitSize(g, p.words.goal, W - 66);

  const onKey = (e: KeyboardEvent): void => {
    if (end.finished() || running) return;
    const k = e.key;
    let handled = true;
    if (k === 'Enter') run();
    else if (k === 'Backspace') prog.pop();
    else if (k >= '1' && k <= '9' && Number(k) <= deck.length) {
      const j = Number(k) - 1;
      if (avail(j) && prog.length < nSlots) prog.push(j);
    } else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  window.addEventListener('keydown', onKey, true);

  // ---- Drawing ----
  const yard = document.createElement('canvas');
  yard.width = W * 2;
  yard.height = H * 2;
  {
    const b = yard.getContext('2d')!;
    b.scale(2, 2);
    b.fillStyle = PAL.bg;
    b.fillRect(0, 0, W, H);
    const ground = machine === 'rover' ? '#2a2c32' : machine === 'cutter' ? '#3a4046' : '#2a241a';
    b.fillStyle = ground;
    rrect(b, yx - 3, yy - 3, cell * P.cols + 6, cell * P.rows + 6, 5);
    b.fill();
    for (let i = 0; i < P.cols * P.rows; i++) {
      const x = i % P.cols;
      const y = Math.floor(i / P.cols);
      if ((x + y) % 2 === 0) {
        b.fillStyle = 'rgba(255,255,255,0.03)';
        b.fillRect(yx + x * cell, yy + y * cell, cell, cell);
      }
      if (machine === 'rover' && rockSet.has(i)) {
        const s = Math.sin(i * 12.9898) * 43758.5453;
        const wb = s - Math.floor(s);
        b.fillStyle = '#6c6f76';
        b.beginPath();
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          const rr = cell * (0.32 + 0.1 * Math.sin(k * 2.3 + wb * 9));
          const px = cx(x) + Math.cos(a) * rr;
          const py = cy(y) + Math.sin(a) * rr * 0.85;
          if (k) b.lineTo(px, py);
          else b.moveTo(px, py);
        }
        b.closePath();
        b.fill();
        b.fillStyle = '#9093a0';
        b.beginPath();
        b.ellipse(cx(x) - cell * 0.1, cy(y) - cell * 0.12, cell * 0.12, cell * 0.07, -0.4, 0, Math.PI * 2);
        b.fill();
      } else if (rockSet.has(i)) {
        b.fillStyle = '#555b62';
        b.fillRect(yx + x * cell + 2, yy + y * cell + 2, cell - 4, cell - 4);
      }
    }
    if (machine === 'rover')
      for (let i = 0; i < 90; i++) {
        const s1 = Math.sin(i * 78.233) * 43758.5453;
        const s2 = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
        b.fillStyle = 'rgba(0,0,0,0.35)';
        b.fillRect(
          yx + (s1 - Math.floor(s1)) * cell * P.cols,
          yy + (s2 - Math.floor(s2)) * cell * P.rows,
          1.5,
          1.5,
        );
      }
  }

  function drawCard(
    op: DecideOp,
    b: Box,
    o: { hover?: boolean; active?: boolean; off?: boolean; long?: boolean; ghost?: boolean },
  ): void {
    const alpha0 = g.globalAlpha;
    g.globalAlpha = alpha0 * (o.off ? 0.35 : o.ghost ? 0.85 : 1);
    // A punched card: the card model's art once it's ready (see cardart.ts), else cream with a clipped corner; then its holes.
    const art = cardArt();
    if (art) drawCardArt(g, art, b, o.active ? 0.35 : o.hover ? 0.2 : 0, o.active ? PAL.gold : null);
    else {
      g.fillStyle = o.active ? '#fff3c8' : o.hover ? '#f2e6c8' : '#e3d6b6';
      g.beginPath();
      g.moveTo(b.x + 5, b.y);
      g.lineTo(b.x + b.w - 3, b.y);
      g.quadraticCurveTo(b.x + b.w, b.y, b.x + b.w, b.y + 3);
      g.lineTo(b.x + b.w, b.y + b.h - 3);
      g.quadraticCurveTo(b.x + b.w, b.y + b.h, b.x + b.w - 3, b.y + b.h);
      g.lineTo(b.x + 3, b.y + b.h);
      g.quadraticCurveTo(b.x, b.y + b.h, b.x, b.y + b.h - 3);
      g.lineTo(b.x, b.y + 5);
      g.closePath();
      g.fill();
      if (o.active) {
        g.strokeStyle = PAL.gold;
        g.lineWidth = 2;
        g.stroke();
      }
    }
    const holes = HOLES[op];
    g.fillStyle = '#4a3a26';
    const hx = o.long ? b.x + 5 : b.x + (b.w - 4 * 4.2) / 2;
    for (let k = 0; k < 10; k++) {
      if (!((holes >> k) & 1)) continue;
      const col = k % 5;
      const row = Math.floor(k / 5);
      if (o.long) g.fillRect(hx + row * 4, b.y + 4 + col * 3.6, 2.2, 2);
      else g.fillRect(hx + col * 4.2, b.y + 4 + row * 3.4, 2.4, 2);
    }
    if (o.long)
      text(g, LONG[op], b.x + 15, b.y + b.h / 2 + 0.5, {
        size: 8.5,
        color: '#2a1e10',
        align: 'left',
        bold: true,
      });
    else
      text(g, LABEL[op], b.x + b.w / 2, b.y + b.h - 8, {
        size: LABEL[op].length > 6 ? 7 : 8,
        color: '#2a1e10',
        bold: true,
      });
    g.globalAlpha = alpha0;
  }

  function drawMachine(x: number, y: number, ang: number, bump: number): void {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    const s = cell / 26;
    g.scale(s, s);
    g.translate(bump, 0);
    if (machine === 'cutter') {
      g.strokeStyle = '#ffd27a';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(0, 0, 7, 0, Math.PI * 2);
      g.moveTo(-10, 0);
      g.lineTo(10, 0);
      g.moveTo(0, -10);
      g.lineTo(0, 10);
      g.stroke();
      g.fillStyle = '#c9d6dd';
      g.beginPath();
      g.arc(0, 0, 3, 0, Math.PI * 2);
      g.fill();
    } else if (machine === 'cart') {
      g.fillStyle = '#9a6234';
      g.fillRect(-8, -6, 16, 12);
      g.fillStyle = '#222';
      g.fillRect(-7, -8, 4, 2);
      g.fillRect(3, -8, 4, 2);
      g.fillRect(-7, 6, 4, 2);
      g.fillRect(3, 6, 4, 2);
      g.fillStyle = '#d8b25a';
      g.fillRect(4, -2, 4, 4);
    } else {
      g.fillStyle = '#1c1c1c';
      for (const wx of [-6, 0, 6]) {
        g.beginPath();
        g.arc(wx, -7, 2.6, 0, Math.PI * 2);
        g.arc(wx, 7, 2.6, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#d9d2c3';
      g.fillRect(-8, -5, 16, 10);
      g.fillStyle = '#3a4f78';
      g.fillRect(-7, -4, 8, 8);
      g.fillStyle = '#f0ece2';
      g.fillRect(3, -2.5, 5, 5);
      g.fillStyle = '#222';
      g.fillRect(7, -1.2, 2, 2.4);
    }
    g.restore();
  }

  function why(): { q: Quality; line: string } {
    const n = prog.length;
    const principle = p.words.principle ? ` ${p.words.principle}` : '';
    const tr = trace!;
    if (!n) return { q: 0, line: `No cards, no program: ${Machine.toLowerCase()} just sat there.` };
    switch (tr.end) {
      case 'done':
        if (n <= par)
          return {
            q: 2,
            line: `Every ${targetWord} done with just ${n} card${n === 1 ? '' : 's'}.${principle}`,
          };
        return {
          q: 1,
          line: `Done, but with ${n} cards where ${par} would do — a loop can repeat the same steps.`,
        };
      case 'crash':
        return {
          q: 0,
          line: `${Machine} ran into ${machine === 'cutter' ? 'the edge' : 'a rock'}: it does exactly what the cards say${deck.some((d) => d.op === 'ifRock') ? ' — an IF ROCK card lets it decide' : ''}.`,
        };
      case 'wrong':
        return {
          q: 0,
          line: `${Machine} ${actWord === 'PUNCH' ? 'punched' : 'acted'} where no ${targetWord} was marked: it does exactly what the cards say.`,
        };
      case 'tired':
        return {
          q: 0,
          line: `${Machine} went round and round until it gave up: the loop never reached every ${targetWord}.`,
        };
      default: {
        const left = P.targets.length - tr.kind.filter((k) => k === 4).length;
        return {
          q: 0,
          line: `The cards ran out with ${left} ${targetWord}${left === 1 ? '' : 's'} left: a machine stops where its program ends.`,
        };
      }
    }
  }

  function update(dt: number): void {
    t += dt;
    if (!running && !end.finished() && t >= timeLimit) run();
    if (running) runT += dt;
    const tr = trace;
    const nSteps = tr ? tr.kind.length : 0;
    const stepF = running ? runT / STEP : 0;
    const si = Math.min(nSteps - 1, Math.floor(stepF));
    if (running && !judged && runT >= nSteps * STEP + 0.7) {
      judged = true;
      const r = why();
      end.finish(r.q, r.line);
    }

    // ---- Draw ----
    g.drawImage(yard, 0, 0, W, H);
    topLine(g, p.words.goal, goalSize, 1 - t / timeLimit);
    // Targets (done ones sparkle).
    doneCells.fill(0);
    if (tr) for (let i = 0; i <= si; i++) if (tr.kind[i]! === 4) doneCells[tr.y[i]! * P.cols + tr.x[i]!] = 1;
    for (const q of P.targets) {
      const x = cx(q[0]);
      const y = cy(q[1]);
      const d = doneCells[q[1] * P.cols + q[0]] === 1;
      if (d) {
        g.globalAlpha = 0.8;
        g.drawImage(sparkle, x - cell * 0.6, y - cell * 0.6, cell * 1.2, cell * 1.2);
        g.globalAlpha = 1;
      }
      if (machine === 'cutter') {
        g.strokeStyle = d ? '#1a1a1a' : '#ff9a7a';
        g.fillStyle = '#14110d';
        g.lineWidth = 1.2;
        g.beginPath();
        g.arc(x, y, cell * 0.2, 0, Math.PI * 2);
        if (d) g.fill();
        else g.stroke();
      } else {
        g.fillStyle = d ? '#7dff9a' : '#7fd4ff';
        g.beginPath();
        g.moveTo(x, y - cell * 0.28);
        g.lineTo(x + cell * 0.18, y);
        g.lineTo(x, y + cell * 0.28);
        g.lineTo(x - cell * 0.18, y);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.6)';
        g.lineWidth = 0.8;
        g.stroke();
      }
    }
    // The track so far, and the machine.
    let mx = cx(P.start[0]);
    let my = cy(P.start[1]);
    let ma = (DIRS[P.facing] - 1) * (Math.PI / 2);
    let bump = 0;
    if (tr && running && nSteps > 0) {
      g.strokeStyle = machine === 'cutter' ? 'rgba(255,210,122,0.55)' : 'rgba(255,230,190,0.28)';
      g.lineWidth = machine === 'cutter' ? 1.5 : 3;
      g.beginPath();
      g.moveTo(cx(P.start[0]), cy(P.start[1]));
      for (let i = 0; i < si; i++) g.lineTo(cx(tr.x[i]!), cy(tr.y[i]!));
      g.stroke();
      const f = Math.min(1, Math.max(0, stepF - si));
      const px = si > 0 ? tr.x[si - 1]! : P.start[0];
      const py = si > 0 ? tr.y[si - 1]! : P.start[1];
      const pd = si > 0 ? tr.dir[si - 1]! : DIRS[P.facing];
      const ease = f * f * (3 - 2 * f);
      mx = cx(px) + (cx(tr.x[si]!) - cx(px)) * ease;
      my = cy(py) + (cy(tr.y[si]!) - cy(py)) * ease;
      let da = tr.dir[si]! - pd;
      if (da > 2) da -= 4;
      if (da < -2) da += 4;
      ma = (pd - 1 + da * ease) * (Math.PI / 2);
      if (tr.kind[si]! === 7) bump = Math.sin(Math.min(1, f) * Math.PI) * 6;
      if (tr.kind[si]! === 7 && f > 0.4)
        text(g, 'BONK!', mx, my - cell * 0.7, { size: 11, color: PAL.bad, bold: true });
      if ((tr.kind[si]! === 2 || tr.kind[si]! === 3) && f < 0.8)
        text(g, tr.kind[si]! === 2 ? 'rock!' : 'clear', mx, my - cell * 0.6, {
          size: 8,
          color: tr.kind[si]! === 2 ? PAL.hot : PAL.dim,
          bold: true,
        });
      if (tr.kind[si]! === 5 && f < 0.8)
        text(g, `no ${targetWord}`, mx, my - cell * 0.6, { size: 8, color: PAL.faint });
      if (tr.kind[si]! === 8 && f > 0.3) {
        g.strokeStyle = PAL.bad;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(mx - 5, my - 5);
        g.lineTo(mx + 5, my + 5);
        g.moveTo(mx + 5, my - 5);
        g.lineTo(mx - 5, my + 5);
        g.stroke();
        text(g, 'wrong spot!', mx, my - cell * 0.7, { size: 9, color: PAL.bad, bold: true });
      }
    }
    drawMachine(mx, my, ma, bump);
    // The deck.
    deck.forEach((d, j) => {
      const b = cardBoxes[j]!;
      drawCard(d.op, b, { hover: !running && inBox(b, pointer.x, pointer.y), off: !avail(j), long: true });
      if (d.count !== undefined)
        text(g, `×${d.count - used(j)}`, b.x + b.w - 8, b.y + 7, { size: 7, color: '#5a4a30' });
    });
    // The reader: the program in order.
    text(g, 'Program', 6, 143, { size: 8, color: PAL.dim, align: 'left' });
    const active = tr && running && si >= 0 ? tr.pc[si]! : -1;
    for (let i = 0; i < nSlots; i++) {
      const b = slotBoxes[i]!;
      if (i < prog.length)
        drawCard(deck[prog[i]!]!.op, b, {
          active: i === active,
          hover: !running && inBox(b, pointer.x, pointer.y),
        });
      else {
        const hot = drag >= 0 && slotAt(pointer.x, pointer.y) === i;
        g.strokeStyle = hot ? PAL.gold : '#4a3f2e';
        g.lineWidth = 1;
        g.setLineDash([2, 3]);
        rrect(g, b.x, b.y, b.w, b.h, 4);
        g.stroke();
        g.setLineDash([]);
        // Ghost hint: the first time, the cards of a good program.
        const ghost = host.guided && !running && P.hint ? P.hint[i] : undefined;
        if (ghost) {
          g.globalAlpha = 0.28 + 0.12 * Math.sin(t * 4);
          drawCard(ghost, b, {});
          g.globalAlpha = 1;
        }
      }
    }
    button(g, runBtn, running ? 'Running' : 'Run', {
      hover: !running && inBox(runBtn, pointer.x, pointer.y),
      on: running,
      size: 11,
    });
    // The status line.
    const hint =
      host.guided && !running ? (p.words.hint ?? 'Click cards to add them in order, then Run') : '';
    const status = running
      ? `Step ${Math.max(1, si + 1)} of ${nSteps}`
      : hint || `${prog.length} of ${nSlots} cards · click a card in the program to take it out · Enter runs`;
    text(g, status, W / 2, 200, { size: 9.5, color: hint ? PAL.gold : PAL.dim });
    if (drag >= 0)
      drawCard(deck[drag]!.op, { x: pointer.x - 18, y: pointer.y - 14, w: 36, h: 28 }, { ghost: true });
  }

  return {
    update,
    dispose: () => {
      window.removeEventListener('keydown', onKey, true);
      c.dispose();
    },
  };
}
