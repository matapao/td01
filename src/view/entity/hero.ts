import { CREW_COLOR } from './crew-colors.ts';
import { transitPose } from '../../game/transit.ts';
import * as THREE from 'three';
import { MAP, waterDepth } from '../../game/map.ts';
import {
  NODE_TOOL,
  NODES,
  TOOLS,
  HERO,
  weaponTier,
  type HeroClass,
  type ToolId,
} from '../../game/content.ts';
import { MINING } from '../../game/systems/mining.ts';
import type { Hero } from '../../game/types.ts';
import { workAction } from '../../game/systems/craft.ts';
import { CHAR, CharacterView, HERO_SPEC, PERSON, SPECS, TOOL_HELD, heroWeapon } from '../characters.ts';
import { droneController } from '../procmodels.ts';
import { inSpace } from '../../game/space.ts';
import { clamp, dampAngle, lerp } from '../../core/math.ts';
import { gh, type ViewCtx } from './context.ts';

interface WorkLoop {
  clip: string;
  tool?: keyof typeof TOOL_HELD;
  period: number;
  strike: number;
}
const WORK_LOOPS = {
  chop: { clip: 'Chopping', tool: 'axe', period: 1.333, strike: 0.47 },
  pick: { clip: 'Pickaxing', tool: 'pickaxe', period: 1.865, strike: 0.27 },
  dig: { clip: 'Digging', tool: 'shovel', period: 1.4, strike: 0.55 },
  hammer: { clip: 'Hammering', tool: 'hammer', period: 1.335, strike: 0.23 },
  saw: { clip: 'Sawing', tool: 'saw', period: 0.667, strike: 0.33 },
  cut: { clip: 'Working_B', tool: 'mallet', period: 0.62, strike: 0.7 },
  smelt: { clip: 'Working_A', period: 1.5, strike: 0.4 },
  weld: { clip: 'Working_C', period: 2, strike: 0.5 },
  wire: { clip: 'Working_A', period: 1.5, strike: 0.4 },
  code: { clip: 'Ranged_Magic_Spellcasting', period: 0.67, strike: 0.3 },
} satisfies Record<string, WorkLoop>;
/** Faster than this a stroke would look frantic: then one stroke lands every second hit. */
const MAX_STROKE = 2.2;

/** Each class's stance between blows, and its swings. */
const FIGHT: Record<HeroClass, { ready: string; swings: [string, ...string[]] }> = {
  tank: {
    ready: 'Melee_Unarmed_Idle',
    swings: ['Melee_1H_Attack_Chop', 'Melee_1H_Attack_Slice_Diagonal', 'Melee_1H_Attack_Slice_Horizontal'],
  },
  support: { ready: 'Melee_2H_Idle', swings: ['Melee_1H_Attack_Chop', 'Melee_1H_Attack_Slice_Horizontal'] },
  magic: { ready: 'Idle_B', swings: ['Ranged_Magic_Shoot'] },
};

export class HeroView {
  private ctx: ViewCtx;

  /** Time to the next ripple while in the water. */
  private rippleT = 0;
  ch: CharacterView;
  sack: THREE.Object3D;
  /** The tool (or work prop) in hand now; null: the class weapon. */
  private tool: string | null = null;
  private tools = new Map<string, THREE.Group>();
  /** The class weapon at the tier shown (sword and shield, a war axe, a staff) — put away while a tool is in hand. */
  private weapon: THREE.Group[] = [];
  private weaponKey = '';
  private weaponSets = new Map<string, THREE.Group[]>();
  private facing = 0;
  private last = '';
  private swing = 0;
  private jumpT = -1;
  /** Cosmetic jump height (the simulation never sees it). */
  lift = 0;
  /** The class this view was made for (a new class gets a new view). */
  readonly cls: HeroClass;
  /** Made for Space: the space ranger's suit (going there or coming home gets a new view). */
  readonly space: boolean;
  /** In Space, the helmet's visor: it glows the class's colour. */
  private visor: THREE.MeshLambertMaterial | null = null;
  /** Shield Wall's glow. */
  private bubble: THREE.Mesh | null = null;
  /** The drone's controller (in hand while flying it). */
  private controller: THREE.Group | null = null;
  /** The work loop playing, and the cadence of the hits it keeps time with (real seconds between them). */
  private loop: WorkLoop | null = null;
  private loopSpeed = 1;
  private perStroke = 1;
  private lastHit = -1;
  private hitGap = 0;
  private clock = 0;

  constructor(ctx: ViewCtx, h: Hero) {
    this.ctx = ctx;

    this.cls = h.cls ?? 'tank';
    this.space = inSpace(h.z);
    this.ch = new CharacterView(ctx.assets, this.space ? SPECS.spaceHero : HERO_SPEC[this.cls]);
    if (this.space) {
      this.ch.onReady((model) => {
        const glass = model.getObjectByName('SpaceRanger_Helmet_Visor') as THREE.Mesh | undefined;
        if (glass?.isMesh) this.visor = glass.material as THREE.MeshLambertMaterial;
      });
    }
    ctx.scene.add(this.ch.root);
    this.ch.play('Idle_A');
    this.facing = h.facing;
    // The bag on his back (it grows as it fills).
    this.sack = ctx.assets.model('medieval', 'sack');
    this.sack.position.set(0, 0.25, -0.42);
    this.sack.rotation.set(0.3, 0, 0);
    this.sack.scale.setScalar((4.2 * CHAR) / this.ch.spec.scale);
    this.sack.visible = false;
    this.ch.attach('chest', this.sack);
    this.syncWeapon(h);
  }

  get pos(): THREE.Vector3 {
    return this.ch.root.position;
  }

  oneShot(name: string, scale = 1): void {
    this.ch.once(name, '', scale);
    this.last = '';
  }

  /** The class weapon at the hero's tier (a reforge shows at once). */
  private syncWeapon(h: Hero): void {
    const key = `${this.cls}:${weaponTier(h)}`;
    if (key === this.weaponKey) return;
    for (const w of this.weapon) w.visible = false;
    this.weaponKey = key;
    let set = this.weaponSets.get(key);
    if (!set) this.weaponSets.set(key, (set = heroWeapon(h).map((p) => this.ch.prop(p))));
    this.weapon = set;
  }

  /** The work loop for what the hero is doing now (null: none). */
  private loopFor(h: Hero): WorkLoop | null {
    const sim = this.ctx.sim;
    if ((h.fabricatingUntil ?? 0) > sim.state.time) return WORK_LOOPS.hammer;
    if (h.task.k === 'gather') {
      const n = sim.getAs(h.task.node, 'node');
      if (!n) return null;
      return n.kind === 'tree'
        ? WORK_LOOPS.chop
        : NODE_TOOL[n.kind] === 'shovel'
          ? WORK_LOOPS.dig
          : WORK_LOOPS.pick;
    }
    // Hacking at the mine's rock.
    if ((h.earthAt ?? 0) > sim.state.time) return h.earthTool === 'shovel' ? WORK_LOOPS.dig : WORK_LOOPS.pick;
    if (h.task.k === 'dig') return WORK_LOOPS.pick;
    if (h.task.k === 'work') {
      const a = workAction(sim, h);
      return a ? WORK_LOOPS[a.action] : WORK_LOOPS.hammer;
    }
    return null;
  }

  /** How long between hits while gathering (sim seconds), before any have landed. */
  private hitTime(h: Hero): number {
    if (h.task.k === 'dig') return MINING.hitTime;
    const n = h.task.k === 'gather' ? this.ctx.sim.getAs(h.task.node, 'node') : undefined;
    return n ? NODES[n.kind].hitTime : 0.5;
  }

  /**
   * What's in the hero's hands: the tool for the job (the axe at a tree, the pickaxe at rock, the
   * shovel at scrap, the hammer at a plan, the saw at the sawmill) — otherwise the class weapon at
   * its tier; the drone's controller while flying it.
   */
  private setHands(h: Hero, loop: WorkLoop | null): void {
    let want: string | null = loop?.tool ?? null;
    // Real tools only when owned (dev mode lends them); a saw or a mallet is the station's.
    if (want && want in TOOLS && !h.tools.includes(want as ToolId) && !this.ctx.sim.state.dev) want = null;
    const piloting = !!h.droneOn && !h.dead;
    if (piloting && !this.controller) {
      this.controller = droneController();
      this.controller.scale.setScalar(CHAR / this.ch.spec.scale);
      this.ch.attach('handslot.r', this.controller);
    }
    if (this.controller) this.controller.visible = piloting;
    if (piloting) want = null;
    this.syncWeapon(h);
    for (const w of this.weapon) w.visible = !want && !piloting;
    if (want === this.tool) return;
    if (this.tool) this.tools.get(this.tool)!.visible = false;
    this.tool = want;
    if (!want) return;
    let m = this.tools.get(want);
    if (!m) this.tools.set(want, (m = this.ch.prop(TOOL_HELD[want as keyof typeof TOOL_HELD])));
    m.visible = true;
  }

  jump(): void {
    if (this.jumpT >= 0) return;
    this.jumpT = 0;
    this.ch.once('Jump_Full_Short', '', 1.55);
    this.last = '';
  }

  /** `stand`: where the hero is carried (riding a mine wagon). */
  update(h: Hero, alpha: number, dt: number, stand?: THREE.Vector3 | null): void {
    this.clock += dt;
    this.ch.toolPitch =
      (h.earthAt ?? 0) > this.ctx.sim.state.time ? clamp(-(h.earthAimY ?? 0) * 0.45, -0.5, 0.45) : 0;
    if (h.transit && !h.dead) {
      const p = transitPose(h);
      this.lift = p.y;
      this.ch.root.position.set(p.x, gh(this.ctx, p.x, p.z) + p.y, p.z);
      this.ch.root.rotation.y = h.facing;
      this.ch.fade = p.alpha;
      this.ch.root.visible = true;
      this.loop = null;
      this.setHands(h, null);
      const clip = p.boarding ? 'Jump_Full_Short' : p.walking ? 'Walking_A' : 'Idle_A';
      if (this.last !== clip) {
        this.ch.play(clip, 0.12);
        this.last = clip;
      }
      this.ch.update(dt);
      return;
    }
    if (!h.dead) this.ch.fade = 1;
    if (stand && !h.dead) {
      this.ch.root.position.copy(stand);
      this.facing = dampAngle(this.facing, h.facing, 32, dt);
      this.ch.root.rotation.y = this.facing;
      this.loop = null;
      this.setHands(h, null);
      if (this.bubble) this.bubble.visible = h.wallT > 0;
      this.sack.visible = this.ctx.sim.bagSlots(h) > 0;
      // (Riding a mine wagon: standing in it, hands on its rim.)
      const want = h.ride
        ? 'Idle_A'
        : h.anim === 'pilot'
          ? 'Holding_A'
          : h.anim === 'study'
            ? 'Use_Item'
            : FIGHT[this.cls].ready;
      if (!this.ch.busy && want !== this.last) {
        this.ch.play(want, 0.12);
        this.last = want;
      }
      this.swing += dt;
      this.ch.update(dt);
      return;
    }
    const x = lerp(h.px, h.x, alpha);
    const z = lerp(h.pz, h.z, alpha);
    if (this.jumpT >= 0) {
      this.jumpT += dt;
      const t = this.jumpT / 0.5;
      this.lift = t < 1 ? Math.sin(t * Math.PI) * PERSON * 0.55 : 0;
      if (t >= 1) {
        this.jumpT = -1;
        this.ctx.fx.burst(x, gh(this.ctx, x, z) + 0.03, z, 6, {
          color: '#bfae96',
          speed: 0.8,
          up: 0.2,
          size: 0.2,
          size1: 0.45,
          gravity: 0,
          tex: 'smoke',
          additive: false,
          alpha: 0.4,
          life: 0.5,
        });
      }
    }
    // In deep water a hero swims chest-deep at the surface (wading follows the riverbed).
    const ground = gh(this.ctx, x, z);
    const swimY = MAP.waterLevel - PERSON * 0.7;
    const swimming = !h.dead && ground < swimY;
    if (h.horse?.riding && !h.dead) this.lift = 0.32;
    else if (this.jumpT < 0) this.lift = 0;
    this.ch.root.position.set(
      x,
      (swimming ? swimY + Math.sin(this.swing * 2.4) * 0.015 : ground) + this.lift,
      z,
    );
    if (waterDepth(this.ctx.sim.world, x, z) > 0.04 && !h.dead) {
      this.rippleT -= dt;
      if (this.rippleT <= 0) {
        const moving = h.anim === 'run';
        this.rippleT = moving ? 0.22 : 0.9;
        this.ctx.fx.ring(
          x,
          MAP.waterLevel + 0.02,
          z,
          0.12,
          moving ? 0.55 : 0.4,
          '#d8f2ff',
          moving ? 0.6 : 1.1,
          0.5,
        );
        if (moving)
          this.ctx.fx.burst(x, MAP.waterLevel + 0.03, z, 3, {
            color: '#e8f8ff',
            speed: 0.7,
            up: 1.1,
            size: 0.06,
            gravity: 7,
            life: 0.45,
            tex: 'dot',
          });
      }
    }
    this.facing = dampAngle(this.facing, h.facing, 32, dt);
    this.ch.root.rotation.y = this.facing;
    // Working (gathering, digging, building, crafting): the loop for the job, the tool for it in hand.
    const working =
      !h.dead &&
      ((h.fabricatingUntil ?? 0) > this.ctx.sim.state.time ||
        h.anim === 'chop' ||
        h.anim === 'mine' ||
        h.anim === 'work');
    const loop = working ? this.loopFor(h) : null;
    if (loop !== this.loop) {
      this.loop = loop;
      this.lastHit = -1;
      this.hitGap = 0;
      this.perStroke = 1;
      this.loopSpeed = loop ? (h.anim === 'work' ? 1.2 : this.cadence(loop, this.hitTime(h))) : 1;
    }
    this.setHands(h, loop);
    // Shield Wall: a pale blue ward around the knight while it lasts.
    if (h.wallT > 0 && !h.dead) {
      if (!this.bubble) {
        this.bubble = new THREE.Mesh(
          new THREE.SphereGeometry(PERSON * 0.85, 18, 12),
          new THREE.MeshBasicMaterial({
            color: '#7fc8ff',
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        this.bubble.position.y = PERSON * 0.5;
        this.ch.root.add(this.bubble);
      }
      this.bubble.visible = true;
      this.bubble.scale.setScalar(1 + Math.sin(this.swing * 6) * 0.04);
      (this.bubble.material as THREE.MeshBasicMaterial).opacity = 0.14 + 0.08 * Math.min(1, h.wallT);
    } else if (this.bubble) this.bubble.visible = false;
    const bag = this.ctx.sim.bagSlots(h);
    // (In Space the jetpack is on his back: the bag is in the HUD.)
    this.sack.visible = bag > 0 && !this.space;
    const s = (0.6 + 0.6 * Math.min(1, bag / HERO.bag)) * ((4.2 * CHAR) / this.ch.spec.scale);
    this.sack.scale.setScalar(s);
    let want = 'Idle_A';
    let speed = 1;
    switch (h.anim) {
      case 'run':
        want =
          h.gait === 'back'
            ? 'Walking_Backwards'
            : h.gait === 'left'
              ? 'Running_Strafe_Left'
              : h.gait === 'right'
                ? 'Running_Strafe_Right'
                : 'Running_A';
        // Short cartoon legs: a quick cadence keeps the feet from skating at full speed.
        speed = h.gait === 'back' ? 2.1 : h.gait === 'fwd' ? 1.9 : 1.7;
        break;
      case 'chop':
      case 'mine':
      case 'work':
        if (loop) {
          want = loop.clip;
          speed = this.loopSpeed;
        }
        break;
      case 'study':
        want = 'Use_Item';
        speed = 0.8;
        break;
      case 'pilot':
        // Flying the drone: standing, both hands on the controller.
        want = 'Holding_A';
        break;
      case 'attack':
        want = FIGHT[this.cls].ready;
        break;
      case 'dead':
        want = '';
        break;
    }
    if (h.horse?.riding && !h.dead) {
      want = 'Sit_Chair_Idle';
      speed = 1;
    }
    // Shield Wall: the shield held up while it lasts.
    if (h.wallT > 0 && (h.anim === 'idle' || h.anim === 'attack')) want = 'Melee_Blocking';
    if (h.dead) {
      if (this.last !== 'dead') this.ch.once('Death_A', '', 1);
      this.last = 'dead';
    } else if (!this.ch.busy && want && want !== this.last) {
      this.ch.play(want, 0.09, speed);
      this.last = want;
    } else if (want && want === this.last && loop) this.ch.play(want, 0.09, speed);
    // A little bounce in the stride sells the weight of each step.
    if (h.anim === 'run' && !h.dead && this.jumpT < 0)
      this.ch.root.position.y += Math.abs(Math.sin(this.swing * Math.PI * 2 * speed * 1.25)) * PERSON * 0.045;
    this.swing += dt;
    // In Space: the class shows in the visor's glow (a hit flash passes over it).
    if (this.visor) this.visor.emissive.set(CREW_COLOR[this.cls]).multiplyScalar(0.5);
    this.ch.update(dt);
  }

  /** How fast a work loop plays to land a stroke every hit (or every second hit, when that would be frantic). */
  private cadence(loop: WorkLoop, gap: number): number {
    this.perStroke = Math.max(1, Math.ceil(loop.period / (MAX_STROKE * Math.max(0.05, gap))));
    return clamp(loop.period / (this.perStroke * Math.max(0.05, gap)), 0.6, 4);
  }

  /**
   * A hit landed (a chop, a pickaxe strike, a beat at the bench): the loop keeps its strokes in time
   * with the hits, and a beat brings the next stroke down at once. True if a stroke lands with it
   * (when strokes come every second hit, the other hit falls on the backswing).
   */
  strike(beat: boolean): boolean {
    const loop = this.loop;
    if (!loop) return true;
    if (!beat) {
      // The cadence of the hits as they come (game speed, a LAN server's pace and all).
      const gap = this.lastHit >= 0 ? this.clock - this.lastHit : 0;
      this.lastHit = this.clock;
      if (gap > 0.05 && gap < 3) {
        this.hitGap = this.hitGap ? this.hitGap * 0.6 + gap * 0.4 : gap;
        this.loopSpeed = this.cadence(loop, this.hitGap);
      }
    }
    if (this.ch.clipName !== loop.clip || this.ch.busy) return true;
    const len = this.ch.clipLength;
    if (!len) return true;
    // The strokes' grid in the clip: a stroke every `grid` clip-seconds lands with a hit.
    const grid = beat ? loop.period : loop.period / this.perStroke;
    let t = this.ch.clipTime;
    const k = Math.floor((t - loop.strike) / grid);
    const behind = t - (loop.strike + k * grid);
    const ahead = grid - behind;
    if (ahead > grid * (beat ? 0.3 : 0.25) && behind > grid * (beat ? 0.15 : 0.25)) {
      t = (((loop.strike + (k + 1) * grid - 0.04) % len) + len) % len;
      this.ch.clipTime = t;
    }
    // Is it a stroke's moment (not the backswing between two)?
    const off = (((t - loop.strike) % loop.period) + loop.period) % loop.period;
    return Math.min(off, loop.period - off) < loop.period * 0.25;
  }

  /** Exact terrain impacts start at the contact pose, rather than playing an unrelated idle beat. */
  terrainStrike(h: Hero): void {
    const loop = WORK_LOOPS.pick;
    this.loop = loop;
    this.setHands(h, loop);
    this.ch.play(loop.clip, 0.035, 3.6);
    this.last = loop.clip;
    this.ch.clipTime = loop.strike;
    this.ch.toolPitch = clamp(-(h.earthAimY ?? 0) * 0.45, -0.5, 0.45);
  }

  onSwing(kind: 'attack' | 'throw' | 'cast'): void {
    const swings = FIGHT[this.cls].swings;
    if (kind === 'throw') this.oneShot('Throw', 1.6);
    else if (kind === 'cast') this.oneShot('Ranged_Magic_Shoot', 1.6);
    // Every class declares at least one swing.
    else this.oneShot(swings[Math.floor(Math.random() * swings.length)]!, 1.45);
  }

  /** A small gesture (picking something up, handing it over) — only standing, never mid-stride. */
  gesture(h: Hero | undefined, clip: 'PickUp' | 'Interact', scale = 1.6): void {
    if (!h || h.dead || h.anim === 'run' || this.loop || this.ch.busy) return;
    this.oneShot(clip, scale);
  }

  dispose(): void {
    this.ch.dispose();
  }
}
