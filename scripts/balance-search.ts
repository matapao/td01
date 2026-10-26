export type { Econ, Act, Strategy, Result } from './balance/contracts.ts';
export { ECONS, lseCost } from './balance/economy.ts';
export type { Spot } from './balance/spots.ts';
export { spots, spotOrder } from './balance/spots.ts';
export type { Genes } from './balance/genes.ts';
export {
  build,
  FAMILIES,
  OPEN_FAMILIES,
  starts,
  averageGenes,
  poorGenes,
  baseGenes,
  mutate,
  cross,
} from './balance/genes.ts';
import type { Econ, Act, Strategy, Result } from './balance/contracts.ts';
import {
  ECONS,
  Economy,
  GEM_OF_ITEM,
  lseCost,
  KAPPA,
  OVERHEAD,
  PLANK_HP,
  MEND_RATE,
  GATE_RATE,
  GRID_COST,
  CHEST_RUN,
  DEVICE_RESEARCH,
  type Wallet,
} from './balance/economy.ts';
import { spots, spotOrder, BATTER } from './balance/spots.ts';
import {
  build,
  FAMILIES,
  OPEN_FAMILIES,
  starts,
  averageGenes,
  poorGenes,
  baseGenes,
  mutate,
  cross,
  sampleGene,
  ALL_GEMS,
  DEVICES,
  type Genes,
} from './balance/genes.ts';
/**
 * Economy-constrained strategy search: how the build routes smart, average and poor players would
 * take hold up, game after game, across Sigil levels — and which options are worth more than they cost.
 *
 * The real simulation runs the waves (towers, gems, tops, devices, lighting, the shut gate, crewing,
 * Battle Cry, night) while the economy is modelled: a strategy is an ordered build plan (towers at
 * spots beyond the wall, gems and their levels, tops, devices) carried out as its budget allows. The
 * budget is two pools, measured from real sim runs (see the numbers below):
 *  - gold: the sim's own (start, wave bonuses and rewards) plus kill gold as the towers earn it
 *    (collected at `goldEff`: a hero has to haul it up from the field);
 *  - labour: one second a second per hero (`labourEff` for slower players) while the hero is free —
 *    not while crewing a tower or keeping the gate. Every part costs labour to gather / mine / craft
 *    (GATHER, CRAFT) or gold to buy (SHOP, or the porters' buyout: partPrice); a build is paid the
 *    cheapest way the pools allow (labour + KAPPA × gold), plus its hands-on overhead (OVERHEAD), the
 *    first use of a plan (study time, and its scroll's gold if no wave reward has brought it yet), and
 *    the first trip to a mine chamber (UNLOCK: dynamite, guardians).
 *  Smart players mend the gate and patch towers between waves, light the towers the wall's torches
 *  don't reach, and may take a post on the wall-walk in the waves (crewing the gate tower and Battle
 *  Cry, or keeping the gate: mending it while it is battered — paid in planks).
 *
 * A family is a route players take (one gem led on every tower — ember, blast, storm…, plain tower
 * spam, or mixes); its genes (tower count, layout by the gate or along the roads, gems per tower and
 * their grade, roofs, devices, class, post, upkeep, the chest run) are searched for the best build.
 *
 * Usage (10 worker processes by default; --workers N):
 *   node scripts/balance-search.ts --search --sigil 1 --out champs.json   # evolutionary search, every family
 *   node scripts/balance-search.ts --report --load champs.json           # each family's champion × Sigil 0–3
 *   node scripts/balance-search.ts --classes --load champs.json          # smart (champions) / average / poor players × Sigil
 *   node scripts/balance-search.ts --beta --load champs.json             # the least economy each champion needs to win
 *   node scripts/balance-search.ts --explain --load champs.json          # what each champion spends its economy on
 *   node scripts/balance-search.ts --probe --towers 10 --base fury,swift # instant defences: what each option adds
 *   node scripts/balance-search.ts --probe --sets "storm,fury,twin,far;ember,swift,twin,far" --upto 9
 *   node scripts/balance-search.ts --fam storm --genes '{"towers":12}' --econ average --seeds 2 --verbose
 * Options: --seeds N (games per strategy, default 4) · --seed0 N · --sigils 0,1,2,3 · --pop N · --gens N ·
 *   --families a,b · --sample N (random average/poor players) · --hp X (the dead X times as tough) ·
 *   --out file.json (save the champions) · --load file.json (start from / report saved champions).
 */
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Sim } from '../src/game/sim.ts';
import { DT } from '../src/game/config.ts';
import { forceCompleteSite, placementBlocker } from '../src/game/systems/craft.ts';
import { mendGate } from '../src/game/systems/wall.ts';
import { CELL, GRID_W, GATE, MAP, cellCenter, onWall, wallDist, wallSpot } from '../src/game/map.ts';
import {
  ABILITIES,
  ECONOMY,
  ENEMIES,
  NIGHT,
  OVER_WALL,
  PLANS,
  gemBlocker,
  nextTop,
  sizeOf,
  type GemId,
  type GemPlan,
  type ItemId,
  type Parts,
} from '../src/game/content.ts';
import { WAVES } from '../src/game/waves.ts';
import type { Building } from '../src/game/types.ts';

// ---- Playing a game ----------------------------------------------------------------------------------

const GEM_PARTS = (id: GemId, lv: number): Parts => {
  const p = PLANS[id] as GemPlan;
  const out: Parts = { ...p.parts };
  out[p.color] = lv;
  return out;
};

/** How many raw gems of each colour a plan will melt (to decide which chambers are worth the trip). */
function gemDemand(acts: Act[]): Map<string, number> {
  const out = new Map<string, number>();
  const lv = new Map<string, number>();
  for (const a of acts) {
    if (a[0] !== 'G' && a[0] !== 'U') continue;
    const key = `${a[1]}:${a[2]}`;
    const next = a[0] === 'G' ? 1 : (lv.get(key) ?? 1) + 1;
    lv.set(key, next);
    for (const [it, n] of Object.entries(GEM_PARTS(a[2], next)) as [ItemId, number][]) {
      const u = GEM_OF_ITEM[it];
      if (u) out.set(u, (out.get(u) ?? 0) + n);
    }
  }
  return out;
}

/** A hook for diagnostics: called every second of a game played in this process. */
let DIAG: ((sim: Sim) => void) | null = null;
export function setDiag(fn: ((sim: Sim) => void) | null): void {
  DIAG = fn;
}

export function play(st: Strategy, seed: number, sigil: number, econIn: Econ, verbose = false): Result {
  const econ = { ...econIn };
  const S = spots();
  const sim = new Sim({ seed, sigil });
  const s = sim.state;
  s.explored.fill(1);
  const h = s.heroes[0];
  if (!h) throw new Error('Balance play needs its initial hero');
  if (st.cls !== 'tank') sim.apply({ t: 'chooseClass', hero: h.id, cls: st.cls });
  h.tools.push('axe', 'pickaxe', 'hammer');
  s.gold -= 28;
  const home = { x: MAP.heroStart.x, z: MAP.heroStart.z };
  const park = () => {
    h.x = h.px = home.x;
    h.z = h.pz = home.z;
    h.task = { k: 'idle' };
    h.path = [];
    h.pathGoal = null;
  };
  park();
  let labour = 0;
  let goldIn = s.gold;
  let labourIn = 0;
  const wallet: Wallet = {
    gold: () => s.gold,
    spendGold: (g) => {
      s.gold -= g;
    },
    get labour() {
      return labour;
    },
    set labour(v: number) {
      labour = v;
    },
  };
  const eco = new Economy(sim, h, econ, wallet);
  eco.demand = gemDemand(st.acts);
  // Incomes: kill gold as the towers earn it (hauled up at goldEff), the sim's own wave gold scaled the same way.
  sim.events.on('enemyDied', (e) => {
    const en = sim.getAs(e.id, 'enemy');
    if (!en || en.camp) return;
    const g = e.gold * econ.goldEff * econ.beta;
    s.gold += g;
    goldIn += g;
  });
  sim.events.on('gold', (e) => {
    if (e.reason === 'wave' || e.reason === 'early') {
      const adj = e.amount * (econ.beta - 1);
      s.gold += adj;
      goldIn += e.amount + adj;
    }
  });
  sim.events.on('dropSpawned', (e) => {
    if (e.item === 'gold') sim.remove(e.id);
  });
  if ((econ.hpMul ?? 1) !== 1) {
    sim.events.on('enemySpawned', (e) => {
      const en = sim.getAs(e.id, 'enemy');
      if (!en || en.camp) return;
      en.hp *= econ.hpMul!;
      en.maxHp *= econ.hpMul!;
    });
  }
  const lostBy: number[] = WAVES.map(() => 0);
  let firstLoss = 0;
  sim.events.on('livesLost', (e) => {
    lostBy[Math.max(0, s.wave - 1)]! += e.amount;
    if (!firstLoss) firstLoss = s.wave;
  });
  let gateBreaks = 0;
  sim.events.on('gateMoved', (e) => {
    if (e.broken) gateBreaks++;
  });
  const leaks: Record<string, number> = {};
  sim.events.on('enemyLeaked', (e) => {
    const en = sim.getAs(e.id, 'enemy');
    const how = en?.flying ? 'over' : en?.burrowed ? 'under' : 'gate';
    leaks[`${e.kind}:${how}`] = (leaks[`${e.kind}:${how}`] ?? 0) + e.damage;
  });
  // Towers by build index (null: not yet built, or fallen and waiting to be rebuilt).
  const towers: (Building | null)[] = [];
  const rebuild: number[] = [];
  const fallen = new Map<number, { gems: GemId[]; lv: number[]; top: number }>();
  sim.events.on('buildingDestroyed', (e) => {
    const t = towers.findIndex((b) => b && b.id === e.building);
    if (t < 0) return;
    const b = towers[t]!;
    fallen.set(t, { gems: [...b.gems], lv: b.gems.map((_, i) => b.gemLv?.[i] ?? 1), top: b.top ?? 1 });
    towers[t] = null;
    // A smart player builds it again: the tower, its gems at their levels, its top.
    if (econ.name !== 'poor') rebuild.push(t);
  });
  const braziers: { x: number; z: number }[] = [];
  const lit = (b: Building) =>
    wallDist(b.x, b.z) <= NIGHT.town ||
    b.gems.includes('sun') ||
    braziers.some((p) => Math.hypot(p.x - b.x, p.z - b.z) <= NIGHT.beacon);
  const lightUp = (b: Building) => {
    if (!st.light || lit(b) || wallDist(b.x, b.z) > NIGHT.beacon + 1) return;
    if (!eco.pay({ parts: { wood: 2, stone: 2 }, l: OVERHEAD.brazier, g: 0, plans: [] }, 'brazier')) return;
    if (!h.known.includes('brazier')) h.known.push('brazier');
    let best = -1;
    let bd = NIGHT.beacon - 0.4;
    for (let k = 0; k < sim.world.cells.length; k++) {
      if (!(sim.world.cells[k]! & CELL.WALK)) continue;
      const c = cellCenter(k % GRID_W, (k / GRID_W) | 0);
      const d = Math.hypot(c.x - b.x, c.z - b.z);
      if (d < bd && !placementBlocker(sim, k % GRID_W, (k / GRID_W) | 0, 1, 'brazier')) {
        bd = d;
        best = k;
      }
    }
    if (best < 0) return;
    const n = s.sites.length;
    sim.apply({ t: 'place', hero: h.id, plan: 'brazier', cx: best % GRID_W, cz: (best / GRID_W) | 0 });
    if (s.sites.length > n) {
      // The command was checked above to have appended a site synchronously.
      const site = s.sites[s.sites.length - 1]!;
      forceCompleteSite(sim, site);
      braziers.push({ x: site.x, z: site.z });
    }
  };

  const placeTower = (t: number): Building | null => {
    const sp = S[st.spots[t] ?? -1]!;
    if (!sp) return null;
    let at: { cx: number; cz: number } | null = null;
    if (!placementBlocker(sim, sp.cx, sp.cz, sizeOf('tower'), 'tower')) at = sp;
    else {
      for (let r = 1; r < 4 && !at; r++) {
        for (let dz = -r; dz <= r && !at; dz++) {
          for (let dx = -r; dx <= r && !at; dx++) {
            if (
              Math.max(Math.abs(dx), Math.abs(dz)) === r &&
              !placementBlocker(sim, sp.cx + dx, sp.cz + dz, sizeOf('tower'), 'tower')
            )
              at = { cx: sp.cx + dx, cz: sp.cz + dz };
          }
        }
      }
    }
    if (!at) return null;
    const n = s.sites.length;
    sim.apply({ t: 'place', hero: h.id, plan: 'tower', cx: at.cx, cz: at.cz });
    if (s.sites.length === n) return null;
    forceCompleteSite(sim, s.sites[s.sites.length - 1]!);
    const b = s.buildings[s.buildings.length - 1];
    if (!b) throw new Error('Balance site completion did not create a building');
    return b.kind === 'tower' ? b : null;
  };

  const setGem = (b: Building, g: GemId, lv: number): boolean => {
    if (lv === 1) {
      sim.apply({ t: 'placeGem', hero: h.id, plan: g, building: b.id });
    } else sim.apply({ t: 'upgradeGem', hero: h.id, building: b.id, gem: g });
    const site = s.sites.find((q) => q.building === b.id && sim.alive(q.id));
    if (!site) return false;
    forceCompleteSite(sim, site);
    return true;
  };

  /** Does act `a` make sense right now (its tower stands, the gem fits / is set and can grow…)? */
  const valid = (a: Act): 'ok' | 'skip' | 'wait' => {
    switch (a[0]) {
      case 'T':
        return 'ok';
      case 'G': {
        const b = towers[a[1]];
        if (b === undefined) return 'wait';
        if (!b) return fallen.has(a[1]) ? 'wait' : 'skip';
        return gemBlocker(b.gems, a[2]) ? 'skip' : 'ok';
      }
      case 'U': {
        const b = towers[a[1]];
        if (b === undefined) return 'wait';
        if (!b) return 'wait';
        if (!b.gems.includes(a[2])) return 'skip';
        const lv = b.gemLv?.[b.gems.indexOf(a[2])] ?? 1;
        return lv >= 3 ? 'skip' : 'ok';
      }
      case 'P': {
        const b = towers[a[1]];
        if (b === undefined) return 'wait';
        if (!b) return 'wait';
        return nextTop(b) ? 'ok' : 'skip';
      }
      case 'D': {
        const b = towers[a[1]];
        if (b === undefined) return 'wait';
        if (!b) return 'wait';
        return (b.devices ?? []).includes(a[2]) || (b.devices ?? []).length >= 4 ? 'skip' : 'ok';
      }
    }
  };

  /**
   * The grid, for real: the watermill repaired, and poles from it up to the wall-walk by the gate
   * (the towers carry it on, tower to tower).
   */
  const raiseGrid = () => {
    const hydro = s.sites.find((q) => q.plan === 'hydro');
    if (hydro) forceCompleteSite(sim, hydro);
    for (const p of ['pole', 'lamp'] as const) if (!h.known.includes(p)) h.known.push(p);
    const mill = s.buildings.find((b) => b.kind === 'hydro');
    if (!mill) return;
    const goal = wallSpot(GATE.x, 6);
    let from = { x: mill.x, z: mill.z };
    for (let n = 0; n < 12 && Math.hypot(from.x - goal.x, from.z - goal.z) > 1; n++) {
      let best = -1;
      let bd = Infinity;
      for (let k = 0; k < sim.world.cells.length; k++) {
        const c = cellCenter(k % GRID_W, (k / GRID_W) | 0);
        const step = Math.hypot(c.x - from.x, c.z - from.z);
        if (step > 12.5 || step < 2) continue;
        const d = Math.hypot(c.x - goal.x, c.z - goal.z);
        if (d < bd && !placementBlocker(sim, k % GRID_W, (k / GRID_W) | 0, 1, 'pole')) {
          bd = d;
          best = k;
        }
      }
      if (best < 0) break;
      const m = s.sites.length;
      sim.apply({ t: 'place', hero: h.id, plan: 'pole', cx: best % GRID_W, cz: (best / GRID_W) | 0 });
      if (s.sites.length === m) break;
      // The command was checked above to have appended a site synchronously.
      const site = s.sites[s.sites.length - 1]!;
      forceCompleteSite(sim, site);
      from = { x: site.x, z: site.z };
    }
  };

  let nextTower = 0;
  const doAct = (a: Act): boolean => {
    switch (a[0]) {
      case 'T': {
        if (s.time < econ.hold) return false;
        if (nextTower >= st.spots.length) return true;
        if (!eco.pay({ parts: PLANS.tower.parts, l: OVERHEAD.tower, g: 0, plans: [] }, 'tower')) return false;
        const b = placeTower(nextTower);
        towers[nextTower++] = b;
        if (b) lightUp(b);
        return true;
      }
      case 'G': {
        const b = towers[a[1]]!;
        if (!eco.pay({ parts: GEM_PARTS(a[2], 1), l: OVERHEAD.gem, g: 0, plans: [a[2]] }, `gem:${a[2]}`))
          return false;
        setGem(b, a[2], 1);
        return true;
      }
      case 'U': {
        const b = towers[a[1]]!;
        const lv = (b.gemLv?.[b.gems.indexOf(a[2])] ?? 1) + 1;
        if (!eco.pay({ parts: GEM_PARTS(a[2], lv), l: OVERHEAD.up, g: 0, plans: [a[2]] }, `up${lv}:${a[2]}`))
          return false;
        setGem(b, a[2], lv);
        return true;
      }
      case 'P': {
        const b = towers[a[1]]!;
        const id = nextTop(b)!;
        if (!eco.pay({ parts: PLANS[id].parts, l: OVERHEAD.top, g: 0, plans: [id] }, `top:${id}`))
          return false;
        sim.apply({ t: 'upgradeTop', hero: h.id, building: b.id });
        const site = s.sites.find((q) => q.building === b.id && sim.alive(q.id));
        if (site) forceCompleteSite(sim, site);
        return true;
      }
      case 'D': {
        const b = towers[a[1]]!;
        if (!eco.grid) {
          if (!eco.pay({ parts: {}, l: GRID_COST.l, g: GRID_COST.g, plans: [] }, 'grid')) return false;
          eco.grid = true;
          raiseGrid();
        }
        if (!eco.research.has(a[2])) {
          if (
            !eco.pay({ parts: {}, l: DEVICE_RESEARCH.l, g: DEVICE_RESEARCH.g, plans: [] }, `research:${a[2]}`)
          )
            return false;
          eco.research.add(a[2]);
        }
        if (!eco.pay({ parts: PLANS[a[2]].parts, l: OVERHEAD.dev, g: 0, plans: [] }, `dev:${a[2]}`))
          return false;
        if (!h.known.includes(a[2])) h.known.push(a[2]);
        sim.apply({ t: 'placeDevice', hero: h.id, plan: a[2], building: b.id });
        const site = s.sites.find((q) => q.building === b.id && sim.alive(q.id));
        if (site) forceCompleteSite(sim, site);
        return true;
      }
    }
  };

  /** A fallen tower raised again with what it held (its raw gems are mostly lost: 30% of the parts come back). */
  const doRebuild = (t: number): boolean => {
    const was = fallen.get(t);
    if (!was) return true;
    const parts: Parts = { ...PLANS.tower.parts };
    let l = OVERHEAD.tower;
    was.gems.forEach((g, i) => {
      for (let lv = 1; lv <= was.lv[i]!; lv++)
        for (const [it, n] of Object.entries(GEM_PARTS(g, lv)) as [ItemId, number][])
          parts[it] = (parts[it] ?? 0) + n * 0.7;
      l += OVERHEAD.gem;
    });
    if (was.top >= 2)
      for (const [it, n] of Object.entries(PLANS.turret.parts) as [ItemId, number][])
        parts[it] = (parts[it] ?? 0) + n * 0.7;
    if (was.top >= 3)
      for (const [it, n] of Object.entries(PLANS.gallery.parts) as [ItemId, number][])
        parts[it] = (parts[it] ?? 0) + n * 0.7;
    if (!eco.pay({ parts, l, g: 0, plans: [] }, 'rebuild')) return false;
    const b = placeTower(t);
    towers[t] = b;
    fallen.delete(t);
    if (!b) return true;
    was.gems.forEach((g, i) => {
      for (let lv = 1; lv <= was.lv[i]!; lv++) setGem(b, g, lv);
    });
    for (let k = 1; k < was.top; k++) {
      sim.apply({ t: 'upgradeTop', hero: h.id, building: b.id });
      const site = s.sites.find((q) => q.building === b.id && sim.alive(q.id));
      if (site) forceCompleteSite(sim, site);
    }
    lightUp(b);
    return true;
  };

  let ptr = 0;
  const execute = () => {
    for (let guard = 0; guard < 50; guard++) {
      if (rebuild.length) {
        if (!doRebuild(rebuild[0]!)) return;
        rebuild.shift();
        continue;
      }
      if (ptr >= st.acts.length) return;
      const a = st.acts[ptr]!;
      const v = valid(a);
      if (v === 'skip') {
        ptr++;
        continue;
      }
      if (v === 'wait') {
        // A later act that can go now (a fallen tower's gem waits for its rebuild).
        return;
      }
      if (!doAct(a)) return;
      ptr++;
    }
  };

  // ---- The hero in the waves: a post on the wall-walk, the gate --------------------------------------
  const walkersNear = (r: number) =>
    s.enemies.some(
      (e) =>
        !e.camp &&
        e.hp > 0 &&
        !e.flying &&
        !e.burrowed &&
        e.spawnT <= 0 &&
        Math.hypot(e.x - BATTER.x, e.z - BATTER.z) < r,
    );
  const anyNear = (r: number) =>
    s.enemies.some(
      (e) => !e.camp && e.hp > 0 && !e.burrowed && Math.hypot(e.x - BATTER.x, e.z - BATTER.z) < r,
    );
  let onPost = false;
  let busyT = 0;
  const crewTarget = (): Building | undefined => {
    // The strongest tower within crewing reach of the wall-walk (the gate's first).
    let best: Building | undefined;
    let bv = -1;
    for (const b of towers) {
      if (!b || !b.stats) continue;
      const p = wallSpot(b.x, b.z);
      if (Math.hypot(p.x - b.x, p.z - b.z) > OVER_WALL.crew - 0.5) continue;
      const v =
        (b.stats.damage *
          b.stats.rate *
          b.stats.shooters *
          (1 + b.stats.chain * 0.3 + b.stats.splash * 0.3)) /
        (1 + Math.hypot(b.x - BATTER.x, b.z - BATTER.z) / 8);
      if (v > bv) {
        bv = v;
        best = b;
      }
    }
    return best;
  };
  const postTick = () => {
    const boss = s.enemies.some(
      (e) => !e.camp && e.hp > 0 && ENEMIES[e.kind].boss && Math.hypot(e.x - BATTER.x, e.z - BATTER.z) < 30,
    );
    const fliers = s.enemies.some(
      (e) => !e.camp && e.hp > 0 && e.flying && Math.hypot(e.x - BATTER.x, e.z - BATTER.z) < 16,
    );
    const pressure =
      st.post === 'crew'
        ? walkersNear(14) || boss || fliers
        : walkersNear(5) || (s.gate.hp < s.gate.maxHp * 0.6 && walkersNear(20));
    const inWave = st.post !== 'none' && s.wave >= st.postFrom && pressure;
    if (!inWave) {
      if (onPost) {
        onPost = false;
        park();
      }
      return;
    }
    onPost = true;
    if (st.post === 'crew') {
      const b = crewTarget();
      if (!b) return;
      const p = wallSpot(b.x, b.z);
      if (Math.hypot(h.x - p.x, h.z - p.z) > 0.5) {
        h.x = h.px = p.x;
        h.z = h.pz = p.z;
        h.task = { k: 'idle' };
        h.path = [];
      }
      if (!onWall(h.x, h.z)) return;
      // Battle Cry when walkers are below; Rally when the dead are in the towers' reach.
      if (
        st.cls === 'tank' &&
        (h.cds.cry ?? 0) <= 0 &&
        s.enemies.some(
          (e) =>
            !e.camp &&
            !e.flying &&
            e.hp > 0 &&
            Math.hypot(e.x - h.x, e.z - h.z) < (ABILITIES.cry.radius ?? 6) + OVER_WALL.skillReach - 0.5,
        )
      )
        sim.apply({ t: 'cast', hero: h.id, ability: 'cry' });
      if (st.cls === 'support' && (h.cds.rally ?? 0) <= 0 && walkersNear(14))
        sim.apply({ t: 'cast', hero: h.id, ability: 'rally' });
    } else if (st.post === 'keeper') {
      // At the gate's winch, mending it as it is battered (planks bought or made as they go).
      h.x = h.px = GATE.x - 4.6;
      h.z = h.pz = 0.4;
      const g = s.gate;
      if (g.hp < g.maxHp) {
        if ((h.bag.planks ?? 0) < 2) {
          if (eco.pay({ parts: { planks: 10 }, l: 0, g: 0, plans: [] }, 'keep:planks'))
            h.bag.planks = (h.bag.planks ?? 0) + 10;
        }
        if ((h.bag.planks ?? 0) > 0 || g.repairBuf > 0) mendGate(sim, h, GATE_RATE * DT * econ.labourEff);
      }
    }
  };

  /** Between waves: mend the gate and patch the towers (planks, and the hammering). */
  let brokenAt = -1;
  const upkeep = () => {
    if (!st.mend) return;
    const g = s.gate;
    const quiet = !anyNear(45);
    if (g.shut) brokenAt = -1;
    else if (brokenAt < 0) brokenAt = s.time;
    // Broken in a wave: the hero notices, runs back (`react` s) and mends it a third of the way, so it swings shut.
    const rush = !quiet && !g.shut && !onPost && s.time - brokenAt >= econ.react;
    if (g.hp < g.maxHp && (quiet || rush)) {
      const target = quiet ? g.maxHp : g.maxHp * 0.32;
      const miss = target - g.hp;
      if (miss > 1) {
        const planks = Math.ceil(miss / PLANK_HP);
        // (Between the waves nobody is ramming it: mended as quickly as a building; in a wave, slowly.)
        if (
          eco.pay(
            { parts: { planks }, l: miss / (quiet ? MEND_RATE : GATE_RATE), g: 0, plans: [] },
            'mend:gate',
          )
        ) {
          g.hp = Math.min(g.maxHp, g.hp + miss);
          if (g.hp >= g.maxHp * 0.3) g.shut = true;
          // (The run back and the hammering: no other work meanwhile.)
          if (rush) busyT = econ.react / 2 + 3;
        }
      }
    }
    if (quiet) {
      for (const b of towers) {
        if (!b || b.hp >= b.maxHp * 0.75) continue;
        const miss = b.maxHp - b.hp;
        if (
          eco.pay(
            { parts: { planks: Math.ceil(miss / PLANK_HP) }, l: 3 + miss / MEND_RATE, g: 0, plans: [] },
            'mend:tower',
          )
        )
          b.hp = b.maxHp;
      }
    }
  };

  // ---- The game --------------------------------------------------------------------------------------
  const maxTicks = Math.round((30 * 60) / DT);
  let lastWave = 0;
  let chestsDone = false;
  let upto = false;
  for (let tick = 0; tick < maxTicks && s.phase !== 'won' && s.phase !== 'lost'; tick++) {
    if (econ.upto && s.waveCleared[econ.upto - 1] && s.lives > 0) {
      upto = true;
      break;
    }
    if (tick % 10 === 0) {
      postTick();
      const free = !onPost && busyT <= 0;
      if (busyT > 0) busyT -= 10 * DT;
      // Tools first (eight seconds at the market).
      if (free && s.time > 8) {
        const add = 10 * DT * econ.labourEff * econ.beta;
        labour += add;
        labourIn += add;
      }
      upkeep();
      const chestsDue = !chestsDone && st.chests >= 0 && s.wave >= st.chests && s.time >= econ.hold;
      if (chestsDue && free) {
        const need = (CHEST_RUN.l * econ.overhead) / econ.beta;
        if (labour >= need) {
          labour -= need;
          eco.spentL += need;
          s.gold += CHEST_RUN.gold * econ.beta;
          goldIn += CHEST_RUN.gold * econ.beta;
          for (const p of CHEST_RUN.scrolls) if (!s.library.includes(p)) s.library.push(p);
          chestsDone = true;
        }
      }
      // (Out on the chest run: nothing else gets built meanwhile.)
      if (!chestsDue || chestsDone) execute();
    } else if (st.post === 'keeper' && onPost) postTick();
    sim.step();
    if (DIAG && tick % 20 === 0) DIAG(sim);
    if (verbose && s.wave !== lastWave) {
      lastWave = s.wave;
      const tw = towers.filter(Boolean).length;
      console.log(
        `  t=${s.time.toFixed(0)}s wave ${s.wave}: towers ${tw} gems ${towers.reduce((n, b) => n + (b?.gems.length ?? 0), 0)} gold ${s.gold.toFixed(0)} labour ${labour.toFixed(0)} lives ${s.lives} gate ${s.gate.hp.toFixed(0)} acts ${ptr}/${st.acts.length} grid ${s.grid?.supply ?? 0}/${s.grid?.demand ?? 0}W devices on ${towers.filter((b) => b?.devicesOn).length} lit ${towers.filter((b) => b?.lit).length}`,
      );
    }
  }
  // Partial credit: how much of the wave it fell in was killed.
  let frac = 1;
  if (s.phase === 'lost') {
    const w = WAVES[s.wave - 1];
    if (!w) throw new Error(`Unknown failed balance wave ${s.wave}`);
    const total = w.groups.reduce((a, g) => a + g.count * ENEMIES[g.kind].hp, 0);
    const left =
      s.enemies
        .filter((e) => e.wave === s.wave - 1 && !e.camp)
        .reduce((a, e) => a + Math.max(0, e.hp) / (w.hp || 1), 0) +
      s.spawns.filter((sp) => sp.wave === s.wave - 1).reduce((a, sp) => a + ENEMIES[sp.kind].hp, 0);
    frac = Math.max(0, Math.min(1, 1 - left / Math.max(1, total)));
  }
  const built = towers.filter(Boolean) as Building[];
  const res: Result = {
    won: s.phase === 'won' || upto,
    lives: s.lives,
    cleared: s.phase === 'won' ? WAVES.length : Math.max(0, s.wave - 1),
    wave: s.wave,
    firstLoss,
    lostBy,
    gateBreaks,
    towers: built.length,
    gems: built.reduce((n, b) => n + b.gems.length, 0),
    gemLv: built.reduce((n, b) => n + b.gems.reduce((m, _, i) => m + (b.gemLv?.[i] ?? 1), 0), 0),
    goldIn,
    labourIn,
    spentG: eco.spentG,
    spentL: eco.spentL,
    slack: labour + KAPPA * Math.max(0, s.gold),
    acts: ptr,
    frac,
    time: s.time,
    buys: eco.buys,
    leaks,
  };
  return res;
}

/** One number for how a game went: a win scores 100 + 10 a life kept; a loss the waves cleared and the share of the last killed. */
export function score(r: Result): number {
  return r.won ? 100 + r.lives * 10 : r.cleared * 7 + r.frac * 6;
}

// ---- Workers -----------------------------------------------------------------------------------------

interface Job {
  id: number;
  strat: Strategy;
  seed: number;
  sigil: number;
  econ: Econ;
}

class Pool {
  private workers: ChildProcess[] = [];
  private idle: ChildProcess[] = [];
  private queue: { job: Job; done: (r: Result) => void }[] = [];
  private pending = new Map<number, (r: Result) => void>();
  private nextId = 1;
  games = 0;
  constructor(n: number) {
    const file = fileURLToPath(import.meta.url);
    for (let i = 0; i < n; i++) {
      const w = fork(file, ['--worker'], { execArgv: [] });
      w.on('message', (m: { id: number; res: Result }) => {
        const done = this.pending.get(m.id);
        this.pending.delete(m.id);
        this.games++;
        this.idle.push(w);
        this.pump();
        done?.(m.res);
      });
      this.workers.push(w);
      this.idle.push(w);
    }
  }
  run(strat: Strategy, seed: number, sigil: number, econ: Econ): Promise<Result> {
    return new Promise((done) => {
      this.queue.push({ job: { id: this.nextId++, strat, seed, sigil, econ }, done });
      this.pump();
    });
  }
  private pump(): void {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop()!;
      const { job, done } = this.queue.shift()!;
      this.pending.set(job.id, done);
      w.send(job);
    }
  }
  close(): void {
    for (const w of this.workers) w.kill();
  }
}

if (
  process.argv.includes('--worker') &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  process.on('message', (job: Job) => {
    let res: Result;
    try {
      res = play(job.strat, job.seed, job.sigil, job.econ);
    } catch (err) {
      console.error('worker error', err);
      res = {
        won: false,
        lives: 0,
        cleared: 0,
        wave: 0,
        firstLoss: 0,
        lostBy: [],
        gateBreaks: 0,
        towers: 0,
        gems: 0,
        gemLv: 0,
        goldIn: 0,
        labourIn: 0,
        spentG: 0,
        spentL: 0,
        slack: 0,
        acts: 0,
        frac: 0,
        time: 0,
        buys: {},
        leaks: {},
      };
    }
    process.send!({ id: job.id, res });
  });
}

// ---- Evaluating ------------------------------------------------------------------------------------------

const arg = (k: string, d: string): string => {
  const i = process.argv.indexOf(k);
  const value = process.argv[i + 1];
  return i >= 0 && value !== undefined ? value : d;
};
const SEEDS = Number(arg('--seeds', '4'));
const SEED0 = Number(arg('--seed0', '11'));

export interface Eval {
  strat: Strategy;
  genes?: Genes;
  res: Result[];
  score: number;
  winRate: number;
  lives: number;
  wave: number;
}

async function evaluate(
  pool: Pool,
  strat: Strategy,
  sigil: number,
  econ: Econ,
  seeds = SEEDS,
  genes?: Genes,
): Promise<Eval> {
  const res = await Promise.all(
    Array.from({ length: seeds }, (_, i) => pool.run(strat, SEED0 + i * 7, sigil, econ)),
  );
  const sc = res.reduce((a, r) => a + score(r), 0) / res.length;
  return {
    strat,
    ...(genes !== undefined ? { genes } : {}),
    res,
    score: sc,
    winRate: res.filter((r) => r.won).length / res.length,
    lives: res.reduce((a, r) => a + r.lives, 0) / res.length,
    wave: res.reduce((a, r) => a + (r.won ? 12 : r.wave), 0) / res.length,
  };
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Evolutionary search over a family's genes (lockFamily: its own gem stays first in its roles). */
async function searchFamily(
  pool: Pool,
  start: Genes[],
  sigil: number,
  econ: Econ,
  gens: number,
  popN: number,
  rseed: number,
  lockFamily = true,
  log = true,
): Promise<Eval[]> {
  const r = mulberry(rseed);
  let pop: Eval[] = await Promise.all(start.map((g) => evaluate(pool, build(g), sigil, econ, SEEDS, g)));
  while (pop.length < popN) {
    const g = mutate(sampleGene(r, start), r, lockFamily);
    pop.push(await evaluate(pool, build(g), sigil, econ, SEEDS, g));
  }
  for (let gen = 0; gen < gens; gen++) {
    pop.sort((a, b) => b.score - a.score);
    const elite = pop.slice(0, Math.max(2, Math.round(popN / 4)));
    const kids: Genes[] = [];
    while (kids.length < popN - elite.length) {
      const a = sampleGene(r, elite).genes!;
      const b = sampleGene(r, elite).genes!;
      kids.push(mutate(r() < 0.3 ? cross(a, b, r) : a, r, lockFamily));
    }
    const evals = await Promise.all(kids.map((g) => evaluate(pool, build(g), sigil, econ, SEEDS, g)));
    pop = [...elite, ...evals];
    pop.sort((a, b) => b.score - a.score);
    if (log)
      console.log(
        `   gen ${gen + 1}: best ${pop[0]!.score.toFixed(1)} (won ${(pop[0]!.winRate * 100).toFixed(0)}%, lives ${pop[0]!.lives.toFixed(1)}) ${pop[0]!.strat.name}`,
      );
  }
  return pop;
}

/** The least share of the economy (beta) a strategy needs to win at least half its games. */
async function betaMin(
  pool: Pool,
  strat: Strategy,
  sigil: number,
  econ: Econ,
  seeds = SEEDS,
): Promise<number> {
  let lo = 0.2;
  let hi = 1.6;
  const wins = async (b: number) => {
    const e = await evaluate(pool, strat, sigil, { ...econ, beta: b }, seeds);
    return e.winRate >= 0.5;
  };
  if (!(await wins(hi))) return Infinity;
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    if (await wins(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

function fmtEval(e: Eval): string {
  const losses = e.res.map((r) => (r.won ? `${r.lives}` : `✗w${r.wave}`)).join(' ');
  const r0 = e.res[0];
  if (!r0) throw new Error('Cannot format an empty balance evaluation');
  return `won ${(e.winRate * 100).toFixed(0).padStart(3)}% · lives ${e.lives.toFixed(1).padStart(4)} · wave ${e.wave.toFixed(1).padStart(4)} · [${losses}] · ${r0.towers}t ${r0.gems}g lv${r0.gemLv} · gate✗${(e.res.reduce((a, r) => a + r.gateBreaks, 0) / e.res.length).toFixed(1)} · in ${r0.goldIn.toFixed(0)}g/${r0.labourIn.toFixed(0)}s`;
}

// ---- Main ------------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const nWorkers = Number(arg('--workers', String(Math.max(1, Math.min(10, cpus().length)))));
  const sigils = arg('--sigils', '0,1,2,3').split(',').map(Number);
  const gens = Number(arg('--gens', '8'));
  const popN = Number(arg('--pop', '24'));
  const out = arg('--out', '');
  const t0 = performance.now();
  if (process.argv.includes('--one') || process.argv.includes('--fam')) {
    const strat = process.argv.includes('--fam')
      ? build(baseGenes(arg('--fam', 'mixed'), JSON.parse(arg('--genes', '{}'))))
      : (JSON.parse(arg('--one', '{}')) as Strategy);
    if (process.argv.includes('--acts')) console.log(strat.name, JSON.stringify(strat.acts));
    const name = strat.econ ?? arg('--econ', 'smart');
    const econ = Object.values(ECONS).find((value) => value.name === name);
    if (!econ) throw new Error(`Unknown balance economy ${name}`);
    for (let i = 0; i < SEEDS; i++) {
      const r = play(
        strat,
        SEED0 + i * 7,
        Number(arg('--sigil', '0')),
        econ,
        process.argv.includes('--verbose'),
      );
      console.log(
        JSON.stringify({
          won: r.won,
          lives: r.lives,
          wave: r.wave,
          cleared: r.cleared,
          lostBy: r.lostBy,
          gateBreaks: r.gateBreaks,
          towers: r.towers,
          gems: r.gems,
          gemLv: r.gemLv,
          goldIn: Math.round(r.goldIn),
          labourIn: Math.round(r.labourIn),
          slack: Math.round(r.slack),
          acts: `${r.acts}/${strat.acts.length}`,
        }),
      );
    }
    return;
  }
  const pool = new Pool(nWorkers);
  try {
    const families = arg('--families', FAMILIES.join(',')).split(',');
    const loadFile = arg('--load', '');
    const loaded: Record<string, { genes: Genes; score?: number }> = loadFile
      ? JSON.parse(readFileSync(loadFile, 'utf8'))
      : {};
    const champions: Record<string, { genes: Genes; score: number }> = {};
    const genesOf = (fam: string): Genes => champions[fam]?.genes ?? loaded[fam]?.genes ?? baseGenes(fam);
    // --hp X: every game with the dead X times as tough (how much margin a class has).
    const HPM = Number(arg('--hp', '1'));
    if (HPM !== 1) for (const economy of Object.values(ECONS)) economy.hpMul = HPM;
    if (process.argv.includes('--search')) {
      const sig = Number(arg('--sigil', '0'));
      // Every family's search at once (the workers stay busy).
      await Promise.all(
        families.map(async (fam) => {
          const start = loaded[fam] ? [loaded[fam].genes, ...starts(fam).slice(1)] : starts(fam);
          const pop = await searchFamily(
            pool,
            start,
            sig,
            ECONS['smart'],
            gens,
            popN,
            1234 + fam.length * 31,
            !OPEN_FAMILIES.includes(fam),
            false,
          );
          champions[fam] = { genes: pop[0]!.genes!, score: pop[0]!.score };
          console.log(`== ${fam.padEnd(9)} ${fmtEval(pop[0]!)}  ${pop[0]!.strat.name}`);
        }),
      );
      if (out) writeFileSync(out, JSON.stringify({ ...loaded, ...champions }, null, 1));
    }
    if (
      process.argv.includes('--report') ||
      !['--search', '--beta', '--classes', '--probe', '--explain'].some((f) => process.argv.includes(f))
    ) {
      console.log(`\nFamilies (smart economy) × Sigil ${sigils.join('/')}, ${SEEDS} games each`);
      const rows = await Promise.all(
        families.map(async (fam) => {
          const strat = build(genesOf(fam));
          const evals = await Promise.all(sigils.map((sg) => evaluate(pool, strat, sg, ECONS['smart'])));
          const flaw = (e: Eval) =>
            e.res.filter((x) => x.won && x.lives === ECONOMY.startLives).length / e.res.length;
          return `${fam.padEnd(9)} ${evals.map((e, i) => `S${sigils[i]}: ${(e.winRate * 100).toFixed(0).padStart(3)}% ${e.lives.toFixed(1).padStart(4)}♥ fl${(flaw(e) * 100).toFixed(0).padStart(3)}%`).join(' | ')}   ${strat.name}`;
        }),
      );
      for (const r of rows) console.log(r);
    }
    if (process.argv.includes('--classes')) {
      // Players: the smart champions, and random average and poor ones.
      const n = Number(arg('--sample', '16'));
      const r = mulberry(99);
      const groups: { name: string; strats: Strategy[]; econ: Econ }[] = [
        { name: 'smart (champions)', strats: families.map((f) => build(genesOf(f))), econ: ECONS['smart'] },
        {
          name: 'average',
          strats: Array.from({ length: n }, () => build(averageGenes(r))),
          econ: ECONS['average'],
        },
        { name: 'poor', strats: Array.from({ length: n }, () => build(poorGenes(r))), econ: ECONS['poor'] },
      ];
      console.log(`\nPlayer classes × Sigil ${sigils.join('/')} (${SEEDS} games per strategy)`);
      for (const gr of groups) {
        const cells = await Promise.all(
          sigils.map(async (sg) => {
            const ev = await Promise.all(gr.strats.map((st) => evaluate(pool, st, sg, gr.econ)));
            const all = ev.flatMap((e) => e.res);
            const won = all.filter((x) => x.won).length / all.length;
            const lives = all.reduce((a, x) => a + x.lives, 0) / all.length;
            const wave = all.reduce((a, x) => a + (x.won ? 12 : x.wave), 0) / all.length;
            // Where the lives went: the share of all lives lost in waves 1–4, 5–8, 9–12.
            const lost = [0, 0, 0];
            for (const x of all) x.lostBy.forEach((n, w) => (lost[Math.min(2, Math.floor(w / 4))]! += n));
            const tot = lost.reduce((a, b) => a + b, 0) || 1;
            const flaw = all.filter((x) => x.won && x.lives === ECONOMY.startLives).length / all.length;
            const wins = all.filter((x) => x.won);
            const livesWon = wins.reduce((a, x) => a + x.lives, 0) / Math.max(1, wins.length);
            // What the lives went to: over the wall (fliers), under it (diggers), through a broken gate.
            const by = { over: 0, under: 0, gate: 0 };
            for (const x of all)
              for (const [k, n] of Object.entries(x.leaks)) by[k.split(':')[1] as keyof typeof by] += n;
            const byT = by.over + by.under + by.gate || 1;
            return `S${sg}: won ${(won * 100).toFixed(0).padStart(3)}% fl${(flaw * 100).toFixed(0).padStart(3)}% ${lives.toFixed(1).padStart(4)}♥ (wins ${livesWon.toFixed(1)}♥) w${wave.toFixed(1)} lost@${lost.map((n) => ((n / tot) * 100).toFixed(0)).join('/')}% via ${((by.over / byT) * 100).toFixed(0)}/${((by.under / byT) * 100).toFixed(0)}/${((by.gate / byT) * 100).toFixed(0)}%`;
          }),
        );
        console.log(`${gr.name.padEnd(18)} ${cells.join(' | ')}`);
      }
    }
    if (process.argv.includes('--probe')) {
      // Instant defences (no economy): N towers at the gate, a base set of gems on each, then one option
      // on every tower. Toughness: the most enemy health (×) it still beats half the time.
      const N = Number(arg('--towers', '10'));
      const base = arg('--base', '').split(',').filter(Boolean) as GemId[];
      const style = arg('--style', 'gate');
      const lvBase = Number(arg('--baselv', '1'));
      const sig = Number(arg('--sigil', '0'));
      const only = arg('--only', '');
      const order = spotOrder(style);
      const gemActs = (t: number, g: GemId, lv: number): Act[] => [
        ['G', t, g],
        ...Array.from({ length: lv - 1 }, () => ['U', t, g] as Act),
      ];
      const mk = (extra: (t: number) => Act[], n = N): Strategy => {
        const acts: Act[] = [];
        for (let t = 0; t < n; t++) {
          acts.push(['T']);
          for (const g of base) acts.push(...gemActs(t, g, lvBase));
          acts.push(...extra(t));
        }
        return {
          name: 'probe',
          family: 'probe',
          cls: 'tank',
          spots: order.slice(0, n),
          acts,
          post: 'none',
          postFrom: 99,
          mend: false,
          light: true,
          chests: -1,
        };
      };
      const upto = Number(arg('--upto', '0'));
      const free: Econ = {
        ...ECONS['smart'],
        beta: 1e6,
        hold: 0,
        name: 'probe',
        ...(upto ? { upto } : {}),
      };
      const tough = async (st: Strategy): Promise<number> => {
        const wins = async (m: number) =>
          (await evaluate(pool, st, sig, { ...free, hpMul: m })).winRate >= 0.5;
        let lo = 0.1;
        let hi = 0.5;
        while (await wins(hi)) {
          lo = hi;
          hi *= 2;
          if (hi > 64) return hi;
        }
        if (lo === 0.1 && !(await wins(lo))) return 0;
        for (let i = 0; i < 5; i++) {
          const mid = Math.sqrt(lo * hi);
          if (await wins(mid)) lo = mid;
          else hi = mid;
        }
        return lo;
      };
      const opts: { name: string; extra: (t: number) => Act[]; cost: number; n?: number }[] = [
        { name: 'base', extra: () => [], cost: 0 },
      ];
      const baseCost = lseCost(PLANS.tower.parts, OVERHEAD.tower);
      for (const k of [2, 5])
        opts.push({ name: `+${k} towers`, extra: () => [], cost: (k * baseCost) / N, n: N + k });
      for (const g of ALL_GEMS) {
        if (base.some((b) => gemBlocker([b], g))) continue;
        for (const lv of [1, 2, 3]) {
          let c = 0;
          for (let l = 1; l <= lv; l++) c += lseCost(GEM_PARTS(g, l), l === 1 ? OVERHEAD.gem : OVERHEAD.up);
          opts.push({ name: `${g}${lv}`, extra: (t) => gemActs(t, g, lv), cost: c });
        }
      }
      opts.push({
        name: 'turret',
        extra: (t) => [['P', t]],
        cost: lseCost(PLANS.turret.parts, OVERHEAD.top),
      });
      opts.push({
        name: 'gallery',
        extra: (t) => [
          ['P', t],
          ['P', t],
        ],
        cost: lseCost(PLANS.turret.parts, OVERHEAD.top) + lseCost(PLANS.gallery.parts, OVERHEAD.top),
      });
      for (const d of DEVICES)
        opts.push({ name: d, extra: (t) => [['D', t, d]], cost: lseCost(PLANS[d].parts, OVERHEAD.dev) });
      // --sets "storm,fury,twin,far;ember,swift,twin,far": whole towers compared (every tower gets the set, rough or at --setlv).
      const sets = arg('--sets', '');
      if (sets) {
        opts.length = 1;
        const lv = Number(arg('--setlv', '1'));
        for (const set of sets.split(';')) {
          const gems = set.split(',').filter(Boolean) as GemId[];
          let c = 0;
          for (const g of gems)
            for (let l = 1; l <= lv; l++) c += lseCost(GEM_PARTS(g, l), l === 1 ? OVERHEAD.gem : OVERHEAD.up);
          opts.push({ name: set, extra: (t) => gems.flatMap((g) => gemActs(t, g, lv)), cost: c });
        }
      }
      const list = only
        ? opts.filter((o) => o.name === 'base' || only.split(',').some((x) => o.name.startsWith(x)))
        : opts;
      const res = await Promise.all(
        list.map(async (o) => {
          const st = mk(o.extra, o.n ?? N);
          const T = await tough(st);
          const over = await evaluate(pool, st, sig, { ...free, hpMul: Math.max(0.12, T) * 1.15 });
          const falls = over.res.filter((r) => !r.won).map((r) => r.wave);
          return { o, T, falls };
        }),
      );
      const first = res[0];
      if (!first) throw new Error('Balance probe needs at least the base option');
      const T0 = first.T;
      console.log(
        `\nToughness: ${N} towers (${style}) with [${base.join(', ')}] lv${lvBase}, sigil ${sig} — the most health (×) they still beat`,
      );
      res.sort((a, b) => b.T - a.T);
      for (const { o, T, falls } of res) {
        const per = o.cost > 0 ? ((T / T0 - 1) * 100) / o.cost : 0;
        console.log(
          `${o.name.padEnd(sets ? 28 : 12)} ×${T.toFixed(2).padStart(5)}  (${((T / T0 - 1) * 100).toFixed(0).padStart(4)}%)  cost ${o.cost.toFixed(0).padStart(4)} s/tower  → ${per.toFixed(2)} %/s   falls in w${falls.join(',w') || '-'}`,
        );
      }
    }
    if (process.argv.includes('--explain')) {
      // What each family's champion spends its economy on (labour-seconds, gold at KAPPA), one game.
      const sig = Number(arg('--sigil', '0'));
      const rows = await Promise.all(
        families.map(async (fam) => {
          const st = build(genesOf(fam));
          const r = await pool.run(st, SEED0, sig, ECONS['smart']);
          const total = Object.values(r.buys).reduce((a, [, v]) => a + v, 0);
          const top = Object.entries(r.buys)
            .sort((a, b) => b[1][1] - a[1][1])
            .slice(0, 9)
            .map(([k, [n, v]]) => `${k}×${n} ${((v / total) * 100).toFixed(0)}%`)
            .join(', ');
          return `${fam.padEnd(9)} ${r.won ? `won ${r.lives}♥` : `✗w${r.wave}`} ${r.towers}t ${r.gems}g lv${r.gemLv} | ${top}`;
        }),
      );
      for (const r of rows) console.log(r);
    }
    if (process.argv.includes('--beta')) {
      console.log("\nLeast economy to win half the games (β: 1 = a smart player's whole income), sigil 0");
      const rows = await Promise.all(
        families.map(async (fam) => {
          const g = genesOf(fam);
          const b = await betaMin(pool, build(g), Number(arg('--sigil', '0')), ECONS['smart']);
          return { fam, b, name: build(g).name };
        }),
      );
      rows.sort((a, b) => a.b - b.b);
      for (const r of rows)
        console.log(`${r.fam.padEnd(9)} β ${r.b === Infinity ? '  ∞ ' : r.b.toFixed(2)}   ${r.name}`);
    }
  } finally {
    pool.close();
  }
  console.log(`\n${((performance.now() - t0) / 1000).toFixed(0)} s`);
}

// Run as a script (not when imported, not as a worker).
if (
  !process.argv.includes('--worker') &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1]
)
  void main();
