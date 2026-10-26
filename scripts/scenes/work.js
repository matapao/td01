// Scene: hero hammering a Tower plan (action panel), a lookout tower built (intel), shop data ready.
(() => {
  const d = window.__debug;
  const sim = d.sim;
  const h = window.__test.require(sim.state.heroes[0]);
  d.tower(-30, -14, 'seer');
  const s1 = d.plan('tower', -24, -8);
  const site = window.__test.require(sim.getAs(s1, 'site'));
  site.have = { ...site.need };
  d.heroTo(-24.5, -5.2);
  sim.apply({ t: 'interact', hero: h.id, target: s1 });
  d.ff(0.6);
  d.give({ wood: 3, stone: 2 });
  h.gear.push(sim.rollGear(2, 'gears'), sim.rollGear(1, 'planks'));
  d.cam(-25, -4, 20);
  window.__test.input.select({ kind: 'site', id: s1 });
})();
