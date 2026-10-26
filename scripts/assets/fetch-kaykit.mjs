/**
 * Downloads the KayKit (CC0) source files the game uses into an empty directory: the packs on
 * GitHub pinned to exact commits, the ones only on itch.io pinned by their archive's SHA-256.
 * Then run build-assets.mjs on that directory.
 *
 *   node scripts/assets/fetch-kaykit.mjs <emptyDir>
 *
 * Packs by Kay Lousberg — https://kaylousberg.com — license: CC0 1.0 (public domain).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { required } from '../../src/core/required.ts';
import { assetRecord } from './asset-data.mjs';

const PACKS = {
  adventurers: {
    repo: 'KayKit-Character-Pack-Adventures-1.0',
    sha: '672074b73ba276876a19e8816ecdc5241817ab47',
    addon: 'kaykit_character_pack_adventures',
  },
  skeletons: {
    repo: 'KayKit-Character-Pack-Skeletons-1.0',
    sha: '15b62b9bad122f72926c10fb14d622c73819fa54',
    addon: 'kaykit_character_pack_skeletons',
  },
  medieval: {
    repo: 'KayKit-Medieval-Hexagon-Pack-1.0',
    sha: '84fa4e91af6a88989be7c99e0891cede11f2ca38',
    addon: 'kaykit_medieval_hexagon_pack',
  },
  dungeon: {
    repo: 'KayKit-Dungeon-Remastered-1.0',
    sha: 'b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07',
    addon: 'kaykit_dungeon_remastered',
  },
  halloween: {
    repo: 'KayKit-Halloween-Bits-1.0',
    sha: '6dc69bf6b2fa766a985754f35ec6a0324090e6c6',
    addon: 'kaykit_halloween_bits',
  },
};

const CHARACTERS = {
  adventurers: ['Barbarian', 'Knight', 'Mage', 'Rogue_Hooded'],
  skeletons: ['Skeleton_Minion', 'Skeleton_Warrior', 'Skeleton_Rogue', 'Skeleton_Mage'],
};
const GEAR = {
  adventurers: {
    dir: 'adv',
    files: ['arrow', 'arrow_bundle', 'quiver', 'sword_1handed', 'shield_round_color'],
    textures: ['rogue_texture.png', 'knight_texture.png'],
  },
  skeletons: {
    dir: 'skel',
    files: [
      'Skeleton_Axe',
      'Skeleton_Blade',
      'Skeleton_Crossbow',
      'Skeleton_Staff',
      'Skeleton_Shield_Large_A',
      'Skeleton_Shield_Small_A',
      'Skeleton_Shield_Small_B',
      'Skeleton_Arrow',
    ],
    textures: ['skeleton_texture.png'],
  },
};
/** Medieval Hexagon: building colours beyond blue/neutral are only needed for a few towers. */
const EXTRA_COLOURS = new Set([
  'building_tower_A',
  'building_tower_B',
  'building_tower_base',
  'building_tower_catapult',
  'building_church',
  'building_barracks',
  'building_archeryrange',
]);
const DUNGEON = new Set([
  'chest',
  'chest_gold',
  'coin',
  'coin_stack_large',
  'coin_stack_medium',
  'coin_stack_small',
  'torch_lit',
  'torch_mounted',
  'keg',
  'keg_decorated',
  'barrel_large',
  'barrel_small',
  'barrel_small_stack',
  'crates_stacked',
  'rubble_half',
  'rubble_large',
  'sword_shield',
  'sword_shield_broken',
  'column',
  'banner_patternA_blue',
  'banner_thin_blue',
  'banner_shield_blue',
  'banner_triple_blue',
  'banner_patternA_red',
  'banner_thin_red',
  'trunk_large_A',
  'box_stacked',
  // Building interiors: floors, walls, and the furniture of workshops.
  'floor_tile_large',
  'floor_wood_large',
  'wall',
  'wall_corner',
  'wall_doorway',
  'wall_window_open',
  'wall_archedwindow_open',
  'wall_shelves',
  'wall_half',
  'pillar',
  'table_medium',
  'table_long',
  'table_small',
  'shelf_large',
  'shelf_small',
  'shelves',
  'stool',
  'chair',
  'box_large',
  'box_small',
  'trunk_medium_A',
  'candle_lit',
  'candle_triple',
  'bottle_A_brown',
  'keyring_hanging',
  // Rooms built like KayKit's own dioramas: storeys, balconies and stairs, timber-framed and barred
  // walls, alcoves, plank and dirt floors, and the clutter of lived-in rooms.
  'stairs',
  'stairs_wood',
  'stairs_wood_decorated',
  'stairs_walled',
  'stairs_wall_left',
  'stairs_wall_right',
  'stairs_wide',
  'stairs_narrow',
  'barrier',
  'barrier_half',
  'barrier_column',
  'barrier_colum_half',
  'barrier_corner',
  'floor_foundation_allsides',
  'floor_foundation_corner',
  'floor_foundation_front',
  'floor_foundation_front_and_sides',
  'floor_foundation_front_and_back',
  'floor_foundation_diagonal_corner',
  'floor_tile_small',
  'floor_tile_small_broken_A',
  'floor_tile_small_broken_B',
  'floor_tile_small_weeds_A',
  'floor_tile_small_weeds_B',
  'floor_tile_small_decorated',
  'floor_tile_small_corner',
  'floor_tile_large_rocks',
  'floor_tile_grate',
  'floor_tile_big_grate',
  'floor_wood_large_dark',
  'floor_wood_small',
  'floor_wood_small_dark',
  'floor_dirt_large',
  'floor_dirt_large_rocky',
  'floor_dirt_small_A',
  'floor_dirt_small_B',
  'floor_dirt_small_weeds',
  'floor_dirt_small_corner',
  'wall_arched',
  'wall_broken',
  'wall_cracked',
  'wall_gated',
  'wall_window_closed',
  'wall_archedwindow_gated',
  'wall_scaffold',
  'wall_doorway_scaffold',
  'wall_window_open_scaffold',
  'wall_window_closed_scaffold',
  'wall_open_scaffold',
  'wall_corner_scaffold',
  'wall_corner_small',
  'wall_corner_gated',
  'wall_pillar',
  'wall_endcap',
  'wall_half_endcap',
  'wall_half_endcap_sloped',
  'wall_sloped',
  'wall_Tsplit',
  'wall_Tsplit_sloped',
  'wall_doorway_sides',
  'wall_crossing',
  'pillar_decorated',
  'banner_red',
  'banner_patternB_red',
  'banner_patternC_red',
  'banner_shield_red',
  'banner_triple_red',
  'banner_brown',
  'banner_patternA_brown',
  'banner_shield_brown',
  'banner_thin_brown',
  'banner_patternB_yellow',
  'banner_shield_yellow',
  'banner_thin_yellow',
  'table_long_decorated_A',
  'table_long_decorated_C',
  'table_long_tablecloth',
  'table_long_tablecloth_decorated_A',
  'table_long_broken',
  'table_medium_decorated_A',
  'table_medium_broken',
  'table_medium_tablecloth',
  'table_small_decorated_A',
  'table_small_decorated_B',
  'shelf_small_candles',
  'bed_decorated',
  'bed_floor',
  'bed_frame',
  'bottle_A_green',
  'bottle_A_labeled_brown',
  'bottle_A_labeled_green',
  'bottle_B_brown',
  'bottle_B_green',
  'bottle_C_brown',
  'bottle_C_green',
  'candle',
  'candle_melted',
  'candle_thin',
  'candle_thin_lit',
  'plate',
  'plate_food_A',
  'plate_food_B',
  'plate_small',
  'plate_stack',
  'barrel_large_decorated',
  'box_small_decorated',
  'trunk_large_B',
  'trunk_large_C',
  'trunk_medium_B',
  'trunk_small_A',
  'trunk_small_B',
  'key',
  'keyring',
  'torch',
  'sword_shield_gold',
]);

/**
 * Packs published only on itch.io as free downloads, fetched the way a browser does ("No thanks,
 * just take me to the downloads") and pinned by the archive's SHA-256, so a changed upload fails
 * loudly instead of slipping in. `files`: the models to take (glTF + bin); every texture comes along.
 */
const ITCH = {
  resources: {
    page: 'https://kaylousberg.itch.io/resource-bits',
    sha256: '7056f1310896a4612a67703fd6d5af389fcccdeb46df0a89e2322aa8e3bcfcf7',
    root: 'KayKit_ResourceBits_1.0_FREE',
    licence: 'KayKit-Resource-Bits-1.0',
    files: [
      'Wood_Log_A',
      'Wood_Plank_A',
      'Wood_Planks_Stack_Small',
      'Stone_Chunks_Small',
      'Stone_Brick',
      'Stone_Bricks_Stack_Small',
      'Iron_Nugget_Medium',
      'Iron_Bar',
      'Iron_Bars_Stack_Small',
      'Copper_Nugget_Medium',
      'Copper_Bar',
      'Silver_Nugget_Medium',
      'Silver_Bar',
      'Gold_Nugget_Medium',
      'Gold_Bar',
      'Parts_Cog',
      'Parts_Pile_Small',
      'Pallet_Wood',
      'Textiles_A',
      'Fuel_A_Barrel',
    ],
  },
  tools: {
    page: 'https://kaylousberg.itch.io/rpg-tools-bits',
    sha256: 'a17c2a54df93d525e90d960baf3c68638defb4f424e204ceead6ea1f89e9c7dd',
    root: 'KayKit_RPGToolsBits_1.0_FREE',
    licence: 'KayKit-RPG-Tools-Bits-1.0',
    files: [
      'axe',
      'pickaxe',
      'hammer',
      'shovel',
      'saw',
      'chisel',
      'mallet',
      'tongs',
      'anvil',
      'grindstone',
      'bucket_metal',
      'lantern',
      'torch',
      'wrench_A',
      'screwdriver_A_long',
      'handdrill',
      'blueprint',
      'journal_closed',
      'journal_open',
      'map_rolled',
      'magnifying_glass',
      'compass_base',
      'drafting_compass',
      'rope_bundle_A',
    ],
  },
};

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

/** A free itch.io download: the game page, the download page, then the upload's signed URL. */
/** @param {string} page */
async function itchDownload(page) {
  /** @type {Map<string, string>} */
  const jar = new Map();
  /** @param {Response} r */
  const keep = (r) => {
    for (const c of r.headers.getSetCookie()) {
      const kv = required(c.split(';')[0]);
      jar.set(kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1));
    }
    return r;
  };
  /** @param {Record<string, string>} extra */
  const headers = (extra = {}) => ({
    'user-agent': UA,
    cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    ...extra,
  });
  /** @param {string} url */
  const get = async (url) => keep(await fetch(url, { headers: headers() }));
  /** @param {string} url @param {Record<string, string>} form @param {string} [referer] */
  const post = async (url, form, referer) =>
    keep(
      await fetch(url, {
        method: 'POST',
        body: new URLSearchParams(form),
        headers: headers({
          'content-type': 'application/x-www-form-urlencoded',
          ...(referer && { referer }),
        }),
      }),
    );
  /** @param {string} html */
  const csrf = (html) => html.match(/name="csrf_token" value="([^"]+)"/)?.[1] ?? '';
  const html = await (await get(page)).text();
  const download = assetRecord(
    await (await post(`${page}/download_url`, { csrf_token: csrf(html) })).json(),
    page,
  );
  const downloads = download['url'];
  if (typeof downloads !== 'string') throw new Error(`${page}: missing download page URL`);
  const dhtml = await (await get(downloads)).text();
  const ids = [...new Set([...dhtml.matchAll(/data-upload_id="(\d+)"/g)].map((m) => required(m[1])))];
  if (ids.length !== 1) throw new Error(`${page}: expected one free upload, found ${ids.length}`);
  const fileData = await (
    await post(
      `${page}/file/${ids[0]}?source=game_download&after_download_lightbox=1&as_props=1`,
      { csrf_token: csrf(dhtml) || csrf(html) },
      downloads,
    )
  ).json();
  const file = assetRecord(fileData, page);
  const fileUrl = file['url'];
  if (typeof fileUrl !== 'string' || !fileUrl)
    throw new Error(`${page}: no download URL (${JSON.stringify(file['errors'] ?? file)})`);
  const r = await fetch(fileUrl, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`${page}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

const destArg = process.argv[2];
if (!destArg) {
  console.error('usage: node scripts/assets/fetch-kaykit.mjs <emptyDir>');
  process.exit(1);
}
const dest = required(destArg);
fs.mkdirSync(dest, { recursive: true });
if (fs.readdirSync(dest).length) {
  console.error(`${dest} is not empty`);
  process.exit(1);
}

/** @typedef {{repo: string, sha: string, addon: string}} Pack */
/** @param {Pack} p @param {string} file */
const raw = (p, file) => `https://raw.githubusercontent.com/KayKit-Game-Assets/${p.repo}/${p.sha}/${file}`;

/** @param {Pack} p @returns {Promise<string[]>} */
async function tree(p) {
  const r = await fetch(
    `https://api.github.com/repos/KayKit-Game-Assets/${p.repo}/git/trees/${p.sha}?recursive=1`,
  );
  if (!r.ok) throw new Error(`tree ${p.repo}: ${r.status}`);
  const tree = assetRecord(await r.json(), p.repo)['tree'];
  if (!Array.isArray(tree)) throw new Error(`${p.repo}: missing repository tree`);
  /** @type {unknown[]} */
  const entries = tree;
  const files = [];
  for (const value of entries) {
    const entry = assetRecord(value, p.repo);
    if (entry['type'] !== 'blob') continue;
    const file = entry['path'];
    if (typeof file !== 'string') throw new Error(`${p.repo}: invalid tree file path`);
    files.push(file);
  }
  return files;
}

/** @type {{url: string, file: string}[]} */
const jobs = [];
const packsByName = new Map(Object.entries(PACKS));
/** @param {string} url @param {string} file */
const add = (url, file) => jobs.push({ url, file: path.join(dest, file) });

for (const p of Object.values(PACKS)) add(raw(p, 'LICENSE.txt'), `licenses/${p.repo}.txt`);

for (const [key, names] of Object.entries(CHARACTERS)) {
  const p = required(packsByName.get(key));
  for (const n of names) add(raw(p, `addons/${p.addon}/Characters/gltf/${n}.glb`), `chars/${n}.glb`);
}
for (const [key, g] of Object.entries(GEAR)) {
  const p = required(packsByName.get(key));
  const base = `addons/${p.addon}/Assets/gltf`;
  for (const n of g.files) {
    add(raw(p, `${base}/${n}.gltf`), `${g.dir}/${n}.gltf`);
    add(raw(p, `${base}/${n}.bin`), `${g.dir}/${n}.bin`);
  }
  for (const t of g.textures) add(raw(p, `${base}/${t}`), `${g.dir}/${t}`);
}

{
  const p = PACKS.medieval;
  const prefix = `addons/${p.addon}/Assets/gltf/`;
  for (const f of await tree(p)) {
    if (!f.startsWith(prefix) || !/\.(gltf|bin)$/.test(f)) continue;
    const parts = f.slice(prefix.length).split('/');
    const base = required(parts.at(-1)).replace(/\.(gltf|bin)$/, '');
    if (parts[0] === 'buildings') {
      const colour = parts[1];
      if (
        colour !== 'blue' &&
        colour !== 'neutral' &&
        !EXTRA_COLOURS.has(base.replace(/_(red|green|yellow)$/, ''))
      )
        continue;
    } else if (parts[0] !== 'decoration') continue;
    add(raw(p, f), `hex/${parts.at(-1)}`);
  }
  add(raw(p, `${prefix}buildings/blue/hexagons_medieval.png`), 'hex/hexagons_medieval.png');
}
{
  const p = PACKS.dungeon;
  const prefix = `addons/${p.addon}/Assets/gltf/`;
  for (const f of await tree(p)) {
    if (!f.startsWith(prefix) || !f.endsWith('.glb')) continue;
    const base = f.slice(prefix.length).replace(/\.gltf\.glb$|\.glb$/, '');
    if (DUNGEON.has(base)) add(raw(p, f), `dungeon/${base}.glb`);
  }
}
{
  const p = PACKS.halloween;
  const prefix = `addons/${p.addon}/Assets/gltf/`;
  for (const f of await tree(p))
    if (f.startsWith(prefix)) add(raw(p, f), `halloween/${f.slice(prefix.length)}`);
}

let done = 0;
async function worker() {
  while (jobs.length) {
    const job = jobs.shift();
    if (!job) break;
    const { url, file } = job;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    done++;
  }
}
const total = jobs.length;
await Promise.all(Array.from({ length: 12 }, worker));
console.log(`downloaded ${done}/${total} files into ${dest}`);

for (const [dir, p] of Object.entries(ITCH)) {
  const zip = await itchDownload(p.page);
  const sha = crypto.createHash('sha256').update(zip).digest('hex');
  if (sha !== p.sha256)
    throw new Error(`${p.page} changed upstream (sha256 ${sha}): check it, then update the pin`);
  const entries = unzipSync(new Uint8Array(zip));
  const gltf = `${p.root}/Assets/gltf/`;
  const want = new Set(p.files.flatMap((n) => [`${n}.gltf`, `${n}.bin`]));
  let n = 0;
  for (const [name, data] of Object.entries(entries)) {
    let out = null;
    if (name === `${p.root}/License.txt`) out = `licenses/${p.licence}.txt`;
    else if (name.startsWith(gltf)) {
      const f = name.slice(gltf.length);
      if (want.has(f) || f.endsWith('.png')) out = `${dir}/${f}`;
    }
    if (!out) continue;
    fs.mkdirSync(path.dirname(path.join(dest, out)), { recursive: true });
    fs.writeFileSync(path.join(dest, out), data);
    n++;
  }
  const missing = p.files.filter((f) => !fs.existsSync(path.join(dest, dir, `${f}.gltf`)));
  if (missing.length) throw new Error(`${p.page}: missing ${missing.join(', ')}`);
  console.log(`${p.licence}: ${n} files (sha256 ok)`);
}
