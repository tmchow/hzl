// packages/hzl-cli/src/commands/task/progress.ts
import { Command, InvalidArgumentError } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { resolveId } from '../../resolve-id.js';

export interface ProgressResult {
  task_id: string;
  title: string;
  progress: number;
}

interface ProgressCommandOptions {
  author?: string;
}

function parseProgress(value: string): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 0 || parsed > 100) {
    throw new InvalidArgumentError('Progress must be an integer between 0 and 100');
  }
  return parsed;
}

export function runProgress(options: {
  services: Services;
  taskId: string;
  progress: number;
  author?: string;
  json: boolean;
}): ProgressResult {
  const { services, taskId, progress, author, json } = options;

  const task = services.taskService.setProgress(taskId, progress, { author });

  const result: ProgressResult = {
    task_id: task.task_id,
    title: task.title,
    progress: task.progress!,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Set progress on ${task.task_id}: ${task.title} → ${progress}%`);
  }

  return result;
}

export function createProgressCommand(): Command {
  return new Command('progress')
    .description('Set progress (0-100) on a task')
    .argument('<taskId>', 'Task ID')
    .argument('<value>', 'Progress value (0-100)', parseProgress)
    .option('--author <name>', 'Author name')
    .action(function (this: Command, rawTaskId: string, value: number, opts: ProgressCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const taskId = resolveId(services, rawTaskId);
        runProgress({
          services,
          taskId,
          progress: value,
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
