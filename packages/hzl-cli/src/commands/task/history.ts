// packages/hzl-cli/src/commands/history.ts
import { Command } from 'commander';
import { resolveDbPath } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface HistoryEvent {
  rowid: number;
  type: string;
  timestamp: string;
  author?: string;
  agent_id?: string;
  data: Record<string, unknown>;
}

export interface HistoryResult {
  task_id: string;
  events: HistoryEvent[];
}

export function runHistory(options: { services: Services; taskId: string; limit?: number; json: boolean }): HistoryResult {
  const { services, taskId, limit = 100, json } = options;
  const db = services.db;

  type HistoryRow = {
    rowid: number;
    type: string;
    timestamp: string;
    author: string | null;
    agent_id: string | null;
    data: string;
  };

  // Get events for this task from the events table
  const events = db.prepare(`
    SELECT rowid, type, timestamp, author, agent_id, data
    FROM events
    WHERE task_id = ?
    ORDER BY rowid ASC
    LIMIT ?
  `).all(taskId, limit) as HistoryRow[];

  const result: HistoryResult = {
    task_id: taskId,
    events: events.map((e) => ({
      rowid: e.rowid,
      type: e.type,
      timestamp: e.timestamp,
      author: e.author ?? undefined,
      agent_id: e.agent_id ?? undefined,
      data: JSON.parse(e.data) as Record<string, unknown>,
    })),
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.events.length === 0) {
      console.log(`No events found for task: ${taskId}`);
    } else {
      console.log(`History for task ${taskId}:`);
      for (const event of result.events) {
        const actor = event.author || event.agent_id || 'system';
        console.log(`  [${event.timestamp}] ${event.type} by ${actor}`);
      }
    }
  }

  return result;
}

export function createHistoryCommand(): Command {
  return new Command('history')
    .description('Show full event history for a task')
    .argument('<taskId>', 'Task ID')
    .option('-l, --limit <n>', 'Limit number of events', '100')
    .action(function (this: Command, taskId: string, opts: { limit: string }) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        runHistory({
          services,
          taskId,
          limit: parseInt(opts.limit, 10),
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
