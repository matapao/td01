/**
 * Two real browsers on a running LAN server: both join, see each other's heroes, one walks (WASD)
 * and the other sees it move, one saves the game and both get the code.
 *   node scripts/lan-browser-test.mjs [url=http://localhost:7777/]
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:7777/';
const outDir = 'scripts/out';
fs.mkdirSync(outDir, { recursive: true });
const chrome = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => p && fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = async (msg) => {
  console.error('FAIL:', msg);
  await browser.close();
  process.exit(1);
};
const open = async (name, cls = 'tank') => {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('favicon') && errors.push(`${name}: ${m.text()}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 60000 });
  await page.waitForSelector('.lan-join input', { timeout: 10000 });
  await page.$eval('.lan-join input', (el) => (el.value = ''));
  await page.type('.lan-join input', name);
  await page.click(`.lan-class[data-cls="${cls}"]`);
  await page.click('.lan-join button.call');
  await page.waitForFunction('window.__game.localHero !== 999999999 && window.__game.sim.getAs(window.__game.localHero, "hero")', { timeout: 10000 });
  return page;
};
const heroPos = (page, id) => page.evaluate((id) => {
  const h = window.__game.sim.getAs(id ?? window.__game.localHero, 'hero');
  return h && { x: h.x, z: h.z, id: h.id, name: h.name };
}, id);

const a = await open('Alva', 'support');
const b = await open('Bjorn');
console.log('  ✓ both joined');
await wait(500);
const heroesB = await b.evaluate(() => window.__game.sim.state.heroes.map((h) => h.name));
if (!heroesB.includes('Alva') || !heroesB.includes('Bjorn')) await fail(`B should see both heroes, sees ${heroesB}`);
console.log(`  ✓ B sees ${heroesB.join(' + ')}`);
{
  // Camps and the like were there before B joined: B draws every one of them anyway.
  const r = await b.evaluate(() => {
    const g = window.__game;
    const alive = g.sim.state.enemies.filter((e) => e.hp > 0 && g.sim.getAs(e.id, 'enemy'));
    const missing = alive.filter((e) => !g.views.creatureShown(e.id));
    return { alive: alive.length, missing: missing.length };
  });
  if (r.alive < 10 || r.missing) await fail(`B draws ${r.alive - r.missing} of ${r.alive} creatures`);
  console.log(`  ✓ B draws all ${r.alive} creatures (camps included)`);
}
// Everyone's picture is alive and draws the other players' heroes.
for (const [page, who] of [[a, 'A'], [b, 'B']]) {
  const r = await page.evaluate(async () => {
    const g = window.__game;
    const f0 = g.frames;
    await new Promise((res) => setTimeout(res, 600));
    const others = g.sim.state.heroes.filter((h) => h.id !== g.localHero);
    const drawn = others.filter((h) => {
      const v = g.views.heroes.get(h.id);
      if (!v || !v.ch.root.visible || !v.ch.root.parent) return false;
      return Math.hypot(v.pos.x - h.x, v.pos.z - h.z) < 1.5;
    });
    return { frames: g.frames - f0, others: others.length, drawn: drawn.length };
  });
  if (r.frames < 5) await fail(`${who}'s picture froze (${r.frames} frames in 0.6 s)`);
  if (r.drawn !== r.others || r.others < 1) await fail(`${who} draws ${r.drawn} of ${r.others} other heroes`);
  console.log(`  ✓ ${who}'s picture is live (${r.frames} frames in 0.6 s) and shows the other hero`);
}
const me = await heroPos(a);
const before = await heroPos(b, me.id);
await a.keyboard.down('KeyW');
await wait(900);
await a.keyboard.up('KeyW');
await wait(400);
const after = await heroPos(b, me.id);
const moved = Math.hypot(after.x - before.x, after.z - before.z);
if (moved < 1) await fail(`B should see Alva walk (moved ${moved.toFixed(2)})`);
console.log(`  ✓ B watched Alva walk ${moved.toFixed(1)} m`);
// Alva builds a tower the real way — a hammer from the Market, up the stair onto the wall-walk, the
// plan laid out over the wall, the parts bought, hammered up with F from the walk — and crews it from
// up there: Bjorn sees her at her post (the crew glowing), then free of it once she comes down.
{
  const me2 = () => heroPos(a);
  /** Hold W toward (x, z) along the game's path round things, turning like a player, until within `stop`. */
  const walk = async (x, z, stop, what) => {
    const h0 = await me2();
    const wps = (await a.evaluate(([a0, b0, c0, d0]) => window.__path(a0, b0, c0, d0), [h0.x, h0.z, x, z])) ?? [];
    let wi = 0;
    const trail = [];
    await a.keyboard.down('KeyW');
    try {
      for (let t0 = Date.now(); Date.now() - t0 < 40000; ) {
        const h = await me2();
        trail.push(`${h.x.toFixed(1)},${h.z.toFixed(1)}`);
        if (Math.hypot(x - h.x, z - h.z) <= stop) return;
        while (wi + 1 < wps.length && Math.hypot(wps[wi] - h.x, wps[wi + 1] - h.z) < 0.8) wi += 2;
        const to = wi + 1 < wps.length && Math.hypot(x - h.x, z - h.z) > 4 ? [wps[wi], wps[wi + 1]] : [x, z];
        await a.evaluate(([x, z]) => window.__debug.look(x, z), to);
        await wait(60);
      }
    } finally {
      await a.keyboard.up('KeyW');
    }
    await a.screenshot({ path: `${outDir}/lan-walk-fail.png` });
    await fail(`Alva could not walk to ${what} (path ${wps.map((v) => v.toFixed(1)).join(' ')}; trail ${trail.filter((_, i) => i % 15 === 0).join(' ')})`);
  };
  const door = await a.evaluate(async () => {
    const { frontDoor } = await import('/src/game/systems/rooms.ts');
    return frontDoor(window.__game.sim.state.buildings.find(b => b.kind === 'shop'));
  });
  await walk(door.x, door.z, 0.25, 'the shop door');
  await a.evaluate(([x, z]) => window.__debug.look(x, z + 3), [door.x, door.z]);
  await a.keyboard.press('KeyF');
  await a.waitForFunction(() => window.__game.sim.getAs(window.__game.localHero, 'hero').x < -1500, { timeout: 5000 });
  await a.evaluate(() => window.__game.sim.apply({ t: 'buyCrafterKit', hero: window.__game.localHero, store: 'market' }));
  await a.waitForFunction(() => window.__game.sim.getAs(window.__game.localHero, 'hero').tools.includes('hammer'), { timeout: 5000 });
  await a.evaluate(() => window.__game.sim.apply({ t: 'leave', hero: window.__game.localHero }));
  await a.waitForFunction(() => window.__game.sim.getAs(window.__game.localHero, 'hero').x > -1500, { timeout: 5000 });
  // Up the north stair onto the wall-walk.
  const st = await a.evaluate(() => window.__debug.WALL.stairs.find((q) => q.dir === -1));
  const mx = (st.x0 + st.x1) / 2;
  const walkX = (await a.evaluate(() => window.__debug.WALL.x)) - 0.5;
  await walk(mx, st.foot + st.dir * 1.4, 0.8, 'the foot of the stair');
  await walk(mx, st.head + st.dir * 0.8, 0.6, 'up the stair');
  await walk(walkX, st.head + st.dir * 0.8, 0.5, 'onto the wall-walk');
  // The plan, laid out over the wall on the field below.
  const spot = await a.evaluate(() => {
    const g = window.__game;
    const h = g.sim.getAs(g.localHero, 'hero');
    const M = window.__debug.MAP;
    const c0 = { cx: Math.floor(h.x + 12 - M.minX), cz: Math.floor(h.z - 4 - M.minZ) };
    for (let r = 0; r < 12; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const cx = c0.cx + dx;
      const cz = c0.cz + dz;
      if (!window.__debugPlacement(cx, cz, 3, 'tower')) {
        g.sim.apply({ t: 'place', hero: h.id, plan: 'tower', cx, cz });
        return { x: M.minX + cx + 0.5, z: M.minZ + cz + 0.5 };
      }
    }
    return null;
  });
  if (!spot) await fail('no room for a tower out beyond the wall');
  await a.waitForFunction(() => window.__game.sim.state.sites.some((s) => s.plan === 'tower'), { timeout: 5000 });
  // Porters bring the parts (a tower's parts cost more than the gold left after the hammer: dev mode
  // pays just for that, then it's off again — she hammers the tower up herself).
  await a.evaluate(() => window.__game.sim.apply({ t: 'devMode', on: true }));
  await a.waitForFunction(() => window.__game.sim.state.dev === true, { timeout: 5000 });
  await a.evaluate(() => {
    const g = window.__game;
    const site = g.sim.state.sites.find((s) => s.plan === 'tower');
    g.sim.apply({ t: 'buyout', hero: g.localHero, site: site.id });
  });
  await a.waitForFunction(() => window.__game.sim.state.sites.some((s) => s.plan === 'tower' && Object.keys(s.need).every((k) => (s.have[k] ?? 0) >= s.need[k])), { timeout: 5000 });
  await a.evaluate(() => window.__game.sim.apply({ t: 'devMode', on: false }));
  await a.waitForFunction(() => window.__game.sim.state.dev === false, { timeout: 5000 });
  await a.evaluate(([x, z]) => window.__debug.look(x, z), [spot.x, spot.z]);
  await wait(300);
  for (let i = 0; i < 120; i++) {
    if (await a.evaluate(() => window.__game.sim.state.buildings.some((b) => b.kind === 'tower'))) break;
    await a.keyboard.press('KeyF');
    await wait(150);
  }
  const tower = await a.evaluate(() => {
    const b = window.__game.sim.state.buildings.find((b) => b.kind === 'tower');
    return b && { id: b.id, x: b.x, z: b.z };
  });
  if (!tower) await fail('Alva could not hammer up the tower from the wall-walk');
  // At her post on the walk: Bjorn sees her crew it.
  await b.waitForFunction((id, t) => window.__game.sim.getAs(id, 'hero')?.post === t, { timeout: 5000 }, me.id, tower.id);
  await wait(600);
  const glow = await b.evaluate((t) => !!window.__game.views.buildings.get(t)?.crewRing?.visible, tower.id);
  if (!glow) await fail("B should see the tower's crew glow with Alva at her post");
  const out = await b.evaluate((id) => { const h = window.__game.sim.getAs(id, 'hero'); return h.x > window.__debug.WALL.x + window.__debug.WALL.half; }, me.id);
  if (out) await fail('Alva should never have set foot beyond the wall');
  console.log('  ✓ B sees Alva crew her tower from the wall-walk (raised over the wall, never outside)');
  await b.screenshot({ path: `${outDir}/lan-tower-b.png` });
  await walk(walkX, st.head + st.dir * 0.8, 0.5, 'back along the walk');
  await walk(mx, st.head + st.dir * 0.8, 0.5, 'onto the landing');
  await walk(mx, st.foot + st.dir * 1.4, 0.8, 'down the stair');
  await b.waitForFunction((id) => !window.__game.sim.getAs(id, 'hero')?.post, { timeout: 5000 }, me.id);
  console.log('  ✓ and free of the post once she is down in town');
}
// Alva is the Warchief: her scout drone flies, and Bjorn sees it.
if ((await a.evaluate(() => window.__game.sim.getAs(window.__game.localHero, 'hero').cls)) !== 'support') await fail('Alva should have joined as the Warchief');
await a.keyboard.press('Digit4');
await a.waitForFunction(() => window.__game.sim.getAs(window.__game.localHero, 'hero')?.droneOn === true, { timeout: 5000 });
await b.waitForFunction((id) => window.__game.views.drones.has(id), { timeout: 5000 }, me.id);
const dronePos = () => b.evaluate((id) => { const p = window.__game.views.dronePos(id); return p && { x: p.x, z: p.z }; }, me.id);
const d0 = await dronePos();
await a.keyboard.down('KeyW');
await wait(1400);
await a.keyboard.up('KeyW');
await wait(600);
const d1 = await dronePos();
const flew = Math.hypot(d1.x - d0.x, d1.z - d0.z);
if (flew < 3) await fail(`B should see Alva's drone fly (moved ${flew.toFixed(2)})`);
console.log(`  ✓ B sees Alva's drone fly ${flew.toFixed(1)} m`);
await b.screenshot({ path: `${outDir}/lan-drone-b.png` });
await a.keyboard.press('Digit4');
await a.screenshot({ path: `${outDir}/lan-a.png` });
await b.screenshot({ path: `${outDir}/lan-b.png` });
await a.click('.lan-bar [data-a="save"]');
await b.waitForFunction(() => document.querySelector('.lan-bar')?.textContent.includes('Saved as'), { timeout: 10000 });
const code = await b.evaluate(() => document.querySelector('.lan-bar b')?.textContent);
console.log(`  ✓ saved — both see the code ${code}`);
await a.click('.lan-paused button').catch(() => {});
await browser.close();
if (errors.length) {
  console.error('page errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('PASS');
