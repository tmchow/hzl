// packages/hzl-cli/src/commands/next.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { createShortId } from '../../short-id.js';

export interface NextResult {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
  parent_id: string | null;
  claimed?: boolean;
  assignee?: string | null;
  lease_until?: string | null;
}

export interface NextOptions {
  services: Services;
  project?: string;
  tags?: string[];
  parent?: string;
  claim?: boolean;
  assignee?: string;
  agentId?: string;
  leaseMinutes?: number;
  json: boolean;
}

interface NextCommandOptions {
  project?: string;
  tags?: string;
  parent?: string;
  claim?: boolean;
  assignee?: string;
  agentId?: string;
  lease?: string;
}

export function runNext(options: NextOptions): NextResult | null {
  const { services, project, tags, parent, claim, assignee, agentId, leaseMinutes, json } = options;

  // Validate parent exists if specified
  if (parent) {
    const parentTask = services.taskService.getTaskById(parent);
    if (!parentTask) {
      throw new CLIError(`Parent task not found: ${parent}`, ExitCode.NotFound);
    }
  }

  // Single optimized query for next available leaf task (replaces N+1 pattern)
  const task = services.taskService.getNextLeafTask({
    project,
    tagsAll: tags,
    parent,
  });

  if (!task) {
    if (json) {
      console.log(JSON.stringify(null));
    } else {
      console.log('No tasks available');
    }
    return null;
  }

  // If --claim, claim the task immediately
  if (claim) {
    const leaseUntil = leaseMinutes ? new Date(Date.now() + leaseMinutes * 60000).toISOString() : undefined;

    const claimed = services.taskService.claimTask(task.task_id, {
      author: assignee,
      agent_id: agentId,
      lease_until: leaseUntil,
    });

    const result: NextResult = {
      task_id: claimed.task_id,
      title: claimed.title,
      project: claimed.project,
      status: claimed.status,
      priority: task.priority,
      parent_id: claimed.parent_id ?? null,
      claimed: true,
      assignee: claimed.assignee,
      lease_until: claimed.lease_until,
    };

    if (json) {
      console.log(JSON.stringify(result));
    } else {
      const shortId = createShortId([claimed.task_id]);
      console.log(`✓ Claimed task [${shortId(claimed.task_id)}] ${claimed.title} (${claimed.project})`);
      if (claimed.lease_until) {
        console.log(`  Lease until: ${claimed.lease_until}`);
      }
    }

    return result;
  }

  const result: NextResult = {
    task_id: task.task_id,
    title: task.title,
    project: task.project,
    status: task.status,
    priority: task.priority,
    parent_id: task.parent_id ?? null,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    const shortId = createShortId([task.task_id]);
    console.log(`Next task: [${shortId(task.task_id)}] ${task.title} (${task.project})`);
  }

  return result;
}

export function createNextCommand(): Command {
  return new Command('next')
    .description('Get the next available task')
    .option('-P, --project <project>', 'Filter by project')
    .option('-t, --tags <tags>', 'Required tags (comma-separated)')
    .option('--parent <taskId>', 'Get next subtask of specific parent')
    .option('--claim', 'Claim the found task immediately')
    .option('--assignee <name>', 'Who to assign the task to (requires --claim)')
    .option('--agent-id <id>', 'Agent ID (requires --claim)')
    .option('-l, --lease <minutes>', 'Lease duration in minutes (requires --claim)')
    .action(function (this: Command, opts: NextCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runNext({
          services,
          project: opts.project,
          tags: opts.tags?.split(','),
          parent: opts.parent,
          claim: opts.claim,
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
