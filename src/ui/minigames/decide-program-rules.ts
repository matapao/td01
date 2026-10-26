import type { DecideOp, DecideProgram } from './decide-data.ts';
export const DIRS: Record<'n' | 'e' | 's' | 'w', number> = { n: 0, e: 1, s: 2, w: 3 };
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

/**
 * The card art stretched to box `b` (nine pieces: the rounded corners kept, the edges and middle
 * stretched); `lift` brightens it (hover, the card being read), `ring` outlines it.
 */
export interface Trace {
  x: number[];
  y: number[];
  dir: number[];
  pc: number[]; // the card each step came from
  kind: number[]; // 0 move, 1 turn, 2 if-yes, 3 if-no, 4 act-hit, 5 act-miss, 6 repeat, 7 crash, 8 wrong act
  end: 'done' | 'crash' | 'out' | 'tired' | 'wrong';
}

export function simulate(
  prog: DecideOp[],
  P: DecideProgram,
  rock: (x: number, y: number) => boolean,
  limit: number,
  keep?: Trace,
): Trace['end'] {
  let x = P.start[0];
  let y = P.start[1];
  // A cardinal direction starts in 0..3 and turns only modulo four.
  let dir = DIRS[P.facing];
  const turnR = (P.turn ?? 'right') === 'right';
  let left = P.targets.length;
  const done = new Uint8Array(P.cols * P.rows);
  let pc = 0;
  let steps = 0;
  const push = (k: number): void => {
    if (!keep) return;
    keep.x.push(x);
    keep.y.push(y);
    keep.dir.push(dir);
    keep.pc.push(pc);
    keep.kind.push(k);
  };
  if (!prog.length) return 'out';
  while (steps < limit) {
    if (pc >= prog.length) return 'out';
    const op = prog[pc];
    if (op === undefined) return 'out';
    steps++;
    switch (op) {
      case 'move': {
        const nx = x + DX[dir]!;
        const ny = y + DY[dir]!;
        if (rock(nx, ny)) {
          push(7);
          return 'crash';
        }
        x = nx;
        y = ny;
        push(0);
        break;
      }
      case 'left':
        dir = (dir + 3) % 4;
        push(1);
        break;
      case 'right':
        dir = (dir + 1) % 4;
        push(1);
        break;
      case 'ifRock':
        if (rock(x + DX[dir]!, y + DY[dir]!)) {
          dir = turnR ? (dir + 1) % 4 : (dir + 3) % 4;
          push(2);
        } else push(3);
        break;
      case 'act': {
        const hit = P.targets.findIndex((q) => q[0] === x && q[1] === y);
        if (hit >= 0 && !done[y * P.cols + x]) {
          done[y * P.cols + x] = 1;
          left--;
          push(4);
          if (left === 0) return 'done';
        } else if (P.strict) {
          push(8);
          return 'wrong';
        } else push(5);
        break;
      }
      case 'repeat':
        push(6);
        pc = -1;
        break;
    }
    pc++;
  }
  return 'tired';
}
