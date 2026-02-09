// packages/hzl-cli/src/commands/claim.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { CLIError, ExitCode, handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { resolveId } from '../../resolve-id.js';
import { TaskStatus } from 'hzl-core/events/types.js';

export interface ClaimResult {
  task_id: string;
  title: string;
  status: string;
  assignee: string | null;
  lease_until: string | null;
}

interface ClaimCommandOptions {
  assignee?: string;
  agentId?: string;
  lease?: string;
}

export function runClaim(options: {
  services: Services;
  taskId: string;
  assignee?: string;
  agentId?: string;
  leaseMinutes?: number;
  json: boolean;
}): ClaimResult {
  const { services, taskId, assignee, agentId, leaseMinutes, json } = options;

  // Check task status before claiming to provide actionable error
  const existingTask = services.taskService.getTaskById(taskId);
  if (existingTask && existingTask.status !== TaskStatus.Ready) {
    throw new CLIError(
      `Task ${taskId} is not claimable (status: ${existingTask.status})\nHint: hzl task set-status ${taskId} ready`,
      ExitCode.InvalidInput
    );
  }

  const leaseUntil = leaseMinutes ? new Date(Date.now() + leaseMinutes * 60000).toISOString() : undefined;

  const task = services.taskService.claimTask(taskId, {
    author: assignee,  // assignee becomes author in the event for projection
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
    .option('--assignee <name>', 'Who to assign the task to')
    .option('--agent-id <id>', 'Agent ID (machine/AI identifier)')
    .option('-l, --lease <minutes>', 'Lease duration in minutes')
    .action(function (this: Command, rawTaskId: string, opts: ClaimCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const taskId = resolveId(services, rawTaskId);
        runClaim({
          services,
          taskId,
          assignee: opts.assignee,
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
