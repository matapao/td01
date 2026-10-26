/**
 * The Road of Invention (docs/TECH_LINEAGE.md, docs/ROADMAP.md): humanity's road retold in summary,
 * age by age, from the hearth to bases in Space. Each milestone is invented once by doing its
 * minigame at its workshop: it teaches one principle (kept in the Field Notes), tells how humanity
 * did it (the Chronicle), and opens plans to study. The vale's age is the furthest age it has
 * reached in earnest.
 *
 * Plain data, shared by the simulation (what can be invented where, what it opens) and the UI (the
 * Road window, the Field Notes, the minigames — their set-ups live in ui/minigames/milestones.ts).
 */
import type { BuildingKind, Parts, PlanId } from './content-types.ts';

/** The twelve kinds of minigame (TECH_LINEAGE §4). */
export type MinigameKind =
  | 'band' // Hold the band: keep a value in a zone (heat, pressure, a boat's load)
  | 'ratio' // Mix the ratio: get the proportions right (bronze, steel, cement)
  | 'sizes' // Pick the sizes: choose parts to hit a target (gears, cells, stages)
  | 'path' // Lay the path: connect things (wires, rails, pipes, networks)
  | 'beat' // Keep the beat: act in rhythm (hammer, winding, Morse)
  | 'steady' // Steady hand: trace precisely (welding, the lathe)
  | 'separate' // Separate: sort or purify (panning, sieving, zone refining)
  | 'order' // Build in order: assemble in sequence (arches, engines, the payload stack)
  | 'decide' // Decide: set up logic or a program (relays, punched cards)
  | 'sweet' // Find the sweet spot: tune (radio, pendulums, the parachute's moment)
  | 'observe' // Test & observe: experiment, then conclude (what conducts, how far an echo)
  | 'encode'; // Encode: turn meaning into a pattern (signal codes, binary)

export type AgeId =
  'fire' | 'metal' | 'machine' | 'steam' | 'electric' | 'signal' | 'electronic' | 'automated' | 'space';
export type BranchId =
  'energy' | 'materials' | 'making' | 'moving' | 'messages' | 'thinking' | 'automation' | 'space';

export const AGES: { id: AgeId; name: string; blurb: string }[] = [
  { id: 'fire', name: 'Hand & Fire', blurb: 'Wood, stone and fire: the vale as it starts.' },
  { id: 'metal', name: 'Metal', blurb: 'Hotter fires free metal from rock; alloys make it strong.' },
  { id: 'machine', name: 'Machine', blurb: 'Water, wind and gears do the heavy work.' },
  { id: 'steam', name: 'Steam', blurb: 'Fire turned into push: pumps, winches, rails.' },
  { id: 'electric', name: 'Electric', blurb: 'Motion becomes current; wires carry it to every tower.' },
  { id: 'signal', name: 'Signal', blurb: 'Messages along wires and through the air.' },
  { id: 'electronic', name: 'Electronic', blurb: 'Switches too small to see, by the million.' },
  { id: 'automated', name: 'Automated', blurb: 'Machines that watch, decide and work by themselves.' },
  {
    id: 'space',
    name: 'Space',
    blurb: 'Rockets, landers and a base far away — the minerals Earth lacks, shipped home.',
  },
];

export const BRANCHES: Record<BranchId, string> = {
  energy: 'Energy',
  materials: 'Materials',
  making: 'Making',
  moving: 'Moving',
  messages: 'Messages',
  thinking: 'Thinking machines',
  automation: 'Automation',
  space: 'Space',
};

export interface Milestone {
  id: string;
  name: string;
  age: AgeId;
  branch: BranchId;
  /** The one idea it teaches, in a line. */
  principle: string;
  /** Field Notes: why it works, and where it's used for real. */
  why: string;
  real: string;
  /** The Chronicle: how humanity did it. */
  chronicle: string;
  /** Its minigame (the set-up is in ui/minigames/milestones.ts). */
  kind: MinigameKind;
  /** Milestones that must come first. */
  needs: string[];
  /** Where it is invented: at (or inside) a building of this kind — or by the keep. */
  at: BuildingKind | 'keep';
  /** What the try uses up when it works. */
  cost: Parts;
  /** Plans it opens (added to the library to study). */
  unlocks: PlanId[];
}

const m = (o: Milestone): Milestone => o;

/**
 * Every milestone, age by age. `at` names the workshop; a milestone whose workshop doesn't exist yet
 * shows on the Road, closed, until its plan is opened by an earlier one.
 */
export const MILESTONES = {
  // ---- Metal -----------------------------------------------------------------------------------
  bronze: m({
    id: 'bronze',
    name: 'Bronze',
    age: 'metal',
    branch: 'materials',
    kind: 'ratio',
    principle: 'Two metals mixed are harder than either alone.',
    why: 'Tin atoms sit among the copper and stop its layers sliding — too many and it turns brittle.',
    real: 'Bells, ship fittings, statues and bearings are still cast in bronze.',
    chronicle: 'Smiths found that copper with a tenth part of tin cast harder blades — the Bronze Age.',
    needs: [],
    at: 'forge',
    cost: { ingot: 1, copper: 2 },
    unlocks: [],
  }),
  steel: m({
    id: 'steel',
    name: 'Steel',
    age: 'metal',
    branch: 'materials',
    kind: 'ratio',
    principle: 'A little carbon makes iron strong; too much makes it brittle.',
    why: 'A pinch of carbon locks the iron crystals; past about one part in a hundred they crack instead of bend.',
    real: 'Bridges, springs, tools and car frames are steel.',
    chronicle: 'Blacksmiths learned to fold charcoal into hot iron long before anyone knew it was carbon.',
    needs: ['bronze'],
    at: 'anvil',
    cost: { ingot: 2, coal: 1 },
    unlocks: [],
  }),
  glass: m({
    id: 'glass',
    name: 'Glass',
    age: 'metal',
    branch: 'materials',
    kind: 'band',
    principle: 'Sand melts into glass; cool it slowly or it cracks.',
    why: 'Glass shrinks as it cools; cooled unevenly, the outside sets first and the strain splits it.',
    real: 'Windows, lenses, bottles and the screens of phones are annealed glass.',
    chronicle: 'Glassmakers learned to cool their work slowly in a second oven — the annealing lehr.',
    needs: ['bronze'],
    at: 'forge',
    cost: { quartz: 2, coal: 1 },
    unlocks: [],
  }),
  // ---- Machine ---------------------------------------------------------------------------------
  gears: m({
    id: 'gears',
    name: 'Gear trains',
    age: 'machine',
    branch: 'making',
    kind: 'sizes',
    principle: 'A big wheel driving a small one turns it faster, with less force.',
    why: 'Teeth pass one for one, so the small wheel must turn more times to keep up — speed traded for force.',
    real: 'Bicycles, clocks, car gearboxes and wind turbines all trade speed for force with gears.',
    chronicle: 'Millwrights geared water wheels up to spin millstones fast enough to grind.',
    needs: ['steel'],
    at: 'anvil',
    cost: { gears: 2, planks: 2 },
    unlocks: [],
  }),
  arch: m({
    id: 'arch',
    name: 'The arch',
    age: 'machine',
    branch: 'moving',
    kind: 'order',
    principle: 'An arch turns weight into a push along its stones; the keystone locks it.',
    why: 'Each wedge-shaped stone pushes on its neighbours instead of bending, so stone — strong in squeeze, weak in pull — can span a gap.',
    real: 'Bridges, aqueducts, doorways and cathedral vaults stand on arches.',
    chronicle: 'Builders raised arches over wooden centring and took it away only once the keystone was in.',
    needs: ['gears'],
    at: 'stonecutter',
    cost: { blocks: 4 },
    unlocks: [],
  }),
  // ---- Steam -----------------------------------------------------------------------------------
  steam: m({
    id: 'steam',
    name: 'Steam power',
    age: 'steam',
    branch: 'energy',
    kind: 'band',
    principle:
      'Water turned to steam takes over a thousand times the room and pushes a piston — hold the pressure or it blows.',
    why: 'Boiling water expands into steam; trapped, it presses on everything — a piston moves, a weak boiler bursts.',
    real: 'Most electricity is still made by steam spinning turbines, in coal, gas and nuclear plants.',
    chronicle: 'The first steam engines pumped water out of mines.',
    needs: ['gears'],
    at: 'forge',
    cost: { ingot: 3, coal: 3 },
    unlocks: [],
  }),
  rails: m({
    id: 'rails',
    name: 'Rails',
    age: 'steam',
    branch: 'moving',
    kind: 'path',
    principle: 'Iron rails let wheels roll with almost no friction.',
    why: 'A hard wheel on a hard rail barely squashes either, so little of the push is lost — one horse pulls ten times the load.',
    real: 'Railways still carry most of the heavy freight on land.',
    chronicle: 'Mine wagons ran on wooden, then iron, rails long before the locomotive.',
    needs: ['steam'],
    at: 'anvil',
    cost: { ingot: 3, planks: 2 },
    unlocks: [],
  }),
  // ---- Electric --------------------------------------------------------------------------------
  grid: m({
    id: 'grid',
    name: 'The grid',
    age: 'electric',
    branch: 'energy',
    kind: 'path',
    principle: 'Voltage is the push, current the flow, resistance the narrowness of the way.',
    why: 'Like water in pipes: more push, more flow; a long thin wire squeezes the flow and turns push into heat.',
    real: "Every building's wiring is split side by side, behind fuses, from a meter fed by the grid.",
    chronicle:
      'The first power stations lit streets near the plant; the war of the currents decided how to reach further.',
    needs: ['steam'],
    at: 'hydro',
    cost: { copper: 3, ingot: 1 },
    unlocks: [],
  }),
  battery: m({
    id: 'battery',
    name: 'Batteries',
    age: 'electric',
    branch: 'energy',
    kind: 'sizes',
    principle: 'Cells in a chain add push; side by side they add staying power.',
    why: 'Each cell pushes the same; stacked, the pushes add; side by side, they share the flow and last longer.',
    real: 'A torch battery, a phone and an electric car are all cells in chains and banks.',
    chronicle: 'A pile of copper and zinc discs in salt water gave the first steady current.',
    needs: ['grid'],
    at: 'arcanist',
    cost: { copper: 2, silver: 1 },
    unlocks: [],
  }),
  searchlight: m({
    id: 'searchlight',
    name: 'The searchlight',
    age: 'electric',
    branch: 'energy',
    kind: 'sweet',
    principle: "A curved mirror throws a lamp's light into a beam — the lamp must sit at its focus.",
    why: 'A parabolic mirror bends every ray from its focus into one direction; off focus, the beam spreads and dims.',
    real: 'Lighthouses, car headlights and stage spots focus light with mirrors and lenses.',
    chronicle: 'Arc lamps behind mirrors swept harbours and battlefields at night.',
    needs: ['grid', 'glass'],
    at: 'arcanist',
    cost: { copper: 1, quartz: 1 },
    unlocks: ['searchlight'],
  }),
  // ---- Signal ----------------------------------------------------------------------------------
  telegraph: m({
    id: 'telegraph',
    name: 'The telegraph',
    age: 'signal',
    branch: 'messages',
    kind: 'encode',
    principle: 'On/off pulses on a wire carry a message instantly.',
    why: 'Current reaches the far end almost at once; an agreed code of short and long pulses carries the letters.',
    real: 'The same idea — patterns of on and off — carries everything on the internet.',
    chronicle: 'Wires along the railways carried news faster than any rider for the first time.',
    needs: ['grid'],
    at: 'arcanist',
    cost: { copper: 3 },
    unlocks: [],
  }),
  relay: m({
    id: 'relay',
    name: 'Relay logic',
    age: 'signal',
    branch: 'thinking',
    kind: 'decide',
    principle: 'Switches in a chain mean AND, side by side OR; a relay that opens means NOT.',
    why: 'A chain only passes current if every switch is shut; side by side, any one will do — and that is all logic needs.',
    real: 'Every computer is built from switches like these, made tiny.',
    chronicle:
      'Relays, made to repeat weak telegraph signals, ran the first automatic telephone exchanges and computers.',
    needs: ['telegraph'],
    at: 'arcanist',
    cost: { copper: 2, ingot: 1 },
    unlocks: ['relay'],
  }),
  radio: m({
    id: 'radio',
    name: 'Radio',
    age: 'signal',
    branch: 'messages',
    kind: 'sweet',
    principle: 'Waves need no wire; tuning picks one station out of many.',
    why: 'A tuned circuit rings only at its own rate, so it answers one wave and ignores the rest.',
    real: 'Phones, Wi-Fi, GPS and the rovers in Space talk by radio.',
    chronicle: 'The first wireless messages crossed an ocean as dots and dashes.',
    needs: ['telegraph'],
    at: 'arcanist',
    cost: { copper: 2, quartz: 1 },
    unlocks: [],
  }),
  radar: m({
    id: 'radar',
    name: 'Radar',
    age: 'signal',
    branch: 'messages',
    kind: 'observe',
    principle: 'A pulse comes back from what it hits; the delay tells how far.',
    why: 'Radio waves travel at a known speed, so half the time to the echo times that speed is the distance.',
    real: 'Airports, ships, weather stations and landers use radar to see what eyes cannot.',
    chronicle: 'Coastal radar chains saw raids coming long before they arrived.',
    needs: ['radio'],
    at: 'arcanist',
    cost: { copper: 3, gears: 1 },
    unlocks: ['radar'],
  }),
  // ---- Electronic ------------------------------------------------------------------------------
  silicon: m({
    id: 'silicon',
    name: 'Pure silicon',
    age: 'electronic',
    branch: 'materials',
    kind: 'separate',
    principle: 'Sand purified into one perfect crystal can switch current.',
    why: 'Impurities prefer to stay in the melt, so a molten zone swept along a rod again and again carries them to one end.',
    real: 'Every chip and solar cell starts as a crystal of silicon purer than anything else people make.',
    chronicle: 'Zone refining made the first pure crystals for transistors.',
    needs: ['relay', 'glass'],
    at: 'forge',
    cost: { quartz: 3, coal: 2 },
    unlocks: [],
  }),
  solar: m({
    id: 'solar',
    name: 'Solar power',
    age: 'electronic',
    branch: 'energy',
    kind: 'sweet',
    principle: 'Light knocks charges loose in silicon; face the sun for the most.',
    why: 'Each bit of light that hits the cell can free a charge; a panel square to the sun catches the most light.',
    real: 'Solar panels power homes, satellites and rovers far from any wire.',
    chronicle: 'The first practical solar cells powered satellites before they powered houses.',
    needs: ['silicon'],
    at: 'arcanist',
    cost: { quartz: 2, copper: 2 },
    unlocks: ['solar'],
  }),
  computer: m({
    id: 'computer',
    name: 'The computer',
    age: 'electronic',
    branch: 'thinking',
    kind: 'decide',
    principle: 'A machine can follow a program: steps, decisions and loops.',
    why: 'Millions of switches remember numbers and act on instructions one after another, very fast.',
    real: 'Everything from a washing machine to a rover runs a program.',
    chronicle: 'Machines that filled rooms shrank to chips that fit on a fingertip.',
    needs: ['silicon', 'relay'],
    at: 'arcanist',
    cost: { nugget: 1, copper: 2, quartz: 1 },
    unlocks: ['targeter'],
  }),
  // ---- Automated -------------------------------------------------------------------------------
  feedback: m({
    id: 'feedback',
    name: 'Feedback control',
    age: 'automated',
    branch: 'automation',
    kind: 'band',
    principle: 'Measure, compare, correct — and a machine holds things steady by itself.',
    why: 'A thermostat feels the heat, compares it with what you want and opens or shuts the fuel — over and over.',
    real: 'Thermostats, cruise control and autopilots all measure, compare and correct.',
    chronicle: 'A spinning governor held steam engines at a steady speed by itself.',
    needs: ['computer'],
    at: 'forge',
    cost: { gears: 2, copper: 2 },
    unlocks: [],
  }),
  robots: m({
    id: 'robots',
    name: 'Robots',
    age: 'automated',
    branch: 'automation',
    kind: 'order',
    principle: 'Senses, a brain and muscles together make a machine that works on its own.',
    why: 'Sensors tell the program what is there; the program decides; motors act — and the loop repeats.',
    real: 'Factory arms, warehouse carts and planetary rovers are robots.',
    chronicle: 'The first factory arms welded cars; their grandchildren drive across other worlds.',
    needs: ['feedback'],
    at: 'anvil',
    cost: { gears: 3, nugget: 1 },
    unlocks: [],
  }),
  // ---- Space -----------------------------------------------------------------------------------
  rocketry: m({
    id: 'rocketry',
    name: 'Rocketry',
    age: 'space',
    branch: 'space',
    kind: 'sizes',
    principle: 'A rocket pushes gas out one way and goes the other; stages drop their empty tanks.',
    why: 'More fuel is more weight to lift, so each stage burns out and falls away, leaving less to push.',
    real: 'Every launcher stacks stages, and the last one is a small fraction of what left the pad.',
    chronicle: 'Rockets grew from fireworks to stacks taller than towers.',
    needs: ['robots', 'solar', 'radio'],
    at: 'forge',
    cost: { ingot: 4, sulfur: 2, coal: 2 },
    unlocks: ['port'],
  }),
  payload: m({
    id: 'payload',
    name: 'The payload stack',
    age: 'space',
    branch: 'space',
    kind: 'order',
    principle:
      'Everything that lands is carried the whole way: each part does one job and drops off when it is done.',
    why: 'A cruise stage for the long trip, then a descent stage with its own engine and legs — out there no air will slow it, so only its engine can — and the payload on top, all under the fairing.',
    real: "Landers for airless worlds are stacked just so: payload on the descent stage, the cruise stage under it, inside the rocket's fairing.",
    chronicle:
      'The first landers on airless worlds came down on their own engines, legs out, blowing up dust that flew straight and far with no air to stop it.',
    needs: ['rocketry'],
    at: 'port',
    cost: { ingot: 3, gears: 2, quartz: 1 },
    unlocks: ['lander', 'solarfarm'],
  }),
  entry: m({
    id: 'entry',
    name: 'Landing on rockets',
    age: 'space',
    branch: 'space',
    kind: 'band',
    principle:
      'With no air to slow it, only the engine can: brake so it sinks slower and slower, and touch down softly.',
    why: 'Sink too fast and it crashes; brake too hard too early and the fuel runs out in the air. Keep the sinking speed in the safe band all the way down.',
    real: 'Landers on airless worlds come down so: a long braking burn, a hover just above the ground, a gentle drop onto their legs.',
    chronicle: 'The first landings on an airless world were flown by hand, with seconds of fuel to spare.',
    needs: ['payload'],
    at: 'port',
    cost: {},
    unlocks: ['habitat', 'crew'],
  }),
  rover: m({
    id: 'rover',
    name: 'The rover',
    age: 'space',
    branch: 'space',
    kind: 'path',
    principle: 'A robot that drives itself between your commands, round the rocks.',
    why: 'Commands take minutes to arrive, so the rover plans its own way round what its cameras see.',
    real: 'Rovers drive across another world for years, a few metres between commands.',
    chronicle: 'Each new rover drove further on its own than the last.',
    needs: ['entry', 'computer'],
    at: 'port',
    cost: {},
    unlocks: ['rover', 'drill'],
  }),
  isru: m({
    id: 'isru',
    name: 'Oxygen from ice',
    age: 'space',
    branch: 'space',
    kind: 'band',
    principle:
      'Electricity splits water into hydrogen and oxygen — air to breathe, and fuel to burn on the way home.',
    why: 'Melt the ice and pass a current through the water: oxygen bubbles off one plate, twice as much hydrogen off the other.',
    real: 'Plans for bases on airless worlds start with the ice in their shadowed craters: water, air and rocket fuel in one.',
    chronicle:
      'The ice in craters the sun never reaches was found by probes that crashed into them on purpose and watched what flew up.',
    needs: ['rover'],
    at: 'port',
    cost: {},
    unlocks: ['oxygen'],
  }),
  homeward: m({
    id: 'homeward',
    name: 'Minerals home',
    age: 'space',
    branch: 'space',
    kind: 'order',
    principle: 'Leaving a small world takes little fuel; coming home, the air does the braking.',
    why: 'A small rocket lifts the cargo off, a ship carries it home, and a capsule burns into the home air behind its heat shield, then lands under a parachute.',
    real: 'Sample-return missions bring rock home this way — ascent rocket, return ship, entry capsule.',
    chronicle: 'Grains of other worlds have come home in capsules no bigger than a table.',
    needs: ['isru'],
    at: 'port',
    cost: {},
    unlocks: ['ascent', 'dynamo'],
  }),
} satisfies Record<string, Milestone>;

export type MilestoneId = keyof typeof MILESTONES;
export const MILESTONE_ORDER = Object.keys(MILESTONES) as MilestoneId[];

/** The team's road: what has been invented (and how well). */
export interface RoadState {
  done: MilestoneId[];
  /** The best result per milestone (1 good, 2 perfect). */
  best: Partial<Record<MilestoneId, number>>;
}

/** Can `id` be tried now (its needs met, not yet done)? Why not, if not. */
export function roadBlocker(road: RoadState, id: MilestoneId): string | null {
  const ms = MILESTONES[id];
  if (road.done.includes(id)) return 'Already invented';
  const missing = ms.needs.filter((n) => !road.done.includes(n as MilestoneId));
  if (missing.length) return `First: ${missing.map((n) => MILESTONES[n as MilestoneId].name).join(', ')}`;
  return null;
}

/**
 * The vale's age: the furthest age whose milestones are at least half invented (every age before it
 * counts too) — one lucky leap doesn't make an age.
 */
export function valeAge(road: RoadState): AgeId {
  let age: AgeId = 'fire';
  for (const a of AGES) {
    if (a.id === 'fire') continue;
    const all = MILESTONE_ORDER.filter((k) => MILESTONES[k].age === a.id);
    const got = all.filter((k) => road.done.includes(k)).length;
    if (all.length && got * 2 >= all.length) age = a.id;
    else break;
  }
  return age;
}
