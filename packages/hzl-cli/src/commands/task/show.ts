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

export type ShowView = 'summary' | 'standard' | 'full';

export type SubtaskSummary = { task_id: string; title: string; status: TaskStatus };
export type DeepSubtask = Task & { blocked_by: string[] };

interface ShowTaskSummary {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
  parent_id: string | null;
  agent: string | null;
}

interface ShowTaskStandard extends ShowTaskSummary {
  due_at: string | null;
  tags: string[];
  lease_until: string | null;
}

export interface ShowResult {
  task: ShowTaskSummary | ShowTaskStandard | Task;
  comments: Array<{ text: string; author?: string; timestamp: string }>;
  checkpoints: Array<{ name: string; data: Record<string, unknown>; timestamp: string }>;
  subtasks?: Array<SubtaskSummary> | Array<DeepSubtask>;
}

function shapeTaskForView(task: Task, view: ShowView): ShowTaskSummary | ShowTaskStandard | Task {
  if (view === 'summary') {
    return {
      task_id: task.task_id,
      title: task.title,
      project: task.project,
      status: task.status,
      priority: task.priority,
      parent_id: task.parent_id,
      agent: task.agent,
    };
  }

  if (view === 'standard') {
    return {
      task_id: task.task_id,
      title: task.title,
      project: task.project,
      status: task.status,
      priority: task.priority,
      parent_id: task.parent_id,
      agent: task.agent,
      due_at: task.due_at,
      tags: task.tags,
      lease_until: task.lease_until,
    };
  }

  return task;
}

export function runShow(options: {
  services: Services;
  taskId: string;
  showSubtasks?: boolean;
  deep?: boolean;
  view?: ShowView;
  json: boolean;
}): ShowResult {
  const { services, taskId, showSubtasks = true, deep = false, view = 'full', json } = options;

  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound, undefined, undefined, ['hzl task list']);
  }

  const comments = view === 'summary' ? [] : services.taskService.getComments(taskId);
  const checkpoints = view === 'summary' ? [] : services.taskService.getCheckpoints(taskId);

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

  const shapedTask = shapeTaskForView(task, view);

  const result: ShowResult = {
    task: shapedTask,
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
    const t = shapedTask;
    console.log(`Task: ${t.task_id}`);
    console.log(`Title: ${t.title}`);
    console.log(`Project: ${t.project}`);
    console.log(`Status: ${t.status}`);
    console.log(`Priority: ${t.priority}`);
    if (t.parent_id) console.log(`Parent: ${t.parent_id}`);
    if ('description' in t && t.description) console.log(`Description: ${t.description}`);
    if ('tags' in t && t.tags.length > 0) console.log(`Tags: ${t.tags.join(', ')}`);
    if (t.agent) console.log(`Agent: ${t.agent}`);
    if ('progress' in t && t.progress !== null) console.log(`Progress: ${t.progress}%`);
    if ('created_at' in t) console.log(`Created: ${t.created_at}`);
    if ('updated_at' in t) console.log(`Updated: ${t.updated_at}`);

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
          const details: string[] = [];
          if (st.priority !== 0) details.push(`Priority: ${st.priority}`);
          if (st.agent) details.push(`Agent: ${st.agent}`);
          if (st.progress !== null) details.push(`Progress: ${st.progress}%`);
          if (details.length > 0) console.log(`    ${details.join(' | ')}`);
          if (st.description) console.log(`    Description: ${st.description}`);
          if (st.blocked_by.length > 0) console.log(`    Blocked by: ${st.blocked_by.map(id => shortId(id)).join(', ')}`);
          if (st.tags.length > 0) console.log(`    Tags: ${st.tags.join(', ')}`);
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
    .option('--view <view>', 'Response view: summary | standard | full', 'full')
    .action(function (this: Command, rawTaskId: string, opts: { subtasks?: boolean; deep?: boolean; view?: string }) {
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
          view: (opts.view as ShowView) ?? 'full',
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
