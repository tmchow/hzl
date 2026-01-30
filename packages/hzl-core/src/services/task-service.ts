// packages/hzl-core/src/services/task-service.ts
import type Database from 'better-sqlite3';
import { EventStore } from '../events/store.js';
import { EventType, TaskStatus, type TaskCreatedData } from '../events/types.js';
import { ProjectionEngine } from '../projections/engine.js';
import { withWriteTransaction } from '../db/connection.js';
import { generateId } from '../utils/id.js';

export interface CreateTaskInput {
  title: string;
  project: string;
  parent_id?: string;
  description?: string;
  links?: string[];
  depends_on?: string[];
  tags?: string[];
  priority?: number;
  due_at?: string;
  metadata?: Record<string, unknown>;
}

export interface EventContext {
  author?: string;
  agent_id?: string;
  session_id?: string;
  correlation_id?: string;
  causation_id?: string;
}

export interface ClaimTaskOptions extends EventContext {
  lease_until?: string;
}

export interface ClaimNextOptions {
  author?: string;
  agent_id?: string;
  project?: string;
  tags?: string[];
  lease_until?: string;
}

export interface Task {
  task_id: string;
  title: string;
  project: string;
  status: TaskStatus;
  parent_id: string | null;
  description: string | null;
  links: string[];
  tags: string[];
  priority: number;
  due_at: string | null;
  metadata: Record<string, unknown>;
  claimed_at: string | null;
  claimed_by_author: string | null;
  claimed_by_agent_id: string | null;
  lease_until: string | null;
  created_at: string;
  updated_at: string;
}

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`);
  }
}

export class TaskNotClaimableError extends Error {
  constructor(taskId: string, reason: string) {
    super(`Task ${taskId} is not claimable: ${reason}`);
  }
}

export class DependenciesNotDoneError extends Error {
  constructor(taskId: string, pendingDeps: string[]) {
    super(`Task ${taskId} has dependencies not done: ${pendingDeps.join(', ')}`);
  }
}

export class TaskService {
  private getIncompleteDepsStmt: Database.Statement;

  constructor(
    private db: Database.Database,
    private eventStore: EventStore,
    private projectionEngine: ProjectionEngine
  ) {
    this.getIncompleteDepsStmt = db.prepare(`
      SELECT td.depends_on_id
      FROM task_dependencies td
      LEFT JOIN tasks_current tc ON tc.task_id = td.depends_on_id
      WHERE td.task_id = ?
        AND (tc.status IS NULL OR tc.status != 'done')
    `);
  }

  createTask(input: CreateTaskInput, ctx?: EventContext): Task {
    const taskId = generateId();

    const eventData: TaskCreatedData = {
      title: input.title,
      project: input.project,
      parent_id: input.parent_id,
      description: input.description,
      links: input.links,
      depends_on: input.depends_on,
      tags: input.tags,
      priority: input.priority,
      due_at: input.due_at,
      metadata: input.metadata,
    };

    Object.keys(eventData).forEach((key) => {
      if ((eventData as any)[key] === undefined) {
        delete (eventData as any)[key];
      }
    });

    const task = withWriteTransaction(this.db, () => {
      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.TaskCreated,
        data: eventData,
        author: ctx?.author,
        agent_id: ctx?.agent_id,
        session_id: ctx?.session_id,
        correlation_id: ctx?.correlation_id,
        causation_id: ctx?.causation_id,
      });

      this.projectionEngine.applyEvent(event);
      return this.getTaskById(taskId);
    });

    if (!task) {
      throw new Error(`Failed to create task: task not found after creation`);
    }
    return task;
  }

  claimTask(taskId: string, opts?: ClaimTaskOptions): Task {
    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);

      if (task.status !== TaskStatus.Ready) {
        throw new TaskNotClaimableError(taskId, `status is ${task.status}, must be ready`);
      }

      const incompleteDeps = this.getIncompleteDepsStmt.all(taskId) as { depends_on_id: string }[];
      if (incompleteDeps.length > 0) {
        throw new DependenciesNotDoneError(taskId, incompleteDeps.map(d => d.depends_on_id));
      }

      const eventData: any = {
        from: TaskStatus.Ready,
        to: TaskStatus.InProgress,
      };
      if (opts?.lease_until) eventData.lease_until = opts.lease_until;

      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.StatusChanged,
        data: eventData,
        author: opts?.author,
        agent_id: opts?.agent_id,
      });

      this.projectionEngine.applyEvent(event);
      return this.getTaskById(taskId)!;
    });
  }

  setStatus(taskId: string, toStatus: TaskStatus, ctx?: EventContext): Task {
    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);

      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.StatusChanged,
        data: { from: task.status, to: toStatus },
        author: ctx?.author,
        agent_id: ctx?.agent_id,
      });

      this.projectionEngine.applyEvent(event);
      return this.getTaskById(taskId)!;
    });
  }

  completeTask(taskId: string, ctx?: EventContext): Task {
    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);
      if (task.status !== TaskStatus.InProgress) {
        throw new Error(`Cannot complete: status is ${task.status}, must be in_progress`);
      }

      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.StatusChanged,
        data: { from: TaskStatus.InProgress, to: TaskStatus.Done },
        author: ctx?.author,
        agent_id: ctx?.agent_id,
      });

      this.projectionEngine.applyEvent(event);
      return this.getTaskById(taskId)!;
    });
  }

  claimNext(opts: ClaimNextOptions = {}): Task | null {
    return withWriteTransaction(this.db, () => {
      let candidate: any;

      if (opts.tags && opts.tags.length > 0) {
        const tagPlaceholders = opts.tags.map(() => '?').join(', ');
        const tagCount = opts.tags.length;

        let query = `
          SELECT tc.task_id FROM tasks_current tc
          WHERE tc.status = 'ready'
            AND NOT EXISTS (
              SELECT 1 FROM task_dependencies td
              JOIN tasks_current dep ON td.depends_on_id = dep.task_id
              WHERE td.task_id = tc.task_id AND dep.status != 'done'
            )
            AND (SELECT COUNT(DISTINCT tag) FROM task_tags WHERE task_id = tc.task_id AND tag IN (${tagPlaceholders})) = ?
        `;
        const params: any[] = [...opts.tags, tagCount];

        if (opts.project) {
          query += ' AND tc.project = ?';
          params.push(opts.project);
        }
        query += ' ORDER BY tc.priority DESC, tc.created_at ASC, tc.task_id ASC LIMIT 1';
        candidate = this.db.prepare(query).get(...params);
      } else if (opts.project) {
        candidate = this.db.prepare(`
          SELECT tc.task_id FROM tasks_current tc
          WHERE tc.status = 'ready' AND tc.project = ?
            AND NOT EXISTS (
              SELECT 1 FROM task_dependencies td
              JOIN tasks_current dep ON td.depends_on_id = dep.task_id
              WHERE td.task_id = tc.task_id AND dep.status != 'done'
            )
          ORDER BY tc.priority DESC, tc.created_at ASC, tc.task_id ASC LIMIT 1
        `).get(opts.project);
      } else {
        candidate = this.db.prepare(`
          SELECT tc.task_id FROM tasks_current tc
          WHERE tc.status = 'ready'
            AND NOT EXISTS (
              SELECT 1 FROM task_dependencies td
              JOIN tasks_current dep ON td.depends_on_id = dep.task_id
              WHERE td.task_id = tc.task_id AND dep.status != 'done'
            )
          ORDER BY tc.priority DESC, tc.created_at ASC, tc.task_id ASC LIMIT 1
        `).get();
      }

      if (!candidate) return null;

      const event = this.eventStore.append({
        task_id: candidate.task_id,
        type: EventType.StatusChanged,
        data: { from: TaskStatus.Ready, to: TaskStatus.InProgress, lease_until: opts.lease_until },
        author: opts.author,
        agent_id: opts.agent_id,
      });

      this.projectionEngine.applyEvent(event);
      return this.getTaskById(candidate.task_id);
    });
  }

  releaseTask(taskId: string, opts?: { reason?: string } & EventContext): Task {
    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);
      if (task.status !== TaskStatus.InProgress) {
        throw new Error(`Cannot release: status is ${task.status}, expected in_progress`);
      }

      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.StatusChanged,
        data: { from: TaskStatus.InProgress, to: TaskStatus.Ready, reason: opts?.reason },
        author: opts?.author,
        agent_id: opts?.agent_id,
      });

      this.projectionEngine.applyEvent(event);
      return this.getTaskById(taskId)!;
    });
  }

  archiveTask(taskId: string, opts?: { reason?: string } & EventContext): Task {
    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);
      if (task.status === TaskStatus.Archived) {
        throw new Error('Task is already archived');
      }

      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.TaskArchived,
        data: { reason: opts?.reason },
        author: opts?.author,
        agent_id: opts?.agent_id,
      });

      this.projectionEngine.applyEvent(event);
      return this.getTaskById(taskId)!;
    });
  }

  reopenTask(taskId: string, opts?: { to_status?: TaskStatus.Ready | TaskStatus.Backlog; reason?: string } & EventContext): Task {
    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);
      if (task.status !== TaskStatus.Done) {
        throw new Error(`Cannot reopen: status is ${task.status}, expected done`);
      }

      const toStatus = opts?.to_status ?? TaskStatus.Ready;

      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.StatusChanged,
        data: { from: TaskStatus.Done, to: toStatus, reason: opts?.reason },
        author: opts?.author,
        agent_id: opts?.agent_id,
      });

      this.projectionEngine.applyEvent(event);
      return this.getTaskById(taskId)!;
    });
  }

  getTaskById(taskId: string): Task | null {
    const row = this.db.prepare(
      'SELECT * FROM tasks_current WHERE task_id = ?'
    ).get(taskId) as any;
    if (!row) return null;
    return this.rowToTask(row);
  }

  private rowToTask(row: any): Task {
    return {
      task_id: row.task_id,
      title: row.title,
      project: row.project,
      status: row.status as TaskStatus,
      parent_id: row.parent_id,
      description: row.description,
      links: JSON.parse(row.links),
      tags: JSON.parse(row.tags),
      priority: row.priority,
      due_at: row.due_at,
      metadata: JSON.parse(row.metadata),
      claimed_at: row.claimed_at,
      claimed_by_author: row.claimed_by_author,
      claimed_by_agent_id: row.claimed_by_agent_id,
      lease_until: row.lease_until,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
