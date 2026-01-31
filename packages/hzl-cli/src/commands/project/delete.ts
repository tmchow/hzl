import { Command } from 'commander';
import { resolveDbPath } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { CLIError, ExitCode, handleError } from '../../errors.js';
import type { GlobalOptions } from '../../types.js';
import { EventType, PROJECT_EVENT_TASK_ID } from 'hzl-core/events/types.js';

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

function deleteTasksFromProjections(services: Services, taskIds: string[]): number {
  if (taskIds.length === 0) return 0;

  const placeholders = taskIds.map(() => '?').join(', ');

  services.db
    .prepare(
      `DELETE FROM task_dependencies WHERE task_id IN (${placeholders}) OR depends_on_id IN (${placeholders})`
    )
    .run(...taskIds, ...taskIds);
  services.db
    .prepare(`DELETE FROM task_tags WHERE task_id IN (${placeholders})`)
    .run(...taskIds);
  services.db
    .prepare(`DELETE FROM task_comments WHERE task_id IN (${placeholders})`)
    .run(...taskIds);
  services.db
    .prepare(`DELETE FROM task_checkpoints WHERE task_id IN (${placeholders})`)
    .run(...taskIds);
  services.db
    .prepare(`DELETE FROM task_search WHERE task_id IN (${placeholders})`)
    .run(...taskIds);
  services.db
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

  const taskRows = services.db
    .prepare('SELECT task_id, status FROM tasks_current WHERE project = ?')
    .all(name) as { task_id: string; status: string }[];

  const archivedCount = taskRows.filter((row) => row.status === 'archived').length;
  const activeCount = taskRows.length - archivedCount;

  if (taskRows.length > 0 && !moveTo && !archiveTasks && !deleteTasks) {
    throw new CLIError(
      `Project '${name}' has ${activeCount} active tasks and ${archivedCount} archived tasks. Use --move-to, --archive-tasks, or --delete-tasks.`,
      ExitCode.InvalidUsage
    );
  }

  if (moveTo) {
    services.projectService.requireProject(moveTo);
    for (const row of taskRows) {
      services.taskService.moveTask(row.task_id, moveTo);
    }
  } else if (archiveTasks) {
    for (const row of taskRows) {
      if (row.status !== 'archived') {
        services.taskService.archiveTask(row.task_id);
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

  const result: ProjectDeleteResult = {
    name,
    task_count: activeCount,
    archived_task_count: archivedCount,
    action: moveTo ? 'move' : archiveTasks ? 'archive' : deleteTasks ? 'delete' : 'none',
  };

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
    .action(function (this: Command, name: string, opts: any) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
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
