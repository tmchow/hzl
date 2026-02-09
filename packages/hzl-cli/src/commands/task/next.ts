// packages/hzl-cli/src/commands/next.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { createShortId } from '../../short-id.js';

export interface NextResult {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
  parent_id: string | null;
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

  // Single optimized query for next available leaf task (replaces N+1 pattern)
  const task = services.taskService.getNextLeafTask({
    project,
    tagsAll: tags,
    parent,
  });

  if (!task) {
    if (json) {
      console.log(JSON.stringify(null));
    } else {
      console.log('No tasks available');
    }
    return null;
  }
  const result: NextResult = {
    task_id: task.task_id,
    title: task.title,
    project: task.project,
    status: task.status,
    priority: task.priority,
    parent_id: task.parent_id ?? null,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    const shortId = createShortId([task.task_id]);
    console.log(`Next task: [${shortId(task.task_id)}] ${task.title} (${task.project})`);
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
