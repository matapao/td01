// Material snapshots/glows are appended together with mats during character setup.
export { CLIP_MAP } from './animation-clips.ts';
export { LARGE_CLIPS } from './animation-clips.ts';
export { clipFor } from './animation-clips.ts';
import { clipFor } from './animation-clips.ts';
/**
 * Animated characters: KayKit's 23-bone cast (characters2/, CC0) on one clip library per rig.
 *
 * A character streams in: its view stands at once (an empty root) and fills in the moment its model
 * arrives — never a loading screen. Everything in its hands is a prop from the kits on the hand bones
 * (`handslot.r` / `handslot.l`): weapons, tools, a bow. Parts are merged into one skinned mesh per
 * material on one skeleton, and the materials are the patched matte ones the world uses.
 *
 * Also here: the clip names (the old 1.0 names the game used still play, see CLIP_MAP), the game's
 * cast (SPECS, the shopkeepers) and the weapons a hero carries tier by tier.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAST, patchMaterial, type Assets, type CharacterName, type KitName, type Rig } from './assets.ts';
import { damp } from '../core/math.ts';
import { WEAPONS, weaponTier, type HeroClass, type StoreId, type ToolId } from '../game/content.ts';

// ---- What a character is -------------------------------------------------------------------------

/** A prop in a character's hand: a model from a kit (the weapons kit unless said), on its hand bone. */
export interface Held {
  model: string;
  kit?: KitName;
  hand: 'r' | 'l';
  scale?: number;
  rot?: [number, number, number];
  pos?: [number, number, number];
}

export interface CharacterSpec {
  model: CharacterName;
  scale: number;
  /** Parts of the model left off (a helmet, a hat). */
  hide?: string[];
  /** Props in its hands. */
  held?: Held[];
  /** Skeleton eye glow colour. */
  glow?: string;
  ghost?: boolean;
  tint?: string;
}

/** Model units of a character's height, standing (a Rig_Medium person, a Rig_Large body). */
export const RIG_HEIGHT: Record<Rig, number> = { medium: 2.3, large: 4.2 };

/** How tall a character of `spec` stands in the world. */
export const specHeight = (spec: CharacterSpec): number => RIG_HEIGHT[CAST[spec.model]] * spec.scale;

/** Merged skinned geometry per (character, visible parts, material) — shared by every clone. */
const mergeCache = new Map<string, THREE.BufferGeometry>();

function chainVisible(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

function attrKey(g: THREE.BufferGeometry): string {
  return Object.keys(g.attributes).sort().join(',') + (g.index ? '|i' : '');
}

/**
 * KayKit characters are ~8 skinned meshes with their own skeletons. Merge the visible ones into one
 * skinned mesh per material sharing a single skeleton: far fewer draw calls and bone textures.
 * Hidden parts are dropped.
 */
function mergeSkinned(root: THREE.Object3D, cacheKey: string): void {
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
  });
  const hidden: THREE.Object3D[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !chainVisible(o)) hidden.push(o);
  });
  for (const o of hidden) o.removeFromParent();
  const visible = skinned.filter((m) => !hidden.includes(m));
  if (visible.length < 2) return;
  const skeleton = visible[0]!.skeleton;
  const bindMatrix = visible[0]!.bindMatrix;
  const groups = new Map<string, THREE.SkinnedMesh[]>();
  for (const m of visible) {
    if (!m.bindMatrix.equals(bindMatrix)) continue;
    const key = `${(m.material as THREE.Material).name}|${attrKey(m.geometry)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }
  for (const [key, list] of groups) {
    const ck = `${cacheKey}|${key}|${list.map((m) => m.name).join(',')}`;
    let geo = mergeCache.get(ck);
    if (!geo) {
      geo =
        list.length === 1 ? list[0]!.geometry : (mergeGeometries(list.map((m) => m.geometry)) ?? undefined);
      // (Parts that don't merge stay as they are — never drop a limb.)
      if (!geo) continue;
      mergeCache.set(ck, geo);
    }
    const first = list[0];
    if (!first) continue;
    const merged = new THREE.SkinnedMesh(geo, first.material);
    merged.name = `${first.name}_merged`;
    merged.bind(skeleton, bindMatrix);
    merged.castShadow = true;
    merged.frustumCulled = false;
    first.parent!.add(merged);
    for (const m of list) m.removeFromParent();
  }
  // Anything left (rare): at least share the skeleton.
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh && m.skeleton !== skeleton && m.bindMatrix.equals(bindMatrix))
      m.bind(skeleton, bindMatrix);
  });
}

/**
 * The see-through silhouette: flat red, drawn only where it lies behind something already drawn. It
 * is tested a body's depth nearer the lens than it stands (two model units, scaled with the model), so
 * a character's own arm or shield never shows its body red — only scenery and buildings in front do.
 */
const xrayMat = new THREE.MeshBasicMaterial({
  color: '#ff4a3a',
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
  depthFunc: THREE.GreaterDepth,
  fog: false,
});
xrayMat.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <project_vertex>',
    `#include <project_vertex>
     mvPosition.xyz += normalize(-mvPosition.xyz) * 2.0 * length(modelMatrix[0].xyz);
     gl_Position = projectionMatrix * mvPosition;`,
  );
};

/** A wraith's look: pale, glowing, see-through (its portrait too). */
export const ghostMat = new THREE.MeshLambertMaterial({
  color: '#9fe8ff',
  emissive: '#4fc8ff',
  emissiveIntensity: 0.9,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});

/** A bone by its glTF name ('handslot.r', 'chest' …): three.js drops the dots from node names. */
export function boneOf(model: THREE.Object3D, name: string): THREE.Object3D | null {
  return model.getObjectByName(name.replace(/[.[\]:/]/g, '')) ?? model.getObjectByName(name) ?? null;
}

export class CharacterView {
  private assets: Assets;
  public readonly spec: CharacterSpec;

  readonly root = new THREE.Group();
  /** The model, once it has streamed in (null until then: the view stands, empty). */
  model: THREE.Object3D | null = null;
  readonly rig: Rig;
  private mixer: THREE.AnimationMixer | null = null;
  private waiting: ((model: THREE.Object3D) => void)[] = [];
  private actions = new Map<string, THREE.AnimationAction | null>();
  private current: THREE.AnimationAction | null = null;
  private currentName = '';
  private oneShot: { action: THREE.AnimationAction; then: string; thenScale: number } | null = null;
  /** The loop asked for before the model came (played when it does). */
  private wanted: { name: string; scale: number } | null = null;
  private mats: THREE.MeshLambertMaterial[] = [];
  /** Each material's own glow (a hit flash goes on top of it) and see-through-ness (a fade goes on top of it). */
  private glows: THREE.Color[] = [];
  private looks: { transparent: boolean; opacity: number }[] = [];
  /** See-through silhouettes of this character (drawn only where something hides it). */
  private xray: THREE.Mesh[] = [];
  private xrayOn = false;
  private flash = 0;
  private flashColor = new THREE.Color('#ffffff');
  private speed = 1;
  private gone = false;
  fade = 1;
  private shownFade = 1;
  toolPitch = 0;
  private priorToolPitch = 0;
  private toolChest: THREE.Object3D | null = null;

  constructor(assets: Assets, spec: CharacterSpec) {
    this.assets = assets;
    this.spec = spec;

    this.rig = CAST[spec.model];
    for (const h of spec.held ?? []) this.prop(h);
    if (assets.hasCharacter(spec.model)) this.build();
    else void assets.needCharacter(spec.model).then(() => this.build());
  }

  /** Is the model in? */
  get ready(): boolean {
    return !!this.model;
  }

  /** Runs `fn` with the model as soon as it is in (at once if it is). */
  onReady(fn: (model: THREE.Object3D) => void): void {
    if (this.model) fn(this.model);
    else this.waiting.push(fn);
  }

  /** A bone of the model ('handslot.r', 'chest' …), once it is in. */
  bone(name: string): THREE.Object3D | null {
    return this.model ? boneOf(this.model, name) : null;
  }

  private build(): void {
    if (this.gone || this.model) return;
    const spec = this.spec;
    const model = this.assets.character(spec.model);
    if (!model) return;
    model.scale.setScalar(spec.scale);
    const hide = new Set(spec.hide ?? []);
    if (hide.size) model.traverse((o) => void (hide.has(o.name) && (o.visible = false)));
    mergeSkinned(model, `${spec.model}|${[...hide].sort().join(',')}`);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false;
      if (spec.ghost) {
        m.material = ghostMat;
        m.castShadow = false;
        return;
      }
      const src = m.material as THREE.MeshLambertMaterial;
      const mat = src.clone();
      if (src.name === 'Glow' && spec.glow) {
        mat.color.set(spec.glow);
        mat.emissive.set(spec.glow);
        mat.emissiveIntensity = 0.9;
      } else if (spec.tint) {
        mat.color.multiply(new THREE.Color(spec.tint));
      }
      patchMaterial(mat, { fog: false, rim: true });
      m.material = mat;
      this.addMat(mat);
    });
    this.root.add(model);
    this.model = model;
    const mixer = (this.mixer = new THREE.AnimationMixer(model));
    mixer.timeScale = this.speed;
    mixer.addEventListener('finished', (e) => {
      if (this.oneShot && e.action === this.oneShot.action) {
        const { then, thenScale } = this.oneShot;
        this.oneShot = null;
        if (then) this.play(then, 0.15, thenScale);
      }
    });
    const w = this.wanted;
    this.wanted = null;
    if (w) this.play(w.name, 0, w.scale);
    if (this.xrayOn) this.setXray(true);
    for (const fn of this.waiting.splice(0)) fn(model);
  }

  private addMat(mat: THREE.MeshLambertMaterial): void {
    this.mats.push(mat);
    this.glows.push(mat.emissive.clone());
    this.looks.push({ transparent: mat.transparent, opacity: mat.opacity });
  }

  /**
   * A prop from a kit in one hand. The group comes back at once (show or hide it as you like); it goes
   * on the hand bone when the model is in, and its model in when the kit is.
   */
  prop(h: Held): THREE.Group {
    const g = new THREE.Group();
    g.name = `held:${h.model}`;
    const kit = h.kit ?? 'weapons';
    const fill = () => {
      if (this.gone || !this.assets.has(kit, h.model) || g.children.length) return;
      const m = this.assets.model(kit, h.model);
      if (h.scale) m.scale.setScalar(h.scale);
      if (h.rot) m.rotation.set(...h.rot);
      if (h.pos) m.position.set(...h.pos);
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        const mat = (mesh.material as THREE.MeshLambertMaterial).clone();
        patchMaterial(mat, { fog: false });
        mesh.material = mat;
        this.addMat(mat);
      });
      g.add(m);
    };
    if (this.assets.has(kit, h.model)) fill();
    else void this.assets.loadKit(kit).then(fill);
    this.onReady(() => this.bone(`handslot.${h.hand}`)?.add(g));
    return g;
  }

  /** Anything (a drone controller, a sack) on a bone, once the model is in. */
  attach(bone: string, obj: THREE.Object3D): void {
    this.onReady(() => this.bone(bone)?.add(obj));
  }

  /**
   * A see-through silhouette for whatever part of the character something stands in front of
   * (the D3 / WoW way: you always see what can hit you). Made the first time it's wanted; it shares
   * the character's mesh and skeleton, so it costs one more draw per part while on.
   */
  setXray(on: boolean): void {
    this.xrayOn = on;
    if (!this.model) return;
    if (on && !this.xray.length) {
      const parts: THREE.Mesh[] = [];
      this.model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.visible) parts.push(m);
      });
      for (const m of parts) {
        const sm = m as THREE.SkinnedMesh;
        let x: THREE.Mesh;
        if (sm.isSkinnedMesh) {
          const s = new THREE.SkinnedMesh(sm.geometry, xrayMat);
          s.bind(sm.skeleton, sm.bindMatrix);
          x = s;
        } else x = new THREE.Mesh(m.geometry, xrayMat);
        x.position.copy(m.position);
        x.quaternion.copy(m.quaternion);
        x.scale.copy(m.scale);
        x.frustumCulled = false;
        x.renderOrder = 6;
        m.parent?.add(x);
        this.xray.push(x);
      }
    }
    for (const x of this.xray) x.visible = on;
  }

  /** Does the rig's library have (something for) this clip? */
  hasClip(name: string): boolean {
    return !!clipFor(this.assets, this.rig, name);
  }

  private action(name: string): THREE.AnimationAction | null {
    if (!this.mixer) return null;
    let a = this.actions.get(name);
    if (a === undefined) {
      const clip = clipFor(this.assets, this.rig, name);
      a = clip ? this.mixer.clipAction(clip) : null;
      this.actions.set(name, a);
    }
    return a;
  }

  /** Loop a clip (crossfades from the current one); `from`: where in it to start. */
  play(name: string, fade = 0.18, timeScale = 1, from = 0): void {
    if (!this.mixer) {
      this.wanted = { name, scale: timeScale };
      return;
    }
    if (this.oneShot) {
      this.oneShot.then = name;
      this.oneShot.thenScale = timeScale;
      return;
    }
    if (name === this.currentName && this.current) {
      this.current.timeScale = timeScale;
      return;
    }
    const a = this.action(name);
    if (!a) return;
    a.reset();
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = false;
    a.timeScale = timeScale;
    a.time = from;
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, fade, false);
    a.play();
    this.current = a;
    this.currentName = name;
  }

  /**
   * Play a clip once, then go back to `then` (or hold the last frame if `then` is empty). A clip the
   * rig doesn't have goes straight to `then`.
   */
  once(name: string, then: string, timeScale = 1, fade = 0.08, from = 0): void {
    if (!this.mixer) {
      if (then) this.wanted = { name: then, scale: 1 };
      return;
    }
    const a = this.action(name);
    if (!a) {
      if (then) this.play(then, fade);
      return;
    }
    if (this.oneShot && this.oneShot.action !== a) this.oneShot.action.fadeOut(fade);
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = timeScale;
    a.time = from;
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, fade, false);
    a.play();
    this.current = a;
    this.currentName = name;
    this.oneShot = { action: a, then, thenScale: 1 };
  }

  /** A one-shot is playing. */
  get busy(): boolean {
    return !!this.oneShot;
  }

  get clipName(): string {
    return this.currentName;
  }

  /** Where in the current clip it is (s), and its length. */
  get clipTime(): number {
    return this.current?.time ?? 0;
  }

  set clipTime(t: number) {
    if (this.current) this.current.time = t;
  }

  get clipLength(): number {
    return this.current?.getClip().duration ?? 0;
  }

  /** How fast everything plays (0 frozen). */
  set timeScale(v: number) {
    this.speed = v;
    if (this.mixer) this.mixer.timeScale = v;
  }

  hit(color = '#ffffff', strength = 1): void {
    this.flash = strength;
    this.flashColor.set(color);
  }

  update(dt: number): void {
    if (!this.mixer) return;
    if (this.toolChest && this.priorToolPitch) this.toolChest.rotateX(-this.priorToolPitch);
    this.mixer.update(dt);
    if (this.toolPitch || this.priorToolPitch) {
      this.toolChest ??= this.model?.getObjectByName('chest') ?? null;
      this.toolChest?.rotateX(this.toolPitch);
      this.priorToolPitch = this.toolPitch;
    }
    if (this.flash > 0 || this.fade < 1 || this.fade !== this.shownFade) {
      this.shownFade = this.fade;
      // A hit flash fades out (and stops: the last pass leaves only the material's own glow).
      this.flash = this.flash > 0.002 ? damp(this.flash, 0, 14, dt) : 0;
      this.mats.forEach((m, i) => {
        if (m.name === 'Glow') return;
        m.emissive
          .copy(this.flashColor)
          .multiplyScalar(this.flash * 0.9)
          .add(this.glows[i]!);
        m.transparent = this.looks[i]!.transparent || this.fade < 1;
        m.opacity = this.looks[i]!.opacity * this.fade;
      });
    }
  }

  dispose(): void {
    this.gone = true;
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
    for (const m of this.mats) m.dispose();
  }
}

// ---- The cast ------------------------------------------------------------------------------------

/**
 * Character scale. A person is about half a world unit tall, so the keep (~14 units), towers
 * (~6), houses (~3–4) and trees (~5) stand around them at heroic, WoW-like proportions.
 */
export const CHAR = 0.3;
/** Height of a person (the hero, a footman, a skeleton) in world units. */
export const PERSON = 0.5;
/** Rig_Large bodies are nearly twice a person's size in model units: at this scale one stands as tall as a hero. */
const LARGE = 0.7 * CHAR * (RIG_HEIGHT.medium / RIG_HEIGHT.large);

export const SPECS = {
  // The heroes, one per class (their weapons and tools are put in their hands by HeroView).
  hero: { model: 'Barbarian', scale: 0.7 * CHAR } as CharacterSpec,
  heroTank: { model: 'Knight', scale: 0.7 * CHAR } as CharacterSpec,
  heroMagic: { model: 'Mage', scale: 0.7 * CHAR } as CharacterSpec,
  // The towers' soldiers: footmen in the Knight's mail, a captain in the Paladin's.
  footman: {
    model: 'Knight',
    scale: 0.6 * CHAR,
    hide: ['Knight_Cape'],
    held: [
      { model: 'sword_B', hand: 'r' },
      { model: 'shield_B', hand: 'l' },
    ],
  } as CharacterSpec,
  captain: {
    model: 'Paladin_with_Helmet',
    scale: 0.72 * CHAR,
    held: [{ model: 'sword_2handed', hand: 'r' }],
  } as CharacterSpec,
  // A porter from the vale, who brings a plan's parts when they are bought outright…
  porter: { model: 'Farmer_B', scale: 0.6 * CHAR } as CharacterSpec,
  // …and once the vale has invented robots, a robot brings them (one or the other).
  porterRobot: { model: 'Robot_One', scale: 0.6 * CHAR } as CharacterSpec,
  porterRobot2: { model: 'Robot_Two', scale: 0.6 * CHAR } as CharacterSpec,
  // A hero in Space: the space ranger, helmet on (there's no air out there), the jetpack's wings folded.
  spaceHero: {
    model: 'SpaceRanger_FlightMode',
    scale: 0.7 * CHAR,
    hide: ['SpaceRanger_JetPack_WingLeft', 'SpaceRanger_JetPack_WingRight'],
  } as CharacterSpec,
  // The tower's archer: a ranger with a bow (and an arrow on the string while he draws).
  archer: {
    model: 'Ranger',
    scale: 0.62 * CHAR,
    held: [{ model: 'bow_withString', hand: 'l' }],
  } as CharacterSpec,
  // The dead.
  minion: {
    model: 'Skeleton_Warrior',
    scale: 0.72 * CHAR,
    glow: '#7fd8ff',
    held: [{ kit: 'gear', model: 'Skeleton_Blade', hand: 'r' }],
  } as CharacterSpec,
  runner: {
    model: 'Skeleton_Rogue',
    scale: 0.72 * CHAR,
    glow: '#ffe066',
    held: [
      { model: 'Skeleton_Dagger', hand: 'r' },
      { model: 'Skeleton_Dagger', hand: 'l' },
    ],
  } as CharacterSpec,
  warrior: {
    model: 'Skeleton_Warrior',
    scale: 0.84 * CHAR,
    glow: '#ff9a3c',
    held: [
      { kit: 'gear', model: 'Skeleton_Axe', hand: 'r' },
      { kit: 'gear', model: 'Skeleton_Shield_Large_A', hand: 'l' },
    ],
  } as CharacterSpec,
  necromancer: {
    model: 'Necromancer',
    scale: 0.78 * CHAR,
    glow: '#7dff6a',
    held: [{ kit: 'gear', model: 'Skeleton_Staff', hand: 'r' }],
  } as CharacterSpec,
  wraith: { model: 'Skeleton_Mage', scale: 0.78 * CHAR, ghost: true } as CharacterSpec,
  // The Bone Crusher: a skeleton golem, a head taller than a person, with a mace for walls.
  crusher: {
    model: 'Skeleton_Golem',
    scale: 1.45 * LARGE,
    glow: '#ff6a2a',
    tint: '#a9a4ac',
    held: [{ model: 'Skeleton_Mace_Large', hand: 'r' }],
  } as CharacterSpec,
  digger: {
    model: 'Skeleton_Rogue',
    scale: 0.74 * CHAR,
    glow: '#d9a35a',
    tint: '#c9b08a',
    held: [{ kit: 'tools', model: 'shovel', hand: 'r', rot: [Math.PI, 0, 0] }],
  } as CharacterSpec,
  lich: {
    model: 'Skeleton_Mage',
    scale: 1.1 * CHAR,
    glow: '#a6ff4d',
    tint: '#b9c7ff',
    held: [{ kit: 'gear', model: 'Skeleton_Staff', hand: 'r' }],
  } as CharacterSpec,
  // The Bone Colossus: the golem at boss size, its axe and a shield.
  colossus: {
    model: 'Skeleton_Golem',
    scale: 2.6 * LARGE,
    glow: '#ff3b2f',
    tint: '#d9c9b5',
    held: [
      { model: 'Skeleton_Golem_Axe_Large', hand: 'r' },
      { model: 'Skeleton_Shield_Large_B', hand: 'l', scale: 2 },
    ],
  } as CharacterSpec,
  // Down the mine: wolves in the old workings, tunnel raiders with their axes, golems of the rock itself.
  wolf: { model: 'Werewolf_Wolf', scale: 0.56 * CHAR, tint: '#b3aaa2' } as CharacterSpec,
  orc: {
    model: 'OrcRaider',
    scale: 0.64 * CHAR,
    held: [{ kit: 'mine', model: 'OrcRaider_Axe', hand: 'r' }],
  } as CharacterSpec,
  golem: { model: 'FrostGolem', scale: 1.5 * LARGE, tint: '#c9b89c', glow: '#ffb347' } as CharacterSpec,
};

/** The shopkeepers: who keeps each store, and which way they face (each keeps the store's own trade). */
export const VENDORS: Record<StoreId, { spec: CharacterSpec; rot: number }> = {
  // Trader Wynn's everyday goods: a farmer from the vale.
  market: { spec: { model: 'Farmer_A', scale: 0.62 * CHAR }, rot: 0 },
  // Smith Hilde: bare-headed in her mail, hammer in hand.
  smithy: {
    spec: {
      model: 'Knight',
      scale: 0.62 * CHAR,
      hide: ['Knight_Helmet', 'Knight_HelmetVisor'],
      held: [{ kit: 'tools', model: 'hammer', hand: 'r' }],
    },
    rot: 1.2,
  },
  // Sister Vey of the Arcane Emporium.
  arcane: { spec: { model: 'Cleric', scale: 0.62 * CHAR }, rot: 0.2 },
  // Master Oren of the Builders' Guild: an old master of plans.
  guild: { spec: { model: 'Lorekeeper', scale: 0.62 * CHAR }, rot: 0.1 },
  // Brunni Ironfoot of the Dwarven Trading Post: short, goggled, red-bearded.
  dwarven: {
    spec: { model: 'Engineer', scale: 0.5 * CHAR, held: [{ model: 'engineer_Wrench', hand: 'r' }] },
    rot: 2.6,
  },
};

/** Each class's hero. */
export const HERO_SPEC: Record<HeroClass, CharacterSpec> = {
  tank: SPECS.heroTank,
  support: SPECS.hero,
  magic: SPECS.heroMagic,
};

/** The props of a class's weapon at a tier: the main hand, and the Knight's shield. */
export function weaponProps(cls: HeroClass, tier: number): [Held, ...Held[]] {
  const t = WEAPONS[cls].tiers[Math.max(0, Math.min(tier, WEAPONS[cls].tiers.length - 1))];
  if (!t) throw new Error(`Missing weapon tier ${cls}:${tier}`);
  return [{ model: t.model, hand: 'r' }, ...(t.shield ? [{ model: t.shield, hand: 'l' } as Held] : [])];
}

/** The weapon props a hero carries now. */
export const heroWeapon = (h: { cls?: HeroClass; weaponTier?: number }): Held[] =>
  weaponProps(h.cls ?? 'tank', weaponTier(h));

/** Hand tools (RPG Tools Bits) as they sit in the hand: the shovel's blade turned to the ground. */
export const TOOL_HELD: Record<ToolId | 'saw' | 'mallet', Held> = {
  scanner: { kit: 'tools', model: 'wrench_A', hand: 'r' },
  seedPouch: { kit: 'tools', model: 'bucket', hand: 'r' },
  axe: { kit: 'tools', model: 'axe', hand: 'r' },
  pickaxe: { kit: 'tools', model: 'pickaxe', hand: 'r' },
  hammer: { kit: 'tools', model: 'hammer', hand: 'r' },
  shovel: { kit: 'tools', model: 'shovel', hand: 'r', rot: [Math.PI, 0, 0] },
  saw: { kit: 'tools', model: 'saw', hand: 'r', rot: [0, Math.PI, 0] },
  mallet: { kit: 'tools', model: 'mallet', hand: 'r' },
};

/**
 * Once the world is up: fetch the rest of the cast in the background (the heroes' weapons first,
 * then everyone the game shows), so whoever turns up next is already in — nothing waits for it.
 */
export function prefetchCast(assets: Assets): void {
  void assets.loadKit('weapons');
  const names = new Set<CharacterName>(
    [...Object.values(SPECS), ...Object.values(VENDORS).map((v) => v.spec)].map((s) => s.model),
  );
  for (const n of names) void assets.needCharacter(n);
}
