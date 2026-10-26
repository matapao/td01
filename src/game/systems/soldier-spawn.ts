import type { Sim } from '../sim.ts';
import { sizeOf } from '../content.ts';
import type { Building, Unit } from '../types.ts';

export function makeSoldier(sim: Sim, b: Building, slot: number): Unit {
  const st = b.stats!;
  const captain = st.captain && slot === 0;
  const mul = captain ? 2.5 : 1;
  const out = sizeOf(b.kind) / 2 + 0.3;
  const door = { x: b.x + Math.sin(b.rot) * out, z: b.z + Math.cos(b.rot) * out };
  const u: Unit = {
    id: sim.newId(),
    kind: captain ? 'captain' : 'footman',
    tower: b.id,
    slot,
    x: door.x,
    z: door.z,
    px: door.x,
    pz: door.z,
    facing: b.rot,
    hp: st.soldierHp * mul,
    maxHp: st.soldierHp * mul,
    armor: st.soldierArmor,
    damage: st.soldierDamage * mul,
    rate: st.soldierRate,
    attackCd: 0,
    target: 0,
    dead: false,
    respawnT: 0,
    idleT: 0,
    anim: 'idle',
    animT: 0,
  };
  sim.add('unit', u);
  sim.emit('unitSpawned', { id: u.id, tower: b.id });
  return u;
}

/** After a module goes in or out: refresh stats, add or send home footmen, promote the captain. */
export function syncSoldiers(sim: Sim, b: Building): void {
  const st = b.stats!;
  for (const u of sim.state.units) {
    if (u.tower !== b.id || u.slot < st.soldiers) continue;
    const e = u.target ? sim.getAs(u.target, 'enemy') : undefined;
    if (e && e.blocker === u.id) e.blocker = 0;
    sim.remove(u.id);
  }
  const mine = sim.state.units.filter((u) => u.tower === b.id && sim.alive(u.id));
  for (const u of mine) {
    const captain = st.captain && u.slot === 0;
    const mul = captain ? 2.5 : 1;
    const frac = u.maxHp > 0 ? u.hp / u.maxHp : 1;
    u.kind = captain ? 'captain' : 'footman';
    u.maxHp = st.soldierHp * mul;
    u.hp = u.dead ? 0 : Math.max(1, u.maxHp * frac);
    u.damage = st.soldierDamage * mul;
    u.armor = st.soldierArmor;
  }
  for (let i = 0; i < st.soldiers; i++) if (!mine.some((u) => u.slot === i)) makeSoldier(sim, b, i);
}
