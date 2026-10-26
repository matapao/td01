import { ready } from '../browser-fixture.mjs';
/** Run against a built/served candidate: source-free sound works without a recording request. */
import assert from 'node:assert/strict';
import { launchBrowser } from './browser.mjs';
const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  /** @type {string[]} */
  const requests = [];
  /** @type {string[]} */
  const errors = [];
  page.on('request', (request) => {
    if (/\.(?:m4a|mp3|wav|ogg|aac|flac)(?:[?#]|$)/i.test(request.url())) requests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await ready(page);
  await page.mouse.click(2, 2);
  await page.waitForFunction(() => window.__audio.status().state === 'running');
  await page.evaluate(async () => {
    for (const cue of ['click', 'mine', 'boom', 'horn', 'unknown-cue']) window.__audio.play(cue);
    window.__audio.update(1);
    for (let i = 0; i < 12; i++) await new Promise(requestAnimationFrame);
  });
  const status = await page.evaluate(() => window.__audio.status());
  assert.equal(status.mode, 'synthesized');
  assert.equal(status.ready, 0);
  assert.equal(status.waiting, 0);
  assert.deepEqual(status.failed, []);
  assert.deepEqual(requests, [], 'input and sound effects must not request a recording');
  assert.deepEqual(errors, []);
  console.log('PASS: real Web Audio initialized and played generated cues without recording requests.');
} finally {
  await browser.close();
}
