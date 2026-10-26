/** Compile actual consumer code to keep the stricter contracts in the maintained gate. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiler = join(root, 'node_modules/typescript/bin/tsc');
const contracts = join(root, 'src/game').replaceAll('\\', '/');

async function compile(config: string, source: string, extension: 'ts' | 'mjs' = 'ts') {
  const directory = await mkdtemp(join(tmpdir(), 'td01-types-'));
  try {
    await writeFile(join(directory, 'package.json'), '{"type":"module"}');
    await writeFile(join(directory, `consumer.${extension}`), source);
    await writeFile(
      join(directory, 'tsconfig.json'),
      JSON.stringify({
        extends: join(root, config),
        compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022'], types: [] },
        include: [],
        files: [`./consumer.${extension}`],
      }),
    );
    const result = spawnSync(process.execPath, [compiler, '-p', join(directory, 'tsconfig.json')], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    if (result.error) throw result.error;
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('portable consumers accept commands and explicit live-state clearing without browser or Node globals', async () => {
  const result = await compile(
    'tsconfig.core.json',
    `import type { Command } from '${contracts}/command-types.ts';
import type { Hero } from '${contracts}/entity-types.ts';
export const placement: Command = { t: 'place', hero: 1, plan: 'tower', cx: 1, cz: 2 };
export function finishTravel(hero: Hero): void { hero.transit = undefined; hero.flight = undefined; }
export function first(values: number[]): number | undefined { return values[0]; }
`,
  );
  assert.equal(result.status, 0, result.output);
});

test('maintained adapters reject undefined command options, implicit returns and undeclared dictionary fields', async () => {
  const result = await compile(
    'tsconfig.base.json',
    `import type { Command } from '${contracts}/command-types.ts';
export const placement: Command = { t: 'place', hero: 1, plan: 'tower', cx: 1, cz: 2, rot: undefined };
export function maybe(flag: boolean) { if (flag) return 1; }
export const fields: Record<string, unknown> = {};
export const unknownField = fields.missing;
export const empty: number[] = [];
export const unchecked: number = empty[0];
`,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.output, /exactOptionalPropertyTypes/);
  assert.match(result.output, /TS7030/);
  assert.match(result.output, /TS4111/);
  assert.match(result.output, /TS2322/);
});

test('portable consumers must check array lookups and cannot access browser or Node globals', async () => {
  const result = await compile(
    'tsconfig.core.json',
    `export const values: number[] = [];
export const missing: number = values[0];
export const browser = document;
export const runtime = process;
`,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.output, /TS2322/);
  assert.match(result.output, /Cannot find name 'document'/);
  assert.match(result.output, /Cannot find name 'process'/);
});

test('checked JavaScript tools reject unchecked indexing and incomplete boundary contracts', async () => {
  const result = await compile(
    'tsconfig.tools.json',
    `/** @param {boolean} flag */
export function maybe(flag) { if (flag) return 1; }
/** @type {Record<string, unknown>} */
export const fields = {};
export const unknownField = fields.missing;
/** @type {number[]} */
export const values = [];
/** @type {number} */
export const unchecked = values[0];
/** @type {{speed?: number}} */
export const options = {speed: undefined};
`,
    'mjs',
  );
  assert.notEqual(result.status, 0);
  assert.match(result.output, /TS7030/);
  assert.match(result.output, /TS4111/);
  assert.match(result.output, /TS2322/);
  assert.match(result.output, /exactOptionalPropertyTypes/);
});
