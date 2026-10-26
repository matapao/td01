// Scene: a blueprint site being assembled + a station working, hero carrying parts.
(() => {
  const d = window.__debug;
  const s1 = d.plan('tower', -24, -8);
  const s2 = d.plan('tower', -20, 7);
  const st = d.build('sawmill', -30, 10);
  const sim = d.sim;
  const h = window.__test.require(sim.state.heroes[0]);
  // Deliver some parts to the second tower's site.
  const site2 = window.__test.require(sim.getAs(s2, 'site'));
  site2.have = { wood: 2, stone: 1 };
  // Fully supply the first tower and partially assemble it.
  const site1 = window.__test.require(sim.getAs(s1, 'site'));
  site1.have = { ...site1.need };
  site1.work = 45;
  const b = window.__test.require(sim.getAs(st, 'building'));
  b.input = { wood: 6 };
  d.give({ wood: 6, stone: 3 });
  d.heroTo(-25.5, -5.5);
  sim.apply({ t: 'interact', hero: h.id, target: s1 });
  d.ff(1.2);
  d.cam(-25, -1, 22);
})();
