/**
 * Loads the KayKit CC0 kits + characters and hands out clones / instancing data.
 * Also owns the shared world-material patch (fog of war, rim light, wind sway).
 */
import * as THREE from 'three';
import { buildTreeKit } from './treegen.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/** 'town': the town's houses, farms and the workshops' rooms (streamed in after the world, like 'mine' and the rest past the first six). */
export type KitName =
  | 'medieval'
  | 'halloween'
  | 'dungeon'
  | 'gear'
  | 'resources'
  | 'tools'
  | 'trees'
  | 'space'
  | 'weapons'
  | 'bits'
  | 'cards'
  | 'mine'
  | 'town';
/** The kits downloaded at start (trees are generated in code). */
const KITS: KitName[] = ['medieval', 'halloween', 'dungeon', 'gear', 'resources', 'tools'];

/** The two KayKit rigs: people (Rig_Medium) and big bodies (Rig_Large). One clip library each. */
export type Rig = 'medium' | 'large';
/**
 * The cast: KayKit's 23-bone characters (characters2/, CC0), each on its rig. They are skinned meshes
 * only — weapons and tools are props from the kits, put in their hands — and one clip library per rig
 * drives them all.
 */
export const CAST = {
  Barbarian: 'medium',
  Druid: 'medium',
  Engineer: 'medium',
  Knight: 'medium',
  Mage: 'medium',
  Ranger: 'medium',
  Rogue: 'medium',
  Rogue_Hooded: 'medium',
  Necromancer: 'medium',
  Skeleton_Mage: 'medium',
  Skeleton_Minion: 'medium',
  Skeleton_Rogue: 'medium',
  Skeleton_Warrior: 'medium',
  OrcRaider: 'medium',
  Werewolf_Man: 'medium',
  Werewolf_Wolf: 'medium',
  Vampire: 'medium',
  Witch: 'medium',
  Paladin: 'medium',
  Paladin_with_Helmet: 'medium',
  Cleric: 'medium',
  Lorekeeper: 'medium',
  Farmer_A: 'medium',
  Farmer_B: 'medium',
  Caveman: 'medium',
  Tiefling: 'medium',
  Ninja: 'medium',
  PlantWarrior: 'medium',
  AvianSwordsman: 'medium',
  Hoarder: 'medium',
  Robot_One: 'medium',
  Robot_Two: 'medium',
  CombatMech: 'medium',
  SpaceRanger: 'medium',
  SpaceRanger_FlightMode: 'medium',
  Barbarian_Large: 'large',
  Skeleton_Golem: 'large',
  OrcBrute: 'large',
  BlackKnight: 'large',
  FrostGolem: 'large',
  Monstrosity: 'large',
  Clanker: 'large',
  '4GTN': 'large',
  '4GTN_Forgotten': 'large',
} as const satisfies Record<string, Rig>;
export type CharacterName = keyof typeof CAST;
/** Loaded with the world: the heroes. Everyone else streams in when first wanted (see needCharacter). */
const FIRST_CAST: CharacterName[] = ['Knight', 'Barbarian', 'Mage'];

export interface MeshPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Transform relative to the model root. */
  matrix: THREE.Matrix4;
}

/** Uniforms shared by every patched material. */
export const worldUniforms = {
  uTime: { value: 0 },
  uFogTex: { value: null as THREE.Texture | null },
  uFogNoise: { value: null as THREE.Texture | null },
  uFogMin: { value: new THREE.Vector2(0, 0) },
  uFogSize: { value: new THREE.Vector2(1, 1) },
  uFogOn: { value: 1 },
  uRim: { value: new THREE.Color('#ffe8c8').multiplyScalar(0.22) },
  uWind: { value: 1 },
  /** The grade applied to every world model (set by lighting.ts). */
  uModelTint: { value: new THREE.Color('#ffffff') },
  uModelDesat: { value: 0 },
  uGlow: { value: 1 },
  /** Colour of the mist over unexplored land (follows the haze). */
  uMist: { value: new THREE.Color('#8796a6') },
  /** Colour grading, done in the materials (no post-processing pass): set by lighting.ts. */
  uSaturation: { value: 1.12 },
  uContrast: { value: 1.06 },
  uWarm: { value: new THREE.Vector3(1.04, 1.0, 0.94) },
  uCool: { value: new THREE.Vector3(0.92, 0.97, 1.08) },
};

/** GLSL for the grading above (on gl_FragColor, before tone mapping). */
export const GRADE_GLSL = `{
  float gl = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor.rgb *= mix(uCool, uWarm, smoothstep(0.02, 0.6, gl));
  gl_FragColor.rgb = mix(vec3(gl), gl_FragColor.rgb, uSaturation);
  gl_FragColor.rgb = max(vec3(0.0), (gl_FragColor.rgb - 0.18) * uContrast + 0.18);
}`;
export const GRADE_DECL =
  'uniform float uSaturation; uniform float uContrast; uniform vec3 uWarm; uniform vec3 uCool;';

export interface PatchOptions {
  fog?: boolean;
  rim?: boolean;
  sway?: number;
}

/**
 * The shared world look, injected into every standard material: a painted finish (darker bases,
 * lighter tops, brush noise, a little colour drift per object), matte surfaces, a soft rim light,
 * mist over unexplored land and wind sway. Geometry remains opaque at every camera distance.
 * Shares one program per option set.
 */
const lambertOf = new WeakMap<THREE.Material, THREE.Material>();

/**
 * The cheap, matte stand-in for a loaded PBR material: same colour, texture, glow and transparency,
 * lit with a simple Lambert term (mediocre laptops first). Shared materials stay shared.
 */
export function toLambert(src: THREE.Material): THREE.Material {
  const s = src as THREE.MeshStandardMaterial;
  if (!s.isMeshStandardMaterial) return src;
  let m = lambertOf.get(src);
  if (!m) {
    const l = new THREE.MeshLambertMaterial({
      name: s.name,
      color: s.color,
      map: s.map,
      vertexColors: s.vertexColors,
      emissive: s.emissive,
      emissiveMap: s.emissiveMap,
      emissiveIntensity: s.emissiveIntensity,
      transparent: s.transparent,
      opacity: s.opacity,
      alphaTest: s.alphaTest,
      alphaMap: s.alphaMap,
      side: s.side,
      flatShading: s.flatShading,
      depthWrite: s.depthWrite,
    });
    l.userData = { ...s.userData };
    lambertOf.set(src, (m = l));
  }
  return m;
}

export function patchMaterial<T extends THREE.Material>(mat: T, o: PatchOptions = {}): T {
  const fog = o.fog ?? true;
  const rim = o.rim ?? true;
  const sway = o.sway ?? 0;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms);
    shader.uniforms['uSway'] = { value: sway };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uSway;
         uniform float uWind;
         varying vec3 vFogWorld;
         varying vec3 vOrigin;
         varying vec3 vNormalW;
         varying float vScaleY;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         #ifdef USE_SWAY
         {
           vec4 swayBase = vec4(0.0, 0.0, 0.0, 1.0);
           #ifdef USE_INSTANCING
           swayBase = instanceMatrix * swayBase;
           #endif
           swayBase = modelMatrix * swayBase;
           float ph = swayBase.x * 0.37 + swayBase.z * 0.23;
           float h = max(position.y, 0.0);
           float bend = (sin(uTime * 1.7 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.25) * uSway * uWind * h * h;
           transformed.x += bend;
           transformed.z += bend * 0.6;
         }
         #endif`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
         {
           vec4 fw = vec4(transformed, 1.0);
           vec4 fo = vec4(0.0, 0.0, 0.0, 1.0);
           mat3 nm = mat3(modelMatrix);
           #ifdef USE_INSTANCING
           fw = instanceMatrix * fw;
           fo = instanceMatrix * fo;
           nm = nm * mat3(instanceMatrix);
           #endif
           vFogWorld = (modelMatrix * fw).xyz;
           vOrigin = (modelMatrix * fo).xyz;
           vScaleY = length(nm[1]);
           vNormalW = normalize(nm * objectNormal);
         }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D uFogTex;
         uniform sampler2D uFogNoise;
         uniform float uTime;
         uniform vec2 uFogMin;
         uniform vec2 uFogSize;
         uniform float uFogOn;
         uniform vec3 uRim;
         uniform vec3 uModelTint;
         uniform float uModelDesat;
         uniform vec3 uMist;
         varying vec3 vFogWorld;
         varying vec3 vOrigin;
         varying vec3 vNormalW;
         varying float vScaleY;
         ${GRADE_DECL}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         {
           // Painted finish: shade the base like baked occlusion, lift the tops, brush noise,
           // and let each object drift a little in colour so a forest isn't one green.
           float band = clamp(0.35 * vScaleY, 0.12, 1.4);
           float ao = mix(0.6, 1.0, smoothstep(0.0, band, vFogWorld.y - vOrigin.y));
           float n = texture2D(uFogNoise, vFogWorld.xz * 0.9 + vFogWorld.y * vec2(0.37, 0.61)).r;
           float n2 = texture2D(uFogNoise, vFogWorld.zy * 2.3 + vFogWorld.x * 0.21).r;
           float seed = fract(sin(dot(floor(vOrigin.xz * 3.0), vec2(12.9898, 78.233))) * 43758.5453);
           vec3 drift = mix(vec3(0.9, 0.95, 1.02), vec3(1.08, 1.04, 0.9), seed);
           float top = clamp(vNormalW.y, 0.0, 1.0);
           diffuseColor.rgb *= ao * drift * (0.86 + 0.24 * mix(n, n2, 0.5)) * mix(0.9, 1.1, top);
         }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `${rim ? 'outgoingLight += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);' : ''}
         #include <opaque_fragment>
         {
           float ml = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
           gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(ml), uModelDesat) * uModelTint;
         }
         ${GRADE_GLSL}
         #ifdef USE_FOGWAR
         if (uFogOn > 0.5) {
           float ex = texture2D(uFogTex, (vFogWorld.xz - uFogMin) / uFogSize).r;
           ex += (texture2D(uFogNoise, vFogWorld.xz * 0.05 + vec2(uTime * 0.01, uTime * 0.006)).r - 0.5) * 0.5;
           float vis = mix(1.0, smoothstep(0.2, 0.75, ex), uFogOn);
           // Unexplored land sits under a bank of mist rather than in darkness.
           float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
           vec3 fogged = uMist * (0.78 + 0.45 * lum);
           gl_FragColor.rgb = mix(fogged, gl_FragColor.rgb, vis);
         }
         #endif`,
      );
    if (fog) shader.defines = { ...(shader.defines ?? {}), USE_FOGWAR: '' };
    if (sway) shader.defines = { ...(shader.defines ?? {}), USE_SWAY: '' };
  };
  mat.customProgramCacheKey = () => `w${fog ? 1 : 0}${rim ? 1 : 0}${sway ? 1 : 0}`;
  mat.needsUpdate = true;
  return mat;
}

export class Assets {
  private kits = new Map<KitName, Map<string, THREE.Object3D>>();
  private chars = new Map<CharacterName, THREE.Object3D>();
  private charJobs = new Map<CharacterName, Promise<void>>();
  /** The clip library of each rig (filled when its file is in). */
  readonly clips: Record<Rig, Map<string, THREE.AnimationClip>> = { medium: new Map(), large: new Map() };
  private clipJobs = new Map<Rig, Promise<void>>();
  private partsCache = new Map<string, MeshPart[]>();
  private matCache = new Map<string, THREE.Material>();
  private later = new Map<KitName, Promise<void>>();

  async load(onProgress: (f: number) => void): Promise<void> {
    // Trees are generated in code, not downloaded.
    this.kits.set('trees', buildTreeKit());
    const manager = new THREE.LoadingManager();
    const loader = new GLTFLoader(manager);
    const jobs: Promise<void>[] = [];
    let done = 0;
    const total = KITS.length + FIRST_CAST.length;
    const tick = () => onProgress(++done / total);
    // The heroes and the people's clips come with the world; the rest of the cast streams in after.
    for (const name of FIRST_CAST) jobs.push(this.needCharacter(name).then(tick));
    for (const kit of KITS) {
      jobs.push(
        loader.loadAsync(`assets/kits/${kit}.glb`).then((g) => {
          const map = new Map<string, THREE.Object3D>();
          for (const child of g.scene.children) map.set(child.name, child);
          this.kits.set(kit, map);
          this.prepare(g.scene);
          tick();
        }),
      );
    }
    await Promise.all(jobs);
  }

  /** A rig's clip library, fetched once. */
  private loadClips(rig: Rig): Promise<void> {
    let p = this.clipJobs.get(rig);
    if (!p) {
      p = new GLTFLoader()
        .loadAsync(`assets/characters2/anims_${rig}.glb`)
        .then((g) => {
          for (const clip of g.animations) this.clips[rig].set(clip.name, clip);
        })
        .catch((e) => console.warn(`${rig} clips failed to load`, e));
      this.clipJobs.set(rig, p);
    }
    return p;
  }

  /**
   * A character of the cast and its rig's clips, fetched once (in the background). Resolves when both
   * are in — or failed, in which case `hasCharacter` stays false.
   */
  needCharacter(name: CharacterName): Promise<void> {
    let p = this.charJobs.get(name);
    if (!p) {
      const model = new GLTFLoader()
        .loadAsync(`assets/characters2/${name}.glb`)
        .then((g) => {
          this.prepare(g.scene);
          g.scene.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
          });
          this.chars.set(name, g.scene);
        })
        .catch((e) => console.warn(`character ${name} failed to load`, e));
      p = Promise.all([model, this.loadClips(CAST[name])]).then(() => {});
      this.charJobs.set(name, p);
    }
    return p;
  }

  /** Is a character (and its clips) in, ready to clone? */
  hasCharacter(name: CharacterName): boolean {
    return this.chars.has(name) && this.clips[CAST[name]].size > 0;
  }

  /** A kit not needed at start, fetched once in the background; its models are there when `has` says so. */
  loadKit(kit: KitName): Promise<void> {
    let p = this.later.get(kit);
    if (!p) {
      p = new GLTFLoader()
        .loadAsync(`assets/kits/${kit}.glb`)
        .then((g) => {
          const map = new Map<string, THREE.Object3D>();
          for (const child of g.scene.children) map.set(child.name, child);
          this.prepare(g.scene);
          this.kits.set(kit, map);
        })
        .catch((e) => console.warn(`kit ${kit} failed to load`, e));
      this.later.set(kit, p);
    }
    return p;
  }

  /** Loaded models get cheap matte materials (colour, texture and glow kept; no PBR shading). */
  private prepare(root: THREE.Object3D): void {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = Array.isArray(m.material) ? m.material.map(toLambert) : toLambert(m.material);
    });
  }

  has(kit: KitName, name: string): boolean {
    return !!this.kits.get(kit)?.has(name);
  }

  /** A clone sharing geometry and materials. */
  model(kit: KitName, name: string): THREE.Object3D {
    const t = this.kits.get(kit)?.get(name);
    if (!t) {
      console.warn(`missing model ${kit}/${name}`);
      return new THREE.Group();
    }
    const c = t.clone(true);
    c.position.set(0, 0, 0);
    c.rotation.set(0, 0, 0);
    c.scale.set(1, 1, 1);
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return c;
  }

  /** Flattened meshes of a model (for instancing), with a patched material per option set. */
  parts(kit: KitName, name: string, patch: PatchOptions = {}): MeshPart[] {
    const key = `${kit}/${name}/${patch.fog ?? true}/${patch.sway ?? 0}`;
    const cached = this.partsCache.get(key);
    if (cached) return cached;
    const t = this.kits.get(kit)?.get(name);
    const out: MeshPart[] = [];
    if (t) {
      const root = t.clone(true);
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      root.scale.set(1, 1, 1);
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const material = this.patched(m.material as THREE.Material, patch);
        out.push({ geometry: m.geometry, material, matrix: m.matrixWorld.clone() });
      });
    }
    this.partsCache.set(key, out);
    return out;
  }

  /** One patched copy of a material per (material, options). */
  patched(mat: THREE.Material, patch: PatchOptions): THREE.Material {
    const key = `${mat.uuid}/${patch.fog ?? true}/${patch.rim ?? true}/${patch.sway ?? 0}`;
    let m = this.matCache.get(key);
    if (!m) {
      m = patchMaterial(mat.clone(), patch);
      this.matCache.set(key, m);
    }
    return m;
  }

  /** Applies the world patch to every material under `root` (shared per material). */
  patchTree(root: THREE.Object3D, patch: PatchOptions = {}): void {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (Array.isArray(m.material)) m.material = m.material.map((x) => this.patched(x, patch));
      else m.material = this.patched(m.material, patch);
    });
  }

  /** A clone of a character (its own skeleton; geometry and materials shared), or null until it has streamed in. */
  character(name: CharacterName): THREE.Object3D | null {
    const t = this.chars.get(name);
    return t ? cloneSkinned(t) : null;
  }

  /** A clip of a rig's library (by its KayKit name; see characters.ts for the names the game plays). */
  clip(rig: Rig, name: string): THREE.AnimationClip | undefined {
    return this.clips[rig].get(name);
  }
}
