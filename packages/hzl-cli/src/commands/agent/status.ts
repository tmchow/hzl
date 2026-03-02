import { Command } from 'commander';
import type { AgentStatusResult } from 'hzl-core';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { createShortId } from '../../short-id.js';
import { formatDuration, formatTimeAgo } from '../../format-duration.js';

interface StatusCommandOptions {
  agent?: string;
  project?: string;
  stats?: boolean;
}

export function runAgentStatus(options: {
  services: Services;
  agent?: string;
  project?: string;
  stats?: boolean;
  json: boolean;
}): AgentStatusResult {
  const { services, agent, project, stats, json } = options;
  const result = services.taskService.getAgentStatus({
    agent,
    project,
    includeStats: stats,
  });

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    if (result.agents.length === 0) {
      console.log('No agents found');
      return result;
    }

    const { active, idle } = result.summary;
    console.log(`Agents (${active} active, ${idle} idle):\n`);

    const taskIds = result.agents.flatMap(a => a.tasks.map(t => t.taskId));
    const shortId = createShortId(taskIds);

    for (const entry of result.agents) {
      if (entry.isActive) {
        const primaryTask = entry.tasks[0];
        const duration = entry.activeDurationMs != null ? formatDuration(entry.activeDurationMs) : '?';
        const progress = primaryTask?.progress ? `, ${primaryTask.progress}%` : '';
        console.log(`● ${entry.agent}    [active ${duration}]  ${primaryTask?.title ?? 'unknown'} (p:${primaryTask?.project ?? '?'}${progress})`);

        if (entry.tasks.length > 1) {
          console.log(`              Also: ${entry.tasks.length - 1} other task${entry.tasks.length > 2 ? 's' : ''}`);
        }

        // Show lease info for primary task
        if (primaryTask?.leaseUntil) {
          if (primaryTask.leaseExpired) {
            const expiredAgo = formatTimeAgo(primaryTask.leaseUntil);
            console.log(`              ⚠ Lease expired ${expiredAgo} ago`);
          } else {
            const remaining = new Date(primaryTask.leaseUntil).getTime() - Date.now();
            console.log(`              Lease expires in ${formatDuration(remaining)}`);
          }
        }
      } else {
        const idleDuration = formatTimeAgo(entry.lastActivity);
        console.log(`○ ${entry.agent}    [idle ${idleDuration}]`);
      }

      if (entry.stats) {
        const parts = Object.entries(entry.stats.counts)
          .map(([k, v]) => `${v} ${k}`)
          .join(', ');
        console.log(`              Tasks: ${entry.stats.total} total (${parts})`);
      }
    }
  }

  return result;
}

export function createAgentStatusCommand(): Command {
  return new Command('status')
    .description('Show active agents, current tasks, and lease state')
    .option('-a, --agent <name>', 'Show status for a single agent')
    .option('-P, --project <project>', 'Filter by project')
    .option('-s, --stats', 'Include per-agent task count breakdowns')
    .action(function (this: Command, opts: StatusCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runAgentStatus({
          services,
          agent: opts.agent,
          project: opts.project,
          stats: opts.stats,
          json: globalOpts.json ?? false,
        });
      } catch (error) {
        handleError(error, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
