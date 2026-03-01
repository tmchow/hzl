// packages/hzl-cli/src/commands/task/update.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import type { TaskUpdates } from 'hzl-core/services/task-service.js';
import { GlobalOptionsSchema } from '../../types.js';
import { resolveId } from '../../resolve-id.js';
import { parseInteger } from '../../parse.js';

export interface UpdateResult {
  task_id: string;
  title: string;
  description: string | null;
  links: string[];
  priority: number;
  tags: string[];
}

export type UpdateInput = TaskUpdates & { parent_id?: string | null };

interface UpdateCommandOptions {
  title?: string;
  desc?: string;
  links?: string;
  priority?: string;
  tags?: string;
  parent?: string;
  author?: string;
}

export function runUpdate(options: {
  services: Services;
  taskId: string;
  updates: UpdateInput;
  author?: string;
  json: boolean;
}): UpdateResult {
  const { services, taskId, author, json } = options;
  const { parent_id, ...taskUpdates } = options.updates;

  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }

  // Handle parent_id update via service layer
  if (parent_id !== undefined) {
    try {
      services.taskService.setParent(taskId, parent_id, { author });
    } catch (error) {
      if (error instanceof Error) {
        // Map service layer errors to appropriate exit codes
        if (error.message.includes('not found')) {
          throw new CLIError(error.message, ExitCode.NotFound);
        }
        throw new CLIError(error.message, ExitCode.InvalidInput);
      }
      throw error;
    }
  }

  services.taskService.updateTask(taskId, taskUpdates, { author });

  // Get updated task
  const updatedTask = services.taskService.getTaskById(taskId)!;

  const result: UpdateResult = {
    task_id: updatedTask.task_id,
    title: updatedTask.title,
    description: updatedTask.description,
    links: updatedTask.links,
    priority: updatedTask.priority,
    tags: updatedTask.tags,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Updated task ${taskId}`);
    if (taskUpdates.title) console.log(`  Title: ${updatedTask.title}`);
    if (taskUpdates.description) console.log(`  Description: ${updatedTask.description}`);
    if (taskUpdates.links) console.log(`  Links: ${updatedTask.links.join(', ')}`);
    if (taskUpdates.priority !== undefined) console.log(`  Priority: ${updatedTask.priority}`);
    if (taskUpdates.tags) console.log(`  Tags: ${updatedTask.tags.join(', ')}`);
  }

  return result;
}

export function createUpdateCommand(): Command {
  return new Command('update')
    .description('Update task fields')
    .argument('<taskId>', 'Task ID')
    .option('--title <title>', 'New title')
    .option('--desc <description>', 'New description')
    .option('-l, --links <links>', 'New links (comma-separated URLs or file paths)')
    .option('-p, --priority <n>', 'New priority (0-3)')
    .option('-t, --tags <tags>', 'New tags (comma-separated)')
    .option('--parent <taskId>', 'Set parent task (use "" to remove)')
    .option('--author <name>', 'Author name')
    .action(function (this: Command, rawTaskId: string, opts: UpdateCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const taskId = resolveId(services, rawTaskId);
        const updates: UpdateInput = {};
        if (opts.title) updates.title = opts.title;
        if (opts.desc !== undefined) {
          updates.description = opts.desc === '' ? null : opts.desc;
        }
        if (opts.links !== undefined) {
          updates.links = opts.links === '' ? [] : opts.links.split(',');
        }
        if (opts.priority !== undefined) {
          updates.priority = parseInteger(opts.priority, 'Priority', { min: 0, max: 3 });
        }
        if (opts.tags !== undefined) {
          updates.tags = opts.tags === '' ? [] : opts.tags.split(',');
        }
        if (opts.parent !== undefined) {
          updates.parent_id = opts.parent === '' ? null : resolveId(services, opts.parent);
        }

        runUpdate({ services, taskId, updates, author: opts.author, json: globalOpts.json ?? false });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
