// packages/hzl-cli/src/commands/add.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { CLIError, ExitCode, handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface AddResult {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
  tags: string[];
}

export interface AddOptions {
  services: Services;
  project: string;
  title: string;
  description?: string;
  tags?: string[];
  priority?: number;
  dependsOn?: string[];
  parent?: string;
  json: boolean;
}

interface AddCommandOptions {
  project?: string;
  description?: string;
  tags?: string;
  priority?: string;
  dependsOn?: string;
  parent?: string;
}

export function runAdd(options: AddOptions): AddResult {
  const { services, title, description, tags, priority, dependsOn, parent, json } = options;
  let project = options.project;

  // Validate parent and inherit project
  if (parent) {
    const parentTask = services.taskService.getTaskById(parent);
    if (!parentTask) {
      throw new CLIError(`Parent task not found: ${parent}`, ExitCode.NotFound);
    }
    if (parentTask.status === 'archived') {
      throw new CLIError(`Cannot create subtask of archived parent: ${parent}`, ExitCode.InvalidInput);
    }
    if (parentTask.parent_id) {
      throw new CLIError(
        'Cannot create subtask of a subtask (max 1 level of nesting)',
        ExitCode.InvalidInput
      );
    }
    // Always inherit project from parent
    project = parentTask.project;
  }

  const task = services.taskService.createTask({
    title,
    project,
    description,
    tags,
    priority,
    depends_on: dependsOn,
    parent_id: parent,
  });

  const result: AddResult = {
    task_id: task.task_id,
    title: task.title,
    project: task.project,
    status: task.status,
    priority: task.priority,
    tags: task.tags,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Created task ${task.task_id}: ${task.title}`);
  }

  return result;
}

export function createAddCommand(): Command {
  return new Command('add')
    .description('Create a new task')
    .argument('<title>', 'Task title')
    .option('-P, --project <project>', 'Project name', 'inbox')
    .option('-d, --description <desc>', 'Task description')
    .option('-t, --tags <tags>', 'Comma-separated tags')
    .option('-p, --priority <n>', 'Priority (0-3)', '0')
    .option('--depends-on <ids>', 'Comma-separated task IDs this depends on')
    .option('--parent <taskId>', 'Parent task ID (creates subtask, inherits project)')
    .action(function (this: Command, title: string, opts: AddCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runAdd({
          services,
          project: opts.project ?? 'inbox',
          title,
          description: opts.description,
          tags: opts.tags?.split(','),
          priority: parseInt(opts.priority ?? '0', 10),
          dependsOn: opts.dependsOn?.split(','),
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
