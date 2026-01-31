// packages/hzl-cli/src/commands/stuck.ts
import { Command } from 'commander';
import { resolveDbPath } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import type { GlobalOptions } from '../../types.js';

export interface StuckTask {
  task_id: string;
  title: string;
  project: string;
  claimed_by_author: string | null;
  lease_until: string | null;
  expired_for_ms: number;
}

export interface StuckResult {
  tasks: StuckTask[];
  total: number;
}

export function runStuck(options: {
  services: Services;
  project?: string;
  olderThanMinutes?: number;
  json: boolean;
}): StuckResult {
  const { services, project, olderThanMinutes = 0, json } = options;
  const db = services.db;
  const now = new Date();

  // Find tasks with expired leases
  let query = `
    SELECT task_id, title, project, claimed_by_author, claimed_by_agent_id, lease_until
    FROM tasks_current
    WHERE status = 'in_progress'
      AND lease_until IS NOT NULL
      AND lease_until < ?
  `;
  const params: any[] = [now.toISOString()];

  if (project) {
    query += ' AND project = ?';
    params.push(project);
  }

  query += ' ORDER BY lease_until ASC';

  const rows = db.prepare(query).all(...params) as any[];

  const tasks: StuckTask[] = rows
    .map(row => {
      const leaseExpiry = new Date(row.lease_until);
      const expiredForMs = now.getTime() - leaseExpiry.getTime();
      const expiredForMinutes = expiredForMs / 60000;
      
      // Filter by olderThanMinutes if specified
      if (expiredForMinutes < olderThanMinutes) {
        return null;
      }

      return {
        task_id: row.task_id,
        title: row.title,
        project: row.project,
        claimed_by_author: row.claimed_by_author,
        lease_until: row.lease_until,
        expired_for_ms: expiredForMs,
      };
    })
    .filter((t): t is StuckTask => t !== null);

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
      console.log(`Stuck tasks (${tasks.length}):`);
      for (const task of tasks) {
        const expiredMinutes = Math.round(task.expired_for_ms / 60000);
        console.log(`  [${task.task_id.slice(0, 8)}] ${task.title} (${task.project})`);
        console.log(`    Owner: ${task.claimed_by_author ?? 'unknown'} | Expired: ${expiredMinutes}m ago`);
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
    .action(function (this: Command, opts: any) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        runStuck({
          services,
          project: opts.project,
          olderThanMinutes: parseInt(opts.olderThan, 10),
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
