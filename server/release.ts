// A release is the game as it was when the server started: a version (a hash of every source
// file) and the built browser files, kept in memory. Serving from memory means that editing or
// rebuilding while people play never hands someone a page that the running server doesn't match.

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

// What counts as the game's code (for the version). New dependencies need npm install and a restart by hand.
const SOURCES = ['src', 'server', 'public'];

export interface Release {
  version: string;
  /** Built browser files by URL path (no leading slash). */
  files: Map<string, Buffer>;
}

export async function loadRelease(root: string, dist: string): Promise<Release> {
  const files = new Map<string, Buffer>();
  for (const path of await listFiles(dist)) {
    const body = await readFile(join(dist, path)).catch(() => null);
    if (body) files.set(path, body);
  }
  if (!files.has('index.html')) throw new Error(`No build in ${dist} — run "npm run lan" (it builds first).`);
  return { version: await fingerprint(root), files };
}

/** The version of the code on disk right now. */
export async function fingerprint(root: string): Promise<string> {
  const hash = createHash('sha256');
  const paths = ['package.json', 'index.html'];
  for (const folder of SOURCES)
    for (const p of await listFiles(join(root, folder))) paths.push(`${folder}/${p}`);
  paths.sort();
  for (const path of paths) {
    // Editors write temporary files that can vanish between listing and reading.
    const body = await readFile(join(root, path)).catch(() => null);
    if (body) hash.update(`${path}\0${body.length}\0`).update(body);
  }
  return hash.digest('hex').slice(0, 12);
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (!e.isFile() || e.name.startsWith('.') || e.name.endsWith('~')) continue;
    out.push(relative(dir, join(e.parentPath, e.name)).split(sep).join('/'));
  }
  return out;
}
