/** A deterministic digest of visible simulation state; no mutation or platform dependencies. */
import type { GameState } from './state-types.ts';

export function simulationDigest(s: GameState): number {
  let h = s.tick ^ (s.gold * 31) ^ (s.lives * 131) ^ (s.wave * 7919);
  const mix = (v: number) => {
    h = Math.imul(h ^ Math.round(v * 1000), 0x9e3779b1) >>> 0;
  };
  for (const e of s.enemies) {
    mix(e.x);
    mix(e.z);
    mix(e.hp);
  }
  for (const b of s.buildings) mix(b.x + b.z * 3 + b.gems.length);
  for (const hh of s.heroes) {
    mix(hh.x);
    mix(hh.z);
    mix(hh.hp);
  }
  mix(s.drops.length);
  return h >>> 0;
}
