import { ready } from './browser-fixture.mjs';
/**
 * Dev helper: screenshot a page once `window.__ready` is true.
 *   node scripts/shot.mjs <url> <out.png> [width=1600] [height=900] [extraWaitMs=600]
 */
import fs from 'node:fs';
import { launchBrowser } from './e2e/browser.mjs';

const [url, out, w = '1600', h = '900', extra = '600', evalFile] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node scripts/shot.mjs <url> <out.png> [w] [h] [extraWaitMs]');
  process.exit(1);
}
const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: Number(w), height: Number(h) });
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await ready(page, 60000);
  if (evalFile) {
    const code = fs.readFileSync(evalFile, 'utf8');
    await page.evaluate(code);
  }
  await new Promise((r) => setTimeout(r, Number(extra)));
  await page.screenshot({ path: out });
  if (errors.length) console.log('page errors:\n' + errors.join('\n'));
  console.log('saved', out);
} finally {
  await browser.close();
}
