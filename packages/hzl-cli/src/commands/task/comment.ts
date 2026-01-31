// packages/hzl-cli/src/commands/comment.ts
import { Command } from 'commander';
import { resolveDbPath } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface CommentResult {
  task_id: string;
  text: string;
  author: string | undefined;
}

interface CommentCommandOptions {
  author?: string;
}

export function runComment(options: {
  services: Services;
  taskId: string;
  text: string;
  author?: string;
  json: boolean;
}): CommentResult {
  const { services, taskId, text, author, json } = options;

  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }

  services.taskService.addComment(taskId, text, { author });

  const result: CommentResult = {
    task_id: taskId,
    text,
    author,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Added comment to task ${taskId}`);
  }

  return result;
}

export function createCommentCommand(): Command {
  return new Command('comment')
    .description('Add a comment to a task')
    .argument('<taskId>', 'Task ID')
    .argument('<text>', 'Comment text')
    .option('--author <name>', 'Author name')
    .action(function (
      this: Command,
      taskId: string,
      text: string,
      opts: CommentCommandOptions
    ) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        runComment({
          services,
          taskId,
          text,
          author: opts.author,
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
