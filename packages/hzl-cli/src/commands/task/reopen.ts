// packages/hzl-cli/src/commands/reopen.ts
import { Command } from 'commander';
import { resolveDbPath } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import { TaskStatus } from 'hzl-core/events/types.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface ReopenResult {
  task_id: string;
  title: string;
  status: string;
}

interface ReopenCommandOptions {
  status?: string;
  reason?: string;
  author?: string;
}

export function runReopen(options: {
  services: Services;
  taskId: string;
  toStatus?: TaskStatus.Ready | TaskStatus.Backlog;
  reason?: string;
  author?: string;
  json: boolean;
}): ReopenResult {
  const { services, taskId, toStatus, reason, author, json } = options;

  const task = services.taskService.reopenTask(taskId, { to_status: toStatus, reason, author });

  const result: ReopenResult = {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Reopened task ${task.task_id}: ${task.title}`);
    console.log(`  Status: ${task.status}`);
    if (reason) console.log(`  Reason: ${reason}`);
  }

  return result;
}

export function createReopenCommand(): Command {
  return new Command('reopen')
    .description('Reopen a done or archived task')
    .argument('<taskId>', 'Task ID')
    .option('-s, --status <status>', 'Target status (ready or backlog)', 'ready')
    .option('--reason <reason>', 'Reopen reason')
    .option('--author <name>', 'Author name')
    .action(function (this: Command, taskId: string, opts: ReopenCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        const toStatus = opts.status === 'backlog' ? TaskStatus.Backlog : TaskStatus.Ready;
        runReopen({
          services,
          taskId,
          toStatus,
          reason: opts.reason,
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
