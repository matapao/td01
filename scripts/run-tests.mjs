/** Automatically discover maintained headless tests; LAN and Chrome have explicit integration jobs. */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const typescriptTests = readdirSync(new URL('.', import.meta.url))
  .filter((f) => f.endsWith('-test.ts') && f !== 'lan-test.ts')
  .sort()
  .map((f) => `scripts/${f}`);
if (!typescriptTests.length) throw Error('No tests discovered');
const files = [...typescriptTests, 'scripts/assets/asset-data.test.mjs'];
const result = spawnSync(
  process.execPath,
  ['--test', '--test-concurrency=2', '--test-timeout=60000', ...files],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
