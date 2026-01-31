// packages/hzl-cli/src/commands/move.ts
import { Command } from 'commander';
import { resolveDbPath } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface MoveResult {
  task_id: string;
  from_project: string;
  to_project: string;
}

export function runMove(options: {
  services: Services;
  taskId: string;
  toProject: string;
  json: boolean;
}): MoveResult {
  const { services, taskId, toProject, json } = options;
  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }

  const fromProject = task.project;

  const moved = services.taskService.moveTask(taskId, toProject);

  const result: MoveResult = {
    task_id: taskId,
    from_project: fromProject,
    to_project: moved.project,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    if (fromProject === toProject) {
      console.log(`Task ${taskId} already in project '${toProject}'`);
    } else {
      console.log(`✓ Moved task ${taskId} from '${fromProject}' to '${toProject}'`);
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
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        runMove({ services, taskId, toProject: project, json: globalOpts.json ?? false });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
