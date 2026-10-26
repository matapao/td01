import { laneAt } from '../map.ts';
/**
 * The wall and its gate. The dead's roads end at the gate, and it stands shut: the walkers stop at its
 * doors and batter them — its strength is the bar over the gateway, its doors splinter as it goes —
 * under the towers' fire; when it breaks they pour through (lives lost). Fliers go over the wall and
 * diggers under it whatever the gate does. Heroes mend it from inside (F at its winch, or up on the
 * wall beside it) like any building: wood, stone, planks or blocks and a hammer — once a broken gate
 * is mended a third of the way, its winch swings it shut again. The passage opens automatically for repair trips between cleared waves.
 * It closes before the next attack, with the repair party recalled to town.
 */
import type { Sim } from '../sim.ts';
import { REPAIR, ENEMIES, type ItemId } from '../content.ts';
import { GATE, WALL, onWall } from '../map.ts';
import type { Command, Enemy, GateState, Hero, Id } from '../types.ts';
import { dist } from '../../core/math.ts';

/** The gate's strength. */
export const GATE_HP = 1500;
/** A broken gate swings shut again once it is mended this far. */
export const GATE_MEND = 0.3;
/** Walkers stop this far short of their road's end while the gate is shut (at its doors). */
export const GATE_STOP = WALL.half + 0.7;
/** Siege mobs batter the gate this much harder than they hit anything else. */
export const GATE_SIEGE = 2;
/** Where heroes work the gate from: its winch inside, beside the doorway. */
export const GATE_WINCH = { x: GATE.x - WALL.half - 1.4, z: 0, reach: 5.5 };

/** Is the gate shut (and standing)? */
export const gateShut = (s: { gate: GateState }): boolean => s.gate.shut && s.gate.hp > 0;

/**
 * Are the dead at the gate's doors — ramming it, or pouring through it broken? Then mending it from
 * inside goes slowly (it only slows a breach: REPAIR.gatePassive); between the waves it goes as
 * quickly as any building's.
 */
export function gateRammed(sim: Sim): boolean {
  return sim.state.enemies.some(
    (e) =>
      !e.camp &&
      e.hp > 0 &&
      !e.flying &&
      !e.burrowed &&
      e.lane >= 0 &&
      e.d >= laneAt(sim.world, e.lane).length - GATE_STOP - 1.5,
  );
}

/** Can hero `h` work the gate from where they stand (by its winch, or up on the wall beside it)? */
export function atGate(h: Hero): boolean {
  return (
    dist(h.x, h.z, GATE_WINCH.x, GATE_WINCH.z) < GATE_WINCH.reach ||
    (onWall(h.x, h.z) && Math.abs(h.z) < WALL.gatePiece + 6)
  );
}

/** Why hero `h` can't shut (or open) the gate now — or null. */
export function gateBlocker(sim: Sim, h: Hero, shut: boolean): string | null {
  const g = sim.state.gate;
  if (h.dead) return 'Not while you are down';
  if (!shut) return 'The gate stays shut: no hero goes out there, and open it only lets the dead in';
  if (!atGate(h)) return 'Go to the gate first';
  if (g.shut) return 'The gate is shut';
  if (g.hp < g.maxHp * GATE_MEND)
    return 'The gate is broken — mend it first (wood, stone, planks or blocks, and a hammer)';
  return null;
}

export function applyGateCommand(sim: Sim, cmd: Command): boolean {
  if (cmd.t !== 'gate') return false;
  const h = sim.getAs(cmd.hero, 'hero');
  if (!h) return true;
  const why = gateBlocker(sim, h, cmd.shut);
  if (why) {
    sim.emit('denied', { hero: h.id, reason: why, x: GATE.x, z: GATE.z });
    return true;
  }
  shutGate(sim, h.id);
  return true;
}

/** Is (x, z) in the gate's doorway (through the wall)? */
export function inDoorway(x: number, z: number): boolean {
  return Math.abs(x - GATE.x) <= WALL.half + 0.2 && Math.abs(z - GATE.z) < WALL.gateHalf;
}

/** A walker at the shut gate hits it; it breaks open when its strength is gone. */
export function batterGate(sim: Sim, e: Enemy, dmg: number): void {
  const g = sim.state.gate;
  if (g.hp <= 0) return;
  const hit = Math.min(g.hp, dmg * (ENEMIES[e.kind].siege ? GATE_SIEGE : 1));
  g.hp -= hit;
  sim.emit('gateHit', { amount: hit, by: e.id, hp: g.hp });
  if (g.hp <= 0) {
    g.hp = 0;
    g.shut = false;
    sim.emit('gateMoved', { hero: 0, shut: false, broken: true });
  }
}

/** The material a hero would mend the gate with, if they carry any. */
function material(h: Hero): ItemId | null {
  for (const m of REPAIR.materials) if ((h.bag[m] ?? 0) > 0) return m;
  return null;
}

/** Is there mending to do on the gate, with what hero `h` carries (or has already hammered in)? */
export function gateNeedsMending(sim: Sim, h: Hero): boolean {
  const g = sim.state.gate;
  return g.hp < g.maxHp && (g.repairBuf > 0 || !!material(h));
}

/** Hammers `amount` of strength back into the gate, spending materials as it goes. Returns false when done. */
export function mendGate(sim: Sim, h: Hero, amount: number): boolean {
  const g = sim.state.gate;
  const was = g.hp;
  let left = amount;
  while (left > 0 && g.hp < g.maxHp) {
    if (g.repairBuf <= 0) {
      const m = material(h);
      if (!m) break;
      sim.takeFromBag(h, m, 1);
      g.repairBuf += m === 'planks' || m === 'blocks' ? REPAIR.processed : REPAIR.raw;
    }
    const heal = Math.min(left, g.repairBuf, g.maxHp - g.hp);
    g.hp += heal;
    g.repairBuf -= heal;
    left -= heal;
    if (heal <= 0) break;
  }
  if (amount - left > 0) sim.emit('gateRepaired', { hero: h.id, amount: amount - left, hp: g.hp });
  // Broken and now mended far enough: the winch swings it shut again.
  if (!g.shut && was < g.maxHp * GATE_MEND && g.hp >= g.maxHp * GATE_MEND) shutGate(sim, h.id);
  return gateNeedsMending(sim, h);
}

/** Shuts the gate; whoever stands in the doorway steps back inside. */
function shutGate(sim: Sim, by: Id): void {
  sim.state.gate.shut = true;
  for (const o of sim.state.heroes)
    if (inDoorway(o.x, o.z)) [o.x, o.z, o.px, o.pz] = [GATE_WINCH.x - 0.6, o.z, GATE_WINCH.x - 0.6, o.z];
  sim.emit('gateMoved', { hero: by, shut: true, broken: false });
}

/** The gate's place (its winch inside): the POI heroes walk up to. */
export function gatePoi(sim: Sim): Id {
  return sim.state.pois.find((p) => p.kind === 'gate')?.id ?? 0;
}

/**
 * A hero walked up to the gate's winch (F): with mending to do and the means for it, they set to
 * work on it (a hammer, and wood, stone, planks or blocks); otherwise, if it stands open (mended
 * enough), they shut it.
 */
export function gateArrive(sim: Sim, h: Hero, id: Id): void {
  const g = sim.state.gate;
  if (g.hp < g.maxHp && gateNeedsMending(sim, h)) {
    if (!sim.state.dev && !h.tools.includes('hammer')) {
      sim.emit('denied', { hero: h.id, reason: "You need a builder's hammer — the Market sells them" });
      return;
    }
    if (sim.state.dev) {
      g.hp = g.maxHp;
      sim.emit('gateRepaired', { hero: h.id, amount: g.maxHp, hp: g.hp });
      return;
    }
    h.task = { k: 'work', target: id };
    return;
  }
  if (!g.shut) applyGateCommand(sim, { t: 'gate', hero: h.id, shut: true });
  else if (g.hp < g.maxHp)
    sim.emit('denied', {
      hero: h.id,
      reason: 'Bring wood, stone, planks or blocks (and a hammer) to mend the gate',
      x: GATE.x,
      z: GATE.z,
    });
}
