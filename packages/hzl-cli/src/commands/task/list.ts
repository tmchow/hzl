// packages/hzl-cli/src/commands/list.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import { TaskStatus } from 'hzl-core/events/types.js';
import { GlobalOptionsSchema } from '../../types.js';

const validStatuses = Object.values(TaskStatus);

export interface TaskListItem {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
  parent_id: string | null;
  created_at: string;
}

export interface ListResult {
  tasks: TaskListItem[];
  total: number;
}

export interface ListOptions {
  services: Services;
  project?: string;
  status?: TaskStatus;
  availableOnly?: boolean;
  parent?: string;
  rootOnly?: boolean;
  limit?: number;
  json: boolean;
}

interface ListCommandOptions {
  project?: string;
  status?: string;
  available?: boolean;
  parent?: string;
  root?: boolean;
  limit?: string;
}

export function runList(options: ListOptions): ListResult {
  const { services, project, status, availableOnly, parent, rootOnly, limit = 50, json } = options;
  const db = services.cacheDb;

  // Build query with filters
  let query = `
    SELECT task_id, title, project, status, priority, parent_id, created_at
    FROM tasks_current
    WHERE status != 'archived'
  `;
  const params: Array<string | number> = [];

  if (project) {
    query += ' AND project = ?';
    params.push(project);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (parent) {
    query += ' AND parent_id = ?';
    params.push(parent);
  }

  if (rootOnly) {
    query += ' AND parent_id IS NULL';
  }

  if (availableOnly) {
    query += ` AND status = 'ready' AND NOT EXISTS (
      SELECT 1 FROM task_dependencies td
      JOIN tasks_current dep ON td.depends_on_id = dep.task_id
      WHERE td.task_id = tasks_current.task_id AND dep.status != 'done'
    )`;
  }

  query += ' ORDER BY priority DESC, created_at ASC, task_id ASC';
  query += ' LIMIT ?';
  params.push(limit);

  const rows = db.prepare(query).all(...params) as TaskListItem[];
  
  const result: ListResult = {
    tasks: rows,
    total: rows.length,
  };
  
  if (json) {
    console.log(JSON.stringify(result));
  } else {
    if (rows.length === 0) {
      console.log('No tasks found');
    } else {
      console.log('Tasks:');
      for (const task of rows) {
        const statusIcon = task.status === 'done' ? '✓' : task.status === 'in_progress' ? '→' : '○';
        console.log(`  ${statusIcon} [${task.task_id.slice(0, 8)}] ${task.title} (${task.project})`);
      }
    }
  }
  
  return result;
}

export function createListCommand(): Command {
  return new Command('list')
    .description('List tasks')
    .option('-p, --project <project>', 'Filter by project')
    .option('-s, --status <status>', 'Filter by status')
    .option('-a, --available', 'Show only available (ready, no blocking deps)', false)
    .option('--parent <taskId>', 'Filter by parent task')
    .option('--root', 'Show only root tasks (no parent)', false)
    .option('-l, --limit <n>', 'Limit results', '50')
    .action(function (this: Command, opts: ListCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const status = opts.status && validStatuses.includes(opts.status as TaskStatus)
          ? (opts.status as TaskStatus)
          : undefined;
        runList({
          services,
          project: opts.project,
          status,
          availableOnly: opts.available,
          parent: opts.parent,
          rootOnly: opts.root,
          limit: parseInt(opts.limit ?? '50', 10),
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
