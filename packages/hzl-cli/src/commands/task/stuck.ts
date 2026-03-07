// packages/hzl-cli/src/commands/stuck.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { createShortId } from '../../short-id.js';
import { parseIntegerWithDefault } from '../../parse.js';

export interface StuckTask {
  task_id: string;
  title: string;
  project: string;
  agent: string | null;
  claimed_at: string | null;
  lease_until: string | null;
  expired_for_ms: number | null;
  reason: 'lease_expired' | 'stale';
  stale_minutes?: number;
  stale_after_minutes: number | null;
}

export interface StuckResult {
  tasks: StuckTask[];
  total: number;
}

interface StuckCommandOptions {
  project?: string;
  olderThan?: string;
  stale?: boolean;
  staleThreshold?: string;
}

export function runStuck(options: {
  services: Services;
  project?: string;
  olderThanMinutes?: number;
  stale?: boolean;
  staleThresholdMinutes?: number;
  json: boolean;
}): StuckResult {
  const { services, project, olderThanMinutes = 0, stale, staleThresholdMinutes, json } = options;
  const db = services.cacheDb;
  const now = new Date();

  type StuckRow = {
    task_id: string;
    title: string;
    project: string;
    agent: string | null;
    claimed_at: string | null;
    lease_until: string;
    stale_after_minutes: number | null;
  };

  // Find tasks with expired leases
  let query = `
    SELECT task_id, title, project, agent, claimed_at, lease_until, stale_after_minutes
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
      agent: row.agent,
      claimed_at: row.claimed_at,
      lease_until: row.lease_until,
      expired_for_ms: expiredForMs,
      reason: 'lease_expired',
      stale_after_minutes: row.stale_after_minutes,
    });
  }

  // If --stale is set, also find stale tasks (claimed, no checkpoints)
  if (stale) {
    const staleTasks = services.taskService.getStaleTasks({
      thresholdMinutes: staleThresholdMinutes ?? 10,
      project,
    });
    const existingIds = new Set(tasks.map(t => t.task_id));
    for (const [taskId, staleMinutes] of staleTasks) {
      if (existingIds.has(taskId)) continue;
      const taskRow = db.prepare(
        'SELECT task_id, title, project, agent, claimed_at, stale_after_minutes FROM tasks_current WHERE task_id = ?'
      ).get(taskId) as {
        task_id: string;
        title: string;
        project: string;
        agent: string | null;
        claimed_at: string | null;
        stale_after_minutes: number | null;
      } | undefined;
      if (taskRow) {
        tasks.push({
          task_id: taskRow.task_id,
          title: taskRow.title,
          project: taskRow.project,
          agent: taskRow.agent,
          claimed_at: taskRow.claimed_at,
          lease_until: null,
          expired_for_ms: null,
          reason: 'stale',
          stale_minutes: staleMinutes,
          stale_after_minutes: taskRow.stale_after_minutes,
        });
      }
    }
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
      const leaseExpired = tasks.filter(t => t.reason === 'lease_expired');
      const staleTasks = tasks.filter(t => t.reason === 'stale');

      if (leaseExpired.length > 0) {
        console.log(`Stuck tasks (${leaseExpired.length}):`);
        for (const task of leaseExpired) {
          const expiredMinutes = Math.round((task.expired_for_ms ?? 0) / 60000);
          console.log(`  [${shortId(task.task_id)}] ${task.title} (${task.project})`);
          console.log(`    Agent: ${task.agent ?? 'unknown'} | Expired: ${expiredMinutes}m ago`);
        }
      }

      if (staleTasks.length > 0) {
        if (leaseExpired.length > 0) console.log('');
        console.log(`Stale tasks — no checkpoints (${staleTasks.length}):`);
        for (const task of staleTasks) {
          console.log(`  [${shortId(task.task_id)}] ${task.title} (${task.project})`);
          console.log(`    Agent: ${task.agent ?? 'unknown'} | Claimed: ${task.stale_minutes}m ago, 0 checkpoints`);
        }
      }
    }
  }

  return result;
}

export function createStuckCommand(): Command {
  return new Command('stuck')
    .description('List tasks with expired leases')
    .option('-P, --project <project>', 'Filter by project')
    .option('--older-than <minutes>', 'Only show tasks expired for more than N minutes', '0')
    .option('--stale', 'Also include stale tasks (claimed, no checkpoints)', false)
    .option('--stale-threshold <minutes>', 'Threshold for stale detection (default: 10)', '10')
    .action(function (this: Command, opts: StuckCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runStuck({
          services,
          project: opts.project,
          olderThanMinutes: parseIntegerWithDefault(opts.olderThan, 'older-than', 0, { min: 0 }),
          stale: opts.stale,
          staleThresholdMinutes: parseIntegerWithDefault(opts.staleThreshold, 'stale-threshold', 10, { min: 0 }),
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
