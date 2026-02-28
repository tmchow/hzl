// packages/hzl-cli/src/commands/add.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { CLIError, ExitCode, handleError } from '../../errors.js';
import { TaskStatus } from 'hzl-core/events/types.js';
import { GlobalOptionsSchema } from '../../types.js';
import { resolveId } from '../../resolve-id.js';
import { parseIntegerWithDefault, parseTaskStatus } from '../../parse.js';

export interface AddResult {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
  tags: string[];
  parent_id: string | null;
}

export interface AddOptions {
  services: Services;
  project: string;
  title: string;
  description?: string;
  links?: string[];
  tags?: string[];
  priority?: number;
  dependsOn?: string[];
  parent?: string;
  status?: string;
  agent?: string;
  author?: string;
  comment?: string;
  json: boolean;
}

interface AddCommandOptions {
  project?: string;
  description?: string;
  links?: string;
  tags?: string;
  priority?: string;
  dependsOn?: string;
  parent?: string;
  status?: string;
  agent?: string;
  author?: string;
  comment?: string;
}

export function runAdd(options: AddOptions): AddResult {
  const { services, title, description, links, tags, priority, dependsOn, parent, status, agent, author, comment, json } = options;
  let project = options.project;

  // Validate status flag
  let initialStatus: TaskStatus | undefined;
  if (status) {
    const statusLower = status.toLowerCase();

    // Check for archived first - provide helpful message before generic validation
    if (statusLower === 'archived') {
      throw new CLIError('Cannot create task as archived. Use -s done, then archive separately.', ExitCode.InvalidInput);
    }

    // Note: --comment is optional but encouraged for blocked status
    initialStatus = parseTaskStatus(statusLower);
  }

  // Validate parent and inherit project
  if (parent) {
    const parentTask = services.taskService.getTaskById(parent);
    if (!parentTask) {
      throw new CLIError(`Parent task not found: ${parent}`, ExitCode.NotFound, undefined, undefined, ['hzl task list']);
    }
    if (parentTask.status === TaskStatus.Archived) {
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
    links,
    tags,
    priority,
    depends_on: dependsOn,
    parent_id: parent,
    agent: agent,
    initial_status: initialStatus,
    comment,
  }, {
    author,
  });

  const result: AddResult = {
    task_id: task.task_id,
    title: task.title,
    project: task.project,
    status: task.status,
    priority: task.priority,
    tags: task.tags,
    parent_id: task.parent_id ?? null,
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
    .option('-l, --links <links>', 'Comma-separated links (URLs or file paths)')
    .option('-t, --tags <tags>', 'Comma-separated tags')
    .option('-p, --priority <n>', 'Priority (0-3)', '0')
    .option('--depends-on <ids>', 'Comma-separated task IDs this depends on')
    .option('--parent <taskId>', 'Parent task ID (creates subtask, inherits project)')
    .option('-s, --status <status>', 'Initial status (backlog, ready, in_progress, blocked, done)')
    .option('--agent <name>', 'Agent identity for task ownership')
    .option('--author <name>', 'Who is performing this create/assignment action')
    .option('--comment <comment>', 'Comment explaining the status (recommended for blocked)')
    .action(function (this: Command, title: string, opts: AddCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const parent = opts.parent ? resolveId(services, opts.parent) : undefined;
        const dependsOn = opts.dependsOn?.split(',').map(id => resolveId(services, id.trim()));
        runAdd({
          services,
          project: opts.project ?? 'inbox',
          title,
          description: opts.description,
          links: opts.links?.split(','),
          tags: opts.tags?.split(','),
          priority: parseIntegerWithDefault(opts.priority, 'Priority', 0, { min: 0, max: 3 }),
          dependsOn,
          parent,
          status: opts.status,
          agent: opts.agent,
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
