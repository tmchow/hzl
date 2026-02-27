// packages/hzl-cli/src/commands/task/unblock.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { resolveId } from '../../resolve-id.js';

export interface UnblockResult {
  task_id: string;
  title: string;
  status: string;
  agent: string | null;
}

interface UnblockCommandOptions {
  release?: boolean;
  comment?: string;
  author?: string;
}

export function runUnblock(options: {
  services: Services;
  taskId: string;
  release?: boolean;
  comment?: string;
  author?: string;
  json: boolean;
}): UnblockResult {
  const { services, taskId, release, comment, author, json } = options;

  const task = services.taskService.unblockTask(taskId, { release, comment, author });

  const result: UnblockResult = {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
    agent: task.agent,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    const statusMsg = release ? 'released back to ready' : 'resumed';
    console.log(`▶ Unblocked task ${task.task_id}: ${task.title} (${statusMsg})`);
    if (comment) console.log(`  Comment: ${comment}`);
  }

  return result;
}

export function createUnblockCommand(): Command {
  return new Command('unblock')
    .description('Unblock a blocked task, returning it to work')
    .argument('<taskId>', 'Task ID')
    .option('--release', 'Return task to ready status instead of in_progress')
    .option('--comment <comment>', 'Comment explaining the unblock')
    .option('--author <name>', 'Author name')
    .action(function (this: Command, rawTaskId: string, opts: UnblockCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const taskId = resolveId(services, rawTaskId);
        runUnblock({
          services,
          taskId,
          release: opts.release,
          comment: opts.comment,
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
