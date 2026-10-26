import { revealInitialArea } from './initial-visibility.ts';
import { simulationDigest } from './simulation-digest.ts';
export type { Poi } from './simulation-types.ts';
export type { EntMap } from './simulation-types.ts';
export type { Ent } from './simulation-types.ts';
export type { ExtraState } from './simulation-types.ts';
import type { Poi, EntMap, Ent, ExtraState } from './simulation-types.ts';
import { applyTowerworkCommand, ensureTowerwork, updateTowerwork } from './towerwork.ts';
import { applyBlastingCommand } from './blasting.ts';
import { TUNNEL_POCKETS } from './mine-routes.ts';
import { betweenWaves, dismount, horseOf, REPAIR_BREAK } from './maintenance.ts';
/**
 * Deterministic game simulation. Fixed step (DT), commands in → events out. No three.js.
 * Systems live in ./systems; this file owns state, the entity registry, waves and fog.
 */
import { applyEarthCommand, earthFloor, freshEarth } from './excavation.ts';
import { Emitter } from '../core/emitter.ts';
import { RNG } from '../core/rng.ts';
import { dist } from '../core/math.ts';
import {
  ABILITY_ORDER,
  OVER_WALL,
  BAG_STACK,
  CLASSES,
  DAY,
  ECONOMY,
  ENEMIES,
  HERO,
  NODES,
  SIGIL,
  START_PLANS,
  STORES,
  timeOfDay,
  type AbilityId,
  type Discipline,
  type HeroClass,
  type ItemId,
  type Loot,
  type Parts,
  type PlanId,
  type StoreId,
} from './content.ts';
import { rollItem, rollRarity, type ItemInstance, type Rarity } from './loot.ts';
import {
  GATE,
  WALL,
  buildWorld,
  cellOf,
  cellCenter,
  onWall,
  outsideWalls,
  GRID_H,
  GRID_W,
  MAP,
  type CampDef,
  type World,
} from './map.ts';
import { MINE_AT, lairDef, newMine, type Mine } from './mines.ts';
import { addMinePlaces, applyMiningCommand, updateBombs, updateMine } from './systems/mining.ts';
import { applyRoadCommand } from './systems/road.ts';
import { addSpaceNodes, applySpaceCommand, updateSpace } from './systems/space.ts';
import { updateDrones } from './systems/drone.ts';
import { updatePower } from './systems/power.ts';
import { buildScenery, type Prop } from './scenery.ts';
import { buildWalkGrid, Colliders, Pathfinder, wallGrid, wallStep } from './grid.ts';
import { GATE_HP, applyGateCommand } from './systems/wall.ts';
import { WAVES } from './waves.ts';
import type {
  Building,
  Camp,
  Chest,
  Command,
  Corpse,
  Drop,
  Enemy,
  Fire,
  GameState,
  Hero,
  Id,
  Proj,
  ResourceNode,
  Site,
  SimEvents,
  Unit,
} from './types.ts';
import { applyHeroCommand, updateHeroes } from './systems/heroes.ts';
import {
  applyCraftCommand,
  updateSites,
  updateStations,
  updateDrops,
  updateNodes,
  forceCompleteSite,
} from './systems/craft.ts';
import { updateAuras, updateTowers, updateProjectiles, updateFires, updateUnits } from './systems/combat.ts';
import { updateEnemies, spawnFromCrypt, populateCamp, spawnCampEnemy } from './systems/enemies.ts';
import { updateWatch } from './systems/watch.ts';

import { benchOf } from './systems/rooms.ts';
import { DT } from './config.ts';
export { TPS, DT } from './config.ts';

export class Sim {
  readonly world: World;
  readonly props: Prop[];
  readonly state: GameState & ExtraState;
  readonly events = new Emitter<SimEvents>();
  readonly rng: RNG;
  /** Coarse static walk grid (paths, placement): every prop blocks its cells. */
  readonly walkStatic: Uint8Array;
  /** Fine walk grid for the hero: trees, rocks and clutter are left to `colliders`. */
  readonly walkFine: Uint8Array;
  readonly colliders = new Colliders();
  readonly pf: Pathfinder;
  /** Cells of the gate's doorway (closed to walkers while the gate is shut). */
  readonly gateCells: Uint8Array;
  /** After restoring a game from an older vale: each hero's old id → its id now (see save.ts). */
  readonly heroRemap = new Map<Id, Id>();
  private reg = new Map<Id, Ent>();

  constructor(opts: { seed?: number; players?: number; sigil?: number } = {}) {
    const seed = opts.seed ?? MAP.seed;
    const players = opts.players ?? 1;
    this.rng = new RNG(seed);
    this.world = { ...buildWorld() };
    this.world.excavatedFloor = (x, z) => earthFloor(this, x, z);
    this.props = buildScenery(this.world);
    this.walkStatic = buildWalkGrid(this.world, this.props);
    this.walkFine = buildWalkGrid(this.world, this.props, true);
    const occupied = new Int32Array(GRID_W * GRID_H);
    // The wall: its walk and stairs are walked (at their height), the rest of it is solid. Heroes
    // never go out through the gate: the field beyond is the towers' and the dead's (OVER_WALL).
    const wall = wallGrid(this.world, this.walkStatic, this.walkFine);
    this.gateCells = wall.gate;
    const beyond = new Uint8Array(GRID_W * GRID_H);
    for (let k = 0; k < beyond.length; k++) {
      const c = cellCenter(k % GRID_W, Math.floor(k / GRID_W));
      beyond[k] = outsideWalls(c.x, c.z) ? 1 : 0;
    }
    this.pf = new Pathfinder(
      (k) =>
        this.walkStatic[k] === 1 &&
        occupied[k] === 0 &&
        (!wall.gate[k] || betweenWaves(this)) &&
        (!beyond[k] || betweenWaves(this)),
      (a, b) => wallStep(wall.level, a, b),
    );
    this.state = {
      earth: freshEarth(),
      tick: 0,
      time: 0,
      phase: 'build',
      gold: ECONOMY.startGold,
      lives: ECONOMY.startLives,
      maxLives: ECONOMY.startLives,
      storage: {},
      storageGear: [],
      sigil: opts.sigil ?? 0,
      camps: [],
      stock: {},
      discovered: ['market'],
      heroes: [],
      units: [],
      nodes: [],
      drops: [],
      chests: [],
      sites: [],
      buildings: [],
      enemies: [],
      projs: [],
      fires: [],
      corpses: [],
      spawns: [],
      wave: 0,
      nextWaveAt: -1,
      waveCleared: WAVES.map(() => false),
      lanesOpen: this.world.lanes.map((l) => l.def.opensAtWave <= 1),
      intel: 0,
      firstTowerAt: -1,
      explored: new Uint8Array(GRID_W * GRID_H),
      occupied,
      nextId: 1,
      stats: { kills: 0, leaks: 0, gathered: 0, crafted: 0, built: 0, perfects: 0 },
      // The one mine, under the home mine head (game/mines.ts).
      mines: [newMine(MAP.caves[0])],
      bombs: [],
      library: [],
      pois: [],
      // The gate stands shut from the start: the dead must batter it down to get in.
      gate: { hp: GATE_HP, maxHp: GATE_HP, shut: true, repairBuf: 0 },
    };
    this.props.forEach((p, i) => {
      if (!p.node) return;
      const def = NODES[p.node];
      const amount = Math.max(1, Math.round(def.amount * (p.nodeAmount ?? 1)));
      const radius = p.trunk ?? (p.block > 0 ? p.block : 0.6);
      this.add('node', {
        id: this.newId(),
        kind: p.node,
        x: p.x,
        z: p.z,
        radius,
        amount,
        max: amount,
        regrowT: 0,
        prop: i,
      });
    });
    // The deposits in Space.
    addSpaceNodes(this);
    const nodeOf = new Map(this.state.nodes.map((n) => [n.prop, n.id]));
    this.props.forEach((p, i) => {
      if (p.trunk) this.colliders.add(p.x, p.z, p.trunk, nodeOf.get(i) ?? 0);
    });
    for (const c of MAP.chests) {
      this.add('chest', {
        id: this.newId(),
        name: c.name,
        x: c.x,
        z: c.z,
        opened: false,
        loot: c.loot,
        golden: !!c.golden,
      });
    }
    // The keep's storehouse stands by the market, a few steps from the gate; the gate itself is worked from inside it.
    this.add('poi', { id: this.newId(), kind: 'keep', x: MAP.storehouse.x, z: MAP.storehouse.z, r: 3.2 });
    this.add('poi', { id: this.newId(), kind: 'gate', x: GATE.x - WALL.half - 1.4, z: 0, r: 2.4 });
    // One ready-to-enter workshop, with its KayKit dungeon room. No watermill or extra buildings.
    {
      const c = cellOf(MAP.workshops.x, MAP.workshops.z);
      const site: Site = {
        id: this.newId(),
        plan: 'anvil',
        ...cellCenter(c.cx, c.cz),
        cx: c.cx,
        cz: c.cz,
        rot: 0,
        need: {},
        have: {},
        step: 0,
        work: 0,
        building: 0,
        placedBy: 0,
        sockets: [],
      };
      this.add('site', site);
      forceCompleteSite(this, site);
      this.compactNow();
      this.state.stats.built = 0;
    }
    // The mine head and the lift below it, and the mine's faces.
    addMinePlaces(this);
    this.ensureShop();
    for (let p = 0; p < players; p++) this.addHero(p);
    MAP.camps.forEach((c, i) =>
      this.addCamp({ id: this.newId(), def: i, x: c.x, z: c.z, alive: 0, respawnT: 0 }),
    );
    // Creatures lair in the mine's old workings and guard its Grade II chambers.
    // The new mine starts as only a lift and solid, freely excavatable rock.
    this.ensureTunnelCamps();
    ensureTowerwork(this);
    this.revealInitial();
  }

  ensureTunnelCamps(): void {
    const m = this.state.mines[0];
    if (m) {
      m.lift.x = MINE_AT.x - 3.1;
      m.lift.z = MINE_AT.z;
    }
    for (let i = 0; i < TUNNEL_POCKETS.length; i++) {
      if (this.state.camps.some((c) => c.tunnel === i)) continue;
      // i traverses the dense authored pocket array.
      const p = TUNNEL_POCKETS[i]!,
        camp = { id: this.newId(), def: -1, tunnel: i, x: p.x, z: p.z, alive: 1, respawnT: 1e9 };
      this.add('camp', camp);
      spawnCampEnemy(this, p.kind, camp.id, p.x, p.z);
    }
    const lift = this.state.pois.find((p) => p.kind === 'lift');
    if (lift && m) {
      lift.x = m.lift.x;
      lift.z = m.lift.z;
    }
  }

  /** Add the enterable shop to older saves without resetting their mine or workshop progress. */
  ensureShop(): void {
    let shop = this.state.buildings.find((b) => b.kind === 'shop');
    if (!shop) {
      const built = this.state.stats.built;
      const c = cellOf(MAP.stores.market.x, MAP.stores.market.z);
      const site: Site = {
        id: this.newId(),
        plan: 'shop',
        ...cellCenter(c.cx, c.cz),
        cx: c.cx,
        cz: c.cz,
        rot: Math.PI,
        need: {},
        have: {},
        step: 0,
        work: 0,
        building: 0,
        placedBy: 0,
        sockets: [],
      };
      this.add('site', site);
      forceCompleteSite(this, site);
      this.compactNow();
      this.state.stats.built = built;
      shop = this.state.buildings.find((b) => b.kind === 'shop')!;
    }
    const counter = benchOf(shop)!;
    const poi = this.state.pois.find((p) => p.store === 'market');
    if (poi) Object.assign(poi, counter, { r: 0.5 });
    else this.add('poi', { id: this.newId(), kind: 'store', store: 'market', ...counter, r: 0.5 });
  }

  // ---- Camps ------------------------------------------------------------------------------------

  /** What a camp is: one of the vale's (MAP.camps), or a lair in the mine (further out: harder). */
  campDef(camp: Camp): CampDef {
    if (camp.tunnel !== undefined) {
      const p = TUNNEL_POCKETS[camp.tunnel];
      if (!p) throw new Error(`Unknown tunnel pocket ${camp.tunnel}`);
      return {
        name: p.name,
        x: camp.x,
        z: camp.z,
        leash: 3.5,
        respawn: 1e9,
        members: [{ kind: p.kind, count: 1 }],
      };
    }
    if (!camp.lair) {
      const def = MAP.camps[camp.def];
      if (!def) throw new Error(`Unknown surface camp ${camp.def}`);
      return def;
    }
    const m = this.state.mines[camp.lair[0]];
    const l = lairDef(camp.lair[1]);
    if (!l) return { name: m?.name ?? 'the mine', x: camp.x, z: camp.z, leash: 6, respawn: 300, members: [] };
    return {
      name: `${m?.name ?? 'the mine'} — ${l.name}`,
      x: l.x,
      z: l.z,
      leash: l.leash,
      respawn: l.respawn,
      members: l.members,
    };
  }

  private addCamp(camp: Camp): void {
    this.add('camp', camp);
    populateCamp(this, camp.id);
  }

  /** A lair in the mine (an old working's den, a Grade II chamber's guardians), and the creatures in it. */
  addLair(m: Mine, i: number): void {
    const l = lairDef(i)!;
    this.addCamp({ id: this.newId(), def: -1, lair: [m.id, i], x: l.x, z: l.z, alive: 0, respawnT: 0 });
  }

  // ---- Registry ---------------------------------------------------------------------------------

  newId(): Id {
    return this.state.nextId++;
  }

  add<T extends keyof EntMap>(type: T, e: EntMap[T]): void {
    this.reg.set(e.id, { type, e } as Ent);
    const s = this.state;
    switch (type) {
      case 'hero':
        s.heroes.push(e as Hero);
        break;
      case 'unit':
        s.units.push(e as Unit);
        break;
      case 'node':
        s.nodes.push(e as ResourceNode);
        break;
      case 'drop':
        s.drops.push(e as Drop);
        break;
      case 'chest':
        s.chests.push(e as Chest);
        break;
      case 'site':
        s.sites.push(e as Site);
        break;
      case 'building':
        s.buildings.push(e as Building);
        break;
      case 'enemy':
        s.enemies.push(e as Enemy);
        break;
      case 'poi':
        s.pois.push(e as Poi);
        break;
      case 'proj':
        s.projs.push(e as Proj);
        break;
      case 'fire':
        s.fires.push(e as Fire);
        break;
      case 'corpse':
        s.corpses.push(e as Corpse);
        break;
      case 'camp':
        s.camps.push(e as Camp);
        break;
    }
  }

  get(id: Id): Ent | undefined {
    return this.reg.get(id);
  }

  getAs<T extends keyof EntMap>(id: Id, type: T): EntMap[T] | undefined {
    const r = this.reg.get(id);
    return r && r.type === type ? (r.e as EntMap[T]) : undefined;
  }

  /** Marks an entity removed; arrays are compacted at the end of the tick. */
  remove(id: Id): void {
    this.reg.delete(id);
  }

  alive(id: Id): boolean {
    return this.reg.has(id);
  }

  /** Rebuilds the id → entity registry from the state arrays (after restoring a save). */
  rebuildRegistry(): void {
    this.reg.clear();
    const s = this.state;
    const all: [keyof EntMap, { id: Id }[]][] = [
      ['hero', s.heroes],
      ['unit', s.units],
      ['node', s.nodes],
      ['drop', s.drops],
      ['chest', s.chests],
      ['site', s.sites],
      ['building', s.buildings],
      ['enemy', s.enemies],
      ['poi', s.pois],
      ['proj', s.projs],
      ['fire', s.fires],
      ['corpse', s.corpses],
      ['camp', s.camps],
    ];
    for (const [type, list] of all) for (const e of list) this.reg.set(e.id, { type, e } as Ent);
  }

  /** Drops removed entities from the state arrays (normally done at the end of each tick). */
  compactNow(): void {
    this.compact();
  }

  private compact(): void {
    const s = this.state;
    const keep = <T extends { id: Id }>(arr: T[]) => {
      let j = 0;
      for (let i = 0; i < arr.length; i++) if (this.reg.has(arr[i]!.id)) arr[j++] = arr[i]!;
      arr.length = j;
    };
    keep(s.units);
    keep(s.drops);
    keep(s.sites);
    keep(s.buildings);
    keep(s.enemies);
    keep(s.projs);
    keep(s.fires);
    keep(s.corpses);
  }

  emit<K extends keyof SimEvents>(k: K, e: SimEvents[K]): void {
    this.events.emit(k, e);
  }

  // ---- Heroes -----------------------------------------------------------------------------------

  addHero(player: number, name: string = HERO.name, cls: HeroClass = 'tank'): Hero {
    const mastery: Record<Discipline, number> = { carpentry: 0, masonry: 0, smithing: 0, arcana: 0 };
    const h: Hero = {
      id: this.newId(),
      player,
      name,
      x: MAP.heroStart.x + player * 1.5,
      z: MAP.heroStart.z,
      px: MAP.heroStart.x + player * 1.5,
      pz: MAP.heroStart.z,
      facing: Math.PI / 2,
      hp: CLASSES[cls].hp,
      maxHp: CLASSES[cls].hp,
      cls,
      wallT: 0,
      weaponTier: 0,
      level: 1,
      xp: 0,
      dead: false,
      respawnT: 0,
      bag: {},
      gear: [],
      known: [...START_PLANS],
      scrolls: [],
      mastery,
      task: { k: 'idle' },
      path: [],
      pathIdx: 0,
      pathGoal: null,
      attackCd: 0,
      swingCd: 0,
      cds: Object.fromEntries(ABILITY_ORDER.map((a) => [a, 0])) as Record<AbilityId, number>,
      anim: 'idle',
      animT: 0,
      blocking: 0,
      beatCd: 0,
      steer: { mx: 0, mz: 0 },
      moveT: 0,
      tools: [],
      look: Math.PI / 2,
      gait: 'idle',
      ride: null,
      post: 0,
    };
    this.add('hero', h);
    return h;
  }

  /** Things carried (every unit of every stack, plus enchanted parts). */
  /** Does a body of radius r at (x, z) touch a trunk, rock or prop? (Felled trees don't count.) */
  collides(x: number, z: number, r: number): boolean {
    return (
      this.state.nodes.some(
        (n) => n.prop < 0 && n.amount > 0 && Math.hypot(n.x - x, n.z - z) < n.radius + r,
      ) ||
      this.colliders.hit(x, z, r, (i) => {
        const node = this.colliders.nodes[i];
        if (!node) return false;
        const n = this.getAs(node, 'node');
        return !n || n.amount <= 0;
      }) >= 0
    );
  }

  bagCount(h: Hero): number {
    let n = h.gear.length;
    for (const k in h.bag) n += h.bag[k as ItemId] ?? 0;
    return n;
  }

  /** Slots in use: one per stack of up to BAG_STACK, one per enchanted part. */
  bagSlots(h: Hero): number {
    let n = h.gear.length;
    for (const k in h.bag) n += Math.ceil((h.bag[k as ItemId] ?? 0) / BAG_STACK);
    return n;
  }

  /** Empty slots (what an enchanted part needs). */
  bagFree(h: Hero): number {
    return Math.max(0, HERO.bag - this.bagSlots(h));
  }

  /** How many more of `item` fit: room on its last stack plus whole free slots. */
  bagSpace(h: Hero, item: ItemId): number {
    const have = h.bag[item] ?? 0;
    const onStack = have % BAG_STACK ? BAG_STACK - (have % BAG_STACK) : 0;
    return onStack + this.bagFree(h) * BAG_STACK;
  }

  addToBag(h: Hero, item: ItemId, n: number): number {
    const k = Math.min(n, this.bagSpace(h, item));
    if (k > 0) h.bag[item] = (h.bag[item] ?? 0) + k;
    return k;
  }

  takeFromBag(h: Hero, item: ItemId, n: number): number {
    const k = Math.min(n, h.bag[item] ?? 0);
    if (k > 0) {
      h.bag[item] = (h.bag[item] ?? 0) - k;
      if (!h.bag[item]) delete h.bag[item];
    }
    return k;
  }

  // ---- Items in the world -----------------------------------------------------------------------

  spawnDrop(
    item: ItemId,
    x: number,
    z: number,
    fromX = x,
    fromZ = z,
    owner: Id = 0,
    inst: ItemInstance | null = null,
  ): Drop {
    const a = this.rng.range(0, Math.PI * 2);
    const r = this.rng.range(0.4, 1.1);
    const d: Drop = {
      id: this.newId(),
      item,
      amount: 1,
      inst,
      x: x + Math.cos(a) * r,
      z: z + Math.sin(a) * r,
      t: 0,
      owner,
    };
    this.add('drop', d);
    this.emit('dropSpawned', { id: d.id, item, amount: 1, inst, x: d.x, z: d.z, fromX, fromZ });
    return d;
  }

  spawnGold(amount: number, x: number, z: number): void {
    // Big sums split into a few piles so pickups feel generous.
    const piles = Math.min(5, Math.max(1, Math.round(amount / 15)));
    let left = Math.max(1, Math.round(amount));
    for (let i = 0; i < piles; i++) {
      const n = i === piles - 1 ? left : Math.max(1, Math.round(amount / piles));
      left -= n;
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(0.2, 0.9);
      const d: Drop = {
        id: this.newId(),
        item: 'gold',
        amount: n,
        inst: null,
        x: x + Math.cos(a) * r,
        z: z + Math.sin(a) * r,
        t: 0,
        owner: 0,
      };
      this.add('drop', d);
      this.emit('dropSpawned', {
        id: d.id,
        item: 'gold',
        amount: n,
        inst: null,
        x: d.x,
        z: d.z,
        fromX: x,
        fromZ: z,
      });
      if (left <= 0) break;
    }
  }

  /** Item level for loot right now (rises with waves and sigil). */
  ilvl(): number {
    return 1 + this.state.wave + this.state.sigil * SIGIL.ilvlPerLevel;
  }

  rollGear(rarity?: Rarity, base?: ItemId): ItemInstance {
    return rollItem(
      this.rng,
      this.newId(),
      this.ilvl(),
      rarity ?? rollRarity(this.rng, this.state.sigil * 0.2),
      base,
    );
  }

  dropGear(x: number, z: number, rarity?: Rarity): void {
    const inst = this.rollGear(rarity);
    this.spawnDrop(inst.base, x, z, x, z, 0, inst);
  }

  grantLoot(loot: Loot, x: number, z: number, hero: Id): void {
    if (loot.gold) this.spawnGold(loot.gold, x, z);
    for (const p of loot.scrolls ?? []) {
      if (!this.state.library.includes(p)) this.state.library.push(p);
      this.emit('scrollFound', { hero, plan: p });
    }
    const parts = loot.parts ?? {};
    for (const k in parts)
      for (let i = 0; i < (parts[k as ItemId] ?? 0); i++) this.spawnDrop(k as ItemId, x, z, x, z, hero);
  }

  addGold(amount: number, x?: number, z?: number, reason = ''): void {
    this.state.gold += amount;
    this.emit('gold', {
      amount,
      ...(x !== undefined ? { x } : {}),
      ...(z !== undefined ? { z } : {}),
      reason,
    });
  }

  // ---- Commands ---------------------------------------------------------------------------------

  apply(cmd: Command): void {
    if (this.state.phase === 'won' || this.state.phase === 'lost') return;
    if (cmd.t === 'callWave') {
      this.callWave();
      return;
    }
    if (cmd.t === 'devMode') {
      this.state.dev = cmd.on;
      // Unlimited health from here on: everyone starts it full.
      if (cmd.on) for (const h of this.state.heroes) if (!h.dead) h.hp = h.maxHp;
      // Out of dev mode the clock runs again, from wherever it was held.
      if (!cmd.on && this.state.dayHold != null) this.setTime(this.state.dayHold, false);
      this.emit('devMode', { on: cmd.on });
      return;
    }
    if (cmd.t === 'setTime') {
      if (this.state.dev && Number.isFinite(cmd.tod)) this.setTime(cmd.tod, !!cmd.hold);
      return;
    }
    if (cmd.t === 'devWaves') {
      if (this.state.dev) this.state.wavesOff = !cmd.on;
      return;
    }
    if ('hero' in cmd && !['pose', 'steer', 'mount', 'stop'].includes(cmd.t)) {
      const h = this.getAs(cmd.hero, 'hero');
      if (h) dismount(h);
    }
    if ('hero' in cmd && this.getAs(cmd.hero, 'hero')?.transit) return;
    if (applyGateCommand(this, cmd)) return;
    if (applyRoadCommand(this, cmd)) return;
    if (applySpaceCommand(this, cmd)) return;
    if (applyTowerworkCommand(this, cmd)) return;
    if (applyBlastingCommand(this, cmd)) return;
    if (applyEarthCommand(this, cmd)) return;
    if (applyMiningCommand(this, cmd)) return;
    if (applyHeroCommand(this, cmd)) return;
    applyCraftCommand(this, cmd);
  }

  /** Sets the clock to time of day `tod` (0–1), held there or running on from it. */
  private setTime(tod: number, hold: boolean): void {
    const s = this.state;
    const t = ((tod % 1) + 1) % 1;
    s.dayShift = ((((t - timeOfDay(s.time)) % 1) + 1) % 1) * DAY.length;
    s.dayHold = hold ? t : null;
  }

  /** Whether the vale can pay `cost` gold (in dev mode everything is free). */
  canPay(cost: number): boolean {
    return !!this.state.dev || this.state.gold >= cost;
  }

  /** Pays `cost` gold if it can (nothing in dev mode); false if there isn't enough. */
  pay(cost: number): boolean {
    if (!this.canPay(cost)) return false;
    if (!this.state.dev) this.state.gold -= cost;
    return true;
  }

  /** Whether a hero can use plan `plan` (learned it — or dev mode, where every plan is open). */
  knows(h: Hero, plan: PlanId): boolean {
    return !!this.state.dev || h.known.includes(plan);
  }

  // ---- Tick -------------------------------------------------------------------------------------

  step(): void {
    const s = this.state;
    if (s.phase === 'won' || s.phase === 'lost') return;
    s.tick++;
    s.time += DT;
    this.updateWaves();
    updateHeroes(this, DT);
    updateStations(this, DT);
    updateSites(this, DT);
    updateTowerwork(this, DT);
    updateUnits(this, DT);
    updateEnemies(this, DT);
    updateTowers(this, DT);
    updateAuras(this);
    updateProjectiles(this, DT);
    updateBombs(this, DT);
    updateMine(this);
    updateDrones(this, DT);
    updatePower(this);
    updateFires(this, DT);
    updateWatch(this, DT);
    updateSpace(this, DT);
    updateDrops(this, DT);
    updateNodes(this, DT);
    for (const c of s.corpses) {
      c.t -= DT;
      if (c.t <= 0) this.remove(c.id);
    }
    this.compact();
    this.checkWaves();
    this.revealHeroes();
  }

  // ---- Waves ------------------------------------------------------------------------------------

  private updateWaves(): void {
    const s = this.state;
    if (s.dev && s.wavesOff) {
      // Move deadlines with the clock, preserving the remaining delay when waves resume.
      if (s.nextWaveAt >= 0) s.nextWaveAt += DT;
      for (const spawn of s.spawns) spawn.at += DT;
      return;
    }
    if (s.wave > 0 && !betweenWaves(this)) s.nextWaveAt = -1;
    if (s.nextWaveAt >= 0 && s.time >= s.nextWaveAt && s.wave < WAVES.length) this.startWave(false);
    if (s.spawns.length) {
      let j = 0;
      for (const sp of s.spawns) {
        if (sp.at <= s.time) spawnFromCrypt(this, sp.kind, sp.crypt, sp.wave);
        else s.spawns[j++] = sp;
      }
      s.spawns.length = j;
    }
  }

  /** Called when the first tower is finished: the first wave comes soon after. */
  onTowerBuilt(): void {
    const s = this.state;
    if (s.firstTowerAt < 0) {
      s.firstTowerAt = s.time;
      if (s.wave === 0)
        s.nextWaveAt =
          s.nextWaveAt < 0
            ? s.time + ECONOMY.firstWaveAfterTower
            : Math.min(s.nextWaveAt, s.time + ECONOMY.firstWaveAfterTower);
    }
  }

  callWave(): void {
    const s = this.state;
    if (s.dev && s.wavesOff) return;
    if (s.nextWaveAt < 0 || s.wave >= WAVES.length || !betweenWaves(this)) return;
    const left = s.nextWaveAt - s.time;
    const bonus = s.wave === 0 ? 0 : Math.min(ECONOMY.maxEarlyBonus, Math.max(0, Math.ceil(left)));
    if (bonus > 0) this.addGold(bonus, undefined, undefined, 'early');
    this.startWave(true, bonus);
  }

  private startWave(early: boolean, bonus = 0): void {
    const s = this.state;
    const w = WAVES[s.wave];
    if (!w) throw new Error(`Unknown wave ${s.wave}`);
    const index = s.wave;
    // Close the repair sortie before spawning: everyone outside returns with their horse.
    for (const h of s.heroes)
      if (outsideWalls(h.x, h.z)) {
        dismount(h);
        h.x = h.px = MAP.heroStart.x;
        h.z = h.pz = MAP.heroStart.z;
        const horse = horseOf(h);
        horse.x = h.x - 1;
        horse.z = h.z;
        h.task = { k: 'idle' };
        h.path = [];
        h.pathGoal = null;
        h.moveT = 0;
        this.emit('denied', {
          hero: h.id,
          reason: 'The next attack begins — you and your horse return inside the gate',
        });
      }
    s.wave++;
    s.phase = 'waves';
    s.nextWaveAt = -1;
    const lanes = new Set<number>();
    this.world.lanes.forEach((l, i) => {
      if (!s.lanesOpen[i] && l.def.opensAtWave <= index + 1) {
        s.lanesOpen[i] = true;
        this.emit('laneOpened', { lane: i });
      }
    });
    for (const gr of w.groups) {
      lanes.add(gr.crypt);
      for (let i = 0; i < gr.count; i++)
        s.spawns.push({ at: s.time + gr.delay + i * gr.every, kind: gr.kind, crypt: gr.crypt, wave: index });
    }
    s.spawns.sort((a, b) => a.at - b.at);
    for (const id of s.discovered) this.refreshStock(id);

    this.emit('waveStarted', { wave: index + 1, crypts: [...lanes], early, bonus });
  }

  private checkWaves(): void {
    const s = this.state;
    if (s.dev && s.wavesOff) return;
    for (let w = 0; w < s.wave; w++) {
      if (s.waveCleared[w]) continue;
      if (s.spawns.some((sp) => sp.wave === w) || s.enemies.some((e) => e.wave === w)) continue;
      s.waveCleared[w] = true;
      if (
        w === s.wave - 1 &&
        s.wave < WAVES.length &&
        !s.spawns.length &&
        !s.enemies.some((e) => !e.camp && e.hp > 0)
      )
        s.nextWaveAt = s.time + Math.max(REPAIR_BREAK, WAVES[w]!.gap);
      const bonus = ECONOMY.waveBonusBase + ECONOMY.waveBonusPerWave * w;
      this.addGold(bonus, undefined, undefined, 'wave');
      const reward = WAVES[w]!.reward;
      // The wave's reward is left at the storehouse door, by the gate.
      const k = MAP.storehouse;
      this.grantLoot(
        {
          ...(reward.scrolls ? { scrolls: reward.scrolls } : {}),
          ...(reward.parts ? { parts: reward.parts } : {}),
        },
        k.x,
        k.z + 3.6,
        0,
      );
      if (reward.gold) this.addGold(reward.gold, undefined, undefined, 'wave');
      this.emit('waveCleared', {
        wave: w + 1,
        bonus: bonus + (reward.gold ?? 0),
        loot: reward,
        leaked: s.waveLeaks?.[w] ?? 0,
      });
    }
    // The last wave gone and the keep still standing (a leak that ends the game is a loss, even if it was the last of them).
    if (s.wave >= WAVES.length && s.waveCleared.every(Boolean) && s.phase !== 'won' && s.phase !== 'lost') {
      s.phase = 'won';
      this.emit('gameOver', { won: true });
    }
  }

  loseLives(n: number): void {
    const s = this.state;
    // Dev mode: the keep can't fall.
    if (s.dev) return;
    s.lives = Math.max(0, s.lives - n);
    this.emit('livesLost', { amount: n, lives: s.lives });
    if (s.lives <= 0 && s.phase !== 'lost') {
      s.phase = 'lost';
      this.emit('gameOver', { won: false });
    }
  }

  // ---- Fog of war -------------------------------------------------------------------------------

  /** Uncovers the cells within r of (x, z) — with `beyond`, only those past the wall (what the walk looks out over). */
  reveal(x: number, z: number, r: number, beyond = false): void {
    const { cx, cz } = cellOf(x, z);
    const R = Math.ceil(r);
    const ex = this.state.explored;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > r * r) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= GRID_W || nz >= GRID_H) continue;
        if (beyond && cellCenter(nx, nz).x < WALL.x) continue;
        ex[nz * GRID_W + nx] = 1;
      }
    }
  }

  private revealInitial(): void {
    revealInitialArea(this.world, this.state.discovered, (x, z, r) => this.reveal(x, z, r));
  }

  private lastReveal = new Map<Id, { x: number; z: number }>();

  private revealHeroes(): void {
    for (const h of this.state.heroes) {
      if (h.dead) continue;
      const last = this.lastReveal.get(h.id);
      if (last && dist(last.x, last.z, h.x, h.z) < 0.8) continue;
      this.lastReveal.set(h.id, { x: h.x, z: h.z });
      this.reveal(h.x, h.z, HERO.sight);
      // Up on the wall-walk: the field beyond, far out.
      if (onWall(h.x, h.z)) this.reveal(h.x, h.z, OVER_WALL.sight, true);
      this.checkDiscoveries();
    }
  }

  private checkDiscoveries(): void {
    const s = this.state;
    for (const pos of s.pois) {
      if (pos.kind !== 'store' || !pos.store) continue;
      const id = pos.store;
      if (s.discovered.includes(id)) continue;
      if (!pos || !this.isExplored(pos.x, pos.z)) continue;
      s.discovered.push(id);
      this.refreshStock(id);
      this.emit('storeDiscovered', { store: id, x: pos.x, z: pos.z });
    }
  }

  refreshStock(id: StoreId): void {
    const def = STORES[id];
    if (!def.enchanted) return;
    const list: ItemInstance[] = [];
    for (let i = 0; i < 4; i++)
      list.push(this.rollGear(i === 0 && this.rng.chance(0.5) ? 2 : 1, this.rng.pick(def.enchanted)));
    this.state.stock[id] = list;
    this.emit('stockRefreshed', { store: id });
  }

  isExplored(x: number, z: number): boolean {
    const { cx, cz } = cellOf(x, z);
    if (cx < 0 || cz < 0 || cx >= GRID_W || cz >= GRID_H) return false;
    return this.state.explored[cz * GRID_W + cx] === 1;
  }

  // ---- Queries ----------------------------------------------------------------------------------

  enemyAt(x: number, z: number, r: number, only?: (e: Enemy) => boolean): Enemy | null {
    let best: Enemy | null = null;
    let bd = r;
    for (const e of this.state.enemies) {
      if (e.spawnT > 0 || e.burrowed || (only && !only(e))) continue;
      const d = dist(x, z, e.x, e.z) - ENEMIES[e.kind].radius;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Simple state digest for determinism tests. */
  hash(): number {
    return simulationDigest(this.state);
  }
}

export type { Parts };
