import { Command } from 'commander';
import type { AgentEventsResult } from 'hzl-core';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { createShortId } from '../../short-id.js';
import { formatTimeAgo } from '../../format-duration.js';
import { parseIntegerWithDefault } from '../../parse.js';

interface LogCommandOptions {
  limit?: string;
}

export function runAgentLog(options: {
  services: Services;
  agent: string;
  limit?: number;
  json: boolean;
}): AgentEventsResult {
  const { services, agent, limit, json } = options;
  const result = services.taskService.getAgentEvents(agent, { limit });

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    if (result.events.length === 0) {
      console.log(`No activity found for agent "${agent}"`);
      return result;
    }

    console.log(`Activity log for ${agent} (showing ${result.events.length} of ${result.total} events):\n`);

    const taskIds = [...new Set(result.events.map(e => e.taskId))];
    const shortId = createShortId(taskIds);

    for (const event of result.events) {
      const ago = formatTimeAgo(event.timestamp).padEnd(8);
      const type = event.type.padEnd(20);
      const tid = shortId(event.taskId);
      console.log(`  ${ago} ${type} [${tid}] ${event.taskTitle}`);
    }
  }

  return result;
}

export function createAgentLogCommand(): Command {
  return new Command('log')
    .description('Show activity history for an agent')
    .argument('<agent>', 'Agent name')
    .option('-l, --limit <count>', 'Number of events to show (default: 50)')
    .action(function (this: Command, agent: string, opts: LogCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runAgentLog({
          services,
          agent,
          limit: opts.limit ? parseIntegerWithDefault(opts.limit, 'limit', 50, { min: 1, max: 200 }) : undefined,
          json: globalOpts.json ?? false,
        });
      } catch (error) {
        handleError(error, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
