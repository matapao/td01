import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('test discovery refuses an assets-only suite and keeps LAN and archives separate', () => {
  const root = mkdtempSync(join(tmpdir(), 'td-test-discovery-'));
  try {
    mkdirSync(join(root, 'scripts/assets'), { recursive: true });
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    copyFileSync(new URL('./run-tests.mjs', import.meta.url), join(root, 'scripts/run-tests.mjs'));
    writeFileSync(join(root, 'scripts/lan-test.ts'), 'throw new Error("LAN must run separately");');
    writeFileSync(join(root, 'scripts/sim-test.legacy.ts'), 'throw new Error("Archive must stay excluded");');
    writeFileSync(
      join(root, 'scripts/assets/asset-data.test.mjs'),
      'import { test } from "node:test"; import { writeFileSync } from "node:fs"; test("asset fixture", () => writeFileSync("asset-ran", "yes"));',
    );
    const childEnv = { ...process.env };
    delete childEnv['NODE_TEST_CONTEXT'];
    const run = () =>
      spawnSync(process.execPath, ['scripts/run-tests.mjs'], {
        cwd: root,
        encoding: 'utf8',
        timeout: 10000,
        env: childEnv,
      });
    const empty = run();
    assert.notEqual(empty.status, 0);
    assert.match(empty.stderr, /No tests discovered/);
    assert.equal(existsSync(join(root, 'asset-ran')), false);
    writeFileSync(
      join(root, 'scripts/typed-test.ts'),
      'import { test } from "node:test"; import { writeFileSync } from "node:fs"; test("typed fixture", () => writeFileSync("typed-ran", "yes"));',
    );
    const discovered = run();
    assert.equal(discovered.status, 0, discovered.stderr + discovered.stdout);
    assert.equal(readFileSync(join(root, 'typed-ran'), 'utf8'), 'yes');
    assert.equal(readFileSync(join(root, 'asset-ran'), 'utf8'), 'yes');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
