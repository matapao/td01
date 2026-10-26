/** Compiled public provider packages own persistence and visualization; the game supplies its rules. */
import { readFile } from 'node:fs/promises';
import { parseManifest } from '@zirbel/core/game-manifest';
import { openStatistics } from '@zirbel/statistics/server';
import { statisticsView } from '@zirbel/statistics/view';
import type { ReportMetric } from './metrics.ts';
export interface LocalStatisticsOptions {
  readonly directory: string;
  readonly instance: string;
}
export async function openGameStatistics(options: LocalStatisticsOptions, revision: string) {
  const raw: unknown = JSON.parse(
    await readFile(new URL('../docs/site/td01/zirbel.json', import.meta.url), 'utf8'),
  );
  const { manifest, errors } = parseManifest(raw);
  if (!manifest || errors.length) throw new Error('Invalid game statistics manifest: ' + errors.join('; '));
  const definitions = new Map(manifest.metrics.map((metric) => [metric.name, metric]));
  const statistics = await openStatistics({
    ...options,
    view: statisticsView,
    failed: (error: unknown) => {
      console.error(
        'Local game statistics could not be persisted:',
        error instanceof Error ? error.message : 'unknown failure',
      );
    },
  });
  const report: ReportMetric = (name, value, labels = {}) => {
    const metric = definitions.get(name);
    if (!metric) throw new Error('Undeclared game metric: ' + name);
    statistics.report({
      game: manifest.id,
      version: manifest.version,
      revision,
      room: 'lan',
      from: 'authority',
      metric,
      labels,
      value,
    });
  };
  return { report, http: statistics.http, snapshot: statistics.snapshot, close: statistics.close };
}
