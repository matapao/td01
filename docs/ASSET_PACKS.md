> Historical research from 2026-10-18, retained as planning context. This is not the current
> shipped-asset inventory or permission to redistribute a vendor’s source files. See
> [the current asset/license audit](ASSET_LICENSE_AUDIT.md) and [recording withdrawal](AUDIO_SOURCES.md).
> No Sonniss or Pixabay recordings remain in the public candidate; reintroduction needs a separate
> source redistribution review. Prices, catalogs and other licensing recommendations below are historical.

f3f# Buying instead of making: asset packs for BrowserDefense

_Research date: 18 October 2026. KayKit Complete (owned) is the default build; the three stacks below are what we would add around it. Every price, catalogue and licence claim links to its source; "unverified" marks what I could not confirm. The miniature-world idea was dropped, so the world stays full-scale (the vale, the Underground and Space) and there is no section on giant backdrops._

## 0. The short answer

**Buy in this order:**

1. **Kenney All-in-1, $19.95.** It is CC0 and includes every future Kenney pack. ([itch](https://kenney.itch.io/kenney-game-assets))
2. **Quaternius.** Most of each pack is free. The rest comes through a Patreon membership (35–545 NOK a month) or per-pack Source purchases. Licence: the new Quaternius Asset License.
3. **Synty: nothing yet.** Synty's INTERFACE HUD packs are the richest ready-made HUD art on the market. Three things count against them:
   - Their prefabs and animations only work in Unity and Unreal.
   - Their look sits awkwardly next to KayKit.
   - Neither Synty licence says anything about browser delivery.

   If a HUD kit is still wanted, buy one pack outright (INTERFACE – Fantasy Warrior HUD, $99.99), and only after Synty confirms in writing that serving its sprites in a web game is fine. Never use SyntyPass for a game that keeps being updated.

**How far that gets us without our own art or styling.** I scored 172 needs, walking through the game from the first frame to Space.

| What we use                              | Fully covered off the shelf (✓) | At least partly covered (✓ or ~) | Nothing usable (✗) |
| ---------------------------------------- | ------------------------------- | -------------------------------- | ------------------ |
| KayKit + the free sources                | 21%                             | 66%                              | 59 needs           |
| Plus Kenney                              | 35%                             | 94%                              | 10 needs           |
| Plus Kenney and Quaternius (recommended) | **37%**                         | **94%**                          | **10 needs**       |
| Plus all three vendors (Synty too)       | 41%                             | 96%                              | 7 needs            |

So even with everything bought, about **6 in 10 needs still take some of our work**:

- laying out the HUD in HTML/CSS (every pack supplies only the art);
- recolouring and kit-bashing models;
- composing scenes.

About **6%** can't be bought at all.

The **minigame boards** are the clearest case: whatever we buy, only 1 of 21 is covered off the shelf. Packs supply the parts (gauges, bars, frames, 3D props); the boards themselves are ours.

**The licence fact that decides most of this.** A browser game sends its GLB, PNG and OGG files to every player, where anyone can save them. So the safe licences are:

- CC0: KayKit, Kenney.
- CC BY, with credits: game-icons.net, Kevin MacLeod.
- The Quaternius Asset License. It allows distributing "a completed Product that merely incorporates the Assets", and nothing in it requires us to stop players pulling files out ([QAL](https://quaternius.com/license.html)). Its ban on extracting and redistributing applies to us, not to players.
- Sonniss: excluded from this source repository; redistribution review remains required.

The risky ones:

| Licence           | The problem                                                                                                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unity Asset Store | Assets can't be redistributed "in a way that allows others to extract them from your final product" ([Unity](https://support.unity.com/hc/en-us/articles/34387186019988-Can-I-use-assets-from-the-Asset-Store-with-other-engines)) |
| Layer Lab         | Forbids sharing the assets "in any form that allows others to extract or reuse them" ([Layer Lab](https://layerlab.io/pages/licences))                                                                                             |
| Synty             | Says nothing either way ([one-time EULA](https://syntystore.com/pages/one-time-purchase-licence))                                                                                                                                  |

**Corrections and confirmations of my previous answer:**

- **Quaternius did change licence.** The site's licence page is now the custom _Quaternius Asset License (QAL) v1.0, last updated 8/28/2026_ ([quaternius.com/license.html](https://quaternius.com/license.html)), but individual pack pages still say CC0 ([Ultimate Space Kit](https://quaternius.com/packs/ultimatespacekit.html)). Treat anything downloaded now as QAL. The QAL says changes "will not apply retroactively", so earlier CC0 downloads stay CC0.
- **The Synty subscription trap is real.** Clause 6.2 says "you must cease using our Assets in any new Intellectual Property created following the date of expiry or termination". Clause 12.3 says "If the Product is substantially developed, modified or improved you are required to have an active Subscription" ([subscription EULA, 9 July 2026](https://syntystore.com/pages/standard-subscription-licence)). Neither Synty EULA mentions WebGL or the browser.
- **INTERFACE – Apocalypse HUD:**
  - Built from "rusted metal and salvaged electronic components".
  - Unity 2022.3 only ("Unreal is not supported"); the sprite zip "can be used outside of Unity but no support is currently offered for this".
  - $30 on sale, down from $99.99 ([product page](https://syntystore.com/products/interface-apocalypse-hud)).

  Its dials and gauges suit a Steam-age board seen up close, in its own scene. It doesn't suit the HUD, and it holds no circuit, radar, Morse, gear or rocket parts. So it is not the STEM-minigame answer the user hoped for.

- **New since my last answer:** Kenney added a _Modular Space Kit_, a _Modular Cave Kit_ and _Light Masks_ in 2026 ([space](https://kenney.nl/assets/modular-space-kit), [cave](https://kenney.nl/assets/modular-cave-kit), [light](https://kenney.nl/assets/light-masks)). KayKit v7 added _Mixed Bag 1_ on 15 Sept 2026 ([devlog](https://kaylousberg.itch.io/kaykit-complete/devlog)).

---

## 1. The walk-through inventory

The game in the order a player meets it. Each line says how it is made today:

| Code  | How it is made today                                                 |
| ----- | -------------------------------------------------------------------- |
| **K** | KayKit model                                                         |
| **P** | Procedural geometry or a shader written in our code                  |
| **C** | CSS/HTML                                                             |
| **D** | Drawn in code (canvas 2D or inline SVG)                              |
| **R** | Rendered at runtime from a 3D model into an icon (`src/ui/icons.ts`) |
| **S** | Synthesised WebAudio, no samples (`src/view/audio.ts`)               |
| **—** | Not in the game yet                                                  |

IDs in brackets point to rows in the coverage matrix (§3).

Of the 172 matrix rows, today:

- 34 are KayKit, 6 of them helped by code;
- 49 are procedural;
- 22 are CSS;
- 21 are drawn in code;
- 3 are rendered icons;
- 6 are synthesised sound;
- about 37 don't exist yet.

The README sums it up: "Everything else — trees, stone bridges, mines, terrain, water, sky, foliage, VFX, UI, icons, sound — is generated in code."

### 1.1 First load, the title and the HUD

- **First frame.** There is no loading screen and no title screen. Terrain, water, grass and sky are generated and on screen at once; models stream in (`src/main.ts`). Asset need: none, but there is no logo or wordmark anywhere (**U01**; the favicon is an inline SVG shield).
- **First start.** The Class window opens with three cards: Knight (Tank), Warchief (Support) and Mage (Magic). Each has a portrait rendered from its 3D model, a blurb and its skills (**U02**, **I05**; C + R).
- **LAN.**
  - A join card: your name and the address others use.
  - A slim bar: players, ping, Pause / Save / Load with a save code.
  - A "New version ready · Update (U)" banner and a paused overlay.

  (**U22**; C)

- **The HUD** (`src/ui/hud.ts`, `hud.css`; all C, gold-on-dark gradients, system Palatino serif):
  - **Top bar:** gold coin, lives heart, wave number and timer, Call wave, a 1× speed toggle, the age badge (opens the Road), ☰, and the DEV badge with its clock (**U04**, **U26**).
  - **Player frame:** portrait, level, HP and XP bars, name. Also a target frame and a boss frame (**U05**, **U06**).
  - **Tracker:** wave intel and objectives (**U11**).
  - **Action bar:** skills 1–4 (inline-SVG ability icons), the interact slot, the plan bar on 5 … =, and the Plan Book and Buy buttons (**U07**, **I04**).
  - **Bags:** the tool row and an item grid with stack counts (**U08**).
  - **Details panel** for whatever is selected (**U09**).
  - **Messages:** event log, toasts, the cursor hint and the placing banner (**U12**).
  - **Minimap** with the vale and mine maps (M makes it big) (**U13**; D).
  - **Tooltips** (**U10**).
  - **Panels for later systems:** the drone box (battery, hull, range), the Space panel, flight rows (**U23**, **U24**).
- **In the world:**
  - nameplates, loot names (Alt) and site checklists (`labels.ts`);
  - floating damage and crit numbers (`fx.ts`);
  - health and progress bars, ground rings and the blueprint hologram (`overlays.ts`);
  - the CSS vignette and hit flash.

  (**U14**, **U15**, **V13**)

- **Windows** (`src/ui/windows.ts`):
  - Shop, with seven stores and tool and plan-scroll cards;
  - Storage;
  - Plan Book (P) and Buy a plan (G);
  - the Road of Invention with its Field Notes (O);
  - Menu (Esc) and Class (C).

  (**U02**, **U03**, **U18**, **U19**, **U20**)

- **Cursors** are the OS cursor (**U16**). **Fonts** are the system serif (**U17**).
- **Sound:** synthesised UI tick, open and deny (**A01**).

### 1.2 The vale

- **Ground and water:**
  - terrain with a painted splat texture drawn on a canvas (**W01**, P);
  - roads (**W02**, P);
  - the river, fords and swimming (**W03**, P);
  - mighty stone bridges, one deck between solid parapets (**W04**, P);
  - the mountain ring (**W05**, P);
  - haze and fog of war (P).
- **Sky and light:**
  - a shader sky dome with sun, clouds, moon and stars, and day and night on an 8-minute day (**W06**, P);
  - lighting and colour grading baked into the materials (P).
- **Scenery:**
  - Trees are generated in code (`treegen.ts`). KayKit Forest Nature is imported but not loaded yet (**W07**, **W08**).
  - The keep, walls, gate, village, tavern, church, windmill and markets, including the hidden shops, are KayKit Medieval Hexagon (**W09**–**W11**, K).
  - Crypts, graveyards and fences are KayKit Halloween (**W12**, K).
  - Camps, the Lumber Camp, chests, ruins and the shrine (**W13**, K).
  - Scrap heaps (**W14**, P), quarry rocks and crystal clusters (**W15**, P + K), mine heads and cave mouths (P).
- **Light sources and power:**
  - braziers (**W16**, P);
  - painted light pools and blob shadows (**V12**, P);
  - power poles with wires and electric lamps (**W17**, P);
  - the watermill / hydro generator (**W18**, K, no broken state).
- **People and siege:** footmen, captains, porters and townsfolk (**W19**, K). Catapults, carts and ships (**W20**, K).
- **Building:** sites with the blueprint hologram, scaffolds and stacked parts (**W21**). Damaged buildings smoke, become ruins and get repaired (**W22**).
- **As the ages advance:** street lamps, wires, carts becoming trains, signs (**W23**, —).

### 1.3 The hero

- **Classes** (`content.ts` CLASSES):
  - Knight: 600 HP, sword and shield.
  - Warchief: 460 HP, a war axe (his tools double as weapons), and has the Scout Drone.
  - Mage: 320 HP, staff and bolts.

  They are the 23-bone Rig_Medium Knight, Barbarian and Mage of the Complete Collection, on one shared clip library (**C01**–**C03**, done; the whole cast, the skeletons, the archer and the shopkeepers too — see KAYKIT_COLLECTION.md "In the game").

- **Later classes:** Druid, Engineer, Ranger, Rogue, Paladin, Cleric (**C04**, K, imported).
- **Gear:**
  - weapon tiers, reforged at the Blacksmith's anvil: the Knight's sword A–G with shields A–D, the Warchief's axes A–D, the Mage's staffs A–D, +12% damage a tier (**C05**, done; bows A–C for a later class);
  - tools in hand: axe, pickaxe, hammer, shovel (**C07**);
  - visible armour tiers don't exist (**C06**).
- **Animations:**
  - locomotion: walk, run, strafe, back-pedal, jump;
  - wading and swimming, climbing a tower;
  - combat swings, block, cast, throwing a hand axe from a tower top;
  - work: chop, pickaxe, dig, hammer, saw, carry;
  - emotes, death.

  (**C08**: the 139-clip KayKit library has everything except swim and climb.)

- **Skills and their effects:** Shield Bash, Battle Cry, Shield Wall, Mend, Rally, Repulse, Scout Drone, Fireball, Frost Nova, Meteor (**V03**; ability icons are inline SVG, **I04**).
- **Kit:** the Scout Drone and its controller (**C09**, P); the lantern underground (**C10**).

### 1.4 Gathering, carrying, crafting, plans and building

- **Tools** come from the Market and are never free: axe, pickaxe, hammer, shovel (**I02**, D icons).
- **Nodes:**
  - trees, rocks, ore veins, crystal clusters, scrap heaps;
  - mine walls (coal, copper, iron, silver, gold, quartz, sulfur, five gems);
  - dynamite for hard rock;
  - in Space: nickel-iron, ice, rare earths.
- **Items** — 26 of them (`ITEMS`), each needing a 3D model (drops, flying pickups, trays) and an icon (**I01**, R):
  - wood, stone, iron ore, crystal, scrap, planks, stone block, iron ingot, gears, rune core;
  - coal, copper, silver, gold nugget, quartz, sulfur;
  - five raw gems;
  - nickel-iron, water ice, rare earths, rare-earth magnet, dynamite;
  - plus gold coins, and enchanted parts with rarity colours and affixes.

  TECH_LINEAGE §6 plans 15 more raw resources: clay, sand, limestone, potash, saltpetre, resin, tin, lead, borax, phosphorus, tungsten, bauxite, cobalt/nickel, rare earths, lithium.

- **Carrying:** the bag (stacks of 20), storage, porters carrying parts, "Buy the rest".
- **Stations:** Sawmill, Stonecutter, Forge, Anvil and Arcanist's Bench, which reuse KayKit Hexagon buildings, plus the walk-in Smithy room (K).
- **Hands-on beats** (`src/ui/actions.ts`): hammer, saw, cut, smelt, weld, wire and code, each a ring, mark or band drawn in code (D; now part of the minigame kinds, **M12**).
- **Plans:**
  - study timers in the Plan Book, place the hologram, turn it with R;
  - site checklists with sockets for enchanted parts; assembly steps;
  - disciplines: Carpentry, Masonry, Smithing and Arcana, with five more planned (Engineering, Materials, Mechanics, Signals, Computing).

  (**U20**, **W21**, **I03**)

### 1.5 The tower, its modules and power

- **The tower:**
  - one stone tower (KayKit `building_tower_base`) with a KayKit Ranger on top, who looses, nocks and draws with the bow clips in time with his shots;
  - tops: open platform → Roofed Turret (`tower_A`) → Gallery Roof (`tower_B`) (K);
  - the archer ducks when a wraith dives; heroes can climb up; the crew glows by class (P).
- **Gem windows:**
  - five windows, one per colour;
  - 14 variants: Ember, Blast, Fury, Warheart, Frost, Rime, Swift, Storm, Sun, Arcane, Twin, Scrying, Seer's, Far-sight;
  - 3 grades: rough, polished, and radiant with embers, frost, lightning, orbiting stones or a ring of light;
  - all procedural crystal clusters with a gold rim (`gems.ts`) (**I03**, **V09**).
- **Element emblem** drifting round the archer: a flame in a brass cup, a snowflake, a lightning bolt, a rune ring, a bomb (`emblems.ts`, P; **V09**).
- **Devices** in the four upper windows (`devices.ts`, P):
  - a brass Searchlight with its night beam (**R11**);
  - a turning Radar Dish (**R15**);
  - a Targeting Computer box with lens and blinking lamp (**R18**);
  - a Relay Link coil with a flickering lamp (**R13**);
  - a Solar Roof awning (**R17**).
- **Power:**
  - the old watermill repaired into a generator, and the magnet-dynamo upgrade (**W18**);
  - power poles with visible wires and electric lamps (**W17**);
  - brown-outs dim devices; workshops on the grid work ×1.5;
  - braziers and the Sun Topaz light.

### 1.6 Enemies, combat, loot and markets

- **Nine kinds of dead** (KayKit skeletons, re-tinted where needed):
  - Skeleton Minion, Bone Runner, Skeleton Warrior, Necromancer (**E01**);
  - Wraith, a flyer (**E02**);
  - Bone Crusher (siege) and Bone Colossus (boss) (**E03**);
  - Grave Digger, a burrower (**E04**);
  - The Lich, a boss (**E05**).
- **Planned families:** orcs, werewolves, black knight, vampire, frost golem, monstrosity, witch on a broom (**E06**, KayKit Mystery Monthly, imported). Mine lair creatures (**E07**, —).
- **Waves:** a horn, routes, intel, five wave affixes, Sigil scaling. Combat uses threat/aggro, a damage-type × armour matrix, and statuses (burn, chill → freeze → shatter).
- **Feedback:**
  - floating damage numbers coloured by type, crits, health bars, the boss frame, the hit flash (**U06**, **U14**, **U15**);
  - status markers (**V15**), hit sparks (**V07**), explosions (**V05**), frost (**V06**), lightning (**V04**).
- **Loot:** physical gold coins, enchanted parts (Enchanted / Rare / Legendary, plus named legendaries), plan scrolls, chests, the goblin's mystery crates, loot beams (**V08**).
- **Markets:** seven stores — Market, Smithy, Arcane Emporium and Builders' Guild, plus the hidden Dwarven Trading Post, Witch's Hut and Goblin Scrapper — each with its keeper (**W11**, **C12**).

### 1.7 Interiors and the Underground

- **Interiors:**
  - Seamless walk-in rooms built like KayKit dungeon dioramas: two storeys, a loft and stair, the walls between camera and room cut away (**W24**).
  - Furnishing: forge fire, anvil, trays, benches, shelves (**W25**).
  - Only the Smithy exists so far. Planned: tavern, Arcanist's room, drafting room, and later-age workshops — boiler room, switchboard, signal house, computer room, clean room (**W26**).
- **Underground** (`mines.ts`, `mineview.ts`, all P):
  - lift with headframe, cage and ropes (**W27**);
  - endless mines: rock walls in several rock types, glinting veins, cave-ins (**W28**);
  - timber props, torches, old tunnels; rails and ore carts later (**W29**);
  - caverns with lairs: the Hollow Dark, the Ember Deeps, the Bone Halls (**W30**);
  - flooding and steam pumps in the Steam age (**W31**);
  - darkness with the lantern's light pool, and depth shown on the minimap.

### 1.8 The Road of Invention, age by age

The Road window (O, **U18**) shows each age's milestones as cards. Inventing a milestone opens its minigame in a 412 px panel above the action bar (`src/ui/minigames`). Each run:

- draws on a 380 × 220 canvas in the HUD palette (`kit.ts`);
- ends with a Perfect / Good / Failed verdict (**U25**);
- writes a Field Notes entry (**U19**).

Kinds built so far: `band`, `ratio`, `sizes`, `path` and `decide` are real (1,400–2,100 lines each). `beat`, `steady`, `separate`, `order`, `sweet`, `observe` and `encode` are click-to-finish placeholders.

The table lists the 25 milestones in `src/game/road.ts`, plus the planned ones from `docs/ROADMAP.md` (marked _planned_).

| Age         | Milestone                                         | Invented at         | Minigame: what the board needs                                                                                                                                 | Unlocks in the world                                                     |
| ----------- | ------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Hand & Fire | Fire, stone & wood, the tower                     | _existing beats_    | Hold the band (brazier), Keep the beat (saw, hammer), Steady hand (cut)                                                                                        | braziers, planks, blocks, the tower                                      |
| Metal       | Bellows & charcoal _(planned)_                    | Forge               | Hold the band: bellows, fire, heat bar                                                                                                                         | hotter smelting                                                          |
| Metal       | Gears by hand _(planned)_                         | Anvil               | Keep the beat: hammer on the anvil, teeth                                                                                                                      | gears                                                                    |
| Metal       | **Bronze**                                        | Forge               | **Mix the ratio** (crucible, cast test): crucible over fire, copper and tin spouts, share gauges (soft ↔ brittle), cast bar struck → cracks or bends (**M05**) | bronze bars, fittings, bells, better tops (**R02**)                      |
| Metal       | **Steel**                                         | Anvil               | Mix the ratio with a carbon "pinch", crucible, strike test (**M05**)                                                                                           | steel tools, weapon tiers (**R03**)                                      |
| Metal       | **Glass**                                         | Forge               | **Hold the band** (fire style), with the band sliding down the annealing curve; glass cooling; cracks on fail (**M01**)                                        | lenses (lookout range), bottles, bulbs (**R04**)                         |
| Machine     | Water & wind _(planned)_                          | Watermill, windmill | Pick the sizes: wheel and gears                                                                                                                                | mill power                                                               |
| Machine     | **Gear trains**                                   | Anvil               | **Pick the sizes** (gears): driver and driven teeth, shaft at 30 rpm → millstone at about 120 rpm, gears turning, rpm gauge (**M06**)                          | gearbox, winch, millstone (**R05**)                                      |
| Machine     | Simple machines / crane _(planned)_               | Crane               | Pick the sizes: lever, pulley                                                                                                                                  | crane, weir                                                              |
| Machine     | **The arch**                                      | Stonecutter         | **Build in order** (placeholder): wedge stones, keystone last, centring taken away, sag on fail (**M15**)                                                      | arched bridges and shortcuts (**R06**)                                   |
| Machine     | Wheel & cart _(planned)_                          | Cartwright          | Build in order                                                                                                                                                 | wheelbarrow, ore carts                                                   |
| Steam       | **Steam power**                                   | Forge               | Hold the band (gauge): boiler pressure needle, relief valve, plug pops on fail (**M02**)                                                                       | boiler house, steam pumps for deep mines, steam winch (**R07**, **W31**) |
| Steam       | **Rails**                                         | Anvil               | **Lay the path** (route, rail look): mine head → forge round obstacles, within a piece budget (**M11**)                                                        | rails and ore carts, railhead (**R08**)                                  |
| Steam       | Engines _(planned)_ / Cement _(planned)_          | Kiln                | Keep the beat / Mix the ratio (cement, vat, set test)                                                                                                          | powered carts / stronger walls, the dam                                  |
| Electric    | **The grid**                                      | Hydro               | **Lay the path** (circuit): intake, three wire gauges heating yellow → red, chains and splits, fuses, switches, lamps, V/A/W meters, a "water view" (**M10**)  | Power Intake + switchboard, poles, lamps, motors, shock fence (**R09**)  |
| Electric    | **Batteries**                                     | Arcanist            | Pick the sizes (cells): cells in a chain or side by side, lamp brightness, about 6 V (**M07**)                                                                 | battery bench, drone batteries, lanterns (**R10**)                       |
| Electric    | Motors _(planned)_, AC & transformers _(planned)_ | —                   | Keep the beat (winding); Pick the sizes (turns, **M09**)                                                                                                       | faster workshops; far towers and mine heads                              |
| Electric    | **The searchlight**                               | Arcanist            | **Find the sweet spot** (placeholder): lamp at the mirror's focus, beam spread (**M18**)                                                                       | **Searchlight** device (**R11**)                                         |
| Signal      | Bells & alarms _(planned)_                        | Bell tower          | Keep the beat                                                                                                                                                  | wave alarm                                                               |
| Signal      | **The telegraph**                                 | Arcanist            | **Encode** (placeholder): Morse key, sounder, paper tape (**M20**)                                                                                             | signal house, wave intel sooner (**R12**)                                |
| Signal      | **Relay logic**                                   | Arcanist            | **Decide** (logic): ladder of switches and relays; conditions (night, lookout sees); lamps, gate, bell; truth table (**M16**)                                  | **Relay Link** device, control boxes (**R13**)                           |
| Signal      | **Radio**                                         | Arcanist            | Find the sweet spot: tuning dial, a station among static (**M18**)                                                                                             | radio mast, drone range, outposts (**R14**)                              |
| Signal      | **Radar**                                         | Arcanist            | **Test & observe** (placeholder): pulse and echo, delay → distance, scope (**M19**)                                                                            | **Radar Dish** device (**R15**)                                          |
| Electronic  | **Pure silicon**                                  | Forge               | **Separate** (placeholder): zone refining, a molten zone swept along a rod (**M14**)                                                                           | clean room, chips (**R16**)                                              |
| Electronic  | **Solar power**                                   | Arcanist            | Find the sweet spot: aim the panel along the sun's arc (**M18**)                                                                                               | **Solar Roof** device, solar field (**R17**)                             |
| Electronic  | **The computer**                                  | Arcanist            | **Decide** (program): punched cards MOVE / TURN / IF ROCK / DRILL / REPEAT, a yard grid, a rover/cart/cutter sprite (**M17**)                                  | **Targeting Computer** device, computer bench (**R18**)                  |
| Electronic  | Networks _(planned)_                              | —                   | Lay the path (links, **M11**)                                                                                                                                  | towers share targets                                                     |
| Automated   | **Feedback control**                              | Forge               | Hold the band, then the thermostat holds it                                                                                                                    | stations hold their own heat and speed (**R19**)                         |
| Automated   | Conveyors _(planned)_, Programs _(planned)_       | —                   | Lay the path (belts) / Decide                                                                                                                                  | belts mine head → forge (**R21**), stations that follow a recipe         |
| Automated   | **Robots**                                        | Anvil               | Build in order: senses + brain + muscles (**M15**)                                                                                                             | gathering drones, assembly arm (**R20**)                                 |
| Space       | **Rocketry**                                      | Forge               | **Pick the sizes** (rocket): stages, fuel, payload to about 7.9 km/s, test flight (**M08**)                                                                    | **the Port** (**S01**, **S02**)                                          |
| Space       | **The payload stack**                             | Port                | Build in order: payload on its descent stage, cruise stage under it, fairing (**M15**)                                                                         | Lander and Solar Farm payloads (**S03**, **S13**, **S09**)               |
| Space       | Launch & cruise _(planned)_                       | Port                | Find the sweet spot: trajectory corrections                                                                                                                    | —                                                                        |
| Space       | **Landing on rockets**                            | Port                | Hold the band (capsule style): sink-rate band, fuel, hover, soft drop (**M03**)                                                                                | Habitat and Crew Capsule (**S08**, **S14**)                              |
| Space       | **The rover**                                     | Port                | Lay the path (route, track look): round the rocks to the sample (**M11**)                                                                                      | Rover and Drill Rig (**S12**, **S10**)                                   |
| Space       | Drill & samples _(planned)_                       | —                   | Steady hand (**M13**)                                                                                                                                          | samples, then ore                                                        |
| Space       | **Oxygen from ice**                               | Port                | Hold the band (gauge): electrolysis current, bubbles (**M02**)                                                                                                 | Oxygen Plant (**S11**)                                                   |
| Space       | **Minerals home**                                 | Port                | Build in order: ascent vehicle on its stage → return ship → entry capsule (**M15**, **M03**)                                                                   | Ascent Vehicle, Magnet Dynamo (**S15**, **S14**, **W18**)                |

Every board also needs **era chrome**: the panel looks medieval gold-on-dark for Metal and Machine, brass and steam, enamel and electric, a CRT for Signal and Electronic, holo-sci-fi for Space (**M21**). The look can be deliberately different per board (§4.6).

### 1.9 Space

- **The Port in the vale** (`rockets.ts`, all P):
  - launch pad and flame trench, lattice tower and swing arm, fuel tanks (**S01**);
  - the rocket: a core stage with two boosters, an upper stage and the payload fairing (**S02**).
- **The flight:**
  - launch and boosters and fairing falling away;
  - cruise, with the cruise stage carrying solar panels;
  - the braking burn and powered descent on the descent stage's engine and legs (**S03**);
  - a vacuum plume — dust flies straight with no air to slow it (**V10**);
  - flight phases in the HUD (**U23**), and a launch window opening every few waves.
- **The Space region** (`spaceview.ts`, all P):
  - The sky: dark space, stars all round, the galaxy's band, soft nebulae, a hard white sun (**S04**). A ringed giant, the small blue home world and drifting asteroids (**S05**).
  - The ground: a small grey rocky body with craters and a rim that breaks off in cliffs over the stars, teal crystals in the cliffs (**S06**). Nothing Mars-like.
  - Deposits: nickel-iron boulders with silver veins, ice in the shadowed crater breathing vapour, the rare-earth vein glowing teal (**S07**).
- **The base, built from what lands** (code says "KayKit's Space Base pieces once they're in"):
  - the first lander: radio, solar, beacon (**S13**);
  - the solar farm (**S09**), the habitat (**S08**), the crew capsule (**S14**);
  - the rover: six wheels, camera mast, arm, drill (**S12**);
  - the drill rig (**S10**), the oxygen plant (**S11**);
  - walkways and beacons (**S08**), cargo and the depot (**S17**);
  - the ascent vehicle and return ship (**S15**);
  - a habitat interior if it becomes walkable (**S16**).
- **The hero in Space:** a crew suit (**C11**); possible robot or alien hazards (**E08**).
- **Coming home:** the return capsule burns in behind its heat shield and lands under a parachute by the keep (**S14**, **V10**). The rare earths it brings become magnets for the dynamo.
- **Sound:** launch roar, the quiet of vacuum, radio chatter, suit breathing, habitat hum (**A07**).

### 1.10 Across the whole game

- **Icons:**
  - items, tools, plans, gems at three grades, devices, payloads (**I01**–**I03**; mostly R);
  - abilities (**I04**, D);
  - portraits (**I05**, R);
  - damage, armour, status, affix and rarity glyphs (**I06**);
  - Road glyphs for ages, branches, milestones, minigame kinds and disciplines (**I07**, —);
  - UI glyphs and key caps (**I08**);
  - map markers (**I09**).
- **Windows, fonts and cursors:** **U02**–**U26**.
- **VFX** (`fx.ts`: one procedural 8-cell canvas atlas — dot, spark, smoke, star, ring, chunk, leaf, rune — plus flame sprites and light pools):
  - fire, smoke and dust, magic, beams and lightning, explosions, frost;
  - hits and sparks, loot glows, radiant gems, rocket exhaust, water;
  - light pools, telegraph rings, weather, status markers.

  (**V01**–**V15**)

- **Sound** (about 60 synthesised recipes; wind is the only ambience; no music):
  - UI, foley, combat, stingers;
  - ambience, age machines, Space;
  - minigame feedback, music, voice.

  (**A01**–**A10**)

- **Notifications:** toasts, the event log, wave intel, dusk and dawn notes, the update banner.

---

## 2. The three candidate stacks

### 2.1 The free layer under every stack

These cost nothing and sit under all three stacks:

- [Google Fonts](https://developers.google.com/fonts/faq) (mostly OFL).
- [game-icons.net](https://game-icons.net/about.html): CC BY 3.0, about 4,180 monochrome SVG icons. Credit line: "Icons made by {author}. Available on https://game-icons.net".
- [Painterly Spell Icons](https://opengameart.org/node/4413) by J. W. Bjerk: CC BY 3.0 among its licences; painted spell art.
- The [Sonniss GDC archive](https://sonniss.com/gameaudiogdc): 2015–2024 bundles of about 207 GB, plus the [2026 bundle, 7.47 GB from 17 vendors](https://rekkerd.org/sonniss-releases-gdc-2026-game-audio-bundle/). Royalty-free, no attribution, no reselling "as sound effects", no AI training.
- The [Abstraction / Tallbeard Music Loop Bundle](https://tallbeard.itch.io/music-loop-bundle): "LICENSE CC-0", over 200 songs, tagged ambient, chiptune, upbeat.
- Kevin MacLeod: CC BY 4.0 ([per guide](https://app.cinevva.com/guides/free-sound-effects-music); check incompetech).
- CC0 space skyboxes on OpenGameArt ([StumpyStrust](https://opengameart.org/content/space-skyboxes-0), [kurtk84](https://opengameart.org/content/space-skybox-1)).
- Screaming Brain Studios (CC0): its [Planet Surface Skyboxes](https://screamingbrainstudios.itch.io/planet-surface-skyboxes) include Icy and Rocky sets. Skip their Mars, Red and Lava sets. The same author also posts a CC0 set of 96 2D planets on OpenGameArt (not checked).
- [three.quarks](https://npmjs.com/package/three.quarks): an MIT particle engine for three.js with an editor.
- [Wenrexa's free sci-fi UI](https://wenrexa.itch.io/kit-nesia2) (CC0).

### 2.2 Why these three

They are the three ways to buy out a whole library around KayKit:

- **A — one CC0 generalist:** cheap and safe.
- **B — the stylised-3D specialist closest to KayKit, plus a painted UI kit.**
- **C — the commercial ecosystem with era-themed HUD kits.**

itch.io's 3D best-seller list is mostly KayKit (14 of the first 36 listings) and Quaternius (10), with the Kenney All-in-1 at #3 ([itch top sellers, 3D](https://itch.io/game-assets/top-sellers/tag-3d)). Synty is the largest commercial low-poly line, sold on its own store and others.

### A · Kenney All-in-1 — $19.95, CC0, every future pack included

- **What the listing says:** "more than 60.000 game assets in a single download"; "1,200+ sound effects and music loops"; UI elements, icons, cursors and fonts; formats "PNG, SVG, OBJ, FBX, GLTF and OGG"; "New packs added frequently, free for all existing owners"; version 3.7 ([itch](https://kenney.itch.io/kenney-game-assets)).
- **What matters to us:**

| Need                     | Packs                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI skins                 | [UI Pack 2.0](https://kenney.nl/assets/ui-pack) (430 files), [UI Pack – Sci-Fi 2.0](https://kenney.nl/assets/ui-pack-sci-fi) (130), [RPG Expansion](https://kenney.nl/assets/ui-pack-rpg-expansion) (85), [Fantasy UI Borders](https://kenney.nl/assets/fantasy-ui-borders) (140, 2023)                                                                                                                                                                                   |
| Cursors, icons, fonts    | [Cursor Pack](https://kenney.nl/assets/cursor-pack) (180), [Game Icons](https://kenney.nl/assets/game-icons) (105), [Board Game Icons](https://kenney.nl/assets/board-game-icons) (250), Input Prompts, [Kenney Fonts](https://kenney.nl/assets/kenney-fonts)                                                                                                                                                                                                             |
| VFX textures             | [Particle Pack](https://kenney.nl/assets/particle-pack) (80, sample effects "fire, smoke, magic, hearts, sparks and electricity" per [OGA](https://opengameart.org/content/particle-pack-80-sprites)), [Smoke Particles](https://kenney.nl/assets/smoke-particles) (70, smoke and explosion), [Light Masks](https://kenney.nl/assets/light-masks) (150 light cookies, 2026)                                                                                               |
| Audio                    | [10 audio packs](https://kenney.nl/assets/category:Audio): [Interface Sounds](https://kenney.nl/assets/interface-sounds) 100, UI Audio, [Impact Sounds](https://kenney.nl/assets/impact-sounds) 130, [RPG Audio](https://kenney.nl/assets/rpg-audio) 50, [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) 70, Digital Audio, [Music Jingles](https://kenney.nl/assets/music-jingles) 85, [Voiceover](https://kenney.nl/assets/voiceover-pack) 90 + Fighter, Casino |
| Later ages               | [Factory Kit](https://kenney.nl/assets/factory-kit) (140, conveyors), [Train Kit](https://kenney.nl/assets/train-kit) (100, tracks, trains, trolleys), [City Kit (Industrial) 2.0](https://kenney.nl/assets/city-kit-industrial) ("Solar/wind energy")                                                                                                                                                                                                                    |
| Space                    | [Space Kit](https://kenney-assets.itch.io/space-kit) (150+: "modular parts to build extensive spaceports", ships, monorail, turrets, characters; glTF; whether it has a modular rocket is **unverified**), [Space Station Kit](https://kenney.nl/assets/space-station-kit) (90), [Modular Space Kit](https://kenney.nl/assets/modular-space-kit) (40, 2026)                                                                                                               |
| Underground and the vale | [Modular Cave Kit](https://kenney.nl/assets/modular-cave-kit) (2026), [Graveyard Kit](https://kenney.nl/assets/graveyard-kit), [Tower Defense Kit](https://kenney.nl/assets/tower-defense-kit) (160), [Survival Kit](https://kenney.nl/assets/survival-kit), [Nature Kit](https://kenney.nl/assets/nature-kit)                                                                                                                                                            |

50 3D kits in all ([category pages](https://kenney.nl/assets/category:3D)).

- **Why it is in the three:** it fills every category KayKit lacks — UI, cursors, particles, sound, fonts — under a licence the browser can't break. Kenney packs are also free one by one; the All-in-1 buys all of them at once, plus the future ones.
- **Weak spots:**
  - The look is flat, clean and saturated, more "toy". The UI is generic cartoon; Fantasy UI Borders and the RPG Expansion come closest to WoW/D3.
  - The [Minimap Pack](https://kenney.nl/assets/minimap-pack) is pixel art.
  - No skill icons. No real-world rocket confirmed.

### B · Quaternius (all packs) + Layer Lab GUI kits

- **Quaternius:** 84 packs on [quaternius.com](https://quaternius.com/).

| Group                | Packs                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medieval and fantasy | Medieval Village MegaKit, Fantasy Props MegaKit                                                                                                                                                                                                                                                                         |
| Nature               | Stylized Nature MegaKit                                                                                                                                                                                                                                                                                                 |
| Space                | [Ultimate Space Kit](https://quaternius.com/packs/ultimatespacekit.html): 92 models — "animated characters, enemies, vegetation, planets"; FBX/OBJ/Blend/glTF; March 2023; Sketchfab tags say rover, moon and _mars_ ([Sketchfab](https://sketchfab.com/3d-models/ultimate-space-kit-84c108ff2bcf4d4cbf2adff74a942822)) |
| Sci-fi               | [Sci-Fi Essentials Kit](https://quaternius.com/packs/scifiessentialskit.html) (65; animated robot enemies, "animated screens"; Nov 2024), [Modular Sci-Fi MegaKit](https://quaternius.com/packs/modularscifimegakit.html) (277; Sept 2024), Ultimate Spaceships, Animated Robot / Mech / Alien                          |
| Creatures            | [Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html) ("50 fully animated monsters"), Bestiary – Dungeon Monsters                                                                                                                                                                                     |
| Later ages           | Modular Train, Steampunk Turret, Downtown City MegaKit                                                                                                                                                                                                                                                                  |
| Animation and bodies | [Universal Animation Library 2](https://quaternius.itch.io/universal-animation-library-2) (130+ clips, "Compatible with other common rigs (Mixamo for example)"; Source $14.99), Universal Base Characters                                                                                                              |

Each pack comes in three tiers: Standard, which is 60–70% of the pack and "completely free"; Pro, an "extra 30-40%"; and Source, "All 100%", with .blend files and Unreal, Unity (URP) and Godot set-ups ([Sci-Fi Essentials](https://quaternius.com/packs/scifiessentialskit.html)). Patreon tiers ([membership](https://www.patreon.com/quaternius/membership)): Supporter 35, Silver 110, Gold 220, Diamond 545 NOK a month plus VAT. What each tier gives isn't shown publicly (**unverified**); pack pages mention "Claim Credits" for Source kits.

- **Layer Lab** sells engine-agnostic PNG kits on [itch](https://layerlab.itch.io/):
  - [GUI Pro – Fantasy RPG](https://layerlab.itch.io/gui-pro-fantasy-rpg), $39.99: 46 screens, 300+ elements, 1,200+ PNG, 361 pictograms, 90 item and 45 equipment icons; "manual 9-patch"; Godot package; v2.0 from January 2025.
  - Smaller kits: GUI – SciFi Blue $15.99, Neon, Matt Metal, Stone/DarkStone, Wooden, Ribbon Pack, Avatar Frame.
  - Icon packs: Fantasy Ore Item, Planet Pack.
- **Why it is in the three:** Quaternius has the stylised 3D closest to KayKit for the later ages, Space and animated creatures. Layer Lab is the best-looking painted UI that ships as plain files, not Unity prefabs.
- **Weak spots:**
  - No VFX and no audio.
  - Quaternius humanoids use a different rig and realistic proportions.
  - Layer Lab is single-team (up to 5 members); its licence names "mobile, PC, and console" and bans any form that allows extraction.

### C · Synty — POLYGON + INTERFACE + Icons + Particle FX

**The store** ([syntystore.com](https://syntystore.com/)): product lines are POLYGON, POLYGON Mini, SIMPLE, INTERFACE, ANIMATION and Sidekick, with collections for Unity, Unreal and Godot. There is **no audio line**.

**The catalogue that matters to us** (USD, from the [POLYGON collection pages](https://syntystore.com/collections/polygon)):

| Need                                                           | Packs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fantasy / medieval                                             | Fantasy Kingdom $349.99 ([2,100+ prefabs, Godot 4.5.1 + FBX source](https://syntystore.com/products/polygon-fantasy-kingdom)), Fantasy Village $299.99, Dungeon Realms $199.99, Dungeon Pack $149.99, Knights / Vikings / Fantasy Characters $29.99 each, Modular Fantasy Hero Characters $149.99, Fantasy Rivals $99.99, Elven Realm $199.99, Dark Fantasy $100, Goblin War Camp $179.99                                                                                                                                                                                                                                                                                                                                                                             |
| Eras between                                                   | Western Frontier $49.99, Western $29.99, Construction $49.99, Town $49.99, City $19.99, Military $299.99, War Pack $99.99, War Map – WWI $24.99, [Office $49.99](https://syntystore.com/products/polygon-office-pack) ("PC gear")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Sci-fi and Space                                               | [Sci-Fi Worlds $499.99](https://syntystore.com/en-gb/products/polygon-sci-fi-worlds) (1,200+ prefabs incl. 299 buildings, 444 props with solar panels and mining drills, 16 vehicles incl. "a rocket"; Unity / Unreal / Godot 4.6.2 / FBX; "characters use Mecanim, with no animations included"); [Sci-Fi Space $149.99](https://syntystore.com/products/polygon-sci-fi-space-pack) (660 assets, ships, a "Modular spaceship kit", planets and asteroids, "EVA Suit", escape pods; Unreal / Unity / FBX); Sci-Fi City $49.99, Sci-Fi Cyber City $199.99, Sci-Fi Horror $149.99, Sci-Fi Outpost Map $29.99, Mech Pack $99.99; [SIMPLE Space / Space Interiors $19.99, Space Characters $9.99](https://syntystore.com/collections/simple-series) (contents unverified) |
| UI ([INTERFACE](https://syntystore.com/collections/interface)) | [Fantasy Warrior HUD](https://syntystore.com/products/interface-fantasy-warrior-hud) $99.99 (1,000+ sprites; action bars, health and boss bars, 10 portraits, minimaps, tooltip, objectives, 10 cursors, 202 weapon and 165 resource icons; fonts Grenze and Texturina; Unity UGUI, Unreal since Aug 2025); Fantasy Menus $79.99; [Fantasy Screens Add-On](https://syntystore.com/products/interface-fantasy-screens) $39.99 (needs both of those; Unity only); Dark Fantasy HUD $50 / Menus $39.99 (on sale); [Sci-Fi Soldier HUD](https://syntystore.com/products/interface-sci-fi-soldier-hud) $99.99 (1,000+ sprites, dials, minimaps; Exo 2 and Orbitron); Sci-Fi Menus $79.99; Military Combat HUD $99.99; Modern Menus $99.99; Apocalypse HUD $30 (sale)       |
| Icons and VFX                                                  | [POLYGON Icons Pack](https://syntystore.com/products/polygon-icons-pack) $19.99 (520 _3D_ icons: food, letters, UI elements, crafting items, network symbols; Godot / Unreal / Unity / FBX); [Particle FX Pack](https://syntystore.com/products/polygon-particle-fx-pack) $49.99 ("120+ particle FX" — fire ×16, magic ×26, explosion ×4, sparks, electricity, steam, loot; Unreal / Unity / FBX)                                                                                                                                                                                                                                                                                                                                                                     |
| Animation                                                      | [ANIMATION](https://syntystore.com/collections/animation): Base Locomotion $69.99, Sword Combat $59.99, Bow Combat $99.99, Idles $49.99, Emotes $59.99; the collection $409.99                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Subscription                                                   | [SyntyPass](https://syntystore.com/products/syntypass): $40 a month with a 3-month minimum, or $30 a month billed yearly; "Entire Synty library", new releases, 5 seats, $10 store credit a month                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

[Bundles](https://syntystore.com/collections/bundles) are map and pack pairs; there is no "all INTERFACE" or "all POLYGON" bundle. Some store pages show "Sold out" next to an "Add to cart" button, so check one-off availability at checkout.

- **Why it is in the three:** Synty is the only vendor with complete era-themed HUD kits. Fantasy Warrior HUD has the WoW widgets ready made. Its catalogue also spans every era, from medieval to western, modern and sci-fi.
- **Weak spots:**
  - INTERFACE prefabs and animations are Unity- or Unreal-only. Only the sprite zip ports, "no support … outside Unity".
  - The POLYGON look — faceted, with realistic human proportions and a grittier tone — clashes with KayKit's chibi cast.
  - Meshes come as FBX or engine projects, not glTF.
  - Prices are high: a one-off set covering our needs is roughly $1,000–1,500.
  - Neither licence addresses the browser, and the subscription has the trap described in §0.

### 2.3 Other popular vendors, and why none is a fourth stack

| Vendor                                                                                                                                                                                                                | Why not                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Polyperfect** ([Low Poly Ultimate Pack](https://marketplace.unity.com/packages/3d/props/low-poly-ultimate-pack-54733), about 3,000 prefabs) and other Unity Asset Store specialists (e.g. Rexard icons, Cartoon FX) | The Asset Store bars letting others extract assets from the product ([Unity](https://support.unity.com/hc/en-us/articles/34387186019988-Can-I-use-assets-from-the-Asset-Store-with-other-engines)), and a browser game can't prevent that |
| **ithappy** ([own store](https://ithappystudios.com/), glTF available)                                                                                                                                                | Cartoon-city style. Its space set is literally _Mars Colony_. Licence for web unverified                                                                                                                                                  |
| **Tiny Treats** ([itch](https://tinytreats.itch.io/))                                                                                                                                                                 | CC0 and built "to match the scale and technical specs of KayKit". But its catalogue is cosy modern homes, parks and a bakery, which the full-scale vale doesn't need                                                                      |
| **Pizza Doggy** (PSX), **AssetQuest** (Stylized Forest Kit), **RG Poly** — all itch best-sellers                                                                                                                      | Pixel-texture PSX style, or nature that duplicates KayKit Forest                                                                                                                                                                          |
| **Ricimi** ([itch](https://ricimi.itch.io/))                                                                                                                                                                          | Casual, candy and kawaii UI kits; no licence shown                                                                                                                                                                                        |
| **Craftpix** ([licence](https://craftpix.net/file-licenses/))                                                                                                                                                         | "You can sell and distribute games with our assets", but "Distribution of source files is NOT permitted" and PNGs count as source files. Mostly 2D pixel or casual art                                                                    |
| **GameDev Market** sellers                                                                                                                                                                                            | Their Pro Licence reportedly bars end users extracting assets. Primary page returned 403, so **unverified**                                                                                                                               |
| **Fab**                                                                                                                                                                                                               | The Standard License has Personal and Professional tiers ([docs](https://dev.epicgames.com/documentation/en-us/fab/licenses-and-pricing-in-fab)); the EULA text wasn't retrievable (403), so web delivery is **unverified**               |
| **alkakrab** music ([610+ tracks, €14.99 on sale](https://alkakrab.itch.io/270bundle))                                                                                                                                | Popular, but the licence sits in a PDF I couldn't read (**unverified**)                                                                                                                                                                   |
| **gvesster** icons, **Bukkbeek** VFX (itch best-sellers)                                                                                                                                                              | Licence per pack unverified, or Godot shaders that don't port                                                                                                                                                                             |

---

## 3. The coverage matrix

**How to read it.**

| Mark  | Meaning                                                                                                                                                                                         |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **✓** | Off the shelf. A purpose-made asset exists and goes in through the import pipeline with no art or style work.                                                                                   |
| **~** | Partial. Usable, but needs one of: a recolour, a kit-bash, composing from generic parts, our own layout of a missing widget, or a check because the item is unverified. Or it clashes in style. |
| **✗** | Nothing usable. We make it.                                                                                                                                                                     |

- **The HUD is HTML/CSS in every stack.** Packs supply PNG skins; layout, data binding and animation stay our code. That work isn't counted against a ✓.
- **Each stack column = KayKit Complete (owned) + the free layer (§2.1) + that vendor.** A cell that only says "= KayKit" means the vendor adds nothing over what we have.
- **Scoring.** Every row counts the same: ✓ = 1, ~ = ½, ✗ = 0. The matrix is generated from `/private/tmp/claude-501/-Users-user-craftdef/9a78433f-905c-44ec-9d32-8bcd26496106/scratchpad/pack-eval/work/matrix.py` (run `gen.py` in the same folder), so the numbers can be re-run after any change of mind.
- **Licence is not in these numbers** (see §5). If Layer Lab and Synty can't legally be served from a browser, stack C collapses to the KayKit column, and B keeps only Quaternius.

### 3.1 Summary: share of needs covered

Each cell: **fully covered (✓)** · covered at least partly (✓ or ~). The last row adds the count of ✗ rows.

| Area (rows)                               | KayKit + commons     | + A Kenney           | + B Quaternius + Layer Lab | + C Synty           | A + B                | A + B + C           |
| ----------------------------------------- | -------------------- | -------------------- | -------------------------- | ------------------- | -------------------- | ------------------- |
| UI shell (26)                             | **4%** · 27%         | **50%** · 96%        | **50%** · 92%              | **69%** · 96%       | **54%** · 96%        | **73%** · 96%       |
| Icons (9)                                 | **22%** · 100%       | **33%** · 100%       | **33%** · 100%             | **44%** · 100%      | **33%** · 100%       | **44%** · 100%      |
| World (vale, interiors, underground) (31) | **35%** · 81%        | **39%** · 87%        | **35%** · 87%              | **35%** · 90%       | **39%** · 87%        | **39%** · 90%       |
| Characters (13)                           | **54%** · 92%        | **54%** · 100%       | **54%** · 100%             | **54%** · 100%      | **54%** · 100%       | **54%** · 100%      |
| Enemies (9)                               | **56%** · 100%       | **56%** · 100%       | **78%** · 100%             | **56%** · 100%      | **78%** · 100%       | **78%** · 100%      |
| VFX (15)                                  | **0%** · 7%          | **40%** · 100%       | **0%** · 7%                | **0%** · 93%        | **40%** · 100%       | **40%** · 100%      |
| Sound & music (10)                        | **30%** · 90%        | **50%** · 100%       | **30%** · 90%              | **30%** · 90%       | **50%** · 100%       | **50%** · 100%      |
| Minigame boards (21)                      | **0%** · 52%         | **5%** · 86%         | **5%** · 81%               | **5%** · 86%        | **5%** · 86%         | **5%** · 86%        |
| Road: workshops & world unlocks (21)      | **14%** · 71%        | **19%** · 95%        | **19%** · 95%              | **14%** · 100%      | **19%** · 95%        | **19%** · 100%      |
| Space (17)                                | **24%** · 88%        | **29%** · 94%        | **35%** · 94%              | **35%** · 100%      | **35%** · 94%        | **35%** · 100%      |
| **All needs (172)**                       | **21%** · 66% · 59 ✗ | **35%** · 94% · 10 ✗ | **32%** · 84% · 27 ✗       | **34%** · 95% · 9 ✗ | **38%** · 94% · 10 ✗ | **41%** · 96% · 7 ✗ |
| _weighted score (✓=1, ~=½)_               | 43                   | 65                   | 58                         | 64                  | 66                   | 69                  |

### 3.2 What each stack leaves for us

**Today, KayKit and the free layer alone:** 21% of the 172 needs need no work from us; 66% are at least partly covered; 59 have nothing usable. Those 59 are almost the whole UI, all VFX, half the minigame boards, and the electric-to-space devices.

**Stack A, Kenney:**

- **35%** needs zero styling or asset work.
- **59%** needs some. Most of it:
  - building our HUD widgets from Kenney skins (unit and boss frames, action bar, tracker, minimap);
  - grading Kenney's saturated flat colours to the vale's look;
  - composing minigame boards from bars, frames and particles;
  - kit-bashing devices, the Port and the payload stack from Space and Factory Kit parts;
  - choosing music.
- **6% (10 needs)** must be made outright:
  - the logo;
  - terrain ground, water, sky and mine walls — keep the code we have;
  - the transformer, circuit and separation boards;
  - the telegraph;
  - the crew and return capsules with heat shield and parachute.
- Biggest gains: VFX textures (0 → 40% ✓), sound (30 → 50%), UI skins (4 → 50%).

**Stack B, Quaternius + Layer Lab:**

- **32%** zero work; **52%** some; **16% (27 needs)** must be made.
- The gap is everything Quaternius doesn't sell: all VFX, cursors, voice. The same boards remain.
- Gains: enemies (56 → 78%, thanks to animated monsters and robots), Space (24 → 35%), UI skins (4 → 50%).

**Stack C, Synty:**

- **34%** zero work; **61%** some; **5% (9 needs)** must be made.
- Biggest gain: the UI shell (4 → 69%). Fantasy Warrior HUD has ready-made unit frames, boss bars, action bars, minimaps, tooltips, objectives.
- VFX stays at "~" at best: Synty's effects are Unity/Unreal particle systems.
- It costs ~$1,000+, and its licence status for browsers is unknown.

**Kenney + Quaternius (recommended):** **37%** zero work; **57%** some; **6% (10 needs)** made by us.

**All three vendors:** 41% / 55% / 4%. Synty on top of Kenney + Quaternius buys about 4 points, nearly all in the HUD.

**The minigame boards are 5% covered in every combination.** Only the era chrome (M21) is fully covered. Every board needs our composition, and three can't be bought at all:

- the transformer board;
- the live circuit board, with its water view;
- the separation board (zone refining).

### 3.3 The rows

#### UI shell

| ID  | Need                                                                                           | Today         | KayKit (owned) + free commons                       | A · Kenney All-in-1                                   | B · Quaternius + Layer Lab                            | C · Synty                                               | Note                                      |
| --- | ---------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| U01 | Logo / wordmark / title card (and favicon)                                                     | D             | ✗ —                                                 | ✗ —                                                   | ✗ —                                                   | ✗ —                                                     | No pack makes your brand.                 |
| U02 | Window & panel frames (Menu, Shop, Storage, Plan Book, Buy, Class, Road, LAN card, end screen) | C             | ✗ CSS today                                         | ✓ UI Pack 2.0, RPG Expansion, Fantasy UI Borders      | ✓ GUI Pro – Fantasy RPG; GUI – Stone/DarkStone/Wooden | ✓ INTERFACE Fantasy / Dark Fantasy Menus (sprite zip)   | Layout stays our HTML/CSS in every stack. |
| U03 | Buttons, tabs, toggles, sliders, text inputs, scrollbars                                       | C             | ✗ —                                                 | ✓ UI Pack 2.0                                         | ✓ GUI Pro – Fantasy RPG                               | ✓ Fantasy Menus                                         |                                           |
| U04 | Resource counters: gold, lives, wave no. + timer, Call wave, speed, age badge                  | D+C           | ~ game-icons glyphs; coin render from Resource Bits | ~ UI Pack / Board Game Icons (heart, coin unverified) | ~ Fantasy Icon/Picto packs (unverified items)         | ~ Fantasy Warrior HUD status/stats icons                |                                           |
| U05 | Player & target unit frames (portrait ring, level badge, HP/XP bars)                           | C+R           | ~ portraits rendered from KayKit                    | ~ bars + round frames, composed                       | ~ GUI – Avatar Frame + bars                           | ✓ Fantasy Warrior HUD Portraits + HealthBar/HealthStats |                                           |
| U06 | Boss frame (wide bar, name, affix pips)                                                        | C             | ✗ —                                                 | ~ UI bars, composed                                   | ~ bars, composed                                      | ✓ Fantasy Warrior HUD BossBar01/02                      |                                           |
| U07 | Action bar & skill slots (cooldown sweep, keybinds, interact slot) + plan bar                  | C             | ✗ —                                                 | ~ UI Pack slot squares                                | ~ slot frames                                         | ✓ Fantasy Warrior HUD ARPGBar / HotBar                  |                                           |
| U08 | Bags: tool row, item grid, stack counts, rarity borders                                        | C             | ✗ —                                                 | ~ UI Pack slots, recoloured borders                   | ~ item frames + Tier Icon Pack                        | ~ inventory icons only, no inventory prefab             |                                           |
| U09 | Selection/details panel (enemy, plan site checklist, building, station trays)                  | C             | ✗ —                                                 | ✓ panels + list rows                                  | ✓ panels                                              | ✓ panels                                                |                                           |
| U10 | Tooltips (gear with affixes, plan, enemy, milestone)                                           | C             | ✗ —                                                 | ✓ small panels                                        | ✓ popups                                              | ✓ Fantasy Warrior HUD Tooltip01                         |                                           |
| U11 | Tracker: wave intel, objectives                                                                | C             | ✗ —                                                 | ~ composed                                            | ~ composed                                            | ✓ Fantasy Warrior HUD Objectives01/02                   |                                           |
| U12 | Event log, toasts, banners (wave, discovered, level-up), placing banner, cursor hint           | C             | ✗ —                                                 | ~ panels, no ribbons                                  | ✓ Ribbon Pack + titles                                | ✓ Menus popups; Apocalypse HUD event log                |                                           |
| U13 | Minimap / big map frame + markers (vale, mines, depth)                                         | D             | ~ game-icons markers                                | ~ Minimap Pack is pixel art                           | ~ frames only                                         | ✓ Fantasy Warrior HUD minimaps + map icons              |                                           |
| U14 | World labels: nameplates, loot names, site checklists, damage/crit numbers                     | C             | ~ Google Fonts                                      | ~ fonts                                               | ~ fonts                                               | ~ damage/heal FX sprites (Apocalypse HUD)               |                                           |
| U15 | Health bars over units & buildings (one-draw-call overlay)                                     | P             | ✗ —                                                 | ✓ bar sprites                                         | ✓ bar sprites                                         | ✓ bar sprites                                           |                                           |
| U16 | Cursors (pointer, attack, interact, gather, talk, build, invalid)                              | — (OS cursor) | ✗ —                                                 | ✓ Cursor Pack (180)                                   | ✗ none                                                | ~ 10 cursors (Fantasy Warrior HUD)                      |                                           |
| U17 | Fonts (UI serif, numerals, per-era faces)                                                      | system serif  | ✓ Google Fonts (OFL)                                | ✓ + Kenney Fonts                                      | ✓ Alata + Google Fonts                                | ✓ Grenze, Texturina, Exo 2, Orbitron (Google Fonts)     |                                           |
| U18 | Road of Invention window (ages × branches tree, cards, links, locks, stars)                    | C             | ✗ —                                                 | ~ frames, arrows, stars                               | ~ frames, stars, tier icons                           | ~ Fantasy Screens panels                                | The tree layout is ours in every stack.   |
| U19 | Field Notes & Chronicle (book pages)                                                           | C             | ✗ —                                                 | ~ RPG Expansion parchment                             | ~ panels                                              | ~ panels                                                |                                           |
| U20 | Plan Book & Buy-a-plan (plan cards, discipline colours, study timers)                          | C+R           | ~ 3D-rendered plan icons                            | ✓ cards from panels                                   | ✓ cards                                               | ✓ cards                                                 |                                           |
| U21 | Tower panel: 5 gem sockets × 3 grades, 4 device slots, top upgrade, crew                       | C+R           | ~ rendered gems                                     | ~ generic slots                                       | ~ generic slots                                       | ~ generic slots                                         |                                           |
| U22 | LAN UI: join card, player bar + ping, Pause/Save/Load, update banner                           | C             | ✗ —                                                 | ✓ UI Pack                                             | ✓ GUI Pro                                             | ✓ Menus                                                 |                                           |
| U23 | Space & Port panels: launch window, flight phases, base modules, depot                         | C             | ✗ —                                                 | ✓ UI Pack – Sci-Fi                                    | ✓ GUI – SciFi Blue                                    | ✓ Sci-Fi Menus / Sci-Fi Soldier HUD                     |                                           |
| U24 | Drone HUD (battery, hull, range)                                                               | C             | ✗ —                                                 | ✓ UI Pack – Sci-Fi bars                               | ✓ GUI – SciFi Blue                                    | ✓ Sci-Fi Soldier HUD                                    |                                           |
| U25 | Minigame panel chrome + verdict overlay (Perfect / Good / Failed)                              | C             | ✗ —                                                 | ✓ UI Pack                                             | ✓ GUI Pro                                             | ✓ Menus                                                 |                                           |
| U26 | Esc menu, options, controls sheet, end screen, DEV badge + clock                               | C             | ✗ —                                                 | ✓ UI Pack + Input Prompts                             | ✓ GUI Pro + Menu Icon Sets                            | ✓ Menus + input icons                                   |                                           |

#### Icons

| ID  | Need                                                                        | Today | KayKit (owned) + free commons                                             | A · Kenney All-in-1                | B · Quaternius + Layer Lab           | C · Synty                               | Note |
| --- | --------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------ | --------------------------------------- | ---- |
| I01 | Item icons: 26 items + gold + enchanted variants                            | R     | ~ render Resource/RPG Tools; 7 items have no model                        | ~ Survival/Food 3D for a few       | ~ Fantasy Ore Item + item icons (2D) | ~ Icons_Resources (165)                 |      |
| I02 | Tool icons (axe, pickaxe, hammer, shovel)                                   | D     | ✓ render RPG Tools Bits                                                   | ✓ same                             | ✓ same                               | ✓ same                                  |      |
| I03 | Plan icons: buildings, tops, 14 gems × 3 grades, devices, payloads, upgrade | R     | ~ devices/payloads/gems are procedural                                    | ~ —                                | ~ —                                  | ~ —                                     |      |
| I04 | Ability icons (10 skills; more classes later)                               | D     | ~ game-icons.net or Painterly Spell Icons (CC BY)                         | ~ no skill icons                   | ~ Fantasy Picto Pack                 | ~ no skill icons                        |      |
| I05 | Portraits: 9 enemies, 3 classes, shopkeepers                                | R     | ✓ render KayKit characters                                                | ✓ same                             | ✓ same                               | ✓ same                                  |      |
| I06 | Glyphs: damage types, armour classes, statuses, wave affixes, rarities      | text  | ~ game-icons.net                                                          | ~ Board Game Icons                 | ~ pictos                             | ~ Status (37) / Stats icons             |      |
| I07 | Road glyphs: 9 ages, 8 branches, 25 milestones, 12 kinds, disciplines       | —     | ~ game-icons.net (anvil, gears, rail, radio, radar, chip, robot, rocket…) | ~ —                                | ~ —                                  | ~ POLYGON Icons Pack (network/crafting) |      |
| I08 | UI glyphs & key caps (×, arrows, lock, ★, ✓, keys, mouse)                   | C     | ~ game-icons                                                              | ✓ Game Icons (105) + Input Prompts | ✓ Menu Icon Sets                     | ✓ input icon sets                       |      |
| I09 | Map markers (crypts, shops, mine heads, camps, chests, towers, enemies)     | D     | ~ game-icons                                                              | ~ Minimap Pack (pixel)             | ~ —                                  | ✓ Map icons (21)                        |      |

#### World (vale, interiors, underground)

| ID  | Need                                                                                    | Today | KayKit (owned) + free commons                                   | A · Kenney All-in-1                             | B · Quaternius + Layer Lab                          | C · Synty                           | Note                                                             |
| --- | --------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| W01 | Terrain ground: painted grass/dirt/rock/sand splat                                      | P     | ✗ keep code                                                     | ✗ —                                             | ✗ —                                                 | ~ Nature Biomes ground textures     |                                                                  |
| W02 | Roads & paths                                                                           | P     | ~ Hexagon road tiles (hex)                                      | ~ City Kit Roads (modern)                       | ~ Modular Streets (modern)                          | ~ Fantasy Kingdom paths             |                                                                  |
| W03 | River, water, fords, swimming surface                                                   | P     | ✗ keep code                                                     | ✗ —                                             | ✗ —                                                 | ✗ engine shaders do not port        |                                                                  |
| W04 | Stone bridges (one deck, solid parapets) at heroic scale                                | P     | ~ Hexagon bridges                                               | ~ Castle Kit pieces                             | ~ Medieval Village MegaKit / Modular Ruins          | ~ Fantasy Kingdom                   |                                                                  |
| W05 | Mountain ring, distant silhouettes                                                      | P     | ~ Forest Nature cliffs/hills                                    | ~ Nature Kit                                    | ~ Stylized Nature MegaKit                           | ~ Nature Biomes                     |                                                                  |
| W06 | Sky dome day/night: sun glow, clouds, moon, stars                                       | P     | ✗ keep shader                                                   | ✗ —                                             | ✗ —                                                 | ✗ —                                 |                                                                  |
| W07 | Trees (oak, pine, birch, dead), stumps; the Gatewood                                    | P+K   | ✓ Forest Nature (32 trees × 8 palettes) + treegen               | ✓ = KayKit                                      | ✓ = KayKit                                          | ✓ = KayKit                          |                                                                  |
| W08 | Bushes, grass tufts, flowers, rocks, cliffs                                             | K     | ✓ Forest Nature                                                 | ✓ = KayKit                                      | ✓ = KayKit                                          | ✓ = KayKit                          |                                                                  |
| W09 | Keep, town walls, gate, keep towers                                                     | K     | ✓ Medieval Hexagon                                              | ✓ = KayKit                                      | ✓ = KayKit                                          | ✓ = KayKit                          |                                                                  |
| W10 | Village: houses, tavern, church, stables, well, windmill, watermill, market             | K     | ✓ Medieval Hexagon                                              | ✓ = KayKit                                      | ✓ = KayKit                                          | ✓ = KayKit                          |                                                                  |
| W11 | Seven shops incl. Dwarven Trading Post, Witch's Hut, Goblin Scrapper                    | K     | ✓ Hexagon + Witch cauldron/potion station                       | ✓ = KayKit                                      | ✓ = KayKit                                          | ✓ = KayKit                          |                                                                  |
| W12 | Crypts, graveyards, iron fences, arch gates                                             | K     | ✓ Halloween Bits                                                | ✓ = KayKit                                      | ✓ = KayKit                                          | ✓ = KayKit                          |                                                                  |
| W13 | Camps, Lumber Camp, chests, ruins, shrine, camp clutter                                 | K     | ✓ Hexagon, Dungeon, Halloween                                   | ✓ = KayKit                                      | ✓ = KayKit                                          | ✓ = KayKit                          |                                                                  |
| W14 | Scrapyard / junk heaps                                                                  | P     | ~ Parts_Pile, fuel barrels, Mixed Bag tool cart                 | ~ Survival / Car Kit                            | ~ Survival Pack / Zombie Apocalypse Kit             | ~ POLYGON Apocalypse (grittier)     |                                                                  |
| W15 | Quarry rocks, surface ore veins, crystal clusters                                       | P+K   | ~ Forest Nature rocks + Resource nuggets/gems                   | ~ Nature/Survival rocks                         | ~ Stylized Nature MegaKit                           | ~ Dungeon crystals                  |                                                                  |
| W16 | Braziers & torches                                                                      | P+K   | ~ Dungeon torches, Caveman campfire                             | ~ Survival Kit campfire                         | ~ Fantasy Props MegaKit                             | ~ Fantasy Kingdom                   |                                                                  |
| W17 | Power poles with visible wires; electric street lamps                                   | P     | ✗ —                                                             | ~ City Kit Roads street lights (unverified)     | ~ Modular Streets lamps (unverified)                | ~ Town/City poles (unverified)      | Wires are ours anyway.                                           |
| W18 | Hydro generator (old watermill: broken → repaired), dynamo upgrade                      | K     | ~ Hexagon watermill (no broken state)                           | ~ = KayKit                                      | ~ = KayKit                                          | ~ = KayKit                          |                                                                  |
| W19 | NPCs: townsfolk, porters, footmen, captains                                             | K     | ✓ Adventurers, Mystery Monthly townsfolk                        | ✓ = KayKit                                      | ✓ = KayKit                                          | ✓ = KayKit                          |                                                                  |
| W20 | Siege/defence extras (catapults, cannons, carts, ships)                                 | K     | ✓ Hexagon units                                                 | ✓ = KayKit                                      | ✓ = KayKit                                          | ✓ = KayKit                          |                                                                  |
| W21 | Construction sites: blueprint hologram, scaffolds, stacked parts                        | P+K   | ~ Dungeon 1.1 scaffold_*, Resource stacks; hologram shader ours | ~ = KayKit                                      | ~ = KayKit                                          | ~ Construction Pack                 |                                                                  |
| W22 | Damage states: smoking/burning buildings, rubble, ruins                                 | P     | ~ Dungeon rubble, Resource chunks                               | ~ = KayKit                                      | ~ Ultimate Modular Ruins                            | ~ = KayKit                          |                                                                  |
| W23 | Vale dressing as ages advance (lamps, wires, carts → trains, signs)                     | —     | ~ Holiday toy train, Platformer pipes                           | ~ City Kits, Train Kit, Car Kit                 | ~ Downtown City MegaKit, Modular Streets            | ~ Town / City / Western             | Modern kits clash with the medieval vale unless palette-matched. |
| W24 | Walk-in rooms (diorama walls, floors, stairs, loft, cut-away)                           | K     | ✓ Dungeon Pack                                                  | ✓ = KayKit                                      | ✓ = KayKit                                          | ✓ = KayKit                          |                                                                  |
| W25 | Room furnishing (forge, anvil, benches, bar, beds, shelves, books, drafting table)      | K     | ✓ Dungeon 1.1, Furniture, RPG Tools, Restaurant                 | ✓ = KayKit                                      | ✓ = KayKit                                          | ✓ = KayKit                          |                                                                  |
| W26 | Later-age interiors (boiler room, switchboard, signal house, computer room, clean room) | —     | ~ monitor/keyboard, Platformer pipes                            | ~ Factory Kit, Space Station Kit, Furniture Kit | ~ Modular Sci-Fi MegaKit, Sci-Fi Essentials screens | ~ Office, Sci-Fi Horror lab         |                                                                  |
| W27 | Mine lift (headframe, cage, ropes) + lift room                                          | P     | ~ Dungeon scaffold, Hexagon mine                                | ~ Modular Cave Kit                              | ~ = KayKit                                          | ~ = KayKit                          |                                                                  |
| W28 | Mine rock walls, rock types, glinting veins, cave-ins, endless shaft                    | P     | ✗ keep code                                                     | ✗ = KayKit                                      | ✗ = KayKit                                          | ✗ = KayKit                          |                                                                  |
| W29 | Pit props, torches, old tunnels, rails & ore carts                                      | P+K   | ~ scaffold, torches; no mine cart                               | ✓ Train Kit tracks + trolleys                   | ~ Modular Train Pack (unverified rails)             | ~ Dungeon Realms (unverified carts) |                                                                  |
| W30 | Caverns & lairs (Hollow Dark, Ember Deeps, Bone Halls)                                  | P+K   | ~ Dungeon + Halloween bones                                     | ~ Modular Cave Kit                              | ~ Modular Dungeons                                  | ~ Dungeon Realms                    |                                                                  |
| W31 | Deep-mine flooding, steam pumps, air shafts (Steam age)                                 | —     | ✗ —                                                             | ~ Factory Kit pipes                             | ~ —                                                 | ~ —                                 |                                                                  |

#### Characters

| ID  | Need                                                                                       | Today | KayKit (owned) + free commons                                  | A · Kenney All-in-1            | B · Quaternius + Layer Lab                | C · Synty                                     | Note |
| --- | ------------------------------------------------------------------------------------------ | ----- | -------------------------------------------------------------- | ------------------------------ | ----------------------------------------- | --------------------------------------------- | ---- |
| C01 | Knight (Tank): sword & shield                                                              | K     | ✓ Adventurers 2.0 Knight                                       | ✓ = KayKit                     | ✓ = KayKit                                | ✓ = KayKit                                    |      |
| C02 | Warchief (Support): fights with his tools                                                  | K     | ✓ Barbarian                                                    | ✓ = KayKit                     | ✓ = KayKit                                | ✓ = KayKit                                    |      |
| C03 | Mage (Magic): staff, bolts                                                                 | K     | ✓ Mage                                                         | ✓ = KayKit                     | ✓ = KayKit                                | ✓ = KayKit                                    |      |
| C04 | Future classes: Druid, Engineer, Ranger, Rogue, Paladin, Cleric                            | K     | ✓ Adventurers 2.0 + Mystery Monthly                            | ✓ = KayKit                     | ✓ = KayKit                                | ✓ = KayKit                                    |      |
| C05 | Weapon tiers (sword A–G, axe, hammer, staff, bow, shields)                                 | K     | ✓ Fantasy Weapons Bits                                         | ✓ = KayKit                     | ✓ = KayKit                                | ✓ = KayKit                                    |      |
| C06 | Visible armour tiers                                                                       | —     | ~ helmet variants + tints only                                 | ✗ —                            | ~ Modular Character Outfits (other rig)   | ~ Modular Fantasy Hero / Sidekick (other rig) |      |
| C07 | Tools in hand (axe, pickaxe, hammer, shovel, saw, wrench)                                  | K     | ✓ RPG Tools Bits                                               | ✓ = KayKit                     | ✓ = KayKit                                | ✓ = KayKit                                    |      |
| C08 | Animations incl. swim & climb (run, combat, cast, chop/pick/dig/hammer/saw, carry, emotes) | K     | ~ 139 clips; no swim/climb                                     | ✗ no compatible clips          | ~ UAL 1/2 (retarget)                      | ~ ANIMATION packs (retarget)                  |      |
| C09 | Scout drone + controller                                                                   | P     | ✗ —                                                            | ~ Space Kit craft (unverified) | ~ Sci-Fi Essentials robots                | ~ Sci-Fi Space drones                         |      |
| C10 | Lantern, thrown hand axe, potions                                                          | K     | ✓ RPG Tools, Adventurers props                                 | ✓ = KayKit                     | ✓ = KayKit                                | ✓ = KayKit                                    |      |
| C11 | Space crew suit for the hero                                                               | —     | ~ Mystery Monthly space ranger (not imported; unverified look) | ~ Space Kit characters         | ~ Ultimate Space Kit astronauts (own rig) | ~ EVA suit (Mecanim rig)                      |      |
| C12 | Shopkeepers: trader, smith, nun, guild master, dwarf, witch, goblin                        | K     | ~ Farmers, Lorekeeper, Witch, Cleric; no dwarf/goblin          | ~ Mini Characters              | ~ Universal Base Characters               | ~ Goblin War Camp, Fantasy Characters         |      |
| C13 | Tech-age NPCs (engineers, signallers, scientists)                                          | —     | ~ Engineer, Mystery Monthly driver/survivalist                 | ~ = KayKit                     | ~ Universal Base Characters               | ~ City Characters, Office workers             |      |

#### Enemies

| ID  | Need                                                                                         | Today  | KayKit (owned) + free commons           | A · Kenney All-in-1                   | B · Quaternius + Layer Lab                                            | C · Synty                                                 | Note |
| --- | -------------------------------------------------------------------------------------------- | ------ | --------------------------------------- | ------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- | ---- |
| E01 | Skeleton Minion, Bone Runner, Skeleton Warrior, Necromancer                                  | K      | ✓ Skeletons 1.1                         | ✓ = KayKit                            | ✓ = KayKit                                                            | ✓ = KayKit                                                |      |
| E02 | Wraith (flying, spectral)                                                                    | K tint | ~ tinted Skeleton Mage / Witch on broom | ~ Graveyard Kit monsters (unverified) | ~ Ultimate Monsters / Bestiary (unverified ghost)                     | ~ Dark Fantasy (unverified)                               |      |
| E03 | Bone Crusher (siege) & Bone Colossus (boss)                                                  | K      | ✓ Skeleton Golem (Rig_Large)            | ✓ = KayKit                            | ✓ = KayKit                                                            | ✓ = KayKit                                                |      |
| E04 | Grave Digger (burrower, half-buried + earth mound)                                           | K+P    | ✓ skeleton + shovel (mound ours)        | ✓ = KayKit                            | ✓ = KayKit                                                            | ✓ = KayKit                                                |      |
| E05 | The Lich (boss)                                                                              | K tint | ~ Necromancer scaled + glow             | ✗                                     | ~ Bestiary                                                            | ~ Dark Fantasy                                            |      |
| E06 | New families: orcs, werewolves, black knight, vampire, frost golem, monstrosity, witch flyer | —      | ✓ Mystery Monthly 4–6                   | ✓ = KayKit                            | ✓ = KayKit                                                            | ✓ = KayKit                                                |      |
| E07 | Mine lair creatures (bats, spiders, slimes, cave beasts)                                     | —      | ~ skeletons, golems only                | ✗ —                                   | ✓ Ultimate Monsters (50 fully animated) + Bestiary – Dungeon Monsters | ~ Dungeon Realms                                          |      |
| E08 | Space robots / alien hazards (if any)                                                        | —      | ~ Mystery Monthly robots/mechs          | ~ Space Kit                           | ✓ Animated Robot / Mech / Alien, Sci-Fi Essentials enemies            | ~ Mech Pack; Sci-Fi Worlds aliens ship without animations |      |
| E09 | Spawn / awaken / resurrect, death, hit-react clips                                           | K      | ✓ Skeletons special clips               | ✓ = KayKit                            | ✓ = KayKit                                                            | ✓ = KayKit                                                |      |

#### VFX

| ID  | Need                                                                                           | Today | KayKit (owned) + free commons | A · Kenney All-in-1                           | B · Quaternius + Layer Lab | C · Synty                            | Note |
| --- | ---------------------------------------------------------------------------------------------- | ----- | ----------------------------- | --------------------------------------------- | -------------------------- | ------------------------------------ | ---- |
| V01 | Fire: braziers, torches, forge, burn status, burning ground, ember gems                        | P     | ✗ —                           | ✓ Particle Pack flames                        | ✗ —                        | ~ POLYGON Particle FX (engine-bound) |      |
| V02 | Smoke & dust: chimneys, burning buildings, digging, landing dust                               | P     | ✗ —                           | ✓ Smoke Particles + Particle Pack             | ✗ —                        | ~ Particle FX                        |      |
| V03 | Magic: arcane bolts, Fireball, Frost Nova, Meteor, Mend, Rally, Battle Cry, Repulse            | P     | ✗ —                           | ✓ Particle Pack magic/twirl/star/circle       | ✗ —                        | ~ Magic FX ×26                       |      |
| V04 | Lightning chains, searchlight beam, relay flicker, radar sweep                                 | P     | ✗ —                           | ~ spark/trace textures                        | ✗ —                        | ~ Electricity / Lightning FX         |      |
| V05 | Explosions: Blast Ruby, dynamite, Meteor impact, building crash                                | P     | ✗ —                           | ✓ Smoke Particles explosions                  | ✗ —                        | ~ Explosion FX ×4                    |      |
| V06 | Frost: chill, freeze, shatter shards                                                           | P     | ✗ —                           | ~                                             | ✗ —                        | ~ Shards, Snow                       |      |
| V07 | Hits, sparks, slashes, crit pops (melee, arrows, hammer/weld sparks)                           | P     | ✗ —                           | ✓ Particle Pack                               | ✗ —                        | ~ Impacts, Sparks, Slashes           |      |
| V08 | Loot beams & rarity glows, pick-ups, level-up, discovery                                       | P     | ✗ —                           | ✓ flare/star textures                         | ✗ —                        | ~ Loot, Pickups FX                   |      |
| V09 | Radiant gems (embers, frost sparkle, lightning, orbiting stones, light ring) + element emblems | P     | ✗ —                           | ~ textures only                               | ✗ —                        | ~                                    |      |
| V10 | Rocket exhaust, staging, fairing jettison, vacuum landing plume, capsule entry glow            | P     | ✗ —                           | ~ flame/smoke textures; vacuum behaviour ours | ✗ —                        | ~                                    |      |
| V11 | Water splashes, wading ripples                                                                 | P     | ✗ —                           | ~                                             | ✗ —                        | ~ Water FX                           |      |
| V12 | Painted light pools, halos, lamp glows (the cheap "light")                                     | P     | ✗ keep code                   | ~ Light Masks (150 cookies, 2026)             | ✗ —                        | ✗ —                                  |      |
| V13 | Selection rings, range circles, AoE telegraphs, blueprint hologram                             | P     | ✗ —                           | ~ circles + Crosshair Pack                    | ✗ —                        | ~ reticles                           |      |
| V14 | Weather (rain, snow, fog banks) — future                                                       | —     | ✗ —                           | ~                                             | ✗ —                        | ~ Rain/Snow/Fog FX                   |      |
| V15 | Status markers (stun, frozen, shielded, enraged)                                               | P     | ~ game-icons                  | ~ = KayKit                                    | ~ pictos                   | ~ Status icons + FX                  |      |

#### Sound & music

| ID  | Need                                                                                       | Today    | KayKit (owned) + free commons               | A · Kenney All-in-1                                                                  | B · Quaternius + Layer Lab | C · Synty              | Note                                    |
| --- | ------------------------------------------------------------------------------------------ | -------- | ------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------- | ---------------------- | --------------------------------------- |
| A01 | UI: click, open/close, deny, coin, purchase, learn, place, built                           | S        | ~ Sonniss (curate)                          | ✓ Interface Sounds (100) + UI Audio (50)                                             | ~ Sonniss only             | ~ Synty sells no audio |                                         |
| A02 | Gathering & crafting foley: chop, pick, dig, saw, anvil, chisel, smelt, weld, wiring       | S        | ✓ Sonniss GDC archive (categories; curate)  | ✓ + Impact Sounds, RPG Audio                                                         | ✓ = KayKit                 | ✓ = KayKit             |                                         |
| A03 | Combat: swords, shields, bows, hand axes, spells, explosions, bones, groans, roars         | S        | ✓ Sonniss GDC archive                       | ✓ + Impact/RPG/Sci-fi                                                                | ✓ = KayKit                 | ✓ = KayKit             |                                         |
| A04 | Stingers: wave horn, alarm bell, cleared, breach, victory/defeat, level-up, discovery      | S        | ~ Sonniss + Abstraction loops               | ✓ Music Jingles (85)                                                                 | ~ = KayKit                 | ~ = KayKit             |                                         |
| A05 | Ambience: vale day/night, river, village, forge, mines, crypts, interiors                  | S (wind) | ✓ Sonniss ambiences                         | ✓ = KayKit                                                                           | ✓ = KayKit                 | ✓ = KayKit             |                                         |
| A06 | Age machines: mill, steam, electric hum, telegraph, radio static, relays, computers, belts | —        | ~ Sonniss (curate)                          | ~ Sci-fi Sounds (70) + Digital Audio (60): hums, beeps; steam/telegraph from Sonniss | ~ = KayKit                 | ~ = KayKit             |                                         |
| A07 | Space: launch roar, vacuum quiet, radio chatter, suit breath, habitat hum, rover/drill     | —        | ~ Sonniss                                   | ~ Sci-fi + Digital + Voiceover (partial)                                             | ~ = KayKit                 | ~ = KayKit             |                                         |
| A08 | Minigame feedback: ticks, pour, needle, lamp pop, hiss, crack, fuse, Morse beeps, verdicts | S        | ~                                           | ~ Interface + Digital + Impact (generic ticks/stingers)                              | ~ = KayKit                 | ~ = KayKit             |                                         |
| A09 | Music: theme, vale per age (medieval → space), wave, boss, mines, Space                    | —        | ~ Abstraction loops (CC0) + MacLeod (CC BY) | ~ Music Jingles + loops                                                              | ~ = KayKit                 | ~ = KayKit             | No pack gives a coherent per-age score. |
| A10 | Voice barks & announcer                                                                    | —        | ✗ —                                         | ~ Voiceover Pack (90) + Fighter                                                      | ✗ —                        | ✗ —                    |                                         |

#### Minigame boards

| ID  | Need                                                                                                             | Today       | KayKit (owned) + free commons                   | A · Kenney All-in-1                   | B · Quaternius + Layer Lab                         | C · Synty                                        | Note                                    |
| --- | ---------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------- | ------------------------------------- | -------------------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| M01 | Hold the band · forge/glass: bellows, fire, crucible, heat bar, cooling glass                                    | D           | ~ KayKit forge/anvil/cauldron for a 3D close-up | ~ Particle fire + UI bars             | ~ bars                                             | ~ Particle FX + gauges                           |                                         |
| M02 | Hold the band · needle gauge: boiler pressure + valve; electrolysis cell                                         | D           | ✗ —                                             | ~ UI Pack – Sci-Fi meters             | ~ GUI – Matt Metal, sliders                        | ~ Apocalypse HUD dials/gauges                    |                                         |
| M03 | Hold the band · landing on rockets (sink-rate band, fuel) & capsule entry                                        | D           | ~ KayKit landers in a 3D view                   | ~ Sci-Fi UI + Space Kit               | ~ Ultimate Space Kit + SciFi Blue                  | ~ Sci-Fi Soldier HUD dials                       |                                         |
| M04 | Hold the band · boat load line                                                                                   | D           | ~ Hexagon ships + crates                        | ~ Watercraft Kit                      | ~ Ships Pack                                       | ~ = KayKit                                       |                                         |
| M05 | Mix the ratio: crucible/vat/bowl, spouts, pour, share gauges, test piece                                         | D           | ~ Cauldron, mortar, bars, bricks, pots          | ~ Food Kit bowls + bars               | ~ bars                                             | ~ gauges                                         |                                         |
| M06 | Pick the sizes · gear train (teeth, millstone, rpm gauge)                                                        | D           | ~ Parts_Cog + procedural gears                  | ~ = KayKit                            | ~ Steampunk Turret Pack                            | ~ = KayKit                                       |                                         |
| M07 | Pick the sizes · cells in chain/side by side, lamp glow, voltmeter                                               | D           | ~ game-icons battery/bulb                       | ~ = KayKit                            | ~ = KayKit                                         | ~ = KayKit                                       |                                         |
| M08 | Pick the sizes · rocket stages, fuel, payload; flight test                                                       | D           | ✗ no KayKit rocket                              | ~ Space Kit (rocket parts unverified) | ~ Ultimate Spaceships                              | ~ Sci-Fi Worlds rocket                           |                                         |
| M09 | Pick the sizes · transformer turns                                                                               | D           | ✗ —                                             | ✗ = KayKit                            | ✗ = KayKit                                         | ✗ = KayKit                                       |                                         |
| M10 | Lay the path · circuit board (intake, 3 wire gauges heating, splits, fuses, switches, lamps, meters, water view) | D           | ✗ —                                             | ✗ = KayKit                            | ✗ = KayKit                                         | ✗ = KayKit                                       | A live circuit view: nobody sells this. |
| M11 | Lay the path · route boards: rails, pipes, belts, links, rover track, obstacles                                  | D           | ~ Platformer pipes/conveyors, hex tiles         | ~ Train Kit, Factory Kit              | ~ Modular Train Pack                               | ~ SIMPLE Trains                                  |                                         |
| M12 | Keep the beat: hammer & anvil, saw, coil, bells, pistons; rhythm lane                                            | D           | ~ anvil/hammer/saw + Hammering/Sawing clips     | ~ UI rings                            | ~ = KayKit                                         | ~ = KayKit                                       |                                         |
| M13 | Steady hand: weld seam, lathe, glass shaping, sample drill, cutter                                               | D           | ✗ —                                             | ~ spark textures                      | ✗ = KayKit                                         | ~ Sparks FX                                      |                                         |
| M14 | Separate: panning, sieving, distilling, zone refining                                                            | placeholder | ✗ —                                             | ✗ = KayKit                            | ✗ = KayKit                                         | ✗ = KayKit                                       |                                         |
| M15 | Build in order: arch + keystone on centring; engine; payload stack; ascent vehicle                               | placeholder | ~ Dungeon/Hexagon stones, landers               | ~ Space Kit, Castle Kit               | ~ = KayKit                                         | ~ = KayKit                                       |                                         |
| M16 | Decide · relay ladder: switches, relays, lamps/gates/bells, condition icons, truth table                         | D           | ~ game-icons glyphs                             | ~ Board Game Icons                    | ~ pictos                                           | ~ = KayKit                                       |                                         |
| M17 | Decide · punched-card program: cards, yard grid, rover/cart/cutter                                               | D           | ~ Board Game Bits card sprites; spacetruck/cart | ~ Board Game Pack cards               | ~ = KayKit                                         | ~ = KayKit                                       |                                         |
| M18 | Find the sweet spot: radio dial + waveform, searchlight focus, solar aim, pendulum, trajectory                   | placeholder | ✗ —                                             | ~ UI Pack – Sci-Fi                    | ~ GUI – Neon / SciFi Blue                          | ~ Sci-Fi Soldier HUD dials                       |                                         |
| M19 | Test & observe: radar scope (sweep & echo), conductivity / floating bench                                        | placeholder | ✗ —                                             | ~                                     | ~                                                  | ~ minimap dial as a scope                        |                                         |
| M20 | Encode: Morse key, sounder, paper tape, code chart; binary/pixel grid                                            | placeholder | ✗ —                                             | ~ key caps                            | ~                                                  | ~                                                |                                         |
| M21 | Era chrome for the boards (gold-on-dark → brass → enamel → CRT → sci-fi)                                         | C           | ✗ one CSS skin                                  | ✓ UI Pack / RPG / Sci-Fi variants     | ✓ Fantasy RPG, Stone, Matt Metal, Neon, SciFi Blue | ✓ Fantasy / Apocalypse / Military / Sci-Fi lines |                                         |

#### Road: workshops & world unlocks

| ID  | Need                                                                                                                                                                   | Today           | KayKit (owned) + free commons                                             | A · Kenney All-in-1                           | B · Quaternius + Layer Lab                           | C · Synty                                       | Note |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- | ---- |
| R01 | Age workshops (Foundry, Glassworks, Mechanics, Crane, Boiler house, Railhead, Kiln, Power Intake, Signal house, Radio mast, Clean room, Computer bench, Rocket works…) | reused stations | ~ Hexagon workshop/mine/blacksmith for Metal–Machine; nothing after Steam | ~ City Kit Industrial/Commercial, Factory Kit | ~ Medieval Village / Downtown City MegaKits          | ~ Western, Town, Construction, Military, Office |      |
| R02 | Bronze: bars, fittings, bells                                                                                                                                          | —               | ~ Copper/Gold bars (tint); no bell                                        | ~ Holiday Kit (bell unverified)               | ~ Fantasy Props MegaKit                              | ~ = KayKit                                      |      |
| R03 | Steel: steel tools & weapon tiers                                                                                                                                      | K               | ✓ Fantasy Weapons A→G                                                     | ✓ = KayKit                                    | ✓ = KayKit                                           | ✓ = KayKit                                      |      |
| R04 | Glass: lenses, bottles, bulbs, window glass                                                                                                                            | —               | ~ potions, magnifier, lantern                                             | ~ = KayKit                                    | ~ = KayKit                                           | ~ = KayKit                                      |      |
| R05 | Gear trains: gearbox, winch, millstone                                                                                                                                 | —               | ~ Parts_Cog, windmill, watermill                                          | ~ Factory Kit                                 | ~ Steampunk Turret Pack                              | ~ = KayKit                                      |      |
| R06 | The arch: new arched bridges & shortcuts                                                                                                                               | P               | ~ Hexagon bridges + our bridges                                           | ~ Castle Kit                                  | ~ Modular Ruins arches                               | ~ Fantasy Kingdom                               |      |
| R07 | Steam: boiler house, steam pumps for deep mines, steam winch                                                                                                           | —               | ✗ —                                                                       | ~ Factory / City Industrial tanks & chimneys  | ~ Modular Train (steam loco)                         | ~ Western Frontier (unverified)                 |      |
| R08 | Rails: rails & ore carts mine head → forge, railhead                                                                                                                   | —               | ~ Holiday Bits toy train + track                                          | ✓ Train Kit (tracks, trains, trolleys)        | ✓ Modular Train Pack                                 | ~ SIMPLE Trains (style)                         |      |
| R09 | The grid: Power Intake + switchboard, poles, lamps, motors, shock fence                                                                                                | P               | ~ procedural poles/lamps                                                  | ~ City Kit Industrial 2.0 energy              | ~ Modular Streets                                    | ~ Town / Construction                           |      |
| R10 | Batteries: battery bench, drone batteries, lanterns                                                                                                                    | —               | ~ lantern                                                                 | ~ = KayKit                                    | ~ = KayKit                                           | ~ = KayKit                                      |      |
| R11 | Searchlight device (brass mirror lamp + night beam)                                                                                                                    | P               | ~ Space Base lights, lamp_standing                                        | ~ = KayKit                                    | ~ = KayKit                                           | ~ Military (unverified)                         |      |
| R12 | Telegraph: signal house, key & sounder, wire line                                                                                                                      | —               | ✗ —                                                                       | ✗ = KayKit                                    | ✗ = KayKit                                           | ~ War Map WWI (unverified)                      |      |
| R13 | Relay Link device & control boxes                                                                                                                                      | P               | ✗ —                                                                       | ~ Factory Kit machines                        | ~ Sci-Fi Essentials props                            | ~                                               |      |
| R14 | Radio mast (drone range, outposts talk)                                                                                                                                | —               | ~ structure_tall + lights; no antenna                                     | ~ Space/City Kit antennas (unverified)        | ~ = KayKit                                           | ~ Sci-Fi Outpost comms tower                    |      |
| R15 | Radar Dish device (turning dish)                                                                                                                                       | P               | ✗ —                                                                       | ~ Space Kit dish (unverified)                 | ~                                                    | ~ Military (unverified)                         |      |
| R16 | Pure silicon: clean room, crystal puller, chips                                                                                                                        | —               | ✗ —                                                                       | ~ Space Station Kit interior                  | ~ Modular Sci-Fi MegaKit                             | ~ Sci-Fi Horror lab                             |      |
| R17 | Solar: Solar Roof device, solar field                                                                                                                                  | P               | ✓ solarpanel, roofmodule_solarpanels                                      | ✓ City Kit Industrial 2.0 solar               | ✓ = KayKit                                           | ✓ Sci-Fi Worlds solar panels                    |      |
| R18 | Computer: Targeting Computer device, computer bench                                                                                                                    | P               | ~ monitor, keyboard, arcade machine                                       | ~ Furniture Kit computer                      | ~ Sci-Fi Essentials animated screens                 | ~ Office PC gear                                |      |
| R19 | Feedback control: thermostat / governor on stations                                                                                                                    | —               | ✗ —                                                                       | ~                                             | ~                                                    | ~                                               |      |
| R20 | Robots: gathering drones, assembly arm                                                                                                                                 | —               | ~ Mystery Monthly robots/mechs (not imported)                             | ~ Factory Kit                                 | ~ Animated Robot / Mech (characters, not drones/arm) | ~ Mech Pack                                     |      |
| R21 | Conveyors: belts mine head → forge                                                                                                                                     | —               | ✓ Platformer conveyors (imported)                                         | ✓ Factory Kit conveyors                       | ✓ = KayKit                                           | ✓ = KayKit                                      |      |

#### Space

| ID  | Need                                                                        | Today | KayKit (owned) + free commons                   | A · Kenney All-in-1                               | B · Quaternius + Layer Lab           | C · Synty                             | Note                |
| --- | --------------------------------------------------------------------------- | ----- | ----------------------------------------------- | ------------------------------------------------- | ------------------------------------ | ------------------------------------- | ------------------- |
| S01 | Port: launch pad + flame trench, lattice tower + swing arm, fuel tanks      | P     | ~ landingpad, water_storage, structure_tall     | ~ Space Kit spaceport parts                       | ~ Sci-Fi Essentials / MegaKit        | ~ Sci-Fi Worlds                       |                     |
| S02 | Rocket: core stage, 2 boosters, upper stage, fairing; staging               | P     | ✗ no rocket in KayKit                           | ~ Space Kit (unverified)                          | ~ Ultimate Spaceships (sci-fi ships) | ~ Sci-Fi Worlds rocket                |                     |
| S03 | Payload stack: cruise stage (solar), descent stage (engine + legs), payload | P     | ~ lander_A/B, lander_base, solarpanel           | ~ = KayKit                                        | ~ = KayKit                           | ~ = KayKit                            |                     |
| S04 | Space sky: stars all round, galaxy band, nebulae, hard white sun            | P     | ~ OGA CC0 space skyboxes                        | ~ Planets (2D)                                    | ~ = KayKit                           | ~ Sky Dome FX                         |                     |
| S05 | Ringed giant, small blue home world, drifting asteroids                     | P     | ~ Screaming Brain 2D planets (CC0)              | ~ Planets (50, 2D)                                | ✓ Ultimate Space Kit planets (3D)    | ✓ Sci-Fi Space planets, asteroids     |                     |
| S06 | Ground: small grey rocky body, craters, rim cliffs over the stars, boulders | P     | ~ Forest Nature rocks, blue-grey palette        | ~ Space Kit terrain                               | ~ Ultimate Space Kit rocks           | ~ Sci-Fi Worlds environment           |                     |
| S07 | Deposits: nickel-iron, ice in the shadowed crater, rare-earth mound         | P     | ~ gems/nuggets recoloured                       | ~ = KayKit                                        | ~ = KayKit                           | ~ = KayKit                            |                     |
| S08 | Base modules: habitat, garage, depot, farm dome, walkways, pads, lights     | P     | ~ Space Base Bits (warm swatches need recolour) | ~ Space Kit / Modular Space Kit                   | ~ Modular Sci-Fi MegaKit             | ~ Sci-Fi Worlds buildings (realistic) |                     |
| S09 | Solar farm                                                                  | P     | ✓ solarpanel                                    | ✓ = KayKit                                        | ✓ = KayKit                           | ✓ = KayKit                            |                     |
| S10 | Drill rig                                                                   | P     | ✓ drill_structure                               | ✓ = KayKit                                        | ✓ = KayKit                           | ✓ = KayKit                            |                     |
| S11 | Oxygen plant (ice melter, electrolysis stack, tanks)                        | P     | ~ water_storage, eco_module                     | ~ = KayKit                                        | ~ = KayKit                           | ~ generators, hydroponics             |                     |
| S12 | Rover (6 wheels, camera mast, arm, drill)                                   | P     | ~ spacetruck (a truck)                          | ~ Space Kit / Car Kit                             | ~ Ultimate Space Kit (rover tag)     | ~ Sci-Fi Worlds vehicles              |                     |
| S13 | First lander (radio, solar, beacon)                                         | P     | ✓ lander_A/B                                    | ✓ = KayKit                                        | ✓ = KayKit                           | ✓ = KayKit                            |                     |
| S14 | Crew capsule & return entry capsule (heat shield, parachute)                | P     | ✗ —                                             | ✗ —                                               | ✗ —                                  | ~ Sci-Fi Space escape pods            | Parachute: no pack. |
| S15 | Ascent vehicle (two stages) + return ship                                   | P     | ~ dropship                                      | ~ = KayKit                                        | ~ Ultimate Spaceships                | ~ modular spaceship kit               |                     |
| S16 | Habitat interior (if walkable)                                              | —     | ~ Furniture Bits                                | ✓ Space Station Kit (90) + Modular Space Kit (40) | ✓ Modular Sci-Fi MegaKit (277)       | ✓ Sci-Fi Space interiors              |                     |
| S17 | Cargo, crates, fuel barrels, minerals in the depot                          | K     | ✓ cargo__, containers__, fuel barrels           | ✓ = KayKit                                        | ✓ = KayKit                           | ✓ = KayKit                            |                     |

---

## 4. Do the stacks mix?

### 4.1 Proportions and scale

|                | Units                                                                                                                                                   | Proportions                                                                                                                                                                                       | Next to a KayKit hero                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **KayKit**     | Characters stand about 2.4 KayKit units (`interiors.ts`); the game scales a person to 0.5 world units (`CHAR = 0.3`, `PERSON = 0.5` in `characters.ts`) | Chibi: big heads and hands, chunky props                                                                                                                                                          | The reference                                                                                               |
| **Kenney**     | Varies by kit; most kits tile on a 1-unit grid                                                                                                          | Simplest shapes; blocky "mini" characters                                                                                                                                                         | Props, machines, vehicles and space parts fit after a per-kit scale factor. Keep its characters out         |
| **Quaternius** | Roughly real metres                                                                                                                                     | Humans built for Mixamo-style retargeting, so adult proportions (inferred, not measured) ([UAL2](https://quaternius.itch.io/universal-animation-library-2)); stylised creatures, robots and ships | Props, ships and creatures fit. Humans will look tall and thin beside KayKit                                |
| **Synty**      | FBX in centimetres (typical Synty export; not checked per pack)                                                                                         | Realistic human proportions on Mecanim rigs (typical POLYGON; not measured); faceted low-poly; grittier tone                                                                                      | Props read as over-detailed and "realistic"; fine at a distance or in their own scene. Its characters clash |

### 4.2 Colour and texture

- **KayKit** uses one _gradient atlas_ per pack ("a single gradient atlas texture (1024x1024)", downscalable to 128×128, e.g. [Space Base Bits](https://kaylousberg.itch.io/space-base-bits)). Colour comes from where a face samples the atlas, so it stays crisp at any size. Recolouring means repainting swatches; the KayKit doc lists which Space Base swatches are red or orange. Space Base's _Extra_ tier, included in the Complete, adds an alternate texture that may already be cooler — check it.
- **Kenney** uses flat colours. Whether a kit uses plain materials or a small palette texture varies by kit (not checked per kit).
- **Quaternius** mostly uses flat material colours; many packs say "Textured ✗" (e.g. [Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html)). Newer MegaKits come textured, with custom shaders in the Source tier.
- **Synty** uses one atlas per pack with alternate colourways (Sci-Fi Space: "x24 alternative texture colours"). Its materials rely on Synty's Unity and Unreal shaders, so they need rebuilding.
- **What makes the mix work is ours, and it already exists.** Every loaded material becomes Lambert (`toLambert`) and gets the shared world patch (`patchMaterial`: painted finish, brush noise, colour drift, rim light, colour grade, fog). That pulls all four styles toward one look. Add a per-kit grade — Kenney's saturation down, Synty's grit softened — and a swatch remap that keeps every warm red or rust out of Space.

### 4.3 Rigs

- **KayKit.** `Rig_Medium` has 23 joints: root, hips, spine, chest, head; upperarm, lowerarm, wrist, hand and handslot on each side; upperleg, lowerleg, foot and toes on each side. `Rig_Large` serves big bodies. One clip library (131 + 28 clips) drives every KayKit character, and weapons ride the `handslot` bones (`docs/KAYKIT_COLLECTION.md`).
- **Quaternius.** A "universal humanoid rig … ready for retargeting", "Compatible with other common rigs (Mixamo for example)" ([UAL2](https://quaternius.itch.io/universal-animation-library-2)).
- **Synty.** Mecanim humanoid ("Characters are set up with Mecanim, but no animations are included", [Office](https://syntystore.com/products/polygon-office-pack); [Sci-Fi Worlds](https://syntystore.com/en-gb/products/polygon-sci-fi-worlds) has the same note).
- **Kenney.** Per-kit rigs ([Mini Characters](https://kenney.nl/assets/mini-characters) lists "Animation"; rig details unverified).
- **The rule.** three.js can retarget clips between skeletons with a bone-name map (`SkeletonUtils.retargetClip`). But chibi and realistic proportions differ too much: feet slide and hands miss the handslot. So:
  - heroes, NPCs and humanoid enemies stay KayKit;
  - other packs add creatures that carry their own baked clips (Quaternius "50 fully animated monsters", Animated Robot / Mech / Alien), played as-is;
  - other packs' humans appear only in isolated scenes, if at all.

### 4.4 Formats

| Source                     | Formats                                                                              | What it takes                                                         |
| -------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| KayKit, Kenney, Quaternius | glTF (plus FBX/OBJ; Quaternius also .blend)                                          | Fits `scripts/assets/build-assets.mjs` directly                       |
| Synty                      | FBX source plus Unity/Unreal projects (Godot 4.5–4.6 for some packs); no glTF listed | Blender FBX → glTF: centimetres → metres, axis fix, materials rebuilt |
| UI                         | PNG/SVG (Kenney), PNG plus a Godot package (Layer Lab), sprite zip (Synty)           | —                                                                     |
| Audio                      | OGG (Kenney), WAV (Sonniss), various (music)                                         | —                                                                     |

### 4.5 What the import pipeline must normalise

Extend the existing `import-collection.mjs` → `build-assets.mjs` pattern:

1. **Provenance.** Pin each file by SHA-256 as today, keep each vendor's licence file, and generate a credits list (game-icons.net authors, plus MacLeod or Bjerk if used).
2. **Scale and axes.** One factor per kit to `PERSON = 0.5`; Y up; a common forward axis; pivot at the base centre.
3. **Materials.** Standard/FBX → Lambert; drop PBR maps; one atlas per kit; keep vertex colours and emissive glows.
4. **Palette.** A per-kit grade, plus swatch remaps (no Mars reds; gem colours consistent with `GEM_COLORS`).
5. **Geometry.** Merge small parts per material (as props already are), group for instancing, add footprints and collision, set cull distances.
6. **Names.** One top-level node per model with a kit prefix; handle clashes as today (`OrcRaider_Axe`, `Vampire_Gem_*`).
7. **Animation.** The KayKit clip-name map; foreign creatures keep their own clips; trim clips nobody plays.
8. **Icons.** Run every new model through the existing icon studio (`Icons.shoot`) so icons share one camera and light.
9. **UI.** 9-slice insets per PNG, atlas packing, @2x, CSS variables per era skin.
10. **Audio.** Loudness-normalise the SFX bus, trim, encode to OGG/Opus, set loop points for music and ambience.
11. **VFX.** Pack the particle textures into the `fx.ts` atlas slots (dot, spark, smoke, star, ring, chunk, leaf, rune, and more).
12. **Ship only what's used.** Never put whole source packs in `public/` or a repo. Under CC0 that's tidiness; under the QAL or Synty it's compliance.

### 4.6 Which minigames can wear a different pack

The minigame panel is already an isolated scene: its own canvas in a 412 px panel. A different look reads as "you are looking at the machine", provided the panel frame stays ours and all colours pass through the same grade.

| Boards                                                                                | Look to keep or allow                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Metal & Machine** (bronze, steel, glass, gears, arch)                               | Stay in our gold-on-dark. Better still, a small 3D close-up of KayKit props (anvil, cauldron, mortar, bars, `Parts_Cog`, stones) with Kenney bars and frames for the gauges                                                                |
| **Steam** (boiler, rails)                                                             | A brass or rusted dial is fine in close-up: Synty Apocalypse HUD dials or Layer Lab "Matt Metal" if their licences allow, otherwise our drawn dial. Rails can use Kenney Train Kit pieces in a 3D board                                    |
| **Electric & Signal** (grid, batteries, searchlight, telegraph, relays, radio, radar) | These are instrument faces (meters, oscilloscope, radar scope), so a sci-fi screen skin fits without breaking the vale: Kenney UI Pack – Sci-Fi, Layer Lab SciFi Blue / Neon, Synty Sci-Fi Soldier HUD dials, Wenrexa's CC0 minimal sci-fi |
| **Electronic & Automated**                                                            | CRT-green, then monitor looks; Quaternius Sci-Fi Essentials "animated screens" for a 3D close-up                                                                                                                                           |
| **Space**                                                                             | Holo sci-fi chrome; Quaternius or Kenney ships, landers and rovers, or KayKit landers, in a 3D viewport                                                                                                                                    |

Don'ts:

- no POLYGON or Kenney characters next to a KayKit hero in a board;
- never two UI skins in one panel;
- no red, orange or rust palettes in any Space board.

---

## 5. Licences and future releases (as of October 2026)

| Source                                                                                                                                                                                                                              | Price                                                                                                                                                                          | Licence                                                        | Commercial games                                                               | Served from a browser (players can reach the files)                                                                                                    | Future packs                                                                                                            | Attribution                   | Traps                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **KayKit Complete** ([itch](https://kaylousberg.itch.io/kaykit-complete))                                                                                                                                                           | $150 (owned)                                                                                                                                                                   | CC0                                                            | Yes                                                                            | Safe                                                                                                                                                   | "every pack that will be released on itch in the future!" — "no extra purchase required"                                | Optional                      | "please don't resell unmodified copies"                                                                                                                                                                                                     |
| **Kenney All-in-1** ([itch](https://kenney.itch.io/kenney-game-assets))                                                                                                                                                             | $19.95                                                                                                                                                                         | CC0                                                            | Yes                                                                            | Safe                                                                                                                                                   | "New packs added frequently, free for all existing owners"                                                              | "no attribution required"     | —                                                                                                                                                                                                                                           |
| **Quaternius** ([licence](https://quaternius.com/license.html), [Patreon](https://www.patreon.com/quaternius/membership))                                                                                                           | Standard free; Pro and Source via Patreon (35 / 110 / 220 / 545 NOK a month) or per pack (e.g. [UAL2 Source $14.99](https://quaternius.itch.io/universal-animation-library-2)) | **QAL v1.0, 28 Aug 2026**; pack pages still say CC0            | Yes: "personal, educational, and commercial games"                             | Probably fine: "does not restrict distributing a completed Product that merely incorporates the Assets"; no protection clause; the web isn't mentioned | Through Patreon (tier benefits not public, **unverified**); licence changes "will not apply retroactively"              | "No attribution is required." | "You may not extract, repackage, sublicense, sell, or otherwise redistribute the Assets" (including as a template); termination on uncured breach                                                                                           |
| **Synty one-time purchase** ([EULA](https://syntystore.com/pages/one-time-purchase-licence))                                                                                                                                        | $9.99–$499.99 per pack                                                                                                                                                         | One-Time Purchase Licence (as at 9 July 2026)                  | Yes; "not limited by game engine, OS, platform or device"; 5 seats per licence | **Not addressed**; no anti-extraction clause, but "You must not share the source files of any Assets outside your team" — **ask Synty in writing**     | Buy each new pack                                                                                                       | None                          | Humble Bundle copies have 1 seat; no NFTs; no generative-AI use                                                                                                                                                                             |
| **SyntyPass** ([product](https://syntystore.com/products/syntypass), [EULA](https://syntystore.com/pages/standard-subscription-licence))                                                                                            | $40/month (3-month minimum) or $30/month billed yearly                                                                                                                         | Standard Subscription Licence (9 July 2026)                    | Yes                                                                            | Not addressed                                                                                                                                          | All new releases while subscribed                                                                                       | None                          | §6.2 / §12.2: stop using the assets in any new IP after expiry. §12.3: substantial development requires an active subscription; after that only minor bug fixes. **For a continuously updated LAN/web game this means subscribing forever** |
| **Layer Lab** ([licence](https://layerlab.io/pages/licences))                                                                                                                                                                       | $39.99 (GUI Pro – Fantasy RPG) etc.                                                                                                                                            | Own licence                                                    | Yes                                                                            | **Risky**: no sharing "in any form that allows others to extract or reuse them"; names only "mobile, PC, and console"                                  | Per kit                                                                                                                 | None                          | Up to 5 team members per project; no generative AI ([itch](https://layerlab.itch.io/gui-pro-fantasy-rpg))                                                                                                                                   |
| **Unity Asset Store** (Polyperfect, Rexard, Cartoon FX…) ([support](https://support.unity.com/hc/en-us/articles/34387186019988-Can-I-use-assets-from-the-Asset-Store-with-other-engines), [EULA](https://unity.com/legal/as-terms)) | Per asset                                                                                                                                                                      | Asset Store EULA (last updated 4 Dec 2024)                     | Yes, other engines allowed                                                     | **Risky**: not "in a way that allows others to extract them from your final product"                                                                   | Per asset                                                                                                               | Per asset                     | Restricted assets; publisher-specific terms                                                                                                                                                                                                 |
| **Craftpix** ([licence](https://craftpix.net/file-licenses/))                                                                                                                                                                       | Per pack or subscription                                                                                                                                                       | Own licence                                                    | "You can sell and distribute games with our assets"                            | Unclear: "Distribution of source files is NOT permitted", and PNG counts as a source file                                                              | —                                                                                                                       | Not required (freebies)       | No AI training                                                                                                                                                                                                                              |
| **GameDev Market**                                                                                                                                                                                                                  | Per asset                                                                                                                                                                      | Pro Licence                                                    | Yes                                                                            | Reportedly bars end-user extraction (**unverified**: page returned 403)                                                                                | —                                                                                                                       | —                             | —                                                                                                                                                                                                                                           |
| **Fab** ([docs](https://dev.epicgames.com/documentation/en-us/fab/licenses-and-pricing-in-fab))                                                                                                                                     | Per asset                                                                                                                                                                      | Standard License (Personal / Professional above $100k revenue) | Yes                                                                            | **Unverified** (EULA returned 403)                                                                                                                     | —                                                                                                                       | —                             | —                                                                                                                                                                                                                                           |
| **game-icons.net** ([about](https://game-icons.net/about.html))                                                                                                                                                                     | Free                                                                                                                                                                           | CC BY 3.0                                                      | Yes                                                                            | Safe                                                                                                                                                   | —                                                                                                                       | **Required**: author + site   | —                                                                                                                                                                                                                                           |
| **Painterly Spell Icons** ([OGA](https://opengameart.org/node/4413))                                                                                                                                                                | Free                                                                                                                                                                           | Multi-licensed, incl. CC BY 3.0                                | Yes                                                                            | Safe                                                                                                                                                   | —                                                                                                                       | **Required**: J. W. Bjerk     | —                                                                                                                                                                                                                                           |
| **Sonniss GDC** ([page](https://sonniss.com/gameaudiogdc))                                                                                                                                                                          | Free                                                                                                                                                                           | Sonniss GDC licence                                            | "completely royalty-free for any commercial work"                              | Excluded here; source redistribution not approved                                                                                                      | A new bundle most years (none in 2025; [2026 is out](https://rekkerd.org/sonniss-releases-gdc-2026-game-audio-bundle/)) | "No attribution is required"  | No AI/ML training                                                                                                                                                                                                                           |
| **Abstraction / Tallbeard** ([itch](https://tallbeard.itch.io/music-loop-bundle))                                                                                                                                                   | Free                                                                                                                                                                           | CC0                                                            | Yes                                                                            | Safe                                                                                                                                                   | —                                                                                                                       | Optional                      | —                                                                                                                                                                                                                                           |
| **Kevin MacLeod** ([guide](https://app.cinevva.com/guides/free-sound-effects-music))                                                                                                                                                | Free, or paid without attribution                                                                                                                                              | CC BY 4.0                                                      | Yes                                                                            | Safe                                                                                                                                                   | —                                                                                                                       | **Required**                  | Check incompetech for the exact wording                                                                                                                                                                                                     |
| **Google Fonts** ([FAQ](https://developers.google.com/fonts/faq))                                                                                                                                                                   | Free                                                                                                                                                                           | Mostly OFL                                                     | Yes                                                                            | Safe                                                                                                                                                   | —                                                                                                                       | Keep the licence file         | Rename if you modify a reserved font name                                                                                                                                                                                                   |
| **three.quarks** ([npm](https://npmjs.com/package/three.quarks))                                                                                                                                                                    | Free                                                                                                                                                                           | MIT (per author)                                               | Yes                                                                            | Code                                                                                                                                                   | —                                                                                                                       | MIT notice                    | —                                                                                                                                                                                                                                           |

**What this means in practice:**

- **"Buy once and get every future pack" exists only from KayKit (owned) and Kenney.** Quaternius is a patronage model. Synty's all-library deal is a subscription with an exit trap.
- **The game's file serving decides the rest.** Assets ship as plain files under `public/assets` — GLB today, PNG and OGG once bought UI art and sounds arrive — and the LAN server serves the same files. Anything whose licence forbids "extractable" use would need an obfuscated container, and even that only defers determined extraction.
- **Credits screen:** KayKit and Kenney are optional. game-icons.net authors are required (per icon). J. W. Bjerk and Kevin MacLeod are required if used. Abstraction is optional; Sonniss isn't needed.

---

## 6. Recommendation

### 6.1 First, use what KayKit already gives

These are already paid for and cover rows in the matrix:

- **Already imported:** Forest Nature (trees, bushes, rocks in 2 of 8 palettes); the 36-character 23-bone cast and its 159 clips; Fantasy Weapons tiers; Platformer conveyors and pipes; Space Base pieces.
- **In the Collection but not imported yet:**
  - Mystery Monthly robots, mechs and "space ranger" — the Robots milestone and maybe the crew suit;
  - Board Game Bits card sprites — the punched-card board;
  - Holiday Bits train and track — a stand-in for rails;
  - Mixed Bag's tool cart — the scrapyard;
  - the Space Base Extra alternate texture.

### 6.2 What to buy, in order

| #   | Buy                 | Cost                                                                                                                                                                                       | Use it for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Kenney All-in-1** | **$19.95**, once; future packs free                                                                                                                                                        | **UI:** skins for every window (Fantasy UI Borders + RPG Expansion for the vale's eras, UI Pack – Sci-Fi for Signal → Space), cursors, input prompts. **VFX:** particle, smoke and light-mask textures to replace the procedural atlas in `fx.ts`. **Sound:** UI, impact, RPG, sci-fi and digital sounds, jingles, voice. **3D:** Train, Factory and City-Industrial kits for Steam → Automated; Space, Station and Modular Space kits as parts for the Port and base; Modular Cave Kit for the mines                                                                                     |
| 2   | **Quaternius**      | Free Standard parts now; then one or two months of a Patreon tier with Source claims (35–545 NOK a month, benefits **unverified**), or per-pack Source buys — roughly **$5–$100** in total | **Creatures:** Ultimate Monsters + Bestiary for lair creatures and perhaps the wraith. **Robots:** Animated Robot / Mech / Alien for the Robots milestone and Space hazards. **Space:** Ultimate Space Kit (astronauts, planets, possibly a rover); Ultimate Spaceships for the ascent vehicle and return ship. **Sci-fi:** Sci-Fi Essentials (animated screens for the radar and computer boards; robots); Modular Sci-Fi MegaKit for the habitat and clean room. **Steam age:** Modular Train + Steampunk Turret. **Nature:** Stylized Nature MegaKit for cliffs. Recolour anything red |
| 3   | **Synty — hold**    | $0 now; $99.99–$199.98 if it ever happens                                                                                                                                                  | Only if the ready-made WoW-style HUD art is worth it: first get Synty's written OK for browser delivery under the One-Time licence, then buy one-off **INTERFACE – Fantasy Warrior HUD** ($99.99), optionally **Sci-Fi Soldier HUD** ($99.99). Skip POLYGON Sci-Fi Worlds ($499.99): its proportions don't suit a cartoony colony beside KayKit, which KayKit Space Base + Quaternius already do better. Never SyntyPass                                                                                                                                                                  |

**Free, right away:**

- Google Fonts: three or four era faces.
- game-icons.net: ability, Road, status and map glyphs, with credits.
- The Sonniss GDC archive: ambiences, machines, steam, electricity, launches.
- Abstraction CC0 loops for music, and MacLeod (credited) where a genre is missing.
- A CC0 space skybox as reference, or keep the Space sky shader.
- three.quarks for authoring emitters.

**Total cash:** about **$25–$120** without Synty; about **$125–$320** with one or two Synty HUD packs. NOK is converted at roughly 10–11 NOK to the dollar; that rate is not checked.

### 6.3 What we make ourselves whatever we buy

By row count with the recommended stack: **37%** of needs are covered off the shelf, **57%** need some work, and **6% (10 needs)** are made from scratch. By effort the partial rows are uneven: most UI rows are a day or two of CSS each.

My rough estimate, not measured: **60–70% of the remaining art and UI effort sits in groups 2–5 below.**

1. **Brand.** Logo, wordmark, title card.
2. **The HUD and window composition.** Every widget's layout, behaviour and animation; packs only skin them. Above all:
   - the **Road of Invention window** (ages × branches tree, cards, links, ★);
   - Field Notes and Chronicle;
   - plan cards;
   - the **tower panel** (5 gem sockets × 3 grades, 4 device slots, tops).
3. **All 21 minigame boards.** Each board's composition and live visuals. The hardest:
   - the **live circuit board with its water view**;
   - the **transformer** and **zone-refining** boards;
   - Morse tape, radar scope, relay ladder, punched cards;
   - pour-and-test vessels, the gear train;
   - the rocket-stage picture, payload stacking, the landing and entry views.

   Packs give parts: bars, frames, dials, particles, 3D props.

4. **The rocket and the flight.** Core stage + 2 boosters + upper stage + fairing and their staging, the cruise stage with panels, the descent stage (engine + legs), the ascent vehicle, the return capsule with heat shield and **parachute**, the Port's pad, tower and tanks. KayKit has no rocket and no antenna; anything bought only kit-bashes toward it.
5. **The tower's own parts.**
   - gem window seats;
   - 14 gem variants × 3 grades, with radiant effects;
   - element emblems;
   - devices sized to the window frames: searchlight, radar dish, targeting computer, relay coil.
6. **World systems kept in code, because they beat any pack here:**
   - terrain splat, roads, river and water, the day/night sky;
   - fog of war, light pools and halos, blob shadows;
   - stone bridges at heroic scale;
   - the endless mines (walls, veins, cave-ins, lift);
   - Space ground (craters, rim cliffs) and the starfield / galaxy / nebula sky.
7. **Era props no pack has:** telegraph key and sounder, relay boxes, battery cells, transformer, bellows, crucible spouts, gold pan, sieve and still, lathe, welding torch, punched-card machine, thermostat or governor, bells.
8. **Recolours.** KayKit Space Base's warm swatches, any red Quaternius planets or rocks, Kenney's saturation.
9. **Audio direction.** Picking and editing sounds from Sonniss and Kenney; a per-age soundtrack (no pack has one — choose, or commission); voice barks.
10. **A crew suit on the KayKit rig**, if the Mystery Monthly "space ranger" doesn't suit.

---

## Sources

**Project files:**

- `/Users/user/craftdef/README.md`
- `/Users/user/craftdef/docs/ROADMAP.md`
- `/Users/user/craftdef/docs/TECH_LINEAGE.md`
- `/Users/user/craftdef/docs/KAYKIT_COLLECTION.md`
- `/Users/user/craftdef/src/game/road.ts`
- `/Users/user/craftdef/src/game/content.ts`
- `/Users/user/craftdef/src/game/space.ts`
- `/Users/user/craftdef/src/ui/hud.ts`
- `/Users/user/craftdef/src/ui/windows.ts`
- `/Users/user/craftdef/src/ui/minigames/` (index, types, kit, band, ratio, sizes, path, decide and the placeholders)
- `/Users/user/craftdef/src/view/` (assets, rockets, devices, gems, emblems, sky, fx, spaceview, interiorview, procmodels, itemmodels, audio, characters, entities)

**KayKit:**

- [Complete Collection](https://kaylousberg.itch.io/kaykit-complete) · [devlog](https://kaylousberg.itch.io/kaykit-complete/devlog) · [store](https://kaylousberg.itch.io/)
- [Space Base Bits](https://kaylousberg.itch.io/space-base-bits) · [Board Game Bits](https://kaylousberg.itch.io/board-game-bits) · [Holiday Bits](https://kaylousberg.itch.io/holiday-bits) · [Mixed Bag 1](https://kaylousberg.itch.io/mixed-bag-1)

**Kenney:**

- [All-in-1](https://kenney.itch.io/kenney-game-assets) · [audio category](https://kenney.nl/assets/category:Audio) · [3D category](https://kenney.nl/assets/category:3D)
- UI and icons: [UI Pack](https://kenney.nl/assets/ui-pack) · [UI Pack – Sci-Fi](https://kenney.nl/assets/ui-pack-sci-fi) · [RPG Expansion](https://kenney.nl/assets/ui-pack-rpg-expansion) · [Fantasy UI Borders](https://kenney.nl/assets/fantasy-ui-borders) · [Game Icons](https://kenney.nl/assets/game-icons) · [Board Game Icons](https://kenney.nl/assets/board-game-icons) · [Cursor Pack](https://kenney.nl/assets/cursor-pack) · [Kenney Fonts](https://kenney.nl/assets/kenney-fonts) · [Minimap Pack](https://kenney.nl/assets/minimap-pack)
- VFX: [Particle Pack](https://kenney.nl/assets/particle-pack) · [OGA Particle Pack page](https://opengameart.org/content/particle-pack-80-sprites) · [Smoke Particles](https://kenney.nl/assets/smoke-particles) · [Light Masks](https://kenney.nl/assets/light-masks) · [Planets](https://kenney.nl/assets/planets)
- Space: [Space Kit](https://kenney.nl/assets/space-kit) · [Space Kit (itch)](https://kenney-assets.itch.io/space-kit) · [Space Station Kit](https://kenney.nl/assets/space-station-kit) · [Modular Space Kit](https://kenney.nl/assets/modular-space-kit)
- Other 3D: [Factory Kit](https://kenney.nl/assets/factory-kit) · [Train Kit](https://kenney.nl/assets/train-kit) · [City Kit (Industrial)](https://kenney.nl/assets/city-kit-industrial) · [Tower Defense Kit](https://kenney.nl/assets/tower-defense-kit) · [Graveyard Kit](https://kenney.nl/assets/graveyard-kit) · [Modular Cave Kit](https://kenney.nl/assets/modular-cave-kit) · [Survival Kit](https://kenney.nl/assets/survival-kit) · [Nature Kit](https://kenney.nl/assets/nature-kit) · [Mini Characters](https://kenney.nl/assets/mini-characters)
- Audio: [Interface Sounds](https://kenney.nl/assets/interface-sounds) · [Impact Sounds](https://kenney.nl/assets/impact-sounds) · [RPG Audio](https://kenney.nl/assets/rpg-audio) · [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) · [Music Jingles](https://kenney.nl/assets/music-jingles) · [Voiceover Pack](https://kenney.nl/assets/voiceover-pack)

**Quaternius:**

- [Site](https://quaternius.com/) · [Licence (QAL v1.0)](https://quaternius.com/license.html) · [Patreon](https://www.patreon.com/quaternius) · [Membership tiers](https://www.patreon.com/quaternius/membership)
- [Ultimate Space Kit](https://quaternius.com/packs/ultimatespacekit.html) · [Sketchfab page](https://sketchfab.com/3d-models/ultimate-space-kit-84c108ff2bcf4d4cbf2adff74a942822) · [Sci-Fi Essentials](https://quaternius.com/packs/scifiessentialskit.html) · [Modular Sci-Fi MegaKit](https://quaternius.com/packs/modularscifimegakit.html) · [Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html) · [UAL2](https://quaternius.itch.io/universal-animation-library-2) · [itch store](https://quaternius.itch.io/)

**Synty:**

- [Store](https://syntystore.com/) · [Licences overview](https://syntystore.com/pages/licences-overview) · [One-time EULA](https://syntystore.com/pages/one-time-purchase-licence) · [Subscription EULA](https://syntystore.com/pages/standard-subscription-licence) · [EULA summary](https://syntystore.com/pages/end-user-licence-agreement) · [SyntyPass](https://syntystore.com/products/syntypass)
- INTERFACE: [collection](https://syntystore.com/collections/interface) · [Apocalypse HUD](https://syntystore.com/products/interface-apocalypse-hud) · [Sci-Fi Soldier HUD](https://syntystore.com/products/interface-sci-fi-soldier-hud) · [Fantasy Warrior HUD](https://syntystore.com/products/interface-fantasy-warrior-hud) · [Fantasy Screens](https://syntystore.com/products/interface-fantasy-screens) · [Icons Pack](https://syntystore.com/products/polygon-icons-pack)
- POLYGON: [p1](https://syntystore.com/collections/polygon) · [p2](https://syntystore.com/collections/polygon?page=2) · [p3](https://syntystore.com/collections/polygon?page=3) · [p4](https://syntystore.com/collections/polygon?page=4) · [Sci-Fi Worlds](https://syntystore.com/en-gb/products/polygon-sci-fi-worlds) · [Sci-Fi Space](https://syntystore.com/products/polygon-sci-fi-space-pack) · [Fantasy Kingdom](https://syntystore.com/products/polygon-fantasy-kingdom) · [Particle FX](https://syntystore.com/products/polygon-particle-fx-pack) · [Office](https://syntystore.com/products/polygon-office-pack)
- Collections: [ANIMATION](https://syntystore.com/collections/animation) · [SIMPLE](https://syntystore.com/collections/simple-series) · [Bundles](https://syntystore.com/collections/bundles) · [Godot](https://syntystore.com/collections/godot-asset-packs)

**UI, icons, other vendors:**

- [Layer Lab itch](https://layerlab.itch.io/) · [GUI Pro – Fantasy RPG](https://layerlab.itch.io/gui-pro-fantasy-rpg) · [Layer Lab licence](https://layerlab.io/pages/licences) · [Ricimi](https://ricimi.itch.io/) · [Craftpix licence](https://craftpix.net/file-licenses/) · [Wenrexa free sci-fi UI](https://wenrexa.itch.io/kit-nesia2)
- [game-icons.net](https://game-icons.net/about.html) · Painterly Spell Icons [part 1](https://opengameart.org/node/4413) · [part 2](https://opengameart.org/content/painterly-spell-icons-part-2) · [part 3](https://opengameart.org/node/5045)
- [Unity: other engines](https://support.unity.com/hc/en-us/articles/34387186019988-Can-I-use-assets-from-the-Asset-Store-with-other-engines) · [Unity Asset Store terms](https://unity.com/legal/as-terms) · [Fab licences](https://dev.epicgames.com/documentation/en-us/fab/licenses-and-pricing-in-fab)
- [Polyperfect Low Poly Ultimate Pack](https://marketplace.unity.com/packages/3d/props/low-poly-ultimate-pack-54733) · [ithappy](https://ithappystudios.com/) · [ithappy on Superhive](https://superhivemarket.com/products/location-kingdom) · [Tiny Treats](https://tinytreats.itch.io/) · [Tiny Treats Collection 1](https://tinytreats.itch.io/collection-1)
- [itch top sellers 3D](https://itch.io/game-assets/top-sellers/tag-3d) · [itch top sellers GUI](https://itch.io/game-assets/top-sellers/tag-gui)

**Sound, sky, VFX, fonts:**

- [Sonniss GDC](https://sonniss.com/gameaudiogdc) · [GDC 2026 bundle news](https://rekkerd.org/sonniss-releases-gdc-2026-game-audio-bundle/) · [Tallbeard/Abstraction loops](https://tallbeard.itch.io/music-loop-bundle) · [alkakrab bundle](https://alkakrab.itch.io/270bundle) · [MacLeod licence guide](https://app.cinevva.com/guides/free-sound-effects-music)
- [OGA space skyboxes 0](https://opengameart.org/content/space-skyboxes-0) · [OGA space skybox 1](https://opengameart.org/content/space-skybox-1) · [Screaming Brain planet skyboxes](https://screamingbrainstudios.itch.io/planet-surface-skyboxes)
- [three.quarks](https://npmjs.com/package/three.quarks) · [three.quarks forum thread](https://discourse.threejs.org/t/trail-renderer-particle-system/10095) · [Google Fonts FAQ](https://developers.google.com/fonts/faq)

**Unverified** (named in the text): Quaternius Patreon tier benefits; whether Kenney's Space Kit has a modular rocket, satellite dish or rover; Quaternius' rover, ghost and rail items; Synty Military radar and searchlights; the KayKit "space ranger" look; GameDev Market and Fab web terms; alkakrab's licence; per-kit Kenney texture approach.
