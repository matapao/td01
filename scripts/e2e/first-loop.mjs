import { ready } from '../browser-fixture.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('scripts/out', { recursive: true });
import assert from 'node:assert/strict';
import { TimeoutError } from 'puppeteer-core';
import { launchBrowser } from './browser.mjs';
const browser = await launchBrowser();
/** @param {number} ms */
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage();
/** @type {string[]} */
const errors = [];
try {
  // Keep CSS layout and the complete game path; software CI renders fewer physical pixels.
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: process.env['CI'] ? 0.5 : 1 });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text());
  });
  await page.evaluateOnNewDocument(() => {
    if (!sessionStorage.getItem('first-loop-test-started')) {
      localStorage.clear();
      sessionStorage.setItem('first-loop-test-started', 'yes');
    }
  });
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await ready(page);
  if (process.env['CI']) {
    const rendering = await page.evaluate(() => {
      const renderer = window.__game.stage.renderer;
      const gl = renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        devicePixelRatio: window.devicePixelRatio,
        rendererPixelRatio: renderer.getPixelRatio(),
        width: renderer.domElement.width,
        height: renderer.domElement.height,
        renderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'unavailable',
      };
    });
    console.log('CI rendering', rendering);
  }
  await page.evaluate(() => {
    window.__hud.windows.close();
  });
  await page.waitForFunction(() => document.body.innerText.includes('Would you like a guided walkthrough?'));
  /** @param {string} text */
  const click = async (text) => {
    // Commands update the panel on a rendered frame, which may take longer on software CI.
    const candidate = await page.waitForFunction(
      (label) =>
        [...document.querySelectorAll('button,.card')].find((element) => {
          if (element.textContent?.trim() !== label) return false;
          if (element instanceof HTMLButtonElement && element.disabled) return false;
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.opacity !== '0';
        }),
      { timeout: 30000 },
      text,
    );
    try {
      const button = candidate.asElement();
      assert(button, `Missing ready button ${text}`);
      const box = await button.boundingBox();
      assert(box, `Ready button has no visible box: ${text}`);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    } finally {
      await candidate.dispose();
    }
  };
  await click('Guide me');
  console.log('guide chosen');
  /** @param {number} x @param {number} z @param {number} [within] */
  async function walk(x, z, within = 0.45) {
    const startedAt = Date.now();
    const start = await page.evaluate(
      ({ x, z }) => {
        const g = window.__game,
          h = window.__test.hero();
        const directDistance = Math.hypot(h.x - x, h.z - z);
        g.sim.apply({ t: 'move', hero: h.id, x, z });
        let routeDistance = 0;
        let previousX = h.x;
        let previousZ = h.z;
        for (let index = h.pathIdx; index < h.path.length; index += 2) {
          const nextX = h.path[index];
          const nextZ = h.path[index + 1];
          if (nextX === undefined || nextZ === undefined) throw Error('Incomplete movement route');
          routeDistance += Math.hypot(nextX - previousX, nextZ - previousZ);
          previousX = nextX;
          previousZ = nextZ;
        }
        return { x: h.x, z: h.z, time: g.sim.state.time, distance: Math.max(directDistance, routeDistance) };
      },
      { x, z },
    );
    // Software CI may render slowly: allow bounded wall time for the same real spatial journey.
    // This is acceptance coverage, not a performance claim or a simulation-speed adjustment.
    const timeout = process.env['CI'] ? Math.min(120000, Math.max(30000, start.distance * 6000)) : 30000;
    const deadline = Date.now() + timeout;
    if (process.env['CI']) console.log('CI walk start', { from: start, to: { x, z }, timeout });
    let arrived = false;
    try {
      while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        try {
          await page.waitForFunction(
            ({ x, z, within }) => {
              const h = window.__test.hero();
              return Math.hypot(h.x - x, h.z - z) < within;
            },
            // The shared adapter has a 30-second protocol limit. Observe in bounded chunks
            // without restarting the total deadline or changing the arrival condition.
            { timeout: Math.max(1, Math.min(20000, remaining)) },
            { x, z, within },
          );
          arrived = true;
          break;
        } catch (error) {
          if (!(error instanceof TimeoutError)) throw error;
        }
      }
      assert(arrived, `Hero did not reach (${x}, ${z}) within ${timeout} ms`);
    } finally {
      if (process.env['CI']) {
        const end = await page.evaluate(() => {
          const h = window.__test.hero();
          return { x: h.x, z: h.z, time: window.__game.sim.state.time };
        });
        console.log('CI walk end', {
          arrived,
          wallMs: Date.now() - startedAt,
          simulationSeconds: end.time - start.time,
          remainingDistance: Math.hypot(end.x - x, end.z - z),
          within,
        });
      }
    }
  }

  async function leave() {
    await page.evaluate(async () => {
      const g = window.__game,
        h = window.__test.hero();
      const { roomAt, roomDoor } = await import('/src/game/systems/rooms.ts');
      const r = window.__test.require(roomAt(g.sim, h.x, h.z));
      const d = window.__test.require(roomDoor(r.b));
      g.cam.yaw = Math.atan2(h.x - d.x, h.z - d.z);
    });
    await page.keyboard.down('KeyW');
    try {
      await page.waitForFunction(() => !window.__game.indoors && !window.__test.hero().transit, {
        timeout: 15000,
      });
    } finally {
      await page.keyboard.up('KeyW');
    }
  }
  const shopDoor = await page.evaluate(async () => {
    const { frontDoor } = await import('/src/game/systems/rooms.ts');
    return frontDoor(window.__test.require(window.__game.sim.state.buildings.find((b) => b.kind === 'shop')));
  });
  await walk(shopDoor.x, shopDoor.z);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__game.indoors && !window.__test.hero().transit, {
    timeout: 15000,
  });
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__test.input.ui.window?.kind === 'shop', { timeout: 15000 });
  let card;
  for (const c of await page.$$('.card'))
    if ((await c.evaluate((e) => e.textContent)).includes('Crafter Kit')) {
      card = c;
      break;
    }
  assert(card);
  await card.click();
  await page.waitForFunction(() => window.__test.hero().tools.length >= 6);
  await pause(300);
  const torchBox = await page.evaluate(() => {
    const c = window.__test.require(
      [...document.querySelectorAll('.card')].find((e) => e.textContent.includes('Pitchwood Torch')),
    );
    const r = c.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(torchBox.x, torchBox.y);
  await page.waitForFunction(() => window.__test.hero().torchOwned);
  await page.keyboard.press('Escape');
  await leave();
  console.log('kit, torch and door transition passed');
  const tree = await page.evaluate(() => {
    const g = window.__game,
      h = window.__test.hero();
    return g.sim.state.nodes
      .filter((n) => n.kind === 'tree')
      .sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z))[0];
  });
  assert(tree, 'a gatherable tree exists');
  await page.evaluate((id) => {
    const g = window.__game,
      h = window.__test.hero();
    g.sim.apply({ t: 'interact', hero: h.id, target: id });
  }, tree.id);
  await page.waitForFunction(() => (window.__test.hero().bag.wood ?? 0) >= 4, {
    timeout: 30000,
  });
  await page.evaluate(() => {
    const g = window.__game;
    g.sim.apply({ t: 'stop', hero: g.localHero });
  });
  console.log('wood gathered');
  const exit = await page.evaluate(() => window.__test.require(window.__game.sim.state.mines[0]).exit);
  await walk(exit.x, exit.z, 0.6);
  console.log(
    'mine approach',
    await page.evaluate(() => {
      const g = window.__game,
        h = window.__test.hero();
      return {
        prompt: window.__test.input.prompt,
        h: { x: h.x, z: h.z, task: h.task },
        mine: g.sim.state.mines[0],
      };
    }),
  );
  await page.keyboard.press('KeyF');
  await pause(1000);
  console.log(
    'mine interaction',
    await page.evaluate(() => {
      const h = window.__test.hero();
      return {
        prompt: window.__test.input.prompt,
        h: { x: h.x, z: h.z, task: h.task, transit: h.transit },
        hint: window.__test.input.ui.cursorHint,
      };
    }),
  );
  await page.waitForFunction(() => window.__game.under && !window.__test.hero().transit, {
    timeout: 20000,
  });
  console.log('lift descent passed');
  await click('Prepare charges');
  await click('Inspect indicator');
  await click('Pack 2 starter charges');
  await click('Understood — enable placement');
  await page.waitForFunction(() => document.body.innerText.includes('Blasting ready'));
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__test.hero().bag.dynamite), 2);
  console.log('starter charge preparation passed');
  await pause(1800);
  await page.screenshot({ path: 'scripts/out/first-loop-mine.png' });
  // Precise mouse contact gathers actual rock rather than injecting starter materials.
  for (let i = 0; i < 12; i++) {
    const enough = await page.evaluate(() => (window.__test.hero().bag.stone ?? 0) >= 4);
    if (enough) break;
    const point = await page.evaluate(async (i) => {
      const g = window.__game,
        h = window.__test.hero();
      const { earth } = await import('/src/game/excavation.ts');
      const { groundHeight } = await import('/src/game/map.ts');
      const f = earth(g.sim),
        y = groundHeight(g.sim.world, h.x, h.z) + 0.7 + (i % 3) * 0.12;
      const hit = f.ray({ x: h.x, y, z: h.z }, { x: 0, y: 0, z: 1 }, 3);
      if (!hit) throw Error('No exposed arrival rock');
      g.cam.yaw = 0;
      return { world: hit };
    }, i);
    await pause(300);
    const pos = await page.evaluate((p) => {
      const camera = window.__game.stage.camera;
      const v = camera.position.clone().set(p.x, p.y, p.z).project(camera);
      return { x: (v.x + 1) * 640, y: (1 - v.y) * 400 };
    }, point.world);
    await page.keyboard.down('ShiftLeft');
    await page.mouse.click(pos.x, pos.y, { button: 'right' });
    await page.keyboard.up('ShiftLeft');
    await pause(550);
  }
  assert(
    (await page.evaluate(() => window.__test.hero().bag.stone ?? 0)) >= 4,
    'actual aimed mining supplies first tower',
  );
  console.log('stone gathered by mouse');
  // Return to the lift using the mine navigation grid, then ascend.
  const lift = await page.evaluate(() => window.__test.require(window.__game.sim.state.mines[0]).lift);
  await walk(lift.x, lift.z, 0.6);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => !window.__game.under && !window.__test.hero().transit, {
    timeout: 20000,
  });
  const workshopDoor = await page.evaluate(async () => {
    const { frontDoor } = await import('/src/game/systems/rooms.ts');
    return frontDoor(
      window.__test.require(window.__game.sim.state.buildings.find((b) => b.kind === 'anvil')),
    );
  });
  await walk(workshopDoor.x, workshopDoor.z);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__game.indoors && !window.__test.hero().transit, {
    timeout: 15000,
  });
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => document.body.innerText.includes('Load materials and start tower'));
  await click('Load materials and start tower');
  for (let i = 0; i < 5; i++) {
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        (b) => b.textContent === 'Hammer the next section' && !b.disabled,
      ),
    );
    await click('Hammer the next section');
    await pause(550);
  }
  await page.waitForFunction(() =>
    window.__test.require(window.__game.sim.state.towerCrates).some((c) => c.ready),
  );
  await page.screenshot({ path: 'scripts/out/first-loop-workshop.png' });
  await page.keyboard.press('Escape');
  await leave();
  console.log('platform construction passed');
  const oversight = await page.evaluate(async () => {
    const { oversightSpot } = await import('/src/game/towerwork.ts');
    return oversightSpot();
  });
  await walk(oversight.x, oversight.z, 0.6);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => document.body.innerText.includes('Confirm shipment'));
  const destination = await page.evaluate(async () => {
    const { deploymentBlocker } = await import('/src/game/towerwork.ts');
    const { WALL, cellOf, cellCenter, MAP } = await import('/src/game/map.ts');
    const g = window.__game;
    for (let x = WALL.x + 6; x < WALL.x + 25; x++)
      for (let z = -14; z < 14; z++) {
        const c = cellOf(x, z);
        if (!deploymentBlocker(g.sim, c.cx, c.cz)) {
          const p = cellCenter(c.cx, c.cz);
          return {
            ...c,
            x: (p.x - MAP.minX) / (MAP.maxX - MAP.minX),
            z: (p.z - MAP.minZ) / (MAP.maxZ - MAP.minZ),
          };
        }
      }
    throw Error('No deployment spot');
  });
  const canvas = await page.$('canvas[width="960"]');
  assert(canvas, 'deployment overview canvas exists');
  const box = await canvas.boundingBox();
  assert(box, 'deployment overview canvas is visible');
  await page.mouse.click(box.x + box.width * destination.x, box.y + box.height * destination.z);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent === 'Confirm shipment' && !b.disabled),
  );
  await page.screenshot({ path: 'scripts/out/first-loop-overview.png' });
  await click('Confirm shipment');
  await page.waitForFunction(() =>
    window.__test.require(window.__game.sim.state.towerCrates).some((c) => c.shipment),
  );
  const shipment = await page.evaluate(() => {
    const s = window.__game.sim.state;
    return {
      time: s.time,
      shipments: window.__test.require(s.towerCrates).map((c) => ({
        id: c.id,
        elapsed: c.shipment?.t,
        duration: c.shipment?.duration,
      })),
    };
  });
  console.log('shipment dispatched', shipment);
  const duration = Math.max(0, ...shipment.shipments.map((item) => item.duration ?? 0));
  // Delivery retains its actual simulation duration; only software CI's wall allowance changes.
  const shipmentTimeout = process.env['CI'] ? Math.min(120000, Math.max(45000, duration * 10000)) : 45000;
  const shipmentStartedAt = Date.now();
  const shipmentDeadline = shipmentStartedAt + shipmentTimeout;
  let deployed = false;
  try {
    while (Date.now() < shipmentDeadline) {
      const remaining = shipmentDeadline - Date.now();
      if (remaining <= 0) break;
      try {
        await page.waitForFunction(() => window.__game.sim.state.firstTowerAt >= 0, {
          timeout: Math.max(1, Math.min(20000, remaining)),
        });
        deployed = true;
        break;
      } catch (error) {
        if (!(error instanceof TimeoutError)) throw error;
      }
    }
    assert(deployed, `Shipment did not deploy a tower within ${shipmentTimeout} ms`);
  } finally {
    if (process.env['CI']) {
      const time = await page.evaluate(() => window.__game.sim.state.time);
      console.log('CI shipment end', {
        deployed,
        duration,
        timeout: shipmentTimeout,
        wallMs: Date.now() - shipmentStartedAt,
        simulationSeconds: time - shipment.time,
      });
    }
  }
  const outcome = await page.evaluate(() => {
    const s = window.__game.sim.state;
    return {
      towers: s.buildings.filter((b) => b.kind === 'tower').length,
      crates: window.__test.require(s.towerCrates).length,
      wave: s.wave,
      firstTowerAt: s.firstTowerAt,
      nextWaveAt: s.nextWaveAt,
      bag: window.__test.hero().bag,
    };
  });
  assert.equal(outcome.towers, 1);
  assert.equal(outcome.crates, 0);
  assert.equal(outcome.wave, 0);
  assert(outcome.nextWaveAt > outcome.firstTowerAt);
  await page.screenshot({ path: 'scripts/out/first-loop-deployed.png' });
  await page.keyboard.press('Escape');
  await click('Walkthrough');
  await click('I know the basics');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready(page);
  assert.equal(await page.evaluate(() => localStorage.getItem('craftdef:guide')), 'off');
  assert(
    !(await page.evaluate(() => document.body.innerText)).includes('Would you like a guided walkthrough?'),
  );
  assert.equal(
    await page.evaluate(() => window.__game.sim.state.buildings.filter((b) => b.kind === 'tower').length),
    1,
  );
  console.log('returning-player skip and saved tower passed');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ outcome, errors }));
} catch (e) {
  console.error('First-loop failure:', e);
  try {
    await page.screenshot({ path: 'scripts/out/first-loop-failure.png' });
  } catch (screenshotError) {
    console.error('Failure screenshot unavailable:', screenshotError);
  }
  console.log(
    'failure state',
    await page.evaluate(() => {
      const g = window.__game,
        h = g?.sim.state.heroes[0];
      return {
        h: h && { x: h.x, z: h.z, task: h.task, transit: h.transit },
        time: g?.sim.state.time,
        phase: g?.sim.state.phase,
        firstTowerAt: g?.sim.state.firstTowerAt,
        crates: g?.sim.state.towerCrates?.map((c) => ({
          id: c.id,
          ready: c.ready,
          site: c.shipment?.site,
          elapsed: c.shipment?.t,
          duration: c.shipment?.duration,
        })),
        sites: g?.sim.state.sites,
        paused: g?.paused,
        speed: g?.speed,
        prompt: g?.input?.prompt,
        text: document.body.innerText.slice(-1800),
      };
    }),
    { errors },
  );
  throw e;
} finally {
  await browser.close();
}
