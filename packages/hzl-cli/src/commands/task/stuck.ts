// packages/hzl-cli/src/commands/stuck.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { createShortId } from '../../short-id.js';

export interface StuckTask {
  task_id: string;
  title: string;
  project: string;
  assignee: string | null;
  lease_until: string;
  expired_for_ms: number;
}

export interface StuckResult {
  tasks: StuckTask[];
  total: number;
}

interface StuckCommandOptions {
  project?: string;
  olderThan?: string;
}

export function runStuck(options: {
  services: Services;
  project?: string;
  olderThanMinutes?: number;
  json: boolean;
}): StuckResult {
  const { services, project, olderThanMinutes = 0, json } = options;
  const db = services.cacheDb;
  const now = new Date();

  type StuckRow = {
    task_id: string;
    title: string;
    project: string;
    assignee: string | null;
    lease_until: string;
  };

  // Find tasks with expired leases
  let query = `
    SELECT task_id, title, project, assignee, lease_until
    FROM tasks_current
    WHERE status = 'in_progress'
      AND lease_until IS NOT NULL
      AND lease_until < ?
  `;
  const params: Array<string> = [now.toISOString()];

  if (project) {
    query += ' AND project = ?';
    params.push(project);
  }

  query += ' ORDER BY lease_until ASC';

  const rows = db.prepare(query).all(...params) as StuckRow[];

  const tasks: StuckTask[] = [];
  for (const row of rows) {
    const leaseExpiry = new Date(row.lease_until);
    const expiredForMs = now.getTime() - leaseExpiry.getTime();
    const expiredForMinutes = expiredForMs / 60000;

    // Filter by olderThanMinutes if specified
    if (expiredForMinutes < olderThanMinutes) {
      continue;
    }

    tasks.push({
      task_id: row.task_id,
      title: row.title,
      project: row.project,
      assignee: row.assignee,
      lease_until: row.lease_until,
      expired_for_ms: expiredForMs,
    });
  }

  const result: StuckResult = {
    tasks,
    total: tasks.length,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    if (tasks.length === 0) {
      console.log('No stuck tasks found');
    } else {
      const shortId = createShortId(tasks.map(t => t.task_id));
      console.log(`Stuck tasks (${tasks.length}):`);
      for (const task of tasks) {
        const expiredMinutes = Math.round(task.expired_for_ms / 60000);
        console.log(`  [${shortId(task.task_id)}] ${task.title} (${task.project})`);
        console.log(`    Assignee: ${task.assignee ?? 'unknown'} | Expired: ${expiredMinutes}m ago`);
      }
    }
  }

  return result;
}

export function createStuckCommand(): Command {
  return new Command('stuck')
    .description('List tasks with expired leases')
    .option('-p, --project <project>', 'Filter by project')
    .option('--older-than <minutes>', 'Only show tasks expired for more than N minutes', '0')
    .action(function (this: Command, opts: StuckCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runStuck({
          services,
          project: opts.project,
          olderThanMinutes: parseInt(opts.olderThan ?? '0', 10),
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
