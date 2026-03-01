// packages/hzl-cli/src/commands/claim.ts
import { Command } from 'commander';
import { createHash } from 'crypto';
import { readConfig, resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { CLIError, ExitCode, handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { resolveId } from '../../resolve-id.js';
import { parseOptionalInteger } from '../../parse.js';
import { stripEmptyCollections } from '../../strip-empty.js';
import { TaskStatus } from 'hzl-core/events/types.js';
import {
  TaskNotClaimableError,
  type Task,
} from 'hzl-core/services/task-service.js';

export type ClaimView = 'summary' | 'standard' | 'full';

export interface ClaimTaskView {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
  parent_id: string | null;
  agent: string | null;
  due_at?: string | null;
  tags?: string[];
  lease_until?: string | null;
  progress?: number | null;
  claimed_at?: string | null;
  description?: string | null;
  links?: string[];
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

interface DecisionAlternative {
  task_id: string;
  reason_code: string;
  reason: string;
}

interface DecisionTrace {
  version: 'v1';
  mode: 'explicit' | 'next';
  filters: {
    project?: string;
    tags?: string[];
    parent?: string;
    task_id?: string;
  };
  eligibility: {
    status_ready_required: boolean;
    dependencies_done_required: boolean;
    leaf_only_required: boolean;
  };
  outcome: {
    selected: boolean;
    reason_code: string;
    reason: string;
    task_id?: string;
  };
  alternatives: DecisionAlternative[];
}

export interface ClaimResult {
  task_id: string | null;
  title: string | null;
  status: string | null;
  agent: string | null;
  lease_until: string | null;
  task: ClaimTaskView | null;
  decision_trace: DecisionTrace;
}

interface ClaimCommandOptions {
  next?: boolean;
  project?: string;
  tags?: string;
  parent?: string;
  agent?: string;
  agentId?: string;
  lease?: string;
  stagger?: boolean;
  view?: ClaimView;
}

interface RankedNextCandidate {
  task: Task;
  reason_code: 'eligible' | 'not_ready' | 'dependency_blocked' | 'has_children';
  reason: string;
}

export const DEFAULT_CLAIM_STAGGER_MS = 1000;

function shapeTaskForView(task: Task, view: ClaimView): ClaimTaskView {
  const base: ClaimTaskView = {
    task_id: task.task_id,
    title: task.title,
    project: task.project,
    status: task.status,
    priority: task.priority,
    parent_id: task.parent_id,
    agent: task.agent,
  };

  if (view === 'summary') return base;

  const standard: ClaimTaskView = {
    ...base,
    due_at: task.due_at,
    tags: task.tags,
    lease_until: task.lease_until,
  };

  if (view === 'standard') return standard;

  return {
    ...standard,
    progress: task.progress,
    claimed_at: task.claimed_at,
    description: task.description,
    links: task.links,
    metadata: task.metadata,
    created_at: task.created_at,
    updated_at: task.updated_at,
  };
}

function printClaimResult(result: ClaimResult, json: boolean): void {
  if (json) {
    const output = {
      ...result,
      task: result.task ? stripEmptyCollections(result.task) : null,
    };
    console.log(JSON.stringify(output));
    return;
  }

  if (!result.task_id) {
    console.log('No tasks available');
    return;
  }

  console.log(`✓ Claimed task ${result.task_id}: ${result.title}`);
  if (result.lease_until) {
    console.log(`  Lease until: ${result.lease_until}`);
  }
}

function buildTrace(options: {
  mode: 'explicit' | 'next';
  filters: DecisionTrace['filters'];
  outcome: DecisionTrace['outcome'];
  alternatives?: DecisionAlternative[];
  leafOnly: boolean;
}): DecisionTrace {
  return {
    version: 'v1',
    mode: options.mode,
    filters: options.filters,
    eligibility: {
      status_ready_required: true,
      dependencies_done_required: true,
      leaf_only_required: options.leafOnly,
    },
    outcome: options.outcome,
    alternatives: options.alternatives ?? [],
  };
}

function getRankedNextCandidates(options: {
  services: Services;
  project?: string;
  tags?: string[];
  parent?: string;
}): RankedNextCandidate[] {
  const { services, project, tags, parent } = options;
  const db = services.cacheDb;

  const where: string[] = ["tc.status != 'archived'"];
  const params: Array<string | number> = [];

  if (project) {
    where.push('tc.project = ?');
    params.push(project);
  }

  if (parent) {
    where.push('tc.parent_id = ?');
    params.push(parent);
  }

  if (tags && tags.length > 0) {
    const placeholders = tags.map(() => '?').join(', ');
    where.push(`(SELECT COUNT(DISTINCT tag) FROM task_tags WHERE task_id = tc.task_id AND tag IN (${placeholders})) = ?`);
    params.push(...tags, tags.length);
  }

  const sql = `
    SELECT
      tc.task_id,
      tc.status,
      EXISTS (
        SELECT 1
        FROM task_dependencies td
        JOIN tasks_current dep ON td.depends_on_id = dep.task_id
        WHERE td.task_id = tc.task_id AND dep.status != 'done'
      ) AS dependency_blocked,
      EXISTS (
        SELECT 1
        FROM tasks_current child
        WHERE child.parent_id = tc.task_id
      ) AS has_children
    FROM tasks_current tc
    WHERE ${where.join(' AND ')}
    ORDER BY tc.priority DESC, (tc.due_at IS NULL) ASC, tc.due_at ASC, tc.created_at ASC, tc.task_id ASC
  `;

  const rows = db.prepare(sql).all(...params) as Array<{
    task_id: string;
    status: TaskStatus;
    dependency_blocked: number;
    has_children: number;
  }>;

  const ranked: RankedNextCandidate[] = [];

  for (const row of rows) {
    const task = services.taskService.getTaskById(row.task_id);
    if (!task) continue;

    if (row.status !== TaskStatus.Ready) {
      ranked.push({
        task,
        reason_code: 'not_ready',
        reason: `Task status is ${row.status}; requires ready`,
      });
      continue;
    }

    if (row.dependency_blocked) {
      ranked.push({
        task,
        reason_code: 'dependency_blocked',
        reason: 'Dependencies are not done',
      });
      continue;
    }

    if (row.has_children) {
      ranked.push({
        task,
        reason_code: 'has_children',
        reason: 'Task has children and is not auto-claim eligible',
      });
      continue;
    }

    ranked.push({
      task,
      reason_code: 'eligible',
      reason: 'Eligible by status/dependencies/leaf filters',
    });
  }

  return ranked;
}

export function runClaim(options: {
  services: Services;
  taskId: string;
  agent?: string;
  agentId?: string;
  leaseMinutes?: number;
  view?: ClaimView;
  json: boolean;
}): ClaimResult {
  const { services, taskId, agent, agentId, leaseMinutes, view = 'standard', json } = options;

  const existingTask = services.taskService.getTaskById(taskId);
  if (!existingTask) {
    const trace = buildTrace({
      mode: 'explicit',
      filters: { task_id: taskId },
      leafOnly: false,
      outcome: {
        selected: false,
        reason_code: 'not_found',
        reason: `Task not found: ${taskId}`,
      },
    });
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound, undefined, { decision_trace: trace }, ['hzl task list']);
  }

  if (existingTask.status !== TaskStatus.Ready) {
    const trace = buildTrace({
      mode: 'explicit',
      filters: { task_id: taskId },
      leafOnly: false,
      outcome: {
        selected: false,
        reason_code: 'not_ready',
        reason: `Task status is ${existingTask.status}; requires ready`,
        task_id: taskId,
      },
    });

    throw new CLIError(
      `Task ${taskId} is not claimable (status: ${existingTask.status})`,
      ExitCode.InvalidInput,
      undefined,
      { decision_trace: trace },
      [`hzl task set-status ${taskId} ready`]
    );
  }

  const blockers = services.taskService.getBlockingDependencies(taskId);
  if (blockers.length > 0) {
    const trace = buildTrace({
      mode: 'explicit',
      filters: { task_id: taskId },
      leafOnly: false,
      outcome: {
        selected: false,
        reason_code: 'dependency_blocked',
        reason: `Dependencies are not done: ${blockers.join(', ')}`,
        task_id: taskId,
      },
      alternatives: blockers.slice(0, 3).map((blockingTaskId) => ({
        task_id: blockingTaskId,
        reason_code: 'dependency_blocked',
        reason: 'Blocking dependency is not done',
      })),
    });

    throw new CLIError(
      `Task ${taskId} has dependencies not done: ${blockers.join(', ')}`,
      ExitCode.InvalidInput,
      undefined,
      { decision_trace: trace },
      blockers.slice(0, 3).map(id => `hzl task show ${id}`)
    );
  }

  const leaseUntil = leaseMinutes ? new Date(Date.now() + leaseMinutes * 60000).toISOString() : undefined;

  let task: Task;
  try {
    task = services.taskService.claimTask(taskId, {
      author: agent,
      agent_id: agentId,
      lease_until: leaseUntil,
    });
  } catch (error) {
    if (error instanceof TaskNotClaimableError) {
      const trace = buildTrace({
        mode: 'explicit',
        filters: { task_id: taskId },
        leafOnly: false,
        outcome: {
          selected: false,
          reason_code: 'claim_failed',
          reason: error.message,
          task_id: taskId,
        },
      });
      throw new CLIError(error.message, ExitCode.InvalidInput, undefined, { decision_trace: trace });
    }
    throw error;
  }

  const decisionTrace = buildTrace({
    mode: 'explicit',
    filters: { task_id: task.task_id },
    leafOnly: false,
    outcome: {
      selected: true,
      reason_code: 'claimed',
      reason: 'Task was claimed successfully',
      task_id: task.task_id,
    },
  });

  const result: ClaimResult = {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
    agent: task.agent,
    lease_until: task.lease_until,
    task: shapeTaskForView(task, view),
    decision_trace: decisionTrace,
  };

  printClaimResult(result, json);
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
  view?: ClaimView;
  json: boolean;
}): ClaimResult {
  const { services, project, tags, parent, agent, agentId, leaseMinutes, view = 'standard', json } = options;

  if (parent) {
    const parentTask = services.taskService.getTaskById(parent);
    if (!parentTask) {
      throw new CLIError(`Parent task not found: ${parent}`, ExitCode.NotFound);
    }
  }

  const ranked = getRankedNextCandidates({ services, project, tags, parent });
  const eligible = ranked.filter((candidate) => candidate.reason_code === 'eligible');

  if (eligible.length === 0) {
    const alternatives = ranked
      .slice(0, 3)
      .map((candidate) => ({
        task_id: candidate.task.task_id,
        reason_code: candidate.reason_code,
        reason: candidate.reason,
      }));

    const result: ClaimResult = {
      task_id: null,
      title: null,
      status: null,
      agent: null,
      lease_until: null,
      task: null,
      decision_trace: buildTrace({
        mode: 'next',
        filters: {
          ...(project ? { project } : {}),
          ...(tags && tags.length > 0 ? { tags } : {}),
          ...(parent ? { parent } : {}),
        },
        leafOnly: true,
        outcome: {
          selected: false,
          reason_code: 'no_candidates',
          reason: 'No eligible tasks matched filters',
        },
        alternatives,
      }),
    };

    printClaimResult(result, json);
    return result;
  }

  const selected = eligible[0].task;
  const leaseUntil = leaseMinutes ? new Date(Date.now() + leaseMinutes * 60000).toISOString() : undefined;

  let task: Task;
  try {
    task = services.taskService.claimTask(selected.task_id, {
      author: agent,
      agent_id: agentId,
      lease_until: leaseUntil,
    });
  } catch (error) {
    const trace = buildTrace({
      mode: 'next',
      filters: {
        ...(project ? { project } : {}),
        ...(tags && tags.length > 0 ? { tags } : {}),
        ...(parent ? { parent } : {}),
      },
      leafOnly: true,
      outcome: {
        selected: false,
        reason_code: 'claim_failed',
        reason: error instanceof Error ? error.message : String(error),
        task_id: selected.task_id,
      },
      alternatives: eligible.slice(1, 4).map((candidate) => ({
        task_id: candidate.task.task_id,
        reason_code: 'eligible',
        reason: 'Eligible alternative candidate',
      })),
    });

    throw new CLIError(
      `Failed to claim selected task ${selected.task_id}`,
      ExitCode.InvalidInput,
      undefined,
      { decision_trace: trace }
    );
  }

  const result: ClaimResult = {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
    agent: task.agent,
    lease_until: task.lease_until,
    task: shapeTaskForView(task, view),
    decision_trace: buildTrace({
      mode: 'next',
      filters: {
        ...(project ? { project } : {}),
        ...(tags && tags.length > 0 ? { tags } : {}),
        ...(parent ? { parent } : {}),
      },
      leafOnly: true,
      outcome: {
        selected: true,
        reason_code: 'claimed',
        reason: 'Highest-ranked eligible task was claimed',
        task_id: task.task_id,
      },
      alternatives: eligible.slice(1, 4).map((candidate) => ({
        task_id: candidate.task.task_id,
        reason_code: 'eligible',
        reason: 'Eligible alternative candidate',
      })),
    }),
  };

  printClaimResult(result, json);
  return result;
}

export function calculateClaimStaggerOffsetMs(agent: string, windowMs: number, nowMs: number): number {
  if (windowMs <= 0) return 0;
  const bucket = Math.floor(nowMs / windowMs);
  const seed = `${agent}:${bucket}`;
  const hash = createHash('sha256').update(seed).digest();
  const value = hash.readUInt32BE(0);
  return value % windowMs;
}

async function applyClaimStagger(options: {
  enabled: boolean;
  agent?: string;
  windowMs: number;
  nowMs?: number;
}): Promise<void> {
  const { enabled, agent, windowMs, nowMs = Date.now() } = options;
  if (!enabled || !agent || windowMs <= 0) return;

  const delayMs = calculateClaimStaggerOffsetMs(agent, windowMs, nowMs);
  if (delayMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
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
    .option('--view <view>', 'Response view: summary | standard | full', 'standard')
    .option('--no-stagger', 'Disable deterministic anti-herd delay for --next claims')
    .action(async function (this: Command, rawTaskId: string | undefined, opts: ClaimCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const leaseMinutes = parseOptionalInteger(opts.lease, 'Lease', { min: 1 });
        if (opts.next) {
          if (rawTaskId) {
            throw new CLIError('Cannot use <taskId> with --next', ExitCode.InvalidUsage);
          }
          const parent = opts.parent ? resolveId(services, opts.parent) : undefined;
          const config = readConfig();
          const staggerWindowMs = config.claimStaggerMs ?? DEFAULT_CLAIM_STAGGER_MS;
          await applyClaimStagger({
            enabled: opts.stagger !== false,
            agent: opts.agent,
            windowMs: staggerWindowMs,
          });
          runClaimNext({
            services,
            project: opts.project,
            tags: opts.tags?.split(',').map((tag) => tag.trim()).filter(Boolean),
            parent,
            agent: opts.agent,
            agentId: opts.agentId,
            leaseMinutes,
            view: opts.view ?? 'standard',
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
            leaseMinutes,
            view: opts.view ?? 'standard',
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
