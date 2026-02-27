import { Command } from 'commander';
import {
  WorkflowService,
  type OthersLimit,
  type WorkflowDelegateResult,
  type WorkflowHandoffResult,
  type WorkflowStartResult,
} from 'hzl-core/services/workflow-service.js';
import { resolveDbPaths } from '../../config.js';
import { closeDb, initializeDb, type Services } from '../../db.js';
import { CLIError, ExitCode, handleError } from '../../errors.js';
import { resolveId } from '../../resolve-id.js';
import { GlobalOptionsSchema } from '../../types.js';

interface WorkflowStartCommandOptions {
  agent?: string;
  project?: string;
  tags?: string;
  lease?: string;
  resumePolicy?: 'first' | 'latest' | 'priority';
  includeOthers?: boolean;
  othersLimit?: string;
  opId?: string;
  autoOpId?: boolean;
}

interface WorkflowHandoffCommandOptions {
  from?: string;
  title?: string;
  project?: string;
  agent?: string;
  carryCheckpoints?: string;
  carryMaxChars?: string;
  author?: string;
  opId?: string;
  autoOpId?: boolean;
}

interface WorkflowDelegateCommandOptions {
  from?: string;
  title?: string;
  project?: string;
  agent?: string;
  depends?: boolean;
  checkpoint?: string;
  pauseParent?: boolean;
  author?: string;
  opId?: string;
  autoOpId?: boolean;
}

function createWorkflowService(services: Services): WorkflowService {
  return new WorkflowService(
    services.cacheDb,
    services.eventStore,
    services.projectionEngine,
    services.taskService,
    services.db
  );
}

function parseTags(raw?: string): string[] | undefined {
  const tags = raw?.split(',').map((tag) => tag.trim()).filter(Boolean);
  return tags && tags.length > 0 ? tags : undefined;
}

function parsePositiveInt(raw: string | undefined, optionName: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < 0) {
    throw new CLIError(`${optionName} must be a non-negative integer`, ExitCode.InvalidInput);
  }
  return value;
}

function parseOthersLimit(raw?: string): OthersLimit | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'all') return 'all';
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < 0) {
    throw new CLIError('--others-limit must be a non-negative integer or "all"', ExitCode.InvalidInput);
  }
  return value;
}

function assertNoConflictingOpFlags(opts: { opId?: string; autoOpId?: boolean }): void {
  if (opts.opId && opts.autoOpId) {
    throw new CLIError('Cannot use --op-id and --auto-op-id together.', ExitCode.InvalidInput);
  }
}

export function runWorkflowStart(options: {
  services: Services;
  agent: string;
  project?: string;
  tags?: string[];
  leaseMinutes?: number;
  resumePolicy?: 'first' | 'latest' | 'priority';
  includeOthers?: boolean;
  othersLimit?: OthersLimit;
  opId?: string;
  autoOpId?: boolean;
  json: boolean;
}): WorkflowStartResult {
  if (options.autoOpId) {
    throw new CLIError(
      '--auto-op-id is not supported for workflow run start; use --op-id for intentional retries.',
      ExitCode.InvalidInput
    );
  }

  const workflowService = createWorkflowService(options.services);
  const result = workflowService.runStart({
    agent: options.agent,
    project: options.project,
    tags: options.tags,
    lease_minutes: options.leaseMinutes,
    resume_policy: options.resumePolicy,
    include_others: options.includeOthers,
    others_limit: options.othersLimit,
    op_id: options.opId,
  });

  if (options.json) {
    console.log(JSON.stringify(result));
  } else if (!result.selected) {
    console.log('No eligible task to start.');
  } else if (result.mode === 'resume') {
    console.log(`✓ Resumed task ${result.selected.task_id}: ${result.selected.title}`);
  } else {
    console.log(`✓ Claimed task ${result.selected.task_id}: ${result.selected.title}`);
  }

  return result;
}

export function runWorkflowHandoff(options: {
  services: Services;
  fromTaskId: string;
  title: string;
  project?: string;
  agent?: string;
  carryCheckpoints?: number;
  carryMaxChars?: number;
  author?: string;
  opId?: string;
  autoOpId?: boolean;
  json: boolean;
}): WorkflowHandoffResult {
  const workflowService = createWorkflowService(options.services);
  const result = workflowService.runHandoff({
    from_task_id: options.fromTaskId,
    title: options.title,
    project: options.project,
    agent: options.agent,
    carry_checkpoints: options.carryCheckpoints,
    carry_max_chars: options.carryMaxChars,
    author: options.author,
    op_id: options.opId,
    auto_op_id: options.autoOpId,
  });

  if (options.json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Handed off ${result.source_task_id} -> ${result.follow_on.task_id}`);
  }

  return result;
}

export function runWorkflowDelegate(options: {
  services: Services;
  fromTaskId: string;
  title: string;
  project?: string;
  agent?: string;
  dependsOnParent?: boolean;
  checkpoint?: string;
  pauseParent?: boolean;
  author?: string;
  opId?: string;
  autoOpId?: boolean;
  json: boolean;
}): WorkflowDelegateResult {
  const workflowService = createWorkflowService(options.services);
  const result = workflowService.runDelegate({
    from_task_id: options.fromTaskId,
    title: options.title,
    project: options.project,
    agent: options.agent,
    depends_on_parent: options.dependsOnParent,
    checkpoint: options.checkpoint,
    pause_parent: options.pauseParent,
    author: options.author,
    op_id: options.opId,
    auto_op_id: options.autoOpId,
  });

  if (options.json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Delegated ${result.source_task_id} -> ${result.delegated.task_id}`);
  }

  return result;
}

export function createWorkflowRunCommand(): Command {
  const command = new Command('run').description('Run a built-in workflow');

  command
    .command('start')
    .description('Resume in-progress work for an agent, otherwise claim next')
    .requiredOption('--agent <name>', 'Agent identity for resume/claim')
    .option('-P, --project <project>', 'Project filter for resume/claim')
    .option('--tags <tags>', 'Required tags, comma-separated')
    .option('-l, --lease <minutes>', 'Lease duration in minutes')
    .option('--resume-policy <policy>', 'Resume policy: first | latest | priority', 'priority')
    .option('--include-others', 'Include alternate candidates in response')
    .option('--no-include-others', 'Exclude alternate candidates from response')
    .option('--others-limit <n|all>', 'Bound alternate candidates in response', '5')
    .option('--op-id <key>', 'Explicit idempotency key')
    .option('--auto-op-id', 'Unsupported for start; use explicit --op-id retries instead')
    .action(function (this: Command, opts: WorkflowStartCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        assertNoConflictingOpFlags(opts);
        if (!opts.agent) {
          throw new CLIError('--agent is required', ExitCode.InvalidUsage);
        }
        runWorkflowStart({
          services,
          agent: opts.agent,
          project: opts.project,
          tags: parseTags(opts.tags),
          leaseMinutes: parsePositiveInt(opts.lease, '--lease'),
          resumePolicy: opts.resumePolicy ?? 'priority',
          includeOthers: opts.includeOthers,
          othersLimit: parseOthersLimit(opts.othersLimit),
          opId: opts.opId,
          autoOpId: opts.autoOpId,
          json: globalOpts.json ?? false,
        });
      } catch (error) {
        handleError(error, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });

  command
    .command('handoff')
    .description('Complete source task and create a follow-on task')
    .requiredOption('--from <taskId>', 'Source task id')
    .requiredOption('--title <title>', 'Follow-on task title')
    .option('-P, --project <project>', 'Follow-on task project')
    .option('--agent <agent>', 'Follow-on task assignee')
    .option('--carry-checkpoints <n>', 'Number of checkpoints to carry', '3')
    .option('--carry-max-chars <n>', 'Max carried checkpoint chars', '4000')
    .option('--author <name>', 'Author for emitted workflow events')
    .option('--op-id <key>', 'Explicit idempotency key')
    .option('--auto-op-id', 'Generate deterministic idempotency key from normalized input')
    .action(function (this: Command, opts: WorkflowHandoffCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        assertNoConflictingOpFlags(opts);
        if (!opts.from || !opts.title) {
          throw new CLIError('--from and --title are required', ExitCode.InvalidUsage);
        }
        const fromTaskId = resolveId(services, opts.from);
        runWorkflowHandoff({
          services,
          fromTaskId,
          title: opts.title,
          project: opts.project,
          agent: opts.agent,
          carryCheckpoints: parsePositiveInt(opts.carryCheckpoints, '--carry-checkpoints'),
          carryMaxChars: parsePositiveInt(opts.carryMaxChars, '--carry-max-chars'),
          author: opts.author,
          opId: opts.opId,
          autoOpId: opts.autoOpId,
          json: globalOpts.json ?? false,
        });
      } catch (error) {
        handleError(error, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });

  command
    .command('delegate')
    .description('Create delegated task, add dependency by default, optionally pause parent')
    .requiredOption('--from <taskId>', 'Source task id')
    .requiredOption('--title <title>', 'Delegated task title')
    .option('-P, --project <project>', 'Delegated task project')
    .option('--agent <agent>', 'Delegated task assignee')
    .option('--no-depends', 'Do not add parent->delegated dependency edge')
    .option('--checkpoint <text>', 'Checkpoint to add to source task')
    .option('--pause-parent', 'Pause parent task (blocked) when currently in_progress')
    .option('--author <name>', 'Author for emitted workflow events')
    .option('--op-id <key>', 'Explicit idempotency key')
    .option('--auto-op-id', 'Generate deterministic idempotency key from normalized input')
    .action(function (this: Command, opts: WorkflowDelegateCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        assertNoConflictingOpFlags(opts);
        if (!opts.from || !opts.title) {
          throw new CLIError('--from and --title are required', ExitCode.InvalidUsage);
        }
        const fromTaskId = resolveId(services, opts.from);
        runWorkflowDelegate({
          services,
          fromTaskId,
          title: opts.title,
          project: opts.project,
          agent: opts.agent,
          dependsOnParent: opts.depends,
          checkpoint: opts.checkpoint,
          pauseParent: opts.pauseParent,
          author: opts.author,
          opId: opts.opId,
          autoOpId: opts.autoOpId,
          json: globalOpts.json ?? false,
        });
      } catch (error) {
        handleError(error, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });

  return command;
}
