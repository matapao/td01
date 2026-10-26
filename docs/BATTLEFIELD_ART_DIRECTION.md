# Battlefield activity and landscape study

Research and map audit: 23 October 2026. This is a proposed art/layout pass, not a claim that it has been implemented or performance-tested.

## Recommended direction

Make the exterior read as **contested countryside**: trampled olive grass, dusty ochre earth, pale stones, snapped timber and isolated surviving trees. The village stays tended and warm. Enemy territory gradually acquires ash, bare wood, broken masonry and restrained violet accents. Keep the land recognizable as one valley, with wear increasing toward conflict rather than changing abruptly to a different biome.

Give important places a recognizable silhouette and a small amount of purposeful motion. A thin smoke column, cloth moving, a cart changing position or a few sparks communicates more than a constantly moving blanket of haze. Scale the visual language by distance: a distant silhouette and smoke; visible props and repeated work motions when inspected; details only when close enough to read them.

## Findings in the current game

- The generated map spans x −19 to 160 and z −64 to 64. The defensive wall is at x 22.4.
- Three routes feed the gate: North Road, South Road and Hollow Trail. Hollow Trail shares the North Crypt origin. There are **two enemy origins**, not three independent bases.
- The current scenery generator places the boundary, mine entrance and village pines. It does not presently dress the distant field or construct complete enemy settlements. Existing forest dressing principally decorates existing trees/rocks and the edges. The empty field needs placed landmarks as well as a new atmosphere treatment.
- Standard world fog-of-war rendering is optional and off by default. Atmospheric distance fog remains active: the normal lighting preset uses fog near 60 and far 140. Thus the gray distance is partly atmospheric haze, not just undiscovered territory.
- The live camera follows the hero and zooms to 26 m; there is no general detached strategic inspection camera. Work from the wall-view and drone first. A future oversight view needs its own readable scene framing.
- The simulation has waves, scheduled spawns and construction sites, but no simulated enemy economy or enemy building-construction loop. Enemy staging can visibly change with real wave state; a newly invented factory economy would be separate gameplay work.

The live code currently builds towers outside the wall, within a 48 m work radius. ROADMAP.md describes a future oversight/deployment flow. The measurements below describe the **current playable implementation**; recompute the protected footprint mask when deployment rules change.

## Placement audit

The audit instantiated the current deterministic simulation and marked all cells explored to measure potential building space independently of discovery. It called the authoritative placement validator at every grid center for the current 3 × 3 tower footprint, retaining existing road, slope, occupancy and scenery restrictions.

- **2,403 legal tower centers**; these are overlapping placement alternatives, not 2,403 towers that fit simultaneously.
- Their footprints collectively occupy **2,981 unique grid cells**.
- Legal tower centers extend from x **25.5 to 68.5** in this map snapshot.
- A coarse 4 m scenery scan found **245 candidate sites** outside those footprints plus a four-cell buffer, with at least 8 m road-centerline clearance. These are candidate locations, not proposed object counts.

Preserve the union of every legal tower footprint, then pad it for both trunks and visible crowns. A trunk-only test is insufficient: branches can obscure a tower even when its placement technically succeeds. Final clusters need a test using their full footprint and crown extents. Low ground stains can cross this mask; raised props should not.

| Region, world x           | Intended look                                  | Suggested dressing and restrictions                                                                                                                                                             |
| ------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Village, west of 22.4     | Maintained, warm, inhabited                    | Existing pines, orderly workshop props, one restrained chimney plume only while work is active. Preserve the shop, workshop and mine entrance approaches.                                       |
| Defensive apron, 24.2–44  | Worn defensive ground                          | Dust, boot-worn patches, flat ruts, pale chips, tiny broken stakes. Keep all 827 currently valid tower centers available. Put upright remnants outside protected footprints and their margins.  |
| Contested ground, 44–76   | Shared history of both sides                   | Broad irregular patches of faded grass, old cart tracks and low foundation traces. This region contains the remaining 1,576 legal centers. Keep road bends and route convergence visually open. |
| Outer battlefield, 76–126 | Ragged countryside with identifiable landmarks | A few small tree groups, one ruined field boundary, an abandoned cart and broken orchard. Leave broad grass/dirt gaps between groups and open sight corridors along the roads.                  |
| Enemy staging, 126–160    | Activity concentrated around the two origins   | Broken gates, low stone footings, crates, tall standards, sparse deadwood and thin smoke. Leave both departure lanes clear. Activity belongs to the camp; the surrounding field remains calm.   |

### Candidate tree groups

These centers passed the coarse protected-space and road-clearance screen. They identify composition pockets; inspect final models before placing an entire cluster.

| Center (x, z) | Treatment                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------ |
| (82.4, −39)   | North surviving grove: 5–7 uneven olive/brown trees, one snapped trunk, low stone scatter. |
| (86.4, 49)    | South shoulder grove: 5–7 trees, a low broken fence and dry grass.                         |
| (110.4, 9)    | Broken orchard: 4–6 widely spaced trees, alternating healthy and damaged silhouettes.      |
| (126.4, −11)  | Northern deadwood fringe: 3–5 bare trunks; restrained ash-colored ground.                  |
| (130.4, 9)    | Southern fringe: 3–5 bare trees and one low ruin fragment.                                 |
| (146.4, 1)    | Far rim: a few narrow snags to break the skyline between the two camps.                    |

Start with roughly **24–36 exterior trees across these pockets**, rather than scattering trees uniformly. Use existing kit meshes with a small palette of variations. Exterior trees should be decorative; the current hero cannot cross the wall to harvest them. Do not introduce unreachable resource nodes.

Road exclusions should use each route's actual half-width plus a margin and the final mesh footprint. The audit's 8 m centerline buffer is a conservative first screen, not a replacement for that test. Preserve visibility from the wall across the first road bends. Keep silhouettes sparse on the inside of bends where towers need clear targets.

## Activity language

| State                | Visible signal                                                                               | Low-cost construction                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quiet / inactive     | A distinct still silhouette, muted cloth and an unlit hearth                                 | Existing static geometry and material colors.                                                                                                       |
| Operating            | A narrow, slow plume; one repeated work motion; a tiny warm window or brazier face           | A few pooled smoke cards, one transform animation, emissive-looking color without a light.                                                          |
| Building / preparing | Ground footprint, partial frame, stacked parts; occasional dust; frame changes at milestones | Prebuilt low-poly stages shown only when real progress crosses a threshold. Scale/replace small sections rather than rebuilding a mesh every frame. |
| Ready / mustering    | Raised standard, gate movement, more concentrated sparks or dust                             | One flag/gate transform and a capped burst. Distinguish shape and rhythm as well as color.                                                          |
| Damaged / stalled    | Crooked standard, stopped mechanism, a short dark plume                                      | A state change and a brief effect, not permanent dense smoke.                                                                                       |

Friendly construction can follow actual site progress. For enemy camps, first use existing wave states: dormant, operating, publicly indicated preparation, departure, then quiet. Place ambient crates and fittings once. Cosmetic activity should not imply that destroying a cart changes wave strength unless that mechanic exists.

### Discovery and strategic information

Show useful life without silently removing the Seer's Emerald and radar benefits. `waveIntel()` currently reveals origin crypts at intelligence level 1 and counts at level 2.

- Always-visible ambient activity may use broad public state and the known setting; it should not identify the next attacking origin from hidden spawn data.
- Once an origin is legitimately known and its activity is visible, show its permitted current state. During a departure already announced by the game, show its gate/standard response.
- A preparation signal tied to the next particular crypt should follow the existing intelligence gate. Troop quantities remain tied to scouting/radar.
- Explored-but-unobserved activity should show its last known appearance when that distinction is implemented; currently the simulation tracks exploration, not a complete last-seen structure system.
- If a marker is necessary on the map, use a small known-location activity marker. Avoid inventing a new scouting system merely to add decoration.

Blizzard's StarCraft II guide explicitly separates remembered structures from hidden troop movements and new construction, with a sensor-tower exception. Age of Empires likewise distinguishes shroud from fog-of-war. This is a useful information-design precedent, rather than a requirement to copy their visual style.

## Keeping the distant view readable

Tune distance haze so the horizon retains a few broad silhouettes and warm/cool accents. Test first with the camera standing on both wall walks; the eastern camps can be roughly 120 m away. Smoke rendered with the ordinary fog material can disappear into the same haze it is intended to enliven.

If needed, give only the coarse, permitted activity silhouette a controlled fog response. It must still depth-test against terrain and respect the game's information rules. Preserve some atmospheric perspective; making every distant object equally crisp would flatten the valley. Avoid a screen-space glow around the hero, new point lights, bloom or another fullscreen pass.

## Initial performance budgets

These are proposed ceilings to measure, not benchmark results:

- Two enemy activity anchors; at most one friendly workshop anchor. No world-wide emitter grid.
- Around 4–6 live smoke puffs per anchor; roughly 18 total. Emit every 0.7–1.2 seconds, not every frame. Use a shared atlas and existing pooled effect infrastructure where its fog behavior is suitable.
- At most 2–4 tiny worker silhouettes if close enough to read them, moved on authored short loops with no navigation, avoidance or AI. At distance, retain the plume/standard and stop drawing the workers.
- A few preset prop batches using shared materials. Merge static ruins and fences; instance repeated trees. Cull by region and screen size.
- Static ground wear generated once into existing vertex colors or splat attributes. Sample a precomputed layout mask during generation; do not loop over every scar in the terrain fragment shader.
- No new dynamic lights or shadow casters. Material color, silhouettes, baked tones and sparse movement carry the look.
- Keep smoke cards compact. A small particle count can still be expensive when several large transparent cards overlap most of the screen.
- A provisional target of at most 0.2 ms extra CPU and 0.5 ms extra GPU on the chosen minimum-spec laptop; retain the pass only after measuring the actual hardware. Compare no-waves and peak-wave captures at the same camera and resolution.

Riot's guidance puts gameplay clarity and a clear visual hierarchy ahead of ambient detail, and specifically warns that even small environment-shader costs multiply over a large portion of the screen. Three.js documents merging/instancing to reduce draw-call overhead and using billboard facades for distant detail. These support a sparse, batched approach.

## Implementation and review order

1. Capture the wall-view, both road shoulders and the two origins before changes. Record frame time, draw calls, triangles and transparent coverage.
2. Add the protected build/canopy mask and candidate-layout data. Assert that the set of valid tower centers remains identical. Also inspect silhouettes; numerical placement preservation does not guarantee visual clarity.
3. Paint neutral field wear with the existing terrain data. Keep the collision surface unchanged.
4. Place the six small tree/ruin pockets. Check all three enemy routes, the gate convergence, both wall-view sightlines and tower placement previews.
5. Add two recognizable camp silhouettes and one restrained friendly activity source. Connect public/scouted states before adding extra motion.
6. Test distant haze, day, dusk and night; preserve activity readability without changing combat visibility. Test dev-mode waves-off: a stopped muster must not continue to advertise a coming attack.
7. Measure peak-wave performance. Remove the least informative decoration first if the budget is exceeded.

## Sources

- [Blizzard: StarCraft II map elements](https://news.blizzard.com/en-us/article/4546768/game-guide-map-elements) — visibility, last-known structures and sensor information.
- [Age of Empires: atmosphere guide](https://support.ageofempires.com/hc/en-us/articles/8330758084628-Ultimate-Atmosphere-Guide) — shroud/fog distinction and tinting.
- [Riot: Clarity in League](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/) — readable signals, hierarchy and controlled visual noise.
- [Riot: VALORANT shaders and gameplay clarity](https://www.riotgames.com/en/news/valorant-shaders-and-gameplay-clarity) — environment cost, stylized lighting, smoke and performance.
- [Three.js: Optimize lots of objects](https://threejs.org/manual/pages/optimize-lots-of-objects.html) — merging geometry and draw-call overhead.
- [Three.js: Billboards](https://threejs.org/manual/pages/billboards.html) — cheap distant representations.

Local evidence: `src/game/map.ts`, `src/game/scenery.ts`, `src/game/systems/craft.ts`, `src/game/waves.ts`, `src/game/sim.ts`, `src/view/forest.ts`, `src/view/scenery.ts`, `src/view/terrain.ts`, `src/view/fx.ts`, `src/view/lighting.ts`, `src/view/camera.ts` and `src/view/game.ts`.
