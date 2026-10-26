import { ready } from '../browser-fixture.mjs';
import { required } from '../../src/core/required.ts';
/** Verify the actual production network graph, not just source-level import intent. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MILESTONES } from '../../src/game/road.ts';
import { SPACE } from '../../src/game/space.ts';

/** @returns {{ chunks: Record<string, { modules: string[] }> }} */
function readBundle() {
  /** @type {unknown} */
  const raw = JSON.parse(readFileSync('dist/.vite/bundle-report.json', 'utf8'));
  assert(raw && typeof raw === 'object' && 'chunks' in raw);
  assert(raw.chunks && typeof raw.chunks === 'object' && !Array.isArray(raw.chunks));
  /** @type {Record<string, { modules: string[] }>} */
  const chunks = {};
  for (const [file, chunk] of Object.entries(raw.chunks)) {
    assert(chunk && typeof chunk === 'object' && 'modules' in chunk);
    assert(
      Array.isArray(chunk.modules) &&
        chunk.modules.every((/** @type {unknown} */ source) => typeof source === 'string'),
    );
    chunks[file] = { modules: chunk.modules };
  }
  return { chunks };
}
export const bundle = readBundle();
/** @param {string} source */
const fileFor = (source) => {
  const entry = Object.entries(bundle.chunks).find(([, chunk]) => chunk.modules.includes(source));
  assert(entry, `missing production chunk for ${source}`);
  return entry[0];
};
const kinds = [
  'band',
  'ratio',
  'sizes',
  'path',
  'beat',
  'steady',
  'separate',
  'order',
  'decide',
  'sweet',
  'observe',
  'encode',
];
const gameFiles = new Map(kinds.map((kind) => [kind, fileFor(`src/ui/minigames/${kind}.ts`)]));
const roadFile = fileFor('src/ui/road-window.ts');
const spaceFile = fileFor('src/view/spaceview.ts');
/** @param {import('puppeteer-core').Page} page */
export function requestedFiles(page) {
  /** @type {Set<string>} */
  const files = new Set();
  page.on('request', (request) => files.add(new URL(request.url()).pathname.slice(1)));
  return files;
}
/** @param {ReadonlySet<string>} files */
export function assertVillageStartup(files) {
  for (const file of [...gameFiles.values(), roadFile, spaceFile])
    assert(!files.has(file), `${file} must not be downloaded at village startup`);
}
/** @param {import('puppeteer-core').Page} page @param {string} selector @param {string} text */
const clickText = async (page, selector, text) => {
  const element = await page.evaluateHandle(
    ({ selector, text }) => {
      const element = [...document.querySelectorAll(selector)].find(
        (el) => (el.textContent ?? '').trim() === text,
      );
      if (!(element instanceof HTMLElement)) throw Error(`Missing ${text}`);
      return element;
    },
    { selector, text },
  );
  await element.click();
  await element.dispose();
};

/** @param {import('puppeteer-core').Page} page @param {Awaited<ReturnType<typeof import('../../server/index.ts').startServer>>} server @param {ReadonlySet<string>} files */
export async function exerciseDeferredScreens(page, server, files) {
  await page.keyboard.press('KeyO');
  await page.waitForSelector('.road-card');
  assert(files.has(roadFile), 'opening the Road requests its screen');
  for (const file of gameFiles.values())
    assert(!files.has(file), 'browsing eras must not load game implementations');
  await page.keyboard.press('Escape');
  // Isolated later-era fixture: Steel is a real, unlocked anvil lesson; no new product progression is added.
  const sim = server.room.sim;
  const hero = required(sim.getAs(required(server.room.playerList()[0]).hero, 'hero'));
  const workshop = required(sim.state.buildings.find((b) => b.kind === 'anvil'));
  sim.state.road = { done: ['bronze'], best: { bronze: 1 } };
  hero.x = hero.px = workshop.x;
  hero.z = hero.pz = workshop.z;
  hero.path = [];
  hero.task = { k: 'idle' };
  Object.assign(hero.bag, required(MILESTONES['steel']).cost);
  const bag = structuredClone(hero.bag);
  server.room.pause(false, null);
  await page.waitForFunction(() => window.__game.sim.state.road?.done.includes('bronze'));
  await page.setRequestInterception(true);
  /** @type {{ request: import('puppeteer-core').HTTPRequest | null }} */
  const held = { request: null };
  /** @param {import('puppeteer-core').HTTPRequest} request */
  const intercept = (request) => {
    if (new URL(request.url()).pathname.slice(1) === gameFiles.get('ratio')) held.request = request;
    else void request.continue();
  };
  page.on('request', intercept);
  try {
    await page.keyboard.press('KeyO');
    await page.waitForSelector('.road-card');
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('.road-card')].find(
        (c) => c.querySelector('.c-name')?.textContent === 'Steel',
      );
      if (!(card instanceof HTMLElement)) throw Error('Missing Steel road card');
      card.click();
    });
    await page.waitForSelector('.mg-loading');
    const until = Date.now() + 15000;
    while (!held.request) {
      assert(Date.now() < until, 'selected game download was not requested');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await clickText(page, '.mg-loading button', 'Cancel');
    await held.request.continue();
    held.request = null;
    await page.waitForNetworkIdle({ idleTime: 300 });
    assert.equal(await page.$('.mg-panel'), null, 'cancelled downloads cannot open a late board');
    assert(!required(sim.state.road).done.includes('steel'));
    assert.deepEqual(hero.bag, bag, 'cancelling a pending lesson spends no materials');
  } finally {
    if (held.request) await held.request.continue();
    page.off('request', intercept);
    await page.setRequestInterception(false);
  }
  await page.keyboard.press('KeyO');
  await page.waitForSelector('.road-card');
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.road-card')].find(
      (c) => c.querySelector('.c-name')?.textContent === 'Steel',
    );
    if (!(card instanceof HTMLElement)) throw Error('Missing Steel road card');
    card.click();
  });
  await page.waitForSelector('.mg-panel[data-age="metal"] canvas');
  for (const [kind, file] of gameFiles)
    assert.equal(files.has(file), kind === 'ratio', `invention must load only ratio, not ${kind}`);
  // Save/rejoin continuity was checked by the caller; visiting Space now exercises its deferred renderer.
  hero.x = hero.px = SPACE.x;
  hero.z = hero.pz = SPACE.z;
  await page.waitForFunction(
    (z) => window.__game.sim.state.heroes.some((h) => Math.abs(h.z - z) < 1),
    {},
    SPACE.z,
  );
  await page.waitForFunction(() => !!window.__game.inSpace);
  await page.waitForNetworkIdle({ idleTime: 500 });
  assert(files.has(spaceFile), 'entering Space requests the later-era renderer');
  console.log(
    'PASS: village deferral, Road without games, cancelled download, selected lesson only, and lazy Space entry',
  );
}

/** @param {import('puppeteer-core').Browser} browser @param {string} base */
export async function exercisePlaygrounds(browser, base) {
  for (const kind of kinds) {
    const page = await browser.newPage();
    try {
      const files = requestedFiles(page);
      /** @type {string[]} */
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text());
      });
      await page.goto(`${base}/?minigame=${kind}&guided=0`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.mg-root canvas');
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      assert(
        await page.$eval('.mg-root canvas', (canvas) => {
          if (!(canvas instanceof HTMLCanvasElement)) throw Error('Expected playground canvas');
          return canvas.toDataURL().length > 1000;
        }),
        `${kind} draws its board`,
      );
      for (const [other, file] of gameFiles)
        assert.equal(files.has(file), kind === other, `${kind} playground must not request ${other}`);
      assert(!files.has(spaceFile));
      assert.deepEqual(errors, [], `${kind} playground browser errors`);
    } finally {
      await page.close();
    }
  }
  console.log('PASS: all twelve production playgrounds draw without fetching unrelated minigames');
}

/** @param {import('puppeteer-core').Browser} browser @param {string} base @param {Awaited<ReturnType<typeof import('../../server/index.ts').startServer>>} server */
export async function exerciseFailedDownload(browser, base, server) {
  const page = await browser.newPage();
  if (process.env['CI']) {
    const size = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    await page.setViewport({ ...size, deviceScaleFactor: 0.5 });
  }
  /** @type {string[]} */
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  let aborted = false;
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (!aborted && new URL(request.url()).pathname.slice(1) === gameFiles.get('ratio')) {
      aborted = true;
      void request.abort('failed');
    } else void request.continue();
  });
  await page.evaluateOnNewDocument(() => localStorage.setItem('craftdef:guide', 'off'));
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.$eval('.lan-name input', (input) => {
      if (!(input instanceof HTMLInputElement)) throw Error('Expected player name input');
      input.value = 'Chunk retry';
    });
    await page.click('.lan-join button.call');
    await page.waitForFunction(() => document.querySelector('.lan-who')?.textContent.includes('Chunk retry'));
    const heroId = required(server.room.playerList().find((player) => player.name === 'Chunk retry')).hero;
    const sim = server.room.sim,
      hero = required(sim.getAs(heroId, 'hero'));
    const workshop = required(sim.state.buildings.find((b) => b.kind === 'anvil'));
    hero.x = hero.px = workshop.x;
    hero.z = hero.pz = workshop.z;
    Object.assign(hero.bag, required(MILESTONES['steel']).cost);
    const bag = structuredClone(hero.bag);
    await page.waitForFunction(
      ({ x, z }) => {
        const g = window.__game,
          h = g.sim.state.heroes.find((h) => h.id === g.localHero);
        return h && Math.hypot(h.x - x, h.z - z) < 1;
      },
      {},
      workshop,
    );
    await page.keyboard.press('KeyO');
    await page.waitForSelector('.road-card');
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('.road-card')].find(
        (c) => c.querySelector('.c-name')?.textContent === 'Steel',
      );
      if (!(card instanceof HTMLElement)) throw Error('Missing Steel road card');
      card.click();
    });
    await page.waitForFunction(() =>
      document.querySelector('.mg-loading')?.textContent.includes('could not load'),
    );
    assert(aborted);
    assert(!required(sim.state.road).done.includes('steel'));
    assert.deepEqual(hero.bag, bag, 'a failed optional download cannot spend crafting materials');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      clickText(page, '.mg-loading button', 'Reload game'),
    ]);
    await ready(page);
    await page.click('.lan-join button.call');
    await page.waitForFunction((id) => window.__game.localHero === id, {}, heroId);
    await page.keyboard.press('KeyO');
    await page.waitForSelector('.road-card');
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('.road-card')].find(
        (c) => c.querySelector('.c-name')?.textContent === 'Steel',
      );
      if (!(card instanceof HTMLElement)) throw Error('Missing Steel road card');
      card.click();
    });
    await page.waitForSelector('.mg-panel[data-age="metal"] canvas');
    assert.deepEqual(hero.bag, bag);
    assert.deepEqual(pageErrors, [], 'failed downloads are handled without uncaught browser errors');
    console.log('PASS: failed optional download preserves materials and recovers after reload/rejoin');
  } finally {
    await page.close();
  }
}
