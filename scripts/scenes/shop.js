(() => {
  const d = window.__debug;
  const sim = d.sim;
  sim.state.gold = 400;
  d.heroTo(-33, -8);
  d.give({ wood: 5, coal: 4 });
  window.__hud.toggle({ kind: 'shop', store: 'smithy' });
  d.heroTo(-48, 8);
})();
