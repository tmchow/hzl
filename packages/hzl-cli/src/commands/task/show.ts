// packages/hzl-cli/src/commands/show.ts
import { Command } from 'commander';
import { resolveDbPath } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { CLIError, ExitCode, handleError } from '../../errors.js';
import type { GlobalOptions } from '../../types.js';
import type { Comment, Checkpoint } from 'hzl-core/services/task-service.js';

export interface ShowResult {
  task: {
    task_id: string;
    title: string;
    project: string;
    status: string;
    priority: number;
    description: string | null;
    tags: string[];
    created_at: string;
    updated_at: string;
    claimed_by_author: string | null;
    claimed_by_agent_id: string | null;
  };
  comments: Array<{ text: string; author?: string; timestamp: string }>;
  checkpoints: Array<{ name: string; data: Record<string, unknown>; timestamp: string }>;
}

export function runShow(options: { services: Services; taskId: string; json: boolean }): ShowResult {
  const { services, taskId, json } = options;

  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }

  const comments = services.taskService.getComments(taskId);
  const checkpoints = services.taskService.getCheckpoints(taskId);

  const result: ShowResult = {
    task: {
      task_id: task.task_id,
      title: task.title,
      project: task.project,
      status: task.status,
      priority: task.priority,
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
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Task: ${task.task_id}`);
    console.log(`Title: ${task.title}`);
    console.log(`Project: ${task.project}`);
    console.log(`Status: ${task.status}`);
    console.log(`Priority: ${task.priority}`);
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
  }

  return result;
}

export function createShowCommand(): Command {
  return new Command('show')
    .description('Show task details with comments and checkpoints')
    .argument('<taskId>', 'Task ID')
    .action(function (this: Command, taskId: string) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        runShow({ services, taskId, json: globalOpts.json ?? false });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
