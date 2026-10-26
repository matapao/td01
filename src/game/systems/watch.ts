/** Surveillance: watch gems in tower sockets give vision, burrower detection, radar pulses and the wave-intel level. */
import type { Sim } from '../sim.ts';
import { OVER_WALL, GEM_LEVELS, WATCH, gemLevel, type GemId } from '../content.ts';
import type { Id } from '../types.ts';
import { dist } from '../../core/math.ts';
import { surface } from './enemies.ts';
import { liveDevice } from './power.ts';

/** Watch gems and what they make a tower: a seer's emerald a lookout, a scrying amethyst a radar. */
const WATCH_GEM: Partial<Record<GemId, keyof typeof WATCH>> = { seer: 'lookout', scry: 'scrying' };

export function updateWatch(sim: Sim, dt: number): void {
  const s = sim.state;
  let lookout = false;
  let radar = false;
  for (const b of s.buildings) {
    if ((!b.gems?.length && !b.devices?.length) || !sim.alive(b.id)) continue;
    // A hero crewing it from the wall-walk sees further (and spots burrowers further out).
    const far = s.heroes.some((h) => h.post === b.id && !h.dead) ? OVER_WALL.lookout : 1;
    // Watch gems, and a live radar dish (a radar watch at full strength).
    const watches: { kind: keyof typeof WATCH; k: number }[] = [];
    for (const g of b.gems) {
      const kind = WATCH_GEM[g];
      if (kind) watches.push({ kind, k: GEM_LEVELS[gemLevel(b, g)].k });
    }
    if (liveDevice(b, 'radar')) watches.push({ kind: 'radar', k: 1 });
    for (const { kind, k } of watches) {
      const w = WATCH[kind];
      if (kind === 'lookout') lookout = true;
      else radar = true;
      // A brilliant gem sees further than a rough one.
      const reach = far * (0.75 + 0.25 * k);
      if (s.tick % 20 === b.id % 20) sim.reveal(b.x, b.z, w.sight * reach);
      if (w.detect > 0) {
        for (const e of s.enemies)
          if (e.burrowed && dist(e.x, e.z, b.x, b.z) <= w.detect * reach) surface(sim, e, true);
      }
      if (w.radar > 0) {
        b.radarT -= dt;
        if (b.radarT <= 0) {
          b.radarT = w.radarEvery;
          const found: Id[] = [];
          for (const e of s.enemies) if (dist(e.x, e.z, b.x, b.z) <= w.radar * reach) found.push(e.id);
          sim.emit('radarPulse', { building: b.id, x: b.x, z: b.z, r: w.radar * reach, found });
        }
      }
    }
  }
  s.intel = (lookout ? 1 : 0) + (radar ? 1 : 0);
}
