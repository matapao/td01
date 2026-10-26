/** Add publication metadata to an already-built solo game. Never builds or executes the candidate. */
import { copyFileSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBundlePath, parseManifest } from '@zirbel/core/game-manifest';
import { GAME_HISTORY_LIMITS } from '@zirbel/core/game-history';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export type PlayableGame = 'td01';

/** Refuse links and incomplete/root-based Vite output before adding any files. */
export function checkPlayableDirectory(directory: string): void {
  const root = lstatSync(directory);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Build must be a regular directory');
  const seen = new Set<string>();
  let total = 0;
  let files = 0;
  function resource(raw: string, path: string): void {
    if (raw.startsWith('data:') || raw.startsWith('#')) return;
    const base = 'https://playable.invalid/snapshot/';
    const url = new URL(raw, base + path);
    if (
      !raw ||
      raw.startsWith('/') ||
      /^[a-z][a-z0-9+.-]*:/i.test(raw) ||
      raw.includes('%') ||
      url.origin !== 'https://playable.invalid' ||
      !url.pathname.startsWith('/snapshot/')
    )
      throw new Error('Rebuild with --base ./ so static resources stay inside the snapshot');
    const target = lstatSync(join(directory, url.pathname.slice('/snapshot/'.length)));
    if (!target.isFile() || target.isSymbolicLink()) throw new Error('Static playable resource is missing');
  }
  function visit(folder: string): void {
    for (const name of readdirSync(join(directory, folder))) {
      const path = folder ? `${folder}/${name}` : name;
      const stat = lstatSync(join(directory, path));
      if (stat.isSymbolicLink()) throw new Error('Playable builds cannot contain symlinks');
      if (name.startsWith('.')) continue; // Vite's diagnostic report is outside the playable capture.
      if (!isBundlePath(path) || seen.has(path.toLowerCase())) throw new Error('Invalid playable path');
      seen.add(path.toLowerCase());
      if (seen.size > GAME_HISTORY_LIMITS.files * 2) throw new Error('Too many playable entries');
      if (stat.isDirectory()) visit(path);
      else {
        if (!stat.isFile()) throw new Error('Playable builds contain only regular files');
        if (/\.(?:m4a|mp3|wav|ogg|aac|flac)$/i.test(path))
          throw new Error(
            'This candidate uses generated audio; remove unapproved recordings before publication',
          );
        if (++files > GAME_HISTORY_LIMITS.files) throw new Error('Too many playable files');
        total += stat.size;
        if (total > GAME_HISTORY_LIMITS.bytes) throw new Error('Playable build exceeds the snapshot limit');
        if (/\.(?:html?|css)$/i.test(path)) {
          const text = readFileSync(join(directory, path), 'utf8');
          if (/\.html?$/i.test(path)) {
            for (const tag of text.matchAll(/<(?:script|link|img|audio|video|source|iframe)\b[^>]*>/gi))
              for (const attribute of tag[0].matchAll(
                /\b(?:src|href|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
              ))
                resource(attribute[1] ?? attribute[2] ?? attribute[3] ?? '', path);
          } else {
            for (const value of text.matchAll(
              /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)|@import\s*["']([^"']+)["']/gi,
            ))
              resource(value[1] ?? value[2] ?? value[3] ?? value[4] ?? '', path);
          }
        }
      }
    }
  }
  visit('');
  if (!seen.has('index.html')) throw new Error('Playable build needs index.html');
}

export function preparePlayable(game: PlayableGame, root = ROOT): string {
  if (game !== 'td01') throw new Error('Unknown playable game');
  const source = root;
  const directory = join(source, 'dist');
  const raw: unknown = JSON.parse(readFileSync(join(source, 'zirbel.json'), 'utf8'));
  const { manifest, errors } = parseManifest(raw, { strict: false });
  const packageData: unknown = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  if (
    !manifest ||
    errors.length ||
    manifest.id !== game ||
    manifest.entry !== 'index.html' ||
    !packageData ||
    typeof packageData !== 'object' ||
    !('version' in packageData) ||
    packageData.version !== manifest.version
  )
    throw new Error('Source manifest must match the game and package version');
  checkPlayableDirectory(directory);
  copyFileSync(join(source, 'zirbel.json'), join(directory, 'zirbel.json'));
  copyFileSync(join(source, 'LICENSE'), join(directory, 'LICENSE.txt'));
  copyFileSync(join(root, 'node_modules/three/LICENSE'), join(directory, 'three-LICENSE.txt'));
  const credits = join(root, 'docs/CREDITS.md');
  copyFileSync(credits, join(directory, 'CREDITS.md'));
  if (game === 'td01') {
    copyFileSync(join(root, 'docs/AUDIO_SOURCES.md'), join(directory, 'AUDIO_SOURCES.md'));
    const escape = (text: string): string =>
      text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    writeFileSync(
      join(directory, 'credits.html'),
      `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TD01 credits</title><style>body{max-width:70ch;margin:3rem auto;padding:0 1.5rem;background:#211b38;color:#f2efe7;font:15px/1.6 system-ui}pre{white-space:pre-wrap;font:inherit}a{color:#f2cb84}</style><h1>TD01 credits</h1><p><a href="sound-credits.html">Sound credits</a> · <a href="AUDIO_SOURCES.md">Recording sources</a></p><pre>${escape(readFileSync(credits, 'utf8'))}</pre></html>\n`,
    );
  }
  checkPlayableDirectory(directory);
  return directory;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const game = process.argv[2];
  if (process.argv.length !== 3 || game !== 'td01')
    throw new Error('Usage: node scripts/prepare-playable.ts td01');
  console.log(`Prepared ${game}: ${preparePlayable(game)}`);
}
