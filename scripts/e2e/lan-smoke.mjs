import { ready } from '../browser-fixture.mjs';
import { required } from '../../src/core/required.ts';
/** Production bundle, real HTTP security headers and authoritative LAN state in Chrome. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { startServer } from '../../server/index.ts';
import { launchBrowser } from './browser.mjs';
import {
  requestedFiles,
  assertVillageStartup,
  exerciseDeferredScreens,
  exercisePlaygrounds,
  exerciseFailedDownload,
} from './deferred-loading.mjs';

/** @type {Map<string, import('../../server/saves.ts').SavedGame>} */
const games = new Map();
const server = await startServer({
  port: 0,
  host: '127.0.0.1',
  dist: resolve('dist'),
  saves: {
    kind: 'files',
    async save(game) {
      games.set('ABC234', structuredClone(game));
      return 'ABC234';
    },
    async load(code) {
      return games.get(code) ?? null;
    },
    async list() {
      return [];
    },
  },
});
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  const files = requestedFiles(page);
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: process.env['CI'] ? 0.5 : 1 });
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text());
  });
  await page.evaluateOnNewDocument(() => localStorage.setItem('craftdef:guide', 'off'));
  const response = await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'domcontentloaded' });
  assert(response, 'production page responds');
  assert(required(response.headers()['content-security-policy']).includes("script-src 'self'"));
  await ready(page);
  console.log(
    'LAN browser rendering environment',
    await page.evaluate(() => {
      const renderer = window.__game.stage.renderer;
      const gl = renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        devicePixelRatio: window.devicePixelRatio,
        cssWidth: window.innerWidth,
        cssHeight: window.innerHeight,
        rendererPixelRatio: renderer.getPixelRatio(),
        drawingWidth: renderer.domElement.width,
        drawingHeight: renderer.domElement.height,
        renderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'unavailable',
      };
    }),
  );
  assertVillageStartup(files);
  await page.waitForSelector('.lan-name input');
  await page.$eval('.lan-name input', (input) => {
    if (!(input instanceof HTMLInputElement)) throw Error('Expected player name input');
    input.value = '<b>Alva</b>';
  });
  await page.locator('.lan-join button.call').click();
  await page.waitForFunction(() => document.querySelector('.lan-who')?.textContent.includes('<b>Alva</b>'));
  assert.equal(await page.$('.lan-who b'), null, 'player names render as text, never markup');
  const hero = required(server.room.playerList()[0]).hero;
  await page.waitForFunction((id) => window.__game.localHero === id, {}, hero);
  await page.locator('.lan-tools [data-a="pause"]').click();
  await page.waitForFunction(() => document.querySelector('.lan-paused:not(.hidden)'));
  assert(server.room.paused, 'pause reaches the authoritative host');
  await page.locator('.lan-paused button').click();
  await page.waitForFunction(() => !document.querySelector('.lan-paused:not(.hidden)'));
  await page.locator('.lan-tools [data-a="save"]').click();
  await page.waitForFunction(() => document.querySelector('.lan-tools')?.textContent.includes('ABC234'));
  assert(games.has('ABC234'), 'production browser saves through the host');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready(page);
  await page.waitForSelector('.lan-name input');
  await page.locator('.lan-join button.call').click();
  await page.waitForFunction(
    (id) =>
      window.__game.localHero === id &&
      document.querySelector('.lan-who')?.textContent.includes('<b>Alva</b>'),
    {},
    hero,
  );
  assert.equal(server.room.playerList().length, 1, 'reload resumes the existing hero');
  await exerciseDeferredScreens(page, server, files);
  assert.deepEqual(
    errors,
    [],
    'production assets, scripts and network pass security policy without browser errors',
  );
  await page.close();
  await exerciseFailedDownload(browser, `http://127.0.0.1:${server.port}`, server);
  await exercisePlaygrounds(browser, `http://127.0.0.1:${server.port}`);
  console.log('PASS: production Chrome boot, security policy, safe names, LAN join/pause/save and reload');
} finally {
  await browser?.close();
  await server.close();
}
