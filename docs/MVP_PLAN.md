# BrowserDefense — MVP Plan (v0.2 "Hollowmere"; formerly CraftDef)

> Planning update 2026-10-23: [ROADMAP.md](ROADMAP.md) is the active scope for the compact
> one-mine, one-workshop progression with one enterable shop, starting with Hand & Fire. Older status/history below may
> describe the former larger world; it does not expand the new scope.

One map, the basics done really well: **plans → gather → craft → carry → assemble → defend**, always on
a beat because the next wave is coming. Cartoony, readable 3D with an RTS/ARPG camera and an MMO-style
HUD (Warcraft III / WoW / Diablo III category — our own look). _Status: playable vertical slice._

---

## 1. Pillars

1. **Plans are the interface for creating things.** Nothing is built without a plan. Placing a plan
   is free and puts a blueprint in the world; making it real is a separate loop of play.
2. **Hands-on loops, fast.** Gathering, crafting (sawing, cutting, smelting, welding, wiring, coding),
   buying, carrying and assembling are each their own small experience with an optional perfect beat.
   Raw materials take 2–3 steps (ore → ingot → gears; crystal + gears + bone → rune core).
3. **Building blocks → unique towers.** One tower (an archer on top) + four window sockets for gems
   (mined colours melted into learned variants; one element per tower) + enchanted parts.
4. **Learning is a choice.** Plans are learned per hero (time + gold); mastery per craft → specialise
   (and split crafts between players in co-op).
5. **A beat to everything.** Varying wave gaps leave time to grind camps, scavenge and build — never
   quite enough. Call waves early for gold.
6. **Plan & adapt.** Wave intel shows _features_ (kinds, armour, traits, affixes), not counts or routes —
   surveillance buildings reveal more. Mobs switch routes, burrow, and smash buildings → repair.
7. **Snappy & alive.** Every click answers in a frame; things visibly happen.
8. **Learn by playing.** The first waves are the tutorial.

## 2. Status

| Area         | Done in v0.2                                                                                                                                                                              | Next                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| World        | one map, 3 routes, river (bridges + ford), fog of war, camps, scrapyard, chests, 7 shops (3 hidden)                                                                                       | second map, breaches (new spawns mid-run)               |
| Plans        | 10 building plans, 14 gem plans in 5 colours, learning/study, mastery, library, rumours                                                                                                   | plan sharing UI for co-op, more gem variants per colour |
| Loops        | gather (5 node kinds), stations with trays + 7 hands-on actions, delivery/sockets, assembly steps, shops, storehouse, repair                                                              | cauldron (mixing/heating), gatherer buildings, porters  |
| Loot         | physical gold, enchanted parts (3 rarities, 13 affixes, 5 legendaries), crates                                                                                                            | salvage/re-roll, set bonuses, hero gear                 |
| Combat       | one archer tower + gem sockets (5 elements, auras), damage-type × armour-class matrix, statuses (burn, chill→freeze→shatter), chain lightning, bursting bolts, hero (3 abilities, levels) | more gem variants, traps                                |
| Threat       | 9 kinds incl. siege, burrowers, flyers, 2 bosses; 5 wave affixes; route choice by threat                                                                                                  | breaches, raiders that target stations                  |
| Surveillance | Seer's Emerald (vision, detects burrowers, intel: routes), Scrying Amethyst (radar pulses, intel: counts)                                                                                 | Raven Roost: map scan on cooldown ("satellite")         |
| Presentation | one look with day/night, MMO HUD, minimap, cast-bar actions, VFX, synthesized audio                                                                                                       | music, voice barks, settings for quality                |
| Tech         | deterministic sim (20 TPS), tests (sim, e2e browser, balance)                                                                                                                             | LAN host-authoritative transport, save/load             |

### v0.4 — one tower, gem sockets (2026-10-18)

- **One tower.** Watch Post, Barracks, Catapult, Arcane Spire, Lookout and Scrying Orb are gone: every
  tower is the same stone tower with an archer on top (he shoots from the start). Footmen and barracks
  went with them.
- **Gem sockets.** The tower's four upper windows hold gems. Raw gems are mined in five colours (topaz
  and ruby in every lift room's walls, sapphire and emerald deeper, amethyst deepest); a learned plan
  melts one into a variant of its colour, set as a site in a window (parts, then **smelt**). 14
  variants: elements (ember, blast, frost, storm, arcane — one per tower), speed, multishot, damage,
  range, sight (the old lookout), radar (the old scrying orb) and auras (light, haste, slow). A gem
  comes out again with its raw gem back.
- **Readable at a glance.** Each set gem sits in its window — a gold rim round the arch, a bronze
  setting, the stone cut to its own shape (round, orb, spike, marquise, eye, pear with a ring, twin)
  standing out of the wall with a glow (brighter at night). The archer glows his element's colour and
  a mote per gem circles him. The tower is named after its element (a Frost Tower).
- **Footprint = graphic.** Buildings stand on 3×3 cells (was 5×5), square to the grid, turned to face
  the road; braziers, poles and lamps on one.
- **Dev mode** (menu or **`**, saved with the game, shared in LAN): any plan, learned or not, builds the
  moment it's placed; gems go straight in; no parts, tools or hammer; unlimited gold (shops free),
  hero health and keep lives; repairs instant. A DEV badge (∞ gold and lives) shows while it's on.
- **Balance:** archer damage 13 → 17 to make up for the lost footmen; the probe has a multi-seed mode
  (`npm run balance -- --seeds 6`). A lost game no longer flips to won when the last enemy's leak ends it.

### v0.3 — what changed (2026-10-17)

- **Played behind your hero** like an MMO: WASD + mouse-look, both buttons / two-finger hold to run,
  jump, Tab targeting, F to interact, one numbered bar (1–3 skills, 4–= plans), P/G/B/M keys, Esc order.
  Your browser moves your hero at frame rate (poses), camera collides with walls and dissolves anything
  between it and you.
- **Heroic scale and a vast vale:** a person is ½ unit; Stormwind-sized keep and town wall; the map is
  stretched ×1.6 so the crypts lie out of sight down long roads; distance haze instead of a 3D fog of war.
- **World:** generated oaks/pines/birches lining the roads, rolling green land, mountains, mighty stone
  bridges, nothing useless sticking out (rocks are mineable, graves diggable).
- **Tools are bought** (axe, pickaxe, hammer, shovel); the best one is your weapon.
- **Buying:** buy a whole plan's parts (G) or buy out a plan's missing parts; bag holds stacks.
- **Threat:** the dead ignore you and your towers unless you hurt them enough or taunt (Battle Cry).
- **Mines:** four mine heads with lifts down to generated, pre-started mines: dig (pickaxe), blast
  (dynamite), veins of coal/copper/iron/sulfur/quartz/silver/gold/gems, creature lairs.
- **Day and night** (≈8 min days), styled like WoW / D3 rather than physically lit: night is a moonlit
  blue grade (stars, a big moon) where everything stays readable; fires, lamps, mine torches and your
  lantern paint warm light pools through the shared material shader (no real point lights), with
  layered flame sprites, halos, embers and bloom.
  Nights matter: an unlit tower sees up to 20% less far in the dark. A **Brazier** (known from the start,
  1×1, wood + stone) lights towers within 7 m; the keep's torches light the towers near it.
- **Electricity v1:** the old watermill on the river is a pre-placed plan — repair it (gears, ingots,
  copper, planks) into a **Hydro Generator**. That unlocks **Power Poles** (carry power 14 m pole to pole,
  wires drawn between them) and **Electric Lamps** (light towers within 10 m and the ground at night).
  Workshops on the grid work 1.5× faster. Objectives guide it: mine → watermill → lamps.
- **LAN** (the `langame/fps` way): host server, join by address, rejoin by tab token, pause/save/load
  (Postgres or files), hot updates with an Update button. Tests: `test:lan`, two-browser test.
- **No loading screens:** the vale renders at once, models stream in.
- **Renamed BrowserDefense.** Hero **classes** (Tank: Knight; Support: Warchief; Magic: Mage), picked at
  the start (or on the LAN join card), changed with C; three skills each on 1–3.
- **Performance-first, drawn look** (Ocarina of Time / DK64 spirit with high-detail painted textures):
  no post-processing, no shadow maps, Lambert materials, light pools + flame sprites + blob shadows,
  instanced patches culled by distance, adaptive resolution; no grass blades; trees show their trunks.
- **Swimming; one-piece bridge decks; the dead walk to the keep's door** and break in there; tunnelling
  Grave Diggers stay visible. **Kept state:** single-player games resume after a reload.
- **Close by, as far as you like (pace):** what the first plans need is a short walk from the gate, the
  way a strategy game's base has its mine and its tree line — south of the gate a junk heap (8 m), a
  quarry (6 m) and the edge of the Gatewood (11 m), which thickens and grows older (more wood) all the
  way to the Lumber Camp; north of it the Ashdeep mine head (16 m: start to the lift in ~5 s), seams
  showing in its lift room. The ground along the roads in front of the gate is cleared for towers;
  the wilds far out are richer (rocks and veins ≈1.5×).
- **Endless mines:** the rock below appears a chunk at a time as people go deeper (from the mine's
  seed, so saves and LAN mirrors agree); an old shaft winds on down with cave-ins to dig through;
  richer finds and nastier lairs the deeper you go (the Hollow Dark, the Ember Deeps, the Bone Halls…).
  LAN sends mines as cell changes, never whole.
- **Up on a tower** (since replaced by the wall post, below): F at a tower climbed it; on top beside
  the crew the hero lifted them. (Rally now really hastens towers — it used to read Battle Cry's
  missing value.)
- **Over the wall:** heroes never leave the walls. Tower plans are laid out from the wall-walk (48 m
  reach), supplied, raised, gemmed and mended from it; spoils on the field are hauled up. The walk is
  the battle post: a hero up there crews the nearest tower within 18 m (+25% speed, +1.5 m range;
  Knight: half damage taken, Warchief: +50% speed, Mage: +35% damage), sees 40 m over the field, and
  Battle Cry from it holds the dead below.
- **Lighter frames:** characters culled to what the lens sees (they were all drawn), proc props merged
  per material and culled past the haze, 64 m scenery patches; resolution no longer drops when the
  browser caps the frame rate. Paths to a blocked goal (a blueprint, a tower) end on the near side.

## 3. The loops in detail

- **Gather:** right-click a tree/rock/ore vein/crystal/scrap heap → the hero swings; items pop out and
  fly into the bag (16). Nodes deplete and regrow. Scrap sometimes hides enchanted parts.
- **Craft:** stations have an input tray and an output tray. They work slowly on their own; a hero at the
  station speeds it up, and the hands-on action makes it much faster. Perfect beats can yield a bonus.
- **Buy:** Market (commodities), Smithy, Arcane Emporium, Builders' Guild (scrolls), and three hidden
  specialists found by exploring — Dwarven Trading Post, Witch's Hut, Goblin Scrapper (mystery crates).
- **Carry & place:** right-click a blueprint to set in the parts you carry; enchanted parts can be
  socketed deliberately (they fill a slot of their base type and pass their enchant to the building).
- **Assemble:** each plan has 1–3 steps (hammer, saw, cut, smelt, weld, wire, code).
- **Repair:** right-click a damaged building with wood/stone/planks/blocks; hurt towers fire slower;
  destroyed ones leave salvage and drop their enchanted parts.

## 4. Combat model

|                               | Bone    | Plate    | Spectral | Warded | Colossal | Flesh |
| ----------------------------- | ------- | -------- | -------- | ------ | -------- | ----- |
| Pierce (bolts)                | 0.65    | 0.55     | 0.6      | 1.15   | 0.6      | 1.1   |
| Impact (blast bolts, Repulse) | **1.4** | 1.15     | 0.35     | 1.0    | 1.0      | 1.0   |
| Slash (footmen, hero)         | 0.9     | 0.6      | 0.7      | 1.15   | 0.8      | 1.2   |
| Fire                          | 1.0     | 0.9      | **1.3**  | 0.75   | 0.9      | 1.25  |
| Frost                         | 0.9     | 1.0      | 0.85     | 0.75   | 0.6      | 1.0   |
| Lightning                     | 1.0     | **1.35** | 1.1      | 0.7    | 1.0      | 1.0   |
| Arcane                        | 1.0     | 1.0      | **1.5**  | 0.5    | 0.9      | 1.0   |

Armour grade (0–35 %) further reduces physical damage. Layers: ground/air (the archer hits both). Statuses: burn, chill (3 stacks → freeze → brittle; Impact on a brittle foe = shatter ×1.6).

## 5. Pacing & long-term play

- A run is ~20–25 minutes on Normal (build phase up to ~3 min, 12 waves with 40–90 s gaps).
- **Sigils** (`?sigil=N`, UI later): keyed difficulty like Mythic+ / Greater Rifts — enemy HP ×1.12ᴺ,
  damage ×1.06ᴺ, more gold, higher item level and better rarity odds. Next: random wave affixes per
  sigil, a timer for key upgrades, a sigil ladder screen. Endless mode as a sandbox afterwards.

## 6. Learn-to-play (built in)

Objective chain: lay down a Tower → gather its parts → deliver → assemble (beats) → hold the North
Road → study the Swift Topaz scroll → dig out a gem → set it into a tower → saw planks → set a Seer's
Emerald → hunt for plans in the fog.
One-time hints: full bag, damaged building, first leak, diggers without a Seer's Emerald, the Hollow Trail,
first scroll. Plans arrive as wave rewards in teaching order.

## 7. Art & assets

KayKit (CC0) characters, buildings, props; everything else generated in code. All colour is set
in one place, **lighting** (sun, sky, fog, grading, terrain/grass tint, model tint/desaturation,
water, glow): one look for the vale, turned only by the time of day and by going underground or
indoors.

## 8. After the MVP

1. Second map + theme system (sci-fi outpost with radar/satellite uplink and drones, desert, steampunk,
   arcane academy) re-skinning the same rules; mixed themes.
2. Cauldron (mixing/heating → tonics, pitch, oils), gatherer buildings and porters for automation.
3. Blueprint JSON + AI architect (Ollama `deepseek-v4.1-flash`) proposing plans; the same validation
   (parts, steps, slots, prerequisites) as the plan system before anything enters the world.
4. **Road of Invention (revised plan, 2026-10-23):** one mine, one compact workshop with different
   crafting benches, and one enterable shop whose counter stock grows with the eras. Start with **Hand & Fire**: woodworking, stone/assembly and a small hearth;
   make planks and blocks, assemble a storage crate and finish a small brazier. Short educational
   minigames teach one observable principle and produce useful crafting/building results. Later eras
   unlock recipes and bench attachments in the same room. Keep painted visuals and modest-laptop
   performance; no expanding town, rivers, bridges or electricity-first requirement. Construct towers
   on one platform inside the defended yard, store them, then climb the stairs to oversight equipment:
   a top-down view lets the player choose a stored tower, place it and watch a simple transport/deploy
   graphic set it ready outside. See the active
   [ROADMAP.md](ROADMAP.md) and educational reference [TECH_LINEAGE.md](TECH_LINEAGE.md).
   Planning only: this entry does not implement or authorise the next gameplay changes.
5. Underground v2: deeper levels per mine, more creatures (bats, spiders, worms), carts and rails,
   crafting dynamite from sulfur + coal.
6. Sigil ladder UI, endless mode, more bosses, hero roster.
