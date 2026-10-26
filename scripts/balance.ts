/**
 * Balance probe: builds fixed defences instantly (no hero, no repairs, no enchants) and runs
 * every wave. A rough guide to the difficulty curve.   npm run balance
 */
import { Sim } from '../src/game/sim.ts';
import { forceCompleteSite, placementBlocker } from '../src/game/systems/craft.ts';
import { CELL, GATE, GRID_W, MAP, cellOf, wallDist } from '../src/game/map.ts';
import { NIGHT, SOCKETS, sizeOf, type GemId } from '../src/game/content.ts';

/** Players light their towers for the nights; `--dark` leaves them unlit. */
const LIT = !process.argv.includes('--dark');
/** Players shut the gate against the dead (they batter it under the towers' fire); `--open` leaves it open. */
const SHUT = !process.argv.includes('--open');
/** `--seeds N` plays each line-up on N worlds and sums up (one game is a noisy guide). */
const SEEDS = Number(process.argv[process.argv.indexOf('--seeds') + 1]) || 1;

/**
 * A tower `dx` m out beyond the gate and `dz` m to its side (+ south), with the gems set in its
 * windows. Towers stand only beyond the wall: the three roads come together at the gate, so the
 * ground in front of it is where every wave passes.
 */
type Spot = [number, number, GemId[]];

function run(
  layout: Spot[],
  label: string,
  seed = 3,
  quiet = false,
): { won: boolean; lives: number; wave: number } {
  const sim = new Sim({ seed });
  sim.state.explored.fill(1);
  sim.state.gate.shut = SHUT;
  const h = sim.state.heroes[0];
  if (!h) throw new Error('Balance probe needs its initial hero');
  /**
   * Lights a tower for the nights: the wall's torches reach the towers near it; further out, a brazier
   * up on the wall-walk (the nearest free spot there, if one is within its reach).
   */
  const lightUp = (x: number, z: number) => {
    if (wallDist(x, z) <= NIGHT.town) return;
    if (!h.known.includes('brazier')) h.known.push('brazier');
    let best = -1;
    let bd = NIGHT.beacon - 0.5;
    sim.world.cells.forEach((f, k) => {
      if (!(f & CELL.WALK)) return;
      const cx = k % GRID_W;
      const cz = (k / GRID_W) | 0;
      const d = Math.hypot(MAP.minX + cx + 0.5 - x, MAP.minZ + cz + 0.5 - z);
      if (d < bd && !placementBlocker(sim, cx, cz, 1, 'brazier')) {
        bd = d;
        best = k;
      }
    });
    if (best < 0) return;
    const sites = sim.state.sites.length;
    sim.apply({ t: 'place', hero: h.id, plan: 'brazier', cx: best % GRID_W, cz: (best / GRID_W) | 0 });
    if (sim.state.sites.length > sites) forceCompleteSite(sim, sim.state.sites[sim.state.sites.length - 1]!);
  };
  const shoots = (b: { stats: { range: number } | null }) => !!b.stats && b.stats.range > 0;
  const build = (x: number, z: number, gems: GemId[]) => {
    const c = cellOf(x, z);
    for (let r = 0; r < 14; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (
            Math.max(Math.abs(dx), Math.abs(dz)) !== r ||
            placementBlocker(sim, c.cx + dx, c.cz + dz, sizeOf('tower'), 'tower')
          )
            continue;
          sim.apply({ t: 'place', hero: h.id, plan: 'tower', cx: c.cx + dx, cz: c.cz + dz });
          forceCompleteSite(sim, sim.state.sites[sim.state.sites.length - 1]!);
          const b = sim.state.buildings[sim.state.buildings.length - 1];
          if (!b) throw new Error('Balance tower placement did not create a building');
          for (const m of gems) {
            if (!h.known.includes(m)) h.known.push(m);
            sim.apply({ t: 'placeGem', hero: h.id, plan: m, building: b.id });
            const s = sim.state.sites.find((s) => s.building === b.id && sim.alive(s.id));
            if (s) forceCompleteSite(sim, s);
            else
              console.log(
                `   ${m} would not go into the tower at ${x.toFixed(0)},${z.toFixed(0)}: ${b.gems.join('+')}`,
              );
          }
          if (LIT && shoots(b) && !b.gems.includes('sun')) lightUp(b.x, b.z);
          sim.step();
          return;
        }
  };
  // Layouts are out from the gate (m).
  for (const [dx, dz, m] of layout) build(GATE.x + dx, GATE.z + dz, m);
  for (let i = 0; i < 10; i++) sim.step();
  const unlit = sim.state.buildings.filter((b) => shoots(b) && !b.lit);
  if (LIT && unlit.length && !quiet)
    console.log(
      `   unlit from the start: ${unlit.map((b) => `${b.gems[0]}@${b.x.toFixed(0)},${b.z.toFixed(0)}`).join(' ')}`,
    );
  const leaksAt: string[] = [];
  const byKind: Record<string, number> = {};
  let destroyed = 0;
  sim.events.on('enemyLeaked', (e) => {
    const en = sim.getAs(e.id, 'enemy');
    const k = `${e.kind}@${en ? sim.world.lanes[en.lane]!.def.name.split(' ')[0] : '?'}`;
    byKind[k] = (byKind[k] ?? 0) + 1;
  });
  sim.events.on('buildingDestroyed', () => destroyed++);
  let lastLives = sim.state.lives;
  for (let t = 0; t < 20 * 60 * 25 && sim.state.phase !== 'won' && sim.state.phase !== 'lost'; t++) {
    if (sim.state.nextWaveAt > sim.state.time + 3 && sim.state.wave === 0) sim.callWave();
    sim.step();
    if (sim.state.lives !== lastLives) {
      leaksAt.push(`w${sim.state.wave}:-${lastLives - sim.state.lives}`);
      lastLives = sim.state.lives;
    }
  }
  const s = sim.state;
  const towers = sim.state.buildings.filter(shoots);
  const lit = towers.filter((b) => b.lit).length;
  if (!quiet) {
    console.log(
      `${label}${LIT ? '' : ' (unlit)'}${SHUT ? '' : ' (gate open)'}: lit ${lit}/${towers.length} · gate ${s.gate.hp.toFixed(0)}/${s.gate.maxHp} · phase=${s.phase} wave=${s.wave} lives=${s.lives} kills=${s.stats.kills} time=${(s.time / 60).toFixed(1)}min destroyed=${destroyed} buildingsLeft=${s.buildings.length}`,
    );
    console.log('   leaked:', JSON.stringify(byKind));
  }
  return { won: s.phase === 'won', lives: s.lives, wave: s.wave };
}

function probe(layout: Spot[], label: string): void {
  if (SEEDS <= 1) {
    run(layout, label);
    return;
  }
  const res = Array.from({ length: SEEDS }, (_, i) => run(layout, label, 3 + i, true));
  const won = res.filter((r) => r.won).length;
  console.log(
    `${label}: won ${won}/${SEEDS} · lives ${res.map((r) => (r.won ? r.lives : `✗w${r.wave}`)).join(' ')} · mean ${(res.reduce((a, r) => a + r.lives, 0) / SEEDS).toFixed(1)}`,
  );
}

// The old line-ups, as gems: the same towers and roles as before (a catapult is now a blast ruby,
// an arcane spire an arcane amethyst, a lookout a seer's emerald…), set out in front of the gate where
// the roads come together.
const basic: Spot[] = [
  [7, -7, []],
  [7, 6, []],
  [11, -12, []],
  [11, 10, ['blast']],
];
const mid: Spot[] = [
  [7, -7, ['swift', 'twin']],
  [7, 6, ['far']],
  [11, -12, []],
  [11, 10, ['blast', 'fury']],
  [15, -5, ['arcane', 'fury']],
  [15, 4, ['blast', 'swift']],
  [9, 15, ['swift']],
  [9, -16, ['frost']],
  [5, -1, ['seer']],
];
const strong: Spot[] = [
  ...mid.map(([x, z, m]) => [x, z, m.includes('swift') && !m.includes('twin') ? [...m, 'twin'] : m] as Spot),
  [19, -10, ['storm', 'fury']],
  [19, 9, ['blast', 'fury', 'swift']],
  [13, 15, []],
  [23, -3, ['far', 'arcane']],
  [17, -17, ['frost', 'twin', 'swift']],
  [23, 14, ['scry']],
];
const adapted: Spot[] = [
  ...strong,
  [27, 8, ['arcane', 'fury']],
  [21, 19, ['storm', 'fury']],
  [29, 18, ['far', 'arcane']],
  [26, -12, ['seer']],
];
// …and the same towers with every socket filled: sun topaz for light, warhearts, rime.
const full: Spot[] = adapted.map(([x, z, m], i) => {
  const out = [...m];
  for (const g of ['sun', i % 2 ? 'rime' : 'warheart', 'swift', 'far', 'fury'] as GemId[])
    if (out.length < SOCKETS && !out.includes(g)) out.push(g);
  return [x, z, out] as Spot;
});
probe(basic, 'basic 4 towers');
probe(mid, 'mid 9 towers + gems');
probe(strong, 'strong 15 towers');
probe(adapted, 'adapted 19 towers (south anti-air)');
probe(full, 'full 19 towers (every socket filled)');
