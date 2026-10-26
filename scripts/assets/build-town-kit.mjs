/**
 * Builds kits/town.glb: what the town inside the wall and the workshops' rooms are dressed with,
 * streamed in after the world is up (no loading screen). Two sources, both KayKit (CC0 1.0):
 *
 * - Medieval Hexagon Pack 1.0.1 from "The Complete KayKit Collection v7" (a local purchase): the
 *   houses, tavern, stables, townhall, watchtower and shrine in the colours medieval.glb lacks, carts,
 *   horses, troughs and banners. Each source file is read as data only (never run) and pinned by
 *   SHA-256 in town-manifest.json: the first run pins it, every later run checks it.
 * - kits/props2.glb (built by build-assets.mjs from the same collection): the farm, market, workshop
 *   and study pieces picked below, so the game never needs props2's 13 MB.
 *
 *   node scripts/assets/build-town-kit.mjs "<path>/The Complete KayKit Collection v7"
 *
 * Every model is a top-level node named after its file, as in the other kits.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO, Scene } from '@gltf-transform/core';
import { dedup, mergeDocuments, prune, unpartition } from '@gltf-transform/functions';
import { required } from '../../src/core/required.ts';
import { assetRecord, gltfUris, readPins } from './asset-data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(here, 'town-manifest.json');
const OUT = path.resolve(here, '../../public/assets/kits/town.glb');
const PROPS2 = path.resolve(here, '../../public/assets/kits/props2.glb');
const HEX = 'KayKit Medieval Hexagon Pack 1.0.1/Assets/gltf';

/** Medieval Hexagon models (path under the pack's gltf folder, without .gltf). */
const HEX_MODELS = [
  'buildings/red/building_home_A_red',
  'buildings/green/building_home_A_green',
  'buildings/yellow/building_home_A_yellow',
  'buildings/red/building_home_B_red',
  'buildings/green/building_home_B_green',
  'buildings/yellow/building_stables_yellow',
  'buildings/blue/building_watchtower_blue',
  'buildings/green/building_shrine_green',
  'buildings/red/building_well_red',
  'buildings/blue/building_workshop_blue',
  'buildings/red/building_blacksmith_red',
  'decoration/props/haybale',
  'decoration/props/trough',
  'units/neutral/cart',
  'units/neutral/horse_A',
  'units/neutral/horse_C',
  'units/red/banner_red_full',
  'units/blue/banner_blue_full',
  // The old town: its hall, the tavern, a farmhouse, the quay on the river, market tents.
  'buildings/blue/building_townhall_blue',
  'buildings/red/building_tavern_red',
  'buildings/yellow/building_home_B_yellow',
  'buildings/yellow/building_docks_yellow',
  'buildings/red/building_tent_red',
  'decoration/props/boat',
  'decoration/props/boatrack',
  'decoration/props/trough_long',
];

/** Models taken from kits/props2.glb. */
const PROPS2_MODELS = [
  // The farms.
  'dirt_plot',
  'carrot',
  'lettuce',
  'pitchfork',
  'scarecrow',
  'wagon',
  'sign_both',
  'sign_left',
  'wheelbarrow_empty',
  // The townsfolk's things.
  'fishing_rod',
  // The market and the town's stores.
  'Food_Crate_Large_Apples',
  'Food_Crate_Small_Berries',
  'Food_Basket_A_Berries',
  'Food_Basket_B_Empty',
  'Food_Cheese',
  'Food_Flour',
  'Textiles_Stack_Large_Colored',
  'Containers_Crate_Medium_Wood',
  'Pallet_Wood_Covered_A',
  'banner_patternB_blue',
  'banner_triple_yellow',
  'bench',
  'stool_round',
  'table_round_medium',
  'crate_small',
  // The workshops' rooms: timber and stone, metal and gems, a study's books and an alchemist's bench.
  'Wood_Log_B',
  'Wood_Planks_Stack_Large',
  'Wood_Planks_Stack_Medium',
  'Wood_Plank_B',
  'Stone_Bricks_Stack_Large',
  'Stone_Bricks_Stack_Medium',
  'Iron_Bars_Stack_Medium',
  'Copper_Bars_Stack_Small',
  'Iron_Nuggets',
  'Gems_Pile_Small',
  'Gem_Medium',
  'handplane',
  'file',
  'trowel',
  'bookcase_double',
  'bookcase_single_decoratedB',
  'book_brown',
  'book_grey',
  'Cauldron',
  'Potionstation',
  'Mortar',
  'Pestle',
  'Cleric_Tome',
  'rug_oval_B',
  'rocks',
  'rocks_small',
];

/** @param {string} file */
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** The pins this run checked (the manifest is written back with just these). */
/** @type {Map<string, string>} */
const pinned = new Map();

/** Checks a source file against its pin (or pins it the first time). */
/** @param {Map<string, string>} manifest @param {string} rel @param {string} file */
function pin(manifest, rel, file) {
  const got = sha(file);
  if (manifest.get(rel) && manifest.get(rel) !== got)
    throw new Error(`${rel}: SHA-256 ${got} does not match its pin ${manifest.get(rel)}`);
  manifest.set(rel, got);
  pinned.set(rel, got);
}

/** A .gltf's own files (its buffers and images), which must be plain names next to it. */
/** @param {string} file */
function siblings(file) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const uris = gltfUris(json, file);
  for (const u of uris)
    if (u.includes('/') || u.includes('\\') || u.startsWith('data:'))
      throw new Error(`${file}: unexpected reference ${u}`);
  return uris;
}

async function main() {
  const collection = process.argv[2];
  if (!collection || !fs.existsSync(path.join(collection, HEX))) {
    console.error('usage: node scripts/assets/build-town-kit.mjs "<path>/The Complete KayKit Collection v7"');
    process.exit(1);
  }
  const manifest = readPins(MANIFEST);
  const io = new NodeIO();
  const target = new Document();
  target.createBuffer();
  const scene = target.createScene('town');
  target.getRoot().setDefaultScene(scene);
  const names = [];
  /** @param {Document} doc @param {(node: import('@gltf-transform/core').Node) => boolean} wanted */
  const adopt = (doc, wanted) => {
    const map = mergeDocuments(target, doc);
    const copied = required(
      map.get(required(doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0])),
    );
    if (!(copied instanceof Scene)) throw new Error('Imported model has no copied scene');
    for (const child of copied.listChildren()) {
      copied.removeChild(child);
      if (wanted(child)) scene.addChild(child);
    }
    copied.dispose();
  };

  for (const rel of HEX_MODELS) {
    const file = path.join(collection, HEX, `${rel}.gltf`);
    const dir = path.dirname(file);
    pin(manifest, `${HEX}/${rel}.gltf`, file);
    for (const s of siblings(file)) pin(manifest, `${HEX}/${path.dirname(rel)}/${s}`, path.join(dir, s));
    const doc = await io.read(file);
    const base = path.basename(rel);
    const wrapper = doc.createNode(base);
    const src = required(doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]);
    for (const child of src.listChildren()) {
      src.removeChild(child);
      wrapper.addChild(child);
    }
    src.addChild(wrapper);
    adopt(doc, () => true);
    names.push(base);
  }

  pin(manifest, 'public/assets/kits/props2.glb', PROPS2);
  const props = await io.read(PROPS2);
  const pScene = required(props.getRoot().getDefaultScene() ?? props.getRoot().listScenes()[0]);
  const want = new Set(PROPS2_MODELS);
  /** @type {Set<string>} */
  const found = new Set();
  for (const child of pScene.listChildren()) {
    if (want.has(child.getName())) found.add(child.getName());
    else {
      pScene.removeChild(child);
      child.dispose();
    }
  }
  const missing = PROPS2_MODELS.filter((m) => !found.has(m));
  if (missing.length) throw new Error(`props2.glb lacks ${missing.join(', ')}`);
  await props.transform(prune());
  adopt(props, () => true);
  names.push(...PROPS2_MODELS);

  /** @type {Set<string>} */
  const seen = new Set();
  for (const n of names) {
    if (seen.has(n)) throw new Error(`two models named ${n}`);
    seen.add(n);
  }
  await target.transform(unpartition(), dedup(), prune({ keepLeaves: true }));
  await io.write(OUT, target);
  fs.writeFileSync(MANIFEST, JSON.stringify(Object.fromEntries([...pinned].sort()), null, 1) + '\n');
  // The kits' index (assets.ts and the tests read it): the town kit's models.
  const indexFile = path.join(path.dirname(OUT), 'index.json');
  const index = assetRecord(JSON.parse(fs.readFileSync(indexFile, 'utf8')), indexFile);
  index['town'] = names;
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 1));
  console.log(`kits/town.glb  ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB (${names.length} models)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
