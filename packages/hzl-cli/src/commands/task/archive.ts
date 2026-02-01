// packages/hzl-cli/src/commands/task/archive.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { TaskStatus } from 'hzl-core/events/types.js';
import { EventType } from 'hzl-core/events/types.js';

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

  // Validate that only one of cascade/orphan is used
  if (cascade && orphan) {
    throw new CLIError(
      'Cannot use both --cascade and --orphan flags. Choose one.',
      ExitCode.InvalidInput
    );
  }

  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }

  // Check for active subtasks (non-archived, non-done)
  const subtasks = services.taskService.getSubtasks(taskId);
  const activeSubtasks = subtasks.filter(
    st => st.status !== TaskStatus.Archived && st.status !== TaskStatus.Done
  );

  if (activeSubtasks.length > 0 && !cascade && !orphan) {
    throw new CLIError(
      `Cannot archive task with ${activeSubtasks.length} active subtask(s). ` +
      `Use --cascade to archive all subtasks, or --orphan to promote subtasks to top-level.`,
      ExitCode.InvalidInput
    );
  }

  // Handle cascade: archive active subtasks (done/archived ones don't need archiving)
  if (cascade) {
    for (const subtask of activeSubtasks) {
      services.taskService.archiveTask(subtask.task_id, { reason, author });
    }
  }

  // Handle orphan: remove parent_id from subtasks
  if (orphan) {
    const { eventStore, projectionEngine } = services;
    for (const subtask of subtasks) {
      const event = eventStore.append({
        task_id: subtask.task_id,
        type: EventType.TaskUpdated,
        data: { field: 'parent_id', old_value: taskId, new_value: null },
      });
      projectionEngine.applyEvent(event);
    }
  }

  // Archive the parent task
  const archivedTask = services.taskService.archiveTask(taskId, { reason, author });

  const result: ArchiveResult = {
    task_id: archivedTask.task_id,
    title: archivedTask.title,
    status: archivedTask.status,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Archived task ${archivedTask.task_id}: ${archivedTask.title}`);
    if (cascade && activeSubtasks.length > 0) {
      console.log(`  Also archived ${activeSubtasks.length} subtask(s)`);
    } else if (orphan) {
      console.log(`  Promoted ${subtasks.length} subtask(s) to top-level`);
    }
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
