import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCircuit } from '../src/ui/minigames/path-circuit.ts';
import { validatePathGrid } from '../src/ui/minigames/path-grid.ts';
import { PATH_EXAMPLES, type GridPt } from '../src/ui/minigames/path-data.ts';
import { minimumSwitches } from '../src/ui/minigames/decide-logic-rules.ts';
import { simulate, type Trace } from '../src/ui/minigames/decide-program-rules.ts';
import { DECIDE_EXAMPLES } from '../src/ui/minigames/decide-data.ts';
import { resample } from '../src/ui/minigames/steady-path.ts';
import { ratio, RATIO_DEMOS } from '../src/ui/minigames/ratio.ts';
import { sizes, SIZES_DEMOS } from '../src/ui/minigames/sizes.ts';
import { order, ORDER_DEMOS } from '../src/ui/minigames/order.ts';
import { sweet, SWEET_DEMOS } from '../src/ui/minigames/sweet.ts';

function close(actual: number | undefined, expected: number): void {
  assert(actual !== undefined);
  assert(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);
}

test('path circuit keeps its physical voltage drop and opens an overloaded fuse', () => {
  const make = (fuse: boolean) =>
    createCircuit({
      N: 4,
      E: 4,
      src: { name: 'Battery', plus: [0, 0], minus: [0, 1], volts: 12, ohms: 0.5 },
      loads: [{ name: 'Lamp', a: [1, 0], b: [1, 1], volts: 12, watts: 12 }],
      fuses: fuse ? [{ a: [0, 0], b: [1, 0], amps: 0.5 }] : [],
      plusN: 0,
      minusN: 2,
      eu: Int16Array.of(0, 2, 0, 1),
      ev: Int16Array.of(1, 3, 2, 3),
      gauges: [{ name: 'Copper', ohms: 0.1, amps: 10, cost: 1 }],
      laidAt: (e) => (e === 1 || (e === 0 && !fuse) ? 0 : -1),
      id: (q: GridPt) => q[1] * 2 + q[0],
    });
  const intact = make(false);
  assert.equal(intact.runCircuit(), false);
  const current = 12 / (0.5 + 0.1 + 12 + 0.1);
  close(intact.after.isrc, current);
  close(intact.after.il[0], current);
  close(intact.after.vl[0], current * 12);
  assert.deepEqual(intact.before.vl, intact.after.vl);
  const fused = make(true);
  assert.equal(fused.runCircuit(), true);
  assert.deepEqual([...fused.fusePop], [1]);
  assert(fused.before.ifz[0]! > 0.5); // The fixture contains exactly one fuse.
  close(fused.after.il[0], 0);
});

test('path configurations reject indices outside their node and gauge buffers', () => {
  for (const setup of Object.values(PATH_EXAMPLES)) validatePathGrid(setup);
  const route = PATH_EXAMPLES.rails;
  assert.throws(() => validatePathGrid({ ...route, cols: 1 }), /dimensions/);
  assert.throws(
    () => validatePathGrid({ ...route, start: { name: 'Outside', at: [route.cols, 0] } }),
    /outside/,
  );
  assert.throws(() => validatePathGrid({ ...route, gauges: [] }), /gauges/);
  assert.throws(() => validatePathGrid({ ...route, laid: [{ path: [[0, 0]], gauge: -1 }] }), /gauge/);
});

test('relay and program rules keep their lesson outcomes and complete parallel traces', () => {
  // Two inputs across four truth-table rows: AND needs a chain, OR needs separate branches.
  assert.equal(minimumSwitches([0b1100, 0b1010], [0b1000], 2, 2, 4), 2);
  assert.equal(minimumSwitches([0b1100, 0b1010], [0b1110], 2, 2, 4), 2);
  for (const setup of Object.values(DECIDE_EXAMPLES)) {
    const p = setup.program;
    if (!p?.hint) continue;
    const blocked = new Set((p.rocks ?? []).map(([x, y]) => `${x},${y}`));
    const trace: Trace = { x: [], y: [], dir: [], pc: [], kind: [], end: 'out' };
    assert.equal(
      simulate(
        p.hint,
        p,
        (x, y) => x < 0 || y < 0 || x >= p.cols || y >= p.rows || blocked.has(`${x},${y}`),
        p.steps ?? 40,
        trace,
      ),
      'done',
      setup.words.goal,
    );
    assert(trace.kind.length > 0);
    for (const values of [trace.x, trace.y, trace.dir, trace.pc])
      assert.equal(values.length, trace.kind.length);
  }
});

test('tracing keeps exact resampling and rejects incomplete or nonfinite coordinate pairs', () => {
  const straight = resample([0, 0, 4, 0]);
  assert.equal(straight.len, 4);
  assert.deepEqual([...straight.xs], [0, 2, 4]);
  assert.deepEqual([...straight.ys], [0, 0, 0]);
  assert.deepEqual(resample([0, 0, 0, 0, 4, 0]), straight);
  for (const points of [[], [0, 0, 4], [0, 0, NaN, 0]])
    assert.throws(() => resample(points), /complete finite points/);
});

test('inherited URL variant names select the real default lesson', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  try {
    for (const name of ['constructor', '__proto__', 'toString', 'not-a-demo']) {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: { search: `?variant=${name}` },
      });
      assert.equal(ratio.demo, RATIO_DEMOS.bronze);
      assert.equal(sizes.demo, SIZES_DEMOS.gears);
      assert.equal(order.demo, ORDER_DEMOS.arch);
      assert.equal(sweet.demo, SWEET_DEMOS.radio);
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'location', previous);
    else Reflect.deleteProperty(globalThis, 'location');
  }
});
