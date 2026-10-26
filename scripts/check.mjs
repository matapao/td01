/** One reproducible local/CI gate. No downloads, source rewrites or disabled assertions. */
import { spawnSync } from 'node:child_process';
for (const name of ['check:standards', 'format:check', 'typecheck', 'check:architecture', 'test', 'build']) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', name], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
