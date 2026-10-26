/** Renders HUD icons from the real 3D models (items, buildings, enemies, hero). */
import * as THREE from 'three';
import { worldUniforms, type Assets } from '../view/assets.ts';
import { buildingModel } from '../view/entity/building-model.ts';
import { itemMesh } from '../view/itemmodels.ts';
import { CAST } from '../view/assets.ts';
import {
  HERO_SPEC,
  SPECS,
  boneOf,
  clipFor,
  ghostMat,
  weaponProps,
  type CharacterSpec,
  type Held,
} from '../view/characters.ts';
import { gemStone } from '../view/gems.ts';
import { deviceModel } from '../view/devices.ts';
import { payloadModel } from '../view/rockets.ts';
import { provideCardArt } from './card-art-source.ts';
import type { PayloadId } from '../game/space.ts';
import {
  CLASS_ORDER,
  ITEM_ORDER,
  PLANS,
  type DeviceId,
  type GemId,
  type GemLevel,
  type TopLevel,
  type BuildingKind,
  type EnemyKind,
  type HeroClass,
  type ItemId,
  type PlanId,
} from '../game/content.ts';

/** A transparent pixel: a portrait whose model is still streaming in. */
export const BLANK =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export class Icons {
  private assets: Assets;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
  private cache = new Map<string, string>();
  private size = 128;

  constructor(assets: Assets) {
    this.assets = assets;

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(this.size, this.size);
    this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene.add(new THREE.HemisphereLight('#dfeaff', '#5a4a3a', 1.8));
    const sun = new THREE.DirectionalLight('#fff0d8', 2.6);
    sun.position.set(-2, 4, 3);
    this.scene.add(sun);
    provideCardArt(() => this.punchCard());
  }

  /** `fit`: frame these parts only (a portrait frames the body, not the sword it points at you). */
  private shoot(
    key: string,
    obj: THREE.Object3D,
    tilt = 0.5,
    yaw = 0.6,
    pad = 1.15,
    fit?: THREE.Object3D[],
  ): string {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const holder = new THREE.Group();
    holder.add(obj);
    holder.rotation.y = yaw;
    this.scene.add(holder);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3();
    if (fit?.length) for (const o of fit) box.expandByObject(o);
    else box.setFromObject(holder);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const d = (r * pad) / Math.sin((this.camera.fov * Math.PI) / 360);
    this.camera.position.set(c.x, c.y + Math.sin(tilt) * d, c.z + Math.cos(tilt) * d);
    this.camera.lookAt(c);
    this.renderer.setClearColor(0x000000, 0);
    // Icons are studio shots with their own lights and no fog of war.
    const fogOn = worldUniforms.uFogOn.value;
    worldUniforms.uFogOn.value = 0;
    this.renderer.render(this.scene, this.camera);
    worldUniforms.uFogOn.value = fogOn;
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(holder);
    this.cache.set(key, url);
    return url;
  }

  item(id: ItemId | 'gold'): string {
    return this.shoot(`item:${id}`, itemMesh(id, this.assets), 0.75, 0.5, 1.05);
  }

  building(kind: BuildingKind): string {
    return this.shoot(`b:${kind}`, buildingModel(this.assets, kind), 0.42, 0.65, 0.95);
  }

  /** Kits a portrait waited for (their props are in, or not in them at all). */
  private kitsIn = new Set<string>(['gear', 'tools', 'medieval', 'dungeon', 'resources', 'halloween']);

  /**
   * A portrait from a character's model (the 23-bone cast), holding its props, in a pose. Until the
   * model has streamed in it is an empty frame (not kept — ask again); props whose kit is still on its
   * way are left out unless `waitProps`.
   */
  character(
    key: string,
    spec: CharacterSpec,
    clip = 'Idle_A',
    props: Held[] = spec.held ?? [],
    waitProps = true,
  ): string {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const pending = props.filter(
      (p) => !this.kitsIn.has(p.kit ?? 'weapons') && !this.assets.has(p.kit ?? 'weapons', p.model),
    );
    for (const p of pending) {
      const kit = p.kit ?? 'weapons';
      void this.assets.loadKit(kit).then(() => this.kitsIn.add(kit));
    }
    if (!this.assets.hasCharacter(spec.model) || (waitProps && pending.length)) {
      void this.assets.needCharacter(spec.model);
      return BLANK;
    }
    const ch = this.assets.character(spec.model)!;
    const hide = new Set(spec.hide ?? []);
    const body: THREE.Object3D[] = [];
    ch.traverse((o) => {
      if (hide.has(o.name)) o.visible = false;
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) body.push(m);
      const src = m.material as THREE.MeshLambertMaterial;
      if (spec.ghost) m.material = ghostMat;
      else if (spec.glow && src.name === 'Glow') {
        const mat = src.clone();
        mat.color.set(spec.glow);
        mat.emissive.set(spec.glow);
        m.material = mat;
      } else if (spec.tint && src.name !== 'Glow') {
        const mat = src.clone();
        mat.color.multiply(new THREE.Color(spec.tint));
        m.material = mat;
      }
    });
    for (const p of props) {
      const kit = p.kit ?? 'weapons';
      const bone = boneOf(ch, `handslot.${p.hand}`);
      if (!bone || !this.assets.has(kit, p.model)) continue;
      const m = this.assets.model(kit, p.model);
      if (p.scale) m.scale.setScalar(p.scale);
      if (p.rot) m.rotation.set(...p.rot);
      if (p.pos) m.position.set(...p.pos);
      bone.add(m);
    }
    const c = clipFor(this.assets, CAST[spec.model], clip);
    if (c) {
      const mixer = new THREE.AnimationMixer(ch);
      mixer.clipAction(c).play();
      mixer.update(0.4);
    }
    // Portrait: frame the upper body.
    const g = new THREE.Group();
    g.add(ch);
    return this.shoot(
      key,
      g,
      0.18,
      0.4,
      0.62,
      body.filter((m) => m.visible),
    );
  }

  enemy(kind: EnemyKind): string {
    return this.character(`e:${kind}`, SPECS[kind]);
  }

  /** A tower's soldier (a footman, the captain). */
  unit(kind: 'footman' | 'captain'): string {
    return this.character(`u:${kind}`, SPECS[kind]);
  }

  /** A class's hero (the Warchief by default) with its weapon at a tier — bare-handed until the weapons are in. */
  hero(cls: HeroClass = 'support', tier = 0): string {
    const armed = this.character(`hero:${cls}:${tier}`, HERO_SPEC[cls], 'Idle_A', weaponProps(cls, tier));
    return armed !== BLANK ? armed : this.character(`hero:${cls}:bare`, HERO_SPEC[cls], 'Idle_A', []);
  }

  /** A class's weapon at a tier, as it hangs on the smith's wall (the Knight's with its shield). Empty until the weapons are in. */
  weapon(cls: HeroClass, tier: number): string {
    const key = `w:${cls}:${tier}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const props = weaponProps(cls, tier);
    if (props.some((p) => !this.assets.has('weapons', p.model))) {
      void this.assets.loadKit('weapons');
      return BLANK;
    }
    const g = new THREE.Group();
    const main = this.assets.model('weapons', props[0].model);
    main.rotation.z = -0.55;
    g.add(main);
    if (props[1]) {
      const shield = this.assets.model('weapons', props[1].model);
      shield.position.set(-0.5, 0.45, -0.3);
      shield.scale.setScalar(0.85);
      g.add(shield);
    }
    this.assets.patchTree(g, { fog: false });
    return this.shoot(key, g, 0.2, 0.5, 0.95);
  }

  /** A gem variant: its stone as it sits in a tower window, at a grade (polished unless said). */
  gem(id: GemId, q: GemLevel = 2): string {
    const g = gemStone(id, q);
    g.rotation.x = -0.35;
    return this.shoot(`g:${id}:${q}`, g, 0.25, 0.35, 0.95);
  }

  plan(id: PlanId): string {
    const p = PLANS[id];
    return p.type === 'building'
      ? this.building(p.building)
      : p.type === 'top'
        ? this.tower(p.level)
        : p.type === 'device'
          ? this.device(p.id)
          : p.type === 'payload'
            ? this.payload(p.id)
            : p.type === 'upgrade'
              ? this.item('magnet')
              : this.gem(p.id);
  }

  /** A payload for Space, as it stands at the base. */
  payload(id: PayloadId): string {
    return this.shoot(`p:${id}`, payloadModel(id), 0.4, 0.7, 1.1);
  }

  /** A tower device, as it stands out of its window. */
  device(id: DeviceId): string {
    const v = deviceModel(id, new THREE.Texture());
    v.update(0.4, true, 0, 0);
    return this.shoot(`d:${id}`, v.obj, 0.35, 0.7, 1.05);
  }

  /** A tower with one of its tops. */
  tower(top: TopLevel): string {
    return this.shoot(`t:${top}`, buildingModel(this.assets, 'tower', top), 0.42, 0.65, 0.95);
  }

  /**
   * The punched cards' art (the decide minigame, see minigames/cardart.ts): Board Game Bits' blank
   * card lying face up, long side across, seen from above and a little in front (so its edge shows),
   * square-on without perspective so it can be stretched to any card's size. Bigger than an icon.
   */
  async punchCard(): Promise<string | null> {
    await this.assets.loadKit('cards');
    if (!this.assets.has('cards', 'card_base')) return null;
    const card = this.assets.model('cards', 'card_base');
    // Card stock rather than a playing card: a little thicker, so its edge shows.
    card.scale.set(1, 1, 4);
    card.rotation.set(-Math.PI / 2, Math.PI / 2, 0, 'YXZ');
    this.scene.add(card);
    card.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(card);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // A lamp over its top left corner: the light falls off across the card.
    const lamp = new THREE.PointLight('#fff6e6', 40, 0, 2);
    lamp.position.set(c.x - size.x * 0.45, c.y + 3.2, c.z - size.z * 0.4);
    this.scene.add(lamp);
    const [w, h] = [256, 192];
    const half = (size.x / 2) * 1.04;
    const cam = new THREE.OrthographicCamera(-half, half, (half * h) / w, (-half * h) / w, 0.1, 100);
    cam.position.set(c.x, c.y + 10 * Math.cos(0.5), c.z + 10 * Math.sin(0.5));
    cam.lookAt(c);
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.render(this.scene, cam);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.renderer.setSize(this.size, this.size);
    this.scene.remove(card, lamp);
    lamp.dispose();
    return url;
  }

  /** Pre-render everything once (keeps the HUD snappy). */
  warm(): void {
    for (const i of ITEM_ORDER) this.item(i);
    this.item('gold');
    for (const id of Object.keys(PLANS) as PlanId[]) this.plan(id);
    // The dead as their models stream in; the heroes as they are (bare-handed until the weapons are in).
    for (const k of [
      'minion',
      'runner',
      'warrior',
      'necromancer',
      'wraith',
      'crusher',
      'digger',
      'lich',
      'colossus',
      'wolf',
      'orc',
      'golem',
    ] as EnemyKind[]) {
      void this.assets.needCharacter(SPECS[k].model).then(() => this.enemy(k));
    }
    for (const c of CLASS_ORDER) this.hero(c);
    void this.assets.loadKit('weapons').then(() => {
      this.kitsIn.add('weapons');
      for (const c of CLASS_ORDER) this.hero(c);
    });
  }
}
