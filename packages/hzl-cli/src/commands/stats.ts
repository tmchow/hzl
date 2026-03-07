import { Command } from 'commander';
import { normalizeDurationLabel } from 'hzl-core/utils/duration.js';
import { resolveDbPaths } from '../config.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { handleError } from '../errors.js';
import { parseDurationMinutes } from '../parse.js';
import { GlobalOptionsSchema } from '../types.js';

export interface StatsResult {
  window: string;
  generated_at: string;
  projects: string[];
  queue: {
    backlog: number;
    ready: number;
    in_progress: number;
    blocked: number;
    done: number;
    archived: number;
    available: number;
    stale: number;
    expired_leases: number;
  };
  completions: {
    total: number;
    by_agent: Record<string, number>;
  };
  execution_time_ms: {
    count: number;
    mean: number | null;
    min: number | null;
    max: number | null;
    excluded_without_start: number;
  };
}

interface StatsCommandOptions {
  project?: string;
  window?: string;
}

export function runStats(options: {
  services: Services;
  project?: string;
  windowMinutes?: number;
  windowLabel?: string;
  json: boolean;
}): StatsResult {
  const stats = options.services.statsService.getStats({
    project: options.project,
    windowMinutes: options.windowMinutes,
    windowLabel: options.windowLabel,
  });

  if (options.json) {
    console.log(JSON.stringify(stats));
  } else {
    console.log(`Stats window: ${stats.window}`);
    console.log(`Generated: ${stats.generated_at}`);
    console.log(`Projects: ${stats.projects.length}`);
    console.log(
      `Queue: backlog ${stats.queue.backlog}, ready ${stats.queue.ready}, in_progress ${stats.queue.in_progress}, blocked ${stats.queue.blocked}, done ${stats.queue.done}, archived ${stats.queue.archived}`
    );
    console.log(
      `Primitives: available ${stats.queue.available}, stale ${stats.queue.stale}, expired_leases ${stats.queue.expired_leases}`
    );
    console.log(`Completions: ${stats.completions.total}`);
    if (Object.keys(stats.completions.by_agent).length > 0) {
      for (const [agent, count] of Object.entries(stats.completions.by_agent)) {
        console.log(`  ${agent}: ${count}`);
      }
    }
    console.log(
      `Execution time ms: count ${stats.execution_time_ms.count}, mean ${stats.execution_time_ms.mean ?? 'n/a'}, min ${stats.execution_time_ms.min ?? 'n/a'}, max ${stats.execution_time_ms.max ?? 'n/a'}, excluded_without_start ${stats.execution_time_ms.excluded_without_start}`
    );
  }

  return stats;
}

export function createStatsCommand(): Command {
  return new Command('stats')
    .description('Show operational reporting statistics')
    .option('-P, --project <project>', 'Filter by current project')
    .option('--window <duration>', 'Historical window for completions and execution time (default: 24h)', '24h')
    .action(function (this: Command, opts: StatsCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const windowMinutes = parseDurationMinutes(opts.window ?? '24h', 'window', { min: 1 });
        runStats({
          services,
          project: opts.project,
          windowMinutes,
          windowLabel: normalizeDurationLabel(opts.window ?? '24h') ?? '24h',
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
