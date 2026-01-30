// packages/hzl-cli/src/commands/next.ts
import { Command } from 'commander';
import { resolveDbPath } from '../config.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { handleError } from '../errors.js';
import type { GlobalOptions } from '../types.js';

export interface NextResult {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
}

export interface NextOptions {
  services: Services;
  project?: string;
  tags?: string[];
  json: boolean;
}

export function runNext(options: NextOptions): NextResult | null {
  const { services, project, tags, json } = options;
  
  // Get available tasks using the service's getAvailableTasks method
  const availableTasks = services.taskService.getAvailableTasks({
    project,
    tagsAll: tags,
    limit: 1,
  });
  
  if (availableTasks.length === 0) {
    if (json) {
      console.log(JSON.stringify(null));
    } else {
      console.log('No tasks available');
    }
    return null;
  }
  
  const task = availableTasks[0];
  const result: NextResult = {
    task_id: task.task_id,
    title: task.title,
    project: task.project,
    status: task.status,
    priority: task.priority,
  };
  
  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`Next task: [${task.task_id.slice(0, 8)}] ${task.title} (${task.project})`);
  }
  
  return result;
}

export function createNextCommand(): Command {
  return new Command('next')
    .description('Get the next available task')
    .option('-p, --project <project>', 'Filter by project')
    .option('-t, --tags <tags>', 'Required tags (comma-separated)')
    .action(function (this: Command, opts: any) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        runNext({
          services,
          project: opts.project,
          tags: opts.tags?.split(','),
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
