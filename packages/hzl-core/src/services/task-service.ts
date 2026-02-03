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
  assignee?: string;
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
  assignee?: string;
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
  assignee: string | null;
  lease_until: string | null;
}

export interface PrunableTask {
  task_id: string;
  title: string;
  project: string;
  status: 'done' | 'archived';
  terminal_since: string; // ISO timestamp
  parent_id: string | null;
}

export interface PruneOptions {
  project?: string; // Specific project or undefined for all
  olderThanDays: number;
  asOf?: string; // ISO timestamp for deterministic pruning
}

export interface PruneResult {
  pruned: PrunableTask[];
  count: number;
  eventsDeleted: number;
}

export interface AvailableTask {
  task_id: string;
  title: string;
  project: string;
  status: TaskStatus;
  priority: number;
  created_at: string;
  tags: string[];
  parent_id: string | null;
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
  assignee: string | null;
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
  assignee: string | null;
  progress: number | null;
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
  assignee: string | null;
  progress: number | null;
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

export class CrossProjectDependencyError extends Error {
  constructor(taskProject: string, depTaskId: string, depProject: string) {
    super(
      `Cross-project dependencies not supported: task in project '${taskProject}' cannot depend on task ${depTaskId} in project '${depProject}'`
    );
  }
}

/**
 * Validate progress value is an integer between 0 and 100.
 * @throws Error if progress is invalid
 */
function validateProgress(progress: number): void {
  if (progress < 0 || progress > 100 || !Number.isInteger(progress)) {
    throw new Error('Progress must be an integer between 0 and 100');
  }
}

export class TaskService {
  private getIncompleteDepsStmt: Database.Statement;
  private getSubtasksStmt: Database.Statement;
  private getTaskByIdStmt: Database.Statement;

  constructor(
    private db: Database.Database, // cache database
    private eventStore: EventStore,
    private projectionEngine: ProjectionEngine,
    private projectService?: ProjectService,
    private eventsDb?: Database.Database // events database for pruning
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
             claimed_at, assignee, progress, lease_until,
             created_at, updated_at
      FROM tasks_current
      WHERE parent_id = ?
      ORDER BY priority DESC, created_at ASC
    `);

    this.getTaskByIdStmt = db.prepare(`
      SELECT task_id, title, project, status, parent_id, description,
             links, tags, priority, due_at, metadata,
             claimed_at, assignee, progress, lease_until,
             created_at, updated_at
      FROM tasks_current
      WHERE task_id = ?
    `);
  }

  createTask(input: CreateTaskInput, ctx?: EventContext): Task {
    if (this.projectService) {
      this.projectService.requireProject(input.project);
    }

    // Validate dependencies are in the same project (cross-project deps not supported)
    if (input.depends_on && input.depends_on.length > 0) {
      for (const depId of input.depends_on) {
        const depTask = this.getTaskById(depId);
        if (depTask && depTask.project !== input.project) {
          throw new CrossProjectDependencyError(input.project, depId, depTask.project);
        }
      }
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
      assignee: input.assignee,
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

  /**
   * Move a task and all its subtasks to a new project atomically.
   * All operations happen within a single transaction to ensure consistency.
   */
  moveWithSubtasks(
    taskId: string,
    toProject: string,
    ctx?: EventContext
  ): { task: Task; subtaskCount: number } {
    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);

      if (this.projectService) {
        this.projectService.requireProject(toProject);
      }

      const fromProject = task.project;
      let subtaskCount = 0;

      if (fromProject !== toProject) {
        // Move the parent task
        const moveEvent = this.eventStore.append({
          task_id: taskId,
          type: EventType.TaskMoved,
          data: { from_project: fromProject, to_project: toProject },
          author: ctx?.author,
          agent_id: ctx?.agent_id,
          session_id: ctx?.session_id,
          correlation_id: ctx?.correlation_id,
          causation_id: ctx?.causation_id,
        });
        this.projectionEngine.applyEvent(moveEvent);

        // Move all subtasks (fetched inside transaction for consistency)
        const subtasks = this.getSubtasks(taskId);
        for (const subtask of subtasks) {
          const subtaskMoveEvent = this.eventStore.append({
            task_id: subtask.task_id,
            type: EventType.TaskMoved,
            data: { from_project: fromProject, to_project: toProject },
            author: ctx?.author,
            agent_id: ctx?.agent_id,
            session_id: ctx?.session_id,
            correlation_id: ctx?.correlation_id,
            causation_id: ctx?.causation_id,
          });
          this.projectionEngine.applyEvent(subtaskMoveEvent);
          subtaskCount++;
        }
      }

      return {
        task: this.getTaskById(taskId)!,
        subtaskCount,
      };
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
      // Allow completing from both in_progress and blocked status
      if (task.status !== TaskStatus.InProgress && task.status !== TaskStatus.Blocked) {
        throw new Error(`Cannot complete: status is ${task.status}, must be in_progress or blocked`);
      }

      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.StatusChanged,
        data: { from: task.status, to: TaskStatus.Done },
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
        const assigneeForPriority = opts.assignee ?? opts.author ?? opts.agent_id ?? '';
        query += ' ORDER BY tc.priority DESC, (tc.assignee = ?) DESC, tc.created_at ASC, tc.task_id ASC LIMIT 1';
        params.push(assigneeForPriority);
        candidate = this.db.prepare(query).get(...params) as TaskIdRow | undefined;
      } else if (opts.project) {
        const assigneeForPriority = opts.assignee ?? opts.author ?? opts.agent_id ?? '';
        candidate = this.db.prepare(`
          SELECT tc.task_id FROM tasks_current tc
          WHERE tc.status = 'ready' AND tc.project = ?
            AND NOT EXISTS (
              SELECT 1 FROM task_dependencies td
              JOIN tasks_current dep ON td.depends_on_id = dep.task_id
              WHERE td.task_id = tc.task_id AND dep.status != 'done'
            )
          ORDER BY tc.priority DESC, (tc.assignee = ?) DESC, tc.created_at ASC, tc.task_id ASC LIMIT 1
        `).get(opts.project, assigneeForPriority) as TaskIdRow | undefined;
      } else {
        const assigneeForPriority = opts.assignee ?? opts.author ?? opts.agent_id ?? '';
        candidate = this.db.prepare(`
          SELECT tc.task_id FROM tasks_current tc
          WHERE tc.status = 'ready'
            AND NOT EXISTS (
              SELECT 1 FROM task_dependencies td
              JOIN tasks_current dep ON td.depends_on_id = dep.task_id
              WHERE td.task_id = tc.task_id AND dep.status != 'done'
            )
          ORDER BY tc.priority DESC, (tc.assignee = ?) DESC, tc.created_at ASC, tc.task_id ASC LIMIT 1
        `).get(assigneeForPriority) as TaskIdRow | undefined;
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

  /**
   * Block a task that is stuck waiting for external dependencies.
   * Only tasks in 'in_progress' status can be blocked.
   */
  blockTask(taskId: string, opts?: { reason?: string } & EventContext): Task {
    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);
      if (task.status !== TaskStatus.InProgress) {
        throw new Error(`Cannot block: status is ${task.status}, expected in_progress`);
      }

      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.StatusChanged,
        data: { from: TaskStatus.InProgress, to: TaskStatus.Blocked, reason: opts?.reason },
        author: opts?.author,
        agent_id: opts?.agent_id,
      });

      this.projectionEngine.applyEvent(event);
      return this.getTaskById(taskId)!;
    });
  }

  /**
   * Unblock a blocked task, returning it to work.
   * By default returns to 'in_progress', use release=true to return to 'ready'.
   */
  unblockTask(taskId: string, opts?: { release?: boolean; reason?: string } & EventContext): Task {
    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);
      if (task.status !== TaskStatus.Blocked) {
        throw new Error(`Cannot unblock: status is ${task.status}, expected blocked`);
      }

      const toStatus = opts?.release ? TaskStatus.Ready : TaskStatus.InProgress;

      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.StatusChanged,
        data: { from: TaskStatus.Blocked, to: toStatus, reason: opts?.reason },
        author: opts?.author,
        agent_id: opts?.agent_id,
      });

      this.projectionEngine.applyEvent(event);
      return this.getTaskById(taskId)!;
    });
  }

  /**
   * Set progress (0-100) on a task.
   * Implemented via CheckpointRecorded event with auto-generated checkpoint name.
   */
  setProgress(taskId: string, progress: number, opts?: EventContext): Task {
    validateProgress(progress);

    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);

      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.CheckpointRecorded,
        data: { name: `Progress updated to ${progress}%`, progress },
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

      return { success: true };
    });
  }

  getStuckTasks(opts: { project?: string; olderThan: number }): StuckTask[] {
    const cutoffTime = new Date(Date.now() - opts.olderThan).toISOString();

    let query = `
      SELECT task_id, title, project, claimed_at, assignee, lease_until
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

  getAvailableTasks(opts: { project?: string; tagsAny?: string[]; tagsAll?: string[]; limit?: number; leafOnly?: boolean }): AvailableTask[] {
    let query = `
      SELECT tc.task_id, tc.title, tc.project, tc.status, tc.priority, tc.created_at, tc.tags, tc.parent_id
      FROM tasks_current tc
      WHERE tc.status = 'ready'
        AND NOT EXISTS (
          SELECT 1 FROM task_dependencies td
          JOIN tasks_current dep ON td.depends_on_id = dep.task_id
          WHERE td.task_id = tc.task_id AND dep.status != 'done'
        )
    `;
    const params: Array<string | number> = [];

    // When leafOnly is true, exclude parent tasks (tasks that have children)
    if (opts.leafOnly) {
      query += ` AND NOT EXISTS (
        SELECT 1 FROM tasks_current child WHERE child.parent_id = tc.task_id
      )`;
    }

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
      parent_id: string | null;
    }>;
    return rows.map((row) => ({
      task_id: row.task_id,
      title: row.title,
      project: row.project,
      status: row.status,
      priority: row.priority,
      created_at: row.created_at,
      tags: JSON.parse(row.tags ?? '[]') as string[],
      parent_id: row.parent_id,
    }));
  }

  /**
   * Get the next available leaf task (task without children) in a single query.
   * Optimized alternative to getAvailableTasks + filter pattern that avoids N+1 queries.
   */
  getNextLeafTask(opts: {
    project?: string;
    tagsAll?: string[];
    parent?: string;
  } = {}): AvailableTask | null {
    let query = `
      SELECT tc.task_id, tc.title, tc.project, tc.status, tc.priority, tc.created_at, tc.tags, tc.parent_id
      FROM tasks_current tc
      WHERE tc.status = 'ready'
        AND NOT EXISTS (
          SELECT 1 FROM task_dependencies td
          JOIN tasks_current dep ON td.depends_on_id = dep.task_id
          WHERE td.task_id = tc.task_id AND dep.status != 'done'
        )
        AND NOT EXISTS (
          SELECT 1 FROM tasks_current child WHERE child.parent_id = tc.task_id
        )
    `;
    const params: Array<string | number> = [];

    if (opts.project) {
      query += ' AND tc.project = ?';
      params.push(opts.project);
    }

    if (opts.tagsAll?.length) {
      query += ` AND (SELECT COUNT(DISTINCT tt.tag) FROM task_tags tt WHERE tt.task_id = tc.task_id AND tt.tag IN (${opts.tagsAll.map(() => '?').join(',')})) = ?`;
      params.push(...opts.tagsAll, opts.tagsAll.length);
    }

    if (opts.parent) {
      query += ' AND tc.parent_id = ?';
      params.push(opts.parent);
    }

    query += ' ORDER BY tc.priority DESC, tc.created_at ASC, tc.task_id ASC LIMIT 1';

    const row = this.db.prepare(query).get(...params) as {
      task_id: string;
      title: string;
      project: string;
      status: TaskStatus;
      priority: number;
      created_at: string;
      tags: string | null;
      parent_id: string | null;
    } | undefined;

    if (!row) return null;

    return {
      task_id: row.task_id,
      title: row.title,
      project: row.project,
      status: row.status,
      priority: row.priority,
      created_at: row.created_at,
      tags: JSON.parse(row.tags ?? '[]') as string[],
      parent_id: row.parent_id,
    };
  }

  getTaskById(taskId: string): Task | null {
    const row = this.getTaskByIdStmt.get(taskId) as TaskRow | undefined;
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

  addCheckpoint(taskId: string, name: string, data?: Record<string, unknown>, opts?: { progress?: number } & EventContext): Checkpoint {
    if (!name?.trim()) throw new Error('Checkpoint name cannot be empty');
    const task = this.getTaskById(taskId);
    if (!task) throw new TaskNotFoundError(taskId);

    if (opts?.progress !== undefined) {
      validateProgress(opts.progress);
    }

    const checkpointData = data ?? {};
    return withWriteTransaction(this.db, () => {
      const eventData: { name: string; data: Record<string, unknown>; progress?: number } = { name, data: checkpointData };
      if (opts?.progress !== undefined) {
        eventData.progress = opts.progress;
      }

      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.CheckpointRecorded,
        data: eventData,
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
               assignee, progress, lease_until, updated_at,
               parent_id, description, links, tags, due_at, metadata,
               claimed_at, created_at
        FROM tasks_current
        WHERE status != 'archived'
          AND updated_at >= datetime('now', ?)
          AND project = ?
        ORDER BY priority DESC, updated_at DESC
      `).all(dateOffset, project) as TaskRow[];
    } else {
      rows = this.db.prepare(`
        SELECT task_id, title, project, status, priority,
               assignee, progress, lease_until, updated_at,
               parent_id, description, links, tags, due_at, metadata,
               claimed_at, created_at
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
      assignee: row.assignee,
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
      SELECT name FROM projects ORDER BY name
    `).all() as Array<{ name: string }>;

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of statusRows) {
      byStatus[row.status] = row.count;
      total += row.count;
    }

    return {
      total,
      byStatus,
      projects: projectRows.map((r) => r.name),
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

  setParent(taskId: string, parentId: string | null, opts?: EventContext): Task {
    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);

      if (parentId === null) {
        // Removing parent - just emit event if parent_id is not already null
        if (task.parent_id !== null) {
          const event = this.eventStore.append({
            task_id: taskId,
            type: EventType.TaskUpdated,
            data: { field: 'parent_id', old_value: task.parent_id, new_value: null },
            author: opts?.author,
            agent_id: opts?.agent_id,
            session_id: opts?.session_id,
            correlation_id: opts?.correlation_id,
            causation_id: opts?.causation_id,
          });
          this.projectionEngine.applyEvent(event);
        }
        return this.getTaskById(taskId)!;
      }

      // Setting parent - validate
      if (parentId === taskId) {
        throw new Error('Task cannot be its own parent');
      }

      const parent = this.getTaskById(parentId);
      if (!parent) throw new Error(`Parent task not found: ${parentId}`);

      if (parent.status === TaskStatus.Archived) {
        throw new Error(`Cannot set archived task as parent: ${parentId}`);
      }

      if (parent.parent_id) {
        throw new Error('Cannot set parent: target is already a subtask (max 1 level of nesting)');
      }

      const children = this.getSubtasks(taskId);
      if (children.length > 0) {
        throw new Error('Cannot make a parent task into a subtask (task has children)');
      }

      // Move to parent's project if different (inline to avoid nested transaction)
      if (task.project !== parent.project) {
        if (this.projectService) {
          this.projectService.requireProject(parent.project);
        }
        const moveEvent = this.eventStore.append({
          task_id: taskId,
          type: EventType.TaskMoved,
          data: { from_project: task.project, to_project: parent.project },
          author: opts?.author,
          agent_id: opts?.agent_id,
          session_id: opts?.session_id,
          correlation_id: opts?.correlation_id,
          causation_id: opts?.causation_id,
        });
        this.projectionEngine.applyEvent(moveEvent);
      }

      // Emit parent_id change event
      if (task.parent_id !== parentId) {
        const event = this.eventStore.append({
          task_id: taskId,
          type: EventType.TaskUpdated,
          data: { field: 'parent_id', old_value: task.parent_id, new_value: parentId },
          author: opts?.author,
          agent_id: opts?.agent_id,
          session_id: opts?.session_id,
          correlation_id: opts?.correlation_id,
          causation_id: opts?.causation_id,
        });
        this.projectionEngine.applyEvent(event);
      }

      return this.getTaskById(taskId)!;
    });
  }

  orphanSubtasks(parentTaskId: string, opts?: EventContext): void {
    const subtasks = this.getSubtasks(parentTaskId);
    for (const subtask of subtasks) {
      const event = this.eventStore.append({
        task_id: subtask.task_id,
        type: EventType.TaskUpdated,
        data: { field: 'parent_id', old_value: parentTaskId, new_value: null },
        author: opts?.author,
        agent_id: opts?.agent_id,
        session_id: opts?.session_id,
        correlation_id: opts?.correlation_id,
        causation_id: opts?.causation_id,
      });
      this.projectionEngine.applyEvent(event);
    }
  }

  /**
   * Archive a task with optional handling of subtasks.
   * All operations happen atomically within a single transaction, with validation
   * performed inside the transaction to prevent race conditions.
   */
  archiveWithSubtasks(
    taskId: string,
    opts: {
      cascade?: boolean;
      orphan?: boolean;
      reason?: string;
    } & EventContext = {}
  ): { task: Task; archivedSubtaskCount: number; orphanedSubtaskCount: number } {
    const { cascade, orphan, reason, ...ctx } = opts;

    if (cascade && orphan) {
      throw new Error('Cannot use both cascade and orphan options');
    }

    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);
      if (task.status === TaskStatus.Archived) {
        throw new Error('Task is already archived');
      }

      // Fetch subtasks inside transaction to prevent race conditions
      const subtasks = this.getSubtasks(taskId);
      const activeSubtasks = subtasks.filter(
        st => st.status !== TaskStatus.Archived && st.status !== TaskStatus.Done
      );

      // Validate: if there are active subtasks, must specify cascade or orphan
      if (activeSubtasks.length > 0 && !cascade && !orphan) {
        throw new Error(
          `Cannot archive task with ${activeSubtasks.length} active subtask(s). ` +
          `Use cascade to archive all subtasks, or orphan to promote subtasks to top-level.`
        );
      }

      let archivedSubtaskCount = 0;
      let orphanedSubtaskCount = 0;

      // Handle cascade: archive active subtasks
      if (cascade && activeSubtasks.length > 0) {
        for (const subtask of activeSubtasks) {
          const archiveEvent = this.eventStore.append({
            task_id: subtask.task_id,
            type: EventType.TaskArchived,
            data: { reason },
            author: ctx.author,
            agent_id: ctx.agent_id,
          });
          this.projectionEngine.applyEvent(archiveEvent);
          archivedSubtaskCount++;
        }
      }

      // Handle orphan: remove parent_id from all subtasks
      if (orphan && subtasks.length > 0) {
        for (const subtask of subtasks) {
          const orphanEvent = this.eventStore.append({
            task_id: subtask.task_id,
            type: EventType.TaskUpdated,
            data: { field: 'parent_id', old_value: taskId, new_value: null },
            author: ctx.author,
            agent_id: ctx.agent_id,
          });
          this.projectionEngine.applyEvent(orphanEvent);
          orphanedSubtaskCount++;
        }
      }

      // Archive the parent task
      const archiveEvent = this.eventStore.append({
        task_id: taskId,
        type: EventType.TaskArchived,
        data: { reason },
        author: ctx.author,
        agent_id: ctx.agent_id,
      });
      this.projectionEngine.applyEvent(archiveEvent);

      return {
        task: this.getTaskById(taskId)!,
        archivedSubtaskCount,
        orphanedSubtaskCount,
      };
    });
  }

  /**
   * Find tasks eligible for pruning (preview only, does not delete).
   * A task is eligible if:
   * 1. Status is 'done' or 'archived'
   * 2. Has been in terminal state for >= olderThanDays
   * 3. If parent: all children must also be eligible
   * 4. If child: parent must also be eligible (atomic family)
   * 5. If dependency target: all dependents must also be eligible
   */
  previewPrunableTasks(opts: PruneOptions): PrunableTask[] {
    const referenceTime = opts.asOf ? new Date(opts.asOf).getTime() : Date.now();
    const thresholdTime = referenceTime - opts.olderThanDays * 24 * 60 * 60 * 1000;
    const thresholdIso = new Date(thresholdTime).toISOString();

    // Query to find eligible tasks using the complex family + dependency logic.
    // NOTE: This query filters by project, which is safe because cross-project
    // dependencies are explicitly prevented at task creation time (see createTask).
    // All dependencies of a task are guaranteed to be in the same project.
    const query = `
      WITH family_status AS (
        SELECT
          t.task_id,
          t.parent_id,
          t.status,
          t.terminal_at,
          -- Check if task itself is terminal and old enough
          CASE WHEN t.status IN ('done', 'archived')
               AND t.terminal_at IS NOT NULL
               AND t.terminal_at < ?
          THEN 1 ELSE 0 END as self_eligible
        FROM tasks_current t
        WHERE (? IS NULL OR t.project = ?)
      ),
      dep_blockers AS (
        -- Tasks that are depended on by non-terminal tasks cannot be pruned.
        -- Safe to use family_status (project-scoped) because cross-project
        -- dependencies are not allowed.
        SELECT DISTINCT d.depends_on_id AS task_id
        FROM task_dependencies d
        JOIN family_status t ON t.task_id = d.task_id
        WHERE t.self_eligible = 0
      ),
      family_eligible AS (
        -- A task is family-eligible only if itself AND all family members are eligible
        SELECT f.task_id, f.status, f.terminal_at
        FROM family_status f
        WHERE f.self_eligible = 1
          -- If has children, all must be eligible
          AND NOT EXISTS (
            SELECT 1 FROM family_status c
            WHERE c.parent_id = f.task_id AND c.self_eligible = 0
          )
          -- If has parent, parent must be eligible
          AND (f.parent_id IS NULL OR EXISTS (
            SELECT 1 FROM family_status p
            WHERE p.task_id = f.parent_id AND p.self_eligible = 1
          ))
          -- Not depended on by any non-eligible task
          AND NOT EXISTS (SELECT 1 FROM dep_blockers b WHERE b.task_id = f.task_id)
      )
      SELECT
        task_id,
        title,
        project,
        status,
        terminal_at,
        parent_id
      FROM tasks_current
      WHERE task_id IN (SELECT task_id FROM family_eligible)
      ORDER BY terminal_at ASC
    `;

    const projectParam = opts.project ?? null;
    const result = this.db
      .prepare(query)
      .all(thresholdIso, projectParam, projectParam) as Array<{
      task_id: string;
      title: string;
      project: string;
      status: string;
      terminal_at: string;
      parent_id: string | null;
    }>;

    return result.map(row => ({
      task_id: row.task_id,
      title: row.title,
      project: row.project,
      status: row.status as 'done' | 'archived',
      terminal_since: row.terminal_at,
      parent_id: row.parent_id,
    }));
  }

  /**
   * Permanently delete eligible tasks and their events.
   * DANGEROUS: Breaks append-only event model.
   * Recomputes eligibility inside the prune transaction to avoid TOCTOU.
   */
  pruneEligible(opts: PruneOptions): PruneResult {
    if (!this.eventsDb) {
      throw new Error('TaskService: eventsDb not provided, cannot prune tasks');
    }

    return withWriteTransaction(this.eventsDb, () => {
      // First, get eligible tasks (recompute to avoid TOCTOU race)
      const eligibleTasks = this.previewPrunableTasks(opts);

      if (eligibleTasks.length === 0) {
        return {
          pruned: [],
          count: 0,
          eventsDeleted: 0,
        };
      }

      const taskIds = eligibleTasks.map(t => t.task_id);

      // Delete events first (source of truth) - requires trigger bypass
      // This ordering is intentional: if projection deletion fails after events
      // are deleted, the projections can be rebuilt from remaining events.
      // The reverse (projections deleted, events remaining) would leave orphan
      // events that recreate projections on rebuild.
      const eventsDeleted = this.deleteTasksFromEvents(taskIds);

      // Delete from projections (cache.db) - derived state, recoverable
      this.deleteTasksFromProjections(taskIds);

      return {
        pruned: eligibleTasks,
        count: eligibleTasks.length,
        eventsDeleted,
      };
    });
  }

  private deleteTasksFromProjections(taskIds: string[]): void {
    // Delete from all projection tables in order
    const tables = [
      'task_comments',
      'task_checkpoints',
      'task_tags',
      'task_dependencies', // both directions
      'task_search',
      'tasks_current',
    ];

    // Create temp table once to avoid SQLite parameter limits
    this.db.exec('CREATE TEMP TABLE IF NOT EXISTS prune_targets (task_id TEXT PRIMARY KEY)');
    this.db.exec('DELETE FROM prune_targets'); // Clear any previous data

    const insert = this.db.prepare('INSERT INTO prune_targets (task_id) VALUES (?)');
    for (const id of taskIds) {
      insert.run(id);
    }

    // Delete from all tables using the same temp table
    for (const table of tables) {
      if (table === 'task_dependencies') {
        // Delete both directions
        this.db.exec(
          'DELETE FROM task_dependencies WHERE task_id IN (SELECT task_id FROM prune_targets) OR depends_on_id IN (SELECT task_id FROM prune_targets)'
        );
      } else if (table === 'task_search') {
        // FTS table uses different syntax
        this.db.exec(
          'DELETE FROM task_search WHERE task_id IN (SELECT task_id FROM prune_targets)'
        );
      } else {
        this.db.exec(
          `DELETE FROM ${table} WHERE task_id IN (SELECT task_id FROM prune_targets)`
        );
      }
    }

    this.db.exec('DROP TABLE prune_targets');
  }

  private deleteTasksFromEvents(taskIds: string[]): number {
    const eventsDb = this.eventsDb!; // Non-null assertion safe: checked in pruneEligible

    // Disable triggers
    eventsDb.exec('DROP TRIGGER IF EXISTS events_no_delete');
    eventsDb.exec('DROP TRIGGER IF EXISTS events_no_update');

    try {
      // Create temp table to avoid SQLite parameter limits on large prune sets
      eventsDb.exec('CREATE TEMP TABLE prune_targets (task_id TEXT PRIMARY KEY)');
      const insert = eventsDb.prepare('INSERT INTO prune_targets (task_id) VALUES (?)');
      for (const id of taskIds) {
        insert.run(id);
      }

      const result = eventsDb
        .prepare('DELETE FROM events WHERE task_id IN (SELECT task_id FROM prune_targets)')
        .run();
      eventsDb.exec('DROP TABLE prune_targets');

      // Re-enable triggers
      this.recreateEventTriggers();

      return result.changes;
    } catch (err) {
      // Re-enable triggers even on error
      this.recreateEventTriggers();
      throw err;
    }
  }

  private recreateEventTriggers(): void {
    const eventsDb = this.eventsDb!; // Non-null assertion safe: checked in pruneEligible

    const EVENTS_TRIGGERS_SQL = `
      -- Append-only enforcement: prevent UPDATE on events
      CREATE TRIGGER IF NOT EXISTS events_no_update
      BEFORE UPDATE ON events
      BEGIN
          SELECT RAISE(ABORT, 'Events table is append-only: cannot UPDATE');
      END;

      -- Append-only enforcement: prevent DELETE on events
      CREATE TRIGGER IF NOT EXISTS events_no_delete
      BEFORE DELETE ON events
      BEGIN
          SELECT RAISE(ABORT, 'Events table is append-only: cannot DELETE');
      END;
    `;
    eventsDb.exec(EVENTS_TRIGGERS_SQL);
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
      assignee: row.assignee,
      progress: row.progress,
      lease_until: row.lease_until,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
