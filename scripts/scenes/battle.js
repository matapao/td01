// Scene: towers around the merge and the north bridge, wave in progress.
(() => {
  const d = window.__debug;
  d.reveal();
  d.tower(-22, -9, 'swift', 'twin', 'sun');
  d.tower(-16, 1.5, 'ember', 'fury');
  d.tower(-25, 6, 'blast', 'fury', 'warheart');
  d.tower(-31, -6, 'frost', 'rime');
  d.tower(-20, 7, 'seer', 'storm');
  d.build('sawmill', -33, 13);
  d.build('forge', -28, 15.5);
  d.give({ wood: 4 });
  d.heroTo(-24, -1);
  d.wave();
  d.ff(52);
  d.wave();
  d.ff(14);
  d.cam(-21, 0, 30);
})();
