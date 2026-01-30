#!/usr/bin/env node
// packages/hzl-cli/src/cli.ts
import { Command } from 'commander';
import { TaskStatus } from 'hzl-core/events/types.js';
import { resolveDbPath, loadConfig } from './config.js';
import { initializeDb, closeDb, type Services } from './db.js';
import { createFormatter } from './output.js';
import { handleError, ExitCode } from './errors.js';
import * as taskCommands from './commands/task.js';
import * as searchCommands from './commands/search.js';
import * as validateCommands from './commands/validate.js';
import { createInitCommand } from './commands/init.js';
import { createWhichDbCommand } from './commands/which-db.js';
import { createProjectsCommand } from './commands/projects.js';
import { createRenameProjectCommand } from './commands/rename-project.js';
import { createAddCommand } from './commands/add.js';
import { createListCommand } from './commands/list.js';
import { createNextCommand } from './commands/next.js';
import { createShowCommand } from './commands/show.js';
import { createHistoryCommand } from './commands/history.js';
import { createUpdateCommand } from './commands/update.js';
import { createMoveCommand } from './commands/move.js';
import { createClaimCommand } from './commands/claim.js';
import { createCompleteCommand } from './commands/complete.js';
import { createReleaseCommand } from './commands/release.js';
import { createArchiveCommand } from './commands/archive.js';
import { createReopenCommand } from './commands/reopen.js';
import { createSetStatusCommand } from './commands/set-status.js';
import { createStealCommand } from './commands/steal.js';
import { createStuckCommand } from './commands/stuck.js';
import { createAddDepCommand } from './commands/add-dep.js';
import { createRemoveDepCommand } from './commands/remove-dep.js';
import { createCommentCommand } from './commands/comment.js';
import { createCheckpointCommand } from './commands/checkpoint.js';

const program = new Command();

program
  .name('hzl')
  .description('HZL - Hierarchical task coordination for AI agent swarms')
  .version('0.1.0')
  .option('--db <path>', 'Path to database file')
  .option('--json', 'Output in JSON format', false);

function withDb<T>(fn: (services: Services) => T): T {
  const opts = program.opts();
  const dbPath = resolveDbPath(opts.db);
  const services = initializeDb(dbPath);
  try {
    return fn(services);
  } finally {
    closeDb(services);
  }
}

// Basic commands
program.addCommand(createInitCommand());
program.addCommand(createWhichDbCommand());
program.addCommand(createProjectsCommand());
program.addCommand(createRenameProjectCommand());
program.addCommand(createAddCommand());
program.addCommand(createListCommand());
program.addCommand(createNextCommand());
program.addCommand(createShowCommand());
program.addCommand(createHistoryCommand());
program.addCommand(createUpdateCommand());
program.addCommand(createMoveCommand());
program.addCommand(createClaimCommand());
program.addCommand(createCompleteCommand());
program.addCommand(createReleaseCommand());
program.addCommand(createArchiveCommand());
program.addCommand(createReopenCommand());
program.addCommand(createSetStatusCommand());
program.addCommand(createStealCommand());
program.addCommand(createStuckCommand());
program.addCommand(createAddDepCommand());
program.addCommand(createRemoveDepCommand());
program.addCommand(createCommentCommand());
program.addCommand(createCheckpointCommand());

// Task commands
const task = program.command('task').description('Task management commands');

task
  .command('create')
  .description('Create a new task')
  .argument('<title>', 'Task title')
  .option('-p, --project <project>', 'Project name', 'inbox')
  .option('-d, --description <desc>', 'Task description')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('--priority <n>', 'Priority (0-3)', '0')
  .option('--depends-on <ids>', 'Comma-separated task IDs this depends on')
  .option('--author <name>', 'Author name')
  .action((title, opts) => {
    try {
      withDb((services) => {
        const out = createFormatter(program.opts().json);
        taskCommands.createTask(services, {
          title,
          project: opts.project,
          description: opts.description,
          tags: opts.tags?.split(','),
          priority: parseInt(opts.priority, 10),
          depends_on: opts.dependsOn?.split(','),
        }, opts.author, out);
      });
    } catch (e) { handleError(e, program.opts().json); }
  });

task
  .command('claim <taskId>')
  .description('Claim a task')
  .option('--author <name>', 'Author name')
  .option('--lease <minutes>', 'Lease duration in minutes')
  .action((taskId, opts) => {
    try {
      withDb((services) => {
        const out = createFormatter(program.opts().json);
        taskCommands.claimTask(services, taskId, opts.author, opts.lease ? parseInt(opts.lease, 10) : undefined, out);
      });
    } catch (e) { handleError(e, program.opts().json); }
  });

task
  .command('claim-next')
  .description('Claim the next available task')
  .option('-p, --project <project>', 'Filter by project')
  .option('-t, --tags <tags>', 'Comma-separated required tags')
  .option('--author <name>', 'Author name')
  .option('--lease <minutes>', 'Lease duration in minutes')
  .action((opts) => {
    try {
      withDb((services) => {
        const out = createFormatter(program.opts().json);
        taskCommands.claimNext(services, {
          project: opts.project,
          tags: opts.tags?.split(','),
          author: opts.author,
          leaseMinutes: opts.lease ? parseInt(opts.lease, 10) : undefined,
        }, out);
      });
    } catch (e) { handleError(e, program.opts().json); }
  });

task
  .command('complete <taskId>')
  .description('Complete a task')
  .option('--author <name>', 'Author name')
  .action((taskId, opts) => {
    try {
      withDb((services) => {
        const out = createFormatter(program.opts().json);
        taskCommands.completeTask(services, taskId, opts.author, out);
      });
    } catch (e) { handleError(e, program.opts().json); }
  });

task
  .command('release <taskId>')
  .description('Release a claimed task')
  .option('--reason <reason>', 'Release reason')
  .option('--author <name>', 'Author name')
  .action((taskId, opts) => {
    try {
      withDb((services) => {
        const out = createFormatter(program.opts().json);
        taskCommands.releaseTask(services, taskId, opts.reason, opts.author, out);
      });
    } catch (e) { handleError(e, program.opts().json); }
  });

task
  .command('get <taskId>')
  .description('Get task details')
  .action((taskId) => {
    try {
      withDb((services) => {
        const out = createFormatter(program.opts().json);
        taskCommands.getTask(services, taskId, out);
      });
    } catch (e) { handleError(e, program.opts().json); }
  });

task
  .command('list')
  .description('List tasks')
  .option('-p, --project <project>', 'Filter by project')
  .option('-s, --status <status>', 'Filter by status')
  .option('-l, --limit <n>', 'Limit results', '50')
  .action((opts) => {
    try {
      withDb((services) => {
        const out = createFormatter(program.opts().json);
        taskCommands.listTasks(services, {
          project: opts.project,
          status: opts.status as TaskStatus | undefined,
          limit: parseInt(opts.limit, 10),
        }, out);
      });
    } catch (e) { handleError(e, program.opts().json); }
  });

task
  .command('comment <taskId> <text>')
  .description('Add a comment to a task')
  .option('--author <name>', 'Author name')
  .action((taskId, text, opts) => {
    try {
      withDb((services) => {
        const out = createFormatter(program.opts().json);
        taskCommands.addComment(services, taskId, text, opts.author, out);
      });
    } catch (e) { handleError(e, program.opts().json); }
  });

task
  .command('checkpoint <taskId> <name>')
  .description('Add a checkpoint to a task')
  .option('--data <json>', 'Checkpoint data as JSON')
  .option('--author <name>', 'Author name')
  .action((taskId, name, opts) => {
    try {
      withDb((services) => {
        const out = createFormatter(program.opts().json);
        const data = opts.data ? JSON.parse(opts.data) : undefined;
        taskCommands.addCheckpoint(services, taskId, name, data, opts.author, out);
      });
    } catch (e) { handleError(e, program.opts().json); }
  });

// Search command
program
  .command('search <query>')
  .description('Search tasks')
  .option('-p, --project <project>', 'Filter by project')
  .option('-l, --limit <n>', 'Limit results', '50')
  .option('-o, --offset <n>', 'Offset for pagination', '0')
  .action((query, opts) => {
    try {
      withDb((services) => {
        const out = createFormatter(program.opts().json);
        searchCommands.search(services, query, {
          project: opts.project,
          limit: parseInt(opts.limit, 10),
          offset: parseInt(opts.offset, 10),
        }, out);
      });
    } catch (e) { handleError(e, program.opts().json); }
  });

// Validate command
program
  .command('validate')
  .description('Validate database integrity')
  .action(() => {
    try {
      const isValid = withDb((services) => {
        const out = createFormatter(program.opts().json);
        return validateCommands.validate(services, out);
      });
      process.exit(isValid ? ExitCode.Success : ExitCode.ValidationError);
    } catch (e) { handleError(e, program.opts().json); }
  });

program.parse();
