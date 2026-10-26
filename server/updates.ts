// Watches the game's code while it runs. When the files change and then stay put for a moment, it
// checks the new version (it typechecks, builds, and the new server starts) and offers it to the
// players, who choose when to switch. index.ts does the switch; promote() puts the new build live.

import { execFile } from 'node:child_process';
import { rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { fingerprint } from './release.ts';

const run = promisify(execFile);

// offer(version) is called with a new version once it passes the checks, and with null when the
// files change again (or back) so that the version on offer is no longer what's on disk.
export function watchForUpdates({
  root,
  version,
  offer,
  log = console.log,
  every = 1500,
  settle = 2000,
}: {
  root: string;
  version: string;
  offer: (version: string | null) => void;
  log?: (msg: string) => void;
  every?: number;
  settle?: number;
}) {
  let seen = version; // the newest version on disk
  let seenAt = 0; // when it showed up
  let offered: string | null = null;
  const verdicts = new Map<string, string | null>(); // version → null when it's good, or what's wrong with it
  let busy = false;
  const next = join(root, '.lan', 'next');

  function withdraw() {
    if (offered === null) return;
    offered = null;
    offer(null);
  }

  async function poll() {
    const current = await fingerprint(root);
    if (current !== seen) {
      // Probably still being edited: wait until the files settle.
      seen = current;
      seenAt = Date.now();
      withdraw();
      return;
    }
    if (current === version || current === offered || Date.now() - seenAt < settle) return;
    if (!verdicts.has(current)) {
      log('\nThe code changed — checking the new version…');
      const problem = await check(root, next);
      if ((await fingerprint(root)) !== current) return; // changed during the check; check again once it settles
      verdicts.set(current, problem);
      if (problem) log(`\nThe new version has an error, so it isn't offered:\n${problem}\n`);
    }
    if (verdicts.get(current)) return;
    offered = current;
    log(
      '\nA new version is ready. Anyone can press U in the game (or click Update) to switch everyone over.\n',
    );
    offer(current);
  }

  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await poll();
    } catch {
      // A file vanished or moved mid-read; the next poll sees how things ended up.
    } finally {
      busy = false;
    }
  }, every);

  return {
    /** The version on offer, if the files on disk still match it, or null. Puts its build live. */
    async confirm(): Promise<string | null> {
      if (offered === null) return null;
      if ((await fingerprint(root).catch(() => null)) !== offered) return null;
      const dist = join(root, '.lan', 'dist');
      await rm(dist, { recursive: true, force: true });
      await rename(next, dist);
      return offered;
    },
    stop() {
      clearInterval(timer);
    },
  };
}

// Null when the new version typechecks, builds and its server starts, or else what went wrong.
async function check(root: string, out: string): Promise<string | null> {
  const entry = JSON.stringify(pathToFileURL(join(root, 'server/index.ts')).href);
  const boot = `const { startServer } = await import(${entry});
const server = await startServer({ port: 0, host: '127.0.0.1', dist: ${JSON.stringify(out)} });
await server.close();
process.exit(0);`;
  try {
    // A browser-only check would miss a broken server after the environment configs split.
    for (const config of [
      'tsconfig.json',
      'tsconfig.server.json',
      'tsconfig.scripts.json',
      'tsconfig.core.json',
    ])
      await run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', config], {
        cwd: root,
        timeout: 120_000,
      });
    await run(
      process.execPath,
      [
        join(root, 'node_modules/vite/bin/vite.js'),
        'build',
        '--outDir',
        out,
        '--emptyOutDir',
        '--logLevel',
        'error',
      ],
      {
        cwd: root,
        timeout: 180_000,
      },
    );
    await run(process.execPath, ['--input-type=module', '--eval', boot], {
      cwd: root,
      timeout: 30_000,
    });
    return null;
  } catch (e) {
    const { stdout, stderr, message } = e as { stdout?: string; stderr?: string; message: string };
    return ((stderr || stdout || '').trim() || message).split('\n').slice(0, 10).join('\n');
  }
}
