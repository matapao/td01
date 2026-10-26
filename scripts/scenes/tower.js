// Scene: a selected, enchanted storm tower with gems in its sockets during a wave (details panel + range ring).
(() => {
  const d = window.__debug;
  const sim = d.sim;
  d.reveal();
  const a = d.tower(-16, -12, 'storm', 'swift', 'twin', 'sun');
  const b = window.__test.require(sim.getAs(a, 'building'));
  const g = sim.rollGear(2, 'gears');
  b.gear.push(g);
  b.affixes.push(...g.affixes);
  b.relics.push(g.name);
  b.hp = b.maxHp * 0.62;
  d.tower(-10, -16, 'blast', 'fury');
  d.wave();
  d.ff(40);
  d.cam(-14, -10, 24);
  window.__test.input.select({ kind: 'building', id: a });
})();
