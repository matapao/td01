export { spaceOf, hasModule, payloadBlocker, spaceWalkable } from './space-state.ts';
export { payloadStacked } from './space-payload.ts';
import { spaceOf, hasModule, payloadBlocker } from './space-state.ts';
/**
 * The way to Space and back (see space.ts). At the Port a payload is stacked on its rocket — a plan
 * placed on the pad, its parts brought, then assembled — and launched while the window is open. A
 * flight climbs, cruises, then with no air out there to slow it, brakes on its rockets and comes
 * down on its legs in a powered descent; what lands becomes part of the base. The base works: the
 * rover brings in nickel-iron and ice, the drill rare earths, into the depot. With an ascent vehicle
 * fuelled from the ice, the depot goes home: the capsule burns into the vale's air behind its heat
 * shield and lands under a parachute by the keep. A hero can ride a crew capsule out (once a habitat
 * stands) and the ascent vehicle home.
 */
import type { Sim } from '../sim.ts';
import { PLANS, sizeOf, type ItemId, type Parts } from '../content.ts';
import {
  BASE_WORK,
  FLIGHT,
  HOMECOMING,
  PAYLOADS,
  SPACE,
  SPACE_NODES,
  inSpace,
  launchWindow,
  slotOf,
  type PayloadId,
} from '../space.ts';
import { MAP } from '../map.ts';
import type { Command, Flight, FlightPhase, Hero, SpaceState } from '../types.ts';
import { dist } from '../../core/math.ts';
import { forceCompleteSite } from './crafting/site-completion.ts';

/**
 * Where in its flight a flight is `t` s after launch: the climb, the cruise, then the way down — out
 * there a braking burn and a powered descent; home, entry and the parachute.
 */
export function flightPhaseAt(t: number, home: boolean): FlightPhase {
  if (t < FLIGHT.ascent) return 'ascent';
  if (t < FLIGHT.ascent + FLIGHT.cruise) return 'cruise';
  const e = (t - FLIGHT.ascent - FLIGHT.cruise) / FLIGHT.edl;
  if (e >= 0.95) return 'touchdown';
  if (home) return e < 0.4 ? 'entry' : 'parachute';
  return e < 0.45 ? 'braking' : 'descent';
}

export const flightTime = FLIGHT.ascent + FLIGHT.cruise + FLIGHT.edl;

/** Where cargo and crews come down at home. */
export const homecoming = (): { x: number; z: number } => ({
  x: MAP.keep.x + HOMECOMING.dx,
  z: MAP.keep.z + HOMECOMING.dz,
});

/** The Space deposits (added once, at the start). */
export function addSpaceNodes(sim: Sim): void {
  for (const n of SPACE_NODES)
    sim.add('node', {
      id: sim.newId(),
      kind: n.kind,
      x: n.x,
      z: n.z,
      radius: 0.7,
      amount: n.amount,
      max: n.amount,
      regrowT: 0,
      prop: -1,
    });
}

function launchFlight(
  sim: Sim,
  payload: PayloadId,
  home: boolean,
  crew: Hero | undefined,
  cargo: Parts,
  x: number,
  z: number,
): Flight {
  const f: Flight = { id: sim.newId(), payload, home, t: 0, phase: 'ascent', crew: crew?.id ?? 0, cargo };
  spaceOf(sim).flights.push(f);
  if (crew) {
    crew.flight = f.id;
    crew.task = { k: 'idle' };
    crew.path = [];
    crew.pathGoal = null;
  }
  sim.emit('launched', { flight: f.id, payload, x, z, home });
  return f;
}

export function applySpaceCommand(sim: Sim, cmd: Command): boolean {
  switch (cmd.t) {
    case 'stackPayload': {
      const h = sim.getAs(cmd.hero, 'hero');
      const b = sim.getAs(cmd.building, 'building');
      const plan = PLANS[cmd.payload];
      if (!h || !b || b.kind !== 'port' || !plan || plan.type !== 'payload') return true;
      const deny = (reason: string) => sim.emit('denied', { hero: h.id, reason, x: b.x, z: b.z });
      if (!sim.knows(h, cmd.payload)) return (deny(`Learn the ${plan.name} plan first`), true);
      if (b.site || b.ready) return (deny('The pad is taken: launch (or cancel) what is on it first'), true);
      const why = payloadBlocker(sim, cmd.payload);
      if (why) return (deny(why), true);
      const site = {
        id: sim.newId(),
        plan: cmd.payload,
        x: b.x,
        z: b.z,
        cx: b.cx,
        cz: b.cz,
        rot: b.rot,
        need: { ...plan.parts },
        have: {},
        step: 0,
        work: 0,
        building: b.id,
        placedBy: h.id,
        sockets: [],
      };
      sim.add('site', site);
      b.site = site.id;
      sim.emit('sitePlaced', { site: site.id, plan: cmd.payload, x: site.x, z: site.z });
      if (sim.state.dev) forceCompleteSite(sim, site);
      return true;
    }
    case 'launch': {
      const h = sim.getAs(cmd.hero, 'hero');
      const b = sim.getAs(cmd.building, 'building');
      if (!h || !b || b.kind !== 'port') return true;
      const deny = (reason: string) => sim.emit('denied', { hero: h.id, reason, x: b.x, z: b.z });
      if (!b.ready) return (deny('Nothing on the pad: stack a payload first'), true);
      const w = launchWindow(sim.state.time);
      if (!w.open && !sim.state.dev)
        return (deny(`The window is shut: it opens in ${Math.ceil(w.opensIn)} s`), true);
      const board = cmd.board && b.ready === 'crew';
      if (board && dist(h.x, h.z, b.x, b.z) > sizeOf('port') / 2 + 2.5)
        return (deny('Walk to the pad to board'), true);
      launchFlight(sim, b.ready, false, board ? h : undefined, {}, b.x, b.z);
      b.ready = undefined;
      return true;
    }
    case 'launchHome': {
      const h = sim.getAs(cmd.hero, 'hero');
      if (!h) return true;
      const deny = (reason: string) => sim.emit('denied', { hero: h.id, reason });
      const s = spaceOf(sim);
      const ascent = s.modules.find((m) => m.kind === 'ascent');
      if (!ascent) return (deny('There is no ascent vehicle at the base'), true);
      if (!hasModule(sim, 'oxygen'))
        return (deny('The ascent vehicle has no fuel: land the oxygen plant first'), true);
      const board =
        cmd.board && inSpace(h.z) && dist(h.x, h.z, ascent.x, ascent.z) < PAYLOADS.ascent.half + 2.5;
      const cargo = { ...s.depot };
      const total = Object.values(cargo).reduce((n, v) => n + (v ?? 0), 0);
      if (!total && !board) return (deny('The depot is empty'), true);
      // The ascent vehicle goes up; another is stacked from what the base makes (it stays a module).
      s.depot = {};
      launchFlight(sim, 'ascent', true, board ? h : undefined, cargo, ascent.x, ascent.z);
      return true;
    }
    default:
      return false;
  }
}

export function updateSpace(sim: Sim, dt: number): void {
  const s = sim.state.space;
  if (!s) return;
  for (const f of s.flights) {
    f.t += dt;
    const phase = flightPhaseAt(f.t, f.home);
    if (phase !== f.phase) {
      f.phase = phase;
      sim.emit('flightPhase', { flight: f.id, payload: f.payload, phase, home: f.home });
    }
    const crew = f.crew ? sim.getAs(f.crew, 'hero') : undefined;
    if (crew) {
      // Carried along: where the flight is going.
      const to = f.home ? homecoming() : slotOf(f.payload === 'crew' ? 'habitat' : f.payload);
      crew.x = crew.px = to.x + (f.home ? 1.5 : 0);
      crew.z = crew.pz = to.z + (f.home ? 0 : PAYLOADS.habitat.half + 1.2);
    }
    if (f.t < flightTime) continue;
    land(sim, s, f);
  }
  s.flights = s.flights.filter((f) => f.t < flightTime);
  // The base at work: the rover and the drill bring minerals into the depot.
  const work = (key: string, every: number, item: ItemId, needs: PayloadId) => {
    if (!s.modules.some((m) => m.kind === needs)) return;
    const t = (s.workT[key] ?? 0) + dt;
    if (t >= every) {
      s.workT[key] = t - every;
      s.depot[item] = (s.depot[item] ?? 0) + 1;
    } else s.workT[key] = t;
  };
  if (s.modules.some((m) => m.kind === 'solarfarm')) {
    work('rover', BASE_WORK.rover.every, BASE_WORK.rover.item, 'rover');
    work('roverIce', BASE_WORK.roverIce.every, BASE_WORK.roverIce.item, 'rover');
    work('drill', BASE_WORK.drill.every, BASE_WORK.drill.item, 'drill');
  }
}

function land(sim: Sim, s: SpaceState, f: Flight): void {
  const crew = f.crew ? sim.getAs(f.crew, 'hero') : undefined;
  if (f.home) {
    // A capsule by the keep: its minerals spill out where it came down; the crew climbs out.
    const at = homecoming();
    for (const k in f.cargo)
      for (let i = 0; i < (f.cargo[k as ItemId] ?? 0); i++) sim.spawnDrop(k as ItemId, at.x, at.z);
    if (crew) {
      crew.flight = undefined;
      crew.x = crew.px = at.x + 1.5;
      crew.z = crew.pz = at.z;
    }
    sim.emit('landed', {
      flight: f.id,
      payload: f.payload,
      x: at.x,
      z: at.z,
      crew: f.crew,
      home: true,
      cargo: f.cargo,
    });
    return;
  }
  const at = slotOf(f.payload);
  if (f.payload !== 'crew' || !s.modules.some((m) => m.kind === 'crew')) {
    s.modules.push({ id: sim.newId(), kind: f.payload, x: at.x, z: at.z, landedAt: sim.state.time });
  }
  if (crew) {
    crew.flight = undefined;
    const hab = slotOf('habitat');
    crew.x = crew.px = hab.x;
    crew.z = crew.pz = hab.z + PAYLOADS.habitat.half + 1.2;
    crew.facing = crew.look = Math.PI;
  }
  sim.emit('landed', {
    flight: f.id,
    payload: f.payload,
    x: at.x,
    z: at.z,
    crew: f.crew,
    home: false,
    cargo: {},
  });
}

/** The base's middle (where the first lander stands), for the views and tests. */
export const BASE = { x: SPACE.x, z: SPACE.z };
