/**
 * End-to-end playthrough with real mouse + keyboard, checking the game's state after every action:
 * mouse-look, WASD / both-buttons walking, jump; buying tools in the Market (F, click); gathering
 * with them; laying a plan (4) and placing it with a click; delivering and assembling (F beats);
 * clicking a building to select it; buying a plan outright (G) and buying out a plan's missing
 * parts; the next wave (N), Tab targeting, skills 2 and 3 (taunt); P / M / B / Esc.
 * Saves screenshots to scripts/out and fails on console errors.
 *   npm run test:browser          (expects `npm run dev` on http://localhost:5173, or pass a URL)
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const outDir = 'scripts/out';
fs.mkdirSync(outDir, { recursive: true });
const chrome = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => p && fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
let step = 0;
const page = await browser.newPage();
const fail = async (msg) => {
  console.error('FAIL:', msg);
  await page.screenshot({ path: `${outDir}/e2e-fail.png` });
  await browser.close();
  process.exit(1);
};
await page.setViewport({ width: 1600, height: 900 });
page.on('pageerror', (e) => errors.push(String(e)));
// A renderer crash closes the page; say so (instead of a confusing error from the next key press).
page.on('error', (e) => console.error('PAGE CRASHED:', String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text());
});
const shot = async (name) => page.screenshot({ path: `${outDir}/e2e-${String(++step).padStart(2, '0')}-${name}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (expr, ms, what) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(expr)) return;
    await wait(100);
  }
  await fail(`timed out waiting for: ${what}`);
};
const ok = (cond, what) => (cond ? console.log(`  ✓ ${what}`) : fail(what));
const hero = () =>
  page.evaluate(() => {
    const h = window.__game.sim.state.heroes[0];
    return { x: h.x, z: h.z, task: h.task.k, facing: h.facing, bag: { ...h.bag }, cds: { ...h.cds }, tools: [...h.tools], gold: window.__game.sim.state.gold };
  });
const camState = () => page.evaluate(() => ({ yaw: window.__game.cam.yaw, look: window.__game.cam.look }));
const moved = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** Swing the camera toward (x, z), as a player would with a mouse drag. */
const aim = (x, z) => page.evaluate(([x, z]) => window.__debug.look(x, z), [x, z]);
let sidesteps = 0;
/** Hold W toward (x, z) until within `stop`, steering like a player and sidestepping snags. */
const walkTo = async (x, z, stop, what) => {
  const t0 = Date.now();
  let last = await hero();
  let lastT = Date.now();
  let nudges = 0;
  // Steer like a player: along the game's path around obstacles (real keys: aim + W).
  const start = await hero();
  const wps = (await page.evaluate(([a, b, c, d]) => window.__path(a, b, c, d), [start.x, start.z, x, z])) ?? [];
  let wi = 0;
  const next = (h) => {
    while (wi + 1 < wps.length && Math.hypot(wps[wi] - h.x, wps[wi + 1] - h.z) < 0.8) wi += 2;
    return wi + 1 < wps.length && Math.hypot(x - h.x, z - h.z) > 4 ? { x: wps[wi], z: wps[wi + 1] } : { x, z };
  };
  await aim(next(start).x, next(start).z);
  await page.keyboard.down('KeyW');
  try {
    while (Date.now() - t0 < 120000) {
      const h = await hero();
      if (Math.hypot(x - h.x, z - h.z) <= stop) return;
      const to = next(h);
      await aim(to.x, to.z);
      if (Date.now() - lastT > 800) {
        if (moved(h, last) < 0.4) {
          if (++nudges > 8) break;
          sidesteps++;
          const side = nudges % 2 ? 'KeyD' : 'KeyA';
          await page.keyboard.down(side);
          await wait(450);
          await page.keyboard.up(side);
        }
        last = h;
        lastT = Date.now();
      }
      await wait(50);
    }
  } finally {
    await page.keyboard.up('KeyW');
  }
  await fail(`could not walk to ${what}`);
};
const prompt = () =>
  page.evaluate(() => {
    const p = window.__game.input.prompt;
    return p ? { kind: p.sel.kind, id: p.sel.id, text: p.text } : null;
  });
/** Click a visible UI element whose text includes `text` (real mouse). */
/** Clicks the first `selector` where it is on screen (a panel redrawn meanwhile doesn't matter). */
const clickSel = async (selector) => {
  const p = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    const r = el?.getBoundingClientRect();
    return r && r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, selector);
  if (!p) await fail(`nothing to click at ${selector}`);
  await page.mouse.click(p.x, p.y);
};
const clickText = async (selector, text) => {
  const p = await page.evaluate(
    ([selector, text]) => {
      for (const el of document.querySelectorAll(selector)) {
        if (!el.textContent.includes(text)) continue;
        const r = el.getBoundingClientRect();
        if (r.width && r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      return null;
    },
    [selector, text],
  );
  if (!p) await fail(`no "${text}" in ${selector}`);
  await page.mouse.click(p.x, p.y);
};
/**
 * A screen pixel (a whole one, as clicks land) whose ground point falls in cell (cx, cz) — the one
 * landing nearest the cell's middle: up on the wall-walk, at the edge of the battlements, a pixel off
 * the edge is the field beyond.
 */
const pixelForCell = (cx, cz) =>
  page.evaluate(
    ([cx, cz]) => {
      const g = window.__game;
      const M = window.__debug.MAP;
      const c = g.stage.renderer.domElement;
      const x = M.minX + cx + 0.5;
      const z = M.minZ + cz + 0.5;
      // (At the ground's height there: up on the wall-walk that is a storey up.)
      const v = new g.stage.camera.position.constructor(x, g.cam.groundAt(x, z) + 0.2, z).project(g.stage.camera);
      const px0 = (v.x * 0.5 + 0.5) * c.clientWidth;
      const py0 = (-v.y * 0.5 + 0.5) * c.clientHeight;
      let best = null;
      let bd = Infinity;
      for (let r = 0; r < 160 && bd > 0.12; r += 2) {
        for (let a = 0; a < 24; a++) {
          // (Whole pixels: a click lands on one — at a grazing edge, a fraction off is another cell.)
          const px = Math.round(px0 + Math.cos((a / 24) * Math.PI * 2) * r);
          const py = Math.round(py0 + Math.sin((a / 24) * Math.PI * 2) * r);
          const gp = g.groundAtScreen(px, py);
          if (!gp || Math.floor(gp.x - M.minX) !== cx || Math.floor(gp.z - M.minZ) !== cz) continue;
          const d = Math.hypot(gp.x - x, gp.z - z);
          if (d < bd) {
            bd = d;
            best = { x: px, y: py };
          }
        }
      }
      return best;
    },
    [cx, cz],
  );
/** Does the pixel (px, py) still fall on cell (cx, cz)? */
const pixelOnCell = (px, py, cx, cz) =>
  page.evaluate(
    ([px, py, cx, cz]) => {
      const M = window.__debug.MAP;
      const gp = window.__game.groundAtScreen(px, py);
      return !!gp && Math.floor(gp.x - M.minX) === cx && Math.floor(gp.z - M.minZ) === cz;
    },
    [px, py, cx, cz],
  );
/** A free building cell a few metres in front of the hero (world coordinates) for a `kind` (a tower: beyond the wall). */
const freeSpotNearHero = async (ahead = 7, kind = 'tower') => {
  const h = await hero();
  const f = await page.evaluate(() => window.__game.cam.forward);
  return page.evaluate(
    ([x, z, kind]) => {
      const M = window.__debug.MAP;
      const c0 = { cx: Math.floor(x - M.minX), cz: Math.floor(z - M.minZ) };
      for (let r = 0; r < 14; r++)
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            if (!window.__debugPlacement(c0.cx + dx, c0.cz + dz, undefined, kind)) return { cx: c0.cx + dx, cz: c0.cz + dz, x: M.minX + c0.cx + dx + 0.5, z: M.minZ + c0.cz + dz + 0.5 };
          }
      return null;
    },
    [h.x + f.x * ahead, h.z + f.z * ahead, kind],
  );
};

/**
 * Lay a plan down with the mouse on cell `spot` (plan mode must be active). With `placed` (an
 * expression true once it is down), a click that landed off the cell — the camera still settling —
 * is tried again, as a player would.
 */
const clickPlace = async (spot, what, placed = null) => {
  for (let tries = 0; tries < 3; tries++) {
    await aim(spot.x, spot.z);
    // Let the camera settle before reading the screen.
    await wait(700);
    let p = await pixelForCell(spot.cx, spot.cz);
    if (!p) await fail(`no pixel for ${what}`);
    await page.mouse.move(p.x, p.y);
    await wait(200);
    // (Still on it after the camera's last sway? Else look again.)
    if (!(await pixelOnCell(p.x, p.y, spot.cx, spot.cz))) {
      p = (await pixelForCell(spot.cx, spot.cz)) ?? p;
      await page.mouse.move(p.x, p.y);
    }
    await page.mouse.click(p.x, p.y);
    if (!placed) return;
    for (let t0 = Date.now(); Date.now() - t0 < 1500; await wait(100)) if (await page.evaluate(placed)) return;
  }
};
// The player's own plans (the broken watermill is a plan laid down before the game starts).
const MY_SITES = "window.__game.sim.state.sites.filter((s) => s.plan !== 'hydro')";
/** Every living creature has a view that is in the scene and visible (camps from the start too). */
const allDrawn = () =>
  page.evaluate(() => {
    const g = window.__game;
    const alive = g.sim.state.enemies.filter((e) => e.hp > 0 && g.sim.getAs(e.id, 'enemy'));
    // Drawn whenever in sight (out of view or beyond the haze they are culled, like anything far off).
    const missing = alive.filter((e) => !g.views.creatureShown(e.id));
    return { alive: alive.length, missing: missing.map((e) => `${e.kind}${e.camp ? '(camp)' : ''}`) };
  });
const sites = () => page.evaluate(() => window.__game.sim.state.sites.filter((s) => s.plan !== 'hydro').map((s) => ({ id: s.id, plan: s.plan, x: s.x, z: s.z, have: { ...s.have }, need: { ...s.need } })));
const complete = (s) => Object.keys(s.need).every((k) => (s.have[k] ?? 0) >= s.need[k]);
/** Is the hero up on the wall (drawn a storey up)? */
const upTop = () => page.evaluate(() => window.__game.views.heroObject(window.__game.sim.state.heroes[0].id).position.y > window.__game.sim.world.wallY + 3);
/** The stair on the `side` of the gate (−1 north, 1 south): its middle line, and the walk's. */
const stairOf = async (side) => {
  const st = await page.evaluate((side) => window.__debug.WALL.stairs.find((q) => q.dir === side), side);
  return { st, mx: (st.x0 + st.x1) / 2, walkX: (await page.evaluate(() => window.__debug.WALL.x)) - 0.5 };
};
/** Up the stair on the `side` of the gate onto the wall-walk, like a player (W and the mouse). */
const upOnWall = async (side) => {
  const { st, mx, walkX } = await stairOf(side);
  await walkTo(mx, st.foot + st.dir * 1.4, 0.8, 'the foot of the stair up the wall');
  await walkTo(mx, st.head + st.dir * 0.8, 0.6, 'up the stair');
  // Off the landing onto the walk (the railing is open there).
  await walkTo(walkX, st.head + st.dir * 0.8, 0.5, 'onto the wall-walk');
  await ok(await upTop(), 'up the stair onto the wall-walk');
};
/** Back along the walk to the landing on the `side` of the gate, and down its stair into town. */
const downFromWall = async (side) => {
  const { st, mx, walkX } = await stairOf(side);
  await walkTo(walkX, st.head + st.dir * 0.8, 0.5, 'along the wall-walk to the stair');
  await walkTo(mx, st.head + st.dir * 0.8, 0.5, 'onto the landing');
  await walkTo(mx, st.foot + st.dir * 1.4, 0.8, 'down the stair');
  await ok(!(await upTop()), 'back down the stair');
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.__ready === true', { timeout: 60000 });
await page.evaluate(() => window.__game.input.select(null));
// The vale is big: hold the first wave back until the test calls it (N), so walking around
// to buy tools and gather doesn't lose the keep before a tower stands.
await page.evaluate(() => (window.__game.sim.state.nextWaveAt = 1e9));
await shot('start');

console.log('class');
{
  // A new game asks for a class first: Tank, Support or Magic.
  await until("window.__game.input.ui.window?.kind === 'class'", 3000, 'the class picker opens on a new game');
  await page.waitForSelector('.class-card[data-cls="tank"]', { timeout: 3000 });
  await shot('class-picker');
  await page.click('.class-card[data-cls="tank"]');
  await until("window.__game.sim.state.heroes[0].cls === 'tank' && !window.__game.input.ui.window", 3000, 'picked the Knight');
  const name = await page.evaluate(() => document.querySelector('.heroframe .name, .hero-frame .name, .name.gold-text')?.textContent ?? '');
  await ok(/Knight/.test(name), `the hero frame says Knight (${name})`);
  await wait(300);
  const drawn = await allDrawn();
  await ok(drawn.alive > 10 && drawn.missing.length === 0, `every creature in the vale is drawn from the start (${drawn.alive} — camps, scrapyards, mines; missing: ${drawn.missing.join(', ') || 'none'})`);
}

console.log('controls');
{
  const c0 = await camState();
  const h0 = await hero();
  await page.mouse.move(800, 450);
  await page.mouse.down({ button: 'left' });
  for (let i = 1; i <= 10; i++) await page.mouse.move(800 + i * 18, 450);
  await page.mouse.up({ button: 'left' });
  const c1 = await camState();
  const h1 = await hero();
  await ok(Math.abs(c1.yaw - c0.yaw) > 0.3, `left-drag orbits the camera (${c0.yaw.toFixed(2)} → ${c1.yaw.toFixed(2)})`);
  await ok(Math.abs(h1.facing - h0.facing) < 0.01, 'left-drag leaves the hero facing alone');
  await page.mouse.down({ button: 'right' });
  for (let i = 1; i <= 10; i++) await page.mouse.move(980 - i * 18, 450);
  await wait(80);
  const h2 = await hero();
  await page.mouse.up({ button: 'right' });
  const c2 = await camState();
  await ok(Math.abs(c2.yaw - c1.yaw) > 0.3, 'right-drag turns the camera');
  await ok(Math.abs(Math.atan2(Math.sin(h2.facing - c2.look), Math.cos(h2.facing - c2.look))) < 0.05, 'right-drag turns the hero with it');
  const a = await hero();
  await page.keyboard.down('KeyW');
  await wait(600);
  await page.keyboard.up('KeyW');
  const b = await hero();
  await ok(moved(a, b) > 1.2, `W runs (${moved(a, b).toFixed(2)} in 0.6 s)`);
  await page.keyboard.down('KeyS');
  await wait(600);
  await page.keyboard.up('KeyS');
  const c = await hero();
  await ok(moved(b, c) > 0.5 && moved(b, c) < moved(a, b), `S backpedals slower (${moved(b, c).toFixed(2)})`);
  await page.mouse.down({ button: 'left' });
  await page.mouse.down({ button: 'right' });
  await wait(600);
  await page.mouse.up({ button: 'right' });
  await page.mouse.up({ button: 'left' });
  const d = await hero();
  await ok(moved(c, d) > 1.2, `both mouse buttons run (${moved(c, d).toFixed(2)})`);
  await page.keyboard.press('Space');
  await wait(150);
  const lift = await page.evaluate(() => window.__game.views.heroLift(window.__game.sim.state.heroes[0].id));
  await ok(lift > 0.05, `Space jumps (${lift.toFixed(2)})`);
  await wait(500);
}

console.log('tools');
{
  const door = await page.evaluate(async () => {
    const { frontDoor } = await import('/src/game/systems/rooms.ts');
    return frontDoor(window.__game.sim.state.buildings.find(b => b.kind === 'shop'));
  });
  await walkTo(door.x, door.z, 0.3, 'the shop entrance');
  await aim(door.x, door.z + 3);
  await wait(200);
  await page.keyboard.press('KeyF');
  await until('window.__game.indoors', 10000, 'inside the shop');
  await wait(300);
  await page.keyboard.press('KeyF');
  await until("window.__game.input.ui.window?.kind === 'shop'", 15000, 'shop window');
  await shot('shop');
  const g0 = (await hero()).gold;
  await clickText('.card', 'Crafter Kit');
  await wait(250);
  const h = await hero();
  await ok(['axe', 'pickaxe', 'hammer', 'shovel'].every((t) => h.tools.includes(t)), `bought the Crafter Kit (${h.tools.join(', ')})`);
  await ok(h.gold === g0 - 34, `paid 34 gold (${g0} → ${h.gold})`);
  await page.keyboard.press('Escape');
  await until('!window.__game.input.ui.window', 2000, 'Esc closes the shop');
  await page.evaluate(async () => { const { roomDoor } = await import('/src/game/systems/rooms.ts'); const d = roomDoor(window.__game.sim.state.buildings.find(b => b.kind === 'shop')); window.__debug.look(d.x, d.z + 0.5); });
  await page.keyboard.down('KeyW');
  try { await until('!window.__game.indoors', 5000, 'leave the shop'); } finally { await page.keyboard.up('KeyW'); }
}

console.log('mine');
// The home mine head: ride the lift down into the lift station, the Copper Line's wagon to the Copper
// Face, hack copper out of its wall (the wall gives), ride back, and up the lift out of the door.
{
  const head = await page.evaluate(() => {
    const g = window.__game;
    const p = g.sim.state.pois.find((p) => p.kind === 'mine' && p.mine === 0);
    return { id: p.id, x: p.x, z: p.z, door: g.sim.state.mines[0].exit };
  });
  const t0 = Date.now();
  await walkTo(head.x, head.z, 4.2, 'the home mine head');
  const walked = (Date.now() - t0) / 1000;
  await aim(head.x, head.z);
  await wait(250);
  const p = await prompt();
  await ok(p?.kind === 'poi' && /lift down/i.test(p.text), `F prompt at the mine head, ${walked.toFixed(0)} s from the Market (${p?.text})`);
  await page.keyboard.press('KeyF');
  await until('window.__game.under', 8000, 'riding the lift down');
  await wait(800);
  await shot('mine-station');
  const plan = await page.evaluate(() => {
    const L = window.__debug.mine();
    return {
      w: L.wagons.find((w) => w.line === 0 && w.leg === 0 && w.dir > 0),
      back: L.wagons.find((w) => w.line === 0 && w.leg === 0 && w.dir < 0),
      gi: L.lines[0].chambers[0],
    };
  });
  // The Copper Line's wagon, waiting at its platform.
  await walkTo(plan.w.ax, plan.w.az, 0.35, 'the Copper Line platform');
  await aim(plan.w.x, plan.w.z);
  await wait(250);
  const wp = await prompt();
  await ok(wp?.kind === 'wagon' && /Copper Face/.test(wp.text), `F prompt at the wagon (${wp?.text})`);
  await page.keyboard.press('KeyF');
  await until('!!window.__game.sim.state.heroes[0].ride', 3000, 'climbing into the wagon');
  await wait(1000);
  await shot('mine-ride');
  await until('!window.__game.sim.state.heroes[0].ride', 10000, 'the ride to the Copper Face');
  const off = await hero();
  await ok(Math.hypot(off.x - plan.back.ax, off.z - plan.back.az) < 0.3, 'out of the wagon at the Copper Face');
  // Copper showing in the wall: walk up to it, face it, F — the pickaxe hacks a piece away.
  const piece = await page.evaluate((gi) => window.__debug.minePiece(gi, 'Copper vein'), plan.gi);
  await ok(!!piece, 'copper shows in the Copper Face');
  await walkTo(piece.sx, piece.sz, 0.25, 'the copper vein');
  await aim(piece.x, piece.z);
  await wait(300);
  const dp = await prompt();
  await ok(dp?.kind === 'cell' && /copper/i.test(dp.text), `F prompt on the rock (${dp?.text})`);
  const c0 = (await hero()).bag.copper ?? 0;
  await page.keyboard.press('KeyF');
  await until(`(window.__game.sim.state.heroes[0].bag.copper ?? 0) > ${c0}`, 12000, 'hacking copper out of the wall');
  await shot('mine-dig');
  const gave = await page.evaluate((k) => window.__game.sim.state.mines[0].dug.includes(k), piece.cell);
  await ok(gave, 'a piece of the wall came away (copper in the bag)');
  // Back to the station by wagon.
  await walkTo(plan.back.ax, plan.back.az, 0.35, 'the wagon back');
  await aim(plan.back.x, plan.back.z);
  await wait(250);
  const bp = await prompt();
  await ok(bp?.kind === 'wagon' && /lift station/i.test(bp.text), `F prompt at the wagon back (${bp?.text})`);
  await page.keyboard.press('KeyF');
  await until('!!window.__game.sim.state.heroes[0].ride', 3000, 'climbing into the wagon back');
  await until('!window.__game.sim.state.heroes[0].ride', 10000, 'the ride back to the station');
  // Up the lift.
  const lift = await page.evaluate(() => window.__game.sim.state.mines[0].lift);
  await walkTo(lift.x, lift.z, 1.0, 'the lift');
  await aim(lift.x, lift.z);
  await wait(250);
  const up = await prompt();
  await ok(up?.kind === 'poi' && /lift up/i.test(up.text), `F prompt at the lift (${up?.text})`);
  await page.keyboard.press('KeyF');
  await until('!window.__game.under', 8000, 'riding the lift up');
  const out = await hero();
  const front = (out.x - head.x) * (head.door.x - head.x) + (out.z - head.z) * (head.door.z - head.z);
  await ok(Math.hypot(out.x - head.x, out.z - head.z) < 8 && front > 0, 'back in the daylight, out of the mine head\'s door');
}

console.log('plan');
// Towers stand only beyond the wall, on the dead's side — and no hero goes out there: a tower is laid
// out over the wall, from up on the wall-walk. By the North Road (a crossbow tower reaches 10 m:
// within 7.5 m of it), out past the reach of the wall's torches (12 m), so that a brazier up on the
// wall-walk is what lights it for the nights. The land out there lies in the fog until someone looks
// out over it from the wall.
// (The side of the gate the North Road comes in on.)
const side = await page.evaluate(() => {
  const lane = window.__game.sim.world.lanes[0];
  for (let i = lane.xs.length - 1; i >= 0; i--) if (window.__debug.wallDist(lane.xs[i], lane.zs[i]) >= 13.5) return lane.zs[i] < 0 ? -1 : 1;
  return -1;
});
{
  // Down in town, a tower plan says where to go first.
  await page.keyboard.press('Digit5');
  await until("window.__game.input.ui.placing === 'tower'", 1500, 'placing mode (5) in town');
  const why = await page.evaluate(() => {
    const M = window.__debug.MAP;
    const h = window.__game.sim.state.heroes[0];
    return window.__game.input.heroBlocker(Math.floor(h.x + 30 - M.minX), Math.floor(h.z - M.minZ));
  });
  await ok(/wall-walk/.test(why ?? ''), `in town a tower plan sends you up onto the wall-walk ("${why}")`);
  await page.keyboard.press('Escape');
  await until('!window.__game.input.ui.placing', 1500, 'Esc drops the plan');
  // No way out through the gate: walking at it stops short.
  const gate = await page.evaluate(() => window.__debug.WALL);
  await page.evaluate(([x]) => {
    window.__debug.heroTo(x - 6, 0);
    window.__debug.look(x + 20, 0);
  }, [gate.x]);
  await page.keyboard.down('KeyW');
  await wait(3500);
  await page.keyboard.up('KeyW');
  const at = await hero();
  await ok(at.x < gate.x - gate.half, `no hero walks out through the gate (stopped at ${at.x.toFixed(1)}, the wall at ${(gate.x - gate.half).toFixed(1)})`);
  await page.evaluate(() => window.__debug.heroTo(window.__debug.MAP.heroStart.x, window.__debug.MAP.heroStart.z));
}
await upOnWall(side);
const spot = await page.evaluate(() => {
  const d = window.__debug;
  const M = d.MAP;
  const lane = window.__game.sim.world.lanes[0];
  for (let i = lane.xs.length - 1; i >= 0; i--) {
    const wd = d.wallDist(lane.xs[i], lane.zs[i]);
    if (wd < 13 || wd > 14.5) continue;
    for (let off = 4; off <= 6.5; off += 0.5) {
      for (const side of [-1, 1]) {
        const cx = Math.floor(lane.xs[i] - M.minX);
        const cz = Math.floor(lane.zs[i] + side * off - M.minZ);
        let roomy = d.wallDist(M.minX + cx + 0.5, M.minZ + cz + 0.5) > 12.8;
        for (let ez = -1; ez <= 1 && roomy; ez++) for (let ex = -1; ex <= 1 && roomy; ex++) roomy = !window.__debugPlacement(cx + ex, cz + ez, undefined, 'tower');
        if (roomy) return { cx, cz, x: M.minX + cx + 0.5, z: M.minZ + cz + 0.5 };
      }
    }
  }
  return null;
});
if (!spot) await fail('no free spot by the road beyond the wall');
{
  // Inside the walls, a tower plan is refused (towers only beyond the wall).
  const inside = await page.evaluate(() => window.__debugPlacement(Math.floor(-30 - window.__debug.MAP.minX), Math.floor(-6 - window.__debug.MAP.minZ), undefined, 'tower'));
  await ok(/beyond the wall/i.test(inside ?? ''), `a tower can't go in town ("${inside}")`);
}
await page.keyboard.press('Digit5');
await until("window.__game.input.ui.placing === 'tower'", 1500, 'placing mode (5)');
await shot('placing');
await clickPlace(spot, 'the tower', `${MY_SITES}.length === 1`);
await until(`${MY_SITES}.length === 1`, 3000, 'site placed by click');
console.log('  ✓ placed the Tower plan with a click, over the wall from the walk');

console.log('gather');
const nearest = (kind) =>
  page.evaluate((kind) => {
    const sim = window.__game.sim;
    const h = sim.state.heroes[0];
    let best = null;
    let bd = 1e9;
    // The nearest one with a clear straight walk to it (the test walks in straight lines).
    const clear = (n) => {
      const d = Math.hypot(n.x - h.x, n.z - h.z);
      const stop = n.radius + 0.9;
      for (let t = 0; t < d - stop; t += 0.25) {
        const x = h.x + ((n.x - h.x) / d) * t;
        const z = h.z + ((n.z - h.z) / d) * t;
        if (!window.__bodyFree(x, z)) return false;
      }
      return true;
    };
    for (const n of sim.state.nodes) {
      if (n.kind !== kind || n.amount <= 0 || !sim.isExplored(n.x, n.z)) continue;
      const d = Math.hypot(n.x - h.x, n.z - h.z);
      if (d < bd && d < 60 && clear(n)) {
        bd = d;
        best = { x: n.x, z: n.z, r: n.radius, id: n.id };
      }
    }
    return best;
  }, kind);
// 6 Wood and 6 Stone for the tower, from the woods and the quarry inside the gate (nothing grows out
// on the dead's side).
await downFromWall(side);
const square = await page.evaluate(() => window.__debug.MAP.heroStart);
await walkTo(square.x, square.z, 2, 'the square inside the gate');
for (const [kind, item, need] of [['tree', 'wood', 6], ['rock', 'stone', 6]]) {
  for (let tries = 0; tries < 12; tries++) {
    if (((await hero()).bag[item] ?? 0) >= need) break;
    let n = await nearest(kind);
    if (!n) {
      // (Nothing in a clear straight line from here: from the square, then.)
      await walkTo(square.x, square.z, 2, 'back to the square');
      n = await nearest(kind);
    }
    if (!n) await fail(`no ${kind} within a clear walk`);
    await walkTo(n.x, n.z, n.r + 0.9, `a ${kind}`);
    await aim(n.x, n.z);
    await wait(150);
    const pr = await prompt();
    if (pr?.kind !== 'node') await fail(`expected an F prompt for the ${kind}, got ${JSON.stringify(pr)}`);
    await page.keyboard.press('KeyF');
    await until("window.__game.sim.state.heroes[0].task.k === 'gather'", 3000, `gathering a ${kind}`);
    if (tries === 0) {
      await wait(500);
      await shot(`gather-${kind}`);
    }
    await until(`(window.__game.sim.state.heroes[0].bag['${item}'] ?? 0) >= ${need} || window.__game.sim.state.heroes[0].task.k === 'idle'`, 25000, `gathering ${item}`);
  }
  await ok(((await hero()).bag[item] ?? 0) >= need, `gathered ${need} ${item}`);
}
await page.keyboard.down('KeyS');
await wait(120);
await page.keyboard.up('KeyS');
await ok((await hero()).task !== 'gather', 'a step cancels gathering');

console.log('assemble');
// Back up on the wall-walk: look out at the blueprint, F sends the parts over; the hammer beats raise it.
const site = (await sites())[0];
await upOnWall(side);
await aim(site.x, site.z);
await wait(250);
const sp = await prompt();
await ok(sp?.kind === 'site' && /over/.test(sp.text), `F prompt on the blueprint out on the field (${sp?.text})`);
await page.keyboard.press('KeyF');
await until("window.__game.sim.state.heroes[0].task.k === 'work' || window.__game.sim.state.buildings.some((b) => b.kind === 'tower')", 15000, 'delivered + working');
await wait(300);
await shot('assembling');
for (let i = 0; i < 80; i++) {
  if (await page.evaluate("window.__game.sim.state.buildings.some((b) => b.kind === 'tower')")) break;
  await page.keyboard.press('KeyF');
  await wait(150);
}
await until("window.__game.sim.state.buildings.some((b) => b.kind === 'tower')", 15000, 'Tower built');
await ok(await upTop(), 'raised from the wall-walk (the hero never left it)');
console.log('  ✓ raised the tower with F beats');
{
  // Along the walk (strafing: behind is the railing, in front the battlements).
  const a = await hero();
  let b = a;
  for (const key of ['KeyA', 'KeyD']) {
    await page.keyboard.down(key);
    await wait(500);
    await page.keyboard.up(key);
    b = await hero();
    if (moved(a, b) > 0.3) break;
  }
  await ok(moved(a, b) > 0.3, `not stuck after the tower went up (moved ${moved(a, b).toFixed(2)})`);
}
await wait(400);
await shot('built');

console.log('archer');
// Every tower comes with an archer on top: it shoots from the moment it stands.
{
  const t = await page.evaluate(() => {
    const b = window.__game.sim.state.buildings.find((b) => b.kind === 'tower');
    return { id: b.id, range: b.stats?.range ?? 0, shooters: b.stats?.shooters ?? 0 };
  });
  await ok(t.range > 0 && t.shooters === 1, `the new tower has its archer (range ${t.range})`);
}

console.log('light');
{
  // A brazier (1×1, key 7) up on the wall-walk lights the tower out there for the nights (a light
  // goes in town or up on the walk, never out beyond the wall). We are up there already.
  const t = await page.evaluate(() => {
    const b = window.__game.sim.state.buildings.find((b) => b.kind === 'tower');
    return { x: b.x, z: b.z, lit: b.lit };
  });
  await ok(!t.lit, 'the tower out past the torches stands dark');
  const spot = await page.evaluate(
    ([x, z]) => {
      const g = window.__game;
      const M = window.__debug.MAP;
      const W = Math.round(M.maxX - M.minX);
      let best = null;
      let bd = 15.5;
      g.sim.world.cells.forEach((f, k) => {
        // (The wall-walk's cells.)
        if (!(f & 128)) return;
        const cx = k % W;
        const cz = Math.floor(k / W);
        const p = { cx, cz, x: M.minX + cx + 0.5, z: M.minZ + cz + 0.5 };
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bd && !window.__debugPlacement(cx, cz, 1, 'brazier')) {
          bd = d;
          best = p;
        }
      });
      return best;
    },
    [t.x, t.z],
  );
  if (!spot) await fail('no spot for a brazier on the wall-walk');
  {
    // Out beyond the wall it is refused.
    const out = await page.evaluate(([x, z]) => window.__debugPlacement(Math.floor(x + 4 - window.__debug.MAP.minX), Math.floor(z - window.__debug.MAP.minZ), 1, 'brazier'), [t.x, t.z]);
    await ok(/beyond the wall only towers/i.test(out ?? ''), `a brazier can't go out by the tower ("${out}")`);
  }
  await walkTo(spot.x, spot.z, 1.2, 'the brazier spot along the wall-walk');
  await ok(await upTop(), 'still up on the wall-walk');
  await page.keyboard.press('Digit7');
  await until("window.__game.input.ui.placing === 'brazier'", 1500, 'placing a brazier (7)');
  // R turns it before it goes down (a one-cell piece by 15°, twice here).
  await page.keyboard.press('KeyR');
  await page.keyboard.press('KeyR');
  const turned = await page.evaluate(() => window.__game.input.ui.placingRot);
  await ok(typeof turned === 'number', `R turns the plan being placed (${turned?.toFixed?.(2)})`);
  await clickPlace(spot, 'the brazier', `${MY_SITES}.some((s) => s.plan === 'brazier')`);
  await until(`${MY_SITES}.some((s) => s.plan === 'brazier')`, 3000, 'brazier plan placed');
  const site = await page.evaluate(() => window.__game.sim.state.sites.find((s) => s.plan === 'brazier'));
  await ok(Math.abs(Math.atan2(Math.sin(site.rot - turned), Math.cos(site.rot - turned))) < 1e-6 && site.turned, `it is planned facing the way it was turned (${site.rot.toFixed(2)})`);
  console.log('  ✓ placed a Brazier (1×1) with 7, turned with R, + click');
  const b = (await sites()).find((s) => s.plan === 'brazier');
  // Porters bring its parts for gold (the tools took most of ours).
  await page.evaluate(() => (window.__game.sim.state.gold += 40));
  await page.evaluate((id) => window.__game.input.select({ kind: 'site', id }), b.id);
  await wait(300);
  await clickText('.details button', 'Buy the rest');
  await until(`${MY_SITES}.some((s) => s.plan === 'brazier' && Object.keys(s.need).every((k) => (s.have[k] ?? 0) >= s.need[k]))`, 3000, 'brazier parts bought');
  await page.keyboard.press('Escape');
  await walkTo(b.x, b.z, 1.6, 'the brazier');
  await aim(b.x, b.z);
  await wait(150);
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate("window.__game.sim.state.buildings.some((b) => b.kind === 'brazier')")) break;
    await page.keyboard.press('KeyF');
    await wait(150);
  }
  await until("window.__game.sim.state.buildings.some((b) => b.kind === 'brazier')", 15000, 'Brazier built');
  await until("window.__game.sim.state.buildings.find((b) => b.kind === 'tower').lit === true", 3000, 'the tower lit');
  console.log('  ✓ built it with F; the tower is lit for the nights');
  // Back along the walk to the landing, and down the stair.
  await downFromWall(Math.sign(spot.z) || side);
}

console.log('gem');
// Its panel: five gem windows, one per colour, and the gems that could go in, colour by colour. A
// Swift Topaz from the panel (a raw topaz from the mine in the bag; porters bring the gear); F from
// the wall-walk melts it in rough; ▲ cuts it polished (two more topazes); × takes it out again — all
// three come back (hauled up over the wall).
{
  const t = await page.evaluate(() => {
    const b = window.__game.sim.state.buildings.find((b) => b.kind === 'tower');
    return { x: b.x, z: b.z, id: b.id };
  });
  await page.evaluate(() => {
    const h = window.__game.sim.state.heroes[0];
    if (!h.known.includes('swift')) h.known.push('swift');
    h.bag.topaz = (h.bag.topaz ?? 0) + 1;
    window.__game.sim.state.gold += 60;
  });
  const rate0 = await page.evaluate((id) => window.__game.sim.getAs(id, 'building').stats.rate, t.id);
  await page.evaluate((id) => window.__game.input.select({ kind: 'building', id }), t.id);
  await until("document.querySelectorAll('.details .mslot').length === 5", 2000, 'five gem windows in the tower panel');
  await until("document.querySelectorAll('.details .gem-line').length === 5", 2000, 'a row of gems per colour');
  await shot('tower-sockets');
  await page.click('.details .mopt[data-gem="swift"]');
  await until(`window.__game.sim.state.sites.some((s) => s.plan === 'swift' && s.building === ${t.id})`, 2000, 'a Swift Topaz plan from the panel');
  await until("[...document.querySelectorAll('.details button')].some((b) => /Buy the rest/.test(b.textContent))", 2000, 'the panel offers porters for the gear');
  await clickText('.details button', 'Buy the rest');
  await page.keyboard.press('Escape');
  await upOnWall(side);
  const by = await page.evaluate(([x, z]) => window.__debug.wallSpot(x, z), [t.x, t.z]);
  await walkTo(by.x, by.z, 1.2, 'the wall-walk by the tower');
  await aim(t.x, t.z);
  await wait(250);
  const pr = await prompt();
  await ok(pr?.kind === 'building' && /Swift Topaz/.test(pr.text), `F prompt to melt the topaz in, from the wall (${pr?.text})`);
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate((id) => window.__game.sim.getAs(id, 'building').gems.includes('swift'), t.id)) break;
    await page.keyboard.press('KeyF');
    await wait(150);
  }
  await until(`window.__game.sim.getAs(${t.id}, 'building').gems.includes('swift')`, 15000, 'the Swift Topaz melted into a window');
  // It goes in rough, and speeds him up.
  await ok((await page.evaluate((id) => window.__game.sim.getAs(id, 'building').gemLv?.[0], t.id)) === 1, 'a new gem goes in rough');
  const rate1 = await page.evaluate((id) => window.__game.sim.getAs(id, 'building').stats.rate, t.id);
  await ok(rate1 > rate0 * 1.15, 'the archer shoots faster');
  await page.evaluate((id) => window.__game.input.select({ kind: 'building', id }), t.id);
  await until('document.querySelectorAll(\'.details .mslot.full[data-gem="swift"]\').length === 1', 2000, 'the gem fills its window in the panel');
  await wait(300);
  await shot('tower-gem');
  // ▲ cuts it finer: polished, for two more topazes (and a gear again).
  await page.evaluate(() => {
    window.__game.sim.state.heroes[0].bag.topaz = 2;
    window.__game.sim.state.gold += 60;
  });
  await clickSel('.details .gem-up[data-gem="swift"]');
  await until(`window.__game.sim.state.sites.some((s) => s.plan === 'swift' && s.lv === 2)`, 2000, '▲ starts cutting the topaz polished');
  await until("[...document.querySelectorAll('.details h5')].some((h) => /Cutting: Swift Topaz → Polished/.test(h.textContent))", 2000, 'the panel shows the cut under way');
  await clickText('.details button', 'Buy the rest');
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate((id) => window.__game.sim.getAs(id, 'building').gemLv?.[0] === 2, t.id)) break;
    await page.keyboard.press('KeyF');
    await wait(150);
  }
  await until(`window.__game.sim.getAs(${t.id}, 'building').gemLv?.[0] === 2`, 15000, 'the Swift Topaz cut polished');
  await ok((await page.evaluate((id) => window.__game.sim.getAs(id, 'building').stats.rate, t.id)) > rate1, 'polished, it does more');
  await page.evaluate((id) => window.__game.input.select({ kind: 'building', id }), t.id);
  await until('document.querySelector(\'.details .mslot.full.q2[data-gem="swift"]\')', 2000, 'the panel shows it polished');
  const TOPAZ = "(window.__game.sim.state.drops.filter((d) => d.item === 'topaz').length + (window.__game.sim.state.heroes[0].bag.topaz ?? 0))";
  const topaz0 = await page.evaluate(TOPAZ);
  page.once('dialog', (d) => d.accept());
  await clickSel('.details .mslot.full[data-gem="swift"] .addon-x');
  await until(`!window.__game.sim.getAs(${t.id}, 'building').gems.includes('swift')`, 2000, '× takes the gem out');
  await until(`${TOPAZ} >= ${topaz0} + 3`, 2000, 'all three raw topazes come back (at its foot, or hauled up)');
  await until("(window.__game.sim.state.heroes[0].bag.topaz ?? 0) >= 3", 4000, 'and up over the wall to the hero on the walk');
  await page.keyboard.press('Escape');
  console.log('  ✓ five colour windows; a Swift Topaz set from the panel (porters + F from the wall), rough, the archer faster; ▲ cuts it polished; × takes it out, all three topazes hauled back up');
}

console.log('select');
{
  const t = await page.evaluate(() => {
    const b = window.__game.sim.state.buildings.find((b) => b.kind === 'tower');
    return { x: b.x, z: b.z, id: b.id };
  });
  await aim(t.x, t.z);
  await wait(250);
  const p = await page.evaluate(([x, z]) => {
    const g = window.__game;
    const v = new g.stage.camera.position.constructor(x, 3.2, z).project(g.stage.camera);
    const c = g.stage.renderer.domElement;
    return { x: (v.x * 0.5 + 0.5) * c.clientWidth, y: (-v.y * 0.5 + 0.5) * c.clientHeight };
  }, [t.x, t.z]);
  // (Up its wall: the gem's raw topazes lie at its foot.)
  await page.mouse.click(p.x, p.y);
  await until(`window.__game.input.ui.selected?.kind === 'building'`, 2000, 'clicking the tower selects it');
  await until("!document.querySelector('.details')?.classList.contains('hidden')", 2000, 'tower panel shows');
  console.log('  ✓ clicking the tower selects it and opens its panel');
  await shot('tower-selected');
  await page.keyboard.press('Escape');
  await until('!window.__game.input.ui.selected', 2000, 'Esc clears the target');
}

console.log('buy');
await page.evaluate(() => (window.__game.sim.state.gold += 300));
{
  // From the wall-walk, out over the field beside the tower: room for more towers.
  const h0 = await hero();
  const tw = await page.evaluate(() => {
    const b = window.__game.sim.state.buildings.find((b) => b.kind === 'tower');
    return { x: b.x, z: b.z };
  });
  await aim(h0.x + 20, h0.z + (h0.z > tw.z ? 10 : -10));
  await wait(400);
  await page.keyboard.press('KeyG');
  await until("window.__game.input.ui.window?.kind === 'buy'", 2000, 'G opens buy-a-plan');
  await shot('buy-window');
  const g0 = (await hero()).gold;
  await clickText('.card', 'Tower');
  await until("window.__game.input.ui.placing === 'tower' && window.__game.input.ui.placingBuy", 2000, 'placing a bought plan');
  // (Out over the field, past the foot of the wall that the battlements hide.)
  const s2 = await freeSpotNearHero(18);
  await clickPlace(s2, 'the bought tower', `${MY_SITES}.length === 1`);
  await until(`${MY_SITES}.length === 1`, 3000, 'bought site placed');
  const s = (await sites())[0];
  await ok(complete(s), 'a bought plan arrives with every part');
  await ok((await hero()).gold < g0, `bought plan cost gold (${g0} → ${(await hero()).gold})`);
  await page.evaluate((id) => window.__game.sim.apply({ t: 'cancelSite', site: id }), s.id);
}
{
  await page.keyboard.press('Digit5');
  const s3 = await freeSpotNearHero(18);
  await clickPlace(s3, 'a third plan', `${MY_SITES}.length === 1`);
  await until(`${MY_SITES}.length === 1`, 3000, 'plan placed');
  const s = (await sites())[0];
  await page.evaluate((id) => window.__game.input.select({ kind: 'site', id }), s.id);
  await wait(300);
  await clickText('.details button', 'Buy the rest');
  await wait(300);
  await ok(complete((await sites())[0]), 'Buy the rest fills the plan');
  await shot('bought-out');
  await page.keyboard.press('Escape');
}

console.log('windows');
await page.keyboard.press('KeyP');
await until("window.__game.input.ui.window?.kind === 'book'", 2000, 'P opens the Plan Book');
await shot('planbook');
await page.keyboard.press('Escape');
await page.keyboard.press('KeyM');
await ok(await page.evaluate(() => document.querySelector('.minimap-wrap').classList.contains('big')), 'M opens the map');
await shot('map');
await page.keyboard.press('KeyM');
await page.keyboard.press('KeyB');
await ok(await page.evaluate(() => document.querySelector('.bagpanel').classList.contains('hidden')), 'B hides the bags');
await page.keyboard.press('KeyB');

console.log('world');
{
  // Into the river: heroes wade and swim (chest-deep, slower).
  const spot = await page.evaluate(() => {
    const b = window.__game.sim.world.bridges[0];
    const sa = Math.sin(b.angle);
    const ca = Math.cos(b.angle);
    // Up- and downstream of the first bridge: deep water, and the dry bank nearest to it.
    for (let across = 7; across < 22; across += 1) {
      for (const side of [-1, 1]) {
        const at = (along) => ({ x: b.x + along * sa + side * across * ca, z: b.z + along * ca - side * across * sa });
        let deep = null;
        for (let along = -14; along <= 14 && deep === null; along += 0.5) if (window.__waterDepth(at(along).x, at(along).z) > 0.6) deep = along;
        if (deep === null) continue;
        for (let along = deep - 0.5; along > deep - 10; along -= 0.5) {
          const p = at(along);
          if (window.__waterDepth(p.x, p.z) < 0.01 && window.__bodyFree(p.x, p.z)) return { dry: p, deep: at(deep + 1.5) };
        }
      }
    }
    return null;
  });
  if (!spot) await fail('no river bank to swim from');
  await page.evaluate(([p, q]) => {
    window.__debug.heroTo(p.x, p.z);
    window.__debug.look(q.x, q.z);
  }, [spot.dry, spot.deep]);
  await wait(300);
  await page.keyboard.down('KeyW');
  let swam = false;
  for (let t0 = Date.now(); Date.now() - t0 < 9000 && !swam; ) {
    await wait(150);
    await aim(spot.deep.x, spot.deep.z);
    swam = await page.evaluate(() => {
      const h = window.__game.sim.state.heroes[0];
      return window.__waterDepth(h.x, h.z) > 0.35;
    });
  }
  await page.keyboard.up('KeyW');
  await ok(swam, 'walked into the river and swims');
  const y = await page.evaluate(() => [...window.__game.views.heroes.values()][0].pos.y);
  await ok(y < 0 && y > -0.6, `swimming chest-deep at the surface (feet at ${y.toFixed(2)})`);
  await shot('swim');

  // A bridge is one deck: cross it, and strafe out to the parapet without dropping.
  const br = await page.evaluate(() => {
    const b = window.__game.sim.world.bridges[0];
    return { x: b.x, z: b.z, a: b.angle, len: b.length, y: b.deckY };
  });
  const bat = (along, across) => ({ x: br.x + along * Math.sin(br.a) + across * Math.cos(br.a), z: br.z + along * Math.cos(br.a) - across * Math.sin(br.a) });
  const local = () =>
    page.evaluate(([b]) => {
      const h = window.__game.sim.state.heroes[0];
      const v = [...window.__game.views.heroes.values()][0];
      const dx = h.x - b.x;
      const dz = h.z - b.z;
      return { along: dx * Math.sin(b.a) + dz * Math.cos(b.a), across: dx * Math.cos(b.a) - dz * Math.sin(b.a), y: v.pos.y };
    }, [br]);
  const start = bat(-(br.len / 2 + 2.5), 0);
  const end = bat(br.len / 2 + 2.5, 0);
  await page.evaluate(([p, q]) => {
    window.__debug.heroTo(p.x, p.z);
    window.__debug.look(q.x, q.z);
  }, [start, end]);
  await wait(300);
  let lowest = 99;
  let crossed = false;
  await page.keyboard.down('KeyW');
  for (let t0 = Date.now(); Date.now() - t0 < 12000 && !crossed; ) {
    await wait(100);
    await aim(end.x, end.z);
    const l = await local();
    if (Math.abs(l.along) < br.len / 2) lowest = Math.min(lowest, l.y);
    crossed = l.along > br.len / 2 + 1;
  }
  await page.keyboard.up('KeyW');
  await ok(crossed, 'walked across the bridge');
  await ok(lowest > br.y - 0.06, `never dropped through the deck (lowest ${lowest.toFixed(2)}, deck ${br.y.toFixed(2)})`);
  // Strafe from the middle out to the parapet.
  const mid = bat(0, 0);
  await page.evaluate(([p, q]) => {
    window.__debug.heroTo(p.x, p.z);
    window.__debug.look(q.x, q.z);
  }, [mid, end]);
  await wait(250);
  await page.keyboard.down('KeyD');
  await wait(1600);
  await page.keyboard.up('KeyD');
  const side = await local();
  await ok(Math.abs(side.across) > 1.7 && Math.abs(side.across) < 2.3, `the whole deck is walkable, out to the parapet (${Math.abs(side.across).toFixed(2)} m from the middle)`);
  await ok(side.y > br.y - 0.06, 'still on the deck at the parapet');
  await shot('bridge');

  // A Grave Digger tunnelling along the road: head and shoulders above the ground, a mound in front.
  const dig = await page.evaluate(() => {
    const lane = window.__game.sim.world.lanes[0];
    const id = window.__debug.spawn('digger', 0, lane.length * 0.7, true);
    const e = window.__game.sim.getAs(id, 'enemy');
    // (Watched from the wall-walk: no hero goes out there.)
    const p = window.__debug.wallSpot(e.x, e.z);
    window.__debug.heroTo(p.x, p.z);
    window.__debug.look(e.x, e.z);
    return id;
  });
  await wait(700);
  const dv = await page.evaluate((id) => {
    const v = window.__game.views.enemies.get(id);
    const e = window.__game.sim.getAs(id, 'enemy');
    if (!v || !e) return null;
    const ground = window.__game.cam.groundAt(v.ch.root.position.x, v.ch.root.position.z);
    return { visible: v.ch.root.visible, sunk: ground - v.ch.root.position.y, height: v.height, mound: !!v.mound?.visible };
  }, dig);
  await ok(dv && dv.visible && dv.mound, 'a tunnelling Grave Digger is visible (and heaves a mound)');
  await ok(dv.sunk > 0 && dv.sunk < dv.height * 0.8, `its head and shoulders stay above ground (sunk ${dv.sunk.toFixed(2)} of ${dv.height.toFixed(2)})`);
  await shot('digger');
  await page.evaluate((id) => window.__game.sim.remove(id), dig);

  // The gate stands shut: the dead stop at its doors and batter them — its doors splinter as its
  // strength goes — and once it breaks they come through, at the gate.
  const gate0 = await page.evaluate(() => ({ shut: window.__game.sim.state.gate.shut, hp: window.__game.sim.state.gate.hp, wear: window.__game.scenery.gateWear }));
  await ok(gate0.shut && gate0.wear === 0, `the gate starts shut and whole (wear ${gate0.wear})`);
  const leak = await page.evaluate(async () => {
    const sim = window.__game.sim;
    const lane = sim.world.lanes[0];
    const lives = sim.state.lives;
    let at = null;
    let hits = 0;
    const off = sim.events.on('enemyLeaked', (e) => {
      const en = sim.getAs(e.id, 'enemy');
      if (en) at = { x: en.x, z: en.z };
    });
    const offHit = sim.events.on('gateHit', () => hits++);
    const id = window.__debug.spawn('warrior', 0, lane.length - 6);
    sim.getAs(id, 'enemy').hp = 1e6;
    window.__game.speed = 3;
    for (let i = 0; i < 80 && hits < 2; i++) await new Promise((r) => setTimeout(r, 100));
    const held = !at && sim.alive(id);
    // Most of the way battered down: the doors show it.
    sim.state.gate.hp = sim.state.gate.maxHp * 0.2;
    await new Promise((r) => setTimeout(r, 400));
    const wear = window.__game.scenery.gateWear;
    // Then it breaks, and in they come.
    sim.state.gate.hp = 3;
    for (let i = 0; i < 100 && !at; i++) await new Promise((r) => setTimeout(r, 100));
    window.__game.speed = 1;
    if (typeof off === 'function') off();
    if (typeof offHit === 'function') offHit();
    // The road's end: the gate in the wall.
    const k = { x: lane.xs[lane.xs.length - 1], z: lane.zs[lane.zs.length - 1] };
    return { held, hits, wear, broke: sim.state.gate.hp <= 0 && !sim.state.gate.shut, d: at ? Math.hypot(at.x - k.x, at.z - k.z) : 99, lost: lives - sim.state.lives };
  });
  await ok(leak.held && leak.hits >= 2, `the dead stop at the shut gate and batter it (${leak.hits} blows, held: ${leak.held})`);
  await ok(leak.wear >= 6, `a battered gate shows it: cracks, splinters, holes (${leak.wear} showing at 20%)`);
  await ok(leak.broke && leak.d < 7, `battered down it breaks, and they come through at the gate (${leak.d.toFixed(1)} m from it)`);
  await ok(leak.lost > 0, `a break-in costs lives (−${leak.lost})`);
  // (Mended again for what follows.)
  await page.evaluate(() => {
    const g = window.__game.sim.state.gate;
    g.hp = g.maxHp;
    g.shut = true;
  });
}

console.log('wave');
await page.keyboard.press('KeyN');
await page.evaluate(() => (window.__game.speed = 4));
// The dead walk about two minutes from the crypts to the gate.
await until('window.__game.sim.state.stats.kills >= 1', 240000, 'first kill');
await page.evaluate(() => (window.__game.speed = 1));
console.log('  ✓ the tower killed something');
// The dead on the roads are beyond any hero: attacking one is refused, with the reason under the cursor.
{
  const refused = await page.evaluate(() => {
    const s = window.__game.sim.state;
    const e = s.enemies.find((e) => !e.camp && e.hp > 0);
    if (!e) return null;
    window.__game.sim.apply({ t: 'attack', hero: s.heroes[0].id, target: e.id });
    return { task: s.heroes[0].task.k, hint: window.__game.input.ui.cursorHint };
  });
  await ok(refused && refused.task !== 'attack' && /beyond any hero/.test(refused.hint), `attacking the dead on the road is refused ("${refused?.hint ?? '?'}")`);
}
// Heroes fight the camps: up to one, bash a creature, taunt them, then Esc.
const campFoe = () =>
  page.evaluate(() => {
    const s = window.__game.sim.state;
    const h = s.heroes[0];
    let best = null;
    let bd = 1e9;
    for (const e of s.enemies) {
      if (!e.camp || e.burrowed || e.spawnT > 0 || e.hp <= 0 || e.flying) continue;
      const d = Math.hypot(e.x - h.x, e.z - h.z);
      if (d < bd) {
        bd = d;
        best = { x: e.x, z: e.z, d, id: e.id };
      }
    }
    return best;
  });
{
  const c = await campFoe();
  await ok(!!c, 'there is a camp to fight');
  await page.evaluate(([x, z]) => {
    const h = window.__game.sim.state.heroes[0];
    h.hp = h.maxHp;
    window.__debug.heroTo(x + 4, z);
  }, [c.x, c.z]);
  await wait(300);
}
let fought = false;
let taunted = false;
for (let t0 = Date.now(); Date.now() - t0 < 40000 && !(fought && taunted); ) {
  const e = await campFoe();
  if (!e) break;
  // The Knight bashes up close (Shield Bash reaches about 2 m).
  if (e.d > 1.8) {
    await aim(e.x, e.z);
    await page.keyboard.down('KeyW');
    await wait(e.d > 5 ? 200 : 90);
    await page.keyboard.up('KeyW');
    continue;
  }
  await aim(e.x, e.z);
  if (!fought) {
    await page.keyboard.press('Tab');
    await wait(80);
    if ((await page.evaluate(() => window.__game.input.selected))?.kind === 'enemy') {
      await page.keyboard.press('Digit1');
      await wait(250);
      fought = ((await hero()).cds.slam ?? 0) > 0;
      if (fought) await shot('fight');
    }
  } else if (!taunted) {
    await page.keyboard.press('Digit2');
    await wait(250);
    taunted = await page.evaluate(() => window.__game.sim.state.enemies.some((e) => e.camp && e.tauntT > 0));
  }
}
await ok(fought, 'Tab + 1: the Knight bashes a camp creature (Shield Bash)');
await ok(taunted, 'Battle Cry (2) taunts the creatures nearby');
{
  // Esc in a fight: the hero stops — and stays stopped with the creatures right there.
  await page.evaluate(() => {
    const s = window.__game.sim.state;
    const h = s.heroes[0];
    h.hp = h.maxHp;
    let best = null;
    let bd = 1e9;
    for (const e of s.enemies) {
      if (!e.camp || e.hp <= 0) continue;
      const d = Math.hypot(e.x - h.x, e.z - h.z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) window.__game.sim.apply({ t: 'attack', hero: h.id, target: best.id });
  });
  await until("window.__game.sim.state.heroes[0].task.k === 'attack'", 2000, 'attacking');
  await page.keyboard.press('Escape');
  await wait(200);
  const st = await page.evaluate(() => {
    const h = window.__game.sim.state.heroes[0];
    return { task: h.task.k, peace: !!h.peace, target: window.__game.input.selected, menu: window.__game.input.ui.window?.kind ?? null };
  });
  await ok(st.task !== 'attack' && st.peace && !st.target && st.menu !== 'menu', 'Esc stops the fight and drops the target (not the menu)');
  await wait(1500);
  await ok(await page.evaluate(() => window.__game.sim.state.heroes[0].task.k !== 'attack'), "and the hero doesn't swing again by itself");
}

console.log('tower');
// The wall-walk is the battle post: up there by the crossbow tower the hero crews it — the crew glows
// in the class colour and fights harder, its panel says who crews it — and a Battle Cry (2) from the
// walk holds the dead on the road below the wall, out of their reach.
{
  const tw = await page.evaluate(() => {
    const b = window.__game.sim.state.buildings.find((b) => b.kind === 'tower');
    return b && { id: b.id, x: b.x, z: b.z };
  });
  await ok(!!tw, 'a tower to crew');
  await page.evaluate((t) => {
    const p = window.__debug.wallSpot(t.x, t.z);
    window.__debug.heroTo(p.x, p.z);
    window.__debug.look(t.x, t.z);
  }, tw);
  await until(`window.__game.sim.state.heroes[0].post === ${tw.id}`, 3000, 'crewing the tower from the wall-walk');
  await wait(500);
  const crew = await page.evaluate((id) => {
    const v = window.__game.views.buildings.get(id);
    return !!v?.crewRing?.visible;
  }, tw.id);
  await ok(crew, 'the crew glows in the class colour');
  await page.evaluate((id) => window.__game.input.select({ kind: 'building', id }), tw.id);
  await until("[...document.querySelectorAll('.details .d-power')].some((d) => /crews it from the wall/.test(d.textContent))", 2000, 'the tower panel says who crews it');
  await shot('wall-post');
  await page.keyboard.press('Escape');
  // The dead below: a Battle Cry from up here holds them at the wall's foot, and they can't reach.
  const ids = await page.evaluate(() => {
    const lane = window.__game.sim.world.lanes[0];
    return [0, 1].map((k) => window.__debug.spawn('minion', 0, lane.length - 5 - k * 1.5));
  });
  await page.evaluate((ids) => {
    const g = window.__game;
    const e = g.sim.getAs(ids[0], 'enemy');
    for (const id of ids) {
      const o = g.sim.getAs(id, 'enemy');
      o.spawnT = 0;
      o.hp = o.maxHp = 1e6;
    }
    const p = window.__debug.wallSpot(e.x, e.z);
    window.__debug.heroTo(p.x, p.z);
    window.__debug.look(e.x, e.z);
    g.sim.state.heroes[0].cds.cry = 0;
  }, ids);
  await wait(300);
  const hp0 = (await page.evaluate(() => window.__game.sim.state.heroes[0].hp));
  await page.keyboard.press('Digit2');
  await until(`window.__game.sim.state.enemies.some((e) => !e.camp && e.tauntT > 0)`, 2000, 'Battle Cry (2) from the wall-walk holds the dead below');
  await wait(1500);
  await ok(await page.evaluate((hp0) => !window.__game.sim.state.heroes[0].dead && window.__game.sim.state.heroes[0].hp >= hp0, hp0), 'the dead below cannot reach the hero up on the wall');
  await shot('wall-cry');
  await page.evaluate((ids) => ids.forEach((id) => window.__game.sim.remove(id)), ids);
  console.log('  ✓ the hero crews the tower from the wall-walk; Battle Cry holds the dead below it');
}

console.log('class change');
{
  // Out of the fight: C opens the classes; take the Mage, then Fireball (1) the nearest dead.
  await page.evaluate(() => {
    const s = window.__game.sim.state;
    for (const e of s.enemies) if (!e.camp) e.tauntT = 0;
    // On the high street in the old town, far from the dead.
    window.__debug.heroTo(-40, 0.6);
  });
  await wait(300);
  await page.keyboard.press('KeyC');
  await until("window.__game.input.ui.window?.kind === 'class'", 2000, 'C opens the classes');
  await page.waitForSelector('.class-card[data-cls="magic"]', { timeout: 3000 });
  await page.click('.class-card[data-cls="magic"]');
  await until("window.__game.sim.state.heroes[0].cls === 'magic'", 3000, 'became a Mage');
  await wait(300);
  await ok(await page.evaluate(() => [...window.__game.views.heroes.values()][0]?.cls === 'magic'), 'the hero looks like a Mage now');
  // A Fireball at the dead on the road is refused: they are beyond any hero.
  const laneRefused = await page.evaluate(() => {
    const g = window.__game;
    const lane = g.sim.world.lanes[0];
    const id = window.__debug.spawn('warrior', 0, lane.length * 0.5);
    const h = g.sim.state.heroes[0];
    g.sim.apply({ t: 'cast', hero: h.id, ability: 'fireball', target: id });
    const refused = (h.cds.fireball ?? 0) === 0 && /beyond any hero/.test(g.input.ui.cursorHint);
    g.sim.remove(id);
    return refused;
  });
  await ok(laneRefused, 'a Fireball at the dead on the road is refused');
  // A camp warrior 8 m in front of the mage.
  const id = await page.evaluate(async () => {
    const { spawnCampEnemy } = await import('/src/game/systems/enemies.ts');
    const sim = window.__game.sim;
    const h = sim.state.heroes[0];
    let at = { x: h.x + 8, z: h.z };
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const x = h.x + Math.cos(a) * 8;
      const z = h.z + Math.sin(a) * 8;
      if (window.__bodyFree(x, z) && window.__waterDepth(x, z) <= 0) {
        at = { x, z };
        break;
      }
    }
    const e = spawnCampEnemy(sim, 'warrior', sim.state.camps[0].id, at.x, at.z);
    e.spawnT = 0;
    e.stunT = 3;
    return e.id;
  });
  const e = await page.evaluate((id) => { const e = window.__game.sim.getAs(id, 'enemy'); return { x: e.x, z: e.z, hp: e.hp }; }, id);
  await aim(e.x, e.z);
  await page.evaluate((id) => window.__game.input.select({ kind: 'enemy', id }), id);
  await page.keyboard.press('Digit1');
  await until(`(window.__game.sim.state.heroes[0].cds.fireball ?? 0) > 0`, 2000, 'Fireball cast (1)');
  await until(`(window.__game.sim.getAs(${id}, 'enemy')?.hp ?? 0) < ${e.hp}`, 4000, 'the fireball hit');
  await shot('mage');
  console.log('  ✓ Mage: Fireball (1) hits the target');
  // Clear the camp warrior away (a class change waits until nothing is on you).
  await page.evaluate((id) => window.__game.sim.remove(id), id);
}

const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let n = 0;
      const t0 = performance.now();
      const tick = () => {
        n++;
        if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
        else resolve(n / ((performance.now() - t0) / 1000));
      };
      requestAnimationFrame(tick);
    }),
);
console.log('drone');
{
  // The Warchief's scout drone: 4 launches it, the camera follows it, WASD flies it (the hero stands
  // with the controller), it stops at its range, and 4 calls it home.
  await page.evaluate(() => {
    const s = window.__game.sim.state;
    for (const e of [...s.enemies]) if (!e.camp) window.__game.sim.remove(e.id);
    window.__debug.heroTo(-30, 0.5);
    window.__debug.look(30, 0.5);
  });
  await wait(300);
  await page.keyboard.press('KeyC');
  await page.waitForSelector('.class-card[data-cls="support"]', { timeout: 3000 });
  await page.click('.class-card[data-cls="support"]');
  await until("window.__game.sim.state.heroes[0].cls === 'support'", 3000, 'became the Warchief');
  await wait(300);
  await page.keyboard.press('Digit4');
  await until("window.__game.sim.state.heroes[0].droneOn === true", 2000, 'the drone launched (4)');
  await wait(600);
  const st0 = await page.evaluate(() => {
    const g = window.__game;
    const h = g.sim.state.heroes[0];
    const v = g.views.heroes.get(h.id);
    const d = g.views.dronePos(h.id);
    return { hx: h.x, hz: h.z, task: h.task.k, controller: !!v?.controller?.visible, camToDrone: d ? Math.hypot(g.cam.target.x - d.x, g.cam.target.z - d.z) : 99 };
  });
  await ok(st0.task === 'pilot' && st0.controller, 'the Warchief stands with the controller in hand');
  await ok(st0.camToDrone < 1, `the camera follows the drone (${st0.camToDrone.toFixed(2)} m off)`);
  await page.keyboard.down('KeyW');
  await wait(2000);
  const st1 = await page.evaluate(() => {
    const h = window.__game.sim.state.heroes[0];
    return { hx: h.x, hz: h.z, dx: h.droneX, dz: h.droneZ };
  });
  await ok(Math.hypot(st1.dx - st0.hx, st1.dz - st0.hz) > 6, `W flies the drone (${Math.hypot(st1.dx - st0.hx, st1.dz - st0.hz).toFixed(1)} m out)`);
  await ok(Math.hypot(st1.hx - st0.hx, st1.hz - st0.hz) < 0.05, 'while the hero stays put');
  await shot('drone');
  await wait(6500);
  await page.keyboard.up('KeyW');
  const far = await page.evaluate(() => {
    const h = window.__game.sim.state.heroes[0];
    return Math.hypot(h.droneX - h.x, h.droneZ - h.z);
  });
  await ok(far <= 45.2 && far > 40, `it stops at the edge of its range (${far.toFixed(1)} m)`);
  await page.keyboard.press('Digit4');
  await until('!window.__game.sim.state.heroes[0].droneOn', 12000, 'the drone came home (4)');
  await ok(await page.evaluate(() => window.__game.sim.state.heroes[0].task.k !== 'pilot'), 'and the hero is free again');
}

console.log('dev mode');
// The menu turns dev mode on: a DEV badge shows; any plan stands as soon as it's placed (no parts,
// no hammer), gems go straight in without a raw gem; ` turns it off again.
{
  await page.keyboard.press('Escape');
  await wait(150);
  if (!(await page.evaluate(() => window.__game.input.ui.window?.kind === 'menu'))) {
    await page.keyboard.press('Escape');
    await until("window.__game.input.ui.window?.kind === 'menu'", 2000, 'Esc opens the menu');
  }
  await page.waitForSelector('.dev-toggle input', { timeout: 3000 });
  await page.click('.dev-toggle input');
  await until('window.__game.sim.state.dev === true', 2000, 'the menu turns dev mode on');
  await page.keyboard.press('Escape');
  await until("!document.querySelector('.dev-badge').classList.contains('hidden')", 2000, 'a DEV badge in the top bar');
  await until("[...document.querySelectorAll('.topbar .res:not(.gate-res)')].every((r) => r.textContent.includes('∞'))", 2000, 'unlimited gold and keep lives (∞) in the top bar');
  const before = await page.evaluate(() => ({ towers: window.__game.sim.state.buildings.filter((b) => b.kind === 'tower').length, gold: window.__game.sim.state.gold }));
  await page.evaluate(() => (window.__game.sim.state.heroes[0].tools = window.__game.sim.state.heroes[0].tools.filter((t) => t !== 'hammer')));
  // Up on the wall-walk (a tower is laid out over the wall), looking out over the roads.
  await page.evaluate(() => {
    const W = window.__debug.WALL;
    const p = window.__debug.wallSpot(W.x, -12);
    window.__debug.heroTo(p.x, p.z);
    window.__debug.look(W.x + 30, -12);
  });
  await wait(300);
  await page.keyboard.press('Digit5');
  await until("window.__game.input.ui.placing === 'tower'", 1500, 'placing a tower (5)');
  const spot = await freeSpotNearHero(18);
  await clickPlace(spot, 'a dev-mode tower', `window.__game.sim.state.buildings.filter((b) => b.kind === 'tower').length === ${before.towers + 1}`);
  await until(`window.__game.sim.state.buildings.filter((b) => b.kind === 'tower').length === ${before.towers + 1}`, 3000, 'the tower stands at once — no parts, no hammer');
  const t = await page.evaluate(() => window.__game.sim.state.buildings.filter((b) => b.kind === 'tower').at(-1).id);
  await page.evaluate((id) => window.__game.input.select({ kind: 'building', id }), t);
  await until('document.querySelector(\'.details .mopt[data-gem="arcane"]\') && !document.querySelector(\'.details .mopt[data-gem="arcane"]\').classList.contains("unknown")', 2000, 'every gem is open in dev mode');
  await page.click('.details .mopt[data-gem="arcane"]');
  await until(`window.__game.sim.getAs(${t}, 'building').gems.includes('arcane')`, 2000, 'an Arcane Amethyst straight in, no raw gem');
  await ok((await page.evaluate(() => window.__game.sim.state.gold)) === before.gold, 'and it cost nothing');
  // ▲ twice: radiant at once.
  for (const lv of [2, 3]) {
    await until('document.querySelector(\'.details .gem-up[data-gem="arcane"]:not(.off)\')', 2000, `▲ on the amethyst (to level ${lv})`);
    await clickSel('.details .gem-up[data-gem="arcane"]');
    await until(`window.__game.sim.getAs(${t}, 'building').gemLv?.[0] === ${lv}`, 2000, `cut to level ${lv} at once`);
  }
  await until('document.querySelector(\'.details .mslot.full.q3[data-gem="arcane"]\') && !document.querySelector(\'.details .gem-up[data-gem="arcane"]\')', 2000, 'radiant: no more ▲');
  await wait(400);
  await shot('dev-mode');
  // The clock: drag it to the dead of night and hold it there.
  await until("!document.querySelector('.dev-clock').classList.contains('hidden')", 2000, 'the dev clock in the top bar');
  const r = await page.evaluate(() => {
    const b = document.querySelector('.dev-clock input').getBoundingClientRect();
    return { x: b.x, y: b.y + b.height / 2, w: b.width };
  });
  await page.mouse.click(r.x + r.w * 0.02, r.y);
  await until('(() => { const t = window.__game.tod; return t < 0.06 || t > 0.97; })()', 2000, 'the slider sets the clock to night');
  await clickSel('.dev-clock button');
  await until('window.__game.sim.state.dayHold != null', 2000, '⏸ holds the time of day');
  const held = await page.evaluate(() => window.__game.sim.state.dayHold);
  await wait(1500);
  await ok((await page.evaluate(() => window.__game.sim.state.dayHold)) === held && (await page.evaluate(() => document.querySelector('.dev-clock button').textContent)) === '▶', 'held: the clock stands still (▶ lets it run)');
  const tp = await page.evaluate((id) => {
    const b = window.__game.sim.getAs(id, 'building');
    return { x: b.x, z: b.z };
  }, t);
  await aim(tp.x, tp.z);
  await wait(1200);
  await shot('dev-night');
  await clickSel('.dev-clock button');
  await until('window.__game.sim.state.dayHold == null', 2000, '▶ lets the day run on');
  const r2 = await page.evaluate(() => {
    const b = document.querySelector('.dev-clock input').getBoundingClientRect();
    return { x: b.x, y: b.y + b.height / 2, w: b.width };
  });
  await ok(Math.abs(r2.x - r.x) < 0.5, 'the top bar holds still as the clock runs and stops');
  await page.mouse.click(r2.x + r2.w * 0.5, r2.y);
  await until('Math.abs(window.__game.tod - 0.5) < 0.03', 2000, 'and noon again');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backquote');
  await until('!window.__game.sim.state.dev', 2000, '` turns dev mode off');
  await until("document.querySelector('.dev-badge').classList.contains('hidden')", 2000, 'the DEV badge goes');
  console.log('  ✓ menu → dev mode: a tower at once without parts or hammer, a gem without its raw gem, free, ▲▲ radiant at once; the clock set to night and held, then noon; ` turns it off');
}

console.log('rooms');
// A Blacksmith's door: run at it (W, nothing else) and you are inside its room — the walls facing the
// camera cut away, the camera looking down into it like a diorama; up the stair to the loft; run out
// of the doorway and you are back in front of its door, heading on.
{
  /** Hold W towards (x, z) — the camera aimed at it — until within `stop` m (or `done()` holds). */
  const run = async (x, z, stop, what, done = null) => {
    const t0 = Date.now();
    await page.keyboard.down('KeyW');
    try {
      while (Date.now() - t0 < 6000) {
        // Aim at the goal — unless it has already come about (checked in the same step: through a
        // doorway, the goal outside is no longer the way the camera should look).
        if (await page.evaluate(([x, z, done]) => (done && (0, eval)(done)) || void window.__debug.look(x, z), [x, z, done])) return;
        await wait(60);
        if (done && (await page.evaluate(done))) return;
        const h = await hero();
        if (!done && Math.hypot(h.x - x, h.z - z) < stop) return;
      }
    } finally {
      await page.keyboard.up('KeyW');
    }
    await fail(`could not run to ${what}`);
  };
  await page.evaluate(() => window.__game.sim.apply({ t: 'devMode', on: true }));
  // In town: the workshop quarter (a workshop stands only inside the walls).
  await page.evaluate(() => {
    const q = window.__debug.MAP.workshops;
    window.__debug.heroTo(q.x + 6, q.z - 4);
    window.__debug.look(q.x - 4, q.z - 4);
  });
  await wait(300);
  const spot = await freeSpotNearHero(9, 'anvil');
  const id = await page.evaluate(([x, z]) => window.__debug.build('anvil', x, z), [spot.x, spot.z]);
  await ok(id > 0, 'a Blacksmith stands in the workshop quarter');
  const r = await page.evaluate((id) => window.__debug.rooms(id), id);
  await walkTo(r.door.x + r.front.x * 1.6, r.door.z + r.front.z * 1.6, 0.5, "the Blacksmith's door");
  await run(r.door.x - r.front.x * 2, r.door.z - r.front.z * 2, 0, 'the door', '!!window.__game.indoors');
  await ok(await page.evaluate(() => window.__game.indoors), 'running at the door takes you in (no key but W)');
  await wait(1000);
  const view = await page.evaluate((id) => ({ pitch: window.__game.cam.pitch, cut: window.__debug.rooms(id).cut }), id);
  await ok(view.pitch > 0.8, `the camera looks down into the room (pitch ${view.pitch.toFixed(2)})`);
  await ok(view.cut?.front && !view.cut.back, `the wall between the camera and you is cut away, the far one stands (${JSON.stringify(view.cut)})`);
  await shot('room');
  const r2 = await page.evaluate((id) => window.__debug.rooms(id), id);
  await run(r2.stairFoot.x, r2.stairFoot.z, 0.3, 'the foot of the stair');
  await run(r2.stairHead.x, r2.stairHead.z, 0.3, 'up the stair');
  await run(r2.loft.x, r2.loft.z, 0.4, 'onto the loft');
  const y = await page.evaluate(() => {
    const g = window.__game;
    const h = g.sim.getAs(g.localHero, 'hero');
    return g.views.heroObject(h.id).position.y;
  });
  await ok(Math.abs(y - r2.loft.y) < 0.08, `up on the loft, a storey up (${y.toFixed(2)} m)`);
  await shot('loft');
  await run(r2.stairHead.x, r2.stairHead.z, 0.3, 'back to the stair');
  await run(r2.stairFoot.x, r2.stairFoot.z, 0.3, 'down the stair');
  await run(r2.exit.x, r2.exit.z + 1, 0, 'out of the doorway', '!window.__game.indoors');
  const out = await hero();
  await ok(Math.hypot(out.x - r.door.x, out.z - r.door.z) < 0.6, `out of the doorway: back in front of its door (${Math.hypot(out.x - r.door.x, out.z - r.door.z).toFixed(2)} m)`);
  await wait(700);
  await ok(!(await page.evaluate(() => window.__game.indoors)), 'and not straight back in');
  await page.evaluate(() => window.__game.sim.apply({ t: 'devMode', on: false }));
  console.log('  ✓ ran in at the door with W alone; near walls cut away, diorama camera; up the stair to the loft; out through the doorway in front of its door');
}

console.log('keep state');
{
  const before = await page.evaluate(() => {
    const st = window.__game.sim.state;
    return { cls: st.heroes[0].cls, buildings: st.buildings.length, wave: st.wave, gold: st.gold };
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 60000 });
  await wait(500);
  const after = await page.evaluate(() => {
    const st = window.__game.sim.state;
    return { cls: st.heroes[0].cls, buildings: st.buildings.length, wave: st.wave, gold: st.gold, picker: window.__game.input.ui.window?.kind ?? null };
  });
  await ok(after.cls === before.cls && after.buildings === before.buildings && after.wave === before.wave, `a reload carries on the same game (${after.cls}, ${after.buildings} buildings, wave ${after.wave})`);
  await ok(after.picker !== 'class', 'no class picker on a resumed game');
  await wait(500);
  const drawn = await allDrawn();
  await ok(drawn.missing.length === 0, `every creature is drawn after the reload too (${drawn.alive}; missing: ${drawn.missing.join(', ') || 'none'})`);
}
const s = await page.evaluate(() => {
  const st = window.__game.sim.state;
  return { wave: st.wave, kills: st.stats.kills, lives: st.lives, gold: st.gold, time: Math.round(st.time) };
});
console.log('state:', JSON.stringify(s), `fps ≈ ${fps.toFixed(0)}`, `(walk sidesteps: ${sidesteps})`);
await browser.close();
if (errors.length) {
  console.error('page errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('PASS — screenshots in', outDir);
