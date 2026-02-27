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
  agent: string | null;
  lease_until: string | null;
}

interface ClaimCommandOptions {
  next?: boolean;
  project?: string;
  tags?: string;
  parent?: string;
  agent?: string;
  agentId?: string;
  lease?: string;
}

export function runClaim(options: {
  services: Services;
  taskId: string;
  agent?: string;
  agentId?: string;
  leaseMinutes?: number;
  json: boolean;
}): ClaimResult {
  const { services, taskId, agent, agentId, leaseMinutes, json } = options;

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
    author: agent,
    agent_id: agentId,
    lease_until: leaseUntil,
  });

  const result: ClaimResult = {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
    agent: task.assignee,
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

export function runClaimNext(options: {
  services: Services;
  project?: string;
  tags?: string[];
  parent?: string;
  agent?: string;
  agentId?: string;
  leaseMinutes?: number;
  json: boolean;
}): ClaimResult | null {
  const { services, project, tags, parent, agent, agentId, leaseMinutes, json } = options;

  if (parent) {
    const parentTask = services.taskService.getTaskById(parent);
    if (!parentTask) {
      throw new CLIError(`Parent task not found: ${parent}`, ExitCode.NotFound);
    }
  }

  const candidate = services.taskService.getNextLeafTask({
    project,
    tagsAll: tags,
    parent,
  });

  if (!candidate) {
    if (json) {
      console.log(JSON.stringify(null));
    } else {
      console.log('No tasks available');
    }
    return null;
  }

  const leaseUntil = leaseMinutes ? new Date(Date.now() + leaseMinutes * 60000).toISOString() : undefined;
  const task = services.taskService.claimTask(candidate.task_id, {
    author: agent,
    agent_id: agentId,
    lease_until: leaseUntil,
  });

  const result: ClaimResult = {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
    agent: task.assignee,
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
    .argument('[taskId]', 'Task ID')
    .option('--next', 'Automatically claim the next eligible task')
    .option('-P, --project <project>', 'Filter candidate tasks by project (with --next)')
    .option('-t, --tags <tags>', 'Required tags for candidates, comma-separated (with --next)')
    .option('--parent <taskId>', 'Claim next subtask under parent (with --next)')
    .option('--agent <name>', 'Agent identity for task ownership')
    .option('--agent-id <id>', 'Agent ID (machine/AI identifier)')
    .option('-l, --lease <minutes>', 'Lease duration in minutes')
    .action(function (this: Command, rawTaskId: string | undefined, opts: ClaimCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        if (opts.next) {
          if (rawTaskId) {
            throw new CLIError('Cannot use <taskId> with --next', ExitCode.InvalidUsage);
          }
          const parent = opts.parent ? resolveId(services, opts.parent) : undefined;
          runClaimNext({
            services,
            project: opts.project,
            tags: opts.tags?.split(',').map((tag) => tag.trim()).filter(Boolean),
            parent,
            agent: opts.agent,
            agentId: opts.agentId,
            leaseMinutes: opts.lease ? parseInt(opts.lease, 10) : undefined,
            json: globalOpts.json ?? false,
          });
        } else {
          if (!rawTaskId) {
            throw new CLIError('Task ID is required unless --next is specified', ExitCode.InvalidUsage);
          }
          const taskId = resolveId(services, rawTaskId);
          runClaim({
            services,
            taskId,
            agent: opts.agent,
            agentId: opts.agentId,
            leaseMinutes: opts.lease ? parseInt(opts.lease, 10) : undefined,
            json: globalOpts.json ?? false,
          });
        }
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
