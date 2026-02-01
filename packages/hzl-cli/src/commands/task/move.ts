// packages/hzl-cli/src/commands/task/move.ts
import { Command } from 'commander';
import { withWriteTransaction } from 'hzl-core/db/transaction.js';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface MoveResult {
  task_id: string;
  from_project: string;
  to_project: string;
  subtask_count?: number;
}

export function runMove(options: {
  services: Services;
  taskId: string;
  toProject: string;
  json: boolean;
}): MoveResult {
  const { services, taskId, toProject, json } = options;

  // Use transaction to ensure atomic cascade
  const result = withWriteTransaction(services.db, () => {
    const task = services.taskService.getTaskById(taskId);
    if (!task) {
      throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
    }

    const fromProject = task.project;
    let subtaskCount = 0;

    // Move parent
    const moved = services.taskService.moveTask(taskId, toProject);

    // Move all subtasks (only 1 level, no recursion needed)
    if (fromProject !== toProject) {
      const subtasks = services.taskService.getSubtasks(taskId);
      subtaskCount = subtasks.length;
      for (const subtask of subtasks) {
        services.taskService.moveTask(subtask.task_id, toProject);
      }
    }

    return {
      task_id: taskId,
      from_project: fromProject,
      to_project: moved.project,
      subtask_count: subtaskCount,
    };
  });

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    if (result.from_project === result.to_project) {
      console.log(`Task ${taskId} already in project '${result.to_project}'`);
    } else {
      if (result.subtask_count && result.subtask_count > 0) {
        console.log(`✓ Moved task ${taskId} and ${result.subtask_count} subtasks from '${result.from_project}' to '${result.to_project}'`);
      } else {
        console.log(`✓ Moved task ${taskId} from '${result.from_project}' to '${result.to_project}'`);
      }
    }
  }

  return result;
}

export function createMoveCommand(): Command {
  return new Command('move')
    .description('Move a task to a different project')
    .argument('<taskId>', 'Task ID')
    .argument('<project>', 'Target project name')
    .action(function (this: Command, taskId: string, project: string) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runMove({ services, taskId, toProject: project, json: globalOpts.json ?? false });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
