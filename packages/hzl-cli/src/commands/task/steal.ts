// packages/hzl-cli/src/commands/steal.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface StealResult {
  task_id: string;
  title: string;
  status: string;
  claimed_by_author: string | null;
  stolen_from: string | null;
}

interface StealCommandOptions {
  owner?: string;
  force?: boolean;
  ifExpired?: boolean;
}

export function runSteal(options: {
  services: Services;
  taskId: string;
  newOwner?: string;
  force?: boolean;
  ifExpired?: boolean;
  json: boolean;
}): StealResult {
  const { services, taskId, newOwner, force, ifExpired, json } = options;

  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }

  const previousOwner = task.claimed_by_author;

  // Check if we're allowed to steal (pre-validation)
  if (!force && !ifExpired) {
    throw new CLIError(`Must specify --force or --if-expired to steal a task`, ExitCode.InvalidInput);
  }

  if (!force && ifExpired) {
    // Only steal if lease has expired
    if (task.lease_until) {
      const leaseExpiry = new Date(task.lease_until);
      if (leaseExpiry > new Date()) {
        throw new CLIError(`Task lease has not expired (expires ${task.lease_until})`, ExitCode.InvalidInput);
      }
    } else if (task.claimed_by_author) {
      // No lease set, but task is claimed - require force
      throw new CLIError(`Task is claimed but has no lease. Use --force to steal.`, ExitCode.InvalidInput);
    }
  }

  // Steal by using stealTask service method
  // Pass ifExpired when force is not set, force when force is set
  const stealResult = services.taskService.stealTask(taskId, { 
    author: newOwner,
    force: force || false,
    ifExpired: ifExpired && !force,
  });

  if (!stealResult.success) {
    throw new CLIError(stealResult.error || 'Failed to steal task', ExitCode.InvalidInput);
  }

  // Get updated task
  const stolenTask = services.taskService.getTaskById(taskId)!;

  const result: StealResult = {
    task_id: stolenTask.task_id,
    title: stolenTask.title,
    status: stolenTask.status,
    claimed_by_author: stolenTask.claimed_by_author,
    stolen_from: previousOwner,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Stole task ${stolenTask.task_id}: ${stolenTask.title}`);
    if (previousOwner) console.log(`  Previous owner: ${previousOwner}`);
    if (newOwner) console.log(`  New owner: ${newOwner}`);
  }

  return result;
}

export function createStealCommand(): Command {
  return new Command('steal')
    .description('Steal a claimed task')
    .argument('<taskId>', 'Task ID')
    .option('--owner <name>', 'New owner name')
    .option('--force', 'Force steal even if lease is active')
    .option('--if-expired', 'Only steal if lease has expired')
    .action(function (this: Command, taskId: string, opts: StealCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runSteal({
          services,
          taskId,
          newOwner: opts.owner,
          force: opts.force,
          ifExpired: opts.ifExpired,
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
