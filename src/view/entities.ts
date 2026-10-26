// Reverse cleanup loops access only live indices and remove only their current slot.
/** Owns entity-view lifetimes and frame order. Individual models and event effects live in entity/. */
import * as THREE from 'three';
import { GATE, WALL, waterDepth } from '../game/map.ts';
import {
  type HeroClass,
  type StoreId,
  ENEMIES,
  STATIONS,
  isTower,
  type StationKind,
} from '../game/content.ts';
import { underground } from '../game/systems/mining.ts';
import type { Hero, Id } from '../game/types.ts';
import { siteComplete, stationSteps } from '../game/systems/craft.ts';
import { Blobs } from './blobs.ts';
import { PERSON, SPECS, type CharacterSpec } from './characters.ts';
import { Bars, BAR } from './overlays.ts';
import { itemMesh } from './itemmodels.ts';
import { indoors } from '../game/interiors.ts';
import { inSpace } from '../game/space.ts';
import { gh, type ViewCtx } from './entity/context.ts';
import { HeroView } from './entity/hero.ts';
import { DroneView } from './entity/drone.ts';
import { UnitView } from './entity/unit.ts';
import { EnemyView } from './entity/enemy.ts';
import { BuildingView } from './entity/building.ts';
import { SiteView } from './entity/site.ts';
import { DropView } from './entity/drop.ts';
import { ChestView } from './entity/chest.ts';
import { ProjView } from './entity/projectile.ts';
import { TownActors } from './entity/town-actors.ts';
import { PowerLines } from './entity/power-lines.ts';
import type { EntityEventState } from './entity/event-state.ts';
import { hookDroneEvents } from './entity/drone-events.ts';
import { hookEnemyEvents } from './entity/enemy-events.ts';
import { hookCombatEvents } from './entity/combat-events.ts';
import { hookHeroEvents } from './entity/hero-events.ts';
import { hookMiningEvents } from './entity/mining-events.ts';
import { hookCraftingEvents } from './entity/crafting-events.ts';
import { hookLootEvents } from './entity/loot-events.ts';
import { Sight } from './entity/context.ts';

export class EntityViews {
  private ctx: ViewCtx;

  /** World boxes of finished buildings (refreshed when they change), for the camera. */
  *buildingBoxes(): Iterable<THREE.Box3> {
    for (const v of this.buildings.values()) yield v.box();
  }

  readonly bars = new Bars();
  /** The player's own hero: its health lives in the player frame, not over its head. */
  localHero = 0;
  readonly heroes = new Map<Id, HeroView>();
  /** Drones in the air, by their pilot. */
  readonly drones = new Map<Id, DroneView>();
  private tmpStand = new THREE.Vector3();
  /** Where a hero riding a mine wagon stands in it (set by the game: the mine's view knows the wagons). */
  rideSpot: (h: Hero, alpha: number, out: THREE.Vector3) => THREE.Vector3 | null = () => null;
  readonly units = new Map<Id, UnitView>();
  readonly enemies = new Map<Id, EnemyView>();
  private readonly dying: EnemyView[] = [];
  private readonly byCorpse = new Map<Id, EnemyView>();
  private readonly raisedFrom = new Set<Id>();
  readonly buildings = new Map<Id, BuildingView>();
  readonly sites = new Map<Id, SiteView>();
  readonly drops = new Map<Id, DropView>();
  private readonly collecting: DropView[] = [];
  private projs = new Map<Id, ProjView>();
  private chests = new Map<Id, ChestView>();
  private glowTex: THREE.Texture;
  private beamGeo: THREE.BufferGeometry;
  private bombs = new Map<number, THREE.Object3D>();
  private readonly pendingDrops = new Map<Id, { fromX: number; fromZ: number }>();
  /** Power cables along the live grid (rebuilt when the grid changes). */
  private powerT = 0;
  alt = false;

  private blobs: Blobs;
  private town: TownActors;
  private power: PowerLines;

  constructor(ctx: ViewCtx, glowTex: THREE.Texture) {
    this.ctx = ctx;

    this.glowTex = glowTex;
    this.town = new TownActors(ctx);
    this.power = new PowerLines(ctx, this.buildings);
    this.blobs = new Blobs(512, 0.42, (x, z) => gh(ctx, x, z));
    ctx.scene.add(this.bars.mesh, this.power.root, this.blobs.mesh);
    const beam = new THREE.CylinderGeometry(0.18, 0.35, 14, 12, 1, true);
    beam.translate(0, 7, 0);
    this.beamGeo = beam;
    for (const c of ctx.sim.state.chests) this.chests.set(c.id, new ChestView(ctx, c, beam));
    const events: EntityEventState = {
      heroes: this.heroes,
      drones: this.drones,
      units: this.units,
      enemies: this.enemies,
      dying: this.dying,
      byCorpse: this.byCorpse,
      raisedFrom: this.raisedFrom,
      buildings: this.buildings,
      sites: this.sites,
      drops: this.drops,
      collecting: this.collecting,
      pendingDrops: this.pendingDrops,
      spawnPorter: (x, z) => this.town.spawnPorter(x, z),
      keeper: (store) => this.town.keeper(store),
    };
    hookDroneEvents(ctx, events);
    hookEnemyEvents(ctx, events);
    hookCombatEvents(ctx, events);
    hookHeroEvents(ctx, events);
    hookMiningEvents(ctx, events);
    hookCraftingEvents(ctx, events);
    hookLootEvents(ctx, events);
  }

  spawnVendor(store: StoreId, spec: CharacterSpec, x: number, z: number, rot: number): void {
    this.town.spawnVendor(store, spec, x, z, rot);
  }

  /** 0 by day … 1 at night: lit lamps glow brighter. */
  setNight(night: number): void {
    BuildingView.night = night;
  }

  /** Heads of the lamps that are on the grid (world), for the night lights. */
  lampSpots(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const b of this.ctx.sim.state.buildings) {
      if (b.kind !== 'lamp' || !b.powered) continue;
      const v = this.buildings.get(b.id);
      if (v) out.push(v.lightPos());
    }
    return out;
  }

  /** Torches and hearths of the room the player is in (world), for the light pools indoors. */
  roomLights(x: number, z: number): { x: number; y: number; z: number; r: number; fire: boolean }[] {
    for (const v of this.buildings.values()) {
      if (!v.room) continue;
      const o = v.room.root.position;
      if (Math.abs(o.x - x) < 12 && Math.abs(o.z - z) < 12) return v.room.lights;
    }
    return [];
  }

  /** Fires of the braziers (world), for the night lights. */
  fireSpots(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const b of this.ctx.sim.state.buildings) {
      if (b.kind !== 'brazier') continue;
      const v = this.buildings.get(b.id);
      if (v) out.push(v.lightPos());
    }
    return out;
  }

  update(alpha: number, dt: number, w: number, h: number): void {
    const s = this.ctx.sim.state;
    const bars = this.bars;
    (this.ctx.sight ??= new Sight(this.ctx.camera, this.ctx.scene)).update();
    bars.begin();
    // Heroes.
    for (const [id, v] of this.heroes)
      if (!this.ctx.sim.getAs(id, 'hero')) {
        v.dispose();
        this.heroes.delete(id);
      }
    for (const hero of s.heroes) {
      let v = this.heroes.get(hero.id);
      // A new class is a new look (and so is Space: the space ranger's suit, until home again).
      if (v && (v.cls !== (hero.cls ?? 'tank') || v.space !== inSpace(hero.z))) {
        v.dispose();
        v = undefined;
      }
      if (!v) this.heroes.set(hero.id, (v = new HeroView(this.ctx, hero)));
      v.update(hero, alpha, dt, hero.ride ? this.rideSpot(hero, alpha, this.tmpStand) : null);
      if (!hero.dead && hero.id !== this.localHero)
        bars.push(v.pos.x, v.pos.y + PERSON * 1.5, v.pos.z, 0.7, hero.hp / hero.maxHp, BAR.hero);
    }
    // Drones in the air (everyone sees everyone's).
    for (const hero of s.heroes) {
      let d = this.drones.get(hero.id);
      if (hero.droneOn && !hero.dead) {
        if (!d) this.drones.set(hero.id, (d = new DroneView(this.ctx, hero)));
        d.update(dt, hero);
      } else if (d) {
        d.dispose();
        this.drones.delete(hero.id);
      }
    }
    for (const [id, d] of this.drones)
      if (!this.ctx.sim.getAs(id, 'hero')) {
        d.dispose();
        this.drones.delete(id);
      }
    // Footmen.
    const seenU = new Set<Id>();
    for (const u of s.units) {
      seenU.add(u.id);
      const key = u.kind === 'captain' ? 'captain' : 'footman';
      let v = this.units.get(u.id);
      if (v && v.specKey !== key) {
        v.dispose();
        v = undefined;
      }
      if (!v) this.units.set(u.id, (v = new UnitView(this.ctx, u, SPECS[key as 'footman'], key)));
      v.update(u, alpha, dt);
      if (!u.dead && u.hp < u.maxHp)
        bars.push(
          v.ch.root.position.x,
          v.ch.root.position.y + PERSON * 1.3,
          v.ch.root.position.z,
          0.45,
          u.hp / u.maxHp,
          BAR.ally,
        );
    }
    for (const [id, v] of this.units)
      if (!seenU.has(id)) {
        v.dispose();
        this.units.delete(id);
      }
    // Enemies — every one is drawn: also those that were there before any view existed (camps from
    // the start, a resumed game, a LAN snapshot), not only those seen spawning.
    for (const e of s.enemies) {
      let v = this.enemies.get(e.id);
      if (!v) {
        if (e.hp <= 0 || !this.ctx.sim.getAs(e.id, 'enemy')) continue;
        this.enemies.set(e.id, (v = new EnemyView(this.ctx, e, false)));
      }
      // Anything that can hit you is always drawn; only distance haze hides far-off things.
      v.update(e, alpha, dt, true);
      const boss = ENEMIES[e.kind].boss;
      if (v.ch.root.visible && e.spawnT <= 0 && !e.burrowed && (e.hp < e.maxHp || e.shield > 0 || boss)) {
        const p = v.ch.root.position;
        bars.push(
          p.x,
          p.y + v.height + 0.15,
          p.z,
          boss ? 1.6 : 0.5,
          e.hp / e.maxHp,
          boss ? BAR.boss : BAR.enemy,
          e.shield / e.maxHp,
        );
      }
    }
    // Views of the dead that are simply gone (broke into the keep, a new game) go too.
    for (const [id, v] of this.enemies) {
      if (this.ctx.sim.getAs(id, 'enemy')) continue;
      v.dispose();
      this.enemies.delete(id);
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const v = this.dying[i]!;
      v.update(null, alpha, dt, true);
      const corpseGone = !v.corpse || !this.ctx.sim.alive(v.corpse);
      if ((v.dieT > 7 && corpseGone) || v.dieT > 12) {
        v.dispose();
        this.dying.splice(i, 1);
        if (v.corpse) this.byCorpse.delete(v.corpse);
      }
    }
    // A soft shadow under everyone standing on the ground (no shadow maps).
    const blobs = this.blobs;
    blobs.begin();
    for (const hero of s.heroes) {
      const v = this.heroes.get(hero.id);
      if (!v || hero.dead) continue;
      const p = v.pos;
      if (waterDepth(this.ctx.sim.world, p.x, p.z) < 0.25) blobs.add(p.x, p.z, PERSON * 0.55);
    }
    for (const v of this.units.values())
      if (v.ch.root.visible) blobs.add(v.ch.root.position.x, v.ch.root.position.z, PERSON * 0.5);
    for (const d of this.drones.values()) blobs.add(d.pos.x, d.pos.z, 0.35);
    for (const e of s.enemies) {
      const v = this.enemies.get(e.id);
      if (!v || e.burrowed || !v.ch.root.visible) continue;
      const p = v.ch.root.position;
      blobs.add(p.x, p.z, ENEMIES[e.kind].radius * (e.flying ? 1.2 : 1.6));
    }
    blobs.end();
    // Buildings (a tower crewed by a hero on the wall-walk: the crew's glow).
    const crew = new Map<Id, HeroClass>();
    for (const h of s.heroes) if (h.post && !h.dead) crew.set(h.post, h.cls ?? 'tank');
    const seenB = new Set<Id>();
    for (const b of s.buildings) {
      seenB.add(b.id);
      let v = this.buildings.get(b.id);
      if (!v) {
        v = new BuildingView(this.ctx, b, this.glowTex);
        this.buildings.set(b.id, v);
        if (this.ctx.sim.state.time - b.builtAt < 0.5) v.popIn();
      }
      v.update(dt, b);
      if (isTower(b.kind)) v.setCrew(crew.get(b.id) ?? null);
      if (b.busy && b.kind in STATIONS) {
        const steps = stationSteps(b);
        const step = steps[b.step];
        if (!step) throw new Error(`Invalid station step ${b.step}`);
        const p = (b.step + b.work / step.work) / steps.length;
        bars.push(b.x, v.root.position.y + 4.2, b.z, 1.6, p, BAR.station);
      }
    }
    this.powerT -= dt;
    if (this.powerT <= 0) {
      this.powerT = 0.4;
      this.power.update();
    }
    for (const [id, v] of this.buildings)
      if (!seenB.has(id)) {
        const p = v.root.position;
        this.ctx.fx.burst(p.x, p.y + 1, p.z, 30, {
          color: '#a08a6a',
          speed: 5,
          up: 4,
          size: 0.3,
          gravity: 12,
          tex: 'chunk',
          additive: false,
          life: 1,
        });
        v.dispose();
        this.buildings.delete(id);
      }
    // Sites.
    const seenS = new Set<Id>();
    for (const site of s.sites) {
      seenS.add(site.id);
      let v = this.sites.get(site.id);
      if (!v) this.sites.set(site.id, (v = new SiteView(this.ctx, site)));
      v.update(dt, site, w, h);
      if (siteComplete(site)) {
        const pos = v.root.position;
        bars.push(pos.x, pos.y + (v.isAddon ? 7.2 : 4.4), pos.z, 1.8, v.progress(), BAR.site);
      }
    }
    for (const [id, v] of this.sites)
      if (!seenS.has(id)) {
        v.dispose();
        this.sites.delete(id);
      }
    // Drops.
    const seenD = new Set<Id>();
    for (const d of s.drops) {
      seenD.add(d.id);
      let v = this.drops.get(d.id);
      if (!v) {
        const from = this.pendingDrops.get(d.id) ?? { fromX: d.x, fromZ: d.z };
        this.pendingDrops.delete(d.id);
        this.drops.set(d.id, (v = new DropView(this.ctx, d, from.fromX, from.fromZ, this.beamGeo)));
      }
      v.update(dt, w, h, this.alt);
    }
    for (const [id, v] of this.drops)
      if (!seenD.has(id)) {
        v.dispose();
        this.drops.delete(id);
      }
    for (let i = this.collecting.length - 1; i >= 0; i--) {
      if (!this.collecting[i]!.update(dt, w, h, false)) {
        this.collecting[i]!.dispose();
        this.collecting.splice(i, 1);
      }
    }
    // Projectiles.
    const seenP = new Set<Id>();
    for (const p of s.projs) {
      seenP.add(p.id);
      let v = this.projs.get(p.id);
      if (!v) this.projs.set(p.id, (v = new ProjView(this.ctx, p, this.glowTex)));
      v.update(alpha, dt);
    }
    for (const [id, v] of this.projs)
      if (!seenP.has(id)) {
        v.dispose();
        this.projs.delete(id);
      }
    // Fires (burning ground).
    for (const f of s.fires) {
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * f.r;
        const x = f.x + Math.cos(a) * r;
        const z = f.z + Math.sin(a) * r;
        this.ctx.fx.glow({
          x,
          y: gh(this.ctx, x, z) + 0.1,
          z,
          vy: 1.8,
          life: 0.7,
          size: 0.5,
          size1: 0.1,
          color: '#ffc04d',
          color1: '#ff3d00',
        });
      }
    }
    for (const c of s.chests) this.chests.get(c.id)?.update(dt, c);
    this.town.updateVendors(dt, this.localHero);
    this.town.updatePorters(dt);
    // Lit dynamite: a fizzing fuse until it blows.
    const lit = new Set<number>();
    for (const b of s.bombs) {
      lit.add(b.id);
      let o = this.bombs.get(b.id);
      if (!o) {
        o = itemMesh('dynamite', this.ctx.assets);
        o.scale.setScalar(0.5);
        o.position.set(b.x, b.y ?? gh(this.ctx, b.x, b.z), b.z);
        this.ctx.scene.add(o);
        this.bombs.set(b.id, o);
      }
      if (Math.random() < dt * 30)
        this.ctx.fx.burst(b.x, o.position.y + 0.25, b.z, 2, {
          color: '#ffd27a',
          color1: '#ff6a00',
          speed: 1.2,
          up: 1.2,
          size: 0.05,
          gravity: 3,
          tex: 'spark',
          stretch: 2,
          life: 0.3,
        });
    }
    for (const [id, o] of this.bombs)
      if (!lit.has(id)) {
        o.removeFromParent();
        this.bombs.delete(id);
      }
    // The wall's gate: its strength, a bar over the gateway (faint while it is whole).
    const gate = s.gate;
    // (Not seen through the rock from down the mine, from indoors or from out in Space.)
    const cam = this.ctx.camera.position;
    if (!indoors(cam.x) && !underground(cam.x) && !inSpace(cam.z))
      bars.push(
        GATE.x,
        this.ctx.sim.world.wallY + WALL.walkH + 2.6,
        GATE.z,
        3.6,
        gate.hp / gate.maxHp,
        BAR.gate,
        0,
        gate.hp < gate.maxHp ? 1 : 0.55,
      );
    bars.end();
  }

  /** A creature has a view that shows whenever it is in sight (tests: "is every creature drawn?"). */
  creatureShown(id: Id): boolean {
    const v = this.enemies.get(id);
    if (!v || !v.ch.root.parent) return false;
    return v.ch.root.visible || !(this.ctx.sight?.sees(v.ch.root.position, v.height + 1) ?? true);
  }

  /** Where a hero's drone flies (for the camera), if it is out. */
  dronePos(hero: Id): THREE.Vector3 | null {
    return this.drones.get(hero)?.pos ?? null;
  }

  heroLift(id: Id): number {
    return this.heroes.get(id)?.lift ?? 0;
  }

  heroJump(id: Id): void {
    this.heroes.get(id)?.jump();
  }

  /** Building view (for picking/outline). */
  buildingObject(id: Id): THREE.Object3D | null {
    return this.buildings.get(id)?.root ?? null;
  }

  heroObject(id: Id): THREE.Object3D | null {
    return this.heroes.get(id)?.ch.root ?? null;
  }

  enemyObject(id: Id): THREE.Object3D | null {
    return this.enemies.get(id)?.ch.root ?? null;
  }
}

export { isTower };
export type { StationKind };

export { Sight } from './entity/context.ts';
export type { ViewCtx } from './entity/context.ts';
export { buildingModel } from './entity/building-model.ts';
export { CREW_COLOR } from './entity/crew-colors.ts';
