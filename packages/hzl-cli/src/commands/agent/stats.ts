import { Command } from 'commander';
import { TaskStatus } from 'hzl-core/events/types.js';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { CLIError, ExitCode, handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface AgentStatsEntry {
  agent: string;
  total: number;
  by_status: Record<string, number>;
}

export interface AgentStatsResult {
  agents: AgentStatsEntry[];
  total_agents: number;
  total_tasks: number;
}

interface AgentStatsCommandOptions {
  project?: string;
  status?: string;
}

export function runAgentStats(options: {
  services: Services;
  project?: string;
  status?: TaskStatus;
  json: boolean;
}): AgentStatsResult {
  const { services, project, status, json } = options;
  const db = services.cacheDb;

  let query = `
    SELECT assignee AS agent, status, COUNT(*) AS count
    FROM tasks_current
    WHERE assignee IS NOT NULL
      AND status != 'archived'
  `;
  const params: Array<string> = [];

  if (project) {
    query += ' AND project = ?';
    params.push(project);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' GROUP BY assignee, status ORDER BY assignee ASC, status ASC';

  const rows = db.prepare(query).all(...params) as Array<{
    agent: string;
    status: string;
    count: number;
  }>;

  const byAgent = new Map<string, AgentStatsEntry>();
  for (const row of rows) {
    if (!byAgent.has(row.agent)) {
      byAgent.set(row.agent, {
        agent: row.agent,
        total: 0,
        by_status: {},
      });
    }

    const entry = byAgent.get(row.agent)!;
    entry.total += row.count;
    entry.by_status[row.status] = row.count;
  }

  const agents = Array.from(byAgent.values());
  const result: AgentStatsResult = {
    agents,
    total_agents: agents.length,
    total_tasks: agents.reduce((sum, agent) => sum + agent.total, 0),
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    if (agents.length === 0) {
      console.log('No assigned tasks found');
    } else {
      console.log('Agent Stats:');
      for (const entry of agents) {
        const statuses = Object.entries(entry.by_status)
          .map(([key, value]) => `${key}:${value}`)
          .join(', ');
        console.log(`  ${entry.agent} total=${entry.total} (${statuses})`);
      }
    }
  }

  return result;
}

export function createAgentStatsCommand(): Command {
  return new Command('stats')
    .description('Show counts-only workload summaries by agent')
    .option('-P, --project <project>', 'Filter by project')
    .option('-s, --status <status>', 'Filter by status')
    .action(function (this: Command, opts: AgentStatsCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const parsedStatus =
          opts.status && Object.values(TaskStatus).includes(opts.status as TaskStatus)
            ? (opts.status as TaskStatus)
            : undefined;
        if (opts.status && !parsedStatus) {
          throw new CLIError(`Invalid status: ${opts.status}`, ExitCode.InvalidInput);
        }

        runAgentStats({
          services,
          project: opts.project,
          status: parsedStatus,
          json: globalOpts.json ?? false,
        });
      } catch (error) {
        handleError(error, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}

