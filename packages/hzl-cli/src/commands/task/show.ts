// packages/hzl-cli/src/commands/show.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { CLIError, ExitCode, handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { TaskStatus } from 'hzl-core/events/types.js';
import type { Comment, Checkpoint } from 'hzl-core/services/task-service.js';

export interface ShowResult {
  task: {
    task_id: string;
    title: string;
    project: string;
    status: string;
    priority: number;
    parent_id: string | null;
    description: string | null;
    tags: string[];
    created_at: string;
    updated_at: string;
    claimed_by_author: string | null;
    claimed_by_agent_id: string | null;
  };
  comments: Array<{ text: string; author?: string; timestamp: string }>;
  checkpoints: Array<{ name: string; data: Record<string, unknown>; timestamp: string }>;
  subtasks?: Array<{ task_id: string; title: string; status: string }>;
}

export function runShow(options: {
  services: Services;
  taskId: string;
  showSubtasks?: boolean;
  json: boolean;
}): ShowResult {
  const { services, taskId, showSubtasks = true, json } = options;

  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }

  const comments = services.taskService.getComments(taskId);
  const checkpoints = services.taskService.getCheckpoints(taskId);

  const subtasks = showSubtasks
    ? services.taskService.getSubtasks(taskId).map(t => ({
        task_id: t.task_id,
        title: t.title,
        status: t.status,
      }))
    : undefined;

  const result: ShowResult = {
    task: {
      task_id: task.task_id,
      title: task.title,
      project: task.project,
      status: task.status,
      priority: task.priority,
      parent_id: task.parent_id,
      description: task.description,
      tags: task.tags,
      created_at: task.created_at,
      updated_at: task.updated_at,
      claimed_by_author: task.claimed_by_author,
      claimed_by_agent_id: task.claimed_by_agent_id,
    },
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
    if (task.claimed_by_author) console.log(`Claimed by: ${task.claimed_by_author}`);
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
      console.log(`\nSubtasks (${subtasks.length}):`);
      for (const st of subtasks) {
        const icon = st.status === TaskStatus.Done ? '✓' : st.status === TaskStatus.InProgress ? '→' : '○';
        console.log(`  ${icon} [${st.task_id.slice(0, 8)}] ${st.title} (${st.status})`);
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
    .action(function (this: Command, taskId: string, opts: { subtasks?: boolean }) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runShow({
          services,
          taskId,
          showSubtasks: opts.subtasks !== false,
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
