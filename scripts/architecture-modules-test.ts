/** Exercise module boundary rules against isolated source trees, never the working checkout. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const checker = fileURLToPath(new URL('./architecture-check.mjs', import.meta.url));

async function check(sources: Record<string, string>) {
  const directory = await mkdtemp(join(tmpdir(), 'td01-module-contract-'));
  try {
    await Promise.all(['src', 'server', 'scripts'].map((name) => mkdir(join(directory, name))));
    await writeFile(join(directory, 'scripts/module-budgets.json'), '{}');
    await writeFile(join(directory, 'README.md'), '# Fixture\n');
    for (const [name, source] of Object.entries(sources)) {
      const path = join(directory, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, source);
    }
    const result = spawnSync(process.execPath, [checker], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30_000,
    });
    if (result.error) throw result.error;
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('focused modules can share type contracts without creating a runtime cycle', async () => {
  const result = await check({
    'src/ui/hud/services.ts':
      "import type { Panel } from './panel.ts'; export interface Services { panel?: Panel }",
    'src/ui/hud/panel.ts':
      "import { type Services } from './services.ts'; export interface Panel { services: Services }",
  });
  assert.equal(result.status, 0, result.output);
});

test('module leaves cannot import their coordinator, including through types', async () => {
  const result = await check({
    'src/game/content/parts.ts': "import { HERO } from '../content.ts'; export const hero = HERO;",
    'src/ui/hud/panel.ts': "import type { Hud } from '../hud.ts'; export type Owner = Hud;",
    'src/view/mine/lift.ts': "export { MineView } from '../mineview.ts';",
    'src/game/systems/crafting/work.ts': "import { applyCraftCommand } from '../craft.ts';",
    'src/game/systems/hero/tasks.ts': "import type { Hero } from '../heroes.ts';",
    'src/game/systems/combat/damage.ts': "export { damageEnemy } from '../combat.ts';",
  });
  assert.notEqual(result.status, 0);
  for (const source of [
    'content/parts.ts',
    'hud/panel.ts',
    'mine/lift.ts',
    'crafting/work.ts',
    'hero/tasks.ts',
    'combat/damage.ts',
  ])
    assert(result.output.includes(source), result.output);
  assert.match(result.output, /submodules cannot import their coordinator/);
});

test('focused catalogues and panels reject value import and re-export cycles', async () => {
  const result = await check({
    'src/game/content/a.ts': "export * from './b.ts';",
    'src/game/content/b.ts': "export * from './a.ts';",
    'src/ui/hud/a.ts': "export { value } from './b.ts';",
    'src/ui/hud/b.ts': "import './a.ts'; export const value = 1;",
    'src/view/mine/a.ts': "export const ready = import('./b.ts');",
    'src/view/mine/b.ts': "import './a.ts'; export const value = 1;",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /Runtime module cycle/);
  for (const directory of ['src/game/content/', 'src/ui/hud/', 'src/view/mine/'])
    assert(result.output.includes(directory), result.output);
});

test('runtime cycles cannot bypass checks with JavaScript, extensionless or directory aliases', async () => {
  const result = await check({
    'src/game/content/a.ts': "export * from './b.js';",
    'src/game/content/b.ts': "export * from './a.js';",
    'src/ui/hud/a.ts': "export { value } from './b';",
    'src/ui/hud/b.ts': "import './a'; export const value = 1;",
    'src/view/mine/a/index.ts': "export const ready = import('../b');",
    'src/view/mine/b/index.ts': "import '../a'; export const value = 1;",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /Runtime module cycle/);
  for (const directory of ['src/game/content/', 'src/ui/hud/', 'src/view/mine/'])
    assert(result.output.includes(directory), result.output);
});

test('runtime cycles cannot cross system boundaries through a shared world helper', async () => {
  const result = await check({
    'src/game/systems/combat/damage.ts':
      "import { damageHero } from '../hero/lifecycle.ts'; export const hit = damageHero;",
    'src/game/systems/hero/lifecycle.ts':
      "import { explode } from '../../blasting.ts'; export const damageHero = explode;",
    'src/game/blasting.ts': "import { hit } from './systems/combat/damage.ts'; export const explode = hit;",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /Runtime module cycle/);
  for (const source of ['combat/damage.ts', 'hero/lifecycle.ts', 'game/blasting.ts'])
    assert(result.output.includes(source), result.output);
});

test('static template imports and generated data cannot hide runtime cycles', async () => {
  const result = await check({
    'src/ui/hud/a.ts': 'export const ready = import(`./b.ts`);',
    'src/ui/hud/b.ts': "import './a.ts'; export const value = 1;",
    'src/ui/glyph-data.ts': 'export const ready = import(`./glyphs.ts`);',
    'src/ui/glyphs.ts': "import './glyph-data.ts'; export const value = 1;",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /Runtime module cycle/);
  for (const source of ['hud/a.ts', 'hud/b.ts', 'glyph-data.ts', 'glyphs.ts'])
    assert(result.output.includes(source), result.output);
});
