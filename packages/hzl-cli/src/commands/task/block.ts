// packages/hzl-cli/src/commands/task/block.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { CLIError, ExitCode, handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { resolveId } from '../../resolve-id.js';
import { TaskStatus } from 'hzl-core/events/types.js';

export interface BlockResult {
  task_id: string;
  title: string;
  status: string;
  agent: string | null;
}

interface BlockCommandOptions {
  comment?: string;
  author?: string;
}

function suggestionsForBlock(taskId: string, status: TaskStatus): string[] {
  switch (status) {
    case TaskStatus.Backlog:
      return [
        `hzl task set-status ${taskId} ready`,
        `hzl task claim ${taskId} --agent <name>`,
      ];
    case TaskStatus.Ready:
      return [`hzl task claim ${taskId} --agent <name>`];
    case TaskStatus.Done:
    case TaskStatus.Archived:
      return [
        `hzl task reopen ${taskId} --status ready`,
        `hzl task claim ${taskId} --agent <name>`,
      ];
    default:
      return [`hzl task show ${taskId}`];
  }
}

export function runBlock(options: {
  services: Services;
  taskId: string;
  comment?: string;
  author?: string;
  json: boolean;
}): BlockResult {
  const { services, taskId, comment, author, json } = options;

  // Check task status before blocking to provide actionable error
  const existingTask = services.taskService.getTaskById(taskId);
  if (existingTask && existingTask.status !== TaskStatus.InProgress && existingTask.status !== TaskStatus.Blocked) {
    throw new CLIError(
      `Cannot block task ${taskId} (status: ${existingTask.status})`,
      ExitCode.InvalidInput,
      undefined,
      undefined,
      suggestionsForBlock(taskId, existingTask.status)
    );
  }

  const task = services.taskService.blockTask(taskId, { comment, author });

  const result: BlockResult = {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
    agent: task.agent,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`⏸ Blocked task ${task.task_id}: ${task.title}`);
    if (comment) console.log(`  Comment: ${comment}`);
  }

  return result;
}

export function createBlockCommand(): Command {
  return new Command('block')
    .description('Block a task that is stuck waiting for external dependencies')
    .argument('<taskId>', 'Task ID')
    .option('--comment <comment>', 'Comment explaining why task is blocked')
    .option('--author <name>', 'Author name')
    .action(function (this: Command, rawTaskId: string, opts: BlockCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const taskId = resolveId(services, rawTaskId);
        runBlock({
          services,
          taskId,
          comment: opts.comment,
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
