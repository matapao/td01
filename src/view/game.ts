import { transitFade, transitPose } from '../game/transit.ts';
import { Mounts } from './mounts.ts';
/** Owns the simulation and every view; runs the fixed-step loop with interpolation. */
import * as THREE from 'three';
import { Sim } from '../game/sim.ts';
import { earth } from '../game/excavation.ts';
import { PLANS, daylight, isTower, todNow } from '../game/content.ts';
import { underground } from '../game/systems/mining.ts';
import { inSpace } from '../game/space.ts';
import { LazySpaceView } from './lazy-space.ts';
import { indoors } from '../game/interiors.ts';
import { ExcavationView as MineView } from './excavationview.ts';
import { HandTorch } from './torch.ts';
import { GLOW_COLORS, GlowLights, type GlowSource } from './glowlights.ts';
import { DT } from '../game/config.ts';
import { groundHeight } from '../game/map.ts';
import { Assets, worldUniforms } from './assets.ts';
import { Stage } from './stage.ts';
import { HeroCamera } from './camera.ts';
import { buildSky, skyUniforms } from './sky.ts';
import { Terrain } from './terrain.ts';
import { SceneryView } from './scenery.ts';
import { loadNature } from './nature.ts';
import { Fx } from './fx.ts';
import { RockDebris } from './rockdebris.ts';
import { RailsView } from './rails.ts';
import { Labels } from './labels.ts';
import { EntityViews } from './entities.ts';
import { softDot } from './textures.ts';
import { GATE, MAP, WALL, onWall } from '../game/map.ts';
import type { Input } from './input.ts';

/** The camera in a room: looking down into it like one of KayKit's dioramas. */
const ROOM_VIEW = { pitch: 0.92, dist: 4.6 };
export interface GameOptions {
  sigil?: number;
  fog?: boolean;
  /** Painted light pools from fires and lamps. */
  glow?: boolean;
}

export class Game {
  public readonly ui: HTMLElement;

  readonly sim: Sim;
  readonly stage: Stage;
  readonly cam: HeroCamera;
  private sky: THREE.Group;
  readonly terrain: Terrain;
  /** Models arrive after the world is already on screen (no loading screens): see attach(). */
  assets!: Assets;
  scenery!: SceneryView;
  readonly fx: Fx;
  readonly labels: Labels;
  views!: EntityViews;
  readonly mines: MineView;
  /** Hears the mountain's creaks down the mine (the audio sets it): grit falling, a rumble, something stirring. */
  onUnease: ((kind: 'grit' | 'rumble' | 'stir', x: number, z: number) => void) | null = null;
  private uneaseT = 6;
  /** Fixed sources only: never a moving pool around the character. */
  private glow: GlowLights;
  private torch: HandTorch | null = null;
  private torchPosition = new THREE.Vector3();
  /** Is the player's hero down a mine? */
  under = false;
  /** The player is inside a building (a room off the map). */
  indoors = false;
  /** The player is in Space. */
  inSpace = false;
  private space: LazySpaceView;
  /** How the camera looked outside, to go back to it out of the door. */
  private outView: { pitch: number; dist: number } | null = null;
  /** …and up top, to go back to it out of the mine head. */
  private mineView: { pitch: number; dist: number } | null = null;
  /** Time of day 0–1 (see content.timeOfDay). */
  tod = 0.3;
  private opts: GameOptions;
  private acc = 0;
  private last = performance.now();
  speed = 1;
  paused = false;
  /** Set by main once the input layer exists. */
  input: Input | null = null;
  /** Interpolation factor between the previous and current sim tick. */
  alpha = 0;
  /** In a LAN game the server steps the world; ticks arrive over the network (see net/mirror). */
  net: { lastTickAt: number; interval: number } | null = null;
  /** The player's own hero (the camera rides along with it). */
  localHero = 0;
  private frameHooks: ((dt: number) => void)[] = [];

  /**
   * Builds everything that needs no downloaded models — terrain, water, grass, sky, camera — so the
   * vale is on screen at once; attach() adds scenery, characters and buildings when they arrive.
   */
  constructor(container: HTMLElement, ui: HTMLElement, opts: GameOptions = {}) {
    this.ui = ui;

    this.opts = opts;
    this.sim = new Sim({ sigil: opts.sigil ?? 0 });
    this.stage = new Stage(container);
    this.terrain = new Terrain(this.sim.world);
    // The Forest Nature kit streams in alongside the other models (the scenery swaps it in on arrival).
    void loadNature();
    this.stage.scene.add(this.terrain.mesh, this.terrain.water);
    // Discovery lives on the minimap and map; the world itself is never fogged over (only haze).
    worldUniforms.uFogOn.value = opts.fog === true ? 1 : 0;
    this.cam = new HeroCamera(this.stage.camera);
    // The lens never dips under the water when you swim.
    this.cam.groundAt = (x, z) =>
      underground(x)
        ? groundHeight(this.sim.world, x, z)
        : Math.max(groundHeight(this.sim.world, x, z), MAP.waterLevel + 0.05);
    this.cam.blockers = () => this.cameraBlockers();
    this.cam.follow = () => {
      const h = this.sim.getAs(this.localHero, 'hero') ?? this.sim.state.heroes[0];
      if (!h)
        return {
          x: MAP.heroStart.x,
          y: groundHeight(this.sim.world, MAP.heroStart.x, MAP.heroStart.z),
          z: MAP.heroStart.z,
        };
      // Flying the drone: the camera rides behind it (your hero stays where it stands).
      const drone = h.droneOn ? this.views?.dronePos(h.id) : null;
      if (drone) return { x: drone.x, y: drone.y - this.cam.headY + 0.15, z: drone.z };
      // In a mine wagon: the camera rides with the hero.
      const top = h.ride ? this.views?.heroObject(h.id)?.position : null;
      if (top) return { x: top.x, y: top.y, z: top.z };
      if (h.transit) {
        const p = transitPose(h);
        return { x: p.x, y: groundHeight(this.sim.world, p.x, p.z) + p.y, z: p.z };
      }
      const x = h.px + (h.x - h.px) * this.alpha;
      const z = h.pz + (h.z - h.pz) * this.alpha;
      return { x, y: groundHeight(this.sim.world, x, z) + (this.views?.heroLift(h.id) ?? 0), z };
    };
    // Start behind the hero, looking out over the gate towards the crypts.
    this.cam.yaw = -Math.PI / 2 + 0.25;
    this.sky = buildSky();
    this.stage.scene.add(this.sky);
    this.terrain.updateFog(this.sim.state.explored);

    this.fx = new Fx(this.stage.camera, ui);
    this.stage.scene.add(this.fx.group);
    this.labels = new Labels(this.stage.camera, ui);
    this.space = new LazySpaceView(this.sim, this.stage.scene, this.fx, () => this.assets, ui);
    // The mines below (no models needed).
    this.mines = new MineView(this.sim, this.terrain);
    // Painted accents belong to fixed fires and lamps, never to the character.
    this.glow = new GlowLights((x, z) => (underground(x) ? 0 : groundHeight(this.sim.world, x, z)));
    this.stage.scene.add(this.glow.mesh);
    this.stage.scene.add(this.mines.group);
    new RockDebris(this);
    // Down the mine the camera keeps out of the rock — its walls, its roof and a cave-in's rubble —
    // and under the roof.
    this.cam.solidAt = (x, y, z) => !indoors(x) && !inSpace(z) && earth(this.sim).density(x, y, z) > -0.06;
    this.cam.ceilingAt = (x, z) => {
      const field = earth(this.sim);
      if (!underground(x) && !field.columns(x, z).length) return Infinity;
      const floor = field.floor(x, z);
      for (let y = floor + 0.8; y < floor + 8; y += 0.08) if (field.density(x, y, z) > 0) return y;
      return floor + 8;
    };
  }

  /** True once the models are in and the game can be played. */
  get ready(): boolean {
    return !!this.views;
  }

  /** The models arrived: scenery, characters, buildings, shopkeepers. */
  attach(assets: Assets): void {
    this.assets = assets;
    this.scenery = new SceneryView(assets, this.sim);
    new Mounts(this);
    this.stage.scene.add(this.scenery.group);
    void this.opts;
    this.views = new EntityViews(
      {
        sim: this.sim,
        assets,
        fx: this.fx,
        labels: this.labels,
        scene: this.stage.scene,
        camera: this.stage.camera,
        shake: (amount, x, z) => {
          const d = Math.hypot(x - this.cam.target.x, z - this.cam.target.z);
          this.cam.shake(amount * Math.max(0, 1 - d / 45));
        },
      },
      softDot(64),
    );
    // Deferred regions do no startup work; the current loop stays in the village and mine.
    // The mine's track, wagons, timbers, lanterns and ore (the rock needs no models).
    this.mines.attach(assets);
    this.views.rideSpot = (h, alpha, out) => this.mines.rideSpot(h, alpha, out);
    // Rails (once invented): track from a mine head toward the forge, and the ore carts on it.
    const rails = new RailsView(this.sim, assets, this.fx);
    this.stage.scene.add(rails.group);
    this.onFrame((dt) => rails.update(this.paused ? 0 : dt));
    const ev = this.sim.events;
    ev.on('gatherHit', (e) => this.scenery.hitNode(e.node));
    ev.on('nodeDepleted', (e) => this.scenery.depleteNode(e.node));
    ev.on('nodeRegrown', (e) => this.scenery.regrowNode(e.node));
    // A blow on the wall's gate: its doors jolt, splinters and dust fly off its outer face.
    ev.on('gateHit', (e) => {
      this.scenery.gateHit();
      const y = this.sim.world.wallY;
      this.fx.burst(
        GATE.x + WALL.half + 0.4,
        y + 1 + Math.random() * 1.6,
        GATE.z + (Math.random() - 0.5) * WALL.gateHalf * 1.6,
        Math.min(10, 3 + Math.round(e.amount / 6)),
        {
          color: '#8a6440',
          speed: 2.4,
          up: 2.2,
          size: 0.16,
          gravity: 10,
          tex: 'chunk',
          additive: false,
          life: 0.7,
        },
      );
      this.fx.burst(GATE.x + WALL.half + 0.3, y + 0.4, GATE.z, 3, {
        color: '#b9a88e',
        speed: 0.8,
        up: 0.6,
        size: 0.4,
        size1: 0.9,
        gravity: 0,
        tex: 'smoke',
        additive: false,
        alpha: 0.35,
        life: 0.9,
      });
    });
    ev.on('waveStarted', (e) => e.crypts.forEach((c) => this.scenery.setGate(c, true)));
    // Out of a mine head's door: the camera swings round behind you, looking out over the land.
    // Down the lift the camera comes in close under the rock (and goes back to your own view up top).
    ev.on('rideLift', (e) => {
      const h = this.sim.getAs(e.hero, 'hero');
      if (!h || e.hero !== this.localHero) return;
      this.cam.snapBehind(h.facing);
      if (e.down) {
        this.mineView ??= { pitch: this.cam.pitch, dist: this.cam.goal };
        this.cam.easeTo(0.28, Math.min(this.cam.goal, 3.2));
      } else if (this.mineView) {
        this.cam.easeTo(this.mineView.pitch, this.mineView.dist);
        this.mineView = null;
      }
    });
    // Out of a wagon: the camera behind you, looking on the way you came.
    ev.on('rideEnd', (e) => {
      const h = this.sim.getAs(e.hero, 'hero');
      if (h && e.hero === this.localHero) this.cam.snapBehind(h.facing);
    });
    // Through a door, in or out: the camera comes along, turned with you, through a blink of dark —
    // then settles to look down into the room like a diorama (and back to your own view outside).
    ev.on('entered', (e) => {
      if (e.hero !== this.localHero) return;
      this.cam.turn(e.turn);
      if (e.inside) {
        if (!this.outView) this.outView = { pitch: this.cam.pitch, dist: this.cam.goal };
        this.cam.easeTo(ROOM_VIEW.pitch, ROOM_VIEW.dist);
      } else if (this.outView) {
        this.cam.easeTo(this.outView.pitch, this.outView.dist);
        this.outView = null;
      }
    });
  }

  /** What the camera can't pass through: walls, houses, the keep, towers. */
  private *cameraBlockers(): Iterable<THREE.Box3> {
    if (this.scenery) yield* this.scenery.cameraBlockers;
    if (this.views) yield* this.views.buildingBoxes();
  }

  onFrame(fn: (dt: number) => void): void {
    this.frameHooks.push(fn);
  }

  /** Advance the simulation by real time (fixed steps). */
  private stepSim(dt: number): void {
    if (this.net) {
      this.alpha = Math.min(1, Math.max(0, (performance.now() - this.net.lastTickAt) / this.net.interval));
      return;
    }
    if (this.paused) return;
    this.acc += dt * this.speed;
    let steps = 0;
    while (this.acc >= DT && steps < 8) {
      this.sim.step();
      this.acc -= DT;
      steps++;
    }
    if (steps >= 8) this.acc = 0;
    this.alpha = this.acc / DT;
    // Close crypt gates once a lane stops spawning.
    const s = this.sim.state;
    for (let c = 0; c < 2; c++) if (!s.spawns.some((sp) => sp.crypt === c)) this.scenery.setGate(c, false);
  }

  /** Rolling per-section frame timings (ms), for profiling. */
  readonly prof: Record<string, number> = {};
  private mark(name: string, t0: number): number {
    const t = performance.now();
    this.prof[name] = (this.prof[name] ?? 0) * 0.95 + (t - t0) * 0.05;
    return t;
  }

  /** Frames drawn (tests watch it to know the picture is alive). */
  frames = 0;
  private frameErrors = 0;

  /**
   * One frame. Nothing that goes wrong in it may stop the loop: three.js asks for the next frame
   * only after this returns, so an uncaught error would freeze the picture for good.
   */
  frame = (): void => {
    try {
      this.frameBody();
      this.frames++;
    } catch (err) {
      if (this.frameErrors++ < 5) console.error(err);
    }
  };

  /**
   * Down the mine, now and then the mountain reminds you where you are: grit and pebbles off the
   * roof a few steps away, a deep rumble through the rock, something stirring off in the dark.
   */
  private unease(on: boolean, dt: number): void {
    if (!on) {
      this.uneaseT = Math.max(this.uneaseT, 4 + Math.random() * 4);
      return;
    }
    this.uneaseT -= dt;
    if (this.uneaseT > 0) return;
    this.uneaseT = 8 + Math.random() * 14;
    const t = this.cam.target;
    const roll = Math.random();
    // Something stirring: the nearest creature lairing within 30 m, wherever it is in the dark.
    const near =
      roll > 0.78
        ? this.sim.state.enemies
            .filter((e) => e.camp && e.hp > 0 && underground(e.x))
            .sort((a, b) => Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z))[0]
        : undefined;
    if (near && Math.hypot(near.x - t.x, near.z - t.z) < 30) {
      this.onUnease?.('stir', near.x, near.z);
      return;
    }
    if (roll < 0.55) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 4;
      const x = t.x + Math.cos(a) * r;
      const z = t.z + Math.sin(a) * r;
      const roof = this.cam.ceilingAt(x, z);
      if (roof === Infinity) return;
      const floor = this.cam.groundAt(x, z);
      this.fx.burst(x, roof - 0.1, z, 9, {
        color: '#5e5953',
        speed: 0.5,
        up: -0.4,
        size: 0.06,
        gravity: 9,
        tex: 'chunk',
        additive: false,
        life: 0.8,
      });
      this.fx.burst(x, floor + 0.05, z, 4, {
        color: '#7d776f',
        speed: 0.45,
        up: 0.25,
        size: 0.35,
        size1: 0.85,
        gravity: 0,
        tex: 'smoke',
        additive: false,
        alpha: 0.28,
        life: 1.5,
      });
      this.onUnease?.('grit', x, z);
      return;
    }
    this.cam.shake(0.18);
    this.onUnease?.('rumble', t.x, t.z);
  }

  private frameBody(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    let t = now;
    if (!this.views) {
      // Models still streaming in: show the vale (terrain, water, grass, sky) — never a loading screen.
      this.cam.update(dt);
      (this.sky.getObjectByName('sky') as THREE.Object3D).position.copy(this.stage.camera.position);
      skyUniforms.uTime.value += dt;
      worldUniforms.uTime.value += dt;
      this.stage.render();
      return;
    }
    this.stepSim(dt);
    t = this.mark('sim', t);
    worldUniforms.uTime.value += dt;
    // In a mine wagon the lens swings round behind it through the bends (unless you're looking about).
    const rider = this.sim.getAs(this.localHero, 'hero');
    if (rider?.ride && !this.input?.looking) {
      const off = rider.facing + Math.PI - this.cam.yaw;
      this.cam.yaw += Math.atan2(Math.sin(off), Math.cos(off)) * Math.min(1, dt * 2.4);
    }
    // Up on the wall-walk the lens rises over the battlements — higher still while a tower is laid out
    // on the field below — so the ground at the wall's foot shows.
    const up = !!rider && !rider.dead && onWall(rider.x, rider.z);
    const placing = this.input?.placingPlan;
    const plan = placing ? PLANS[placing] : null;
    const layingTower = !!plan && plan.type === 'building' && isTower(plan.building);
    this.cam.liftGoal = up ? (layingTower ? 2.4 : 1.3) : 0;
    this.stage.setDoorFade(transitFade(rider));
    this.cam.update(dt);
    (this.sky.getObjectByName('sky') as THREE.Object3D).position.copy(this.stage.camera.position);
    skyUniforms.uTime.value += dt;
    this.stage.followShadow(this.cam.shadowCentre(new THREE.Vector3()), this.cam.viewSpan);
    this.scenery.update(dt);
    this.scenery.cull(this.stage.camera.position, (this.stage.scene.fog as THREE.Fog).far + 12);
    const me = this.sim.getAs(this.localHero, 'hero');
    // In a mine or inside a building: no sky, the warm dark of indoors.
    this.indoors = !!me && indoors(me.x);
    this.inSpace = !!me && !underground(me.x) && inSpace(me.z);
    this.under = !!me && (underground(me.x) || this.indoors);
    this.space.update(dt, this.inSpace, this.cam.target);
    this.cam.indoors = this.indoors;
    this.sky.visible = !this.under;
    this.mines.update(dt, this.cam.target.x, this.alpha, this.stage.camera.position, this.cam.target);
    // Underground atmosphere stays dark until the player brings a torch.
    const lamp = this.under && !this.indoors;
    this.unease(lamp, dt);
    // Outdoors, fires and lamps supply fixed warm accents; the hero has no light pool.
    this.tod = todNow(this.sim.state);
    // Space keeps no time of day: the sun always shines there, the dark always round it.
    const night = this.inSpace ? 0 : 1 - daylight(this.tod);
    // A purchased torch is the only personal mine light. There is no outdoor character halo.
    this.torch ??= new HandTorch(this.stage.scene);
    const torchLit = !!me && !me.dead && !me.droneOn && lamp && !!me.torchOwned && me.torchLit !== false;
    const heroRoot = me ? this.views.heroObject(me.id) : null;
    if (heroRoot) this.torchPosition.copy(heroRoot.position);
    else if (me) this.torchPosition.set(me.x, groundHeight(this.sim.world, me.x, me.z), me.z);
    this.torch.update(dt, this.torchPosition, me?.facing ?? 0, torchLit);
    this.mines.setTorch(this.torch.tip, torchLit);
    this.views.setNight(night);
    this.scenery.setNight(this.under ? 0 : night);
    this.glow.update(this.cam.target, this.opts.glow === false ? [] : this.glowSources(night));
    if (this.sim.state.tick % 6 === 0) this.terrain.updateFog(this.sim.state.explored);
    const dom = this.stage.renderer.domElement;
    t = this.mark('world', t);
    this.labels.begin();
    this.views.update(this.alpha, dt * (this.paused ? 0 : 1), dom.clientWidth, dom.clientHeight);
    t = this.mark('views', t);
    this.fx.update(dt, dom.clientWidth, dom.clientHeight);
    this.labels.end();
    t = this.mark('fx', t);
    for (const fn of this.frameHooks) {
      try {
        fn(dt);
      } catch (err) {
        if (this.frameErrors++ < 5) console.error(err);
      }
    }
    t = this.mark('ui', t);
    this.stage.render();
    this.mark('render', t);
  }

  /** Everything that burns near the player, for the painted light pools. */
  private *glowSources(night: number): Iterable<GlowSource> {
    const t = this.cam.target;
    // The mine needs no translucent light pools over its painted surfaces.
    if (this.under && !this.indoors) return;
    if (this.indoors) {
      for (const p of this.views.roomLights(t.x, t.z))
        yield {
          x: p.x,
          y: p.y,
          z: p.z,
          r: p.r,
          color: p.fire ? GLOW_COLORS.fire : GLOW_COLORS.torch,
          k: p.fire ? 0.38 : 0.14,
        };
      return;
    }
    if (this.under) {
      for (const p of this.mines.torchSpots)
        yield { x: p.x, y: p.y, z: p.z, r: 3.6, color: GLOW_COLORS.torch, k: 0.45 };
      return;
    }
    // Fires show a little by day and a lot at night; lamps only matter once it gets dark.
    const fire = 0.15 + 0.85 * night;
    for (const s of this.scenery.lightSpots()) yield { ...s, k: 1.3 * fire };
    for (const p of this.views.fireSpots())
      yield { x: p.x, y: p.y + 0.2, z: p.z, r: 7, color: GLOW_COLORS.fire, k: 1.5 * fire };
    const lamps = 1.7 * THREE.MathUtils.smoothstep(night, 0.15, 0.6);
    for (const p of this.views.lampSpots())
      yield { x: p.x, y: p.y, z: p.z, r: 10, color: GLOW_COLORS.lamp, k: lamps };
  }

  start(): void {
    this.last = performance.now();
    this.stage.renderer.setAnimationLoop(this.frame);
  }

  /** World position under a screen point (marches the heightfield). */
  groundAtScreen(px: number, py: number): THREE.Vector3 | null {
    const dom = this.stage.renderer.domElement;
    const ndc = new THREE.Vector2((px / dom.clientWidth) * 2 - 1, -(py / dom.clientHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.stage.camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    let prev = 0;
    for (let t = 0; t < 220; t += 0.6) {
      const x = o.x + d.x * t;
      const y = o.y + d.y * t;
      const z = o.z + d.z * t;
      if (y <= groundHeight(this.sim.world, x, z)) {
        let lo = prev;
        let hi = t;
        for (let i = 0; i < 12; i++) {
          const m = (lo + hi) / 2;
          if (o.y + d.y * m <= groundHeight(this.sim.world, o.x + d.x * m, o.z + d.z * m)) hi = m;
          else lo = m;
        }
        return new THREE.Vector3(o.x + d.x * hi, o.y + d.y * hi, o.z + d.z * hi);
      }
      prev = t;
    }
    return null;
  }
}
