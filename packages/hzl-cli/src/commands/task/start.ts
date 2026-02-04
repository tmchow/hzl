// Alias for 'claim' - more intuitive for "starting work on a task"
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb } from '../../db.js';
import { handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { runClaim } from './claim.js';

interface StartCommandOptions {
  assignee?: string;
  agentId?: string;
  lease?: string;
}

export function createStartCommand(): Command {
  return new Command('start')
    .description('Start working on a task (alias for claim)')
    .argument('<taskId>', 'Task ID')
    .option('--assignee <name>', 'Who to assign the task to')
    .option('--agent-id <id>', 'Agent ID (machine/AI identifier)')
    .option('-l, --lease <minutes>', 'Lease duration in minutes')
    .action(function (this: Command, taskId: string, opts: StartCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runClaim({
          services,
          taskId,
          assignee: opts.assignee,
          agentId: opts.agentId,
          leaseMinutes: opts.lease ? parseInt(opts.lease, 10) : undefined,
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
