import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import Database from 'libsql';
import { createTestDb } from '../../db/test-utils.js';
import { EventStore } from '../../events/store.js';
import { ProjectionEngine } from '../../projections/engine.js';
import { TasksCurrentProjector } from '../../projections/tasks-current.js';
import { DependenciesProjector } from '../../projections/dependencies.js';
import { TagsProjector } from '../../projections/tags.js';
import { CommentsCheckpointsProjector } from '../../projections/comments-checkpoints.js';
import { rebuildAllProjections } from '../../projections/rebuild.js';
import { TaskService } from '../../services/task-service.js';
import { ValidationService } from '../../services/validation-service.js';
import { TaskStatus } from '../../events/types.js';

const taskTitleArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);
const projectNameArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => /^[a-z0-9-]+$/.test(s));
const tagArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => /^[a-z0-9-]+$/.test(s));
const priorityArb = fc.integer({ min: 0, max: 3 });

describe('Property-Based Tests', { timeout: 30_000 }, () => {
  function withIsolatedServices<T>(
    fn: (ctx: {
      db: Database.Database;
      taskService: TaskService;
      validationService: ValidationService;
    }) => T
  ): T {
    const db = createTestDb();
    const eventStore = new EventStore(db);
    const engine = new ProjectionEngine(db);
    engine.register(new TasksCurrentProjector());
    engine.register(new DependenciesProjector());
    engine.register(new TagsProjector());
    engine.register(new CommentsCheckpointsProjector());
    const taskService = new TaskService(db, eventStore, engine);
    const validationService = new ValidationService(db);

    try {
      return fn({ db, taskService, validationService });
    } finally {
      db.close();
    }
  }

  describe('event replay determinism', () => {
    it('replaying same events always produces same state', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              title: taskTitleArb,
              project: projectNameArb,
              tags: fc.array(tagArb, { maxLength: 5 }),
              priority: priorityArb,
            }),
            { minLength: 1, maxLength: 20 }
          ),
          (taskSpecs) =>
            withIsolatedServices(({ db, taskService }) => {
              const taskIds: string[] = [];
              for (const spec of taskSpecs) {
                try {
                  const task = taskService.createTask({
                    title: spec.title,
                    project: spec.project || 'inbox',
                    tags: spec.tags,
                    priority: spec.priority,
                  });
                  taskIds.push(task.task_id);
                } catch {
                  continue;
                }
              }

              if (taskIds.length === 0) return true;

              const state1 = db
                .prepare(
                  'SELECT task_id, title, project, status, tags, priority FROM tasks_current ORDER BY task_id'
                )
                .all();

              db.exec('DELETE FROM tasks_current');
              db.exec('DELETE FROM task_tags');
              db.exec('DELETE FROM projection_state');

              const engine = new ProjectionEngine(db);
              engine.register(new TasksCurrentProjector());
              engine.register(new TagsProjector());
              rebuildAllProjections(db, engine);

              const state2 = db
                .prepare(
                  'SELECT task_id, title, project, status, tags, priority FROM tasks_current ORDER BY task_id'
                )
                .all();

              return JSON.stringify(state1) === JSON.stringify(state2);
            })
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('invariant: rebuild equivalence after random lifecycle operations', () => {
    function snapshotProjection(db: Database.Database): Record<string, unknown> {
      return {
        tasks: db
          .prepare(
            `SELECT task_id, title, project, status, parent_id, description, tags, priority, due_at,
                    metadata, claimed_at, agent, progress, lease_until, created_at, updated_at
             FROM tasks_current ORDER BY task_id`
          )
          .all(),
        tags: db.prepare('SELECT task_id, tag FROM task_tags ORDER BY task_id, tag').all(),
        comments: db
          .prepare(
            'SELECT event_rowid, task_id, author, agent_id, text, timestamp FROM task_comments ORDER BY event_rowid'
          )
          .all(),
        checkpoints: db
          .prepare(
            'SELECT event_rowid, task_id, name, data, timestamp FROM task_checkpoints ORDER BY event_rowid'
          )
          .all(),
      };
    }

    it('rebuilding projections yields identical projection state', () => {
      const actionArb = fc.array(
        fc.record({
          kind: fc.constantFrom(
            'create',
            'ready',
            'claim',
            'release',
            'complete',
            'archive',
            'block',
            'unblock',
            'progress',
            'comment',
            'checkpoint'
          ),
          index: fc.integer({ min: 0, max: 50 }),
          progress: fc.integer({ min: 0, max: 100 }),
        }),
        { minLength: 1, maxLength: 80 }
      );

      fc.assert(
        fc.property(actionArb, (actions) =>
          withIsolatedServices(({ db, taskService }) => {
            const taskIds: string[] = [];
            for (const action of actions) {
              const pickTaskId = (): string | undefined =>
                taskIds.length > 0 ? taskIds[action.index % taskIds.length] : undefined;

              try {
                switch (action.kind) {
                  case 'create': {
                    const created = taskService.createTask({
                      title: `Task ${action.index}`,
                      project: 'inbox',
                      tags: [`tag-${action.index % 5}`],
                      priority: action.index % 4,
                    });
                    taskIds.push(created.task_id);
                    break;
                  }
                  case 'ready': {
                    const taskId = pickTaskId();
                    if (taskId) taskService.setStatus(taskId, TaskStatus.Ready);
                    break;
                  }
                  case 'claim': {
                    const taskId = pickTaskId();
                    if (taskId) taskService.claimTask(taskId, { author: 'agent-1' });
                    break;
                  }
                  case 'release': {
                    const taskId = pickTaskId();
                    if (taskId) taskService.releaseTask(taskId, { comment: 'release' });
                    break;
                  }
                  case 'complete': {
                    const taskId = pickTaskId();
                    if (taskId) taskService.completeTask(taskId, { comment: 'done' });
                    break;
                  }
                  case 'archive': {
                    const taskId = pickTaskId();
                    if (taskId) taskService.archiveTask(taskId);
                    break;
                  }
                  case 'block': {
                    const taskId = pickTaskId();
                    if (taskId) taskService.blockTask(taskId, { comment: 'blocked' });
                    break;
                  }
                  case 'unblock': {
                    const taskId = pickTaskId();
                    if (taskId) taskService.unblockTask(taskId);
                    break;
                  }
                  case 'progress': {
                    const taskId = pickTaskId();
                    if (taskId) taskService.setProgress(taskId, action.progress);
                    break;
                  }
                  case 'comment': {
                    const taskId = pickTaskId();
                    if (taskId) taskService.addComment(taskId, `comment-${action.index}`);
                    break;
                  }
                  case 'checkpoint': {
                    const taskId = pickTaskId();
                    if (taskId) {
                      taskService.addCheckpoint(
                        taskId,
                        `checkpoint-${action.index}`,
                        { idx: action.index },
                        { progress: action.progress }
                      );
                    }
                    break;
                  }
                }
              } catch {
                continue;
              }
            }

            const before = snapshotProjection(db);

            db.exec('DELETE FROM tasks_current');
            db.exec('DELETE FROM task_dependencies');
            db.exec('DELETE FROM task_tags');
            db.exec('DELETE FROM task_comments');
            db.exec('DELETE FROM task_checkpoints');
            db.exec('DELETE FROM projection_state');

            const rebuildEngine = new ProjectionEngine(db);
            rebuildEngine.register(new TasksCurrentProjector());
            rebuildEngine.register(new DependenciesProjector());
            rebuildEngine.register(new TagsProjector());
            rebuildEngine.register(new CommentsCheckpointsProjector());
            rebuildAllProjections(db, rebuildEngine);

            const after = snapshotProjection(db);
            return JSON.stringify(before) === JSON.stringify(after);
          })
        ),
        { numRuns: 40 }
      );
    });
  });

  describe('invariant: no duplicate task IDs', () => {
    it('task IDs are always unique', () => {
      fc.assert(
        fc.property(fc.array(taskTitleArb, { minLength: 1, maxLength: 50 }), (titles) =>
          withIsolatedServices(({ taskService }) => {
            const taskIds = new Set<string>();
            for (const title of titles) {
              try {
                const task = taskService.createTask({ title, project: 'inbox' });
                if (taskIds.has(task.task_id)) {
                  return false;
                }
                taskIds.add(task.task_id);
              } catch {
                continue;
              }
            }
            return true;
          })
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('invariant: valid status transitions', () => {
    it('status transitions follow permissive rules (only archived is terminal)', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.constant('create'),
              fc.constant('setReady'),
              fc.constant('setDone'),
              fc.constant('setBacklog'),
              fc.constant('claim'),
              fc.constant('complete'),
              fc.constant('release'),
              fc.constant('archive')
            ),
            { minLength: 1, maxLength: 30 }
          ),
          (actions) =>
            withIsolatedServices(({ taskService }) => {
              const taskIds: string[] = [];
              const taskStates: Map<string, TaskStatus> = new Map();

              for (const action of actions) {
                try {
                  switch (action) {
                    case 'create': {
                      const task = taskService.createTask({ title: 'Task', project: 'inbox' });
                      taskIds.push(task.task_id);
                      taskStates.set(task.task_id, TaskStatus.Backlog);
                      break;
                    }
                    case 'setReady': {
                      if (taskIds.length === 0) break;
                      const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                      const currentStatus = taskStates.get(taskId);
                      if (currentStatus !== TaskStatus.Archived) {
                        taskService.setStatus(taskId, TaskStatus.Ready);
                        taskStates.set(taskId, TaskStatus.Ready);
                      }
                      break;
                    }
                    case 'setDone': {
                      if (taskIds.length === 0) break;
                      const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                      const currentStatus = taskStates.get(taskId);
                      if (currentStatus !== TaskStatus.Archived) {
                        taskService.setStatus(taskId, TaskStatus.Done);
                        taskStates.set(taskId, TaskStatus.Done);
                      }
                      break;
                    }
                    case 'setBacklog': {
                      if (taskIds.length === 0) break;
                      const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                      const currentStatus = taskStates.get(taskId);
                      if (currentStatus !== TaskStatus.Archived) {
                        taskService.setStatus(taskId, TaskStatus.Backlog);
                        taskStates.set(taskId, TaskStatus.Backlog);
                      }
                      break;
                    }
                    case 'claim': {
                      if (taskIds.length === 0) break;
                      const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                      const currentStatus = taskStates.get(taskId);
                      if (currentStatus !== TaskStatus.Done && currentStatus !== TaskStatus.Archived) {
                        taskService.claimTask(taskId, { author: 'agent' });
                        taskStates.set(taskId, TaskStatus.InProgress);
                      }
                      break;
                    }
                    case 'complete': {
                      if (taskIds.length === 0) break;
                      const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                      const currentStatus = taskStates.get(taskId);
                      if (currentStatus === TaskStatus.InProgress || currentStatus === TaskStatus.Blocked) {
                        taskService.completeTask(taskId);
                        taskStates.set(taskId, TaskStatus.Done);
                      }
                      break;
                    }
                    case 'release': {
                      if (taskIds.length === 0) break;
                      const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                      const currentStatus = taskStates.get(taskId);
                      if (currentStatus === TaskStatus.InProgress) {
                        taskService.releaseTask(taskId);
                        taskStates.set(taskId, TaskStatus.Ready);
                      }
                      break;
                    }
                    case 'archive': {
                      if (taskIds.length === 0) break;
                      const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                      const currentStatus = taskStates.get(taskId);
                      if (currentStatus !== TaskStatus.Archived) {
                        taskService.archiveTask(taskId);
                        taskStates.set(taskId, TaskStatus.Archived);
                      }
                      break;
                    }
                  }
                } catch {
                  continue;
                }
              }

              for (const taskId of taskIds) {
                const task = taskService.getTaskById(taskId);
                if (task) {
                  const validStatuses = Object.values(TaskStatus);
                  if (!validStatuses.includes(task.status)) {
                    return false;
                  }
                }
              }
              return true;
            })
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('invariant: no dependency cycles', () => {
    it('adding dependencies never creates cycles', () => {
      const depAttemptArb = fc
        .record({
          taskIndex: fc.integer({ min: 1, max: 9 }),
          depIndex: fc.integer({ min: 0, max: 8 }),
        })
        .map(({ taskIndex, depIndex }) => ({
          taskIndex,
          depIndex: Math.min(depIndex, taskIndex - 1),
        }));

      fc.assert(
        fc.property(
          fc.array(depAttemptArb, { minLength: 1, maxLength: 20 }),
          (depAttempts) =>
            withIsolatedServices(({ db, taskService, validationService }) => {
              const taskIds: string[] = [];
              for (let i = 0; i < 10; i++) {
                const task = taskService.createTask({ title: `Task ${i}`, project: 'inbox' });
                taskIds.push(task.task_id);
              }

              for (const { taskIndex, depIndex } of depAttempts) {
                if (taskIndex === depIndex) continue;
                const taskId = taskIds[taskIndex];
                const depId = taskIds[depIndex];
                try {
                  db.prepare(
                    'INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)'
                  ).run(taskId, depId);
                } catch {
                  continue;
                }
              }

              const validation = validationService.validate();
              return validation.cycles.length === 0;
            })
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('invariant: claim rejects terminal statuses', () => {
    it('only done and archived tasks cannot be claimed', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.constant('backlog'),
              fc.constant('ready'),
              fc.constant('in_progress'),
              fc.constant('done'),
              fc.constant('archived')
            ),
            { minLength: 1, maxLength: 10 }
          ),
          (statuses) =>
            withIsolatedServices(({ taskService }) => {
              for (const status of statuses) {
                const task = taskService.createTask({ title: 'Task', project: 'inbox' });

                try {
                  if (status === 'ready') {
                    taskService.setStatus(task.task_id, TaskStatus.Ready);
                  }
                  if (status === 'in_progress') {
                    taskService.claimTask(task.task_id, { author: 'agent' });
                  }
                  if (status === 'done') {
                    taskService.claimTask(task.task_id, { author: 'agent' });
                    taskService.completeTask(task.task_id);
                  }
                  if (status === 'archived') {
                    taskService.archiveTask(task.task_id);
                  }
                } catch {
                  continue;
                }

                const canClaim = status !== 'done' && status !== 'archived';
                try {
                  taskService.claimTask(task.task_id, { author: 'new-agent' });
                  if (!canClaim) {
                    return false;
                  }
                } catch {
                  if (canClaim) {
                    return false;
                  }
                }
              }
              return true;
            })
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('invariant: event count matches operations', () => {
    it('event count equals number of successful operations', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 50 }), (taskCount) =>
          withIsolatedServices(({ db, taskService }) => {
            const initialCount = db
              .prepare('SELECT COUNT(*) as count FROM events')
              .get() as { count: number };
            let operationCount = 0;

            for (let i = 0; i < taskCount; i++) {
              try {
                taskService.createTask({ title: `Task ${i}`, project: 'inbox' });
                operationCount++;
              } catch {
                continue;
              }
            }

            const eventCount = db
              .prepare('SELECT COUNT(*) as count FROM events')
              .get() as { count: number };
            return eventCount.count - initialCount.count === operationCount;
          })
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('invariant: projection consistency', () => {
    it('tasks_current always reflects latest event state', () => {
      fc.assert(
        fc.property(fc.array(taskTitleArb, { minLength: 1, maxLength: 20 }), (titles) =>
          withIsolatedServices(({ db, taskService }) => {
            const taskIds: string[] = [];
            for (const title of titles) {
              try {
                const task = taskService.createTask({ title, project: 'inbox' });
                taskIds.push(task.task_id);
              } catch {
                continue;
              }
            }

            for (const taskId of taskIds) {
              const inProjection = db
                .prepare('SELECT COUNT(*) as count FROM tasks_current WHERE task_id = ?')
                .get(taskId) as { count: number };
              if (inProjection.count !== 1) {
                return false;
              }
            }

            const projectionCount = db
              .prepare('SELECT COUNT(*) as count FROM tasks_current')
              .get() as { count: number };
            return projectionCount.count === taskIds.length;
          })
        ),
        { numRuns: 50 }
      );
    });
  });
});
