# The Complete KayKit Collection (v7) — what it gives us

Scanned 2026-10-18 from `~/Downloads/The Complete KayKit Collection v7` (644 MB zip, 23 packs,
~4,500 models). Licence: **CC0** for everything (`License.txt` in the collection; credit optional:
"Kay Lousberg, www.kaylousberg.com"). Every pack ships glTF (+ FBX/OBJ, and the source .blend).
The free packs we already use are pinned from GitHub/itch by `scripts/assets/fetch-kaykit.mjs`; the
collection is a local purchase, so what we take from it is copied from a local path and pinned by
SHA-256 (never run anything from inside the download).

## What's in it

| Pack                                                                          | Models                 | What matters for BrowserDefense                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Adventurers 2.0**                                                           | 9 characters, 58 props | Knight, Barbarian (+ Large), Mage, Rogue (+ Hooded), **Druid, Engineer, Ranger** — new rig. Weapons: 1H/2H swords and axes, bow/crossbows, staff, wand, spellbook, shields (round, spiked, square, badge, barbarian), quiver, potions (4 sizes × 4 colours), smokebomb, engineer's wrench, **turret base**.                                                                                                                                                                                                                                                                                                                                                                                   |
| **Skeletons 1.1**                                                             | 6 characters, 19 props | Minion, Warrior, Rogue, Mage, **Necromancer, Skeleton Golem**; mace, scythe, dagger, golem axe, shields A/B, arrows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Character Animations 1.1**                                                  | 2 rigs, 14 libraries   | **Rig_Medium**: 139 clips in 8 sets — General, MovementBasic/Advanced (dodges, strafes, crouch, sneak), CombatMelee (1H/2H/dual-wield/unarmed, block), CombatRanged (1H/2H, **bow draw/release**, magic cast/summon), **Tools (Chop, Pickaxing, Digging, Hammering, Sawing, Working, Fishing, Lockpicking, Holding)**, Simulation (sit, lie, cheer, wave), Special (skeleton awaken/death/resurrect/taunt). **Rig_Large** for big bodies.                                                                                                                                                                                                                                                     |
| **Mystery Monthly 4–6**                                                       | 39 characters + props  | Fantasy cast: **Orc Raider** (war drum, horn), **Orc Brute** (banners), **Werewolf** (man + wolf), **Black Knight**, **Vampire** (throne, goblet, gems), **Frost Golem**, **Monstrosity** (barn-door shield, pitchfork), Caveman (campfire), **Witch** (cauldron, potion station, broom); allies and townsfolk: Paladin, **Cleric** (font, mace), **Lorekeeper** (staff, tome), **Farmers** (plots, carrot, lettuce, wheelbarrow), Tiefling, Ninja, Plant Warrior, Avian Swordsman, Marksman, Hiker. Robots (Robot One/Two, the Clanker, 4GTN), the Combat Mech and the Space Ranger are imported too (see Imported). Off-theme for now: superhero, survivalist, driver, animatronics, clown. |
| **Fantasy Weapons Bits**                                                      | 48                     | Swords A–G, axes A–D, hammers A–D, daggers A–C, spears A–B, halberd, scythe, staffs A–D, wands A–B, bows A–C, fist weapons, shields A–D, arrows — **visible weapon tiers**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Dungeon Pack 1.1**                                                          | 283                    | The Remastered set we use (our pinned GitHub copy has 203) plus the 1.1 extras: tavern bar pieces, more beds, bookcases…                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Medieval Hexagon 1.0.1**                                                    | 404                    | Same as our pinned copy: 27 buildings × 4 colours (castle, church, tavern, stables, windmill, well, townhall, workshop, watermill, **tower_base / tower_A (roofed) / tower_B (gallery)**, cannon & catapult towers…), walls & gates, units (horses, carts, ships, catapults, cannons), hex tiles.                                                                                                                                                                                                                                                                                                                                                                                             |
| **Forest Nature Pack**                                                        | 1,588                  | **32 trees (incl. bare), 22 bushes, ~65 rocks, grass, hills, cliffs — each in 8 colour palettes** (seasons / biomes per region).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Resource Bits**                                                             | 132                    | Our 20 + gems (small/medium/large, piles, chest, sack), gold/silver/copper/iron bars & nuggets in stacks, food (apples, berries, fish, cheese, flour), fuel barrels, containers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **RPG Tools Bits**                                                            | 69                     | Our 24 + blueprints, journals, maps, drafting compass, magnifier, lantern, lockpicks, fishing gear, hand drill, plane, saw, trowel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Furniture / Restaurant**                                                    | 74 / 225               | Beds, desks, shelves, rugs, lamps / kitchens, crates of food, stoves — tavern and house interiors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Halloween / Holiday**                                                       | 102 / 138              | Crypts, graves, coffins, fences, lanterns / seasonal events — and a toy train set (track pieces, a steam engine, tenders, a wagon): the Rails' line.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| City Builder, Space Base, Platformer, Prototype, Block, Board Game, Mixed Bag | ~1,100                 | Modern/sci-fi/toy sets. Not for the vale now; Space Base (with Platformer deck plates and pipes) is the space colony of later eras; City Builder doesn't fit (see Imported). Board Game Bits' playing cards and Mixed Bag's tool carts are imported (the punched cards' art, the scrapyard).                                                                                                                                                                                                                                                                                                                                                                                                  |

## The one technical step that unlocks most of it: the new rig

Everything character-shaped in the collection (Adventurers 2.0, Skeletons 1.1, all Mystery
characters) shares one **23-bone rig** (Rig_Medium; big bodies use Rig_Large) with **no animations
baked in** and one texture each (270–700 KB per character). One animation library then drives every
character. Our characters are still the 1.0 packs (41-bone rig, clips baked into each file), so the
new characters, the tool animations and the bow animations all come with one migration: characters
from the collection, a Rig_Medium (+ Rig_Large) clip library trimmed to the clips we play, and a
name map for the clips (`Melee_1H_Attack_Chop` for `1H_Melee_Attack_Chop`, `Idle_A` for `Idle`, …).

## What it makes possible

**Mobs** — real models instead of re-tints: the Necromancer for the necromancer, the Skeleton Golem
for the crusher and the Colossus, and new families for the threat model — orc raiders (fast,
burn buildings; the Brute as a siege boss with its war drum), werewolves (night runners), the Black
Knight and the Vampire as bosses, the Frost Golem (slows towers), the Monstrosity (shield-wall
brute), and the Witch on her broom as a flyer that dives at open tower tops.

**Heroes and classes** — Druid, Engineer (wrench + turret base: fits the Road of Invention),
Ranger (bow), Rogue, Paladin and Cleric as further classes; every class animated for real work:
chopping trees, pickaxing seams, hammering at sites and the anvil, sawing at the sawmill, digging.

**Weapons and gear** — hero gear tiers you can see: sword A→G, axe A→D, hammer A→D, staff A→D,
bow A→C, shields A–D, each a step up made at the Blacksmith (its room) from bars and gems.

**Towers** — one upgrade path for the archer's top: open platform → roofed turret (tower_A) →
gallery under a roof (tower_B), covering the archer from flyers; the bow
draw/release clips for the archer.

**Buildings and rooms** — tavern (bar pieces, kitchen, beds), church/shrine (Cleric's font),
the Arcanist's room (the Witch's cauldron and potion station), a drafting room for plans
(blueprints, compass, journals), farms (Farmers' plots, carrots, lettuce, wheelbarrow), stables,
windmill, well — and NPCs that sit, lie, cheer and wave.

**The world** — the Forest Nature trees, bushes, rocks and cliffs in a palette per region (green
home ring, autumn woods further out, bare trees by the crypts), resources that look like what they
are (gem piles in the mines, bars stacked at the smithy, food in crates).

## Order of work

1. Tower tops (open → turret → gallery) and the flyer threat they answer. _(Done.)_
2. The rig migration: heroes, skeletons and the clip library from the collection; tool and bow
   animations wired to gathering, crafting and the tower archer. _(Done — see "In the game" below.)_
3. Mobs on the new rig: Necromancer and Skeleton Golem in _(done)_, then new families wave by wave.
4. Weapon tiers at the Blacksmith. _(Done.)_
5. The Forest Nature world pass (trees, bushes, rocks; palettes by region), mind the frame budget
   (instancing; mediocre laptops first). _(Pack trees are batched per model in patches. There is one visual preset; generated models are loading fallbacks only.)_
6. More rooms: the Arcanist (Witch's cauldron), a tavern, a drafting room.

## In the game: the cast, its clips and its weapons

The game's characters are all from `characters2/` now (the KayKit 1.0 files in `characters/` stay on
disk, unloaded). `src/view/assets.ts` (`CAST`) knows each one's rig; the heroes (Knight, Barbarian,
Mage) and `anims_medium.glb` come with the world, everyone else — and `anims_large.glb` with the first
Rig_Large body — streams in when first wanted (`needCharacter`; a view stands empty until its model is
in, then fills in: never a loading screen). `src/view/characters.ts` holds the cast (`SPECS`, `VENDORS`),
the props in their hands (models of `weapons.glb`, `gear.glb` and `tools.glb` on `handslot.r/.l`, at
identity — KayKit's convention; the shovel's blade turned down, the saw's blade forward) and the clip
names: the 1.0 names the game used still play (`CLIP_MAP`), and a Rig_Large body plays its own library's
stand-in for a Rig_Medium clip it lacks (`LARGE_CLIPS`).

| Who                                                                                                                                                                                            | Model                                                                                            | In hand                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Knight (Tank)                                                                                                                                                                                  | `Knight`                                                                                         | `sword_A`–`G` + `shield_A`–`D` by tier                                   |
| Warchief (Support)                                                                                                                                                                             | `Barbarian`                                                                                      | `axe_A`, `axe_C`, `axe_B`, `axe_D` by tier; his tools while working      |
| Mage (Magic)                                                                                                                                                                                   | `Mage`                                                                                           | `staff_A`–`D` by tier                                                    |
| Tower archer                                                                                                                                                                                   | `Ranger`                                                                                         | `bow_withString`; `arrow_bow` on the string from the nock to the release |
| Footman / captain                                                                                                                                                                              | `Knight` (no cape) / `Paladin_with_Helmet`                                                       | `sword_B` + `shield_B` / `sword_2handed`                                 |
| Skeleton Minion / Bone Runner / Skeleton Warrior                                                                                                                                               | `Skeleton_Minion` / `Skeleton_Rogue` / `Skeleton_Warrior`                                        | blade / two daggers / axe and large shield                               |
| Necromancer                                                                                                                                                                                    | `Necromancer`                                                                                    | `Skeleton_Staff`                                                         |
| Wraith                                                                                                                                                                                         | `Skeleton_Minion`, ghostly, flying                                                               | —                                                                        |
| Grave Digger                                                                                                                                                                                   | `Skeleton_Rogue`, earth-tinted                                                                   | a shovel                                                                 |
| The Lich                                                                                                                                                                                       | `Skeleton_Mage` at boss size, blue-tinted, green glow                                            | `Skeleton_Staff`                                                         |
| Bone Crusher / Bone Colossus                                                                                                                                                                   | `Skeleton_Golem` (Rig_Large) at 1.45× / 2.6× a hero's height                                     | `Skeleton_Mace_Large` / `Skeleton_Golem_Axe_Large` + a shield            |
| Down the mine: Cave Wolf · Tunnel Raider · Stone Golem                                                                                                                                         | `Werewolf_Wolf` (grey-tinted) · `OrcRaider` · `FrostGolem` (Rig_Large, stone-tinted, ember eyes) | — · `OrcRaider_Axe` · —                                                  |
| Market · Smithy · Arcane Emporium · Builders' Guild                                                                                                                                            | `Farmer_A` · `Knight` bare-headed, hammer · `Cleric` · `Lorekeeper`                              |                                                                          |
| Dwarven Trading Post · Witch's Hut · Goblin Scrapper                                                                                                                                           | `Engineer` (small, wrench) · `Witch` · `Hoarder` (small)                                         |                                                                          |
| Townsfolk (view only, `src/view/townsfolk.ts`): gate and wall-walk guards · traders, shoppers, gardeners, farmers, a picker, the stablehand, a fisher, the tavern's regulars · the old scholar | `Knight` (the footmen's look) · `Farmer_A` / `Farmer_B` · `Lorekeeper`                           | sword and shield · `shovel` (digging), `fishing_rod`, `mug_full`         |

Clips the game plays (Rig_Medium): `Idle_A/B`, `Running_A/B`, `Running_Strafe_Left/Right`,
`Walking_A/B/C`, `Walking_Backwards`, `Jump_Full_Short`, `Death_A/B`, `Spawn_Air`, `Spawn_Ground`,
`Throw`, `Use_Item`, `Interact`, `PickUp`, `Cheering`, `Waving`, `Crouching`, `Holding_A`; melee
`Melee_1H_Attack_Chop/Slice_Diagonal/Slice_Horizontal/Stab/Jump_Chop`, `Melee_2H_Attack_Slice/Stab`,
`Melee_2H_Idle`, `Melee_Unarmed_Idle`, `Melee_Block`, `Melee_Block_Attack` (Shield Bash),
`Melee_Blocking` (Shield Wall, the warrior's guard), `Melee_Dualwield_Attack_Stab`; magic
`Ranged_Magic_Shoot/Raise/Summon/Spellcasting`; the bow `Ranged_Bow_Idle`, `Ranged_Bow_Draw`,
`Ranged_Bow_Release`, `Ranged_Bow_Aiming_Idle`; work `Chopping`, `Pickaxing`, `Digging`, `Hammering`,
`Sawing`, `Working_A/B/C`; the dead `Skeletons_Walking`, `Skeletons_Idle`, `Skeletons_Death`,
`Skeletons_Death_Resurrect`, `Skeletons_Spawn_Ground`, `Skeletons_Awaken_Floor`, `Skeletons_Taunt`.
Rig_Large: `Idle_A/B`, `Walking_A`, `Death_A`, `Melee_2H_Attack`, `Melee_2H_Slam`, `Melee_1H_Slash`,
`Flexing`. The libraries are loaded whole (the clips not played cost download only); trimming them to
the clips above is a build step for later.

## Imported

What `scripts/assets/import-collection.mjs` copies out of the collection (2,249 source files, each pinned
by SHA-256 in `scripts/assets/collection-manifest.json`) and `scripts/assets/build-assets.mjs` builds into
`public/assets`. Each import leaves what was built before untouched (byte for byte). What the game loads
is in `src/view/assets.ts`: the rail line and the scrapyard load `kits/bits.glb`, the decide minigame's
card art `kits/cards.glb`, both on demand; every character is from `characters2/` on its rig's clip
library, with `kits/weapons.glb` in their hands (see "In the game" below). Licence:
`public/assets/licenses/KayKit-Complete-Collection-v7.txt`. Every kit model is a top-level node named
after its file, as in the other kits.

| Output                         | Size                           | Contents                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kits/weapons.glb`             | 3.3 MB                         | 125 models: Fantasy Weapons Bits (48), Adventurers 2.0 props (58), Skeletons 1.1 props (19)                                                                                                                                                                                                                                                                                                                                  |
| `kits/nature.glb`              | 2.2 MB                         | 258 models: Forest Nature trees, bushes, rocks, grass (129) in 2 palettes                                                                                                                                                                                                                                                                                                                                                    |
| `kits/space.glb`               | 2.5 MB                         | 121 models: Space Base Bits without its terrain and rocks (57), Platformer Pack deck plates, ramps, pipes, railings, conveyors and framing (62), Prototype Bits floor tiles (2)                                                                                                                                                                                                                                              |
| `kits/props2.glb`              | 13.0 MB                        | 465 models: Resource Bits, RPG Tools, Furniture, Dungeon 1.1 and Halloween extras, Mystery Monthly props                                                                                                                                                                                                                                                                                                                     |
| `kits/robots.glb`              | 0.7 MB                         | 8 models: the props of the robots, the Combat Mech and the Space Ranger                                                                                                                                                                                                                                                                                                                                                      |
| `kits/bits.glb`                | 0.7 MB                         | 14 models: Holiday Bits' train set (12), Mixed Bag's tool carts (2)                                                                                                                                                                                                                                                                                                                                                          |
| `kits/mine.glb`                | 0.36 MB                        | The 8 models of `props2.glb` the mine shows, taken out by `scripts/assets/build-mine-kit.mjs`: Dungeon 1.1 timber sets (`scaffold_pillar_wall`, `scaffold_beam_wall`), the lairs' gear (`Campfire_Base`, `Campfire_Logs`, `Orc_Wardrum`, `Orc_Banner`, `dungeon_pickaxe`) and the tunnel raiders' `OrcRaider_Axe` (the rock, its ore and crystals are drawn, not modelled; add a name there when the mine shows a new model) |
| `kits/cards.glb`               | 1.5 MB                         | 55 models: Board Game Bits' playing cards (the blank card, 52 faces, 2 jokers)                                                                                                                                                                                                                                                                                                                                               |
| `kits/town.glb`                | 3.1 MB                         | 77 models built by `scripts/assets/build-town-kit.mjs` (sources pinned in `town-manifest.json`), streamed in after the world: the town inside the wall and the workshops' rooms (see **town** below)                                                                                                                                                                                                                         |
| `characters2/<Name>.glb`       | 20.5 MB (44 files, 0.2–1.5 MB) | the 23-bone rig characters, skinned meshes only                                                                                                                                                                                                                                                                                                                                                                              |
| `characters2/anims_medium.glb` | 3.2 MB                         | 131 clips for Rig_Medium (rig only, no meshes)                                                                                                                                                                                                                                                                                                                                                                               |
| `characters2/anims_large.glb`  | 0.7 MB                         | 28 clips for Rig_Large (rig only, no meshes)                                                                                                                                                                                                                                                                                                                                                                                 |

Left out by decision: City Builder Bits (doesn't fit the game), and Space Base's red-orange `terrain_*`
blocks (8) and rocks (`rock_A/B`, `rocks_A/B`): space is a cartoony sci-fi colony on a grey, airless
body under the stars, nothing Mars-like. Also left out: the rest of Holiday Bits (gingerbread houses,
presents, candy, snowmen — Christmas), of Mixed Bag (arcade machines, skateboards, guitars and other modern
toys) and of Board Game Bits (dice, chess, checkers, dominoes, tokens, and the player cards and tiles with
their 7 MB of portrait textures).

**weapons** — Fantasy Weapons Bits: `sword_A`–`G`, `axe_A`–`D`, `hammer_A`–`D`, `staff_A`–`D`,
`dagger_A`–`C`, `spear_A/B`, `wand_A/B`, `bow_A`–`C` (+ `_withString`), `shield_A`–`D`, `arrow_A`–`C`,
`halberd`, `scythe`, `fistweapon_A/B` (+ `_stacked`), `fistweapon_C_left/right/stacked`.
Adventurers 2.0: `sword_1handed`, `sword_2handed(_color)`, `axe_1handed`, `axe_2handed` (+ `_Large`),
`dagger`, `bow(_withString)`, `crossbow_1handed/2handed`, `arrow_bow(_bundle)`, `arrow_crossbow(_bundle)`,
`quiver`, `staff`, `druid_staff`, `wand`, `spellbook_open/closed`, `shield_round(_color)`,
`shield_round_barbarian(_Large)`, `shield_spikes(_color)`, `shield_square(_color)`, `shield_badge(_color)`,
`potion_{small,medium,large,huge}_{red,blue,green,orange}`, `smokebomb`, `engineer_Wrench`, `turret_base`,
`ammo_crate(_withLid)`, `mug_empty/full` (+ `_Large`), `shotgun`. Skeletons 1.1: `Skeleton_Axe`, `_Blade`,
`_Crossbow`, `_Dagger`, `_Mace(_Large)`, `_Scythe`, `_Staff`, `_Golem_Axe(_Large)`, `_Shield_Small_A/B`,
`_Shield_Large_A/B`, `_Quiver`, `_Arrow`, `_Arrow_Half`, `_Arrow_Broken(_Half)`.

**nature** — every name ends in `_Color1` (green summer, grey rocks) or `_Color6` (orange autumn, pale
trunks, dark rocks): `Tree_1_A`–`C`, `Tree_2_A`–`E`, `Tree_3_A`–`C`, `Tree_4_A`–`C`, `Tree_5_A`–`F`,
`Tree_6_A`–`C`, `Tree_7_A`–`C`, `Tree_Bare_1_A`–`C`, `Tree_Bare_2_A`–`C`; `Bush_1_A`–`G`, `Bush_2_A`–`F`,
`Bush_3_A`–`C`, `Bush_4_A`–`F`; `Rock_1_A`–`Q`, `Rock_2_A`–`H`, `Rock_3_A`–`R`, `Rock_4_A`–`H`,
`Rock_5_A`–`H`, `Rock_6_A`–`H`; `Grass_{1,2}_{A,B,C,D}_Singlesided`. One 24 KB texture; the palettes
differ only in UVs, so another palette costs about 0.4 MB: Color2 emerald, Color3 lime, Color4 teal
(blue-grey rocks), Color5 golden, Color7 red, Color8 pink (`PALETTES` in import-collection.mjs). There
is no snowy palette.

**space** — Space Base Bits: `basemodule_A`–`E`, `basemodule_garage`, `roofmodule_base`,
`roofmodule_cargo_A`–`C`, `roofmodule_solarpanels`, `cargo_A/B` (+ `_packed`, `_stacked`),
`cargodepot_A`–`C`, `containers_A`–`D`, `dome` (glass), `drill_structure`, `dropship(_packed)`,
`eco_module`, `lander_A/B`, `lander_base`, `landingpad_large/small`, `lights`,
`mobile_base_cargo/carriage/command/frame`, `solarpanel`, `space_farm_small/large(_sprinkler)`,
`spacetruck(_large)`, `spacetruck_trailer`, `structure_low/tall`, `tunnel_straight_A/B`,
`tunnel_diagonal_long_A/B`, `tunnel_diagonal_short_A/B`, `water_storage`, `windturbine_low/tall`.
Platformer Pack, blue set (deck plates and walkways; names end in `_blue`): `platform_{1x1x1, 2x2x1/2/4,
4x2x1/2/4, 4x4x1/2/4, 6x2x1/2/4, 6x6x1/2/4}`, `platform_arrow_2x2x1/4x4x1`, `platform_decorative_1x1x1/2x2x2`,
`platform_hole_6x6x1`, `platform_slope_{2x2x2, 2x4x4, 2x6x4, 4x2x2, 4x4x4, 4x6x4, 6x2x2, 6x4x4, 6x6x4}`,
`pipe_straight_A/B`, `pipe_90_A/B`, `pipe_180_A/B`, `pipe_end`, `railing_straight/corner_single/double/padded`,
`conveyor_2x4x1/2x8x1/4x4x1/4x8x1`, `bracing_small/medium/large`; neutral grey metal framing:
`pillar_1x1x1/2/4/8`, `pillar_2x2x2/4/8`, `structure_A`–`C`, `strut_horizontal/vertical`. Prototype Bits:
`Floor` (dark metal tile), `Floor_Prototype` (blue grid tile). The Platformer pieces are sized on a 1-unit
grid (`platform_4x4x1` is 4 × 4 × 1), about twice the Space Base scale (a base module is ~2 units across):
scale them per use. Not in the collection: a rocket (besides `dropship` and the landers) or an antenna
(`structure_tall` and `lights` come closest). Left out of these packs: the Platformer rope nets, traps,
spikes and toys, Prototype's yellow blocking shapes, walls and doors, and Block Bits (voxel cubes).
Red/orange from the shared atlas, kept (their only flaw; share of each model's vertices on the Space Base
atlas's red, orange-red, amber, rust or light-orange swatches): `containers_D` (red 64%), `containers_B`
(amber 64%), `tunnel_straight_B` / `tunnel_diagonal_long_B` / `tunnel_diagonal_short_B` (orange-red
bands 56 / 50 / 30%), `landingpad_small/large` (orange-red rim ~48%), `water_storage` (orange-red 47%),
`cargo_A(_stacked, _packed)` (red + amber 34–47%), `mobile_base_cargo` (40%), `basemodule_B/E` (amber
~40%), `cargodepot_A`–`C` (red 23–31%), `windturbine_tall/low` (amber 29 / 15%), `basemodule_A/D` (amber
trim ~24%), `lights` (light orange 25%), `dome` (glass with mixed warm tints 25%), `structure_low/tall`
(orange-red 18 / 23%), `lander_A/B` (red and amber details ~21%), `space_farm_small` / `eco_module` (rust
soil 15–18%), `drill_structure` (red legs 14%); under 10% elsewhere. `spacebits_texture.png` is an 8 × 4
grid of colour swatches (128 × 256 px each); recolouring the warm ones recolours every model at once:
row 1 (top) columns 7–8 (rust, orange), row 2 columns 4, 5 and 8 (amber, red, orange-red), row 3
columns 7–8 (orange-magenta, salmon), row 4 column 3 (light orange). The Platformer blue set and the
Prototype floors carry no red or orange.

**props2** — Resource Bits, all 132 (`resources.glb` keeps its 20): `{Copper,Iron,Silver,Gold}_{Bar,
Bars, Bars_Stack_Small/Medium/Large, Nugget_Small/Medium/Large, Nuggets}`, `Gem_Small/Medium/Large`,
`Gems_Pile_Small/Large`, `Gems_Chest(_Empty)`, `Gems_Sack`, `Stone_Brick`, `Stone_Bricks_Stack_*`,
`Stone_Chunks_Small/Large`, `Wood_Log_A/B`, `Wood_Log_Stack`, `Wood_Plank_A`–`C`, `Wood_Planks_Stack_*`,
`Textiles_A`–`C`, `Textiles_Stack_Small/Large(_Colored)`, `Food_*` (apples, berries, baskets, barrels,
crates, cheese, flour, piles), `Fuel_{A,B,C}_{Barrel, Barrel_Dirty, Barrels, Jerrycan}`, `Money_*`,
`Containers_Box_*/Crate_*/Pile_*`, `Pallet_Wood(_Covered_A/B)`, `Pallet_Plastic_Blue/Grey/Orange`,
`Parts_Cog`, `Parts_Pile_*`.
RPG Tools Bits, all 69 (`tools.glb` keeps its 24): `anvil`, `grindstone`, `axe`, `pickaxe`, `hammer`,
`mallet`, `saw`, `chisel`, `file`, `tongs`, `trowel`, `shovel`, `knife`, `scissors`, `handdrill`,
`handplane`, `nail`, `screw_A/B`, `screwdriver_{A,B}_{long,short}(_color)`, `wrench_A/B`, `bucket_metal`,
`lantern`, `torch(_burnt)`, `rope_bundle_A/B`, `blueprint(_stacked)`, `journal_open/closed`, `map`,
`map_empty`, `map_rolled`, `compass_base`, `drafting_compass`, `magnifying_glass`, `pencil_{A,B}_{long,short}`,
`key_A`–`C`, `lock_A`–`C`, `lockpick_A(_old)/B/C/D`, `lockpick_set`, `fishing_rod(_base)`, `fishing_floater`,
`fishing_hook_A/B`, `fishing_worm`, `fishing_tacklebox(_empty)`.
Furniture Bits, all 74: `bed_single/double_A/B`, `armchair(_pillows)`, `couch(_pillows)`, `chair_A/B(_wood)`,
`chair_C`, `chair_desk_A/B`, `chair_stool(_wood)`, `table_small/medium/medium_long`, `table_low(_decorated)`,
`desk`, `desk_large` (+ `_decorated`), `cabinet_small/medium` (+ `_decorated`), `shelf_A_big/small`,
`shelf_B_small/large` (+ `_decorated`), `lamp_desk(_headphones)`, `lamp_standing`, `lamp_table`, `rug_*`,
`pillow_A/B`, `pictureframe_*`, `book_set`, `book_single`, `cup(_pencils)`, `mug_A/B`, `cactus_*`, and
modern desk gear (`monitor`, `keyboard`, `mouse`, `mousepad_*`, `gameconsole_handheld`).
Dungeon Pack 1.1, the 116 pieces `dungeon.glb` lacks: the tavern bar (`bar_straight_A`–`C(_short)`,
`bar_innercorner/outercorner`, `bartop_A/B_small/medium/large`), `bed_A_single/double/stacked`,
`bed_B_single/double`, `bookcase_single/double` (+ `_decoratedA/B`), `book_brown/grey/tan`,
`shelf_small_books`, `shelves_decorated`, `table_round_small/medium/large`, `table_long_decorated_B`,
`table_medium_decorated_B`, `table_medium_tablecloth_decorated_B`, `table_small_decorated_C`, `stool_round`,
`bench`, `chest_large(_gold)`, `chest_mimic`, `crate_small`, `crate_large(_decorated)`, `trunk_medium_C`,
`trunk_small_C`, `bucket(_pickaxes)`, `dungeon_pickaxe`, `pickaxe_gold`, `key_gold`, `rocks(_small,
_decorated, _gold)`, `post`, `ceiling_tile`, `stairs_long`, `stairs(_long)_modular_left/center/right`,
`scaffold_*` (12), `wall_inset(_candles)`, `wall_inset_shelves(_broken, _decoratedA/B)`,
`wall_doorway_Tsplit`, `wall_archedwindow_gated_scaffold`, `floor_dirt_small_C/D`, `floor_tile_grate_open`,
`floor_tile_big_grate_open`, `floor_tile_big_spikes`, `floor_tile_extralarge_grates(_open)`, and the
banner colours the dungeon kit left out (24: `banner_{blue,green,white,yellow}`, `banner_patternA/B/C_*`,
`banner_shield/thin/triple_*`).
Halloween Bits extras (8): `haybale`, `scarecrow`, `wagon`, `wagon_hay`, `wooden_gate`,
`sign_both/left/right` (`halloween.glb` already has every crypt, coffin, grave, fence and lantern; the rest
of the pack is candy, a tractor and hedge mazes).
Mystery Monthly (66): Orc Raider `Orc_Wardrum`, `Orc_WardrumStick`, `Orc_Club`, `Orc_DrinkingHorn`,
`OrcRaider_Axe`; Orc Brute `Orc_Banner(_Large)`, `OrcBrute_Axe`, `Orc_Axe_Large`; Witch `Cauldron`,
`Potionstation(_decorated)`, `Broom`, `Mortar`, `Pestle`, `Basket(_Mushrooms)`; Cleric
`Cleric_Font/Mace/Shield/Tome`; Lorekeeper `Lorekeeper_Staff/Tome`; Paladin `paladin_hammer/shield/book/statue`;
Vampire `Vampire_Throne`, `Vampire_Goblet`, `Vampire_Gem_Small/Medium/Large`, `Vampire_Sword`; Farmers
`carrot`, `lettuce`, `dirt_plot`, `pitchfork`, `wheelbarrow(_empty)`; Caveman `Campfire_Base`,
`Campfire_Logs`, `Caveman_Axe/Club/Spear`; Frost Golem `FrostGolem_Axe(_Large)`; Monstrosity
`Monstrosity_BarndoorShield(_Large)`, `Monstrosity_Pitchfork(_Large)`; Black Knight
`BlackKnight_Sword(_Large)`, `BlackKnight_Shield(_Large)`; Tiefling `Tiefling_Sword`,
`Tiefling_SwordsBackpack`; and the hand weapons of the rest of the characters2 cast: `Werewolf_Axe`,
`Ninja_Katana`, `Ninja_Shuriken`, `PlantWarrior_Bow(_withString)/Arrow/Spear/Shield`, `Hoarder_Sword`,
`AvianSwordsman_Sword`.
Renamed where two sources share a name: `OrcRaider_Axe` / `OrcBrute_Axe` (both `Orc_Axe`),
`Vampire_Gem_*` (Resource Bits has `Gem_*`), `Werewolf_Axe` (RPG Tools has `axe`), `dungeon_pickaxe`
(RPG Tools has `pickaxe`).

**robots** — the props of the characters2 robots, mech and space ranger: `Robot_ChargingStation` (the
robots' charging dock), `CombatMech_Axe`, `CombatMech_Minigun`, `4GTN_Katana` (a glowing blade),
`SpaceRanger_Blade`, `SpaceRanger_Helmet` (with its glass visor), `SpaceRanger_Jetpack`,
`SpaceRanger_Rifle`. Not loaded by the game yet.

**bits** — Holiday Bits' train set: `tracks_straight` (1 unit long, the rails 0.33 apart), `tracks_curve`
(a quarter circle of radius 2 round its own origin, from (2, 0) heading +z to (0, 2) heading −x),
`tracks_straight_station` (3 units, with a platform), `tracks_crossing`, `tracks_split_left/right`,
`train_locomotive` (a little steam engine, its lamp glowing), `train_tender_empty`, `train_tender_coal`,
`train_tender_presents_A/B`, `train_wagon`. Mixed Bag's `toolcart` and `toolcart_tall` (red tool chests on
wheels, drawers on their +z side). Used by the Rails (`src/view/rails.ts`), the scrapyard
(`src/view/scrapyard.ts`) and the mine (`src/view/mineview.ts`: the track of every line at 1.25×, the
tenders as iron tubs waiting at the stops and under riders).

**town** — what the town inside the wall and the workshops' rooms are dressed with. From the Medieval
Hexagon pack, in the colours `medieval.glb` lacks: `building_home_A_{red,green,yellow}`,
`building_home_B_{red,green,yellow}`, `building_townhall_blue` (the hall on the old town's square, its
clock tower), `building_tavern_red` (the barrel tavern on the high street), `building_stables_yellow`
(the stables and the farm's barn), `building_watchtower_blue` (where the wall-walk ends against the
mountains), `building_shrine_green`, `building_well_red` (the market square's well),
`building_docks_yellow` (the quay), `building_tent_red` (the big market tent),
`building_workshop_blue` (the stonecutter's house) and `building_blacksmith_red` (the forge's), `boat`,
`boatrack`, `trough`, `trough_long`, `haybale`, `cart`, `horse_A/C`, `banner_{red,blue}_full`. From
`props2.glb`: the farms (`dirt_plot`, `carrot`, `lettuce`, `pitchfork`, `scarecrow`, `wagon`,
`wheelbarrow_empty`, `sign_both`, `sign_left`), the market (`Food_*` crates, baskets, cheese, flour,
`Textiles_Stack_Large_Colored`, crates, a covered pallet, banners, `bench`, `stool_round`,
`table_round_medium`), the fisher's `fishing_rod`, and the rooms' timber, stone, metal, gems, tools
(`handplane`, `file`, `trowel`), books and bookcases, `Cauldron`, `Potionstation`, `Mortar`, `Pestle`,
`Cleric_Tome`, `rug_oval_B`, `rocks`. Street lamps are Halloween's `post_lantern` (instanced; their
halos one draw).

**cards** — Board Game Bits' playing cards: `card_base` (a blank white face and the deck's back,
`cardback_A`), `card_{clubs,diamonds,hearts,spades}_{ace,two,…,ten,jack,queen,king}` (52, each its own face
texture) and `card_joker_A/B`; 4.3 × 6 units, standing in the xy plane, the face toward +z. `card_base` is
the art of the decide minigame's punched cards (rendered once by `src/ui/icons.ts`).

**characters2** — Rig_Medium (30): `Barbarian`, `Druid`, `Engineer`, `Knight`, `Mage`, `Ranger`,
`Rogue`, `Rogue_Hooded`, `Necromancer`, `Skeleton_Mage`, `Skeleton_Minion`, `Skeleton_Rogue`,
`Skeleton_Warrior`, `OrcRaider`, `Werewolf_Man`, `Werewolf_Wolf`, `Vampire`, `Witch`, `Paladin`,
`Paladin_with_Helmet`, `Cleric`, `Lorekeeper`, `Farmer_A`, `Farmer_B`, `Caveman`, `Tiefling`, `Ninja`,
`PlantWarrior`, `AvianSwordsman`, `Hoarder`, the robots `Robot_One` and `Robot_Two`, the `CombatMech`
(with its wings), and the space ranger, `SpaceRanger` and `SpaceRanger_FlightMode` (helmet, visor and
jetpack on). Rig_Large (6 + 3): `Barbarian_Large`, `Skeleton_Golem`, `OrcBrute`, `BlackKnight`,
`FrostGolem`, `Monstrosity`, and the robots `Clanker`, `4GTN` and `4GTN_Forgotten` (overgrown with moss).
In the game: `Robot_One` / `Robot_Two` are the porters once the Robots milestone is invented, and
`SpaceRanger_FlightMode` (its jetpack wings folded) is a hero's look in Space, the visor glowing the class's
colour, the class weapon in hand (`src/view/characters.ts` SPECS, `src/view/entities.ts`). Not used yet:
the `Clanker`, `4GTN(_Forgotten)`, the `CombatMech`, the helmetless `SpaceRanger` and the `robots` kit.
Each file holds one 23-joint skin (root, hips,
spine, chest, head, upperarm/lowerarm/wrist/hand/handslot `.l/.r`, upperleg/lowerleg/foot/toes `.l/.r`)
under a `Rig_Medium` / `Rig_Large` node and its own texture; weapons are not in hand (they are props in
`weapons.glb` / `props2.glb` / `robots.glb`, for the `handslot` bones). `OrcRaider.glb` ships untextured; the
build attaches `orc_texture_A.png`, the same image its props embed.

Red and orange (share of each model's surface on saturated red-to-orange colours, hue 0–45°, by area):
the space ranger wore an orange suit (42% for `SpaceRanger`, 26% `_FlightMode`, his jetpack 43%, rifle 20%),
so the build turns his texture's orange swatches blue (`RECOLOURS` in build-assets.mjs, matched by the
image's SHA-256, re-encoded with fflate so the bytes are the same everywhere): now 24% / 10%, all of it his
brown hair and skin, and 0% for his props. Not Space-related, kept as they come: `Robot_One` 12%,
`Robot_Two` 16% (orange arms, red eyes; the pack's `robot_texture_alt.png` is the same robot in blue),
`Robot_ChargingStation` 37% (orange and yellow hazard paint), `CombatMech` 13% (its `CombatMech_Axe` 29%,
`_Minigun` 18%; an alt texture exists too), `Clanker` 11% (rusty brown), `4GTN` 12%, `4GTN_Forgotten` 9%,
`4GTN_Katana` 0%. The toy train: track 63–64% (the brown wooden sleepers), engine and tenders 3–5%, the
presents wagons 11–18%, `train_wagon` 16%; the tool carts 74–75% (bright red tool chests); the cards 0%.

**anims_medium** (Character Animations 1.1, all 8 Rig_Medium sets; `T-Pose` dropped) —
General: `Death_A(_Pose)`, `Death_B(_Pose)`, `Hit_A/B`, `Idle_A/B`, `Interact`, `PickUp`, `Spawn_Air`,
`Spawn_Ground`, `Throw`, `Use_Item`. MovementBasic: `Jump_Full_Long/Short`, `Jump_Start/Idle/Land`,
`Running_A/B`, `Walking_A/B/C`. MovementAdvanced: `Crawling`, `Crouching`, `Sneaking`,
`Dodge_Backward/Forward/Left/Right`, `Running_HoldingBow`, `Running_HoldingRifle`,
`Running_Strafe_Left/Right`, `Walking_Backwards`. CombatMelee: `Melee_1H_Attack_Chop/Jump_Chop/
Slice_Diagonal/Slice_Horizontal/Stab`, `Melee_2H_Attack_Chop/Slice/Spin/Spinning/Stab`, `Melee_2H_Idle`,
`Melee_Block`, `Melee_Block_Attack`, `Melee_Block_Hit`, `Melee_Blocking`, `Melee_Dualwield_Attack_Chop/
Slice/Stab`, `Melee_Unarmed_Attack_Kick/Punch_A`, `Melee_Unarmed_Idle`. CombatRanged:
`Ranged_1H_Aiming/Reload/Shoot/Shooting`, `Ranged_2H_Aiming/Reload/Shoot/Shooting`,
`Ranged_Bow_Aiming_Idle/Draw/Draw_Up/Idle/Release/Release_Up`, `Ranged_Magic_Raise/Shoot/Spellcasting/
Spellcasting_Long/Summon`. Simulation: `Cheering`, `Waving`, `Lie_Down/Idle/StandUp`,
`Sit_Chair_Down/Idle/StandUp`, `Sit_Floor_Down/Idle/StandUp`, `Push_Ups`, `Sit_Ups`. Special:
`Skeletons_Awaken_Floor(_Long)`, `Skeletons_Awaken_Standing`, `Skeletons_Death(_Pose)`,
`Skeletons_Death_Resurrect`, `Skeletons_Idle`, `Skeletons_Inactive_Floor_Pose`,
`Skeletons_Inactive_Standing_Pose`, `Skeletons_Spawn_Ground`, `Skeletons_Taunt(_Longer)`,
`Skeletons_Walking`, `EXPERIMENTAL_Medium_Transform`. Tools: `Chop`, `Chopping`, `Dig`, `Digging`,
`Hammer`, `Hammering`, `Pickaxe`, `Pickaxing`, `Saw`, `Sawing`, `Lockpick`, `Lockpicking`,
`Fishing_Cast/Idle/Bite/Tug/Reeling/Struggling/Catch`, `Holding_A/B/C`, `Work_A/B/C`, `Working_A/B/C`.

**anims_large** (the 6 Rig_Large sets; `T-Pose` dropped) — `Death_A(_Pose)`, `Hit_A`, `Idle_A/B`,
`Walking_A`, `Running_A`, `Dodge_Backwards/Forward/Left/Right`, `Melee_1H_Slash/Stab`,
`Melee_2H_Attack/Idle/Slam`, `Melee_Block`, `Melee_Block_Attack`, `Melee_Block_Hit`, `Melee_Blocking`,
`Melee_Dualwield_Slash/SlashCombo`, `Melee_Unarmed_Idle/Kick/Punch/Smash`, `Flexing`,
`EXPERIMENTAL_Large_Transform`.

Clip names differ from the 1.0 library in `characters/anims.glb` (`Idle_A` for `Idle`,
`Melee_1H_Attack_Chop` for `1H_Melee_Attack_Chop`, `Ranged_Magic_Shoot` for `Spellcast_Shoot`, …).

**Rebuild** (into two new, empty directories; nothing is run from inside the collection):

```sh
node scripts/assets/fetch-kaykit.mjs <dl>              # the GitHub / itch.io packs, pinned
node scripts/assets/import-collection.mjs "<path>/The Complete KayKit Collection v7" <imp>   # checks every pin
node scripts/assets/build-assets.mjs <dl> <imp>        # the original outputs, plus everything above
```

Without `<imp>`, build-assets builds only the original kits (and `kits/index.json` lists only those).
The import fails loudly when a file no longer matches its pin; a changed selection re-pins (new files are
pinned, files no longer taken are dropped from the manifest).

Notes: the plain glTF reader drops `KHR_materials_emissive_strength` (1.5 on the glow of `sword_F`,
`spear_B`, `staff_C/D`, `wand_B`, 4 on the train engine's lamp, 12 on `4GTN_Katana`'s blade, which now glow
at 1.0) and `KHR_materials_ior/specular` (Caveman props), neither of which matters for the game's matte
materials. `props2.glb` is 13 MB of geometry (its
26 textures are 0.4 MB): load it on demand, or split it by source when the game starts using it.
