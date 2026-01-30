// packages/hzl-cli/src/commands/release.ts
import { Command } from 'commander';
import { resolveDbPath } from '../config.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { handleError } from '../errors.js';
import type { GlobalOptions } from '../types.js';

export interface ReleaseResult {
  task_id: string;
  title: string;
  status: string;
  claimed_by_author: string | null;
}

export function runRelease(options: {
  services: Services;
  taskId: string;
  reason?: string;
  author?: string;
  json: boolean;
}): ReleaseResult {
  const { services, taskId, reason, author, json } = options;

  const task = services.taskService.releaseTask(taskId, { reason, author });

  const result: ReleaseResult = {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
    claimed_by_author: task.claimed_by_author,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Released task ${task.task_id}: ${task.title}`);
    if (reason) console.log(`  Reason: ${reason}`);
  }

  return result;
}

export function createReleaseCommand(): Command {
  return new Command('release')
    .description('Release a claimed task')
    .argument('<taskId>', 'Task ID')
    .option('--reason <reason>', 'Release reason')
    .option('--author <name>', 'Author name')
    .action(function (this: Command, taskId: string, opts: any) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        runRelease({
          services,
          taskId,
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
