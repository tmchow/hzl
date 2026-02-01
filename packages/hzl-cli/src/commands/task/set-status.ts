// packages/hzl-cli/src/commands/set-status.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import { TaskStatus } from 'hzl-core/events/types.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface SetStatusResult {
  task_id: string;
  title: string;
  status: string;
  previous_status: string;
}

const validStatuses = Object.values(TaskStatus);

interface SetStatusCommandOptions {
  author?: string;
}

export function runSetStatus(options: {
  services: Services;
  taskId: string;
  status: TaskStatus;
  author?: string;
  json: boolean;
}): SetStatusResult {
  const { services, taskId, status, author, json } = options;

  const existingTask = services.taskService.getTaskById(taskId);
  if (!existingTask) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }

  const previousStatus = existingTask.status;
  const task = services.taskService.setStatus(taskId, status, { author });

  const result: SetStatusResult = {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
    previous_status: previousStatus,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Changed task ${task.task_id} status: ${previousStatus} → ${task.status}`);
  }

  return result;
}

export function createSetStatusCommand(): Command {
  return new Command('set-status')
    .description('Change task status')
    .argument('<taskId>', 'Task ID')
    .argument('<status>', `New status (${validStatuses.join(', ')})`)
    .option('--author <name>', 'Author name')
    .action(function (
      this: Command,
      taskId: string,
      status: string,
      opts: SetStatusCommandOptions
    ) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        if (!validStatuses.includes(status as TaskStatus)) {
          throw new CLIError(`Invalid status: ${status}. Valid: ${validStatuses.join(', ')}`, ExitCode.InvalidInput);
        }
        runSetStatus({
          services,
          taskId,
          status: status as TaskStatus,
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
