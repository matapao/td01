(() => {
  const d = window.__debug;
  const sim = d.sim;
  sim.state.library.push('swift', 'seer', 'stonecutter', 'sun');
  window.__hud.toggle({ kind: 'book' });
})();
