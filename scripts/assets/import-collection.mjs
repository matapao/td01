/**
 * Copies the curated selection the game takes from "The Complete KayKit Collection v7" (a local
 * purchase, CC0 — see its License.txt) into an empty directory, in the layout build-assets.mjs
 * expects. Every copied source file is pinned by SHA-256 in collection-manifest.json (path relative
 * to the collection → sha256): the first copy of a file pins it, every later run verifies it and
 * fails loudly on a mismatch. Nothing from the collection is ever run: files are only read and copied,
 * and each .gltf's own references (its .bin and textures) are parsed from its JSON and must be plain
 * file names next to it.
 *
 *   node scripts/assets/import-collection.mjs <collectionDir> <emptyOutDir>
 *   node scripts/assets/build-assets.mjs <downloadDir> <thatOutDir>
 *
 * Packs by Kay Lousberg — https://kaylousberg.com — license: CC0 1.0 (public domain).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { required } from '../../src/core/required.ts';
import { gltfUris, readPins } from './asset-data.mjs';

const MANIFEST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'collection-manifest.json');

const ADV = 'KayKit Adventurers 2.0';
const SKEL = 'KayKit Skeletons 1.1';
const S4 = 'KayKit Mystery Monthly Series 4 (1.1)';
const S5 = 'KayKit Mystery Monthly Series 5 (1.1)';
const S6 = 'KayKit Mystery Monthly Series 6 (1.1)';
const FOREST = 'KayKit Forest Nature Pack 1.0/Assets/gltf';
/**
 * Forest Nature palettes (each model ships in 8, one texture, palettes differ only in UVs): Color1 is
 * the green summer set (grey rocks), Color6 the orange autumn set. The others: Color2 emerald, Color3
 * lime, Color4 teal (blue-grey rocks), Color5 golden with pale trunks, Color7 red, Color8 pink.
 * There is no snowy palette; the bare trees (Tree_Bare_*) come in every palette.
 */
const PALETTES = ['Color1', 'Color6'];
const NATURE = /^(Tree|Bush|Rock)_|^Grass_.*_Singlesided_/;

/**
 * Every Dungeon Pack 1.1 piece that kits/dungeon.glb (the Remastered pack from GitHub, picked in
 * fetch-kaykit.mjs) lacks: the 1.1 additions (tavern bar, beds, bookcases, round tables, modular
 * stairs, scaffolds, wall insets, chests, crates, rocks) and the Remastered banners, grates and trunks
 * the dungeon kit left out.
 */
const DUNGEON_EXTRA = [
  'banner_blue',
  'banner_green',
  'banner_white',
  'banner_yellow',
  'banner_patternA_green',
  'banner_patternA_white',
  'banner_patternA_yellow',
  'banner_patternB_blue',
  'banner_patternB_brown',
  'banner_patternB_green',
  'banner_patternB_white',
  'banner_patternC_blue',
  'banner_patternC_brown',
  'banner_patternC_green',
  'banner_patternC_white',
  'banner_patternC_yellow',
  'banner_shield_green',
  'banner_shield_white',
  'banner_thin_green',
  'banner_thin_white',
  'banner_triple_brown',
  'banner_triple_green',
  'banner_triple_white',
  'banner_triple_yellow',
  'bar_innercorner',
  'bar_outercorner',
  'bar_straight_A',
  'bar_straight_A_short',
  'bar_straight_B',
  'bar_straight_B_short',
  'bar_straight_C',
  'bar_straight_C_short',
  'bartop_A_large',
  'bartop_A_medium',
  'bartop_A_small',
  'bartop_B_large',
  'bartop_B_medium',
  'bartop_B_small',
  'bed_A_double',
  'bed_A_single',
  'bed_A_stacked',
  'bed_B_double',
  'bed_B_single',
  'bench',
  'book_brown',
  'book_grey',
  'book_tan',
  'bookcase_double',
  'bookcase_double_decoratedA',
  'bookcase_double_decoratedB',
  'bookcase_single',
  'bookcase_single_decoratedA',
  'bookcase_single_decoratedB',
  'bucket',
  'bucket_pickaxes',
  'ceiling_tile',
  'chest_large',
  'chest_large_gold',
  'chest_mimic',
  'crate_large',
  'crate_large_decorated',
  'crate_small',
  'floor_dirt_small_C',
  'floor_dirt_small_D',
  'floor_tile_big_grate_open',
  'floor_tile_big_spikes',
  'floor_tile_extralarge_grates',
  'floor_tile_extralarge_grates_open',
  'floor_tile_grate_open',
  'key_gold',
  'pickaxe',
  'pickaxe_gold',
  'post',
  'rocks',
  'rocks_decorated',
  'rocks_gold',
  'rocks_small',
  'scaffold_beam_corner',
  'scaffold_beam_wall',
  'scaffold_beams_connected',
  'scaffold_frame_large',
  'scaffold_frame_small',
  'scaffold_pillar_corner',
  'scaffold_pillar_wall',
  'scaffold_pillar_wall_cross',
  'scaffold_pillar_wall_cross_top',
  'scaffold_pillar_wall_torch',
  'scaffold_pillars_connected',
  'scaffold_pillars_connected_torch',
  'shelf_small_books',
  'shelves_decorated',
  'stairs_long',
  'stairs_long_modular_center',
  'stairs_long_modular_left',
  'stairs_long_modular_right',
  'stairs_modular_center',
  'stairs_modular_left',
  'stairs_modular_right',
  'stool_round',
  'table_long_decorated_B',
  'table_medium_decorated_B',
  'table_medium_tablecloth_decorated_B',
  'table_round_large',
  'table_round_medium',
  'table_round_small',
  'table_small_decorated_C',
  'trunk_medium_C',
  'trunk_small_C',
  'wall_archedwindow_gated_scaffold',
  'wall_doorway_Tsplit',
  'wall_inset',
  'wall_inset_candles',
  'wall_inset_shelves',
  'wall_inset_shelves_broken',
  'wall_inset_shelves_decoratedA',
  'wall_inset_shelves_decoratedB',
];

/**
 * What to copy. Each group copies models (.gltf with the .bin and textures it references, or a
 * self-contained .glb) from `from` (relative to the collection) into `to` (relative to the out dir).
 * `take`: 'all', a list of model names, or a filter. `rename`: source name → name in the kit, for
 * names that would clash inside one kit (the kit's node is named after the file).
 * `files`: plain files copied as they are ([source, target name]).
 */
/** @typedef {{to: string, files: [string, string][]} | {to: string, from: string, take: 'all' | string[] | ((name: string) => boolean), rename?: Record<string, string>}} AssetGroup */
/** @type {AssetGroup[]} */
const GROUPS = [
  { to: 'licenses', files: [['License.txt', 'KayKit-Complete-Collection-v7.txt']] },

  // kits/weapons.glb
  { to: 'weapons/fantasy', from: 'KayKit Fantasy Weapons Bits 1.0/Assets/gltf', take: 'all' },
  { to: 'weapons/adventurers', from: `${ADV}/Assets/gltf`, take: 'all' },
  { to: 'weapons/skeletons', from: `${SKEL}/assets/gltf`, take: 'all' },

  // kits/nature.glb
  ...PALETTES.map((c) => ({
    to: `nature/${c}`,
    from: `${FOREST}/${c}`,
    take: (/** @type {string} */ n) => NATURE.test(n),
  })),

  // kits/space.glb: a cartoony base on a grey, airless body. Space Base Bits without its red-orange
  // terrain blocks and rocks (they look like Mars); deck plates, ramps, pipes, railings, conveyors and
  // metal framing from the Platformer Pack (blue set + neutral grey); Prototype Bits' metal floor tiles.
  {
    to: 'space/base',
    from: 'KayKit Space Base Bits 1.0/Assets/gltf',
    take: (n) => !/^terrain_|^rocks?_/.test(n),
  },
  {
    to: 'space/platformer',
    from: 'KayKit Platformer Pack 1.0/Assets/gltf/blue',
    take: (n) => /^(platform_|pipe_|railing_|conveyor_|bracing_)/.test(n),
  },
  {
    to: 'space/platformer',
    from: 'KayKit Platformer Pack 1.0/Assets/gltf/neutral',
    take: (n) => /^(pillar_|structure_|strut_)/.test(n),
  },
  {
    to: 'space/prototype',
    from: 'KayKit Prototype Bits 1.1/Assets/gltf',
    take: ['Floor', 'Floor_Prototype'],
  },

  // kits/props2.glb
  { to: 'props2/resources', from: 'KayKit Resource Bits 1.0/Assets/gltf', take: 'all' },
  { to: 'props2/tools', from: 'KayKit RPG Tools Bits 1.0/Assets/gltf', take: 'all' },
  { to: 'props2/furniture', from: 'KayKit Furniture Bits 1.0/Assets/gltf', take: 'all' },
  // halloween.glb already has every crypt, coffin, grave, fence and lantern; these are the village
  // and farm pieces it lacks (the rest of the pack is candy, a tractor and hedge mazes).
  {
    to: 'props2/halloween',
    from: 'KayKit Halloween Bits 1.0/Assets/gltf',
    take: [
      'haybale',
      'scarecrow',
      'wagon',
      'wagon_hay',
      'wooden_gate',
      'sign_both',
      'sign_left',
      'sign_right',
    ],
  },
  {
    to: 'props2/dungeon',
    from: 'KayKit Dungeon Pack 1.1/Assets/gltf',
    take: DUNGEON_EXTRA,
    rename: { pickaxe: 'dungeon_pickaxe' },
  },
  // Mystery Monthly: the fantasy props, and the weapons of the characters in characters2.
  {
    to: 'props2/orcraider',
    from: `${S4}/1 - July 2023 - Orc Raider/assets/gltf`,
    take: ['Orc_Wardrum', 'Orc_WardrumStick', 'Orc_Club', 'Orc_DrinkingHorn', 'Orc_Axe'],
    rename: { Orc_Axe: 'OrcRaider_Axe' },
  },
  {
    to: 'props2/orcbrute',
    from: `${S6}/2 - August 2025 - Orc Brute/assets/gltf`,
    take: ['Orc_Banner', 'Orc_Banner_Large', 'Orc_Axe', 'Orc_Axe_Large'],
    rename: { Orc_Axe: 'OrcBrute_Axe' },
  },
  {
    to: 'props2/werewolf',
    from: `${S4}/4 - October 2023 - Werewolf/assets/gltf`,
    take: ['axe'],
    rename: { axe: 'Werewolf_Axe' },
  },
  {
    to: 'props2/paladin',
    from: `${S4}/10 - April 2024 - Paladin/assets/gltf`,
    take: ['paladin_hammer', 'paladin_shield', 'paladin_book', 'paladin_statue'],
  },
  {
    to: 'props2/ninja',
    from: `${S4}/8 - February 2024 - Ninja/assets/gltf`,
    take: ['Ninja_Katana', 'Ninja_Shuriken'],
  },
  {
    to: 'props2/blackknight',
    from: `${S5}/3 - September 2024 - Black Knight/assets/gltf`,
    take: ['BlackKnight_Sword', 'BlackKnight_Sword_Large', 'BlackKnight_Shield', 'BlackKnight_Shield_Large'],
  },
  {
    to: 'props2/vampire',
    from: `${S5}/4 - October 2024 - Vampire/assets/gltf`,
    take: ['Vampire_Throne', 'Vampire_Goblet', 'Vampire_Sword', 'Gem_Large', 'Gem_Medium', 'Gem_Small'],
    rename: {
      Gem_Large: 'Vampire_Gem_Large',
      Gem_Medium: 'Vampire_Gem_Medium',
      Gem_Small: 'Vampire_Gem_Small',
    },
  },
  {
    to: 'props2/witch',
    from: `${S5}/5 - November 2024 - Witch/assets/gltf`,
    take: [
      'Cauldron',
      'Potionstation',
      'Potionstation_decorated',
      'Broom',
      'Mortar',
      'Pestle',
      'Basket',
      'Basket_Mushrooms',
    ],
  },
  {
    to: 'props2/frostgolem',
    from: `${S5}/7 - January 2025 - FrostGolem/assets/gltf`,
    take: ['FrostGolem_Axe', 'FrostGolem_Axe_Large'],
  },
  {
    to: 'props2/caveman',
    from: `${S5}/8 - February 2025 - Caveman/assets/gltf`,
    take: ['Campfire_Base', 'Campfire_Logs', 'Caveman_Axe', 'Caveman_Club', 'Caveman_Spear'],
  },
  {
    to: 'props2/tiefling',
    from: `${S5}/12 - June 2025 - Tiefling/assets/gltf`,
    take: ['Tiefling_Sword', 'Tiefling_SwordsBackpack'],
  },
  {
    to: 'props2/lorekeeper',
    from: `${S6}/1 - July 2025 - Lorekeeper/assets/gltf`,
    take: ['Lorekeeper_Staff', 'Lorekeeper_Tome'],
  },
  {
    to: 'props2/cleric',
    from: `${S6}/3 - September 2025 - Cleric/assets/gltf`,
    take: ['Cleric_Font', 'Cleric_Mace', 'Cleric_Shield', 'Cleric_Tome'],
  },
  {
    to: 'props2/monstrosity',
    from: `${S6}/4 - October 2025 - Monstrosity/assets/gltf`,
    take: [
      'Monstrosity_BarndoorShield',
      'Monstrosity_BarndoorShield_Large',
      'Monstrosity_Pitchfork',
      'Monstrosity_Pitchfork_Large',
    ],
  },
  {
    to: 'props2/plantwarrior',
    from: `${S6}/5 - November 2025 - Plant Warrior/assets/gltf`,
    take: [
      'PlantWarrior_Arrow',
      'PlantWarrior_Bow',
      'PlantWarrior_Bow_withString',
      'PlantWarrior_Shield',
      'PlantWarrior_Spear',
    ],
  },
  { to: 'props2/hoarder', from: `${S6}/8 - February 2026 - Hoarder/assets/gltf`, take: ['Hoarder_Sword'] },
  {
    to: 'props2/avianswordsman',
    from: `${S6}/9 - March 2026 - Avian Swordsman/assets/gltf`,
    take: ['AvianSwordsman_Sword'],
  },
  {
    to: 'props2/farmers',
    from: `${S6}/12 - June 2026 - Farmers/assets/gltf`,
    take: ['carrot', 'lettuce', 'dirt_plot', 'pitchfork', 'wheelbarrow', 'wheelbarrow_empty'],
  },

  // kits/robots.glb: the props of the robots, the mech and the space ranger in characters2.
  { to: 'robots/robot', from: `${S4}/12 - June 2024 - Robot/assets/gltf`, take: ['Robot_ChargingStation'] },
  {
    to: 'robots/spaceranger',
    from: `${S4}/7 - January 2024 - Space Ranger/assets/gltf`,
    take: ['SpaceRanger_Blade', 'SpaceRanger_Helmet', 'SpaceRanger_Jetpack', 'SpaceRanger_Rifle'],
  },
  {
    to: 'robots/combatmech',
    from: `${S5}/1 - July 2024 - Combat Mech/assets/gltf`,
    take: ['CombatMech_Axe', 'CombatMech_Minigun'],
  },
  { to: 'robots/4gtn', from: `${S6}/7 - January 2026 - 4GTN/assets/gltf`, take: ['4GTN_Katana'] },

  // kits/bits.glb: Holiday Bits' train set (track pieces, the locomotive, tenders and wagon) and
  // Mixed Bag's tool carts (the rest of those packs is Christmas, gingerbread and modern toys).
  { to: 'bits/train', from: 'KayKit Holiday Bits 1.0/Assets/gltf', take: (n) => /^(tracks|train)_/.test(n) },
  { to: 'bits/mixedbag', from: 'KayKit Mixed Bag 1/Assets/gltf', take: ['toolcart', 'toolcart_tall'] },

  // kits/cards.glb: Board Game Bits' playing cards (the blank card, 52 faces, 2 jokers; one back).
  { to: 'cards/boardgame', from: 'KayKit Board Game Bits 1.0/Assets/gltf', take: (n) => /^card_/.test(n) },

  // characters2/: the 23-bone rig characters (Rig_Medium, big bodies Rig_Large), no animations.
  {
    to: 'characters2',
    from: `${ADV}/Characters/gltf`,
    take: [
      'Barbarian',
      'Barbarian_Large',
      'Druid',
      'Engineer',
      'Knight',
      'Mage',
      'Ranger',
      'Rogue',
      'Rogue_Hooded',
    ],
  },
  {
    to: 'characters2',
    from: `${SKEL}/characters/gltf`,
    take: [
      'Necromancer',
      'Skeleton_Golem',
      'Skeleton_Mage',
      'Skeleton_Minion',
      'Skeleton_Rogue',
      'Skeleton_Warrior',
    ],
  },
  { to: 'characters2', from: `${S4}/1 - July 2023 - Orc Raider/character`, take: ['OrcRaider'] },
  {
    to: 'characters2',
    from: `${S4}/4 - October 2023 - Werewolf/characters/gltf`,
    take: ['Werewolf_Man', 'Werewolf_Wolf'],
  },
  { to: 'characters2', from: `${S4}/8 - February 2024 - Ninja/character`, take: ['Ninja'] },
  {
    to: 'characters2',
    from: `${S4}/10 - April 2024 - Paladin/characters/gltf`,
    take: ['Paladin', 'Paladin_with_Helmet'],
  },
  { to: 'characters2', from: `${S5}/3 - September 2024 - Black Knight/characters`, take: ['BlackKnight'] },
  { to: 'characters2', from: `${S5}/4 - October 2024 - Vampire/characters`, take: ['Vampire'] },
  { to: 'characters2', from: `${S5}/5 - November 2024 - Witch/characters`, take: ['Witch'] },
  { to: 'characters2', from: `${S5}/7 - January 2025 - FrostGolem/characters`, take: ['FrostGolem'] },
  { to: 'characters2', from: `${S5}/8 - February 2025 - Caveman/characters`, take: ['Caveman'] },
  { to: 'characters2', from: `${S5}/12 - June 2025 - Tiefling/characters`, take: ['Tiefling'] },
  { to: 'characters2', from: `${S6}/1 - July 2025 - Lorekeeper/characters`, take: ['Lorekeeper'] },
  { to: 'characters2', from: `${S6}/2 - August 2025 - Orc Brute/characters`, take: ['OrcBrute'] },
  { to: 'characters2', from: `${S6}/3 - September 2025 - Cleric/characters`, take: ['Cleric'] },
  { to: 'characters2', from: `${S6}/4 - October 2025 - Monstrosity/characters`, take: ['Monstrosity'] },
  { to: 'characters2', from: `${S6}/5 - November 2025 - Plant Warrior/characters`, take: ['PlantWarrior'] },
  { to: 'characters2', from: `${S6}/8 - February 2026 - Hoarder/characters`, take: ['Hoarder'] },
  { to: 'characters2', from: `${S6}/9 - March 2026 - Avian Swordsman/characters`, take: ['AvianSwordsman'] },
  { to: 'characters2', from: `${S6}/12 - June 2026 - Farmers/characters`, take: ['Farmer_A', 'Farmer_B'] },
  // The robots, the mech and the space ranger (with his flight-mode helmet and jetpack).
  { to: 'characters2', from: `${S4}/12 - June 2024 - Robot/characters`, take: ['Robot_One', 'Robot_Two'] },
  { to: 'characters2', from: `${S5}/9 - March 2025 - Clanker/characters`, take: ['Clanker'] },
  { to: 'characters2', from: `${S6}/7 - January 2026 - 4GTN/characters`, take: ['4GTN', '4GTN_Forgotten'] },
  { to: 'characters2', from: `${S5}/1 - July 2024 - Combat Mech/characters`, take: ['CombatMech'] },
  {
    to: 'characters2',
    from: `${S4}/7 - January 2024 - Space Ranger/character`,
    take: ['SpaceRanger', 'SpaceRanger_FlightMode'],
  },
  // OrcRaider.glb ships without its texture (its props embed this exact file); the build attaches it.
  {
    to: 'characters2/textures',
    files: [[`${S4}/1 - July 2023 - Orc Raider/textures/orc_texture_A.png`, 'orc_texture_A.png']],
  },

  // characters2/anims_*.glb: the clip libraries of Character Animations 1.1.
  { to: 'anims/Rig_Medium', from: 'KayKit Character Animations 1.1/Animations/gltf/Rig_Medium', take: 'all' },
  { to: 'anims/Rig_Large', from: 'KayKit Character Animations 1.1/Animations/gltf/Rig_Large', take: 'all' },
];

const [collectionArg, destArg] = process.argv.slice(2);
if (!collectionArg || !destArg) {
  console.error('usage: node scripts/assets/import-collection.mjs <collectionDir> <emptyOutDir>');
  process.exit(1);
}
const collection = required(collectionArg);
const dest = required(destArg);
if (!fs.existsSync(path.join(collection, 'License.txt'))) {
  console.error(`${collection}: not the KayKit collection (no License.txt)`);
  process.exit(1);
}
if (`${path.resolve(dest)}${path.sep}`.startsWith(`${path.resolve(collection)}${path.sep}`)) {
  console.error('the out dir must not be inside the collection');
  process.exit(1);
}
fs.mkdirSync(dest, { recursive: true });
if (fs.readdirSync(dest).length) {
  console.error(`${dest} is not empty`);
  process.exit(1);
}

const pins = readPins(MANIFEST);
/** @type {Map<string, string>} */
const seen = new Map();
/** @type {string[]} */
const mismatches = [];
/** @type {Map<string, string>} */
const written = new Map();
let bytes = 0;

const MODEL = /\.gltf\.glb$|\.gltf$|\.glb$/;

/** Copies one collection file (path relative to the collection) to the out dir, checking its pin. */
/** @param {string} rel @param {string} target */
function copy(rel, target) {
  const data = fs.readFileSync(path.join(collection, rel));
  const sha = crypto.createHash('sha256').update(data).digest('hex');
  seen.set(rel, sha);
  if (pins.get(rel) && pins.get(rel) !== sha) {
    mismatches.push(`${rel}: pinned ${pins.get(rel)}, found ${sha}`);
    return;
  }
  const out = path.join(dest, target);
  const prev = written.get(out);
  if (prev !== undefined) {
    if (prev !== sha) throw new Error(`${target}: two different files would land here`);
    return;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, data);
  written.set(out, sha);
  bytes += data.length;
}

/** The external files a .gltf / .glb references (buffers, images): plain names next to it. */
/** @param {string} file */
function references(file) {
  const buf = fs.readFileSync(file);
  /** @type {unknown} */
  let json;
  if (file.endsWith('.gltf')) json = JSON.parse(buf.toString('utf8'));
  else {
    if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a glb`);
    json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  }
  const uris = gltfUris(json, file).filter((uri) => !uri.startsWith('data:'));
  return uris.map((u) => {
    const name = decodeURIComponent(u);
    if (name !== path.basename(name) || name.startsWith('.'))
      throw new Error(`${file}: unexpected reference ${u}`);
    return name;
  });
}

let models = 0;
for (const g of GROUPS) {
  if ('files' in g) {
    for (const [rel, as] of g.files) copy(rel, path.join(g.to, as));
    continue;
  }
  const dir = path.join(collection, g.from);
  /** @type {Map<string, string>} */
  const available = new Map();
  for (const f of fs.readdirSync(dir).sort())
    if (MODEL.test(f) && !f.startsWith('.')) available.set(f.replace(MODEL, ''), f);
  let names;
  if (g.take === 'all') names = [...available.keys()];
  else if (typeof g.take === 'function') names = [...available.keys()].filter(g.take);
  else {
    const missing = g.take.filter((n) => !available.has(n));
    if (missing.length) throw new Error(`${g.from}: missing ${missing.join(', ')}`);
    names = g.take;
  }
  for (const name of names) {
    const file = required(available.get(name));
    const ext = file.slice(name.length);
    const as = (g.rename?.[name] ?? name) + (ext === '.gltf.glb' ? '.glb' : ext);
    copy(`${g.from}/${file}`, path.join(g.to, as));
    for (const ref of references(path.join(dir, file))) {
      if (!fs.existsSync(path.join(dir, ref)))
        throw new Error(`${g.from}/${file}: references missing ${ref}`);
      copy(`${g.from}/${ref}`, path.join(g.to, ref));
    }
    models++;
  }
  console.log(`${g.to.padEnd(24)} ${String(names.length).padStart(4)} from ${g.from}`);
}

if (mismatches.length) {
  console.error(
    `\n${mismatches.length} file(s) differ from collection-manifest.json — check them, then update the pins:\n  ${mismatches.join('\n  ')}`,
  );
  process.exit(1);
}
const added = [...seen.keys()].filter((k) => !pins.has(k));
const dropped = [...pins.keys()].filter((k) => !seen.has(k));
if (added.length || dropped.length) {
  const next = Object.fromEntries([...seen].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  fs.writeFileSync(MANIFEST, `${JSON.stringify(next, null, 1)}\n`);
  console.log(`collection-manifest.json: pinned ${added.length} new file(s), dropped ${dropped.length}`);
}
console.log(
  `copied ${written.size} files (${(bytes / 1048576).toFixed(1)} MB, ${models} models) into ${dest}; ${seen.size - added.length} verified against their pins`,
);
