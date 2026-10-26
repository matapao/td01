/**
 * Builds the game's runtime assets from the KayKit CC0 packs (see public/assets/licenses).
 *
 *   node scripts/assets/build-assets.mjs <downloadDir> [<importDir>]
 *
 * <downloadDir> is produced by fetch-kaykit.mjs and contains:
 *   chars/      character .glb files (each embeds the full shared animation set)
 *   hex/ halloween/ adv/ skel/   loose .gltf + .bin + texture files
 *   dungeon/    small .glb props
 *   resources/ tools/   loose .gltf + .bin + textures (Resource Bits, RPG Tools Bits)
 *   licenses/   LICENSE.txt per pack
 *
 * <importDir> (optional) is produced by import-collection.mjs from The Complete KayKit Collection v7:
 *   weapons/ nature/ space/ props2/ robots/ bits/ cards/   loose .gltf + .bin + textures (or .glb), a folder per source
 *   characters2/   23-bone rig characters (.glb, no animations); textures/ for files they lack
 *   anims/Rig_Medium/ anims/Rig_Large/   Character Animations 1.1 clip sets (.glb)
 *   licenses/
 *
 * Output (public/assets):
 *   characters/<Name>.glb   skinned meshes without animations
 *   characters/anims.glb    one shared animation library (all characters use the same 41-bone rig)
 *   kits/<kit>.glb          one glb per prop pack; every source model is a top-level node named after its file
 * and with <importDir>:
 *   kits/weapons.glb kits/nature.glb kits/space.glb kits/props2.glb kits/robots.glb kits/bits.glb kits/cards.glb
 *   characters2/<Name>.glb  the 23-bone rig (Rig_Medium; big bodies Rig_Large), skinned meshes only
 *   characters2/anims_medium.glb, characters2/anims_large.glb   clip libraries per rig (rig + clips, no meshes)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NodeIO, TextureInfo, Scene } from '@gltf-transform/core';
import { dedup, mergeDocuments, prune, resample, unpartition } from '@gltf-transform/functions';
import { unzlibSync, zlibSync } from 'three/examples/jsm/libs/fflate.module.js';
import { required } from '../../src/core/required.ts';

const srcArg = process.argv[2];
const imp = process.argv[3];
if (!srcArg || !fs.existsSync(srcArg) || (imp && !fs.existsSync(imp))) {
  console.error('usage: node scripts/assets/build-assets.mjs <downloadDir> [<importDir>]');
  process.exit(1);
}
const src = required(srcArg);
const out = path.resolve('public/assets');
const io = new NodeIO();

const CHARACTERS = [
  'Barbarian',
  'Knight',
  'Mage',
  'Rogue_Hooded',
  'Skeleton_Minion',
  'Skeleton_Warrior',
  'Skeleton_Rogue',
  'Skeleton_Mage',
];

/** Clips the game uses (the source files carry 95). */
const CLIPS = new Set([
  'Idle',
  'Idle_B',
  'Idle_Combat',
  'Unarmed_Idle',
  '2H_Melee_Idle',
  'Walking_A',
  'Walking_B',
  'Walking_C',
  'Walking_D_Skeletons',
  'Running_A',
  'Running_B',
  'Running_C',
  '1H_Melee_Attack_Chop',
  '1H_Melee_Attack_Slice_Diagonal',
  '1H_Melee_Attack_Slice_Horizontal',
  '1H_Melee_Attack_Stab',
  '1H_Melee_Attack_Jump_Chop',
  '2H_Melee_Attack_Chop',
  '2H_Melee_Attack_Slice',
  '2H_Melee_Attack_Spin',
  '2H_Melee_Attack_Spinning',
  '2H_Melee_Attack_Stab',
  'Dualwield_Melee_Attack_Chop',
  'Dualwield_Melee_Attack_Slice',
  'Unarmed_Melee_Attack_Punch_A',
  'Unarmed_Melee_Attack_Kick',
  '1H_Ranged_Aiming',
  '1H_Ranged_Shoot',
  '1H_Ranged_Reload',
  '2H_Ranged_Aiming',
  '2H_Ranged_Shoot',
  '2H_Ranged_Reload',
  '2H_Ranged_Shooting',
  'Spellcast_Shoot',
  'Spellcast_Raise',
  'Spellcast_Long',
  'Spellcasting',
  'Spellcast_Summon',
  'Block',
  'Block_Hit',
  'Blocking',
  'Hit_A',
  'Hit_B',
  'Dodge_Forward',
  'Dodge_Backward',
  'Death_A',
  'Death_A_Pose',
  'Death_B',
  'Death_B_Pose',
  'Death_C_Skeletons',
  'Death_C_Pose',
  'Death_C_Skeletons_Resurrect',
  'Cheer',
  'Taunt',
  'Throw',
  'Interact',
  'PickUp',
  'Use_Item',
  'Spawn_Ground_Skeletons',
  'Spawn_Ground',
  'Spawn_Air',
  'Skeletons_Awaken_Floor',
  'Skeletons_Awaken_Standing',
  'Skeletons_Inactive_Floor_Pose',
  'Jump_Full_Short',
  'Jump_Full_Long',
  'Jump_Start',
  'Jump_Idle',
  'Jump_Land',
  'Walking_Backwards',
  'Running_Strafe_Left',
  'Running_Strafe_Right',
]);

/** @typedef {({dir: string, dirs?: never} | {dirs: string[], dir?: never}) & {ext: string | string[]}} KitSource */
/** @type {Record<string, KitSource>} */
const KITS = {
  medieval: { dir: 'hex', ext: '.gltf' },
  halloween: { dir: 'halloween', ext: '.gltf' },
  dungeon: { dir: 'dungeon', ext: '.glb' },
  gear: { dirs: ['adv', 'skel'], ext: '.gltf' },
  resources: { dir: 'resources', ext: '.gltf' },
  tools: { dir: 'tools', ext: '.gltf' },
};

/**
 * Kits from the collection, each built from the import dir's folder of that name (or its subfolders,
 * one per source): weapons (Fantasy Weapons Bits, Adventurers 2.0 and Skeletons 1.1 props), nature
 * (Forest Nature Pack, a subfolder per palette), space (Space Base Bits without its terrain and rocks,
 * Platformer Pack deck plates / pipes / railings / framing, Prototype Bits floor tiles), props2
 * (Resource Bits, RPG Tools Bits, Furniture Bits, Dungeon 1.1 and Halloween extras, Mystery Monthly props),
 * robots (the props of the robots, the mech and the space ranger), bits (Holiday Bits' train set, Mixed
 * Bag's tool carts), cards (Board Game Bits' playing cards).
 */
const COLLECTION_KITS = ['weapons', 'nature', 'space', 'props2', 'robots', 'bits', 'cards'];

/** The collection's characters: the 23-bone rig, no animations baked in. */
const CHARACTERS2 = [
  'Barbarian',
  'Barbarian_Large',
  'Druid',
  'Engineer',
  'Knight',
  'Mage',
  'Ranger',
  'Rogue',
  'Rogue_Hooded',
  'Necromancer',
  'Skeleton_Golem',
  'Skeleton_Mage',
  'Skeleton_Minion',
  'Skeleton_Rogue',
  'Skeleton_Warrior',
  'OrcRaider',
  'OrcBrute',
  'Werewolf_Man',
  'Werewolf_Wolf',
  'BlackKnight',
  'Vampire',
  'FrostGolem',
  'Monstrosity',
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
  'Clanker',
  '4GTN',
  '4GTN_Forgotten',
  'CombatMech',
  'SpaceRanger',
  'SpaceRanger_FlightMode',
];
/** Base-colour textures a source character lacks (OrcRaider.glb ships untextured; its props embed this file). */
/** @type {Map<string, {material: string, image: string}>} */
const TEXTURE_FIXES = new Map(
  Object.entries({ OrcRaider: { material: 'orc_texture_A', image: 'textures/orc_texture_A.png' } }),
);

/**
 * Space must not look like Mars: the space ranger (the hero's look in Space) wears orange in the
 * source. His texture, shared by the character and his props, is an 8 × 4 grid of colour swatches;
 * the orange swatches (row, column from the top left) turn blue — the hue only, so the shading stays.
 * Keyed by the source image's SHA-256, wherever it appears; re-encoded with fflate (plain JavaScript,
 * so the bytes come out the same on every machine).
 */
/** @typedef {{cols: number, rows: number, cells: [number, number][]}} RecolourSpec */
/** @type {Map<string, RecolourSpec>} */
const RECOLOURS = new Map(
  Object.entries({
    '1d8cf66454b75b366c38b80115fc417922ac423ad98557d8379494afe5944376': {
      cols: 8,
      rows: 4,
      cells: [
        [1, 6],
        [1, 7],
        [1, 8],
        [3, 4],
        [3, 5],
        [3, 8],
      ],
    },
  }),
);

/** @param {string} file */
function kb(file) {
  return `${(fs.statSync(file).size / 1024).toFixed(0)} KB`;
}

// ---- RECOLOURS: a small PNG codec (8-bit RGB / RGBA, not interlaced) and the hue turn -----------

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
/** @param {Uint8Array} bytes */
const crc32 = (bytes) => {
  let c = -1;
  for (const b of bytes) c = required(CRC[(c ^ b) & 255]) ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
/** @param {number} a @param {number} b @param {number} c */
const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** @param {Uint8Array} buf */
function decodePng(buf) {
  const data = Buffer.from(buf);
  if (data.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let w = 0;
  let h = 0;
  let type = 0;
  const idat = [];
  for (let off = 8; off < data.length;) {
    const len = data.readUInt32BE(off);
    const kind = data.toString('latin1', off + 4, off + 8);
    const body = data.subarray(off + 8, off + 8 + len);
    if (kind === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      type = required(body[9]);
      if (body[8] !== 8 || (type !== 2 && type !== 6) || body[12] !== 0)
        throw new Error('only 8-bit RGB / RGBA, not interlaced');
    } else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    off += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3;
  const stride = w * bpp;
  const raw = unzlibSync(new Uint8Array(Buffer.concat(idat)));
  const rows = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = required(raw[y * (stride + 1)]);
    if (f > 4) throw new Error(`invalid PNG row filter ${f}`);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? required(rows[y * stride + x - bpp]) : 0;
      const b = y ? required(rows[(y - 1) * stride + x]) : 0;
      const c = x >= bpp && y ? required(rows[(y - 1) * stride + x - bpp]) : 0;
      const v = required(raw[y * (stride + 1) + 1 + x]);
      rows[y * stride + x] = (v + required([0, a, b, (a + b) >> 1, paeth(a, b, c)][f])) & 255;
    }
  }
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    px.set(rows.subarray(i * bpp, i * bpp + 3), i * 4);
    px[i * 4 + 3] = bpp === 4 ? required(rows[i * bpp + 3]) : 255;
  }
  return { w, h, px };
}

/** RGBA PNG; each row takes the filter with the smallest sum of magnitudes (deterministic). */
/** @param {{w: number, h: number, px: Uint8Array}} image */
function encodePng({ w, h, px }) {
  const stride = w * 4;
  const raw = new Uint8Array((stride + 1) * h);
  const line = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    let best = 0;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? required(px[y * stride + x - 4]) : 0;
        const b = y ? required(px[(y - 1) * stride + x]) : 0;
        const c = x >= 4 && y ? required(px[(y - 1) * stride + x - 4]) : 0;
        const v = (required(px[y * stride + x]) - required([0, a, b, (a + b) >> 1, paeth(a, b, c)][f])) & 255;
        line[x] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
        raw.set(line, y * (stride + 1) + 1);
      }
    }
    raw[y * (stride + 1)] = best;
  }
  /** @param {string} kind @param {Uint8Array} body */
  const chunk = (kind, body) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(kind, 4, 'latin1');
    Buffer.from(body).copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new Uint8Array(
    Buffer.concat([
      sig,
      chunk('IHDR', ihdr),
      chunk('IDAT', zlibSync(raw, { level: 9 })),
      chunk('IEND', new Uint8Array(0)),
    ]),
  );
}

/** Orange and red in the given swatches turn blue: hue 0–50° (and 340–360°) to 192–234°, saturation and value kept. */
/** @param {Uint8Array} png @param {RecolourSpec} spec */
function recolourAtlas(png, { cols, rows, cells }) {
  const img = decodePng(png);
  const { w, h, px } = img;
  for (const [r, c] of cells) {
    for (let y = Math.round(((r - 1) * h) / rows); y < Math.round((r * h) / rows); y++) {
      for (let x = Math.round(((c - 1) * w) / cols); x < Math.round((c * w) / cols); x++) {
        const o = (y * w + x) * 4;
        const R = required(px[o]) / 255;
        const G = required(px[o + 1]) / 255;
        const B = required(px[o + 2]) / 255;
        const max = Math.max(R, G, B);
        const min = Math.min(R, G, B);
        const s = max ? (max - min) / max : 0;
        if (s <= 0.25) continue;
        let hue =
          max === R
            ? ((G - B) / (max - min)) * 60
            : max === G
              ? (2 + (B - R) / (max - min)) * 60
              : (4 + (R - G) / (max - min)) * 60;
        if (hue < 0) hue += 360;
        if (hue > 50 && hue < 340) continue;
        const nh = 222 - 0.6 * (hue >= 340 ? hue - 360 : hue);
        /** @param {number} n */
        const f = (n) => {
          const k = (n + nh / 60) % 6;
          return Math.round(255 * (max - max * s * Math.max(0, Math.min(k, 4 - k, 1))));
        };
        px[o] = f(5);
        px[o + 1] = f(3);
        px[o + 2] = f(1);
      }
    }
  }
  return encodePng(img);
}

/** @type {Map<string, Uint8Array>} */
const recoloured = new Map();
/** Applies RECOLOURS to every texture of a source document (matched by the image's SHA-256). */
/** @param {import('@gltf-transform/core').Document} doc */
function recolour(doc) {
  for (const tex of doc.getRoot().listTextures()) {
    const image = tex.getImage();
    if (!image) continue;
    const sha = crypto.createHash('sha256').update(image).digest('hex');
    const spec = RECOLOURS.get(sha);
    if (!spec) continue;
    if (!recoloured.has(sha)) recoloured.set(sha, recolourAtlas(image, spec));
    tex.setImage(required(recoloured.get(sha))).setMimeType('image/png');
  }
}

/** @param {import('@gltf-transform/core').Animation} anim */
function dropAnimation(anim) {
  // Samplers keep their keyframe accessors alive unless disposed explicitly.
  for (const c of anim.listChannels()) c.dispose();
  for (const s of anim.listSamplers()) s.dispose();
  anim.dispose();
}

/** Leaves only the rig: mesh nodes and skins removed (for animation libraries). */
/** @param {import('@gltf-transform/core').Root} root */
function stripMeshes(root) {
  for (const node of root.listNodes()) {
    if (node.getMesh()) {
      node.setMesh(null);
      node.setSkin(null);
      node.dispose();
    }
  }
  for (const skin of root.listSkins()) skin.dispose();
}

async function buildCharacters() {
  fs.mkdirSync(path.join(out, 'characters'), { recursive: true });
  for (const name of CHARACTERS) {
    const doc = await io.read(path.join(src, 'chars', `${name}.glb`));
    for (const anim of doc.getRoot().listAnimations()) dropAnimation(anim);
    await doc.transform(prune());
    const file = path.join(out, 'characters', `${name}.glb`);
    await io.write(file, doc);
    console.log(`characters/${name}.glb  ${kb(file)}`);
  }

  // Animation library: the rig of one skeleton + the clips we use, meshes removed.
  const doc = await io.read(path.join(src, 'chars', 'Skeleton_Minion.glb'));
  const root = doc.getRoot();
  for (const anim of root.listAnimations()) if (!CLIPS.has(anim.getName())) dropAnimation(anim);
  stripMeshes(root);
  await doc.transform(resample({ tolerance: 1e-4 }), prune(), dedup());
  const missing = [...CLIPS].filter((c) => !root.listAnimations().some((a) => a.getName() === c));
  if (missing.length) throw new Error(`missing clips: ${missing.join(', ')}`);
  const file = path.join(out, 'characters', 'anims.glb');
  await io.write(file, doc);
  console.log(`characters/anims.glb  ${kb(file)} (${root.listAnimations().length} clips)`);
}

/** `ext`: one extension or a list; `root`: the directory `dir` / `dirs` are relative to. */
/** @param {string} kit @param {KitSource} source @param {string} root */
async function buildKit(kit, { dir, dirs, ext }, root = src) {
  const target = new (await import('@gltf-transform/core')).Document();
  target.createBuffer();
  const scene = target.createScene(kit);
  target.getRoot().setDefaultScene(scene);
  const names = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const d of dirs ?? [required(dir)]) {
    const folder = path.join(root, d);
    for (const f of fs.readdirSync(folder).sort()) {
      const e = [ext].flat().find((x) => f.endsWith(x));
      if (!e) continue;
      const base = f.slice(0, -e.length).replace(/\.gltf$/, '');
      if (seen.has(base)) throw new Error(`kits/${kit}: two models named ${base}`);
      seen.add(base);
      const doc = await io.read(path.join(folder, f));
      recolour(doc);
      const map = mergeDocuments(target, doc);
      const copied = required(
        map.get(required(doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0])),
      );
      if (!(copied instanceof Scene)) throw new Error('Imported model has no copied scene');
      const wrapper = target.createNode(base);
      for (const child of copied.listChildren()) {
        copied.removeChild(child);
        wrapper.addChild(child);
      }
      copied.dispose();
      scene.addChild(wrapper);
      names.push(base);
    }
  }
  // three's GLTFLoader names nodes depth-first and suffixes repeats (_1), so a node inside one model
  // that is named like another model (a renamed file keeps its source's node names) would take that
  // model's name; such nodes take their own model's name.
  for (const wrapper of scene.listChildren()) {
    wrapper.traverse((n) => {
      if (n !== wrapper && n.getName() !== wrapper.getName() && seen.has(n.getName()))
        n.setName(wrapper.getName());
    });
  }
  await target.transform(unpartition(), dedup(), prune({ keepLeaves: true }));
  fs.mkdirSync(path.join(out, 'kits'), { recursive: true });
  const file = path.join(out, 'kits', `${kit}.glb`);
  await io.write(file, target);
  console.log(`kits/${kit}.glb  ${kb(file)} (${names.length} models)`);
  return names;
}

/** The folders of a collection kit: its subfolders (one per source) or, without any, the folder itself. */
/** @param {string} under */
function kitFolders(under) {
  const subs = fs
    .readdirSync(path.join(required(imp), under), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `${under}/${e.name}`)
    .sort();
  return subs.length ? subs : [under];
}

async function buildCharacters2() {
  fs.mkdirSync(path.join(out, 'characters2'), { recursive: true });
  for (const name of CHARACTERS2) {
    const doc = await io.read(path.join(required(imp), 'characters2', `${name}.glb`));
    recolour(doc);
    const root = doc.getRoot();
    for (const anim of root.listAnimations()) dropAnimation(anim);
    const skins = root.listSkins();
    if (skins.length !== 1 || required(skins[0]).listJoints().length !== 23) {
      throw new Error(
        `${name}: not the 23-bone rig (joints: ${skins.map((s) => s.listJoints().length).join(', ')})`,
      );
    }
    const rig = root
      .listNodes()
      .map((n) => n.getName())
      .find((n) => /^Rig_(Medium|Large)$/.test(n));
    if (!rig) throw new Error(`${name}: no Rig_Medium / Rig_Large node`);
    const fix = TEXTURE_FIXES.get(name);
    if (fix) {
      const material = root.listMaterials().find((m) => m.getName() === fix.material);
      if (!material || material.getBaseColorTexture())
        throw new Error(`${name}: the texture fix no longer applies`);
      const image = fs.readFileSync(path.join(required(imp), 'characters2', fix.image));
      material.setBaseColorTexture(
        doc.createTexture(path.basename(fix.image)).setMimeType('image/png').setImage(image),
      );
      required(material.getBaseColorTextureInfo())
        .setMagFilter(required(TextureInfo.MagFilter['LINEAR']))
        .setMinFilter(required(TextureInfo.MinFilter['LINEAR_MIPMAP_LINEAR']));
    }
    await doc.transform(prune());
    const file = path.join(out, 'characters2', `${name}.glb`);
    await io.write(file, doc);
    console.log(`characters2/${name}.glb  ${kb(file)} (${rig})`);
  }
}

/**
 * One clip library per rig of the collection (Character Animations 1.1): the rig of the first set
 * with its meshes removed receives the clips of every set, re-targeted by joint name; T-Pose dropped.
 */
/** @param {string} file @param {string} rig */
async function buildClipLibrary(file, rig) {
  const dir = path.join(required(imp), 'anims', rig);
  const sets = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.glb'))
    .sort();
  const doc = await io.read(path.join(dir, required(sets[0])));
  const root = doc.getRoot();
  stripMeshes(root);
  const buffer = required(root.listBuffers()[0]);
  const nodes = new Map(root.listNodes().map((n) => [n.getName(), n]));
  /** @param {import('@gltf-transform/core').Accessor} a */
  const copy = (a) =>
    doc
      .createAccessor()
      .setType(a.getType())
      .setArray(required(a.getArray()).slice())
      .setNormalized(a.getNormalized())
      .setBuffer(buffer);
  /** @type {Map<string, string>} */
  const from = new Map();
  for (const set of sets) {
    const setDoc = set === sets[0] ? doc : await io.read(path.join(dir, set));
    for (const anim of setDoc.getRoot().listAnimations()) {
      const name = anim.getName();
      if (name === 'T-Pose') {
        if (setDoc === doc) dropAnimation(anim);
        continue;
      }
      if (from.has(name)) throw new Error(`${rig}: clip ${name} is in both ${from.get(name)} and ${set}`);
      from.set(name, set);
      if (setDoc === doc) continue;
      const clip = doc.createAnimation(name);
      for (const channel of anim.listChannels()) {
        const targetNode = channel.getTargetNode();
        const target = targetNode && nodes.get(targetNode.getName());
        if (!target)
          throw new Error(`${set} ${name}: no node ${channel.getTargetNode()?.getName()} in the rig`);
        const s = required(channel.getSampler());
        const sampler = doc
          .createAnimationSampler()
          .setInput(copy(required(s.getInput())))
          .setOutput(copy(required(s.getOutput())))
          .setInterpolation(s.getInterpolation());
        clip
          .addSampler(sampler)
          .addChannel(
            doc
              .createAnimationChannel()
              .setTargetNode(target)
              .setTargetPath(required(channel.getTargetPath()))
              .setSampler(sampler),
          );
      }
    }
  }
  await doc.transform(resample({ tolerance: 1e-4 }), prune(), dedup());
  const target = path.join(out, 'characters2', file);
  await io.write(target, doc);
  console.log(
    `characters2/${file}  ${kb(target)} (${root.listAnimations().length} clips from ${sets.length} sets)`,
  );
}

async function main() {
  await buildCharacters();
  /** @type {Record<string, string[]>} */
  const index = {};
  for (const [kit, cfg] of Object.entries(KITS)) index[kit] = await buildKit(kit, cfg);
  if (imp) {
    for (const kit of COLLECTION_KITS)
      index[kit] = await buildKit(kit, { dirs: kitFolders(kit), ext: ['.gltf', '.glb'] }, imp);
    await buildCharacters2();
    await buildClipLibrary('anims_medium.glb', 'Rig_Medium');
    await buildClipLibrary('anims_large.glb', 'Rig_Large');
  }
  fs.writeFileSync(path.join(out, 'kits', 'index.json'), JSON.stringify(index, null, 1));
  for (const dir of [src, imp]) {
    const lic = dir && path.join(dir, 'licenses');
    if (!lic || !fs.existsSync(lic)) continue;
    fs.mkdirSync(path.join(out, 'licenses'), { recursive: true });
    for (const f of fs.readdirSync(lic)) fs.copyFileSync(path.join(lic, f), path.join(out, 'licenses', f));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
