// packages/hzl-cli/src/commands/task/prune.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { createShortId } from '../../short-id.js';
import { parseInteger } from '../../parse.js';
import type { PruneResult } from 'hzl-core/services/task-service.js';

interface PruneCommandOptions {
  project?: string;
  all?: boolean;
  olderThan?: string;
  asOf?: string;
  yes?: boolean;
  dryRun?: boolean;
}

function parseOlderThan(olderThanStr: string): number {
  const match = olderThanStr.match(/^(\d+)d$/);
  if (!match) {
    throw new CLIError(
      'Invalid --older-than format. Use Nd (e.g., 30d for 30 days)',
      ExitCode.InvalidUsage
    );
  }

  return parseInteger(match[1], '--older-than', { min: 1 });
}

function validateScope(opts: PruneCommandOptions): void {
  if (!opts.project && !opts.all) {
    throw new CLIError(
      'Must specify --project <name> or --all',
      ExitCode.InvalidUsage
    );
  }

  if (opts.project && opts.all) {
    throw new CLIError(
      'Cannot specify both --project and --all',
      ExitCode.InvalidUsage
    );
  }
}

function parseAsOf(asOfStr: string): string {
  const ts = Date.parse(asOfStr);
  if (Number.isNaN(ts)) {
    throw new CLIError(
      'Invalid --as-of timestamp. Use ISO 8601 (e.g., 2026-02-03T12:00:00Z)',
      ExitCode.InvalidUsage
    );
  }
  return new Date(ts).toISOString();
}

export function runPrune(options: {
  services: Services;
  project?: string;
  olderThanDays: number;
  asOf?: string;
  yes?: boolean;
  dryRun?: boolean;
  json: boolean;
}): PruneResult | null {
  const { services, project, olderThanDays, asOf, yes, dryRun, json } = options;

  try {
    // Get eligible tasks
    const eligible = services.taskService.previewPrunableTasks({
      project,
      olderThanDays,
      asOf,
    });

    // Validation: JSON requires --yes (unless dry-run)
    if (json && !yes && !dryRun) {
      throw new CLIError(
        'Cannot use --json without --yes for destructive operations',
        ExitCode.InvalidUsage
      );
    }

    const shortId = createShortId(eligible.map(t => t.task_id));

    // Handle dry-run (no deletion)
    if (dryRun) {
      if (json) {
        console.log(JSON.stringify({ wouldPrune: eligible, count: eligible.length }));
      } else {
        if (eligible.length === 0) {
          console.log('No tasks eligible for pruning');
        } else {
          console.log(`Would prune ${eligible.length} task(s):`);
          for (const t of eligible.slice(0, 20)) {
            console.log(`  [${shortId(t.task_id)}] ${t.title} (${t.project})`);
          }
          if (eligible.length > 20) {
            console.log(`  ... and ${eligible.length - 20} more`);
          }
        }
      }
      return null; // Don't return a result for dry-run
    }

    // If no eligible tasks, return early
    if (eligible.length === 0) {
      if (!json) {
        console.log('No tasks eligible for pruning');
      }
      return {
        pruned: [],
        count: 0,
        eventsDeleted: 0,
      };
    }

    // Require --yes for destructive operations
    // Show preview and require explicit confirmation
    if (!yes) {
      console.log(`Found ${eligible.length} task(s) eligible for pruning:`);
      for (const t of eligible.slice(0, 10)) {
        console.log(`  [${shortId(t.task_id)}] ${t.title} (${t.project})`);
      }
      if (eligible.length > 10) {
        console.log(`  ... and ${eligible.length - 10} more`);
      }
      console.log('');
      console.log('To permanently delete these tasks, run again with --yes');
      return null;
    }

    // Actually prune
    const result = services.taskService.pruneEligible({
      project,
      olderThanDays,
      asOf,
    });

    if (json) {
      console.log(
        JSON.stringify({
          pruned: result.pruned.map(t => ({
            task_id: t.task_id,
            title: t.title,
            project: t.project,
            status: t.status,
          })),
          count: result.count,
          eventsDeleted: result.eventsDeleted,
        })
      );
    } else {
      console.log(`Pruned ${result.count} task(s) (${result.eventsDeleted} events deleted)`);
    }

    return result;
  } catch (error) {
    if (error instanceof CLIError) {
      throw error;
    }
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        throw new CLIError(error.message, ExitCode.NotFound);
      }
      if (error.message.includes('Invalid') || error.message.includes('Must')) {
        throw new CLIError(error.message, ExitCode.InvalidUsage);
      }
    }
    throw error;
  }
}

export function createPruneCommand(): Command {
  return new Command('prune')
    .description('Permanently delete old tasks in terminal states')
    .option('-P, --project <name>', 'Prune tasks in specific project')
    .option('-A, --all', 'Prune tasks in all projects')
    .option('--older-than <duration>', 'Age threshold (e.g., 30d)', '30d')
    .option('--as-of <timestamp>', 'Evaluate age threshold as of a fixed time (ISO)')
    .option('-y, --yes', 'Skip confirmation prompt (required for non-interactive use)')
    .option('--dry-run', 'Preview what would be pruned without deleting')
    .action(function (this: Command, opts: PruneCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());

      try {
        // Validate options
        validateScope(opts);
        const olderThanDays = parseOlderThan(opts.olderThan || '30d');
        const asOf = opts.asOf ? parseAsOf(opts.asOf) : undefined;

        const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
        const services = initializeDb({ eventsDbPath, cacheDbPath });

        try {
          runPrune({
            services,
            project: opts.project,
            olderThanDays,
            asOf,
            yes: opts.yes,
            dryRun: opts.dryRun,
            json: globalOpts.json ?? false,
          });
        } finally {
          closeDb(services);
        }
      } catch (e) {
        handleError(e, GlobalOptionsSchema.parse(this.optsWithGlobals()).json);
      }
    });
}
