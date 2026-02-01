// packages/hzl-cli/src/commands/next.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface NextResult {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
}

export interface NextOptions {
  services: Services;
  project?: string;
  tags?: string[];
  parent?: string;
  json: boolean;
}

interface NextCommandOptions {
  project?: string;
  tags?: string;
  parent?: string;
}

export function runNext(options: NextOptions): NextResult | null {
  const { services, project, tags, parent, json } = options;

  // Validate parent exists if specified
  if (parent) {
    const parentTask = services.taskService.getTaskById(parent);
    if (!parentTask) {
      throw new CLIError(`Parent task not found: ${parent}`, ExitCode.NotFound);
    }
  }

  // Get available tasks using the service's getAvailableTasks method
  const availableTasks = services.taskService.getAvailableTasks({
    project,
    tagsAll: tags,
    limit: 100, // Get more to filter for leaf tasks
  });

  // Filter to leaf tasks only (tasks without children)
  // If parent filter is specified, also filter to that parent
  const leafTasks = availableTasks.filter((task) => {
    // Check if this task has children
    const subtasks = services.taskService.getSubtasks(task.task_id);
    if (subtasks.length > 0) {
      return false; // Skip parent tasks
    }

    // If parent filter specified, only return subtasks of that parent
    if (parent) {
      const fullTask = services.taskService.getTaskById(task.task_id);
      if (fullTask?.parent_id !== parent) {
        return false;
      }
    }

    return true;
  });

  if (leafTasks.length === 0) {
    if (json) {
      console.log(JSON.stringify(null));
    } else {
      console.log('No tasks available');
    }
    return null;
  }

  const task = leafTasks[0];
  const result: NextResult = {
    task_id: task.task_id,
    title: task.title,
    project: task.project,
    status: task.status,
    priority: task.priority,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`Next task: [${task.task_id.slice(0, 8)}] ${task.title} (${task.project})`);
  }

  return result;
}

export function createNextCommand(): Command {
  return new Command('next')
    .description('Get the next available task')
    .option('-p, --project <project>', 'Filter by project')
    .option('-t, --tags <tags>', 'Required tags (comma-separated)')
    .option('--parent <taskId>', 'Get next subtask of specific parent')
    .action(function (this: Command, opts: NextCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runNext({
          services,
          project: opts.project,
          tags: opts.tags?.split(','),
          parent: opts.parent,
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
