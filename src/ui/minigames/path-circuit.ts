import type { GridPt, PathSource, PathLoad, PathFuse, PathGauge } from './path-data.ts';
export interface Sol {
  v: Float64Array; // node potentials (minus = 0)
  ie: Float64Array; // current along each edge, from its first node to its second (A)
  il: Float64Array; // current through each load, a → b
  vl: Float64Array; // push across each load (V)
  ifz: Float64Array; // current through each fuse
  isrc: number; // current out of the source (A)
  vt: number; // the source's push at its terminals (V)
}

interface CircuitBoard {
  N: number;
  E: number;
  src: PathSource | undefined;
  loads: PathLoad[];
  fuses: PathFuse[];
  plusN: number;
  minusN: number;
  eu: Int16Array;
  ev: Int16Array;
  gauges: PathGauge[];
  laidAt(e: number): number;
  id(q: GridPt): number;
}
/** All node/edge indices are validated by the board; matrices are allocated n*n and traversed below n. */
export function createCircuit(board: CircuitBoard) {
  const { N, E, src, loads, fuses, plusN, minusN, eu, ev, gauges, laidAt, id } = board;
  const nL = loads.length;
  const nF = fuses.length;
  const FUSE_OHMS = 0.02;
  const POP_PUSH = 1.25;
  const rs = Math.max(0.01, src?.ohms ?? 0.5);
  const mkSol = (): Sol => ({
    v: new Float64Array(N),
    ie: new Float64Array(E),
    il: new Float64Array(nL),
    vl: new Float64Array(nL),
    ifz: new Float64Array(nF),
    isrc: 0,
    vt: 0,
  });
  const before = mkSol();
  const after = mkSol();
  const fuseOpen = new Uint8Array(nF);
  const loadOpen = new Uint8Array(nL);
  const uf = new Int16Array(N);
  const find = (i: number): number => {
    while (uf[i]! !== i) {
      uf[i] = uf[uf[i]!]!;
      i = uf[i]!;
    }
    return i;
  };
  const join = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) uf[ra] = rb;
  };
  const gWire = (e: number): number => 1 / Math.max(0.001, gauges[laidAt(e)]!.ohms);
  const gLoad = (k: number): number => loads[k]!.watts / (loads[k]!.volts * loads[k]!.volts);

  function solve(s: Sol): void {
    if (!src) return;
    for (let i = 0; i < N; i++) uf[i] = i;
    for (let e = 0; e < E; e++) if (laidAt(e) >= 0) join(eu[e]!, ev[e]!);
    for (let k = 0; k < nL; k++) if (!loadOpen[k]!) join(id(loads[k]!.a), id(loads[k]!.b));
    for (let k = 0; k < nF; k++) if (!fuseOpen[k]!) join(id(fuses[k]!.a), id(fuses[k]!.b));
    join(plusN, minusN);
    const root = find(minusN);
    const idx = new Int16Array(N);
    let n = 0;
    for (let i = 0; i < N; i++) idx[i] = i !== minusN && find(i) === root ? n++ : -1;
    const A = new Float64Array(n * n);
    const rhs = new Float64Array(n);
    const stamp = (u: number, v: number, gc: number): void => {
      const iu = idx[u]!;
      const iv = idx[v]!;
      if (iu >= 0) A[iu * n + iu]! += gc;
      if (iv >= 0) A[iv * n + iv]! += gc;
      if (iu >= 0 && iv >= 0) {
        A[iu * n + iv]! -= gc;
        A[iv * n + iu]! -= gc;
      }
    };
    for (let e = 0; e < E; e++) if (laidAt(e) >= 0) stamp(eu[e]!, ev[e]!, gWire(e));
    for (let k = 0; k < nL; k++) if (!loadOpen[k]!) stamp(id(loads[k]!.a), id(loads[k]!.b), gLoad(k));
    for (let k = 0; k < nF; k++) if (!fuseOpen[k]!) stamp(id(fuses[k]!.a), id(fuses[k]!.b), 1 / FUSE_OHMS);
    stamp(plusN, minusN, 1 / rs);
    if (idx[plusN]! >= 0) rhs[idx[plusN]!]! += src.volts / rs;
    // Gaussian elimination with partial pivoting.
    for (let k = 0; k < n; k++) {
      let pv = k;
      let best = Math.abs(A[k * n + k]!);
      for (let i = k + 1; i < n; i++) {
        const a = Math.abs(A[i * n + k]!);
        if (a > best) {
          best = a;
          pv = i;
        }
      }
      if (best < 1e-12) continue;
      if (pv !== k) {
        for (let j = 0; j < n; j++) {
          const tmp = A[k * n + j]!;
          A[k * n + j] = A[pv * n + j]!;
          A[pv * n + j] = tmp;
        }
        const tmp = rhs[k]!;
        rhs[k] = rhs[pv]!;
        rhs[pv] = tmp;
      }
      const d = A[k * n + k]!;
      for (let i = k + 1; i < n; i++) {
        const f = A[i * n + k]! / d;
        if (f === 0) continue;
        for (let j = k; j < n; j++) A[i * n + j]! -= f * A[k * n + j]!;
        rhs[i]! -= f * rhs[k]!;
      }
    }
    const x = new Float64Array(n);
    for (let k = n - 1; k >= 0; k--) {
      let sum = rhs[k]!;
      for (let j = k + 1; j < n; j++) sum -= A[k * n + j]! * x[j]!;
      const d = A[k * n + k]!;
      x[k] = Math.abs(d) > 1e-12 ? sum / d : 0;
    }
    for (let i = 0; i < N; i++) s.v[i] = idx[i]! >= 0 ? x[idx[i]!]! : 0;
    for (let e = 0; e < E; e++) s.ie[e] = laidAt(e) >= 0 ? (s.v[eu[e]!]! - s.v[ev[e]!]!) * gWire(e) : 0;
    for (let k = 0; k < nL; k++) {
      const dv = s.v[id(loads[k]!.a)]! - s.v[id(loads[k]!.b)]!;
      s.il[k] = loadOpen[k]! ? 0 : dv * gLoad(k);
      s.vl[k] = loadOpen[k]! ? 0 : Math.abs(dv);
    }
    for (let k = 0; k < nF; k++)
      s.ifz[k] = fuseOpen[k]! ? 0 : (s.v[id(fuses[k]!.a)]! - s.v[id(fuses[k]!.b)]!) / FUSE_OHMS;
    s.vt = s.v[plusN]! - s.v[minusN]!;
    s.isrc = (src.volts - s.vt) / rs;
  }

  const copySol = (a: Sol, b: Sol): void => {
    b.v.set(a.v);
    b.ie.set(a.ie);
    b.il.set(a.il);
    b.vl.set(a.vl);
    b.ifz.set(a.ifz);
    b.isrc = a.isrc;
    b.vt = a.vt;
  };

  /** Throws the lever: solves, lets fuses and bulbs pop, and works out the result. */
  let popped = false;
  const fusePop = new Uint8Array(nF);
  const loadPop = new Uint8Array(nL);
  function runCircuit(): boolean {
    fuseOpen.fill(0);
    loadOpen.fill(0);
    solve(before);
    for (let round = 0; round < 4; round++) {
      let changed = false;
      for (let k = 0; k < nF; k++)
        if (!fuseOpen[k]! && Math.abs((round ? after : before).ifz[k]!) > fuses[k]!.amps) {
          fuseOpen[k] = 1;
          changed = true;
        }
      for (let k = 0; k < nL; k++)
        if (!loadOpen[k]! && (round ? after : before).vl[k]! / loads[k]!.volts > POP_PUSH) {
          loadOpen[k] = 1;
          changed = true;
        }
      if (!changed) break;
      popped = true;
      solve(after);
    }
    if (!popped) copySol(before, after);
    fusePop.set(fuseOpen);
    loadPop.set(loadOpen);
    return popped;
  }

  return { before, after, fuseOpen, loadOpen, fusePop, loadPop, uf, find, join, runCircuit };
}
