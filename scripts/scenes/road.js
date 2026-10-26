// Scene: wave 2 on the North Road near the bridge, close camera.
(() => {
  const d = window.__debug;
  d.reveal();
  d.tower(1, -15, 'swift');
  d.tower(10, -8.5, 'arcane', 'fury');
  d.tower(-6, -16, 'blast');
  d.wave();
  d.ff(30);
  d.wave();
  d.ff(16);
  d.cam(9, -13, 19);
})();
