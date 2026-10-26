/** Validate stored data before restore mutates a running simulation. No renderer or browser API. */
import { CLASSES } from './content.ts';
import type { SaveData } from './save-types.ts';

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
export function assertSaveData(value: unknown): asserts value is SaveData {
  if (
    !record(value) ||
    ![4, 5, 6].includes(value['v'] as number) ||
    !record(value['state']) ||
    !finite(value['rng'])
  )
    throw Error('Unsupported or damaged save');
  const state = value['state'];
  if (
    !finite(state['time']) ||
    !finite(state['tick']) ||
    !finite(state['gold']) ||
    !['build', 'waves', 'won', 'lost'].includes(state['phase'] as string)
  )
    throw Error('Invalid saved clock or phase');
  for (const name of ['heroes', 'nodes', 'buildings', 'sites', 'enemies'])
    if (!Array.isArray(state[name])) throw Error(`Invalid saved ${name}`);
  for (const h of state['heroes'] as unknown[]) {
    if (
      !record(h) ||
      !finite(h['id']) ||
      !finite(h['x']) ||
      !finite(h['z']) ||
      (h['cls'] === undefined
        ? value['v'] === 6
        : typeof h['cls'] !== 'string' || !Object.hasOwn(CLASSES, h['cls']))
    )
      throw Error('Invalid saved hero');
    if (
      value['v'] === 6 &&
      (!record(h['task']) ||
        typeof h['task']['k'] !== 'string' ||
        !record(h['bag']) ||
        !Array.isArray(h['path']) ||
        !Array.isArray(h['tools']))
    )
      throw Error('Invalid saved hero task or inventory');
  }
  // Stored JSON is a data tree. Never copy prototype-shaped keys or non-finite numbers into state.
  const pending: { v: unknown; depth: number }[] = [{ v: value, depth: 0 }];
  let visited = 0;
  while (pending.length) {
    const { v, depth } = pending.pop()!;
    if (++visited > 2_000_000 || depth > 64) throw Error('Save exceeds data limits');
    if (typeof v === 'number' && !Number.isFinite(v)) throw Error('Invalid saved number');
    if (v && typeof v === 'object')
      for (const [key, child] of Object.entries(v)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('Invalid saved key');
        pending.push({ v: child, depth: depth + 1 });
      }
  }
}
