import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkPlayableDirectory, preparePlayable, type PlayableGame } from './prepare-playable.ts';

function fixture(game: PlayableGame): { root: string; source: string; build: string } {
  const root = mkdtempSync(join(tmpdir(), 'td01-playable-'));
  const source = root;
  const build = join(source, 'dist');
  mkdirSync(join(build, 'assets'), { recursive: true });
  mkdirSync(join(build, 'fonts'), { recursive: true });
  mkdirSync(join(root, 'node_modules/three'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'node_modules/three/LICENSE'), 'three.js MIT');
  writeFileSync(join(source, 'LICENSE'), 'MIT');
  writeFileSync(join(root, 'docs/CREDITS.md'), '# Credits\nArtist <source>');
  writeFileSync(join(root, 'docs/AUDIO_SOURCES.md'), '# Audio sources');
  writeFileSync(join(source, 'CREDITS.md'), '# Credits\nArtist');
  writeFileSync(join(source, 'package.json'), JSON.stringify({ version: '0.2.0' }));
  writeFileSync(
    join(source, 'zirbel.json'),
    JSON.stringify({ id: game, version: '0.2.0', title: game, players: { min: 1, max: 1 }, stage: 'alpha' }),
  );
  writeFileSync(
    join(build, 'index.html'),
    '<!doctype html><link rel="stylesheet" href="./assets/game.css"><script type="module" src="./assets/game.js"></script>',
  );
  writeFileSync(join(build, 'assets/game.js'), 'document.body.dataset.playable = "yes";');
  writeFileSync(join(build, 'assets/game.css'), '@font-face{font-family:game;src:url(../fonts/game.woff2)}');
  writeFileSync(join(build, 'fonts/game.woff2'), 'fixture-font');
  writeFileSync(join(build, 'sound-credits.html'), '<!doctype html><title>Sound credits</title>');
  writeFileSync(join(build, 'credits.html'), '<!doctype html><title>Credits</title>');
  return { root, source, build };
}

test('the standalone td01 candidate retain local resources, identity and licences', (t) => {
  for (const game of ['td01'] as const) {
    const { root, build } = fixture(game);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.equal(preparePlayable(game, root), build);
    const manifest = JSON.parse(readFileSync(join(build, 'zirbel.json'), 'utf8')) as { id: string };
    assert.equal(manifest.id, game);
    assert.equal(readFileSync(join(build, 'LICENSE.txt'), 'utf8'), 'MIT');
    assert.equal(readFileSync(join(build, 'three-LICENSE.txt'), 'utf8'), 'three.js MIT');
    if (game === 'td01')
      assert.match(readFileSync(join(build, 'credits.html'), 'utf8'), /Artist &lt;source&gt;/);
    checkPlayableDirectory(build);
  }
});

test('mismatched source identity cannot overwrite candidate metadata', (t) => {
  const { root, source, build } = fixture('td01');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(source, 'zirbel.json'), '{"id":"other","version":"0.2.0"}');
  assert.throws(() => preparePlayable('td01', root), /manifest/);
  assert.throws(() => readFileSync(join(build, 'zirbel.json')), /ENOENT/);
});

test('root, external and missing static resources fail instead of producing a broken archive', (t) => {
  const { root, build } = fixture('td01');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ['/assets/game.js', 'https://other.invalid/game.js', './missing.js']) {
    writeFileSync(join(build, 'index.html'), `<script src="${path}"></script>`);
    assert.throws(() => checkPlayableDirectory(build));
  }
  writeFileSync(join(build, 'index.html'), '<link rel="stylesheet" href="./assets/game.css">');
  writeFileSync(join(build, 'assets/game.css'), '@font-face{src:url(/fonts/game.woff2)}');
  assert.throws(() => checkPlayableDirectory(build), /base/);
});

test('a candidate cannot read linked files outside its build', (t) => {
  const { root, build } = fixture('td01');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  symlinkSync(join(root, 'LICENSE'), join(build, 'linked.txt'));
  assert.throws(() => checkPlayableDirectory(build), /symlink/);
});

test('a stale build cannot republish removed recording files', (t) => {
  const { root, build } = fixture('td01');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(build, 'old-recording.m4a'), 'unapproved recording');
  assert.throws(() => checkPlayableDirectory(build), /recordings/);
});
