/** Numeric simulation metrics; transport, storage and any publication belong to the server driver. */
import type { GameState } from '../src/game/state-types.ts';
export type ReportMetric = (name: string, value: number, labels?: Readonly<Record<string, string>>) => void;
const LIVE_METRICS = new Set(['wave', 'gold', 'keep_lives', 'buildings', 'towers', 'stored_resources']);
export class GameMetrics {
  private previous: GameState['stats'];
  private cleared: number;
  private sampledAt: number;
  private finished: boolean;
  private eligible: boolean;
  private readonly sigil: number;
  private party = 0;
  private readonly report: ReportMetric;
  constructor(state: GameState, report: ReportMetric = () => {}) {
    this.previous = { ...state.stats };
    this.cleared = state.waveCleared.filter(Boolean).length;
    this.sampledAt = state.time - 1;
    this.finished = state.phase === 'won' || state.phase === 'lost';
    this.sigil = state.sigil;
    this.eligible = !state.dev && Number.isInteger(state.sigil) && state.sigil >= 0 && state.sigil <= 7;
    this.report = report;
  }
  private publish(name: string, value: number, labels: Readonly<Record<string, string>> = {}): void {
    this.report(
      name,
      value,
      LIVE_METRICS.has(name) ? {} : { sigil: String(this.sigil), party: String(this.party), ...labels },
    );
  }
  update(state: GameState): void {
    // Once development controls were used, this run cannot produce ordinary records.
    if (state.dev || state.sigil !== this.sigil) this.eligible = false;
    this.party = state.heroes.length;
    if (!this.eligible || this.party < 1 || this.party > 16) return;
    const ended = state.phase === 'won' || state.phase === 'lost';
    if (state.time - this.sampledAt < 1 && (!ended || this.finished)) return;
    this.sampledAt = state.time;
    const counters = [
      ['kills', 'enemies_defeated_total'],
      ['gathered', 'resources_gathered_total'],
      ['crafted', 'items_crafted_total'],
      ['built', 'buildings_completed_total'],
      ['leaks', 'leaks_total'],
    ] as const;
    for (const [field, name] of counters) {
      const delta = state.stats[field] - this.previous[field];
      if (delta > 0) this.publish(name, delta);
    }
    this.previous = { ...state.stats };
    const cleared = state.waveCleared.filter(Boolean).length;
    if (cleared > this.cleared) this.publish('waves_cleared_total', cleared - this.cleared);
    this.cleared = cleared;
    this.publish('wave', state.wave);
    this.publish('gold', state.gold);
    this.publish('keep_lives', state.lives);
    this.publish('buildings', state.buildings.length);
    this.publish('towers', state.buildings.filter((building) => building.kind === 'tower').length);
    this.publish(
      'stored_resources',
      Object.values(state.storage).reduce((sum, n) => sum + (n ?? 0), 0),
    );
    if (!ended || this.finished) return;
    this.finished = true;
    const outcome = { outcome: state.phase };
    this.publish('runs_total', 1, outcome);
    this.publish('run_seconds', Math.max(0, state.time), outcome);
    this.publish('run_waves', cleared);
    this.publish('run_kills', state.stats.kills);
    this.publish('run_resources', state.stats.gathered);
    if (state.phase === 'won') this.publish('victory_seconds', Math.max(0, state.time));
  }
}
