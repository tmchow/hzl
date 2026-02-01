// packages/hzl-cli/src/commands/task/archive.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface ArchiveResult {
  task_id: string;
  title: string;
  status: string;
}

interface ArchiveCommandOptions {
  reason?: string;
  author?: string;
  cascade?: boolean;
  orphan?: boolean;
}

export function runArchive(options: {
  services: Services;
  taskId: string;
  reason?: string;
  author?: string;
  cascade?: boolean;
  orphan?: boolean;
  json: boolean;
}): ArchiveResult {
  const { services, taskId, reason, author, cascade, orphan, json } = options;

  try {
    // Use service method which handles validation and transaction atomically
    const { task, archivedSubtaskCount, orphanedSubtaskCount } =
      services.taskService.archiveWithSubtasks(taskId, {
        cascade,
        orphan,
        reason,
        author,
      });

    const result: ArchiveResult = {
      task_id: task.task_id,
      title: task.title,
      status: task.status,
    };

    if (json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`✓ Archived task ${result.task_id}: ${result.title}`);
      if (archivedSubtaskCount > 0) {
        console.log(`  Also archived ${archivedSubtaskCount} subtask(s)`);
      } else if (orphanedSubtaskCount > 0) {
        console.log(`  Promoted ${orphanedSubtaskCount} subtask(s) to top-level`);
      }
      if (reason) console.log(`  Reason: ${reason}`);
    }

    return result;
  } catch (error) {
    if (error instanceof Error) {
      // Map service layer errors to CLI errors with appropriate exit codes
      if (error.message.includes('not found')) {
        throw new CLIError(error.message, ExitCode.NotFound);
      }
      if (error.message.includes('Cannot') || error.message.includes('already archived')) {
        throw new CLIError(error.message, ExitCode.InvalidInput);
      }
    }
    throw error;
  }
}

export function createArchiveCommand(): Command {
  return new Command('archive')
    .description('Archive a task')
    .argument('<taskId>', 'Task ID')
    .option('--reason <reason>', 'Archive reason')
    .option('--author <name>', 'Author name')
    .option('--cascade', 'Archive all subtasks (if task has children)', false)
    .option('--orphan', 'Promote subtasks to top-level (if task has children)', false)
    .action(function (this: Command, taskId: string, opts: ArchiveCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runArchive({
          services,
          taskId,
          reason: opts.reason,
          author: opts.author,
          cascade: opts.cascade,
          orphan: opts.orphan,
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
