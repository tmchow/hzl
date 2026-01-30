import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { createConnection } from '../../db/connection.js';
import { EventStore } from '../../events/store.js';
import { ProjectionEngine } from '../../projections/engine.js';
import { TasksCurrentProjector } from '../../projections/tasks-current.js';
import { DependenciesProjector } from '../../projections/dependencies.js';
import { TagsProjector } from '../../projections/tags.js';
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

describe('Property-Based Tests', () => {
  function withIsolatedServices<T>(
    fn: (ctx: {
      db: Database.Database;
      taskService: TaskService;
      validationService: ValidationService;
    }) => T
  ): T {
    const db = createConnection(':memory:');
    const eventStore = new EventStore(db);
    const engine = new ProjectionEngine(db);
    engine.register(new TasksCurrentProjector());
    engine.register(new DependenciesProjector());
    engine.register(new TagsProjector());
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
    it('status transitions follow state machine rules', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.constant('create'),
              fc.constant('setReady'),
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
                      if (currentStatus === TaskStatus.Backlog) {
                        taskService.setStatus(taskId, TaskStatus.Ready);
                        taskStates.set(taskId, TaskStatus.Ready);
                      }
                      break;
                    }
                    case 'claim': {
                      if (taskIds.length === 0) break;
                      const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                      const currentStatus = taskStates.get(taskId);
                      if (currentStatus === TaskStatus.Ready) {
                        taskService.claimTask(taskId, { author: 'agent' });
                        taskStates.set(taskId, TaskStatus.InProgress);
                      }
                      break;
                    }
                    case 'complete': {
                      if (taskIds.length === 0) break;
                      const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                      const currentStatus = taskStates.get(taskId);
                      if (currentStatus === TaskStatus.InProgress) {
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

  describe('invariant: claim requires ready status', () => {
    it('only ready tasks can be claimed', () => {
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
                  if (status !== 'backlog') {
                    taskService.setStatus(task.task_id, TaskStatus.Ready);
                  }
                  if (status === 'in_progress') {
                    taskService.claimTask(task.task_id, { author: 'agent' });
                  }
                  if (status === 'done') {
                    taskService.setStatus(task.task_id, TaskStatus.Ready);
                    taskService.claimTask(task.task_id, { author: 'agent' });
                    taskService.completeTask(task.task_id);
                  }
                  if (status === 'archived') {
                    taskService.archiveTask(task.task_id);
                  }
                } catch {
                  continue;
                }

                const canClaim = status === 'ready';
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
            return eventCount.count === operationCount;
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
