import { CREW_COLOR } from './crew-colors.ts';
import * as THREE from 'three';
import {
  type HeroClass,
  STATIONS,
  TOWER_WINDOWS,
  elementOf,
  gemLevel,
  isTower,
  topOf,
  type TopLevel,
  type GemId,
  type DamageType,
  type ItemId,
} from '../../game/content.ts';
import type { Building } from '../../game/types.ts';
import { makeFlame } from '../flame.ts';
import { CharacterView, SPECS, type CharacterSpec, type Held } from '../characters.ts';
import { itemMesh } from '../itemmodels.ts';
import { TOWER, gemWindow, socketMarker, windowFrame } from '../towerview.ts';
import { socketGem, type GemFx, type SocketGem } from '../gems.ts';
import { deviceModel, type DeviceView } from '../devices.ts';
import { rocketModel } from '../rockets.ts';
import { makeEmblem, type Emblem } from '../emblems.ts';
import { InteriorView } from '../interiorview.ts';
import { clamp, damp, dampAngle, easeOutBack } from '../../core/math.ts';
import { gh, type ViewCtx } from './context.ts';
import { buildingModel } from './building-model.ts';
import { emitGemFx, updateBuildingFire, updateBuildingDamage } from './building-effects.ts';

/** Top surface height of a model at its centre (raycast from above). */
function topHeight(obj: THREE.Object3D): number {
  obj.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(new THREE.Vector3(0, 60, 0.05), new THREE.Vector3(0, -1, 0));
  const hits = rc.intersectObject(obj, true);
  return hits[0]?.point.y ?? 4;
}

/**
 * The archer's bow work in clip seconds: Ranged_Bow_Release snaps the string at once and his hand is
 * back at the quiver by `reach`; Ranged_Bow_Draw (from `nock`, where his hand meets the string) pulls
 * to full draw — `cycle` in all. The arrow on the string rides his right hand.
 */
const BOW = {
  reach: 0.62,
  nock: 0.47,
  cycle: 0.62 + (1.33 - 0.47),
  arrow: { model: 'arrow_bow', hand: 'r', rot: [-Math.PI / 2, 0, 0], pos: [0, 0.55, 0] } as Held,
};

const UP_AXIS = new THREE.Vector3(0, 1, 0);
/** How far out the gallery runs round a tower's top (its walkway, world units). */
const GALLERY_R = 1.58;
/** What a tower's gem views depend on: which gems, in which windows, at which grade. */
const gemsKey = (b: Building) => b.gems.map((g) => `${g}${gemLevel(b, g)}`).join(',');
export class BuildingView {
  private ctx: ViewCtx;
  public readonly b: Building;
  private glowTex: THREE.Texture;

  readonly root = new THREE.Group();
  private boxCache: THREE.Box3 | null = null;
  private boxAt = -1;

  /** World bounds, recomputed now and then (pop-in, gems). */
  box(): THREE.Box3 {
    if (!this.boxCache || this.time - this.boxAt > 1) {
      this.root.updateMatrixWorld(true);
      this.boxCache = (this.boxCache ?? new THREE.Box3()).setFromObject(this.model);
      this.boxAt = this.time;
    }
    return this.boxCache;
  }
  private model: THREE.Object3D;
  private shooters: CharacterView[] = [];
  private saw: THREE.Object3D | null = null;
  /** Towers: the archer, the gems set in its windows, and their light (rebuilt whenever they change). */
  private mods = new THREE.Group();
  private gemKey = '';
  private sockets: (SocketGem & { key: string; frame: THREE.Group; popT: number })[] = [];
  private emblem: Emblem | null = null;
  private emblemOf: DamageType | undefined = undefined;
  private platformY: number;
  private pop = 0;
  private time = 0;
  private aimYaw = 0;
  private trays = new THREE.Group();
  private trayKey = '';
  private lampHead: THREE.Mesh | null = null;
  /** Night factor (0 day … 1 night), set by EntityViews for the lamps. */
  static night = 0;
  /** Poles: the yaw of the line they carry (the crossarm stands square to it). */
  armYaw = 0;

  faceAlong(yaw: number): void {
    this.armYaw = yaw;
    this.model.rotation.y = yaw - this.b.rot;
    this.boxCache = null;
  }

  /** A brazier's fire. */
  private flame: THREE.Group | null = null;
  /** A lit lamp's halo. */
  private lampHalo: THREE.Sprite | null = null;

  /** Where a lamp's or a brazier's light sits (world). */
  lightPos(): THREE.Vector3 {
    const at = this.lampHead ?? this.flame;
    return at ? at.getWorldPosition(new THREE.Vector3()) : this.root.position.clone();
  }
  private glow: THREE.Sprite | null = null;
  /** Towers: the top shown (the open platform, the roofed turret, the gallery). */
  private topShown: TopLevel = 1;
  /** On the gallery: where round it the archer stands (he walks round to face his mark). */
  private walkYaw = 0;
  /** The archer is ducking a wraith's dive. */
  private ducking = false;
  /** The Port: the rocket on its pad. */
  private rocket: THREE.Group | null = null;
  /** Towers: the devices in the upper windows (rebuilt when they change). */
  private devices: (DeviceView & { frame: THREE.Group; yaw: number })[] = [];
  private deviceKey = '';

  constructor(ctx: ViewCtx, b: Building, glowTex: THREE.Texture) {
    this.ctx = ctx;
    this.b = b;
    this.glowTex = glowTex;

    this.topShown = topOf(b);
    this.model = buildingModel(ctx.assets, b.kind, this.topShown);
    this.root.add(this.model, this.trays);
    this.root.position.set(b.x, gh(ctx, b.x, b.z) - 0.05, b.z);
    this.root.rotation.y = b.rot;
    this.armYaw = b.rot;
    ctx.scene.add(this.root);
    // A tower's platform floor is where every top stands (the turret and the gallery sit on it).
    this.platformY = isTower(b.kind) ? TOWER.floor : topHeight(this.model);
    if (b.kind === 'sawmill') this.saw = this.model.getObjectByName('building_lumbermill_saw_blue') ?? null;
    if (b.kind === 'hydro') this.saw = this.model.getObjectByName('building_watermill_wheel_blue') ?? null;
    this.lampHead = (this.model.userData['head'] ?? null) as THREE.Mesh | null;
    if (this.lampHead) {
      this.lampHalo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: '#ffd48a',
          opacity: 0.6,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      );
      this.lampHalo.scale.setScalar(0);
      this.lampHead.add(this.lampHalo);
    }
    const flameAt = this.model.userData['flame'] as THREE.Vector3 | undefined;
    if (flameAt) {
      this.flame = makeFlame(glowTex);
      this.flame.position.copy(flameAt);
      this.model.add(this.flame);
    }
    if (b.kind === 'forge' || b.kind === 'arcanist') {
      this.glow = this.sprite(b.kind === 'forge' ? '#ff8a3a' : '#a77bff', 1.8);
      this.glow.position.set(0, b.kind === 'forge' ? 0.9 : 2.2, b.kind === 'forge' ? 1.2 : 0);
      this.root.add(this.glow);
    }
    this.root.add(this.mods);
    if (isTower(b.kind)) this.syncGems();
  }

  private sprite(color: string, size: number): THREE.Sprite {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    sp.scale.setScalar(size);
    return sp;
  }

  /** Just outside the window gem `id` is set in (world). */
  gemPos(id: GemId, out = new THREE.Vector3()): THREE.Vector3 {
    out.copy(socketMarker(gemWindow(id)));
    this.root.updateMatrixWorld();
    return this.root.localToWorld(out);
  }

  /** A spot on the platform just behind the crew — on the gallery, across it from the archer (world): where the crew's glow shows. */
  standSpot(out = new THREE.Vector3()): THREE.Vector3 {
    if (this.topShown === 3)
      out.set(
        Math.sin(this.walkYaw + Math.PI) * GALLERY_R,
        this.platformY + 0.05,
        Math.cos(this.walkYaw + Math.PI) * GALLERY_R,
      );
    else out.set(0, this.platformY + 0.2, -0.62);
    out.applyAxisAngle(UP_AXIS, this.root.rotation.y);
    return out.add(this.root.position);
  }

  /** The devices, one in each upper window in the order they went in. */
  private syncDevices(b: Building): void {
    this.deviceKey = (b.devices ?? []).join(',');
    for (const d of this.devices) d.frame.removeFromParent();
    this.devices = (b.devices ?? []).map((id, i) => {
      const w = TOWER_WINDOWS.upper[i % TOWER_WINDOWS.upper.length]!; // Built-in tower windows are nonempty.
      const frame = windowFrame(w);
      const v = deviceModel(id, this.glowTex);
      // Big enough to read from the road: each stands well out of its window.
      v.obj.scale.setScalar(2.3);
      frame.add(v.obj);
      this.mods.add(frame);
      return { ...v, frame, yaw: w.yaw };
    });
  }

  /** A new top built on the tower: the model changes, with a puff of dust and a little pop. */
  private swapTop(b: Building): void {
    const old = this.model;
    this.topShown = topOf(b);
    this.model = buildingModel(this.ctx.assets, b.kind, this.topShown);
    old.removeFromParent();
    this.root.add(this.model);
    this.boxCache = null;
    this.pop = 0.001;
    const p = this.root.position;
    this.ctx.fx.burst(p.x, p.y + this.platformY + 0.8, p.z, 18, {
      color: '#d8c8a8',
      size: 0.35,
      size1: 0.9,
      life: 1.2,
      speed: 1.6,
      up: 1.2,
      tex: 'smoke',
      gravity: -0.2,
    });
  }

  /** A hero crewing it from the wall lifts the crew: a slow ring of light round the platform, in the class colour. */
  private crewRing: THREE.Mesh | null = null;
  setCrew(cls: HeroClass | null): void {
    if (!cls) {
      if (this.crewRing) this.crewRing.visible = false;
      return;
    }
    if (!this.crewRing) {
      this.crewRing = new THREE.Mesh(
        new THREE.RingGeometry(0.74, 0.9, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
        }),
      );
      this.root.add(this.crewRing);
    }
    (this.crewRing.material as THREE.MeshBasicMaterial).color.set(CREW_COLOR[cls]);
    this.crewRing.position.y = this.platformY + 0.12;
    this.crewRing.rotation.y = this.time * 0.9;
    this.crewRing.scale.setScalar(1 + Math.sin(this.time * 3.2) * 0.05);
    this.crewRing.visible = true;
  }

  /** A crew member at `at` (the tower's frame): the archer, an arrow ready to nock. */
  private addShooter(spec: CharacterSpec, at: THREE.Vector3): void {
    const ch = new CharacterView(this.ctx.assets, spec);
    ch.root.position.copy(at);
    ch.root.scale.setScalar(1.2);
    ch.play('Ranged_Bow_Idle');
    this.nock = ch.prop(BOW.arrow);
    this.nock.visible = false;
    this.mods.add(ch.root);
    this.shooters.push(ch);
  }

  /** What radiant gems give off: embers, frost sparkles, lightning arcs (world FX). */
  private gemFx: GemFx = (kind, at, to) => emitGemFx(this.ctx.fx, kind, at, to);

  /**
   * Towers: the archer on top, and the gems in the windows — one window for each colour. Each gem
   * shows in its window as a mineral of its colour: small and matte when rough, full and glowing
   * when polished, and when radiant too big for its window, alight and alive with its colour.
   * The archer himself never changes; one small emblem of his element (a flame, a snowflake, a
   * lightning bolt, a rune ring, a bomb) drifts slowly round him — nothing more up there.
   */
  private syncGems(): void {
    const b = this.b;
    this.gemKey = gemsKey(b);
    if (!this.shooters.length) this.addShooter(SPECS.archer, new THREE.Vector3(0, this.platformY + 0.2, 0));
    // The stones in their windows (a new one grows into its seat).
    const had = new Map(this.sockets.map((s) => [s.key, s]));
    for (const s of this.sockets) s.frame.removeFromParent();
    this.sockets = b.gems.map((id) => {
      const q = gemLevel(b, id);
      const key = `${id}:${q}`;
      const frame = windowFrame(gemWindow(id));
      const sg = socketGem(id, q, this.glowTex, this.gemFx);
      frame.add(sg.obj);
      this.mods.add(frame);
      return { ...sg, key, frame, popT: had.has(key) ? 1 : 0.001 };
    });
    // The element's emblem (made anew only when the element changes).
    const element = elementOf(b.gems);
    if (element !== this.emblemOf) {
      this.emblem?.obj.removeFromParent();
      this.emblem = makeEmblem(element, this.glowTex);
      this.emblemOf = element;
      if (this.emblem) {
        // About half the archer's height: it should read from the road, not just up close.
        this.emblem.obj.scale.setScalar(2.4);
        this.mods.add(this.emblem.obj);
      }
    }
  }

  /** Every frame: the stones glow and glint, the emblem drifts round the archer. */
  private animateGems(dt: number): void {
    for (const s of this.sockets) {
      s.update(this.time, BuildingView.night);
      if (s.popT < 1) {
        s.popT = Math.min(1, s.popT + dt * 2.2);
        s.obj.scale.setScalar(0.2 + 0.8 * easeOutBack(s.popT, 2.4));
      }
    }
    if (this.emblem) {
      // Round the archer — or, under the turret's roof, round the turret.
      const a = this.time * 0.55;
      const turret = this.topShown === 2;
      const r = turret ? 1.75 : 0.62;
      const cx = this.topShown === 3 ? Math.sin(this.walkYaw) * GALLERY_R : 0;
      const cz = this.topShown === 3 ? Math.cos(this.walkYaw) * GALLERY_R : 0;
      this.emblem.obj.position.set(
        cx + Math.cos(a) * r,
        this.platformY + (turret ? 0.95 : 0.6) + Math.sin(this.time * 1.3) * 0.04,
        cz + Math.sin(a) * r,
      );
      // Its face turned out from the tower, towards whoever is looking at it.
      this.emblem.obj.rotation.y = Math.PI / 2 - a;
      this.emblem.update(this.time, BuildingView.night);
    }
  }

  popIn(): void {
    this.pop = 0.001;
  }

  private hitShake = 0;

  hit(): void {
    this.hitShake = 1;
  }

  /** Seconds the shooters stay at the ready after the last shot. */
  private engaged = 0;
  /** The archer's arrow on the string (shown from the nock to the release). */
  private nock: THREE.Group | null = null;
  /** Since he loosed (−1: not drawing again), how fast he draws, and how far into the draw he is. */
  private bowT = -1;
  private bowK = 1;
  private bowStage = 0;
  private lastShot = -1;
  private shotGap = 0;

  /**
   * A shot: the archer looses (Ranged_Bow_Release), reaches back to his quiver, nocks the next arrow
   * and draws (Ranged_Bow_Draw), then holds at full draw (Ranged_Bow_Aiming_Idle) until the next —
   * the whole of it fitted into the time between his shots.
   */
  onFire(shooter: number, kind: string): void {
    void kind;
    this.engaged = 2.5;
    const archer = this.shooters[0];
    const gap = this.lastShot >= 0 ? this.time - this.lastShot : 1.6;
    this.lastShot = this.time;
    // (A twin amethyst's second bolt leaves with the first: the same draw.)
    if (!archer || this.ducking || (shooter > 0 && gap < 0.05)) return;
    this.shotGap = this.shotGap ? this.shotGap * 0.6 + Math.min(2.5, gap) * 0.4 : Math.min(2.5, gap);
    this.bowK = clamp(BOW.cycle / (0.85 * this.shotGap), 1, 3.2);
    this.bowT = 0;
    this.bowStage = 0;
    archer.once('Ranged_Bow_Release', '', this.bowK, 0.04);
    if (this.nock) this.nock.visible = false;
  }

  /** The archer between shots: loose → nock → draw → hold, or the bow lowered when nothing is in range. */
  private updateArcher(dt: number): void {
    const archer = this.shooters[0];
    if (!archer) return;
    if (this.bowT >= 0) {
      this.bowT += dt;
      const ct = this.bowT * this.bowK;
      if (this.bowStage === 0 && ct >= BOW.reach) {
        this.bowStage = 1;
        archer.once('Ranged_Bow_Draw', 'Ranged_Bow_Aiming_Idle', this.bowK, 0.1, BOW.nock);
        if (this.nock) this.nock.visible = true;
      } else if (this.bowStage === 1 && ct >= BOW.cycle) this.bowT = -1;
    }
  }

  /** World position of the projectile spawn. */
  muzzle(): THREE.Vector3 {
    return new THREE.Vector3(this.b.x, this.root.position.y + this.platformY + 1.0, this.b.z);
  }

  update(dt: number, b: Building): void {
    this.time += dt;
    if (this.pop > 0) {
      this.pop = Math.min(1, this.pop + dt * 2.6);
      const s = easeOutBack(this.pop, 2.2);
      this.root.scale.set(s, 0.4 + 0.6 * s, s);
      if (this.pop >= 1) {
        this.pop = 0;
        this.root.scale.set(1, 1, 1);
      }
    }
    const yaw = Math.atan2(b.aimX - b.x, b.aimZ - b.z) - b.rot;
    this.aimYaw = dampAngle(this.aimYaw, yaw, 9, dt);
    // Nothing in range for a while: lower the bow and stand at ease.
    if (this.engaged > 0) {
      this.engaged -= dt;
      if (this.engaged <= 0) {
        this.bowT = -1;
        for (const s of this.shooters) s.play('Ranged_Bow_Idle', 0.4);
        if (this.nock) this.nock.visible = false;
      }
    }
    const crewSeen =
      !this.shooters.length || (this.ctx.sight?.sees(this.root.position, this.platformY + 2) ?? true);
    // A wraith diving at the open top: the archer ducks down until it has passed.
    if (!!b.harried !== this.ducking) {
      this.ducking = !!b.harried;
      this.bowT = -1;
      if (this.nock) this.nock.visible = false;
      this.shooters[0]?.play(this.ducking ? 'Crouching' : 'Ranged_Bow_Idle', 0.15, this.ducking ? 0.3 : 1);
    }
    this.updateArcher(dt);
    // On the gallery the archer walks round to face his mark; in the turret and on the open top he turns where he stands.
    this.walkYaw = dampAngle(this.walkYaw, this.aimYaw, 2.6, dt);
    for (const s of this.shooters) {
      s.root.visible = crewSeen;
      if (!crewSeen) continue;
      s.root.rotation.y = this.aimYaw;
      if (this.topShown === 3)
        s.root.position.set(
          Math.sin(this.walkYaw) * GALLERY_R,
          this.platformY + 0.05,
          Math.cos(this.walkYaw) * GALLERY_R,
        );
      else s.root.position.set(0, this.platformY + 0.2, 0);
      s.update(dt);
    }
    if (this.saw)
      this.saw.rotation[b.kind === 'hydro' ? 'x' : 'z'] +=
        dt * (b.kind === 'hydro' ? -1.2 : b.busy ? 14 : 0.6);
    // Lamps come on as it gets dark: a bright glass head and a soft halo (painted light, not a real one).
    const on = b.powered ? THREE.MathUtils.smoothstep(BuildingView.night, 0.15, 0.6) : 0;
    if (this.lampHead)
      (this.lampHead.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.15 + on * 3;
    if (this.lampHalo) this.lampHalo.scale.setScalar(on * 1.25 * (0.97 + Math.sin(this.time * 3) * 0.03));
    if (this.glow) {
      const target = (b.busy ? 2.4 : 1.2) * (0.9 + 0.1 * Math.sin(this.time * 7));
      this.glow.scale.setScalar(damp(this.glow.scale.x, target, 6, dt));
    }
    updateBuildingFire(this.ctx, this.root, this.flame, this.time, BuildingView.night, b, dt);
    if (this.hitShake > 0) {
      this.hitShake = Math.max(0, this.hitShake - dt * 4);
      this.model.position.x = Math.sin(this.time * 70) * 0.08 * this.hitShake;
      this.model.rotation.z = Math.sin(this.time * 55) * 0.02 * this.hitShake;
    }
    updateBuildingDamage(this.ctx, this.root, this.platformY, b, dt);
    // The Port: a rocket stands on the pad once a payload is stacked (half-built while it is being stacked).
    if (b.kind === 'port') {
      const show = !!b.ready || !!b.site;
      if (show && !this.rocket) {
        this.rocket = rocketModel();
        this.rocket.position.y = 0.32;
        this.root.add(this.rocket);
      }
      if (this.rocket) {
        this.rocket.visible = show;
        const fairing = this.rocket.getObjectByName('fairing');
        if (fairing) fairing.visible = !!b.ready;
      }
    }
    if (isTower(b.kind)) {
      const dk = (b.devices ?? []).join(',');
      if (dk !== this.deviceKey) this.syncDevices(b);
      for (const d of this.devices)
        d.update(this.time, !!b.devicesOn, BuildingView.night, this.aimYaw - d.yaw);
      if (topOf(b) !== this.topShown) this.swapTop(b);
      if (gemsKey(b) !== this.gemKey) this.syncGems();
      if (crewSeen) this.animateGems(dt);
    }
    // A stand-in until the town's kit streamed in: now the building wears its own model.
    if (this.model.userData['stand'] && this.time % 1 < dt) {
      const m = buildingModel(this.ctx.assets, b.kind, this.topShown);
      if (!m.userData['stand']) {
        this.model.removeFromParent();
        this.model = m;
        this.root.add(m);
        this.boxCache = null;
      }
    }
    if (b.kind in STATIONS) this.updateTrays(b);
    this.updateRoom(dt, b);
  }

  private updateTrays(b: Building): void {
    const key = JSON.stringify([b.input, b.output]);
    if (key === this.trayKey) return;
    this.trayKey = key;
    this.trays.clear();
    const place = (parts: Partial<Record<ItemId, number>>, side: number) => {
      let i = 0;
      for (const k in parts) {
        const n = Math.min(6, parts[k as ItemId] ?? 0);
        for (let j = 0; j < n; j++, i++) {
          const m = itemMesh(k as ItemId, this.ctx.assets);
          m.position.set(side * (1.8 + (i % 3) * 0.32), 0.05 + Math.floor(i / 3) * 0.18, 1.7 + (i % 2) * 0.1);
          m.rotation.y = i * 0.7;
          this.trays.add(m);
        }
      }
    };
    place(b.input, -1);
    place(b.output, 1);
  }

  /** A building you can walk into: its room (made the first time it's needed). */
  room: InteriorView | null = null;

  private updateRoom(dt: number, b: Building): void {
    if (b.interior === undefined) return;
    if (!this.room) {
      this.room = new InteriorView(this.ctx.assets, this.ctx.fx, b, this.glowTex);
      this.ctx.scene.add(this.room.root);
    }
    this.room.update(dt, b, this.ctx.camera);
  }

  dispose(): void {
    for (const s of this.shooters) s.dispose();
    this.room?.dispose();
    this.root.removeFromParent();
  }
}
