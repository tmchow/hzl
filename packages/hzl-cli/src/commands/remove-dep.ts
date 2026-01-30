// packages/hzl-cli/src/commands/remove-dep.ts
import { Command } from 'commander';
import { resolveDbPath } from '../config.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { handleError, CLIError, ExitCode } from '../errors.js';
import { EventType } from 'hzl-core/events/types.js';
import type { GlobalOptions } from '../types.js';

export interface RemoveDepResult {
  task_id: string;
  depends_on_id: string;
  removed: boolean;
}

export function runRemoveDep(options: {
  services: Services;
  taskId: string;
  dependsOnId: string;
  json: boolean;
}): RemoveDepResult {
  const { services, taskId, dependsOnId, json } = options;
  const { eventStore, projectionEngine } = services;

  // Check task exists
  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }

  // Remove the dependency via event (idempotent)
  const event = eventStore.append({
    task_id: taskId,
    type: EventType.DependencyRemoved,
    data: { depends_on_id: dependsOnId },
  });
  projectionEngine.applyEvent(event);

  const result: RemoveDepResult = {
    task_id: taskId,
    depends_on_id: dependsOnId,
    removed: true,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Removed dependency: ${taskId} → ${dependsOnId}`);
  }

  return result;
}

export function createRemoveDepCommand(): Command {
  return new Command('remove-dep')
    .description('Remove a dependency between tasks')
    .argument('<taskId>', 'Task ID that has the dependency')
    .argument('<dependsOnId>', 'Task ID to remove as dependency')
    .action(function (this: Command, taskId: string, dependsOnId: string) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        runRemoveDep({ services, taskId, dependsOnId, json: globalOpts.json ?? false });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
