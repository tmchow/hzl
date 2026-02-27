import { createHash } from 'node:crypto';
import type Database from 'libsql';
import { EventType, TaskStatus } from '../events/types.js';
import type { EventStore } from '../events/store.js';
import type { ProjectionEngine } from '../projections/engine.js';
import {
  TaskNotFoundError,
  type Task,
  type TaskService,
} from './task-service.js';

export type WorkflowName = 'start' | 'handoff' | 'delegate';
export type ResumePolicy = 'first' | 'latest' | 'priority';
export type OthersLimit = number | 'all';

export interface WorkflowSummary {
  name: WorkflowName;
  description: string;
}

export interface WorkflowArgSpec {
  name: string;
  required: boolean;
  description: string;
  default?: string;
}

export interface WorkflowDefinition {
  name: WorkflowName;
  description: string;
  supports_auto_op_id: boolean;
  args: WorkflowArgSpec[];
  notes: string[];
}

export interface WorkflowIdempotencyMetadata {
  op_id: string | null;
  scope: string;
  auto_generated: boolean;
  replayed: boolean;
  table_available: boolean;
}

export interface WorkflowTaskView {
  task_id: string;
  title: string;
  project: string;
  status: TaskStatus;
  priority: number;
  agent: string | null;
  lease_until: string | null;
}

export interface WorkflowStartInput {
  agent: string;
  project?: string;
  tags?: string[];
  lease_minutes?: number;
  resume_policy?: ResumePolicy;
  include_others?: boolean;
  others_limit?: OthersLimit;
  op_id?: string;
  auto_op_id?: boolean;
}

export interface WorkflowStartResult {
  workflow: 'start';
  mode: 'resume' | 'claim_next' | 'none';
  selected: WorkflowTaskView | null;
  filters: {
    project?: string;
    tags?: string[];
  };
  in_progress_count: number;
  others_total: number;
  others: WorkflowTaskView[];
  idempotency: WorkflowIdempotencyMetadata;
}

export interface WorkflowHandoffInput {
  from_task_id: string;
  title: string;
  project?: string;
  agent?: string;
  carry_checkpoints?: number;
  carry_max_chars?: number;
  author?: string;
  op_id?: string;
  auto_op_id?: boolean;
}

export interface WorkflowHandoffResult {
  workflow: 'handoff';
  source_task_id: string;
  follow_on: WorkflowTaskView;
  carried_checkpoint_count: number;
  carried_chars: number;
  idempotency: WorkflowIdempotencyMetadata;
}

export interface WorkflowDelegateInput {
  from_task_id: string;
  title: string;
  project?: string;
  agent?: string;
  depends_on_parent?: boolean;
  checkpoint?: string;
  pause_parent?: boolean;
  author?: string;
  op_id?: string;
  auto_op_id?: boolean;
}

export interface WorkflowDelegateResult {
  workflow: 'delegate';
  source_task_id: string;
  delegated: WorkflowTaskView;
  dependency_added: boolean;
  checkpoint_added: boolean;
  parent_paused: boolean;
  idempotency: WorkflowIdempotencyMetadata;
}

interface OpTableInfo {
  db: Database.Database;
}

const WORKFLOW_OP_PROCESSING_STALE_MS = 30 * 60 * 1000;

const WORKFLOW_DEFINITIONS: Record<WorkflowName, WorkflowDefinition> = {
  start: {
    name: 'start',
    description: 'Resume in-progress work for an agent, otherwise claim next eligible task.',
    supports_auto_op_id: false,
    args: [
      { name: '--agent <name>', required: true, description: 'Agent identity to resume/claim for.' },
      { name: '--project <project>', required: false, description: 'Optional project filter.' },
      { name: '--tags <csv>', required: false, description: 'Optional required tags filter.' },
      { name: '--lease <minutes>', required: false, description: 'Optional lease refresh/claim duration.' },
      {
        name: '--resume-policy <policy>',
        required: false,
        description: 'Resume policy: first | latest | priority.',
        default: 'priority',
      },
      { name: '--op-id <key>', required: false, description: 'Explicit idempotency key for retries.' },
    ],
    notes: [
      '--auto-op-id is intentionally unsupported for start because polling calls may legitimately return different tasks over time.',
      'Alternates are bounded by others_limit unless explicitly set to all.',
    ],
  },
  handoff: {
    name: 'handoff',
    description: 'Complete a source task and create a follow-on task with carried checkpoint context.',
    supports_auto_op_id: true,
    args: [
      { name: '--from <task-id>', required: true, description: 'Source task id.' },
      { name: '--title <title>', required: true, description: 'Follow-on task title.' },
      { name: '--project <project>', required: false, description: 'Optional target project.' },
      { name: '--agent <agent>', required: false, description: 'Optional follow-on assignee.' },
      { name: '--carry-checkpoints <n>', required: false, description: 'Number of checkpoints to carry.', default: '3' },
      { name: '--carry-max-chars <n>', required: false, description: 'Maximum carried context chars.', default: '4000' },
      { name: '--op-id <key>', required: false, description: 'Explicit idempotency key.' },
      { name: '--auto-op-id', required: false, description: 'Generate deterministic idempotency key from normalized input.' },
    ],
    notes: [
      'Guardrail: requires --agent, --project, or both to avoid accidental implicit queue routing.',
    ],
  },
  delegate: {
    name: 'delegate',
    description: 'Create delegated work from a source task, with dependency gating by default.',
    supports_auto_op_id: true,
    args: [
      { name: '--from <task-id>', required: true, description: 'Source task id.' },
      { name: '--title <title>', required: true, description: 'Delegated task title.' },
      { name: '--project <project>', required: false, description: 'Optional target project.' },
      { name: '--agent <agent>', required: false, description: 'Optional delegated assignee.' },
      { name: '--no-depends', required: false, description: 'Disable default parent->delegated dependency edge.' },
      { name: '--checkpoint <text>', required: false, description: 'Checkpoint text recorded on source task.' },
      { name: '--pause-parent', required: false, description: 'Set parent task to blocked when currently in_progress.' },
      { name: '--op-id <key>', required: false, description: 'Explicit idempotency key.' },
      { name: '--auto-op-id', required: false, description: 'Generate deterministic idempotency key from normalized input.' },
    ],
    notes: [
      'Default dependency edge provides availability gating; strict blocking requires --pause-parent.',
    ],
  },
};

export class WorkflowService {
  constructor(
    private cacheDb: Database.Database,
    private eventStore: EventStore,
    private projectionEngine: ProjectionEngine,
    private taskService: TaskService,
    private idempotencyDb?: Database.Database
  ) {}

  listWorkflows(): WorkflowSummary[] {
    return (Object.values(WORKFLOW_DEFINITIONS) as WorkflowDefinition[]).map((definition) => ({
      name: definition.name,
      description: definition.description,
    }));
  }

  showWorkflow(name: WorkflowName): WorkflowDefinition {
    return WORKFLOW_DEFINITIONS[name];
  }

  runStart(input: WorkflowStartInput): WorkflowStartResult {
    const resumePolicy = input.resume_policy ?? 'priority';
    const includeOthers = input.include_others ?? true;
    const othersLimit = this.normalizeOthersLimit(input.others_limit);

    if (input.auto_op_id) {
      throw new Error(
        '--auto-op-id is not supported for workflow run start; use --op-id only for intentional retries.'
      );
    }

    return this.withIdempotency(
      'start',
      {
        agent: input.agent,
        project: input.project ?? null,
        tags: [...(input.tags ?? [])].sort(),
        lease_minutes: input.lease_minutes ?? null,
        resume_policy: resumePolicy,
        include_others: includeOthers,
        others_limit: othersLimit,
      },
      input.op_id,
      false,
      () => {
        const resumeCandidates = this.getInProgressCandidates({
          agent: input.agent,
          project: input.project,
          tags: input.tags,
          resume_policy: resumePolicy,
        });
        const selectedResume = resumeCandidates[0];
        if (selectedResume) {
          let selectedTask = this.taskService.getTaskById(selectedResume.task_id)!;
          if (input.lease_minutes !== undefined) {
            selectedTask = this.refreshLease(selectedTask, input.agent, input.lease_minutes);
          }

          const otherCandidates = resumeCandidates.slice(1).map((task) => this.toTaskView(task));
          return {
            workflow: 'start',
            mode: 'resume',
            selected: this.toTaskView(selectedTask),
            filters: this.buildFilters(input.project, input.tags),
            in_progress_count: resumeCandidates.length,
            others_total: otherCandidates.length,
            others: includeOthers ? this.boundOthers(otherCandidates, othersLimit) : [],
          } satisfies Omit<WorkflowStartResult, 'idempotency'>;
        }

        const claimCandidates = this.taskService.getAvailableTasks({
          project: input.project,
          tagsAll: input.tags,
          leafOnly: true,
        });

        let claimedTask: Task | null = null;
        let claimedIndex = -1;
        for (let index = 0; index < claimCandidates.length; index += 1) {
          const candidate = claimCandidates[index];
          try {
            claimedTask = this.taskService.claimTask(candidate.task_id, {
              author: input.agent,
              lease_until:
                input.lease_minutes !== undefined
                  ? new Date(Date.now() + input.lease_minutes * 60000).toISOString()
                  : undefined,
            });
            claimedIndex = index;
            break;
          } catch {
            continue;
          }
        }

        if (!claimedTask) {
          return {
            workflow: 'start',
            mode: 'none',
            selected: null,
            filters: this.buildFilters(input.project, input.tags),
            in_progress_count: 0,
            others_total: 0,
            others: [],
          } satisfies Omit<WorkflowStartResult, 'idempotency'>;
        }

        const alternatives = claimCandidates
          .filter((_, index) => index !== claimedIndex)
          .map((task) => this.toTaskView(this.taskService.getTaskById(task.task_id)!));

        return {
          workflow: 'start',
          mode: 'claim_next',
          selected: this.toTaskView(claimedTask),
          filters: this.buildFilters(input.project, input.tags),
          in_progress_count: 0,
          others_total: alternatives.length,
          others: includeOthers ? this.boundOthers(alternatives, othersLimit) : [],
        } satisfies Omit<WorkflowStartResult, 'idempotency'>;
      }
    );
  }

  runHandoff(input: WorkflowHandoffInput): WorkflowHandoffResult {
    const carryCheckpoints = input.carry_checkpoints ?? 3;
    const carryMaxChars = input.carry_max_chars ?? 4000;

    return this.withIdempotency(
      'handoff',
      {
        from_task_id: input.from_task_id,
        ...(input.auto_op_id
          ? { from_last_event_id: this.getTaskLastEventId(input.from_task_id) }
          : {}),
        title: input.title,
        project: input.project ?? null,
        agent: input.agent ?? null,
        carry_checkpoints: carryCheckpoints,
        carry_max_chars: carryMaxChars,
      },
      input.op_id,
      Boolean(input.auto_op_id),
      () => {
        const source = this.taskService.getTaskById(input.from_task_id);
        if (!source) {
          throw new TaskNotFoundError(input.from_task_id);
        }

        if (!input.agent && !input.project) {
          throw new Error(
            'handoff requires --agent, --project, or both. Omitting --agent creates a pool-routed task - specify --project to define the queue.'
          );
        }

        if (source.status !== TaskStatus.InProgress && source.status !== TaskStatus.Blocked) {
          throw new Error(
            `Cannot handoff task ${source.task_id}: status is ${source.status}, expected in_progress or blocked.`
          );
        }

        const checkpoints = this.taskService.getCheckpoints(source.task_id);
        const carried = checkpoints.slice(-Math.max(0, carryCheckpoints));
        const carriedText = this.buildCarriedCheckpointContext(carried, carryMaxChars);
        const carriedDescription = this.sliceByBudget(carriedText, Math.min(2500, carryMaxChars));
        const carriedCheckpointText = this.sliceByBudget(
          carriedText.length > carriedDescription.length
            ? carriedText.slice(carriedDescription.length)
            : carriedText,
          Math.min(1500, Math.max(0, carryMaxChars - carriedDescription.length))
        );

        const targetProject = input.project ?? source.project;
        const description = carriedDescription
          ? `Handoff context from ${source.task_id}:\n\n${carriedDescription}`
          : undefined;

        const followOnTask = this.taskService.createTask(
          {
            title: input.title,
            project: targetProject,
            description,
            agent: input.agent,
            initial_status: TaskStatus.Ready,
          },
          { author: input.author }
        );

        try {
          if (carriedCheckpointText) {
            this.taskService.addCheckpoint(
              followOnTask.task_id,
              `Handoff context from ${source.task_id}`,
              { text: carriedCheckpointText },
              { author: input.author }
            );
          }

          // Complete source last so failures earlier do not mark source done without follow-on context.
          this.taskService.completeTask(source.task_id, { author: input.author });
        } catch (error) {
          // Best-effort rollback: archive the follow-on if handoff could not complete end-to-end.
          try {
            this.taskService.archiveTask(followOnTask.task_id, {
              author: input.author,
              comment: `handoff rollback: ${source.task_id} completion failed`,
            });
          } catch {
            // Swallow rollback failure; original error is more actionable.
          }
          throw error;
        }

        return {
          workflow: 'handoff',
          source_task_id: source.task_id,
          follow_on: this.toTaskView(followOnTask),
          carried_checkpoint_count: carried.length,
          carried_chars: carriedText.length,
        } satisfies Omit<WorkflowHandoffResult, 'idempotency'>;
      }
    );
  }

  runDelegate(input: WorkflowDelegateInput): WorkflowDelegateResult {
    const addDependency = input.depends_on_parent ?? true;

    return this.withIdempotency(
      'delegate',
      {
        from_task_id: input.from_task_id,
        ...(input.auto_op_id
          ? { from_last_event_id: this.getTaskLastEventId(input.from_task_id) }
          : {}),
        title: input.title,
        project: input.project ?? null,
        agent: input.agent ?? null,
        depends_on_parent: addDependency,
        checkpoint: input.checkpoint ?? null,
        pause_parent: Boolean(input.pause_parent),
      },
      input.op_id,
      Boolean(input.auto_op_id),
      () => {
        const source = this.taskService.getTaskById(input.from_task_id);
        if (!source) {
          throw new TaskNotFoundError(input.from_task_id);
        }

        const delegated = this.taskService.createTask(
          {
            title: input.title,
            project: input.project ?? source.project,
            agent: input.agent,
            initial_status: TaskStatus.Ready,
          },
          { author: input.author }
        );

        let dependencyAdded = false;
        let checkpointAdded = false;
        let parentPaused = false;

        try {
          if (addDependency) {
            const depEvent = this.eventStore.append({
              task_id: source.task_id,
              type: EventType.DependencyAdded,
              data: { depends_on_id: delegated.task_id },
              author: input.author,
            });
            this.projectionEngine.applyEvent(depEvent);
            dependencyAdded = true;
          }

          if (input.checkpoint?.trim()) {
            this.taskService.addCheckpoint(
              source.task_id,
              'Delegated follow-on created',
              {
                delegated_task_id: delegated.task_id,
                delegated_title: delegated.title,
                note: input.checkpoint.trim(),
              },
              { author: input.author }
            );
            checkpointAdded = true;
          }

          if (input.pause_parent && source.status === TaskStatus.InProgress) {
            this.taskService.blockTask(source.task_id, {
              author: input.author,
              comment: `Delegated blocking work to ${delegated.task_id}; pause parent until dependency clears.`,
            });
            parentPaused = true;
          }
        } catch (error) {
          // Best-effort rollback for partial delegate operations.
          if (parentPaused) {
            try {
              this.taskService.unblockTask(source.task_id, {
                author: input.author,
                comment: `delegate rollback: unable to complete delegation to ${delegated.task_id}`,
              });
            } catch {
              // Ignore rollback failure; preserve original error.
            }
          }

          if (dependencyAdded) {
            try {
              const removeDepEvent = this.eventStore.append({
                task_id: source.task_id,
                type: EventType.DependencyRemoved,
                data: { depends_on_id: delegated.task_id },
                author: input.author,
              });
              this.projectionEngine.applyEvent(removeDepEvent);
            } catch {
              // Ignore rollback failure; preserve original error.
            }
          }

          try {
            this.taskService.archiveTask(delegated.task_id, {
              author: input.author,
              comment: `delegate rollback: ${source.task_id}`,
            });
          } catch {
            // Ignore rollback failure; preserve original error.
          }

          throw error;
        }

        return {
          workflow: 'delegate',
          source_task_id: source.task_id,
          delegated: this.toTaskView(delegated),
          dependency_added: dependencyAdded,
          checkpoint_added: checkpointAdded,
          parent_paused: parentPaused,
        } satisfies Omit<WorkflowDelegateResult, 'idempotency'>;
      }
    );
  }

  private withIdempotency<T extends Record<string, unknown>>(
    workflow: WorkflowName,
    inputForHash: Record<string, unknown>,
    explicitOpId: string | undefined,
    autoOpId: boolean,
    operation: () => T
  ): T & { idempotency: WorkflowIdempotencyMetadata } {
    if (explicitOpId && autoOpId) {
      throw new Error('Cannot use --op-id and --auto-op-id together.');
    }

    const scope = `workflow:${workflow}`;
    const inputHash = this.hashWorkflowInput(scope, inputForHash);
    const resolvedOpId =
      explicitOpId ?? (autoOpId ? this.computeAutoOpId(workflow, inputHash) : undefined);
    const autoGenerated = Boolean(!explicitOpId && autoOpId && resolvedOpId);

    const opTable = this.getOpTableInfo();
    if (resolvedOpId && opTable) {
      const claimState = this.claimWorkflowOp(opTable, resolvedOpId, workflow, inputHash);
      if (claimState === 'completed') {
        const replay = this.loadWorkflowOp(opTable, resolvedOpId);
        if (replay?.result_payload) {
          return {
            ...replay.result_payload,
            idempotency: {
              op_id: resolvedOpId,
              scope,
              auto_generated: autoGenerated,
              replayed: true,
              table_available: true,
            },
          } as T & { idempotency: WorkflowIdempotencyMetadata };
        }
        throw new Error(`op_id '${resolvedOpId}' is completed but has no cached result.`);
      }
      if (claimState === 'processing') {
        throw new Error(`op_id '${resolvedOpId}' is already processing.`);
      }

      try {
        const result = operation();
        this.storeWorkflowOpResult(opTable, resolvedOpId, result);
        return {
          ...result,
          idempotency: {
            op_id: resolvedOpId,
            scope,
            auto_generated: autoGenerated,
            replayed: false,
            table_available: true,
          },
        };
      } catch (error) {
        this.storeWorkflowOpError(opTable, resolvedOpId, error);
        throw error;
      }
    }

    const result = operation();
    return {
      ...result,
      idempotency: {
        op_id: resolvedOpId ?? null,
        scope,
        auto_generated: autoGenerated,
        replayed: false,
        table_available: Boolean(opTable),
      },
    };
  }

  private getInProgressCandidates(options: {
    agent: string;
    project?: string;
    tags?: string[];
    resume_policy: ResumePolicy;
  }): Task[] {
    const where: string[] = ["status = 'in_progress'", 'agent = ?'];
    const params: Array<string | number> = [options.agent];

    if (options.project) {
      where.push('project = ?');
      params.push(options.project);
    }

    if (options.tags && options.tags.length > 0) {
      where.push(
        `(SELECT COUNT(DISTINCT tt.tag) FROM task_tags tt WHERE tt.task_id = tasks_current.task_id AND tt.tag IN (${options.tags.map(() => '?').join(', ')})) = ?`
      );
      params.push(...options.tags, options.tags.length);
    }

    const orderBy = this.buildResumeOrder(options.resume_policy);
    const rows = this.cacheDb
      .prepare(
        `
      SELECT task_id
      FROM tasks_current
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
    `
      )
      .all(...params) as Array<{ task_id: string }>;

    return rows
      .map((row) => this.taskService.getTaskById(row.task_id))
      .filter((task): task is Task => task !== null);
  }

  private buildResumeOrder(policy: ResumePolicy): string {
    if (policy === 'first') {
      return 'claimed_at ASC, created_at ASC, task_id ASC';
    }
    if (policy === 'latest') {
      return 'claimed_at DESC, updated_at DESC, task_id ASC';
    }
    return 'priority DESC, (due_at IS NULL) ASC, due_at ASC, claimed_at ASC, task_id ASC';
  }

  private refreshLease(task: Task, agent: string, leaseMinutes: number): Task {
    const leaseUntil = new Date(Date.now() + leaseMinutes * 60000).toISOString();
    const event = this.eventStore.append({
      task_id: task.task_id,
      type: EventType.StatusChanged,
      data: {
        from: TaskStatus.InProgress,
        to: TaskStatus.InProgress,
        lease_until: leaseUntil,
        agent,
      },
      author: agent,
    });
    this.projectionEngine.applyEvent(event);
    return this.taskService.getTaskById(task.task_id)!;
  }

  private toTaskView(task: Task): WorkflowTaskView {
    return {
      task_id: task.task_id,
      title: task.title,
      project: task.project,
      status: task.status,
      priority: task.priority,
      agent: task.agent,
      lease_until: task.lease_until,
    };
  }

  private boundOthers(tasks: WorkflowTaskView[], limit: OthersLimit): WorkflowTaskView[] {
    if (limit === 'all') return tasks;
    return tasks.slice(0, limit);
  }

  private normalizeOthersLimit(limit: OthersLimit | undefined): OthersLimit {
    if (limit === 'all') return 'all';
    if (limit === undefined) return 5;
    return Math.max(0, limit);
  }

  private buildFilters(project?: string, tags?: string[]): { project?: string; tags?: string[] } {
    return {
      ...(project ? { project } : {}),
      ...(tags && tags.length > 0 ? { tags } : {}),
    };
  }

  private buildCarriedCheckpointContext(
    checkpoints: Array<{ name: string; data: Record<string, unknown>; timestamp: string }>,
    maxChars: number
  ): string {
    if (checkpoints.length === 0 || maxChars <= 0) return '';
    const lines: string[] = [];
    for (const checkpoint of checkpoints) {
      const payload = Object.keys(checkpoint.data).length
        ? ` ${JSON.stringify(checkpoint.data)}`
        : '';
      lines.push(`[${checkpoint.timestamp}] ${checkpoint.name}${payload}`);
    }
    return this.sliceByBudget(lines.join('\n'), maxChars);
  }

  private sliceByBudget(text: string, maxChars: number): string {
    if (maxChars <= 0) return '';
    if (text.length <= maxChars) return text;
    return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
  }

  private getTaskLastEventId(taskId: string): number | null {
    const row = this.cacheDb
      .prepare('SELECT last_event_id FROM tasks_current WHERE task_id = ?')
      .get(taskId) as { last_event_id: number } | undefined;
    return row?.last_event_id ?? null;
  }

  private hashWorkflowInput(scope: string, input: Record<string, unknown>): string {
    const canonical = stableStringify({ scope, input });
    return createHash('sha256').update(canonical).digest('hex');
  }

  private computeAutoOpId(workflow: WorkflowName, inputHash: string): string {
    const shortHash = inputHash.slice(0, 24);
    return `wf_${workflow}_${shortHash}`;
  }

  private getOpTableInfo(): OpTableInfo | null {
    const dbs = this.idempotencyDb && this.idempotencyDb !== this.cacheDb
      ? [this.idempotencyDb, this.cacheDb]
      : [this.cacheDb];

    for (const db of dbs) {
      const exists = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workflow_ops'")
        .get() as { name: string } | undefined;
      if (exists) return { db };
    }

    return null;
  }

  private loadWorkflowOp(
    table: OpTableInfo,
    opId: string
  ): {
    workflow_name: string;
    input_hash: string;
    state: 'processing' | 'completed' | 'failed';
    updated_at: string;
    result_payload: Record<string, unknown> | null;
    error_payload: Record<string, unknown> | null;
  } | null {
    const row = table.db
      .prepare(
        `
        SELECT workflow_name, input_hash, state, updated_at, result_payload, error_payload
        FROM workflow_ops
        WHERE op_id = ?
        LIMIT 1
      `
      )
      .get(opId) as
      | {
          workflow_name: string;
          input_hash: string;
          state: 'processing' | 'completed' | 'failed';
          updated_at: string;
          result_payload: string | null;
          error_payload: string | null;
        }
      | undefined;
    if (!row) return null;

    return {
      workflow_name: row.workflow_name,
      input_hash: row.input_hash,
      state: row.state,
      updated_at: row.updated_at,
      result_payload: parseJsonObject(row.result_payload),
      error_payload: parseJsonObject(row.error_payload),
    };
  }

  private claimWorkflowOp(
    table: OpTableInfo,
    opId: string,
    workflow: WorkflowName,
    inputHash: string
  ): 'claimed' | 'completed' | 'processing' {
    const now = new Date().toISOString();
    const insertResult = table.db
      .prepare(
        `
        INSERT INTO workflow_ops (op_id, workflow_name, input_hash, state, created_at, updated_at)
        VALUES (?, ?, ?, 'processing', ?, ?)
        ON CONFLICT(op_id) DO NOTHING
      `
      )
      .run(opId, workflow, inputHash, now, now);

    if (((insertResult as { changes?: number }).changes ?? 0) === 1) return 'claimed';

    const existing = this.loadWorkflowOp(table, opId);
    if (!existing) return 'processing';
    if (existing.workflow_name !== workflow || existing.input_hash !== inputHash) {
      throw new Error(`op_id '${opId}' was already used with different workflow input.`);
    }
    if (existing.state === 'completed') return 'completed';
    if (existing.state === 'processing') {
      const updatedAtMs = Date.parse(existing.updated_at);
      const isStale =
        Number.isFinite(updatedAtMs) &&
        Date.now() - updatedAtMs >= WORKFLOW_OP_PROCESSING_STALE_MS;
      if (!isStale) return 'processing';

      const staleReclaimResult = table.db
        .prepare(
          `
          UPDATE workflow_ops
          SET state = 'processing', updated_at = ?, error_payload = NULL
          WHERE op_id = ? AND state = 'processing' AND updated_at = ?
        `
        )
        .run(now, opId, existing.updated_at);
      return ((staleReclaimResult as { changes?: number }).changes ?? 0) === 1
        ? 'claimed'
        : 'processing';
    }

    const reclaimResult = table.db
      .prepare(
        `
        UPDATE workflow_ops
        SET state = 'processing', updated_at = ?, error_payload = NULL
        WHERE op_id = ? AND state = 'failed'
      `
      )
      .run(now, opId);
    return ((reclaimResult as { changes?: number }).changes ?? 0) === 1 ? 'claimed' : 'processing';
  }

  private storeWorkflowOpResult(
    table: OpTableInfo,
    opId: string,
    result: Record<string, unknown>
  ): void {
    const now = new Date().toISOString();
    table.db
      .prepare(
        `
        UPDATE workflow_ops
        SET state = 'completed',
            result_payload = ?,
            error_payload = NULL,
            updated_at = ?
        WHERE op_id = ?
      `
      )
      .run(JSON.stringify(result), now, opId);
  }

  private storeWorkflowOpError(
    table: OpTableInfo,
    opId: string,
    error: unknown
  ): void {
    const now = new Date().toISOString();
    const payload = {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : 'Error',
    };
    table.db
      .prepare(
        `
        UPDATE workflow_ops
        SET state = 'failed',
            error_payload = ?,
            updated_at = ?
        WHERE op_id = ?
      `
      )
      .run(JSON.stringify(payload), now, opId);
  }
}

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export class UnknownWorkflowError extends Error {
  constructor(name: string) {
    super(`Unknown workflow: ${name}`);
  }
}

export function parseWorkflowName(name: string): WorkflowName {
  if (name === 'start' || name === 'handoff' || name === 'delegate') {
    return name;
  }
  throw new UnknownWorkflowError(name);
}
