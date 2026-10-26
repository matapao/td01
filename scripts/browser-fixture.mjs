/** @param {import('puppeteer-core').Page} page @param {number} [timeout] */
export async function ready(page, timeout = 90000) {
  await page.waitForFunction(() => window.__ready === true, { timeout });
  await page.evaluate(() => {
    const game = window.__game;
    if (!game.input) throw new Error('Ready game has no input controller');
    window.__test = {
      input: game.input,
      /** @template T @param {T | undefined | null} value @returns {T} */
      require(value) {
        if (value === undefined || value === null) throw new Error('Required browser fixture is missing');
        return value;
      },
      hero() {
        const hero = game.sim.state.heroes[0];
        if (!hero) throw new Error('Ready game has no first hero');
        return hero;
      },
    };
  });
}
