// packages/hzl-cli/src/commands/task/move.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { resolveId } from '../../resolve-id.js';

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

  try {
    // Get original project before move
    const originalTask = services.taskService.getTaskById(taskId);
    if (!originalTask) {
      throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
    }
    const fromProject = originalTask.project;

    // Use service method which handles subtask cascade atomically
    const { task, subtaskCount } = services.taskService.moveWithSubtasks(taskId, toProject);

    const result: MoveResult = {
      task_id: taskId,
      from_project: fromProject,
      to_project: task.project,
      subtask_count: subtaskCount,
    };

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
  } catch (error) {
    if (error instanceof CLIError) throw error;
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        throw new CLIError(error.message, ExitCode.NotFound);
      }
      if (error.message.includes('does not exist')) {
        throw new CLIError(error.message, ExitCode.NotFound);
      }
    }
    throw error;
  }
}

export function createMoveCommand(): Command {
  return new Command('move')
    .description('Move a task to a different project')
    .argument('<taskId>', 'Task ID')
    .argument('<project>', 'Target project name')
    .action(function (this: Command, rawTaskId: string, project: string) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const taskId = resolveId(services, rawTaskId);
        runMove({ services, taskId, toProject: project, json: globalOpts.json ?? false });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
