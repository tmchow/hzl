// packages/hzl-cli/src/commands/add.ts
import { Command } from 'commander';
import { resolveDbPath } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import type { GlobalOptions } from '../../types.js';

export interface AddResult {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
  tags: string[];
}

export interface AddOptions {
  services: Services;
  project: string;
  title: string;
  description?: string;
  tags?: string[];
  priority?: number;
  dependsOn?: string[];
  json: boolean;
}

export function runAdd(options: AddOptions): AddResult {
  const { services, project, title, description, tags, priority, dependsOn, json } = options;
  
  const task = services.taskService.createTask({
    title,
    project,
    description,
    tags,
    priority,
    depends_on: dependsOn,
  });

  const result: AddResult = {
    task_id: task.task_id,
    title: task.title,
    project: task.project,
    status: task.status,
    priority: task.priority,
    tags: task.tags,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Created task ${task.task_id}: ${task.title}`);
  }

  return result;
}

export function createAddCommand(): Command {
  return new Command('add')
    .description('Create a new task')
    .argument('<title>', 'Task title')
    .option('-P, --project <project>', 'Project name', 'inbox')
    .option('-d, --description <desc>', 'Task description')
    .option('-t, --tags <tags>', 'Comma-separated tags')
    .option('-p, --priority <n>', 'Priority (0-3)', '0')
    .option('--depends-on <ids>', 'Comma-separated task IDs this depends on')
    .action(function (this: Command, title: string, opts: any) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        runAdd({
          services,
          project: opts.project ?? 'inbox',
          title,
          description: opts.description,
          tags: opts.tags?.split(','),
          priority: parseInt(opts.priority, 10),
          dependsOn: opts.dependsOn?.split(','),
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
