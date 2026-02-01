// packages/hzl-core/src/services/task-service.ts
import type Database from 'libsql';
import { EventStore } from '../events/store.js';
import {
  EventType,
  TaskStatus,
  type StatusChangedData,
  type TaskCreatedData,
} from '../events/types.js';
import { ProjectionEngine } from '../projections/engine.js';
import { withWriteTransaction } from '../db/transaction.js';
import { generateId } from '../utils/id.js';
import { ProjectService } from './project-service.js';

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

export interface StealOptions {
  ifExpired?: boolean;
  force?: boolean;
  author?: string;
  agent_id?: string;
  lease_until?: string;
}

export interface StealResult {
  success: boolean;
  error?: string;
}

export interface StuckTask {
  task_id: string;
  title: string;
  project: string;
  claimed_at: string;
  claimed_by_author: string | null;
  claimed_by_agent_id: string | null;
  lease_until: string | null;
}

export interface AvailableTask {
  task_id: string;
  title: string;
  project: string;
  status: TaskStatus;
  priority: number;
  created_at: string;
  tags: string[];
}

export interface Comment {
  event_rowid: number;
  task_id: string;
  author?: string;
  agent_id?: string;
  text: string;
  timestamp: string;
}

export interface Checkpoint {
  event_rowid: number;
  task_id: string;
  name: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface TaskListItem {
  task_id: string;
  title: string;
  project: string;
  status: TaskStatus;
  priority: number;
  claimed_by_agent_id: string | null;
  lease_until: string | null;
  updated_at: string;
}

export interface TaskStats {
  total: number;
  byStatus: Record<string, number>;
  projects: string[];
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

type TaskRow = {
  task_id: string;
  title: string;
  project: string;
  status: TaskStatus;
  parent_id: string | null;
  description: string | null;
  links: string;
  tags: string;
  priority: number;
  due_at: string | null;
  metadata: string;
  claimed_at: string | null;
  claimed_by_author: string | null;
  claimed_by_agent_id: string | null;
  lease_until: string | null;
  created_at: string;
  updated_at: string;
};

type TaskIdRow = { task_id: string };

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
  private getSubtasksStmt: Database.Statement;

  constructor(
    private db: Database.Database,
    private eventStore: EventStore,
    private projectionEngine: ProjectionEngine,
    private projectService?: ProjectService
  ) {
    this.getIncompleteDepsStmt = db.prepare(`
      SELECT td.depends_on_id
      FROM task_dependencies td
      LEFT JOIN tasks_current tc ON tc.task_id = td.depends_on_id
      WHERE td.task_id = ?
        AND (tc.status IS NULL OR tc.status != 'done')
    `);

    this.getSubtasksStmt = db.prepare(`
      SELECT task_id, title, project, status, parent_id, description,
             links, tags, priority, due_at, metadata,
             claimed_at, claimed_by_author, claimed_by_agent_id, lease_until,
             created_at, updated_at
      FROM tasks_current
      WHERE parent_id = ?
      ORDER BY priority DESC, created_at ASC
    `);
  }

  createTask(input: CreateTaskInput, ctx?: EventContext): Task {
    if (this.projectService) {
      this.projectService.requireProject(input.project);
    }

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

    const cleanedEventData = Object.fromEntries(
      Object.entries(eventData).filter(([, value]) => value !== undefined)
    ) as TaskCreatedData;

    const task = withWriteTransaction(this.db, () => {
      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.TaskCreated,
        data: cleanedEventData,
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

  moveTask(taskId: string, toProject: string, ctx?: EventContext): Task {
    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);

      if (this.projectService) {
        this.projectService.requireProject(toProject);
      }

      if (task.project !== toProject) {
        const event = this.eventStore.append({
          task_id: taskId,
          type: EventType.TaskMoved,
          data: { from_project: task.project, to_project: toProject },
          author: ctx?.author,
          agent_id: ctx?.agent_id,
          session_id: ctx?.session_id,
          correlation_id: ctx?.correlation_id,
          causation_id: ctx?.causation_id,
        });

        this.projectionEngine.applyEvent(event);
      }

      return this.getTaskById(taskId)!;
    });
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

      const eventData: StatusChangedData = {
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
      let candidate: TaskIdRow | undefined;

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
        const params: Array<string | number> = [...opts.tags, tagCount];

        if (opts.project) {
          query += ' AND tc.project = ?';
          params.push(opts.project);
        }
        query += ' ORDER BY tc.priority DESC, tc.created_at ASC, tc.task_id ASC LIMIT 1';
        candidate = this.db.prepare(query).get(...params) as TaskIdRow | undefined;
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
        `).get(opts.project) as TaskIdRow | undefined;
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
        `).get() as TaskIdRow | undefined;
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

  stealTask(taskId: string, opts: StealOptions): StealResult {
    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) return { success: false, error: `Task ${taskId} not found` };
      if (task.status !== TaskStatus.InProgress) {
        return { success: false, error: `Task ${taskId} is not in_progress` };
      }

      if (!opts.force) {
        if (opts.ifExpired) {
          const now = new Date().toISOString();
          if (task.lease_until && task.lease_until >= now) {
            return { success: false, error: `Task ${taskId} lease has not expired` };
          }
        } else {
          return { success: false, error: 'Must specify either force=true or ifExpired=true' };
        }
      }

      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.StatusChanged,
        data: { from: TaskStatus.InProgress, to: TaskStatus.InProgress, reason: 'stolen', lease_until: opts.lease_until },
        author: opts.author,
        agent_id: opts.agent_id,
      });

      this.projectionEngine.applyEvent(event);

      // Update claim info
      this.db.prepare(`
        UPDATE tasks_current SET
          claimed_at = ?, claimed_by_author = ?, claimed_by_agent_id = ?, lease_until = ?, updated_at = ?, last_event_id = ?
        WHERE task_id = ?
      `).run(new Date().toISOString(), opts.author ?? null, opts.agent_id ?? null, opts.lease_until ?? null, new Date().toISOString(), event.rowid, taskId);

      return { success: true };
    });
  }

  getStuckTasks(opts: { project?: string; olderThan: number }): StuckTask[] {
    const cutoffTime = new Date(Date.now() - opts.olderThan).toISOString();

    let query = `
      SELECT task_id, title, project, claimed_at, claimed_by_author, claimed_by_agent_id, lease_until
      FROM tasks_current WHERE status = 'in_progress' AND claimed_at < ?
    `;
    const params: Array<string | number> = [cutoffTime];

    if (opts.project) {
      query += ' AND project = ?';
      params.push(opts.project);
    }
    query += ' ORDER BY claimed_at ASC';

    return this.db.prepare(query).all(...params) as StuckTask[];
  }

  areAllDepsDone(taskId: string): boolean {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM task_dependencies td
      JOIN tasks_current tc ON td.depends_on_id = tc.task_id
      WHERE td.task_id = ? AND tc.status != 'done'
    `).get(taskId) as { count: number };
    return result.count === 0;
  }

  isTaskAvailable(taskId: string): boolean {
    const task = this.getTaskById(taskId);
    if (!task) return false;
    if (task.status !== TaskStatus.Ready) return false;
    return this.areAllDepsDone(taskId);
  }

  getAvailableTasks(opts: { project?: string; tagsAny?: string[]; tagsAll?: string[]; limit?: number }): AvailableTask[] {
    let query = `
      SELECT tc.task_id, tc.title, tc.project, tc.status, tc.priority, tc.created_at, tc.tags
      FROM tasks_current tc
      WHERE tc.status = 'ready'
        AND NOT EXISTS (
          SELECT 1 FROM task_dependencies td
          JOIN tasks_current dep ON td.depends_on_id = dep.task_id
          WHERE td.task_id = tc.task_id AND dep.status != 'done'
        )
    `;
    const params: Array<string | number> = [];

    if (opts.project) {
      query += ' AND tc.project = ?';
      params.push(opts.project);
    }

    if (opts.tagsAny?.length) {
      query += ` AND EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = tc.task_id AND tt.tag IN (${opts.tagsAny.map(() => '?').join(',')}))`;
      params.push(...opts.tagsAny);
    }

    if (opts.tagsAll?.length) {
      query += ` AND (SELECT COUNT(DISTINCT tt.tag) FROM task_tags tt WHERE tt.task_id = tc.task_id AND tt.tag IN (${opts.tagsAll.map(() => '?').join(',')})) = ?`;
      params.push(...opts.tagsAll, opts.tagsAll.length);
    }

    query += ' ORDER BY tc.priority DESC, tc.created_at ASC, tc.task_id ASC';

    if (opts.limit) {
      query += ' LIMIT ?';
      params.push(opts.limit);
    }

    const rows = this.db.prepare(query).all(...params) as Array<{
      task_id: string;
      title: string;
      project: string;
      status: TaskStatus;
      priority: number;
      created_at: string;
      tags: string | null;
    }>;
    return rows.map((row) => ({
      task_id: row.task_id,
      title: row.title,
      project: row.project,
      status: row.status,
      priority: row.priority,
      created_at: row.created_at,
      tags: JSON.parse(row.tags ?? '[]') as string[],
    }));
  }

  getTaskById(taskId: string): Task | null {
    const row = this.db.prepare(
      'SELECT * FROM tasks_current WHERE task_id = ?'
    ).get(taskId) as TaskRow | undefined;
    if (!row) return null;
    return this.rowToTask(row);
  }

  getSubtasks(taskId: string): Task[] {
    const rows = this.getSubtasksStmt.all(taskId) as TaskRow[];
    return rows.map((row) => this.rowToTask(row));
  }

  addComment(taskId: string, text: string, opts?: EventContext): Comment {
    if (!text?.trim()) throw new Error('Comment text cannot be empty');
    const task = this.getTaskById(taskId);
    if (!task) throw new TaskNotFoundError(taskId);

    return withWriteTransaction(this.db, () => {
      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.CommentAdded,
        data: { text },
        author: opts?.author,
        agent_id: opts?.agent_id,
      });
      this.projectionEngine.applyEvent(event);
      return { event_rowid: event.rowid, task_id: taskId, author: opts?.author, agent_id: opts?.agent_id, text, timestamp: event.timestamp };
    });
  }

  addCheckpoint(taskId: string, name: string, data?: Record<string, unknown>, opts?: EventContext): Checkpoint {
    if (!name?.trim()) throw new Error('Checkpoint name cannot be empty');
    const task = this.getTaskById(taskId);
    if (!task) throw new TaskNotFoundError(taskId);

    const checkpointData = data ?? {};
    return withWriteTransaction(this.db, () => {
      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.CheckpointRecorded,
        data: { name, data: checkpointData },
        author: opts?.author,
        agent_id: opts?.agent_id,
      });
      this.projectionEngine.applyEvent(event);
      return { event_rowid: event.rowid, task_id: taskId, name, data: checkpointData, timestamp: event.timestamp };
    });
  }

  getComments(taskId: string): Comment[] {
    const rows = this.db.prepare(`
      SELECT event_rowid, task_id, author, agent_id, text, timestamp
      FROM task_comments WHERE task_id = ? ORDER BY event_rowid ASC
    `).all(taskId) as Array<{
      event_rowid: number;
      task_id: string;
      author: string | null;
      agent_id: string | null;
      text: string;
      timestamp: string;
    }>;
    return rows.map((r) => ({
      event_rowid: r.event_rowid,
      task_id: r.task_id,
      author: r.author ?? undefined,
      agent_id: r.agent_id ?? undefined,
      text: r.text,
      timestamp: r.timestamp,
    }));
  }

  getCheckpoints(taskId: string): Checkpoint[] {
    const rows = this.db.prepare(`
      SELECT event_rowid, task_id, name, data, timestamp
      FROM task_checkpoints WHERE task_id = ? ORDER BY event_rowid ASC
    `).all(taskId) as Array<{
      event_rowid: number;
      task_id: string;
      name: string;
      data: string;
      timestamp: string;
    }>;
    return rows.map((r) => ({
      event_rowid: r.event_rowid,
      task_id: r.task_id,
      name: r.name,
      data: JSON.parse(r.data) as Record<string, unknown>,
      timestamp: r.timestamp,
    }));
  }

  /**
   * List tasks with optional filtering by date range and project.
   * Used by the web dashboard.
   */
  listTasks(opts: { sinceDays?: number; project?: string } = {}): TaskListItem[] {
    const { sinceDays = 3, project } = opts;
    const dateOffset = `-${sinceDays} days`;

    let rows: TaskRow[];
    if (project) {
      rows = this.db.prepare(`
        SELECT task_id, title, project, status, priority,
               claimed_by_agent_id, lease_until, updated_at,
               parent_id, description, links, tags, due_at, metadata,
               claimed_at, claimed_by_author, created_at
        FROM tasks_current
        WHERE status != 'archived'
          AND updated_at >= datetime('now', ?)
          AND project = ?
        ORDER BY priority DESC, updated_at DESC
      `).all(dateOffset, project) as TaskRow[];
    } else {
      rows = this.db.prepare(`
        SELECT task_id, title, project, status, priority,
               claimed_by_agent_id, lease_until, updated_at,
               parent_id, description, links, tags, due_at, metadata,
               claimed_at, claimed_by_author, created_at
        FROM tasks_current
        WHERE status != 'archived'
          AND updated_at >= datetime('now', ?)
        ORDER BY priority DESC, updated_at DESC
      `).all(dateOffset) as TaskRow[];
    }

    return rows.map((row) => ({
      task_id: row.task_id,
      title: row.title,
      project: row.project,
      status: row.status,
      priority: row.priority,
      claimed_by_agent_id: row.claimed_by_agent_id,
      lease_until: row.lease_until,
      updated_at: row.updated_at,
    }));
  }

  /**
   * Get a map of task_id -> array of blocking task ids.
   * A task is blocked if it's in 'ready' status but has incomplete dependencies.
   */
  getBlockedByMap(): Map<string, string[]> {
    const rows = this.db.prepare(`
      SELECT tc.task_id, GROUP_CONCAT(td.depends_on_id) as blocked_by
      FROM tasks_current tc
      JOIN task_dependencies td ON tc.task_id = td.task_id
      JOIN tasks_current dep ON td.depends_on_id = dep.task_id
      WHERE tc.status = 'ready' AND dep.status != 'done'
      GROUP BY tc.task_id
    `).all() as Array<{ task_id: string; blocked_by: string }>;

    const map = new Map<string, string[]>();
    for (const row of rows) {
      map.set(row.task_id, row.blocked_by.split(','));
    }
    return map;
  }

  /**
   * Get task statistics: total count, count by status, and list of projects.
   */
  getStats(): TaskStats {
    const statusRows = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM tasks_current
      WHERE status != 'archived'
      GROUP BY status
    `).all() as Array<{ status: string; count: number }>;

    const projectRows = this.db.prepare(`
      SELECT DISTINCT project FROM tasks_current WHERE status != 'archived' ORDER BY project
    `).all() as Array<{ project: string }>;

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of statusRows) {
      byStatus[row.status] = row.count;
      total += row.count;
    }

    return {
      total,
      byStatus,
      projects: projectRows.map((r) => r.project),
    };
  }

  /**
   * Get incomplete (blocking) dependencies for a task.
   */
  getBlockingDependencies(taskId: string): string[] {
    const rows = this.db.prepare(`
      SELECT td.depends_on_id
      FROM task_dependencies td
      JOIN tasks_current dep ON td.depends_on_id = dep.task_id
      WHERE td.task_id = ? AND dep.status != 'done'
    `).all(taskId) as Array<{ depends_on_id: string }>;
    return rows.map((r) => r.depends_on_id);
  }

  /**
   * Get task titles for multiple task IDs in a single batched query.
   * Used by the web dashboard to avoid N+1 queries when fetching event titles.
   */
  getTaskTitlesByIds(taskIds: string[]): Map<string, string> {
    const titleMap = new Map<string, string>();
    if (taskIds.length === 0) return titleMap;

    const placeholders = taskIds.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT task_id, title FROM tasks_current WHERE task_id IN (${placeholders})
    `).all(...taskIds) as Array<{ task_id: string; title: string }>;

    for (const row of rows) {
      titleMap.set(row.task_id, row.title);
    }
    return titleMap;
  }

  private rowToTask(row: TaskRow): Task {
    return {
      task_id: row.task_id,
      title: row.title,
      project: row.project,
      status: row.status,
      parent_id: row.parent_id,
      description: row.description,
      links: JSON.parse(row.links) as string[],
      tags: JSON.parse(row.tags) as string[],
      priority: row.priority,
      due_at: row.due_at,
      metadata: JSON.parse(row.metadata) as Record<string, unknown>,
      claimed_at: row.claimed_at,
      claimed_by_author: row.claimed_by_author,
      claimed_by_agent_id: row.claimed_by_agent_id,
      lease_until: row.lease_until,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
