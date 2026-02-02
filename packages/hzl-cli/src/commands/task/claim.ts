// packages/hzl-cli/src/commands/claim.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface ClaimResult {
  task_id: string;
  title: string;
  status: string;
  assignee: string | null;
  lease_until: string | null;
}

interface ClaimCommandOptions {
  author?: string;
  agentId?: string;
  lease?: string;
}

export function runClaim(options: {
  services: Services;
  taskId: string;
  author?: string;
  agentId?: string;
  leaseMinutes?: number;
  json: boolean;
}): ClaimResult {
  const { services, taskId, author, agentId, leaseMinutes, json } = options;

  const leaseUntil = leaseMinutes ? new Date(Date.now() + leaseMinutes * 60000).toISOString() : undefined;
  
  const task = services.taskService.claimTask(taskId, {
    author,
    agent_id: agentId,
    lease_until: leaseUntil,
  });

  const result: ClaimResult = {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
    assignee: task.assignee,
    lease_until: task.lease_until,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Claimed task ${task.task_id}: ${task.title}`);
    if (task.lease_until) {
      console.log(`  Lease until: ${task.lease_until}`);
    }
  }

  return result;
}

export function createClaimCommand(): Command {
  return new Command('claim')
    .description('Claim a task')
    .argument('<taskId>', 'Task ID')
    .option('--author <name>', 'Author name (human identifier)')
    .option('--agent-id <id>', 'Agent ID (machine/AI identifier)')
    .option('-l, --lease <minutes>', 'Lease duration in minutes')
    .action(function (this: Command, taskId: string, opts: ClaimCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runClaim({
          services,
          taskId,
          author: opts.author,
          agentId: opts.agentId,
          leaseMinutes: opts.lease ? parseInt(opts.lease, 10) : undefined,
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
