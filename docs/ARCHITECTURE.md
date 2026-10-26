# Architecture

The supported product is the first-tower loop. Retained research, rail, power and space code does not imply acceptance coverage.

```text
core ← game ← server / net
           ← view / ui
```

`src/core` owns math, seeded randomness, events and pathfinding.
`src/game` owns serializable state, validation and simulation, without DOM, storage, transport or three.js.
Architecture checks reject reversed imports and unseeded simulation clocks/randomness.
UI/view send commands through `Sim.apply` or `Input.cmd`. LAN mirrors forward them to the host and predict movement only.

## Owners

| Concern                               | Owner                                                        |
| ------------------------------------- | ------------------------------------------------------------ |
| Commands and ingress validation       | `src/game/command-types.ts`, `commands.ts`                   |
| Entity/world/event contracts          | `entity-types.ts`, `state-types.ts`, `simulation-events.ts`  |
| Fixed-step dispatch                   | `src/game/sim.ts`                                            |
| Authored content and pure rules       | `src/game/content/`; `content.ts` preserves public imports   |
| Tower costs, reservation and delivery | `src/game/towerwork.ts`                                      |
| Workshop, wagon and warning views     | `src/view/towerwork.ts`                                      |
| Guidance and first-loop UI            | `src/ui/firstloop.ts`, `preferences.ts`, `deployment-map.ts` |
| Persistent excavation and contacts    | `src/game/excavation.ts`, `mine-blocks.ts`                   |
| Rock meshes and debris                | `src/view/rockmesh.ts`, `rockdebris.ts`                      |
| Save validation and migration         | `src/game/save-format.ts`, `save.ts`                         |
| Host origin/message limits            | `server/security.ts`, `room.ts`                              |

Add mechanics as state/command → host rule → view/UI → regression test.
Read-only getters must not initialize or mutate authority.

## Invariants

- The host validates and applies one action at a time. Check and consume resources atomically.
- A kit pays its recipe once; a reserved delivery creates one tower. The first wave waits for delivery. Repair breaks start after the final attacker.
- New saved/replicated fields need old-state defaults. Update save-format validation; reject unknown root keys before restoring grids/state.
- Rock contacts require the first exposed surface, reach and host visibility. Mine rock uses a world-aligned 0.03125 m occupancy grid. A precise pick removes a bounded cluster of cells (0.09 m cavity radius); Shift uses a wider 0.19 m cavity. One compact spherical edit persists each stroke. Yield counts only newly removed solid cells and their minerals; fractional resource progress persists. Existing spherical and shallow cuts still resolve at cell centres. Saved cuts persist; cosmetic debris may expire. Protocol `ec` appends edits instead of replacing the field each tick.
- Scanner estimates sample remaining mineral at the centre and inner/outer axial probes. A carved-out deposit centre does not hide ore remaining in the tunnel walls; depleted pockets stop returning readings.
- Travel changes coordinates under the fade; transit locks commands. Presentation cannot change seeded results.
- Keep fixed simulation steps, dirty rock chunks, bounded mesh work, previous meshes until replacement, shared materials, pooled/capped debris and deliberate scan pulses.
- One visual preset and automatic resolution remain the contract. Horizontal-position floors do not support arbitrary stacked tunnels.

## Input and rendering

`src/view/input.ts` coordinates input through the narrow port in `controls/context.ts`.
Under `controls/`: `movement.ts` owns gestures/focus/poses; `picking.ts` selection;
`prompts.ts` read-only facing/reach; `interactions.ts` tool/F/right-click;
`combat.ts` ability/Tab targeting; `placement.ts` previews/plans/gems.
Preserve frame order: movement → prompts/selection → placement. Bindings stay in the coordinator; modules send commands, retain activity/transit locks and release input on focus loss.

`src/view/entities.ts` owns collections/frame lifetimes. `entity/` owns individual views;
`context.ts` supplies shared services/visibility. Consumers import focused leaves.
Typed `*-events.ts` groups receive only needed collections, register once and preserve map/array identity.
Effects cannot mutate simulation. Snapshot/LAN creation stays in the frame loop, covering entities created before rendering starts.
Submodules never import their coordinator. Existing compatibility barrels remain; new modules stay below 600 lines.

`src/ui/hud.ts` coordinates frames and feedback. `hud/layout.ts` owns DOM construction; inventory,
selection, tower attachments/work and Space panels own their respective state. `hud/events.ts`
registers feedback once. Shared context supplies services and a live hero getter; panels receive
only their required elements, not the coordinator. Preserve the existing update and callback order.

`src/view/mineview.ts` retains the older Ashdeep renderer's public surface. Under `view/mine/`,
rock tiles own replacement/disposal, glows own their pool, lift/rubble own their visibility, and
track/dressing own their instances. The supported digging view remains `excavationview.ts`. Mine chunks draw only exposed axis-aligned block faces, sampling neighboring cells across chunk boundaries to omit internal faces. Surface terrain keeps continuous marching-tetrahedra geometry. Both mesh paths yield bounded work rows and retain the previous mesh until replacement.

`src/game/content.ts` is a compatibility entry. New internal dependencies use focused `content/`
catalogues and pure rules: workshop, structures, combat, towers, plans, equipment, shops, enemies,
heroes and world time/economy. Preserve authored ordering, shared object identity and helper results.
The architecture check rejects coordinator imports from extracted leaves and runtime cycles across
all maintained application source; type-only contracts can be shared without creating runtime edges.

`systems/craft.ts`, `heroes.ts` and `combat.ts` preserve public imports. Their `crafting/`, `hero/`
and `combat/` leaves own commands, work, lifecycle, abilities, damage and projectiles. Keep command
routing, fixed-step order, atomic payments, rewards, events and seeded draws unchanged. Navigation,
Space queries/payload completion and travel start have separate owners; they do not import command
coordinators. This removes the former fourteen-module runtime cycle without callback registries.

## Loading and build contracts

Simulation, save validation and LAN rules stay synchronous. Optional presentation loads on demand:

- `ui/minigames/catalogue.ts` holds labels/validation; `load.ts` imports one typed factory/chunk.
- `ui/inventions.ts` owns pending/active attempts. Recheck permission/workshop after loading; cancellation cannot reopen a board or spend materials. Reload recovers cached import failures.
- `ui/road-window.ts` loads on Road entry; browsing eras does not fetch games.
- `view/lazy-space.ts` owns Space entry/restoration. `ui/card-art-source.ts` stays a small provider bridge.

`scripts/bundle-guard.ts` checks Vite's emitted graph: no eager Road/Space/minigames,
no game importing another implementation, and no chunk/startup total above 1,500,000 bytes.
`.vite/bundle-report.json` supports production-browser request checks. Preserve warning thresholds,
assets/unlocks and lazy imports; never raise a budget to pass the build.

## Types and module budgets

Import focused contracts (`command-types`, `entity-types`, `state-types`, `simulation-events`,
`content-types`, `loot-types`, `mine-types`, `excavation-types`, `space-types`, `save-types`).
`types.ts` and existing content/mine/save barrels retain compatibility.
`simulation-types.ts` owns registry mappings; `simulation-digest.ts` owns the deterministic digest.
Contracts add no runtime work or coordinator dependencies.

The portable ES2022 profile checks core/game without ambient types. Only `save.ts` is excluded for host serialization APIs; browser/Node profiles check it against their real declarations.
Maintained browser/server/tools enforce checked indexing, exact optional fields, complete returns and explicit dictionary access.
Omit absent optional command fields; explicit `undefined` is reserved for clearable state.
The decoder copies validated own fields. Preserve serialized names, protocol versions, recipes, iteration order and random draws.

Mine generation/parameters/track interpolation are focused helpers; authored terrain, tile geometry, painting and building UI have separate owners.
Use fixed tuples, explicit boundary rejection and concrete buffer bounds invariants.
`scripts/module-budgets.json` caps existing large files; extract a responsibility before growth.
`.legacy.*` scenarios preserve superseded designs and stay outside maintained tests. Restoring a feature requires migrating its relevant assertions.

## Statistics

`server/metrics.ts` samples authority once per simulation second and flushes completed outcomes.
Its injected port accepts metric names, finite numbers and fixed won/lost labels only.
Scores cover waves, defeats, resources and victory time; assisted runs/restored terminal saves cannot award ordinary records.
`startServer` accepts `reportMetric` and optional read-only `statisticsHttp`; private LAN data stays in its configured sink.

The LAN launcher enables compiled `@zirbel/statistics`: `/stats` and `/stats/v1`, stored in `saves/statistics`.
`TD01_STATISTICS_DIR` and `TD01_INSTANCE` choose local storage/unique instances.
Embedded servers may inject a sink or `{ directory, instance }`.
Standard dimensions are sigil 0–7 and party size 1–16; unsupported custom difficulties emit no standard scores. Keep versions/revisions separate.
