// packages/hzl-cli/src/commands/task/update.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import { EventType } from 'hzl-core/events/types.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface UpdateResult {
  task_id: string;
  title: string;
  description: string | null;
  links: string[];
  priority: number;
  tags: string[];
}

export interface TaskUpdates {
  title?: string;
  description?: string | null;
  links?: string[];
  priority?: number;
  tags?: string[];
  parent_id?: string | null;
}

interface UpdateCommandOptions {
  title?: string;
  desc?: string;
  links?: string;
  priority?: string;
  tags?: string;
  parent?: string;
}

export function runUpdate(options: {
  services: Services;
  taskId: string;
  updates: TaskUpdates;
  json: boolean;
}): UpdateResult {
  const { services, taskId, updates, json } = options;
  const { eventStore, projectionEngine } = services;

  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }

  // Handle parent_id update via service layer
  if (updates.parent_id !== undefined) {
    try {
      services.taskService.setParent(taskId, updates.parent_id);
    } catch (error) {
      if (error instanceof Error) {
        // Map service layer errors to appropriate exit codes
        if (error.message.includes('not found')) {
          throw new CLIError(error.message, ExitCode.NotFound);
        }
        throw new CLIError(error.message, ExitCode.InvalidInput);
      }
      throw error;
    }
  }

  // Emit one task_updated event per field change
  // The TaskUpdatedSchema requires: field, old_value (optional), new_value
  if (updates.title !== undefined && updates.title !== task.title) {
    const event = eventStore.append({
      task_id: taskId,
      type: EventType.TaskUpdated,
      data: { field: 'title', old_value: task.title, new_value: updates.title },
    });
    projectionEngine.applyEvent(event);
  }

  if (updates.description !== undefined && updates.description !== task.description) {
    const event = eventStore.append({
      task_id: taskId,
      type: EventType.TaskUpdated,
      data: { field: 'description', old_value: task.description, new_value: updates.description },
    });
    projectionEngine.applyEvent(event);
  }

  if (updates.priority !== undefined && updates.priority !== task.priority) {
    const event = eventStore.append({
      task_id: taskId,
      type: EventType.TaskUpdated,
      data: { field: 'priority', old_value: task.priority, new_value: updates.priority },
    });
    projectionEngine.applyEvent(event);
  }

  if (updates.tags !== undefined) {
    const event = eventStore.append({
      task_id: taskId,
      type: EventType.TaskUpdated,
      data: { field: 'tags', old_value: task.tags, new_value: updates.tags },
    });
    projectionEngine.applyEvent(event);
  }

  if (updates.links !== undefined) {
    const event = eventStore.append({
      task_id: taskId,
      type: EventType.TaskUpdated,
      data: { field: 'links', old_value: task.links, new_value: updates.links },
    });
    projectionEngine.applyEvent(event);
  }

  // Get updated task
  const updatedTask = services.taskService.getTaskById(taskId)!;

  const result: UpdateResult = {
    task_id: updatedTask.task_id,
    title: updatedTask.title,
    description: updatedTask.description,
    links: updatedTask.links,
    priority: updatedTask.priority,
    tags: updatedTask.tags,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Updated task ${taskId}`);
    if (updates.title) console.log(`  Title: ${updatedTask.title}`);
    if (updates.description) console.log(`  Description: ${updatedTask.description}`);
    if (updates.links) console.log(`  Links: ${updatedTask.links.join(', ')}`);
    if (updates.priority !== undefined) console.log(`  Priority: ${updatedTask.priority}`);
    if (updates.tags) console.log(`  Tags: ${updatedTask.tags.join(', ')}`);
  }

  return result;
}

export function createUpdateCommand(): Command {
  return new Command('update')
    .description('Update task fields')
    .argument('<taskId>', 'Task ID')
    .option('--title <title>', 'New title')
    .option('--desc <description>', 'New description')
    .option('-l, --links <links>', 'New links (comma-separated URLs or file paths)')
    .option('-p, --priority <n>', 'New priority (0-3)')
    .option('-t, --tags <tags>', 'New tags (comma-separated)')
    .option('--parent <taskId>', 'Set parent task (use "" to remove)')
    .action(function (this: Command, taskId: string, opts: UpdateCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const updates: TaskUpdates = {};
        if (opts.title) updates.title = opts.title;
        if (opts.desc !== undefined) {
          updates.description = opts.desc === '' ? null : opts.desc;
        }
        if (opts.links !== undefined) {
          updates.links = opts.links === '' ? [] : opts.links.split(',');
        }
        if (opts.priority !== undefined) updates.priority = parseInt(opts.priority, 10);
        if (opts.tags !== undefined) {
          updates.tags = opts.tags === '' ? [] : opts.tags.split(',');
        }
        if (opts.parent !== undefined) {
          updates.parent_id = opts.parent === '' ? null : opts.parent;
        }

        runUpdate({ services, taskId, updates, json: globalOpts.json ?? false });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
