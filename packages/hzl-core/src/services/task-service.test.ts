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

  describe('claimNext', () => {
    it('claims highest priority ready task with all deps done', () => {
      taskService.createTask({ title: 'Low priority', project: 'inbox', priority: 0 });
      const highPriorityTask = taskService.createTask({ title: 'High priority', project: 'inbox', priority: 2 });
      taskService.createTask({ title: 'Medium priority', project: 'inbox', priority: 1 });

      // Move all to ready
      const tasks = db.prepare('SELECT task_id FROM tasks_current').all() as any[];
      for (const t of tasks) {
        taskService.setStatus(t.task_id, TaskStatus.Ready);
      }

      const claimed = taskService.claimNext({ author: 'agent-1' });

      expect(claimed).not.toBeNull();
      expect(claimed!.task_id).toBe(highPriorityTask.task_id);
      expect(claimed!.status).toBe(TaskStatus.InProgress);
    });

    it('returns null when no tasks are claimable', () => {
      taskService.createTask({ title: 'Backlog task', project: 'inbox' });
      const claimed = taskService.claimNext({ author: 'agent-1' });
      expect(claimed).toBeNull();
    });

    it('filters by project when provided', () => {
      const projectATask = taskService.createTask({ title: 'Project A', project: 'project-a' });
      taskService.createTask({ title: 'Project B', project: 'project-b', priority: 2 });

      taskService.setStatus(projectATask.task_id, TaskStatus.Ready);
      db.prepare("UPDATE tasks_current SET status = 'ready' WHERE project = 'project-b'").run();

      const claimed = taskService.claimNext({ author: 'agent-1', project: 'project-a' });

      expect(claimed).not.toBeNull();
      expect(claimed!.project).toBe('project-a');
    });

    it('filters by tags when provided', () => {
      const urgentTask = taskService.createTask({
        title: 'Urgent task',
        project: 'inbox',
        priority: 1,
        tags: ['urgent', 'backend'],
      });
      taskService.createTask({ title: 'Normal task', project: 'inbox', priority: 2, tags: ['frontend'] });

      taskService.setStatus(urgentTask.task_id, TaskStatus.Ready);
      db.prepare("UPDATE tasks_current SET status = 'ready'").run();

      const claimed = taskService.claimNext({ author: 'agent-1', tags: ['urgent'] });

      expect(claimed).not.toBeNull();
      expect(claimed!.task_id).toBe(urgentTask.task_id);
    });
  });

  describe('release', () => {
    it('transitions from in_progress to ready', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });

      const released = taskService.releaseTask(task.task_id);

      expect(released.status).toBe(TaskStatus.Ready);
      expect(released.claimed_at).toBeNull();
    });

    it('accepts optional reason', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id);

      taskService.releaseTask(task.task_id, { reason: 'Blocked on external dependency' });

      const events = eventStore.getByTaskId(task.task_id);
      const releaseEvent = events.find(e => (e.data as any).to === TaskStatus.Ready && (e.data as any).from === TaskStatus.InProgress);
      expect((releaseEvent!.data as any).reason).toBe('Blocked on external dependency');
    });
  });

  describe('archive', () => {
    it('transitions from any status to archived', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      const archived = taskService.archiveTask(task.task_id);
      expect(archived.status).toBe(TaskStatus.Archived);
    });

    it('throws if task is already archived', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.archiveTask(task.task_id);
      expect(() => taskService.archiveTask(task.task_id)).toThrow('already archived');
    });
  });

  describe('reopen', () => {
    it('transitions from done to ready by default', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id);
      taskService.completeTask(task.task_id);

      const reopened = taskService.reopenTask(task.task_id);
      expect(reopened.status).toBe(TaskStatus.Ready);
    });

    it('transitions from done to backlog when specified', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id);
      taskService.completeTask(task.task_id);

      const reopened = taskService.reopenTask(task.task_id, { to_status: TaskStatus.Backlog });
      expect(reopened.status).toBe(TaskStatus.Backlog);
    });

    it('throws if task is not done', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      expect(() => taskService.reopenTask(task.task_id)).toThrow('expected done');
    });
  });

  describe('steal', () => {
    it('steals task with force=true regardless of lease', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, {
        author: 'agent-1',
        lease_until: new Date(Date.now() + 3600000).toISOString()
      });

      const result = taskService.stealTask(task.task_id, { force: true, author: 'agent-2' });

      expect(result.success).toBe(true);
      const stolen = taskService.getTaskById(task.task_id);
      expect(stolen!.claimed_by_author).toBe('agent-2');
    });

    it('steals task with ifExpired=true only when lease is expired', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, {
        author: 'agent-1',
        lease_until: new Date(Date.now() - 1000).toISOString() // expired
      });

      const result = taskService.stealTask(task.task_id, { ifExpired: true, author: 'agent-2' });
      expect(result.success).toBe(true);
    });

    it('rejects steal with ifExpired=true when lease is not expired', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, {
        author: 'agent-1',
        lease_until: new Date(Date.now() + 3600000).toISOString()
      });

      const result = taskService.stealTask(task.task_id, { ifExpired: true, author: 'agent-2' });
      expect(result.success).toBe(false);
    });
  });

  describe('getStuckTasks', () => {
    it('returns tasks in_progress older than specified duration', () => {
      const task = taskService.createTask({ title: 'Old task', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      // Manually backdate the claim
      db.prepare(`
        UPDATE tasks_current SET claimed_at = ?, status = 'in_progress'
        WHERE task_id = ?
      `).run(new Date(Date.now() - 2 * 3600000).toISOString(), task.task_id);

      const stuck = taskService.getStuckTasks({ olderThan: 3600000 });

      expect(stuck).toHaveLength(1);
      expect(stuck[0].task_id).toBe(task.task_id);
    });

    it('filters by project', () => {
      const taskA = taskService.createTask({ title: 'Task A', project: 'project-a' });
      const taskB = taskService.createTask({ title: 'Task B', project: 'project-b' });

      const oldTime = new Date(Date.now() - 2 * 3600000).toISOString();
      db.prepare("UPDATE tasks_current SET claimed_at = ?, status = 'in_progress'").run(oldTime);

      const stuck = taskService.getStuckTasks({ project: 'project-a', olderThan: 3600000 });

      expect(stuck).toHaveLength(1);
      expect(stuck[0].project).toBe('project-a');
    });
  });
});
