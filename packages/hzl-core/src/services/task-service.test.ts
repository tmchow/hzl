// packages/hzl-core/src/services/task-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { TaskService } from './task-service.js';
import { runMigrations } from '../db/migrations.js';
import { EventStore } from '../events/store.js';
import { EventType, TaskStatus } from '../events/types.js';
import { ProjectionEngine } from '../projections/engine.js';
import { TasksCurrentProjector } from '../projections/tasks-current.js';
import { DependenciesProjector } from '../projections/dependencies.js';
import { TagsProjector } from '../projections/tags.js';
import { CommentsCheckpointsProjector } from '../projections/comments-checkpoints.js';
import { SearchProjector } from '../projections/search.js';

describe('TaskService', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let projectionEngine: ProjectionEngine;
  let taskService: TaskService;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    eventStore = new EventStore(db);
    projectionEngine = new ProjectionEngine(db);
    projectionEngine.register(new TasksCurrentProjector());
    projectionEngine.register(new DependenciesProjector());
    projectionEngine.register(new TagsProjector());
    projectionEngine.register(new CommentsCheckpointsProjector());
    projectionEngine.register(new SearchProjector());
    taskService = new TaskService(db, eventStore, projectionEngine);
  });

  afterEach(() => {
    db.close();
  });

  describe('createTask', () => {
    it('creates a task with minimal fields', () => {
      const task = taskService.createTask({
        title: 'Test task',
        project: 'inbox',
      });

      expect(task.task_id).toBeDefined();
      expect(task.title).toBe('Test task');
      expect(task.project).toBe('inbox');
      expect(task.status).toBe(TaskStatus.Backlog);
      expect(task.priority).toBe(0);
    });

    it('creates a task with all optional fields', () => {
      const task = taskService.createTask({
        title: 'Full task',
        project: 'project-a',
        description: 'A detailed description',
        tags: ['urgent', 'backend'],
        priority: 2,
        links: ['docs/spec.md'],
        depends_on: [],
        due_at: '2026-02-01T00:00:00Z',
        metadata: { custom: 'value' },
      });

      expect(task.title).toBe('Full task');
      expect(task.description).toBe('A detailed description');
      expect(task.tags).toEqual(['urgent', 'backend']);
      expect(task.priority).toBe(2);
    });

    it('persists task to tasks_current projection', () => {
      const task = taskService.createTask({
        title: 'Persisted task',
        project: 'inbox',
      });

      const row = db.prepare(
        'SELECT * FROM tasks_current WHERE task_id = ?'
      ).get(task.task_id) as any;

      expect(row).toBeDefined();
      expect(row.title).toBe('Persisted task');
      expect(row.status).toBe('backlog');
    });

    it('persists event to event store', () => {
      const task = taskService.createTask({
        title: 'Event test',
        project: 'inbox',
      });

      const events = eventStore.getByTaskId(task.task_id);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(EventType.TaskCreated);
    });

    it('creates dependencies when depends_on provided', () => {
      const dep1 = taskService.createTask({ title: 'Dep 1', project: 'inbox' });
      const dep2 = taskService.createTask({ title: 'Dep 2', project: 'inbox' });

      const task = taskService.createTask({
        title: 'Dependent task',
        project: 'inbox',
        depends_on: [dep1.task_id, dep2.task_id],
      });

      const deps = db.prepare(
        'SELECT depends_on_id FROM task_dependencies WHERE task_id = ? ORDER BY depends_on_id'
      ).all(task.task_id) as any[];

      expect(deps).toHaveLength(2);
    });

    it('includes author and agent_id in event when provided', () => {
      const task = taskService.createTask(
        { title: 'Authored task', project: 'inbox' },
        { author: 'user-1', agent_id: 'AGENT001' }
      );

      const events = eventStore.getByTaskId(task.task_id);
      expect(events[0].author).toBe('user-1');
      expect(events[0].agent_id).toBe('AGENT001');
    });
  });

  describe('claimTask', () => {
    it('claims a ready task with no dependencies', () => {
      const task = taskService.createTask({ title: 'Ready task', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      const claimed = taskService.claimTask(task.task_id, { author: 'agent-1' });

      expect(claimed.status).toBe(TaskStatus.InProgress);
      expect(claimed.claimed_by_author).toBe('agent-1');
      expect(claimed.claimed_at).toBeDefined();
    });

    it('claims a ready task with all dependencies done', () => {
      const dep1 = taskService.createTask({ title: 'Dep 1', project: 'inbox' });
      const dep2 = taskService.createTask({ title: 'Dep 2', project: 'inbox' });

      // Complete dependencies
      taskService.setStatus(dep1.task_id, TaskStatus.Ready);
      taskService.claimTask(dep1.task_id);
      taskService.completeTask(dep1.task_id);

      taskService.setStatus(dep2.task_id, TaskStatus.Ready);
      taskService.claimTask(dep2.task_id);
      taskService.completeTask(dep2.task_id);

      const task = taskService.createTask({
        title: 'Dependent task',
        project: 'inbox',
        depends_on: [dep1.task_id, dep2.task_id],
      });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      const claimed = taskService.claimTask(task.task_id);
      expect(claimed.status).toBe(TaskStatus.InProgress);
    });

    it('sets lease_until when provided', () => {
      const task = taskService.createTask({ title: 'Leased task', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      const leaseUntil = '2026-01-30T12:00:00Z';
      const claimed = taskService.claimTask(task.task_id, { lease_until: leaseUntil });

      expect(claimed.lease_until).toBe(leaseUntil);
    });

    it('throws if task is not in ready status', () => {
      const task = taskService.createTask({ title: 'Backlog task', project: 'inbox' });
      expect(() => taskService.claimTask(task.task_id)).toThrow(/not claimable/i);
    });

    it('throws if task has incomplete dependencies', () => {
      const dep = taskService.createTask({ title: 'Incomplete dep', project: 'inbox' });
      const task = taskService.createTask({
        title: 'Blocked task',
        project: 'inbox',
        depends_on: [dep.task_id],
      });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      expect(() => taskService.claimTask(task.task_id)).toThrow(/dependencies not done/i);
    });
  });
});
