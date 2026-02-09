// packages/hzl-cli/src/commands/release.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { resolveId } from '../../resolve-id.js';

export interface ReleaseResult {
  task_id: string;
  title: string;
  status: string;
  assignee: string | null;
}

interface ReleaseCommandOptions {
  comment?: string;
  author?: string;
}

export function runRelease(options: {
  services: Services;
  taskId: string;
  comment?: string;
  author?: string;
  json: boolean;
}): ReleaseResult {
  const { services, taskId, comment, author, json } = options;

  const task = services.taskService.releaseTask(taskId, { comment, author });

  const result: ReleaseResult = {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
    assignee: task.assignee,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Released task ${task.task_id}: ${task.title}`);
    if (comment) console.log(`  Comment: ${comment}`);
  }

  return result;
}

export function createReleaseCommand(): Command {
  return new Command('release')
    .description('Release a claimed task')
    .argument('<taskId>', 'Task ID')
    .option('--comment <comment>', 'Comment explaining the release')
    .option('--author <name>', 'Author name')
    .action(function (this: Command, rawTaskId: string, opts: ReleaseCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const taskId = resolveId(services, rawTaskId);
        runRelease({
          services,
          taskId,
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
