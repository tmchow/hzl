// packages/hzl-cli/src/commands/checkpoint.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { resolveId } from '../../resolve-id.js';

export interface CheckpointResult {
  task_id: string;
  name: string;
  data: Record<string, unknown>;
  progress?: number;
}

interface CheckpointCommandOptions {
  data?: string;
  progress?: string;
  author?: string;
}

export function runCheckpoint(options: {
  services: Services;
  taskId: string;
  name: string;
  data?: Record<string, unknown>;
  progress?: number;
  author?: string;
  json: boolean;
}): CheckpointResult {
  const { services, taskId, name, data, progress, author, json } = options;

  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }

  services.taskService.addCheckpoint(taskId, name, data, { progress, author });

  const result: CheckpointResult = {
    task_id: taskId,
    name,
    data: data ?? {},
  };
  if (progress !== undefined) {
    result.progress = progress;
  }

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    let msg = `✓ Added checkpoint "${name}" to task ${taskId}`;
    if (progress !== undefined) {
      msg += ` (progress: ${progress}%)`;
    }
    console.log(msg);
  }

  return result;
}

export function createCheckpointCommand(): Command {
  return new Command('checkpoint')
    .description('Record a checkpoint for a task')
    .argument('<taskId>', 'Task ID')
    .argument('<name>', 'Checkpoint name')
    .option('--data <json>', 'Checkpoint data as JSON')
    .option('--progress <value>', 'Set progress (0-100)')
    .option('--author <name>', 'Author name')
    .action(function (
      this: Command,
      rawTaskId: string,
      name: string,
      opts: CheckpointCommandOptions
    ) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const taskId = resolveId(services, rawTaskId);
        let data: Record<string, unknown> | undefined;
        if (opts.data) {
          try {
            data = JSON.parse(opts.data) as Record<string, unknown>;
          } catch {
            throw new CLIError('Invalid JSON for --data', ExitCode.InvalidInput);
          }
        }

        let progress: number | undefined;
        if (opts.progress !== undefined) {
          progress = parseInt(opts.progress, 10);
          if (isNaN(progress) || progress < 0 || progress > 100) {
            throw new CLIError('Progress must be an integer between 0 and 100', ExitCode.InvalidInput);
          }
        }

        runCheckpoint({
          services,
          taskId,
          name,
          data,
          progress,
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
