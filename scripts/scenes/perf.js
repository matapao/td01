// Stress scene: ~150 lane enemies + towers, measure FPS for 3 s.
(async () => {
  const d = window.__debug;
  d.reveal();
  for (const [el, x, z] of /** @type {const} */ ([
    ['ember', -16, -12],
    ['blast', -10, -16],
    ['arcane', -22, -9],
    ['frost', -20, 7],
    ['storm', -16, 3],
    ['blast', 1, -15],
    ['arcane', 10, -8.5],
    ['ember', 8, 18],
  ]))
    d.tower(x, z, el, 'swift', 'sun', 'far');
  const sim = d.sim;
  sim.callWave();
  const kinds = /** @type {const} */ ([
    'minion',
    'minion',
    'runner',
    'warrior',
    'necromancer',
    'wraith',
    'crusher',
    'digger',
  ]);
  const mod = await import('/src/game/systems/enemies.ts');
  for (let i = 0; i < 150; i++) {
    const e = mod.spawnEnemy(sim, window.__test.require(kinds[i % kinds.length]), i % 2, 3, {
      d: 8 + (i % 40) * 1.6,
      lat: ((i * 7) % 5) / 2 - 1,
    });
    e.spawnT = 0;
  }
  d.ff(2);
  d.cam(-2, -8, 46);
  await new Promise((r) => setTimeout(r, 1500));
  const info = window.__game.stage.renderer.info;
  let n = 0;
  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      n++;
      if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
      else resolve(undefined);
    };
    requestAnimationFrame(tick);
  });
  const s = sim.state;
  console.error(
    'PERF ' +
      JSON.stringify({
        fps: (n / ((performance.now() - t0) / 1000)).toFixed(1),
        enemies: s.enemies.length,
        projs: s.projs.length,
        drops: s.drops.length,
        programs: info.programs?.length,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      }),
  );
})();
setTimeout(() => {
  const g = window.__game;
  const ids = new Map();
  g.stage.scene.traverse((o) => {
    if (!('material' in o)) return;
    /** @type {unknown[]} */
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const material of mats)
      for (const key of [
        'map',
        'emissiveMap',
        'normalMap',
        'roughnessMap',
        'metalnessMap',
        'aoMap',
        'alphaMap',
      ]) {
        if (!material || typeof material !== 'object' || !(key in material)) continue;
        /** @type {unknown} */
        const texture = Reflect.get(material, key);
        if (texture && typeof texture === 'object' && 'id' in texture && typeof texture.id === 'number')
          ids.set(texture.id, (ids.get(texture.id) ?? 0) + 1);
      }
  });
  const p = Object.fromEntries(Object.entries(g.prof).map(([k, v]) => [k, v.toFixed(2)]));
  console.error('PROF ' + JSON.stringify(p) + ' uniqueTextures=' + ids.size);
}, 5200);
