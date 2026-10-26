/** Fictional game charges: prepare at the mine bay, place on an exposed face, then retreat. */
import type { Sim } from './sim.ts';
import type { Command, Hero } from './types.ts';
import { earth } from './excavation.ts';
import { groundHeight } from './map.ts';
import { MINE_AT, MINERALS } from './mines.ts';
import { damageEnemy } from './systems/combat/damage.ts';
import { damageHero } from './systems/hero/lifecycle.ts';
export const PREP_BAY = { x: MINE_AT.x - 1.4, z: MINE_AT.z - 0.5 };
export const blastRadius = (level: number) => 1.7 + 0.2 * Math.max(1, Math.min(3, level));
export const blastSkill = (h: Hero) => h.blastSkill ?? { stage: 0, level: 0, xp: 0 };
const ensureBlastSkill = (h: Hero) => (h.blastSkill ??= blastSkill(h));
export function applyBlastingCommand(sim: Sim, cmd: Command): boolean {
  if (!['blast', 'prepareBlast', 'makeCharges'].includes(cmd.t)) return false;
  if (!('hero' in cmd)) return true;
  const h = sim.getAs(cmd.hero, 'hero');
  if (!h || h.dead || h.transit) return true;
  const skill = ensureBlastSkill(h),
    deny = (reason: string) => sim.emit('denied', { hero: h.id, reason });
  if (cmd.t === 'prepareBlast' || cmd.t === 'makeCharges') {
    if (Math.hypot(h.x - PREP_BAY.x, h.z - PREP_BAY.z) > 2.4)
      return (deny('Use the preparation bench in the mine arrival bay'), true);
    if (cmd.t === 'makeCharges') {
      if (skill.level < 1) return (deny('Complete the short blasting preparation first'), true);
      if ((h.bag.coal ?? 0) < 1 || (h.bag.sulfur ?? 0) < 1)
        return (deny('Gather 1 coal and 1 sulfur to prepare two game charges'), true);
      if (sim.bagSlots(h) > 14) return (deny('Make room for two charges in your bag'), true);
      sim.takeFromBag(h, 'coal', 1);
      sim.takeFromBag(h, 'sulfur', 1);
      sim.addToBag(h, 'dynamite', 2);
      return true;
    }
    if (cmd.step !== skill.stage + 1 || cmd.step > 3) return true;
    if (cmd.step === 1) {
      skill.stage = 1;
      return true;
    }
    if (cmd.step === 2) {
      if (sim.bagSlots(h) > 14) return (deny('Make room for the two starter charges'), true);
      sim.addToBag(h, 'dynamite', 2);
      skill.stage = 2;
      return true;
    }
    skill.stage = 3;
    skill.level = 1;
    return true;
  }
  if (cmd.t !== 'blast') return true;
  if (h.x < 1500) return (deny('Use blasting charges on the mine rock'), true);
  if (skill.level < 1) return (deny('Prepare blasting at the bench by the lift first'), true);
  if ((h.bag.dynamite ?? 0) < 1 && !sim.state.dev)
    return (deny('Prepare charges at the mine bench: 1 coal + 1 sulfur makes 2'), true);
  if (sim.state.bombs.some((b) => b.hero === h.id))
    return (deny('Let the lit charge finish before placing another'), true);
  const field = earth(sim),
    origin = { x: h.x, y: groundHeight(sim.world, h.x, h.z) + 0.45, z: h.z };
  const target =
    cmd.x === undefined
      ? field.ray(origin, { x: Math.sin(h.look), y: 0, z: Math.cos(h.look) }, 3.5)
      : { x: cmd.x, y: cmd.y!, z: cmd.z! };
  if (!target || ![target.x, target.y, target.z].every(Number.isFinite))
    return (deny('Aim at a nearby exposed rock face'), true);
  const dx = target.x - origin.x,
    dy = target.y - origin.y,
    dz = target.z - origin.z,
    d = Math.hypot(dx, dy, dz);
  if (d > 3.5 || d < 0.12 || Math.abs(field.density(target.x, target.y, target.z)) > 0.25)
    return (deny('Choose an exposed face within reach'), true);
  const first = field.ray(origin, { x: dx / d, y: dy / d, z: dz / d }, d + 0.2);
  if (!first || first.distance < d - 0.24) return (deny('You cannot place a charge through rock'), true);
  const n = field.normal(target.x, target.y, target.z);
  if (!sim.state.dev) sim.takeFromBag(h, 'dynamite', 1);
  const b = {
    id: sim.newId(),
    x: target.x + n.x * 0.035,
    y: target.y + n.y * 0.035,
    z: target.z + n.z * 0.035,
    t: 3.5,
    hero: h.id,
    level: skill.level,
  };
  sim.state.bombs.push(b);
  sim.emit('bombLit', { hero: h.id, id: b.id, x: b.x, z: b.z });
  deny('Fuse lit — move beyond the marked blast radius');
  return true;
}
export function updateBlasting(sim: Sim, dt: number): void {
  for (let i = sim.state.bombs.length - 1; i >= 0; i--) {
    // Reverse traversal stays within the dense bomb array, removing only this index.
    const b = sim.state.bombs[i]!;
    b.t -= dt;
    if (b.t > 0) continue;
    sim.state.bombs.splice(i, 1);
    const field = earth(sim),
      y = b.y ?? groundHeight(sim.world, b.x, b.z) + 0.3,
      level = Math.max(1, Math.min(3, b.level ?? 1)),
      r = 0.65 + 0.23 * (level - 1),
      R = blastRadius(level);
    const mineral = field.mineral(b.x, y, b.z),
      item = MINERALS[mineral].item;
    field.state.cuts.push({ x: b.x, y, z: b.z, r, soil: false });
    field.sync();
    sim.emit('earthHit', {
      hero: b.hero,
      x: b.x,
      y,
      z: b.z,
      r,
      soil: false,
      mineral,
      item,
      volume: (4 / 3) * Math.PI * r * r * r,
    });
    for (let n = 0; n < 2 + level; n++) sim.spawnDrop(item, b.x, b.z, b.x, b.z, b.hero);
    for (const e of [...sim.state.enemies])
      if (e.hp > 0) {
        const d = Math.hypot(e.x - b.x, groundHeight(sim.world, e.x, e.z) + 0.3 - y, e.z - b.z);
        if (d < R) damageEnemy(sim, e, (75 + 25 * level) * (1 - (d / R) * 0.5), 'impact', b.hero, false);
      }
    for (const h of sim.state.heroes)
      if (!h.dead) {
        const d = Math.hypot(h.x - b.x, groundHeight(sim.world, h.x, h.z) + 0.3 - y, h.z - b.z);
        if (d < R) damageHero(sim, h, 80 * (1 - (d / R) * 0.5));
      }
    const h = sim.getAs(b.hero, 'hero');
    if (h) {
      const skill = ensureBlastSkill(h);
      skill.xp++;
      skill.level = Math.min(3, 1 + Math.floor(skill.xp / 3));
    }
    sim.emit('blast', { x: b.x, y, z: b.z, r: R, mine: 0 });
  }
}
