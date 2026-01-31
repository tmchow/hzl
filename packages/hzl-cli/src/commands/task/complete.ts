// packages/hzl-cli/src/commands/complete.ts
import { Command } from 'commander';
import { resolveDbPath } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import type { GlobalOptions } from '../../types.js';

export interface CompleteResult {
  task_id: string;
  title: string;
  status: string;
}

export function runComplete(options: {
  services: Services;
  taskId: string;
  author?: string;
  json: boolean;
}): CompleteResult {
  const { services, taskId, author, json } = options;

  const task = services.taskService.completeTask(taskId, { author });

  const result: CompleteResult = {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Completed task ${task.task_id}: ${task.title}`);
  }

  return result;
}

export function createCompleteCommand(): Command {
  return new Command('complete')
    .description('Mark a task as done')
    .argument('<taskId>', 'Task ID')
    .option('--author <name>', 'Author name')
    .action(function (this: Command, taskId: string, opts: any) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        runComplete({
          services,
          taskId,
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
