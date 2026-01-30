// packages/hzl-cli/src/commands/archive.ts
import { Command } from 'commander';
import { resolveDbPath } from '../config.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { handleError } from '../errors.js';
import type { GlobalOptions } from '../types.js';

export interface ArchiveResult {
  task_id: string;
  title: string;
  status: string;
}

export function runArchive(options: {
  services: Services;
  taskId: string;
  reason?: string;
  author?: string;
  json: boolean;
}): ArchiveResult {
  const { services, taskId, reason, author, json } = options;

  const task = services.taskService.archiveTask(taskId, { reason, author });

  const result: ArchiveResult = {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Archived task ${task.task_id}: ${task.title}`);
    if (reason) console.log(`  Reason: ${reason}`);
  }

  return result;
}

export function createArchiveCommand(): Command {
  return new Command('archive')
    .description('Archive a task')
    .argument('<taskId>', 'Task ID')
    .option('--reason <reason>', 'Archive reason')
    .option('--author <name>', 'Author name')
    .action(function (this: Command, taskId: string, opts: any) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        runArchive({
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
