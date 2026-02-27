import { Command } from 'commander';
import { z } from 'zod';
import { HookDrainService, type HookDrainConfig, type HookDrainResult } from 'hzl-core';
import { resolveDbPaths } from '../config.js';
import { initializeDb, closeDb } from '../db.js';
import { handleError } from '../errors.js';
import { GlobalOptionsSchema } from '../types.js';

export interface RunHookDrainOptions extends Partial<HookDrainConfig> {
  eventsDbPath: string;
  cacheDbPath: string;
  json: boolean;
  limit?: number;
}

export async function runHookDrain(options: RunHookDrainOptions): Promise<HookDrainResult> {
  const {
    eventsDbPath,
    cacheDbPath,
    json,
    limit,
    ...runtimeConfig
  } = options;

  const services = initializeDb({ eventsDbPath, cacheDbPath });
  try {
    const hookDrainService = new HookDrainService(services.cacheDb, runtimeConfig);
    const result = await hookDrainService.drain({ limit });

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('Hook drain complete');
      console.log(`  Claimed: ${result.claimed}`);
      console.log(`  Delivered: ${result.delivered}`);
      console.log(`  Retried: ${result.retried}`);
      console.log(`  Failed: ${result.failed}`);
      if (result.reclaimed > 0 || result.reclaimed_failed > 0) {
        console.log(
          `  Reclaimed stale locks: ${result.reclaimed} queued, ${result.reclaimed_failed} failed`
        );
      }
      console.log('  Model: one-shot host-process (schedule `hzl hook drain` externally)');
    }

    return result;
  } finally {
    closeDb(services);
  }
}

export function createHookCommand(): Command {
  const hookCommand = new Command('hook')
    .description('Hook delivery commands (host-process model; no daemon required)');

  hookCommand
    .command('drain')
    .description('Process queued hook deliveries once')
    .option('--limit <n>', 'Maximum queued records to process this run')
    .action(async function (this: Command) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const localOpts = z.object({
        limit: z.coerce.number().int().positive().optional(),
      }).parse(this.opts());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);

      try {
        await runHookDrain({
          eventsDbPath,
          cacheDbPath,
          json: globalOpts.json,
          limit: localOpts.limit,
        });
      } catch (error) {
        handleError(error, globalOpts.json);
      }
    });

  return hookCommand;
}
