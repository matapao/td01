> Combat direction (2026-10-23): use human-sized armed raiders as the smallest road troops,
> then larger soldiers and siege threats with built equipment. First implementation: armed undead
> soldiers and a wheeled ram on siege breakers, with real gate and tower damage. Cleared waves
> create at least a 100-second maintenance break: open gate, stable horses (H), riding out,
> dismounting and hands-on hammer repairs (F). Town travel remains on foot or horse. At the next
> attack, recall repair parties and close the gate. Further siege equipment and troop variety can
> build on this loop without increasing the number of tiny swarm enemies.

# The Road of Invention: one mine, one workshop, one shop

> Updated 2026-10-23. Approved planning direction, not an implementation checklist marked complete.
> This roadmap replaces the earlier expanding-town plan. Start with Hand & Fire; later eras are
> future content. Existing code and assets are reusable material, not proof that this design is done.
> Educational principles: [TECH_LINEAGE.md](TECH_LINEAGE.md). Assets: [KAYKIT_COLLECTION.md](KAYKIT_COLLECTION.md).

## Current priority: polish the first deployed tower cycle

The first complete cycle is arrival → kit → village and mine gathering → tower platform assembly →
storage → overview coordination → wagon shipment → deployed tower. Guidance is optional and can be
reopened; the first attack waits for deployment. A starter tower costs 4 wood and 4 stone.

The supporting mechanics remain small and paced before educational research and era minigames:
explore, chip mountain rock, use the lift to excavate the mine, chop trees and replant them. Materials
come from the world. The shop sells durable utility only: the complete Crafter Kit contains the axe,
pickaxe, shovel, hammer, mineral scanner and reusable seed pouch. No soil resource, consumables,
materials or crafted items are sold there. Research and era unlocks remain later work.

- Mountain rock and the underground mine share permanent, precisely aimed three-dimensional cuts.
  Small chips and larger bites change the actual surface and walking space; there are no visible
  mining-cell boundaries or automatic terrain resets. Save the cuts, not a fresh mining room.
- The mine starts with a short boarding/descent sequence into a recessed shaft bay. Three compact
  hand-worked tunnels slope to different depths, with small branches and occupied pockets. Players
  clear creatures, inspect seams and extend the workings. Old fixed railway/chamber progression is
  retired. The preparation bench provides a short game-only starter charge sequence, then charges
  are prepared from gathered coal and sulfur; T aims a charge. Mine chunks are generated only near the work and streamed as exploration grows.
- The mineral scanner is a durable utility with a small V-key screen. A deliberate pulse gives
  approximate material types, direction/distance and quantity ranges. It is guidance, not exact ore
  inventory, and it never automatically mines or reveals all deposits on the minimap.
- Pines are scattered throughout the village. Felling is permanent until the player replants.
  Shovel once to prepare green ground or a stump; use again to plant from the reusable pouch.
  A pine grows after 90 seconds. Shovelling creates planting spots, not a soil commodity.
- Terrain is traversable rather than blocked by blanket steep/border grid flags. Doorways, work
  positions and the lift stay accessible; buildings, trees and the defensive wall remain solid.
- One cartoon visual preset. Painted surfaces, silhouette variation and bounded physical chips
  carry detail. No objects dissolve or cut away to expose the character; there are no low/high
  quality modes. Keep frame work and debris bounded for modest laptops.

The research-stage outline below is future design. It does not make minigames, trading materials or
more production buildings part of the current mechanics work.

## Scope and place

The player learns to make useful things in one small workshop, using materials from one nearby mine
and a few wood and stone nodes in the yard. A third building is the enterable shop: the Crafter Kit,
basic supplies and progressively more advanced stock are sold at its indoor counter. Keep these three
buildings close together. The workshop is one compact, single-storey KayKit dungeon
room with different crafting benches. The mine remains one entrance and one connected place; later
material discoveries open within it rather than spawning more mine buildings.

- Keep the short walk between the mine, workshop and supplies. No growing town, separate smithy,
  sawmill, foundry, boiler house, signal house or other production buildings.
- No rivers, bridges, watermills, farms, extra settlements or new travel regions in this plan.
- Unlock recipes, tools and bench attachments through the eras. Reuse the room and its furniture;
  show at most three main bench positions, with one small shared assembly surface if needed.
- Each bench has one clear interaction: choose an available recipe or invention, bring its parts,
  then play its educational activity. Locked entries say what must be learned first.
- Builds are useful objects, repairs or upgrades for the existing workshop, mine and defensive
  equipment. Towers are constructed inside the defended yard, then stored and deployed through an
  oversight view. Expanding combat or the battlefield is outside this work.
- Space remains a distant learning theme. A separate launch complex or playable off-world base is
  not part of the compact progression; revisit that scope explicitly if ever wanted.

## The learning and crafting loop

1. **Notice a need:** a log must become planks, a storage crate needs parts, or a brazier needs fuel.
2. **Gather nearby:** wood and loose stone in the yard; stone and, later, ores from the same mine.
3. **Choose the bench and recipe:** show the input, useful output and one idea to learn.
4. **Learn by doing:** a short guided minigame, normally 10–30 seconds, never more than 40.
5. **See the result:** the material changes, a part fits, or a gauge responds immediately. Explain
   success or failure in one plain sentence; let the player retry safely.
6. **Use what was made:** carry the planks or blocks to a small build, repair or bench upgrade.
7. **Keep the idea:** a short Field Note records what happened, why, and a real use. First success
   records the discovery and unlocks its next recipe. Later successes practise the same principle.

Each activity teaches one idea. A timing score alone is not a lesson: the player must see how their
choice affects the material or mechanism. No quiz gates, required historical dates or formula tests.
Guidance can be replayed. Offer forgiving timing and an untimed practice option; understanding,
rather than fast reactions, is required to progress. Perfect results are an optional mastery reward.

## The third building: the shop

The shop is a small KayKit room with shelves and one counter. Enter through its door and press F.
For now it sells only the complete **Crafter Kit** for 34 gold: axe, pickaxe, shovel, hammer, mineral
scanner and reusable seed pouch. Existing tool ownership is credited; the scanner and pouch are
included utility, not separate consumable purchases. The shop does not sell materials, crafted
objects, seeds by the unit, soil or research scrolls. Gathering is the source of crafting materials.

Later research and era unlocks may introduce more advanced durable utilities in this same shop.
That catalogue is deferred until those phases are designed; no material-trading ladder is promised.
The room stays static and lightweight, with no per-shop real-time light or extra production building.

## Stairs, oversight and tower deployment

Climbing the existing defensive stairs should lead to a visible oversight post on the wall landing.
Use a simple planning table, area map and a sighting frame or range markers so its purpose reads in
Hand & Fire without electricity. This is equipment at the stair landing, not another destination
building or another workshop room. Later eras can replace or add equipment at the same post.

Reaching the top reveals an **Overview / Deploy** interaction. Using it raises the camera to a
clear top-down view of the entire wave approach area, including all lanes, arrival directions, the
gate and deployed towers. Show known routes and mark unknown approaches without revealing hidden
enemies or future wave details. The player can pan, zoom and choose a stored tower; leaving the view
returns the camera to the hero at the oversight post. The hero stays at the oversight post while coordinating deployment. Cleared-wave repair trips can go outside on foot or by horse.

### Construct inside, deploy outside

One reusable tower construction platform sits beside the workshop inside the defended yard. It is
part of the workshop's work area, not another production building. Bench-made parts go to this
platform; the player assembles the complete tower there. All tower types use the same platform as
their era unlocks them. No separate construction site or crafting minigame is needed on the field.

Completed towers enter a shared **Ready to deploy** storage list at the workshop. A stored entry
keeps its type, fitted equipment and quality; these are physical completed towers, not free copies
of a learned blueprint. This storage needs no additional storehouse building. Use one tower in
construction at a time for the first version, with no hauling schedules or worker management.

The first deployment flow is:

1. Finish one tower on the inside platform and store it. Show its ready count on the oversight map.
2. Climb the stairs, use the oversight equipment and enter the top-down deployment view.
3. Select a completed tower from storage. Preview its footprint, facing and useful range on the field.
4. Choose a valid deployment position in the allowed defence area. Roads, blocked ground, occupied
   footprints and other invalid positions clearly refuse placement and explain why.
5. Confirm once. Reserve that one stored tower and its destination; play a short, simple transport
   graphic from the yard to the chosen position, then a small set-down or unfolding animation.
6. The tower becomes **Deployed / Ready** and can defend. It cannot fire during transport or placement.

For the first version, choosing the location dispatches the transport automatically. The graphic can
be one packed-tower/crate marker moving along a drawn route; it does not require a simulated cart,
worker AI, route finding, physics or a new vehicle asset. The hero does not escort it outside.

The states are **Constructing → Stored / Ready to deploy → In transport → Deployed / Ready**.
Cancelling the placement preview changes nothing in storage. Once confirmed, remove the entry from
available stock exactly once; it must not be selected for a second deployment. Recheck the position
at confirmation, including in co-op. If placement becomes impossible, return the reserved tower to
storage instead of losing or duplicating it. Closing the overview does not stop a confirmed delivery.
Save/load must preserve both stored towers and confirmed deliveries without creating a second copy.

Keep the interface small: area map, stored-tower list, placement preview, confirm and back. No
separate tactical simulation, picture-in-picture camera or always-running second view. The overview
uses the existing scene with a top-down camera and inexpensive route/range overlays. Deployment
animations are brief, with no particles or dynamic lights required.

## Later research phase: Hand & Fire

After the gathering mechanics are accepted, Hand & Fire is the first educational research phase.
Keep it small enough to evaluate before adding Metal. Sell one **Crafter Kit** at the counter inside the shop: axe,
pickaxe, shovel, hammer, scanner and reusable seed pouch, together for 34 gold. Starting gold must cover it without a
gathering requirement; tools already owned reduce the package price. No individual tool or consumable purchases.
Obtaining the tool required for the first lesson must not depend on completing that lesson. No electricity, powered machines, automation or metals
are required for these first recipes.

### The three bench positions

| Bench                    | One principle                                                                                    | Educational activity                                                                                                       | Inputs → useful result                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Woodworking bench        | A supported piece can be cut accurately into useful parts.                                       | Place the log against a stop, support it, then follow one marked cut. Show movement or an uneven cut when support is poor. | Wood → planks; planks → parts for a small storage crate.                         |
| Stone and assembly bench | Shaping removes material; fitted parts must support each other. Teach these in separate recipes. | First trace a short marked edge to shape a stone. Later place the crate's base, sides and braces in a stable order.        | Mine/yard stone → blocks; prepared planks → an assembled storage crate.          |
| Small hearth             | Fire needs fuel and air to keep burning.                                                         | Adjust fuel and the air opening. Show the flame and a simple heat gauge respond; choking the air makes the fire fade.      | Wood → a sustained fire; prepared blocks and fuel support a small brazier build. |

Reuse the existing minigame families where they actually express the idea: Steady hand for the cut,
Build in order for assembly, Hold the band for the hearth. The supported-cut set-up is part of the
woodworking activity, not a fourth minigame system. Artwork, labels and feedback must describe this
specific task rather than re-skinning an unrelated puzzle.

### A short first session

1. Start near the workshop, mine and shop. Point out the three buildings and the workshop's bench
   positions. Enter the shop, press F at its counter and buy the Crafter Kit in one purchase.
2. Gather one small batch of wood. Make planks at the woodworking bench with guidance.
3. Enter the mine, collect nearby stone, and return. Shape a few blocks at the stone bench.
4. Assemble one storage crate at the shared assembly spot; it stores the materials just made.
5. Use the hearth lesson to sustain a fire, then finish a small brazier beside the workshop.
6. Use a small additional batch of the learned planks and blocks to assemble one basic wooden tower
   on the inside platform. Teach base → supports → platform as a short Build in order activity:
   weight needs a stable base and supports. It requires no metal or later-era recipe.
7. Climb the stairs to the oversight equipment. Select that finished tower from storage, choose its
   field position in the top-down view, and watch it be transported and deployed.
8. Show the short Field Notes and a preview of Metal: hotter work and the first ore recipe.

Use small quantities: one short gather trip per material should cover the lessons and starter builds,
including the basic tower. One successful batch per lesson should be sufficient. No repeated grinding, extra shops, long walks or mandatory perfect scores. Give a failed
first attempt its teaching materials back. In solo play, pause wave pressure during a guided lesson;
in multiplayer, leave the shared world running and let the learner leave the activity safely.

### Hand & Fire completion criteria

- One mine, one workshop and one enterable shop are the only destination buildings. All three
  crafting benches are easy to find; entrances, work positions, shop counter and mine exit stay usable.
- A new player can gather, make planks, shape blocks, assemble the crate and finish the brazier
  without needing an unavailable recipe, tool, shop or later-era resource.
- Each of the three principles has an observable response, a useful result and a short Field Note.
  The assembly recipe additionally demonstrates support and order.
- The player can retry, leave and resume an activity without losing essential tutorial materials.
- Normal crafting and building both use the lesson's output. They are not separate reward screens.
- Record completion of the wood, stone/assembly and hearth lessons, the crate and brazier, and the
  first tower construction/deployment before offering Metal. Previewing the next era does not unlock its content early.
- The stairs lead to readable oversight equipment. Its top-down view covers all wave approaches;
  the player can select a stored tower, preview a legal location, confirm delivery and return to the hero.
- A tower is assembled inside, leaves storage once, arrives through a brief transport/deployment
  graphic and becomes ready only after placement. Invalid positions and cancelled previews consume
  nothing; a failed delivery returns its tower. No tower needs outdoor crafting or an escorted trip.
- Save/load preserves learned recipes, bench availability, notes, stored materials, finished towers
  and confirmed deliveries. Earlier large
  layouts use the existing migration path; this plan must not require deleting a player's save.
- Review the first session for comprehension, walking distance and laptop performance before
  approving any later-era implementation.

## Later eras: a small extension each time

Retain the historical path, but add one central lesson and one practical result per era first.
Additional examples are an idea library, not a requirement to build everything. Unlocks require the
previous era's core lesson and the current recipe's materials; optional mastery never blocks an era.
Hand & Fire uses the explicit completion criteria above. A future era advances after its core lesson
and one useful result have been completed; introduce branching only if that remains easy to follow.

| Era         | Bench attachment or profile in the same room     | First educational lesson                                                                    | Practical result to consider later                                |
| ----------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Hand & Fire | Wood, stone/assembly, hearth                     | Supported cuts, shaping and fuel/air                                                        | Planks, blocks, storage crate, brazier                            |
| Metal       | Crucible at the hearth; anvil attachment         | Heating ore with the right process yields metal; a later recipe explores alloy proportions. | First metal part, then a stronger hand tool                       |
| Machine     | Mechanical assembly tray                         | Gear sizes trade turning speed for torque.                                                  | A hand winch or a mine hauling upgrade                            |
| Steam       | Small boiler teaching model at the hearth        | Added heat raises pressure; a valve releases it.                                            | A mine lifting upgrade                                            |
| Electric    | Low-voltage circuit board at the assembly bench  | A complete circuit carries current; resistance limits the flow.                             | A small lamp or bench motor                                       |
| Signal      | Telegraph/radio attachment at the same bench     | Agreed pulse patterns carry a message.                                                      | A simple mine or wave alarm                                       |
| Electronic  | Component tray and switch board                  | Switches can represent and combine yes/no states.                                           | A simple counting or control module                               |
| Automated   | Control attachment on a previously learned bench | Measure, compare and correct.                                                               | Automate one job the player has already performed by hand         |
| Space       | Tabletop model at the assembly bench             | Rocket stages shed empty mass.                                                              | An educational model and Field Note; no new world region promised |

A bench can gain an attachment or change its recipe profile without adding a room, NPC, building or
always-running simulation. Prefer one new interaction at a time. Larger networks, rail systems,
complex chemistry, robots and off-world travel stay deferred until the compact loop earns them.

## Visual and performance rules

- Painting and geometry carry the look: matte colours, readable silhouettes, surface grain and
  mineral stains. Use the KayKit room pieces and regular cone-shaped trees from the pack.
- Keep the mine readable under a steady fill. Lanterns are small visual accents; moving light pools,
  animated ore glints, broad additive halos and darkness that hides the materials are unnecessary.
- No shadow maps, bloom, reflection passes or other post-processing requirements. Cap resolution
  and retain adaptive scaling. No new per-bench real-time lights.
- Minigames use a lightweight 2D overlay with a few clear objects, gauges and labels. Only the active
  activity runs; hidden benches and closed activities do no animation or simulation work.
- Reuse models, materials and minigame components. Batch static room pieces and instance repeated
  props. Build mine geometry incrementally; avoid constructing the whole mine on entry.
- Target a stable 30 fps on a modest integrated-graphics laptop at 1280×720, with 60 fps where the
  machine allows. Validate on representative hardware; this is a future acceptance target, not a
  performance claim. Measure frame time, entry hitches, draw calls and memory in the yard, room,
  mine and active minigame before adding effects or more content.

## Development order and boundaries

1. Finish and review the permanent excavation, scanner and tree replanting mechanics first.
2. Review the future research plan. This documentation update does not implement benches, recipes, minigames,
   tower storage, oversight or deployment.
3. Inventory existing crafting, minigame, milestone and save code. Reuse suitable parts and identify
   assumptions about separate buildings; do not expose later-era content just because code exists.
4. Wire the three Hand & Fire bench positions and the small gather → craft → build loop.
5. Add guided activities, safe retries, useful outputs, notes and prerequisite checks.
6. Add one inside tower platform, finished-tower storage, the stair-top oversight interaction and
   top-down placement with a simple transport/deployment graphic. Cover cancellation, invalid
   positions, co-op reservations and save/load; reuse the existing basic tower and defence area.
7. Play through on a modest laptop, including overview and deployment; simplify anything confusing
   or expensive. No later era is required for the oversight post or first tower.
8. Only after the first phase is accepted, plan the first Metal attachment and recipe in detail.

Future work needs explicit implementation authorization. The older expansive town, watermill/grid-first
sequence and separate-building-per-discipline plans are superseded by this compact roadmap. Historic
content ideas in TECH_LINEAGE remain references; they do not expand the scope automatically.
