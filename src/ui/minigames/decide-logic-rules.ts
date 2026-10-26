/** Fewest switches matching every output: branches combine their switches with AND, then combine with OR. */
export function minimumSwitches(
  partTT: number[],
  wantTT: number[],
  B: number,
  S: number,
  ROWS: number,
): number {
  const all = (1 << ROWS) - 1;
  const terms: { tt: number; size: number }[] = [];
  const P = partTT.length;
  for (let m = 1; m < 1 << P; m++) {
    let size = 0;
    let tt = all;
    for (let j = 0; j < P; j++)
      if (m & (1 << j)) {
        size++;
        tt &= partTT[j]!;
      }
    if (size <= S) terms.push({ tt, size });
  }
  let total = 0;
  for (const want of wantTT) {
    let best = Infinity;
    const go = (from: number, depth: number, tt: number, size: number): void => {
      if (tt === want) best = Math.min(best, size);
      if (depth === B || size >= best) return;
      for (let i = from; i < terms.length; i++)
        if ((terms[i]!.tt & ~want) === 0) go(i, depth + 1, tt | terms[i]!.tt, size + terms[i]!.size);
    };
    go(0, 0, 0, 0);
    total += best;
  }
  return total;
}
