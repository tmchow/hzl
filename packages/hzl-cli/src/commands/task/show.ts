// packages/hzl-cli/src/commands/show.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { CLIError, ExitCode, handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { resolveId } from '../../resolve-id.js';
import { createShortId } from '../../short-id.js';
import { TaskStatus } from 'hzl-core/events/types.js';
import type { Task, Comment, Checkpoint } from 'hzl-core/services/task-service.js';

export type SubtaskSummary = { task_id: string; title: string; status: string };
export type DeepSubtask = Task & { blocked_by: string[] };

export interface ShowResult {
  task: Task;
  comments: Array<{ text: string; author?: string; timestamp: string }>;
  checkpoints: Array<{ name: string; data: Record<string, unknown>; timestamp: string }>;
  subtasks?: Array<SubtaskSummary> | Array<DeepSubtask>;
}

export function runShow(options: {
  services: Services;
  taskId: string;
  showSubtasks?: boolean;
  deep?: boolean;
  json: boolean;
}): ShowResult {
  const { services, taskId, showSubtasks = true, deep = false, json } = options;

  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }

  const comments = services.taskService.getComments(taskId);
  const checkpoints = services.taskService.getCheckpoints(taskId);

  let subtasks: Array<SubtaskSummary> | Array<DeepSubtask> | undefined;
  if (!showSubtasks) {
    subtasks = undefined;
  } else if (deep) {
    const rawSubtasks = services.taskService.getSubtasks(taskId);
    const blockedByMap = services.taskService.getBlockedByForTasks(
      rawSubtasks.map(t => t.task_id),
    );
    subtasks = rawSubtasks.map(t => ({
      ...t,
      blocked_by: blockedByMap.get(t.task_id) ?? [],
    }));
  } else {
    subtasks = services.taskService.getSubtasks(taskId).map(t => ({
      task_id: t.task_id,
      title: t.title,
      status: t.status,
    }));
  }

  const result: ShowResult = {
    task,
    comments: comments.map((c: Comment) => ({
      text: c.text,
      author: c.author,
      timestamp: c.timestamp,
    })),
    checkpoints: checkpoints.map((cp: Checkpoint) => ({
      name: cp.name,
      data: cp.data,
      timestamp: cp.timestamp,
    })),
    subtasks,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`Task: ${task.task_id}`);
    console.log(`Title: ${task.title}`);
    console.log(`Project: ${task.project}`);
    console.log(`Status: ${task.status}`);
    console.log(`Priority: ${task.priority}`);
    if (task.parent_id) console.log(`Parent: ${task.parent_id}`);
    if (task.description) console.log(`Description: ${task.description}`);
    if (task.tags.length > 0) console.log(`Tags: ${task.tags.join(', ')}`);
    if (task.assignee) console.log(`Assignee: ${task.assignee}`);
    if (task.progress !== null) console.log(`Progress: ${task.progress}%`);
    console.log(`Created: ${task.created_at}`);
    console.log(`Updated: ${task.updated_at}`);

    if (comments.length > 0) {
      console.log(`\nComments (${comments.length}):`);
      for (const c of comments) {
        console.log(`  [${c.timestamp}] ${c.author ?? 'anon'}: ${c.text}`);
      }
    }

    if (checkpoints.length > 0) {
      console.log(`\nCheckpoints (${checkpoints.length}):`);
      for (const cp of checkpoints) {
        console.log(`  [${cp.timestamp}] ${cp.name}`);
      }
    }

    if (subtasks && subtasks.length > 0) {
      const shortId = createShortId(subtasks.map(st => st.task_id));
      console.log(`\nSubtasks (${subtasks.length}):`);
      for (const st of subtasks) {
        const icon = st.status === TaskStatus.Done ? '✓' : st.status === TaskStatus.InProgress ? '→' : '○';
        console.log(`  ${icon} [${shortId(st.task_id)}] ${st.title} (${st.status})`);
        if (deep && 'blocked_by' in st) {
          const ds = st as DeepSubtask;
          const details: string[] = [];
          if (ds.priority !== 0) details.push(`Priority: ${ds.priority}`);
          if (ds.assignee) details.push(`Assignee: ${ds.assignee}`);
          if (ds.progress !== null) details.push(`Progress: ${ds.progress}%`);
          if (details.length > 0) console.log(`    ${details.join(' | ')}`);
          if (ds.description) console.log(`    Description: ${ds.description}`);
          if (ds.blocked_by.length > 0) console.log(`    Blocked by: ${ds.blocked_by.map(id => shortId(id)).join(', ')}`);
          if (ds.tags.length > 0) console.log(`    Tags: ${ds.tags.join(', ')}`);
        }
      }
    }
  }

  return result;
}

export function createShowCommand(): Command {
  return new Command('show')
    .description('Show task details with comments, checkpoints, and subtasks')
    .argument('<taskId>', 'Task ID')
    .option('--no-subtasks', 'Hide subtasks in output')
    .option('--deep', 'Include full task fields and blocked_by for each subtask')
    .action(function (this: Command, rawTaskId: string, opts: { subtasks?: boolean; deep?: boolean }) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const taskId = resolveId(services, rawTaskId);
        runShow({
          services,
          taskId,
          showSubtasks: opts.subtasks !== false,
          deep: opts.deep ?? false,
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
