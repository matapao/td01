import { ABILITIES, type AbilityId } from '../../game/content.ts';
import { dist } from '../../core/math.ts';
import type { InputContext } from './context.ts';

export class CombatControls {
  private host: InputContext;

  private tabCycle: number[] = [];
  constructor(host: InputContext) {
    this.host = host;
  }
  stopFighting(): void {
    const h = this.host.hero;
    if (!h) return;
    this.host.cmd({ t: 'stop', hero: h.id, peace: true });
    this.host.select(null);
    this.host.ui.hint('You stop fighting — attack (right-click, Tab + a skill) to fight again');
  }
  cast(id: AbilityId): void {
    const h = this.host.hero;
    if (!h || h.dead) return;
    const a = ABILITIES[id];
    if (h.cds[id] > 0) {
      this.host.ui.hint(`${a.name} is recharging`);
      return;
    }
    if (!a.targeted) {
      this.host.cmd({ t: 'cast', hero: h.id, ability: id });
      return;
    }
    // The current target if it is an enemy in range; otherwise the nearest enemy in front.
    const s = this.host.ui.selected;
    let target = s?.kind === 'enemy' ? this.host.game.sim.getAs(s.id, 'enemy') : undefined;
    if (!target || dist(target.x, target.z, h.x, h.z) > (a.range ?? 10))
      target = this.enemyInFront(a.range ?? 10) ?? undefined;
    if (!target) {
      this.host.ui.hint('No enemy in range');
      return;
    }
    this.host.cmd({ t: 'cast', hero: h.id, ability: id, target: target.id });
  }
  private enemyInFront(range: number) {
    const h = this.host.hero;
    const f = this.host.game.cam.forward;
    let best = null;
    let bs = Infinity;
    for (const e of this.host.game.sim.state.enemies) {
      if (e.spawnT > 0 || e.burrowed) continue;
      const dx = e.x - h.x;
      const dz = e.z - h.z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      const ahead = d > 0.01 ? (dx * f.x + dz * f.z) / d : 1;
      const score = d * (1.6 - ahead);
      if (score < bs) {
        bs = score;
        best = e;
      }
    }
    return best;
  }
  nextTarget(): void {
    const h = this.host.hero;
    const f = this.host.game.cam.forward;
    const list = this.host.game.sim.state.enemies
      .filter((e) => e.spawnT <= 0 && !e.burrowed && dist(e.x, e.z, h.x, h.z) < 32)
      .map((e) => {
        const dx = e.x - h.x;
        const dz = e.z - h.z;
        const d = Math.hypot(dx, dz) || 1;
        return { id: e.id, score: d * (1.8 - (dx * f.x + dz * f.z) / d) };
      })
      .sort((a, b) => a.score - b.score)
      .map((x) => x.id);
    if (!list.length) {
      this.host.ui.hint('No enemies nearby');
      return;
    }
    const cur = this.host.ui.selected?.kind === 'enemy' ? this.host.ui.selected.id : 0;
    const fresh = list.filter((id) => !this.tabCycle.includes(id));
    const next = cur && fresh.length ? fresh[0]! : list[0]!;
    this.tabCycle = cur && fresh.length ? [...this.tabCycle, next] : [next];
    this.host.select({ kind: 'enemy', id: next });
  }
}
