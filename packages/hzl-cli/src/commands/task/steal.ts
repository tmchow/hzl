// packages/hzl-cli/src/commands/steal.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { resolveId } from '../../resolve-id.js';

export interface StealResult {
  task_id: string;
  title: string;
  status: string;
  assignee: string | null;
  stolen_from: string | null;
}

interface StealCommandOptions {
  assignee?: string;
  owner?: string;
  author?: string;
  force?: boolean;
  ifExpired?: boolean;
}

export function runSteal(options: {
  services: Services;
  taskId: string;
  newAssignee?: string;
  author?: string;
  force?: boolean;
  ifExpired?: boolean;
  json: boolean;
}): StealResult {
  const { services, taskId, newAssignee, author, force, ifExpired, json } = options;

  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }

  const previousAssignee = task.assignee;

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
    } else if (task.assignee) {
      // No lease set, but task is claimed - require force
      throw new CLIError(`Task is claimed but has no lease. Use --force to steal.`, ExitCode.InvalidInput);
    }
  }

  const effectiveAssignee = newAssignee ?? author;
  if (!effectiveAssignee) {
    throw new CLIError(`Must specify --assignee (or --author for legacy behavior)`, ExitCode.InvalidInput);
  }

  const effectiveAuthor = author ?? effectiveAssignee;

  // Steal by using stealTask service method.
  const stealResult = services.taskService.stealTask(taskId, { 
    assignee: effectiveAssignee,
    author: effectiveAuthor,
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
    assignee: stolenTask.assignee,
    stolen_from: previousAssignee,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Stole task ${stolenTask.task_id}: ${stolenTask.title}`);
    if (previousAssignee) console.log(`  Previous assignee: ${previousAssignee}`);
    if (effectiveAssignee) console.log(`  New assignee: ${effectiveAssignee}`);
  }

  return result;
}

export function createStealCommand(): Command {
  return new Command('steal')
    .description('Steal a claimed task')
    .argument('<taskId>', 'Task ID')
    .option('--assignee <name>', 'New assignee name')
    .option('--owner <name>', 'Deprecated alias for --assignee')
    .option('--author <name>', 'Author name')
    .option('--force', 'Force steal even if lease is active')
    .option('--if-expired', 'Only steal if lease has expired')
    .action(function (this: Command, rawTaskId: string, opts: StealCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        if (opts.assignee && opts.owner && opts.assignee !== opts.owner) {
          throw new CLIError(`Cannot use both --assignee and --owner with different values`, ExitCode.InvalidInput);
        }

        if (opts.owner && !(globalOpts.json ?? false)) {
          console.error('Warning: --owner is deprecated; use --assignee instead.');
        }

        const newAssignee = opts.assignee ?? opts.owner;
        const taskId = resolveId(services, rawTaskId);
        runSteal({
          services,
          taskId,
          newAssignee,
          author: opts.author,
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
