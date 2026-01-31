// packages/hzl-cli/src/commands/checkpoint.ts
import { Command } from 'commander';
import { resolveDbPath } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import type { GlobalOptions } from '../../types.js';

export interface CheckpointResult {
  task_id: string;
  name: string;
  data: Record<string, unknown>;
}

export function runCheckpoint(options: {
  services: Services;
  taskId: string;
  name: string;
  data?: Record<string, unknown>;
  author?: string;
  json: boolean;
}): CheckpointResult {
  const { services, taskId, name, data, author, json } = options;

  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }

  services.taskService.addCheckpoint(taskId, name, data, { author });

  const result: CheckpointResult = {
    task_id: taskId,
    name,
    data: data ?? {},
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Added checkpoint "${name}" to task ${taskId}`);
  }

  return result;
}

export function createCheckpointCommand(): Command {
  return new Command('checkpoint')
    .description('Record a checkpoint for a task')
    .argument('<taskId>', 'Task ID')
    .argument('<name>', 'Checkpoint name')
    .option('--data <json>', 'Checkpoint data as JSON')
    .option('--author <name>', 'Author name')
    .action(function (this: Command, taskId: string, name: string, opts: any) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        let data: Record<string, unknown> | undefined;
        if (opts.data) {
          try {
            data = JSON.parse(opts.data);
          } catch {
            throw new CLIError('Invalid JSON for --data', ExitCode.InvalidInput);
          }
        }
        runCheckpoint({
          services,
          taskId,
          name,
          data,
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
