import type { GridPt, PathParams } from './path-data.ts';

/** Grid indices are stored in Int16 buffers; every authored terminal/run point must fit that board. */
export function validatePathGrid(p: PathParams): void {
  if (
    !Number.isInteger(p.cols) ||
    !Number.isInteger(p.rows) ||
    p.cols < 2 ||
    p.rows < 2 ||
    p.cols * p.rows > 32767
  )
    throw new Error('Path board dimensions must fit its grid buffers');
  if (p.gauges && (p.gauges.length === 0 || p.gauges.length > 128))
    throw new Error('Path board needs gauges that fit its wire buffer');
  const point = (q: GridPt): void => {
    if (
      !Number.isInteger(q[0]) ||
      !Number.isInteger(q[1]) ||
      q[0] < 0 ||
      q[0] >= p.cols ||
      q[1] < 0 ||
      q[1] >= p.rows
    )
      throw new Error('Path board point lies outside its grid');
  };
  if (p.source) {
    point(p.source.plus);
    point(p.source.minus);
  }
  if (p.start) point(p.start.at);
  for (const stop of p.stops ?? []) point(stop.at);
  for (const obstacle of p.obstacles ?? []) point(obstacle.at);
  for (const component of [...(p.loads ?? []), ...(p.fuses ?? [])]) {
    point(component.a);
    point(component.b);
  }
  for (const run of [...(p.laid ?? []), ...(p.hint ?? [])]) {
    for (const q of run.path) point(q);
    if (run.gauge !== undefined && (!Number.isInteger(run.gauge) || run.gauge < 0))
      throw new Error('Path run gauge must be a nonnegative whole number');
  }
}
