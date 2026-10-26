import { minimumSwitches } from './decide-logic-rules.ts';
import type { Minigame, MinigameHost } from './types.ts';
import type { DecideLogic, DecideParams } from './decide-data.ts';
import { canvasIn, finisher, text, rrect, PAL } from './kit.ts';
import { W, H, inBox, glowSprite, button, fitSize, topLine, icon, type Box } from './decide-drawing.ts';
export function createLogic(host: MinigameHost, p: DecideParams): Minigame {
  if (!p.logic) throw new Error('decide: logic mode needs `logic`');
  const L: DecideLogic = p.logic;
  if (
    L.inputs.length === 0 ||
    L.inputs.length > 4 ||
    L.outputs.length === 0 ||
    L.parts.length === 0 ||
    L.parts.length >= 31
  )
    throw new Error('Relay logic needs inputs, outputs and parts within its truth-table bit width');
  if (![L.branches ?? 2, L.slots ?? 2].every((n) => Number.isInteger(n) && n > 0))
    throw new Error('Relay branches and slots must be positive whole numbers');
  // Each output owns B rows and B*S slots; per-input/part/output tables keep their source ordering.

  const end = finisher(host);
  const timeLimit = p.time ?? 45;
  const inputs = L.inputs;
  const outputs = L.outputs;
  const parts = L.parts;
  const nI = inputs.length;
  const nO = outputs.length;
  const B = L.branches ?? 2;
  const S = L.slots ?? 2;
  const ROWS = 1 << nI;
  const keyIdx = new Map(inputs.map((inp, i) => [inp.key, i]));
  const partInput = parts.map((pt) => {
    const input = keyIdx.get(pt.input);
    if (input === undefined) throw new Error('Relay part refers to an unknown input');
    return input;
  });

  // Every case, as a record for `want`, and the wanted truth table per output (bit per case).
  const caseOf = (row: number): Record<string, boolean> => {
    const r: Record<string, boolean> = {};
    inputs.forEach((inp, i) => (r[inp.key] = ((row >> (nI - 1 - i)) & 1) === 1));
    return r;
  };
  const wantTT = outputs.map((o) => {
    let tt = 0;
    for (let row = 0; row < ROWS; row++) if (o.want(caseOf(row))) tt |= 1 << row;
    return tt;
  });
  /** Truth table of one switch: shut in which cases. */
  const partTT = parts.map((pt, j) => {
    let tt = 0;
    for (let row = 0; row < ROWS; row++) {
      const v = ((row >> (nI - 1 - partInput[j]!)) & 1) === 1;
      if (pt.not ? !v : v) tt |= 1 << row;
    }
    return tt;
  });

  // The fewest switches that do it (per output): branches are ANDs of switches, ORed together.
  const par = L.par ?? minimumSwitches(partTT, wantTT, B, S, ROWS);

  // ---- Layout ----
  const inBoxes: Box[] = inputs.map((_, i) => ({ x: 6, y: 24 + i * 34, w: 76, h: 28 }));
  const railL = 96;
  const railR = 230;
  const outX = 248;
  const rowGap = nO * B > 3 ? 27 : nO * B > 2 ? 34 : 44;
  const outGap = 16;
  const totalH = nO * B * rowGap - rowGap + (nO - 1) * outGap;
  const top = 34 + Math.max(0, (112 - totalH) / 2);
  const rowY: number[] = [];
  for (let o = 0; o < nO; o++) for (let b = 0; b < B; b++) rowY.push(top + (o * B + b) * rowGap + o * outGap);
  const slotW = S <= 2 ? 40 : 34;
  const slotX = (s: number): number => railL + ((railR - railL) * (s + 1)) / (S + 1);
  const slotBox = (i: number): Box => {
    const row = Math.floor(i / S);
    const s = i % S;
    return { x: slotX(s) - slotW / 2, y: rowY[row]! - 12, w: slotW, h: 24 };
  };
  const nSlots = nO * B * S;
  const cardW = Math.min(76, (316 - 6) / parts.length - 4);
  const cardBoxes: Box[] = parts.map((_, j) => ({ x: 6 + j * (cardW + 4), y: 162, w: cardW, h: 26 }));
  const testBtn: Box = { x: 322, y: 162, w: 54, h: 26 };

  // ---- State ----
  const slot = new Int8Array(nSlots).fill(-1); // part index in each slot
  const state: boolean[] = inputs.map(() => false);
  let t = 0;
  let testing = false;
  let testT = 0;
  let testRow = -1;
  const got: number[][] = outputs.map(() => new Array<number>(ROWS).fill(-1)); // -1 not yet, 0/1
  let drag = -1; // part being dragged
  let dragFrom = -1; // the slot it came from, or -1 from the cards
  let pressX = 0;
  let pressY = 0;
  let flow = 0; // animation phase for the current
  const lampGlow = glowSprite(255, 220, 130);
  const okGlow = glowSprite(140, 255, 160);
  let order: number[] = []; // slots in the order they were filled (for Backspace)

  const used = (j: number): number => {
    let n = 0;
    for (let i = 0; i < nSlots; i++) if (slot[i]! === j) n++;
    return n;
  };
  const avail = (j: number): boolean => parts[j]!.count === undefined || used(j) < parts[j]!.count!;
  const shut = (j: number, st: boolean[]): boolean => {
    const v = st[partInput[j]!]!;
    return parts[j]!.not ? !v : v;
  };
  /** Does branch `row` pass current in state `st`? (A branch with no switch isn't wired.) */
  const branchOn = (row: number, st: boolean[]): boolean => {
    let any = false;
    for (let s = 0; s < S; s++) {
      const j = slot[row * S + s]!;
      if (j < 0) continue;
      any = true;
      if (!shut(j, st)) return false;
    }
    return any;
  };
  const outputOn = (o: number, st: boolean[]): boolean => {
    for (let b = 0; b < B; b++) if (branchOn(o * B + b, st)) return true;
    return false;
  };
  const placedCount = (): number => {
    let n = 0;
    for (let i = 0; i < nSlots; i++) if (slot[i]! >= 0) n++;
    return n;
  };
  const rowState = (row: number): boolean[] => inputs.map((_, i) => ((row >> (nI - 1 - i)) & 1) === 1);

  function place(j: number, at: number): void {
    if (at < 0 || at >= nSlots) return;
    slot[at] = j;
    order = order.filter((i) => i !== at);
    order.push(at);
  }
  function firstEmpty(): number {
    for (let i = 0; i < nSlots; i++) if (slot[i]! < 0) return i;
    return -1;
  }
  function removeAt(at: number): void {
    slot[at] = -1;
    order = order.filter((i) => i !== at);
  }
  const slotAt = (x: number, y: number): number => {
    for (let i = 0; i < nSlots; i++) {
      const b = slotBox(i);
      if (x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 5 && y <= b.y + b.h + 5) return i;
    }
    return -1;
  };

  function startTest(): void {
    if (testing || end.finished()) return;
    drag = -1;
    testing = true;
    testT = 0;
    testRow = -1;
  }

  function onDown(pt: { x: number; y: number }): void {
    if (testing || end.finished()) return;
    pressX = pt.x;
    pressY = pt.y;
    if (inBox(testBtn, pt.x, pt.y)) return startTest();
    for (let i = 0; i < nI; i++) if (inBox(inBoxes[i]!, pt.x, pt.y)) state[i] = !state[i]!;
    for (let j = 0; j < parts.length; j++)
      if (inBox(cardBoxes[j]!, pt.x, pt.y) && avail(j)) {
        drag = j;
        dragFrom = -1;
        return;
      }
    const at = slotAt(pt.x, pt.y);
    if (at >= 0 && slot[at]! >= 0) {
      drag = slot[at]!;
      dragFrom = at;
      removeAt(at);
    }
  }

  function onUp(pt: { x: number; y: number }): void {
    if (drag < 0) return;
    const click = Math.hypot(pt.x - pressX, pt.y - pressY) < 5;
    const at = slotAt(pt.x, pt.y);
    if (click) {
      // A click: a card goes to the first free place; a switch clicked comes off.
      if (dragFrom < 0) place(drag, firstEmpty());
    } else if (at >= 0) {
      const there = slot[at]!;
      place(drag, at);
      if (there >= 0 && dragFrom >= 0) place(there, dragFrom);
    }
    drag = -1;
    dragFrom = -1;
  }

  const c = canvasIn(host, W, H, { down: onDown, up: onUp });
  const g = c.g;
  const pointer = c.pointer;
  const goalSize = fitSize(g, p.words.goal, W - 66);

  const onKey = (e: KeyboardEvent): void => {
    if (end.finished() || testing) return;
    const k = e.key;
    let handled = true;
    if (k === 'Enter') startTest();
    else if (k === 'Backspace') {
      const last = order[order.length - 1];
      if (last !== undefined) removeAt(last);
    } else if (k >= '1' && k <= '9' && Number(k) <= parts.length) {
      const j = Number(k) - 1;
      if (avail(j)) place(j, firstEmpty());
    } else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  window.addEventListener('keydown', onKey, true);

  // ---- Drawing ----
  function drawContact(j: number, x: number, y: number, closed: boolean, live: boolean, ghost = false): void {
    const pt = parts[j]!;
    const inp = inputs[partInput[j]!]!;
    const alpha0 = g.globalAlpha;
    if (ghost) g.globalAlpha = alpha0 * 0.85;
    g.fillStyle = '#241d14';
    rrect(g, x - slotW / 2, y - 12, slotW, 24, 4);
    g.fill();
    g.strokeStyle = pt.not ? '#b07a5a' : '#8a7a5a';
    g.lineWidth = 1;
    g.stroke();
    // The contact: two plates and the blade.
    const col = live ? '#ffe9a0' : '#c9b48a';
    g.strokeStyle = col;
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(x - 9, y + 4);
    g.lineTo(x - 5, y + 4);
    g.moveTo(x + 5, y + 4);
    g.lineTo(x + 9, y + 4);
    g.moveTo(x - 5, y + 4);
    if (closed) g.lineTo(x + 5, y + 4);
    else g.lineTo(x + 4, y - 1);
    g.stroke();
    if (pt.not) {
      g.strokeStyle = '#ff8a6a';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x - 2, y + 8);
      g.lineTo(x + 2, y);
      g.stroke();
    }
    icon(g, inp.icon ?? 'key', x - (pt.not ? 6 : 0), y - 5, !pt.not, 0.55);
    if (pt.not) text(g, 'not', x + 7, y - 5, { size: 7, color: '#ff9a7a', bold: true });
    g.globalAlpha = alpha0;
  }

  function drawLadder(st: boolean[]): void {
    // The rails: push on the left.
    const yTop = rowY[0]! - 14;
    const yBot = rowY[rowY.length - 1]! + 14;
    g.strokeStyle = '#c8463a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(railL, yTop);
    g.lineTo(railL, yBot);
    g.stroke();
    text(g, '+', railL - 8, yTop + 2, { size: 11, color: '#ff8a7a', bold: true });
    for (let o = 0; o < nO; o++) {
      const out = outputs[o]!;
      const y0 = rowY[o * B]!;
      const y1 = rowY[o * B + B - 1]!;
      const on = outputOn(o, st);
      // Each branch: from the rail through its switches to the collector.
      for (let b = 0; b < B; b++) {
        const row = o * B + b;
        const y = rowY[row]!;
        let wired = false;
        for (let s = 0; s < S; s++) if (slot[row * S + s]! >= 0) wired = true;
        let live = true;
        let x = railL;
        for (let s = 0; s <= S; s++) {
          const nx = s < S ? slotX(s) - slotW / 2 : railR;
          g.strokeStyle = !wired ? '#3a3022' : live ? '#ffd27a' : '#6f6450';
          g.lineWidth = wired ? 1.6 : 1;
          if (!wired) g.setLineDash([3, 3]);
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(nx, y);
          g.stroke();
          g.setLineDash([]);
          if (s < S) {
            const i = row * S + s;
            const j = slot[i]!;
            const bx = slotX(s);
            if (j >= 0) {
              const cl = shut(j, st);
              drawContact(j, bx, y, cl, live && cl);
              if (!cl) live = false;
            } else {
              // An empty place: a plain wire if the branch is wired, else a dashed spot to drop on.
              const hot = drag >= 0 && slotAt(pointer.x, pointer.y) === i;
              g.strokeStyle = hot ? PAL.gold : '#4a3f2e';
              g.lineWidth = 1;
              g.setLineDash([2, 3]);
              rrect(g, bx - slotW / 2, y - 12, slotW, 24, 4);
              g.stroke();
              g.setLineDash([]);
              if (wired) {
                g.strokeStyle = live ? '#ffd27a' : '#6f6450';
                g.lineWidth = 1.6;
                g.beginPath();
                g.moveTo(bx - slotW / 2, y);
                g.lineTo(bx + slotW / 2, y);
                g.stroke();
              }
            }
            x = bx + slotW / 2;
          }
        }
        // Current flowing along a branch that passes.
        if (branchOn(row, st)) {
          g.fillStyle = '#fff3b0';
          g.beginPath();
          for (let k = 0; k < 8; k++) {
            const f = ((flow + k / 8) % 1) * (railR - railL);
            g.moveTo(railL + f + 1.3, y);
            g.arc(railL + f, y, 1.3, 0, Math.PI * 2);
          }
          g.fill();
        }
      }
      // The collector and the output.
      const ym = (y0 + y1) / 2;
      g.strokeStyle = on ? '#ffd27a' : '#6f6450';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(railR, y0);
      g.lineTo(railR, y1);
      g.moveTo(railR, ym);
      g.lineTo(outX - 9, ym);
      g.stroke();
      if (on && (out.icon ?? 'lamp') === 'lamp') g.drawImage(lampGlow, outX - 22, ym - 22, 44, 44);
      icon(g, out.icon ?? 'lamp', outX, ym, on, 1.2);
      text(g, out.name, outX - 4, y0 - 19, { size: 8.5, color: on ? PAL.gold : PAL.dim });
    }
  }

  function drawTable(): void {
    // Inputs on the left; per output, what it should do and (once tested) whether it did.
    const colW = 13;
    const outW = nO > 1 ? 32 : 46;
    const x1 = W - 6;
    const xo = x1 - nO * outW;
    const x0 = xo - 8 - nI * colW;
    const rowH = ROWS > 4 ? 11 : 13;
    const y0 = 30;
    g.fillStyle = '#1b1610';
    rrect(g, x0 - 5, 18, x1 - x0 + 9, 18 + ROWS * rowH + 4, 5);
    g.fill();
    inputs.forEach((inp, i) => {
      if (inp.short)
        text(g, inp.short, x0 + i * colW + colW / 2, y0 - 2, { size: 9, color: PAL.ink, bold: true });
      else icon(g, inp.icon ?? 'key', x0 + i * colW + colW / 2, y0 - 2, true, 0.6);
    });
    const wantAt = (o: number): number => (nO > 1 ? xo + o * outW + 11 : xo + 13);
    const gotAt = (o: number): number => (nO > 1 ? xo + o * outW + 25 : xo + 36);
    if (nO > 1)
      outputs.forEach((out, o) => icon(g, out.icon ?? 'lamp', xo + o * outW + 16, y0 - 2, true, 0.55));
    else {
      text(g, 'want', wantAt(0), y0 - 2, { size: 8, color: PAL.dim });
      text(g, 'got', gotAt(0), y0 - 2, { size: 8, color: PAL.dim });
    }
    const cur = testing ? testRow : rowOfState();
    for (let row = 0; row < ROWS; row++) {
      const y = y0 + 12 + row * rowH;
      if (row === cur) {
        g.fillStyle = 'rgba(233,196,106,0.14)';
        g.fillRect(x0 - 4, y - rowH / 2, x1 - x0 + 7, rowH);
      }
      for (let i = 0; i < nI; i++) {
        const v = ((row >> (nI - 1 - i)) & 1) === 1;
        g.fillStyle = v ? PAL.gold : '#4a3f2e';
        g.beginPath();
        g.arc(x0 + i * colW + colW / 2, y, 2.6, 0, Math.PI * 2);
        g.fill();
      }
      for (let o = 0; o < nO; o++) {
        const want = ((wantTT[o]! >> row) & 1) === 1;
        text(g, want ? 'on' : 'off', wantAt(o), y, { size: 8, color: want ? PAL.ink : PAL.faint });
        const r = got[o]![row]!;
        if (r >= 0) {
          const ok = (r === 1) === want;
          text(g, ok ? '✓' : '✗', gotAt(o), y, { size: 10, color: ok ? PAL.good : PAL.bad, bold: true });
        } else text(g, '·', gotAt(o), y, { size: 9, color: PAL.faint });
      }
    }
  }

  const rowOfState = (): number => state.reduce((r, v, i) => r | ((v ? 1 : 0) << (nI - 1 - i)), 0);

  function finishTest(): void {
    let wrong = -1;
    let wo = 0;
    for (let o = 0; o < nO && wrong < 0; o++)
      for (let row = 0; row < ROWS; row++)
        if ((got[o]![row]! === 1) !== (((wantTT[o]! >> row) & 1) === 1)) {
          wrong = row;
          wo = o;
          break;
        }
    const n = placedCount();
    const principle = p.words.principle ? ` ${p.words.principle}` : '';
    if (n === 0)
      return end.finish(0, `No switches, no logic: the ${outputs[0]!.name.toLowerCase()} never acted.`);
    if (wrong >= 0) {
      const st = rowState(wrong);
      const words = inputs.map((inp, i) => (st[i]! ? inp.on : inp.off)).join(', ');
      const out = outputs[wo]!;
      const gotOn = got[wo]![wrong]! === 1;
      return end.finish(
        0,
        `${words}: ${gotOn ? out.on : out.off} — it should be ${gotOn ? out.off : out.on}.${principle}`,
      );
    }
    if (n <= par)
      return end.finish(
        2,
        `Right in all ${ROWS * nO} cases with ${n} switch${n === 1 ? '' : 'es'}.${principle}`,
      );
    return end.finish(1, `Right in every case, but with ${n} switches where ${par} would do.${principle}`);
  }

  function update(dt: number): void {
    t += dt;
    flow = (flow + dt * 0.9) % 1;
    if (!testing && !end.finished() && t >= timeLimit) startTest();
    let st = state;
    if (testing) {
      testT += dt;
      const STEP = 0.55;
      const row = Math.floor(testT / STEP);
      if (row !== testRow && row < ROWS) {
        testRow = row;
        const rs = rowState(row);
        for (let i = 0; i < nI; i++) state[i] = rs[i]!;
      }
      // Judge each case a moment after its switches settle.
      if (testRow >= 0 && testRow < ROWS && testT - testRow * STEP > 0.25)
        for (let o = 0; o < nO; o++) if (got[o]![testRow]! < 0) got[o]![testRow] = outputOn(o, state) ? 1 : 0;
      if (testT >= ROWS * STEP + 0.4 && !end.finished()) finishTest();
      st = state;
    }

    // ---- Draw ----
    g.fillStyle = PAL.bg;
    g.fillRect(0, 0, W, H);
    topLine(g, p.words.goal, goalSize, 1 - t / timeLimit);
    // Conditions: click to flip.
    inputs.forEach((inp, i) => {
      const b = inBoxes[i]!;
      const hover = !testing && inBox(b, pointer.x, pointer.y);
      g.fillStyle = st[i]! ? '#33291a' : hover ? '#241d14' : '#1b1610';
      rrect(g, b.x, b.y, b.w, b.h, 5);
      g.fill();
      g.strokeStyle = st[i]! ? PAL.gold : '#4a3f2e';
      g.lineWidth = 1;
      g.stroke();
      icon(g, inp.icon ?? 'key', b.x + 12, b.y + b.h / 2, st[i]!, 0.9);
      text(g, st[i]! ? inp.on : inp.off, b.x + 24, b.y + b.h / 2 + 0.5, {
        size: 9,
        color: st[i]! ? PAL.ink : PAL.dim,
        align: 'left',
      });
    });
    text(g, testing ? 'testing…' : 'click to flip', 44, inBoxes[nI - 1]!.y + inBoxes[nI - 1]!.h + 8, {
      size: 8,
      color: PAL.faint,
    });
    drawLadder(st);
    drawTable();
    // Ghost hint: the first time, faint switches where they could go.
    if (host.guided && !testing && L.hint) {
      const a = 0.3 + 0.15 * Math.sin(t * 4);
      L.hint.forEach((j, i) => {
        if (j < 0 || i >= nSlots || slot[i]! >= 0) return;
        const b = slotBox(i);
        g.globalAlpha = a;
        drawContact(j, b.x + b.w / 2, b.y + b.h / 2, false, false, true);
        g.strokeStyle = PAL.gold;
        g.lineWidth = 1;
        g.setLineDash([3, 3]);
        rrect(g, b.x - 1, b.y - 1, b.w + 2, b.h + 2, 5);
        g.stroke();
        g.setLineDash([]);
        g.globalAlpha = 1;
      });
    }
    // The cards on offer.
    parts.forEach((pt, j) => {
      const b = cardBoxes[j]!;
      const ok = avail(j);
      const hover = !testing && ok && inBox(b, pointer.x, pointer.y);
      g.fillStyle = hover ? '#2c241a' : '#1e1912';
      rrect(g, b.x, b.y, b.w, b.h, 5);
      g.fill();
      g.strokeStyle = !ok ? '#3a3022' : pt.not ? '#b07a5a' : '#6e5a35';
      g.lineWidth = 1;
      g.stroke();
      g.globalAlpha = ok ? 1 : 0.4;
      const inp = inputs[partInput[j]!]!;
      icon(g, inp.icon ?? 'key', b.x + 10, b.y + 13, !pt.not, 0.6);
      const label = pt.not ? `not ${inp.on}` : inp.on;
      text(g, label, b.x + 19, b.y + 13.5, {
        size: label.length > 11 ? 7.5 : 8.5,
        color: pt.not ? '#ffb09a' : PAL.ink,
        align: 'left',
      });
      text(g, `${j + 1}`, b.x + b.w - 5, b.y + 6, { size: 7, color: PAL.faint });
      if (pt.count !== undefined)
        text(g, `×${pt.count - used(j)}`, b.x + b.w - 7, b.y + 20, { size: 7, color: PAL.faint });
      g.globalAlpha = 1;
    });
    button(g, testBtn, testing ? 'Testing' : 'Test it', {
      hover: !testing && inBox(testBtn, pointer.x, pointer.y),
      on: testing,
      size: 10,
    });
    // The status line.
    const hint =
      host.guided && !testing
        ? (p.words.hint ??
          'Drag switches onto the ladder: in a chain both must shut, side by side either will do')
        : '';
    const status = testing
      ? `Case ${Math.min(ROWS, testRow + 1)} of ${ROWS}`
      : hint ||
        `${placedCount()} switch${placedCount() === 1 ? '' : 'es'} · click a switch to take it off · Enter to test`;
    text(g, status, W / 2, 204, { size: 9.5, color: hint ? PAL.gold : PAL.dim });
    // The switch being dragged.
    if (drag >= 0) drawContact(drag, pointer.x, pointer.y, false, false, true);
    // A tick on the output when every case so far came right.
    if (testing && testRow >= 0) {
      const ok = got.every((gr, o) =>
        gr.every((r, row) => r < 0 || (r === 1) === (((wantTT[o]! >> row) & 1) === 1)),
      );
      if (ok) {
        g.globalAlpha = 0.35;
        const ym = (rowY[0]! + rowY[B - 1]!) / 2;
        g.drawImage(okGlow, outX - 16, ym - 16, 32, 32);
        g.globalAlpha = 1;
      }
    }
  }

  return {
    update,
    dispose: () => {
      window.removeEventListener('keydown', onKey, true);
      c.dispose();
    },
  };
}

// ---- Program: punched cards -----------------------------------------------------------------------
