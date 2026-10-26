/**
 * Dev-only asset gallery: /preview.html?set=medieval&filter=tower&cols=8&scale=1
 * Sets: medieval, halloween, dungeon, gear, characters.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const params = new URLSearchParams(location.search);
const set = params.get('set') ?? 'medieval';
const filter = params.get('filter') ?? '';
const cols = Number(params.get('cols') ?? 8);
const anim = params.get('anim') ?? 'Idle';
const gap = Number(params.get('gap') ?? 3);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#3a4250');
scene.add(new THREE.HemisphereLight('#cfe3ff', '#5a4a3a', 1.6));
const sun = new THREE.DirectionalLight('#fff2dd', 2.6);
sun.position.set(-20, 40, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 200 });
scene.add(sun);

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
const loader = new GLTFLoader();
const mixers: THREE.AnimationMixer[] = [];

function label(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000a';
  g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#fff';
  g.font = '28px system-ui';
  g.textAlign = 'center';
  g.fillText(text, 256, 42);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.set(2.4, 0.3, 1);
  return s;
}

/** The 23-bone cast (characters2): which rig each stands on. */
const LARGE = [
  'Barbarian_Large',
  'Skeleton_Golem',
  'OrcBrute',
  'BlackKnight',
  'FrostGolem',
  'Monstrosity',
  'Clanker',
  '4GTN',
  '4GTN_Forgotten',
];
const CAST2 = [
  'Barbarian',
  'Druid',
  'Engineer',
  'Knight',
  'Mage',
  'Ranger',
  'Rogue',
  'Rogue_Hooded',
  'Necromancer',
  'Skeleton_Mage',
  'Skeleton_Minion',
  'Skeleton_Rogue',
  'Skeleton_Warrior',
  'OrcRaider',
  'Werewolf_Man',
  'Werewolf_Wolf',
  'Vampire',
  'Witch',
  'Paladin',
  'Paladin_with_Helmet',
  'Cleric',
  'Lorekeeper',
  'Farmer_A',
  'Farmer_B',
  'Caveman',
  'Tiefling',
  'Ninja',
  'PlantWarrior',
  'AvianSwordsman',
  'Hoarder',
  'Robot_One',
  'Robot_Two',
  'CombatMech',
  'SpaceRanger',
  'SpaceRanger_FlightMode',
  ...LARGE,
];

/**
 * The new cast: /preview.html?set=cast&filter=Knight,Ranger&anim=Idle_A&t=0.4&hold=sword_A&holdl=shield_A
 * (`t` freezes the clip at that time; `hold`/`holdl` put a weapons-kit prop in the right/left hand;
 * `rot` turns the held props "x,y,z" radians).
 */
async function cast(items: { name: string; obj: THREE.Object3D }[]): Promise<void> {
  const [med, large, weapons] = await Promise.all([
    loader.loadAsync('/assets/characters2/anims_medium.glb'),
    loader.loadAsync('/assets/characters2/anims_large.glb'),
    params.get('hold') || params.get('holdl')
      ? loader.loadAsync(`/assets/kits/${params.get('kit') ?? 'weapons'}.glb`)
      : Promise.resolve(null),
  ]);
  const t = params.get('t');
  const rots = { hold: params.get('rot') ?? '0,0,0', holdl: params.get('rotl') ?? '0,0,0' };
  const names = CAST2.filter(
    (n) =>
      !filter || filter.split(',').some((f) => n === f || (f.endsWith('*') && n.startsWith(f.slice(0, -1)))),
  );
  // `anims=A,B,C`: one copy of each character per clip (to compare clips side by side).
  const clips = (params.get('anims') ?? anim).split(',');
  const loaded = new Map<string, THREE.Object3D>();
  for (const n of names) loaded.set(n, (await loader.loadAsync(`/assets/characters2/${n}.glb`)).scene);
  for (const [name, clipName] of names.flatMap((n) => clips.map((c) => [n, c] as const))) {
    // Every filtered name was loaded above; retain its tuple rather than reparsing a label.
    const scene = loaded.get(name)!;
    const obj = cloneSkinned(scene);
    const lib = LARGE.includes(name) ? large : med;
    const mixer = new THREE.AnimationMixer(obj);
    const clip =
      lib.animations.find((a) => a.name === clipName) ?? lib.animations.find((a) => a.name === 'Idle_A')!;
    const action = mixer.clipAction(clip).play();
    if (t) {
      action.time = Number(t);
      action.paused = true;
      mixer.update(0);
    }
    mixers.push(mixer);
    for (const [key, bone] of [
      ['hold', 'handslotr'],
      ['holdl', 'handslotl'],
    ] as const) {
      const p = params.get(key);
      const b = obj.getObjectByName(bone);
      const src = p && weapons?.scene.getObjectByName(p);
      if (!b || !src) continue;
      const m = src.clone(true);
      m.position.set(0, 0, 0);
      m.rotation.set(...(rots[key].split(',').map(Number) as [number, number, number]));
      if (key === 'hold' && params.get('pos'))
        m.position.set(...(params.get('pos')!.split(',').map(Number) as [number, number, number]));
      b.add(m);
    }
    items.push({ name: clips.length > 1 ? `${clipName}${t ? ' @' + t : ''}` : name, obj });
  }
  (document.getElementById('info') as HTMLElement).textContent =
    `${anim} · medium clips: ${med.animations.length} · large: ${large.animations.map((a) => a.name).join(', ')}`;
}

async function main() {
  const items: { name: string; obj: THREE.Object3D }[] = [];
  if (set === 'cast') await cast(items);
  else if (set === 'characters') {
    const names = [
      'Barbarian',
      'Knight',
      'Mage',
      'Rogue_Hooded',
      'Skeleton_Minion',
      'Skeleton_Warrior',
      'Skeleton_Rogue',
      'Skeleton_Mage',
    ];
    const lib = await loader.loadAsync('/assets/characters/anims.glb');
    for (const n of names) {
      if (filter && !n.includes(filter)) continue;
      const g = await loader.loadAsync(`/assets/characters/${n}.glb`);
      const obj = cloneSkinned(g.scene);
      const mixer = new THREE.AnimationMixer(obj);
      const clip = lib.animations.find((a) => a.name === anim) ?? lib.animations[0];
      if (!clip) throw new Error('The character animation library has no clips');
      mixer.clipAction(clip).play();
      mixers.push(mixer);
      items.push({ name: n, obj });
    }
    (document.getElementById('info') as HTMLElement).textContent =
      `clips: ${lib.animations.map((a) => a.name).join(', ')}`;
  } else {
    const g = await loader.loadAsync(`/assets/kits/${set}.glb`);
    for (const child of [...g.scene.children]) {
      if (filter && !filter.split(',').some((f) => child.name.includes(f))) continue;
      items.push({ name: child.name, obj: child });
    }
  }
  const scale = Number(params.get('scale') ?? 1);
  items.forEach((it, i) => {
    const x = (i % cols) * gap;
    const z = Math.floor(i / cols) * gap;
    it.obj.position.set(x, 0, z);
    it.obj.rotation.y = Number(params.get('yaw') ?? 0);
    it.obj.scale.setScalar(scale);
    it.obj.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    scene.add(it.obj);
    const l = label(it.name);
    l.position.set(x, -0.35, z + gap * 0.42);
    scene.add(l);
  });
  const rows = Math.ceil(items.length / cols);
  const w = (Math.min(cols, items.length) - 1) * gap;
  const d = (rows - 1) * gap;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 20, d + 20),
    new THREE.MeshStandardMaterial({ color: '#59616e' }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(w / 2, -0.01, d / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  controls.target.set(w / 2, Number(params.get('ty') ?? 0.8), d / 2);
  // `zoom` brings the camera closer (<1), `tilt` lowers it (0 level … 1 the usual height).
  const dist = (Math.max(w, d * 1.4, 6) * 1.05 + 4) * Number(params.get('zoom') ?? 1);
  const tilt = Number(params.get('tilt') ?? 1);
  camera.position.set(w / 2, Number(params.get('ty') ?? 0.8) + dist * 0.75 * tilt, d / 2 + dist * 0.8);
  controls.update();
  if (set !== 'characters' && set !== 'cast')
    (document.getElementById('info') as HTMLElement).textContent = `${set}: ${items.length} models`;
  (window as unknown as { __ready: boolean }).__ready = true;
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  for (const m of mixers) m.update(dt);
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
main();
