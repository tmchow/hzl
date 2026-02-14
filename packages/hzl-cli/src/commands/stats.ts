// packages/hzl-cli/src/commands/stats.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../config.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { handleError } from '../errors.js';
import { GlobalOptionsSchema } from '../types.js';

export interface StatsResult {
  total: number;
  by_status: Record<string, number>;
  by_project: Record<string, number>;
  events_count: number;
}

interface StatsCommandOptions {
  project?: string;
}

export function runStats(options: {
  services: Services;
  project?: string;
  json: boolean;
}): StatsResult {
  const { services, project, json } = options;
  const { db: eventsDb, cacheDb } = services;

  // Count by status (from cache database)
  const statusRows = cacheDb.prepare(`
    SELECT status, COUNT(*) as count 
    FROM tasks_current 
    ${project ? 'WHERE project = ?' : ''}
    GROUP BY status
  `).all(project ? [project] : []) as { status: string; count: number }[];
  
  const byStatus: Record<string, number> = {
    backlog: 0,
    ready: 0,
    in_progress: 0,
    done: 0,
    archived: 0,
  };
  for (const row of statusRows) {
    byStatus[row.status] = row.count;
  }
  
  // Count by project (from cache database)
  const projectRows = cacheDb.prepare(`
    SELECT project, COUNT(*) as count
    FROM tasks_current
    GROUP BY project
  `).all() as { project: string; count: number }[];
  
  const byProject: Record<string, number> = {};
  for (const row of projectRows) {
    byProject[row.project] = row.count;
  }
  
  // Total tasks
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  
  // Events count (from events database)
  const eventsRow = eventsDb.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
  const eventsCount = eventsRow.count;

  const result: StatsResult = {
    total,
    by_status: byStatus,
    by_project: byProject,
    events_count: eventsCount,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`Tasks: ${total} total`);
    console.log(`  Status: ${byStatus.backlog} backlog, ${byStatus.ready} ready, ${byStatus.in_progress} in_progress, ${byStatus.done} done, ${byStatus.archived} archived`);
    console.log(`  Projects: ${Object.keys(byProject).length}`);
    for (const [proj, count] of Object.entries(byProject)) {
      console.log(`    ${proj}: ${count}`);
    }
    console.log(`Events: ${eventsCount} total`);
  }

  return result;
}

export function createStatsCommand(): Command {
  return new Command('stats')
    .description('Show database statistics')
    .option('-P, --project <project>', 'Filter by project')
    .action(function (this: Command, opts: StatsCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runStats({
          services,
          project: opts.project,
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
