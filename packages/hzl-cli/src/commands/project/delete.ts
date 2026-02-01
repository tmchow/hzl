import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { CLIError, ExitCode, handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { EventType, PROJECT_EVENT_TASK_ID } from 'hzl-core/events/types.js';
import { withWriteTransaction } from 'hzl-core/db/transaction.js';

export interface ProjectDeleteResult {
  name: string;
  task_count: number;
  archived_task_count: number;
  action: 'none' | 'move' | 'archive' | 'delete';
}

export interface ProjectDeleteOptions {
  services: Services;
  name: string;
  moveTo?: string;
  archiveTasks?: boolean;
  deleteTasks?: boolean;
  json: boolean;
}

interface ProjectDeleteCommandOptions {
  moveTo?: string;
  archiveTasks?: boolean;
  deleteTasks?: boolean;
}

/**
 * Deletes tasks directly from projection tables without recording events.
 *
 * WARNING: This bypasses event sourcing. Tasks deleted this way:
 * - Will NOT have TaskDeleted events in the event log
 * - Will REAPPEAR if projections are rebuilt (hzl doctor --rebuild)
 * - Cannot be audited or traced
 *
 * This is a known trade-off for bulk deletion performance. A future
 * improvement would be to emit TaskDeleted events before deletion.
 */
function deleteTasksFromProjections(services: Services, taskIds: string[]): number {
  if (taskIds.length === 0) return 0;

  const placeholders = taskIds.map(() => '?').join(', ');

  services.cacheDb
    .prepare(
      `DELETE FROM task_dependencies WHERE task_id IN (${placeholders}) OR depends_on_id IN (${placeholders})`
    )
    .run(...taskIds, ...taskIds);
  services.cacheDb
    .prepare(`DELETE FROM task_tags WHERE task_id IN (${placeholders})`)
    .run(...taskIds);
  services.cacheDb
    .prepare(`DELETE FROM task_comments WHERE task_id IN (${placeholders})`)
    .run(...taskIds);
  services.cacheDb
    .prepare(`DELETE FROM task_checkpoints WHERE task_id IN (${placeholders})`)
    .run(...taskIds);
  services.cacheDb
    .prepare(`DELETE FROM task_search WHERE task_id IN (${placeholders})`)
    .run(...taskIds);
  services.cacheDb
    .prepare(`DELETE FROM tasks_current WHERE task_id IN (${placeholders})`)
    .run(...taskIds);

  return taskIds.length;
}

export function runProjectDelete(options: ProjectDeleteOptions): ProjectDeleteResult {
  const { services, name, moveTo, archiveTasks, deleteTasks, json } = options;

  const flagCount = [moveTo ? 1 : 0, archiveTasks ? 1 : 0, deleteTasks ? 1 : 0].reduce(
    (a, b) => a + b,
    0
  );
  if (flagCount > 1) {
    throw new CLIError(
      'Use only one of --move-to, --archive-tasks, or --delete-tasks',
      ExitCode.InvalidUsage
    );
  }

  const project = services.projectService.getProject(name);
  if (!project) {
    throw new CLIError(`Project not found: ${name}`, ExitCode.NotFound);
  }
  if (project.is_protected) {
    throw new CLIError(`Cannot delete protected project: ${name}`, ExitCode.InvalidUsage);
  }

  const taskRows = services.cacheDb
    .prepare('SELECT task_id, status, project FROM tasks_current WHERE project = ?')
    .all(name) as { task_id: string; status: string; project: string }[];

  const archivedCount = taskRows.filter((row) => row.status === 'archived').length;
  const activeCount = taskRows.length - archivedCount;

  if (taskRows.length > 0 && !moveTo && !archiveTasks && !deleteTasks) {
    throw new CLIError(
      `Project '${name}' has ${activeCount} active tasks and ${archivedCount} archived tasks. Use --move-to, --archive-tasks, or --delete-tasks.`,
      ExitCode.InvalidUsage
    );
  }

  // Validate target project exists before starting transaction
  if (moveTo) {
    services.projectService.requireProject(moveTo);
  }

  // Wrap all mutations in a single atomic transaction
  const result = withWriteTransaction(services.cacheDb, () => {
    if (moveTo) {
      // Move each task by appending TaskMoved events
      for (const row of taskRows) {
        if (row.project !== moveTo) {
          const event = services.eventStore.append({
            task_id: row.task_id,
            type: EventType.TaskMoved,
            data: { from_project: row.project, to_project: moveTo },
          });
          services.projectionEngine.applyEvent(event);
        }
      }
    } else if (archiveTasks) {
      // Archive each non-archived task by appending TaskArchived events
      for (const row of taskRows) {
        if (row.status !== 'archived') {
          const event = services.eventStore.append({
            task_id: row.task_id,
            type: EventType.TaskArchived,
            data: {},
          });
          services.projectionEngine.applyEvent(event);
        }
      }
      deleteTasksFromProjections(services, taskRows.map((row) => row.task_id));
    } else if (deleteTasks) {
      deleteTasksFromProjections(services, taskRows.map((row) => row.task_id));
    }

    const event = services.eventStore.append({
      task_id: PROJECT_EVENT_TASK_ID,
      type: EventType.ProjectDeleted,
      data: {
        name,
        task_count: activeCount,
        archived_task_count: archivedCount,
      },
    });
    services.projectionEngine.applyEvent(event);

    const action: ProjectDeleteResult['action'] = moveTo
      ? 'move'
      : archiveTasks
        ? 'archive'
        : deleteTasks
          ? 'delete'
          : 'none';

    return {
      name,
      task_count: activeCount,
      archived_task_count: archivedCount,
      action,
    };
  });

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Deleted project ${name}`);
  }

  return result;
}

export function createProjectDeleteCommand(): Command {
  return new Command('delete')
    .description('Delete a project')
    .argument('<name>', 'Project name')
    .option('--move-to <project>', 'Move tasks to target project')
    .option('--archive-tasks', 'Archive tasks before deleting project')
    .option('--delete-tasks', 'Delete tasks before deleting project')
    .action(function (
      this: Command,
      name: string,
      opts: ProjectDeleteCommandOptions
    ) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runProjectDelete({
          services,
          name,
          moveTo: opts.moveTo,
          archiveTasks: opts.archiveTasks,
          deleteTasks: opts.deleteTasks,
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
