// packages/hzl-cli/src/commands/add-dep.ts
import type Database from 'libsql';
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import { EventType } from 'hzl-core/events/types.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface AddDepResult {
  task_id: string;
  depends_on_id: string;
  added: boolean;
}

/**
 * Check if adding taskId -> dependsOnId would create a cycle.
 * A cycle would occur if dependsOnId (or any of its dependencies) already depends on taskId.
 */
function wouldCreateCycle(db: Database.Database, taskId: string, dependsOnId: string): boolean {
  // Check if dependsOnId can reach taskId through its dependencies
  const visited = new Set<string>();
  const queue = [dependsOnId];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    
    // Get dependencies of current task
    const deps = db.prepare('SELECT depends_on_id FROM task_dependencies WHERE task_id = ?').all(current) as { depends_on_id: string }[];
    for (const dep of deps) {
      queue.push(dep.depends_on_id);
    }
  }
  
  return false;
}

export function runAddDep(options: {
  services: Services;
  taskId: string;
  dependsOnId: string;
  json: boolean;
}): AddDepResult {
  const { services, taskId, dependsOnId, json } = options;
  const { cacheDb, eventStore, projectionEngine } = services;

  // Check both tasks exist
  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }
  const depTask = services.taskService.getTaskById(dependsOnId);
  if (!depTask) {
    throw new CLIError(`Dependency task not found: ${dependsOnId}`, ExitCode.NotFound);
  }

  // Check for cycles - would adding taskId -> dependsOnId create a cycle?
  if (wouldCreateCycle(cacheDb, taskId, dependsOnId)) {
    throw new CLIError(`Adding this dependency would create a cycle`, ExitCode.InvalidInput);
  }

  // Add the dependency via event
  const event = eventStore.append({
    task_id: taskId,
    type: EventType.DependencyAdded,
    data: { depends_on_id: dependsOnId },
  });
  projectionEngine.applyEvent(event);

  const result: AddDepResult = {
    task_id: taskId,
    depends_on_id: dependsOnId,
    added: true,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Added dependency: ${taskId} → ${dependsOnId}`);
  }

  return result;
}

export function createAddDepCommand(): Command {
  return new Command('add-dep')
    .description('Add a dependency between tasks')
    .argument('<taskId>', 'Task ID that will depend on the other')
    .argument('<dependsOnId>', 'Task ID that must be completed first')
    .action(function (this: Command, taskId: string, dependsOnId: string) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runAddDep({ services, taskId, dependsOnId, json: globalOpts.json ?? false });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
