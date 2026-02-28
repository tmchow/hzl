// packages/hzl-cli/src/commands/complete.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { CLIError, ExitCode, handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { resolveId } from '../../resolve-id.js';
import { TaskStatus } from 'hzl-core/events/types.js';

export interface CompleteResult {
  task_id: string;
  title: string;
  status: string;
}

interface CompleteCommandOptions {
  author?: string;
  comment?: string;
}

export function runComplete(options: {
  services: Services;
  taskId: string;
  author?: string;
  comment?: string;
  json: boolean;
}): CompleteResult {
  const { services, taskId, author, comment, json } = options;

  // Check task status before completing to provide actionable error
  const existingTask = services.taskService.getTaskById(taskId);
  if (existingTask && existingTask.status !== TaskStatus.InProgress && existingTask.status !== TaskStatus.Blocked) {
    throw new CLIError(
      `Cannot complete task ${taskId} (status: ${existingTask.status})`,
      ExitCode.InvalidInput,
      undefined,
      undefined,
      [`hzl task claim ${taskId} --agent <name>`]
    );
  }

  const task = services.taskService.completeTask(taskId, { author, comment });

  const result: CompleteResult = {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Completed task ${task.task_id}: ${task.title}`);
    if (comment) {
      console.log(`  Comment: ${comment}`);
    }
  }

  return result;
}

export function createCompleteCommand(): Command {
  return new Command('complete')
    .description('Mark a task as done')
    .argument('<taskId>', 'Task ID')
    .option('--author <name>', 'Author name')
    .option('--comment <comment>', 'Optional completion note')
    .action(function (this: Command, rawTaskId: string, opts: CompleteCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const taskId = resolveId(services, rawTaskId);
        runComplete({
          services,
          taskId,
          author: opts.author,
          comment: opts.comment,
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
