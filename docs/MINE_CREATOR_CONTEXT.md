# Mine creator and pickaxe context

Status: superseded design brief from 24 October 2026. On 25 October the requested direction changed
from detailed geological fractures and shallow pick chips to small building blocks, following fps01.
The implemented mine uses 3.125 cm cubic blocks with varied stepped depths; a precise pick chips
a cluster of tiny blocks and Shift clears a wider patch. Surface terrain remains smooth. The
scanner tracks real remaining ore pockets, including ore left around already opened tunnel centres. The
fracture and creator proposals below are archived reference, not the current acceptance contract;
see [GAMEPLAY.md](GAMEPLAY.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

The priority remains arrival → gather → construct at the workshop platform → coordinate shipment →
first deployed tower. Keep this loop readable before adding deeper research and era systems.

## Reference study

Visually reviewed seven contact sheets: 128 loaded references, including 115 photographs of mine
workings, tunnels, exposed rock and rockfalls; geological diagrams are indexed separately. Five
irrelevant subjects/logos are excluded. The [reference index](research/mine-reference-index.json)
records original image URLs and source pages. These are references, not texture assets or a licence
to redistribute the photographers' work.

- [South Crofty old workings, gallery 1](https://www.cornishmineimages.co.uk/south-crofty-mine-old-workings/):
  references 2–35. Useful comparisons include narrow drives, changes in headroom, a shaft station,
  side recesses and much taller worked spaces. The gallery includes modern industrial equipment;
  study the space without importing its technology into Hand & Fire.
- [South Crofty old workings, gallery 2](https://www.cornishmineimages.co.uk/south-crofty-mine-old-workings-2/):
  references 37–72. Study uneven shoulders, ledges, leaning profiles and local timber support.
- [B. E. Roberts' old copper mine photographs](https://www.be-roberts.com/se/stephab/ramine/ramine1.htm):
  references 110–124. Particularly useful: narrow hand-worked passage profiles, side pockets,
  clustered pick marks, tilted layers and veins continuing across faces.
- [Kentucky Transportation Center: rock slopes and rockfalls](https://kp.uky.edu/knowledge-portal/articles/rock-slopes-and-rockfalls/):
  references 75–108. Compare intact beds, joints, overhangs, block shapes and fallen material.
- [NPS Yosemite rockfalls](https://www.nps.gov/yose/learn/nature/rockfall.htm): references 126–128.
  Mountain-scale structure and a real rockfall, rather than random small bumps.

Interpretation for our art: shape must remain legible in flat ambient light. Use broad, irregular
planes first, smaller breaks second, and painted grains/tool scars third. Avoid an evenly noisy,
triangulated surface. A tunnel should look cut through an existing mountain, with the same bands
and joints continuing around corners. Mineral colour should stain the host rock, not become neon
lighting. Keep KayKit silhouettes, matte paint and the current cartoon palette.

## What breaking rock actually suggests for play

Natural rock has joints, bedding and other discontinuities; these provide potential weakness
surfaces. Their orientation and spacing affect the fragments that can detach. Different rock
families need different visual fracture habits. This is grounded in the
[US Bureau of Reclamation geological field manual](https://www.usbr.gov/tsc/techreferences/mands/geologyfieldmanual-vol1/GeolMan-v1-all.pdf)
and the [USACE rock-tunnelling manual](https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-2901.pdf).

A pick does not turn every patch of intact hard rock into an identical spherical scoop. Historical
hard-rock extraction also used hammers, borers and wedges, followed by drilling and blasting;
[the Cornish Mining World Heritage Site describes these distinctions](https://www.cornishmining.org.uk/about/mining-in-cornwall-and-west-devon/mining-processes/breaking-ore-underground).
Our accessible pickaxe loop is a deliberate game abstraction: chips at first, a readable weakened
patch after repeated hits, then a larger flake when enough of its support is removed. Blasting is
a separate prepared action, not a stronger pick swing.

Design interpretation, not a geotechnical simulation:

1. Aim at the first exposed surface; a target hidden behind rock cannot be hit.
2. Swing toward that exact contact point. The tool tip, sound and removed material agree at impact.
3. A grazing hit produces a scrape and small chips; a direct hit spends more energy into the face.
4. Repeated nearby impacts concentrate damage. Hits on an exposed lip or joint can free a larger
   wedge. Hits on intact, well-supported rock tend to produce smaller chips.
5. A new face has its own contours, broken paint and mineral continuity. It remains changed after
   leaving, saving and returning. Decorative flying chips can disappear; the excavation cannot.

No global stress solver, finite-element mountain simulation or promise of physically exact
fracture is necessary for this interpretation. Contact, timing, volume removal and local debris
motion should be precise. Bulk fracture is a controlled approximation.

### Shape language for the creator

| Scale       | Build into the shape                                                                                        | Avoid                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Mountain    | One dominant mass, uneven shoulders, consistent bedding/joint directions, a few weathered ledges            | A pile of equally sized round boulders or uniform noise            |
| Tunnel      | Leaning walls, a roughly arched but asymmetric roof, bends following seams, occasional wider worked pockets | A perfect tube with the same cross-section everywhere              |
| Worked face | Shallow scallops, intersecting peck marks, fractured lips, veins continuing into newly exposed rock         | Painted cracks that disagree with actual removable volume          |
| Fresh break | Angular flakes for jointed rock; smaller splinters/chips in intact areas; a lighter matte exposed face      | Identical cubes, glitter, glowing ore or smoke hiding every impact |

These are art interpretations of the reference collection, not dimensions or structural advice
for real excavations. Preserve a clear walking strip, readable entrances and enough camera space
even where the surrounding rock looks rough. Make surface paint carry detail before adding geometry.

## Geometry and the minimum-cost physics model

Implemented in this pass: stratified tunnel relief and asymmetric shoulders; first-exposed-face
validation; shallow, face-aligned pick cuts influenced by incidence, material and six local exposure
probes; small outward-moving chips from the actual contact; and row-sliced mesh replacement. The
static lattice is now 0.08 world units. This remains a bounded fracture approximation; arbitrary
sub-pixel cuts and vertically stacked navigation are not implemented.

Use the same sparse signed-density field for excavation, pick contact, camera obstruction and
walking. An internal sampling grid is acceptable; visible cubes, seams, repeated cells and mining
segments are not. A heightfield alone cannot represent a roof or tunnel; keep it only for the
untouched outdoor surface.

Store deterministic local edits plus the world seed. Index edits by spatial bucket. Sample only
nearby edits; never scan the entire excavation history for every footstep or chip. Rebuild only
intersecting mesh chunks. Keep a small warm area around the player; release distant meshes and
reconstruct them from saved edits on return.

A useful precedent is [Ju et al., Dual Contouring of Hermite Data](https://graphics.stanford.edu/courses/cs164-10-spring/Handouts/paper_p339-ju.pdf):
intersection positions and normals can preserve surface features in an implicit representation.
This is a reference, not a requirement to replace the current marching-tetrahedra implementation.
Keep the current mesher unless a measured problem justifies changing it.

Suggested impact model:

- Transform the contact normal into a local tangent frame. Use a shallow, irregular ellipsoidal
  indentation aligned to the face, instead of the same sphere for every strike.
- Derive a small number of joint directions and material hardness values from a stable regional
  seed. Reuse them across nearby faces; do not choose a new random geology for each triangle.
- Track a few recent damaged patches. Estimate weakness from impact energy, incidence angle,
  material strength and sampled exposure around the contact. Clamp their influence so one tap
  cannot delete a large connected volume.
- Accumulate damage only when an actual stroke lands. Select a bounded chip/flake outcome,
  subtract only the removed solid, then emit representative fragments.
- For a larger loose piece, check a handful of support samples in the edited neighbourhood.
  Do not flood-fill the mountain or run a support analysis over the whole map each frame.

For an inexpensive first implementation, use a dimensionless impact score:
`score = strokeStrength × incidence × localWeakness / hardness`, with
`incidence = clamp(-dot(swingDirection, outwardNormal), 0, 1)`.
Map the score through tuned chip/flake thresholds; it is a game control, not a calibrated physical
energy law. Fix the random seed at the impact so host and clients agree. A glancing blow may leave
a scrape and tiny chips without granting a full extraction reward. Reward the newly removed solid
once, rather than awarding a fixed pile for every click on an already empty patch.

Keep the contact query, damage patch, removed volume and visual fragment origin in the same local
coordinate frame. Commit the cut at the animation's contact moment. Never accept an off-screen
or wall-occluded target merely because its world coordinates are close to the player.

Precision must be calibrated against the hero, not variable names. The current hero is roughly
0.48 world units tall; even a 0.08-world-unit mesh sample is coarse relative to a person.
A precise screen-space ray is not the same as a pixel-sized physical cut. Before shrinking the
brush, add local refinement with verified joins, or an equally accurate local patch method. Target
small marks visible at normal play distance; do not advertise unlimited sub-pixel geometry.

For height: the cursor must move over the actual 3D wall and ceiling, show valid tool reach, and
orient the strike toward the contact. Upward blows use an upward pose. A high contact beyond reach
shows that clearly. Let the player cut a shallow step/ramp or use a placed charge; do not silently
hit a horizontal point at chest height. Walkable slopes must follow the excavation field, while
roof clearance prevents walking into a space the character cannot fit in.

For loose chips, use a fixed pool with gravity, angular motion, restitution and friction. Use a
sphere or simple convex approximation for contacts against the density field. Stop/sleep fragments
once motion is negligible, and fade or merge cosmetic debris after a short lifetime. Do not spawn
a physics body for every terrain triangle. Persistent salvage can be represented by a few item
piles rather than hundreds of collision bodies. These choices follow the general emphasis on
bounded object counts, simple collision and measured workloads in
[NVIDIA's PhysX best practices](https://nvidia-omniverse.github.io/PhysX/physx/5.1.1/docs/BestPractices.html).
They do not require adding PhysX to this project.

The existing 128-chip pool is a sensible starting cap. Keep one cartoon preset and automatic
resolution handling. Time-slice or move expensive mesh work off the main thread if profiling shows
hitches: checking a budget only between large chunks does not guarantee a maximum frame cost.
Do not increase workers, mesh resolution or solver iterations without measuring.

Suggested starting work limits, to be adjusted by profiling rather than treated as proven budgets:

- One accepted impact per completed tool stroke; no terrain simulation during idle frames.
- At most 8–16 local exposure/support samples for a larger flake decision, independent of map size.
- At most 8 representative fragments per ordinary impact, sharing the existing 128-chip pool.
- Coalesce dirty chunk requests and prioritise the visible contact area. Do not rebuild the entire
  tunnel when one small patch changes. A large blast must also be split into bounded work units.
- Aim for excavation and debris together to consume under 2 ms of a 16.7 ms frame on the target
  laptop; record the 95th/99th percentile and worst strike, not just an average. This is an initial
  engineering target, not a measured result or a guarantee of 60 fps.

The current movement model selects a floor using horizontal position. It does not yet support
arbitrary vertically overlapping passages. Keep the three starter routes separated in plan view;
genuine stacked tunnels require volumetric character collision and navigation before promising
an unlimited downward or upward digging experience.

## Mine layout and arrival

Arrival is a short boarding and descent sequence, with the location change hidden by the travel
fade. Place the cage in a recessed shaft bay, behind a rock shoulder, off the central sightline.
Stepping into the hub should reveal three tunnel mouths, not four cage posts in front of the camera.
The cage remains a physical return landmark; it should not vanish because a distance threshold was
crossed. No see-through character silhouettes or wall cutouts.

Three compact, pre-cut workings begin at the hub. Each has bends, a short branch and a different
sloping depth. Keep passable floors and uneven shoulders; vary local headroom without trapping the
camera. Show a few old pecked faces and timber remnants so the workings read as previously mined.
Do not fill them with rails, large industrial furniture or loose harvestable stone nodes.

Each route has an occupied pocket before a worked face, then a deeper pocket. Creatures cannot see
or strike through solid rock. They should not all converge on the arrival bay. The useful rhythm
is approach → clear the pocket → inspect a seam → extract → choose whether to push deeper. Cleared
starter pockets stay cleared. The first tower must not require completing all three routes.

## Starter blasting, described as game controls only

Offer a short, optional explanation at the arrival preparation point. The functional steps remain
available when guidance is skipped: inspect the fictional fuse indicator, prepare the game item,
choose an exposed face, place it, and retreat beyond the marked game radius. Use abstract item
requirements and clear controls; this is not a real explosives preparation procedure.

The first variant is a small training charge with a modest excavation volume. Item use and
placement must be validated by the host. A lit charge gets one fuse, one explosion and one inventory
cost. It removes continuous rock, damages nearby enemies, and can hurt a player who stays too close.
A miss or cancelled aiming mode does not spend a charge. The shop continues to sell durable utilities
only; starter supplies and later workshop preparation provide these consumable game items.

Skill progression should improve controlled excavation gradually, not turn the starter charge into
a room-clearing weapon. Keep materials and cleared rock saved, and explain the next useful action
at the preparation point. Avoid an extended research minigame in the first tower loop.

## Verification required before calling the first loop polished

- Fresh start and returning-player start both reach a deployed first tower without debug tools.
- Standing near a door does not switch rooms. Entry/exit and both lift directions have no visible
  coordinate jump, held-key double transition or stuck character; saving mid-journey resumes safely.
- All three routes and branches are traversable; depths differ, and the camera stays out of rock.
- Impact point, animation, sound, removed solid and rewarded mineral agree. Test upward hits,
  glancing faces, repeated hits, tunnel joins and an invalid target through a wall.
- The training charge consumes once, cancels freely before placement, cuts the visible rock,
  respects its fuse, damages by actual 3D proximity, and persists after save/load.
- A camp behind a wall cannot engage; clearing one pocket does not wake every route.
- Workshop materials are consumed once, stored towers cannot be duplicated, reserved deployment
  positions cannot overlap, and one shipment creates exactly one functioning tower.
- Profile release builds on an actual modest integrated-graphics laptop. Record mesh-update tails,
  input latency, steady frame time, active fragments, memory growth and a long digging session.
  A desktop screenshot and an operating-system support claim are not a laptop benchmark.
