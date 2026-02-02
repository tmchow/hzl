// packages/hzl-cli/src/commands/task/unblock.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface UnblockResult {
  task_id: string;
  title: string;
  status: string;
  assignee: string | null;
}

interface UnblockCommandOptions {
  release?: boolean;
  reason?: string;
  author?: string;
}

export function runUnblock(options: {
  services: Services;
  taskId: string;
  release?: boolean;
  reason?: string;
  author?: string;
  json: boolean;
}): UnblockResult {
  const { services, taskId, release, reason, author, json } = options;

  const task = services.taskService.unblockTask(taskId, { release, reason, author });

  const result: UnblockResult = {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
    assignee: task.assignee,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    const statusMsg = release ? 'released back to ready' : 'resumed';
    console.log(`▶ Unblocked task ${task.task_id}: ${task.title} (${statusMsg})`);
    if (reason) console.log(`  Reason: ${reason}`);
  }

  return result;
}

export function createUnblockCommand(): Command {
  return new Command('unblock')
    .description('Unblock a blocked task, returning it to work')
    .argument('<taskId>', 'Task ID')
    .option('--release', 'Return task to ready status instead of in_progress')
    .option('--reason <reason>', 'Unblock reason')
    .option('--author <name>', 'Author name')
    .action(function (this: Command, taskId: string, opts: UnblockCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runUnblock({
          services,
          taskId,
          release: opts.release,
          reason: opts.reason,
          author: opts.author,
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
