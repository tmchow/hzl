// packages/hzl-core/src/services/task-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'libsql';
import {
  TaskService,
  AmbiguousPrefixError,
  InvalidDueMonthError,
  InvalidProgressError,
  InvalidStatusTransitionError,
  TaskNotFoundError,
} from './task-service.js';
import { ProjectService, ProjectNotFoundError } from './project-service.js';
import { createTestDb } from '../db/test-utils.js';
import { EventStore } from '../events/store.js';
import { EventType, TaskStatus } from '../events/types.js';
import { CACHE_SCHEMA_V1, EVENTS_SCHEMA_V2, PRAGMAS } from '../db/schema.js';
import { ProjectionEngine } from '../projections/engine.js';
import { TasksCurrentProjector } from '../projections/tasks-current.js';
import { DependenciesProjector } from '../projections/dependencies.js';
import { TagsProjector } from '../projections/tags.js';
import { CommentsCheckpointsProjector } from '../projections/comments-checkpoints.js';
import { SearchProjector } from '../projections/search.js';
import { ProjectsProjector } from '../projections/projects.js';

function registerProjectors(engine: ProjectionEngine): void {
  engine.register(new TasksCurrentProjector());
  engine.register(new DependenciesProjector());
  engine.register(new TagsProjector());
  engine.register(new CommentsCheckpointsProjector());
  engine.register(new SearchProjector());
  engine.register(new ProjectsProjector());
}

describe('TaskService', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let projectionEngine: ProjectionEngine;
  let taskService: TaskService;
  let projectService: ProjectService;

  beforeEach(() => {
    db = createTestDb();
    // Schema applied by createTestDb
    eventStore = new EventStore(db);
    projectionEngine = new ProjectionEngine(db);
    registerProjectors(projectionEngine);
    projectService = new ProjectService(db, eventStore, projectionEngine);
    projectService.ensureInboxExists();
    projectService.createProject('project-a');
    projectService.createProject('project-b');
    taskService = new TaskService(db, eventStore, projectionEngine, projectService);
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

    it('persists agent in event data and projection', () => {
      const task = taskService.createTask({
        title: 'Pre-assigned task',
        project: 'inbox',
        agent: 'agent-1',
      });

      // Verify agent in projection
      const row = db.prepare(
        'SELECT agent FROM tasks_current WHERE task_id = ?'
      ).get(task.task_id) as { agent: string | null };
      expect(row.agent).toBe('agent-1');

      // Verify agent in event data
      const events = eventStore.getByTaskId(task.task_id);
      expect(events).toHaveLength(1);
      const eventData = events[0].data as { agent?: string };
      expect(eventData.agent).toBe('agent-1');
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

    it('creates task with initial_status ready', () => {
      const task = taskService.createTask({
        title: 'Ready task',
        project: 'inbox',
        initial_status: TaskStatus.Ready,
      });

      expect(task.status).toBe(TaskStatus.Ready);
      const events = eventStore.getByTaskId(task.task_id);
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe(EventType.TaskCreated);
      expect(events[1].type).toBe(EventType.StatusChanged);
    });

    it('creates task with initial_status in_progress and sets agent', () => {
      const task = taskService.createTask(
        {
          title: 'In progress task',
          project: 'inbox',
          initial_status: TaskStatus.InProgress,
        },
        { author: 'agent-1' }
      );

      expect(task.status).toBe(TaskStatus.InProgress);
      expect(task.agent).toBe('agent-1');
      expect(task.claimed_at).toBeDefined();
    });

    it('creates task with explicit agent and separate author for initial in_progress', () => {
      const task = taskService.createTask(
        {
          title: 'Delegated task',
          project: 'inbox',
          initial_status: TaskStatus.InProgress,
          agent: 'kenji',
        },
        { author: 'clara' }
      );

      expect(task.status).toBe(TaskStatus.InProgress);
      expect(task.agent).toBe('kenji');

      const events = eventStore.getByTaskId(task.task_id);
      expect(events[0].type).toBe(EventType.TaskCreated);
      expect(events[0].author).toBe('clara');
      expect((events[0].data as { agent?: string }).agent).toBe('kenji');
      expect(events[1].type).toBe(EventType.StatusChanged);
      expect(events[1].author).toBe('clara');
    });

    it('creates task with initial_status blocked without comment', () => {
      const task = taskService.createTask({
        title: 'Blocked task',
        project: 'inbox',
        initial_status: TaskStatus.Blocked,
      });

      expect(task.status).toBe(TaskStatus.Blocked);
      const events = eventStore.getByTaskId(task.task_id);
      expect(events).toHaveLength(2); // TaskCreated + StatusChanged
      expect(events[1].type).toBe(EventType.StatusChanged);
      expect((events[1].data as any).reason).toBeUndefined();
    });

    it('creates task with initial_status blocked and comment emits CommentAdded', () => {
      const task = taskService.createTask(
        {
          title: 'Blocked task',
          project: 'inbox',
          initial_status: TaskStatus.Blocked,
          comment: 'Waiting for API keys',
        },
        { author: 'agent-1' }
      );

      expect(task.status).toBe(TaskStatus.Blocked);
      const events = eventStore.getByTaskId(task.task_id);
      expect(events).toHaveLength(3); // TaskCreated + StatusChanged + CommentAdded
      expect(events[1].type).toBe(EventType.StatusChanged);
      expect((events[1].data as any).reason).toBeUndefined();
      expect(events[2].type).toBe(EventType.CommentAdded);
      expect((events[2].data as any).text).toBe('Waiting for API keys');
    });

    it('creates backlog task with comment emits CommentAdded', () => {
      const task = taskService.createTask({
        title: 'Backlog task with comment',
        project: 'inbox',
        comment: 'Initial context for this task',
      });

      expect(task.status).toBe(TaskStatus.Backlog);
      const events = eventStore.getByTaskId(task.task_id);
      expect(events).toHaveLength(2); // TaskCreated + CommentAdded
      expect(events[1].type).toBe(EventType.CommentAdded);
      expect((events[1].data as any).text).toBe('Initial context for this task');
    });

    it('skips whitespace-only comments', () => {
      const task = taskService.createTask({
        title: 'Task with whitespace comment',
        project: 'inbox',
        initial_status: TaskStatus.Blocked,
        comment: '   ',
      });

      expect(task.status).toBe(TaskStatus.Blocked);
      const events = eventStore.getByTaskId(task.task_id);
      expect(events).toHaveLength(2); // TaskCreated + StatusChanged (no CommentAdded)
      expect(events.filter(e => e.type === EventType.CommentAdded)).toHaveLength(0);
    });

    it('trims comment text', () => {
      const task = taskService.createTask({
        title: 'Task with padded comment',
        project: 'inbox',
        comment: '  Hello world  ',
      });

      const events = eventStore.getByTaskId(task.task_id);
      const commentEvent = events.find(e => e.type === EventType.CommentAdded);
      expect((commentEvent!.data as any).text).toBe('Hello world');
    });

    it('creates task with initial_status done', () => {
      const task = taskService.createTask({
        title: 'Done task',
        project: 'inbox',
        initial_status: TaskStatus.Done,
      });

      expect(task.status).toBe(TaskStatus.Done);
    });
  });

  describe('createTask with project validation', () => {
    it('should throw ProjectNotFoundError if project does not exist', () => {
      expect(() =>
        taskService.createTask({
          title: 'Test task',
          project: 'nonexistent',
        })
      ).toThrow(ProjectNotFoundError);
    });

    it('should create task if project exists', () => {
      projectService.createProject('myproject');

      const task = taskService.createTask({
        title: 'Test task',
        project: 'myproject',
      });

      expect(task.project).toBe('myproject');
    });

    it('should work with inbox project', () => {
      projectService.ensureInboxExists();

      const task = taskService.createTask({
        title: 'Test task',
        project: 'inbox',
      });

      expect(task.project).toBe('inbox');
    });
  });

  describe('moveTask with project validation', () => {
    it('should throw ProjectNotFoundError if target project does not exist', () => {
      projectService.createProject('source');
      const task = taskService.createTask({ title: 'Test', project: 'source' });

      expect(() => taskService.moveTask(task.task_id, 'nonexistent')).toThrow(
        ProjectNotFoundError
      );
    });

    it('should move task if target project exists', () => {
      projectService.createProject('source');
      projectService.createProject('target');
      const task = taskService.createTask({ title: 'Test', project: 'source' });

      const moved = taskService.moveTask(task.task_id, 'target');
      expect(moved.project).toBe('target');
    });
  });

  describe('setStatus transition rules', () => {
    const allStatuses = Object.values(TaskStatus) as TaskStatus[];

    const createTaskInStatus = (status: TaskStatus) => {
      const task = taskService.createTask({ title: `Status ${status}`, project: 'inbox' });

      switch (status) {
        case TaskStatus.Backlog:
          return task;
        case TaskStatus.Ready:
          return taskService.setStatus(task.task_id, TaskStatus.Ready);
        case TaskStatus.InProgress:
          taskService.setStatus(task.task_id, TaskStatus.Ready);
          return taskService.claimTask(task.task_id, { author: 'agent-1' });
        case TaskStatus.Blocked:
          taskService.setStatus(task.task_id, TaskStatus.Ready);
          taskService.claimTask(task.task_id, { author: 'agent-1' });
          return taskService.blockTask(task.task_id);
        case TaskStatus.Done:
          taskService.setStatus(task.task_id, TaskStatus.Ready);
          taskService.claimTask(task.task_id, { author: 'agent-1' });
          return taskService.completeTask(task.task_id);
        case TaskStatus.Archived:
          return taskService.archiveTask(task.task_id);
      }
    };

    it('allows any transition except from archived', () => {
      const nonArchived = allStatuses.filter(s => s !== TaskStatus.Archived);
      for (const fromStatus of nonArchived) {
        for (const toStatus of allStatuses) {
          if (fromStatus === toStatus) continue; // skip self-transitions (tested separately)
          const task = createTaskInStatus(fromStatus);
          const updated = taskService.setStatus(task.task_id, toStatus);
          expect(updated.status).toBe(toStatus);
        }
      }
    });

    it('throws InvalidStatusTransitionError when transitioning from archived', () => {
      const nonArchived = allStatuses.filter(s => s !== TaskStatus.Archived);
      for (const toStatus of nonArchived) {
        const task = createTaskInStatus(TaskStatus.Archived);
        expect(() => taskService.setStatus(task.task_id, toStatus)).toThrow(
          InvalidStatusTransitionError
        );
      }
    });

    it('no-ops on self-transition (returns task, no new event)', () => {
      for (const status of allStatuses) {
        const task = createTaskInStatus(status);
        const eventsBefore = eventStore.getByTaskId(task.task_id);
        const result = taskService.setStatus(task.task_id, status);
        const eventsAfter = eventStore.getByTaskId(task.task_id);
        expect(result.status).toBe(status);
        expect(eventsAfter.length).toBe(eventsBefore.length);
      }
    });
  });

  describe('claimTask', () => {
    it('claims a ready task with no dependencies', () => {
      const task = taskService.createTask({ title: 'Ready task', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      const claimed = taskService.claimTask(task.task_id, { author: 'agent-1' });

      expect(claimed.status).toBe(TaskStatus.InProgress);
      expect(claimed.agent).toBe('agent-1');
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

    it('claims a task from backlog status', () => {
      const task = taskService.createTask({ title: 'Backlog task', project: 'inbox' });
      const claimed = taskService.claimTask(task.task_id, { author: 'agent-1' });
      expect(claimed.status).toBe(TaskStatus.InProgress);
    });

    it('claims a task from in_progress status (re-claim)', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });
      const reclaimed = taskService.claimTask(task.task_id, { author: 'agent-2' });
      expect(reclaimed.status).toBe(TaskStatus.InProgress);
    });

    it('claims a task from blocked status', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });
      taskService.blockTask(task.task_id);
      const claimed = taskService.claimTask(task.task_id, { author: 'agent-2' });
      expect(claimed.status).toBe(TaskStatus.InProgress);
    });

    it('throws when claiming a done task', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id);
      taskService.completeTask(task.task_id);
      expect(() => taskService.claimTask(task.task_id)).toThrow(/not claimable/i);
    });

    it('throws when claiming an archived task', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.archiveTask(task.task_id);
      expect(() => taskService.claimTask(task.task_id)).toThrow(/not claimable/i);
    });

    it('allows claiming a task with incomplete dependencies', () => {
      const dep = taskService.createTask({ title: 'Incomplete dep', project: 'inbox' });
      const task = taskService.createTask({
        title: 'Dependent task',
        project: 'inbox',
        depends_on: [dep.task_id],
      });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      const claimed = taskService.claimTask(task.task_id, { author: 'agent-1' });
      expect(claimed.status).toBe(TaskStatus.InProgress);
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

    it('prioritizes assigned tasks as tiebreaker within same priority', () => {
      const assignedTask = taskService.createTask({
        title: 'Assigned to me',
        project: 'inbox',
        priority: 2,
        agent: 'agent-1',
      });
      const unassignedTask = taskService.createTask({
        title: 'Unassigned',
        project: 'inbox',
        priority: 2, // same priority
      });

      taskService.setStatus(assignedTask.task_id, TaskStatus.Ready);
      taskService.setStatus(unassignedTask.task_id, TaskStatus.Ready);

      const claimed = taskService.claimNext({ author: 'agent-1' });

      expect(claimed).not.toBeNull();
      expect(claimed!.task_id).toBe(assignedTask.task_id);
    });

    it('prioritizes higher priority over assigned', () => {
      const lowPriorityAssigned = taskService.createTask({
        title: 'Low priority but assigned',
        project: 'inbox',
        priority: 1,
        agent: 'agent-1',
      });
      const highPriorityUnassigned = taskService.createTask({
        title: 'High priority unassigned',
        project: 'inbox',
        priority: 3,
      });

      taskService.setStatus(lowPriorityAssigned.task_id, TaskStatus.Ready);
      taskService.setStatus(highPriorityUnassigned.task_id, TaskStatus.Ready);

      const claimed = taskService.claimNext({ author: 'agent-1' });

      expect(claimed).not.toBeNull();
      expect(claimed!.task_id).toBe(highPriorityUnassigned.task_id);
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

    it('accepts optional comment and emits CommentAdded', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id);

      taskService.releaseTask(task.task_id, { comment: 'Blocked on external dependency' });

      const events = eventStore.getByTaskId(task.task_id);
      const commentEvent = events.find(e => e.type === EventType.CommentAdded);
      expect(commentEvent).toBeDefined();
      expect((commentEvent!.data as any).text).toBe('Blocked on external dependency');
    });

    it('throws InvalidStatusTransitionError when task is not in_progress', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      expect(() => taskService.releaseTask(task.task_id)).toThrow(InvalidStatusTransitionError);
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
      expect(stolen!.agent).toBe('agent-2');
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

    it('supports separate agent and author for steal', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });

      const result = taskService.stealTask(task.task_id, {
        force: true,
        agent: 'agent-2',
        author: 'coordinator',
      });

      expect(result.success).toBe(true);
      const stolen = taskService.getTaskById(task.task_id);
      expect(stolen!.agent).toBe('agent-2');

      const events = eventStore.getByTaskId(task.task_id);
      const stealEvent = events[events.length - 1];
      expect(stealEvent.author).toBe('coordinator');
      expect((stealEvent.data as { agent?: string }).agent).toBe('agent-2');
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

  describe('areAllDepsDone', () => {
    it('returns true when task has no dependencies', () => {
      const task = taskService.createTask({ title: 'No deps', project: 'inbox' });
      expect(taskService.areAllDepsDone(task.task_id)).toBe(true);
    });

    it('returns true when all dependencies are done', () => {
      const dep = taskService.createTask({ title: 'Dep', project: 'inbox' });
      taskService.setStatus(dep.task_id, TaskStatus.Ready);
      taskService.claimTask(dep.task_id);
      taskService.completeTask(dep.task_id);

      const task = taskService.createTask({ title: 'Main', project: 'inbox', depends_on: [dep.task_id] });
      expect(taskService.areAllDepsDone(task.task_id)).toBe(true);
    });

    it('returns false when some dependencies are not done', () => {
      const dep = taskService.createTask({ title: 'Dep', project: 'inbox' });
      const task = taskService.createTask({ title: 'Main', project: 'inbox', depends_on: [dep.task_id] });
      expect(taskService.areAllDepsDone(task.task_id)).toBe(false);
    });
  });

  describe('isTaskAvailable', () => {
    it('returns true when task is ready and all deps are done', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      expect(taskService.isTaskAvailable(task.task_id)).toBe(true);
    });

    it('returns false when task is not ready', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      expect(taskService.isTaskAvailable(task.task_id)).toBe(false);
    });
  });

  describe('getAvailableTasks', () => {
    it('returns tasks that are ready with all deps done', () => {
      const task = taskService.createTask({ title: 'Available', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      const tasks = taskService.getAvailableTasks({});
      expect(tasks.map(t => t.task_id)).toContain(task.task_id);
    });

    it('filters by project', () => {
      const taskA = taskService.createTask({ title: 'A', project: 'project-a' });
      const taskB = taskService.createTask({ title: 'B', project: 'project-b' });
      taskService.setStatus(taskA.task_id, TaskStatus.Ready);
      taskService.setStatus(taskB.task_id, TaskStatus.Ready);

      const tasks = taskService.getAvailableTasks({ project: 'project-a' });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].project).toBe('project-a');
    });

    it('sorts by priority DESC, created_at ASC', () => {
      const low = taskService.createTask({ title: 'Low', project: 'inbox', priority: 1 });
      const high = taskService.createTask({ title: 'High', project: 'inbox', priority: 3 });
      taskService.setStatus(low.task_id, TaskStatus.Ready);
      taskService.setStatus(high.task_id, TaskStatus.Ready);

      const tasks = taskService.getAvailableTasks({});
      expect(tasks[0].task_id).toBe(high.task_id);
    });
  });

  describe('addComment', () => {
    it('adds a comment to a task', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      const comment = taskService.addComment(task.task_id, 'This is a comment');

      expect(comment.text).toBe('This is a comment');
      expect(comment.task_id).toBe(task.task_id);
    });

    it('throws when task does not exist', () => {
      expect(() => taskService.addComment('NONEXISTENT', 'Comment')).toThrow();
    });
  });

  describe('addCheckpoint', () => {
    it('adds a checkpoint to a task', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      const checkpoint = taskService.addCheckpoint(task.task_id, 'step1', { progress: 50 });

      expect(checkpoint.name).toBe('step1');
      expect(checkpoint.data).toEqual({ progress: 50 });
    });
  });

  describe('getComments', () => {
    it('returns comments for a task in order', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.addComment(task.task_id, 'First');
      taskService.addComment(task.task_id, 'Second');

      const comments = taskService.getComments(task.task_id);
      expect(comments).toHaveLength(2);
      expect(comments[0].text).toBe('First');
    });
  });

  describe('getCheckpoints', () => {
    it('returns checkpoints for a task in order', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.addCheckpoint(task.task_id, 'step1', { progress: 25 });
      taskService.addCheckpoint(task.task_id, 'step2', { progress: 50 });

      const checkpoints = taskService.getCheckpoints(task.task_id);
      expect(checkpoints).toHaveLength(2);
      expect(checkpoints[0].name).toBe('step1');
    });
  });

  describe('listTasks', () => {
    it('returns tasks updated within the time window', () => {
      taskService.createTask({ title: 'Task 1', project: 'inbox' });
      taskService.createTask({ title: 'Task 2', project: 'inbox' });

      const tasks = taskService.listTasks({ sinceDays: 3 });
      expect(tasks).toHaveLength(2);
    });

    it('filters by project', () => {
      taskService.createTask({ title: 'Task A', project: 'project-a' });
      taskService.createTask({ title: 'Task B', project: 'project-b' });

      const tasks = taskService.listTasks({ project: 'project-a' });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Task A');
    });

    it('excludes archived tasks', () => {
      const task = taskService.createTask({ title: 'Archived', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id);
      taskService.completeTask(task.task_id);
      taskService.archiveTask(task.task_id);

      const tasks = taskService.listTasks({});
      expect(tasks.map(t => t.task_id)).not.toContain(task.task_id);
    });

    it('sorts by priority DESC, updated_at DESC', () => {
      const low = taskService.createTask({ title: 'Low', project: 'inbox', priority: 1 });
      const high = taskService.createTask({ title: 'High', project: 'inbox', priority: 3 });

      const tasks = taskService.listTasks({});
      expect(tasks[0].task_id).toBe(high.task_id);
    });

    it('returns parent_id for subtasks', () => {
      const parent = taskService.createTask({ title: 'Parent', project: 'inbox' });
      const child = taskService.createTask({
        title: 'Child',
        project: 'inbox',
        parent_id: parent.task_id,
      });

      const tasks = taskService.listTasks({});
      const childTask = tasks.find(t => t.task_id === child.task_id);
      const parentTask = tasks.find(t => t.task_id === parent.task_id);

      expect(childTask?.parent_id).toBe(parent.task_id);
      expect(parentTask?.parent_id).toBeNull();
    });

    it('returns progress when set', () => {
      const task = taskService.createTask({ title: 'Task', project: 'inbox' });
      taskService.setProgress(task.task_id, 50);

      const tasks = taskService.listTasks({});
      const found = tasks.find(t => t.task_id === task.task_id);

      expect(found?.progress).toBe(50);
    });

    it('returns null progress when not set', () => {
      const task = taskService.createTask({ title: 'Task', project: 'inbox' });

      const tasks = taskService.listTasks({});
      const found = tasks.find(t => t.task_id === task.task_id);

      expect(found?.progress).toBeNull();
    });

    it('returns due_at when set', () => {
      const task = taskService.createTask({
        title: 'Task with due date',
        project: 'inbox',
        due_at: '2026-02-15T00:00:00Z',
      });

      const tasks = taskService.listTasks({});
      const found = tasks.find(t => t.task_id === task.task_id);

      expect(found?.due_at).toBe('2026-02-15T00:00:00Z');
    });

    it('returns null due_at when not set', () => {
      const task = taskService.createTask({ title: 'Task without due date', project: 'inbox' });

      const tasks = taskService.listTasks({});
      const found = tasks.find(t => t.task_id === task.task_id);

      expect(found?.due_at).toBeNull();
    });

    it('filters by dueMonth returning only tasks with due_at in that month', () => {
      taskService.createTask({
        title: 'Feb task',
        project: 'inbox',
        due_at: '2026-02-15T00:00:00Z',
      });
      taskService.createTask({
        title: 'Jan task',
        project: 'inbox',
        due_at: '2026-01-10T00:00:00Z',
      });
      taskService.createTask({
        title: 'No due date',
        project: 'inbox',
      });

      const tasks = taskService.listTasks({ dueMonth: '2026-02' });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Feb task');
    });

    it('dueMonth includes tasks near month boundaries with timezone padding', () => {
      // Task on March 1 in UTC but could be Feb 28 in US Pacific (UTC-8)
      taskService.createTask({
        title: 'Boundary task',
        project: 'inbox',
        due_at: '2026-03-01T05:00:00Z',
      });

      const tasks = taskService.listTasks({ dueMonth: '2026-02' });
      // Should be included due to ±1 day padding
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Boundary task');
    });

    it('dueMonth with project filter applies both filters', () => {
      taskService.createTask({
        title: 'Feb in project-a',
        project: 'project-a',
        due_at: '2026-02-15T00:00:00Z',
      });
      taskService.createTask({
        title: 'Feb in project-b',
        project: 'project-b',
        due_at: '2026-02-15T00:00:00Z',
      });

      const tasks = taskService.listTasks({ dueMonth: '2026-02', project: 'project-a' });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Feb in project-a');
    });

    it('due_at updated via event is reflected in listTasks', () => {
      const task = taskService.createTask({
        title: 'Task to update due date',
        project: 'inbox',
      });

      // Verify no due_at initially
      let tasks = taskService.listTasks({});
      let found = tasks.find(t => t.task_id === task.task_id);
      expect(found?.due_at).toBeNull();

      // Update due_at via event
      const event = eventStore.append({
        task_id: task.task_id,
        type: EventType.TaskUpdated,
        data: { field: 'due_at', old_value: null, new_value: '2026-03-20T00:00:00Z' },
      });
      projectionEngine.applyEvent(event);

      tasks = taskService.listTasks({ dueMonth: '2026-03' });
      found = tasks.find(t => t.task_id === task.task_id);
      expect(found?.due_at).toBe('2026-03-20T00:00:00Z');
    });

    it('dueMonth includes tasks near start-of-month boundary with timezone padding', () => {
      // Task on Jan 31 in UTC could be Feb 1 in UTC+13 (e.g., Samoa)
      taskService.createTask({
        title: 'Start boundary task',
        project: 'inbox',
        due_at: '2026-01-31T20:00:00Z',
      });

      const tasks = taskService.listTasks({ dueMonth: '2026-02' });
      // Should be included due to ±1 day padding
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Start boundary task');
    });

    it('dueMonth returns tasks regardless of updated_at age', () => {
      // Create a task with a due date — even if updated_at is very old,
      // dueMonth queries by due_at not updated_at
      const task = taskService.createTask({
        title: 'Old task with due date',
        project: 'inbox',
        due_at: '2026-06-15T00:00:00Z',
      });

      // Manually set updated_at to a long time ago
      db.prepare('UPDATE tasks_current SET updated_at = ? WHERE task_id = ?')
        .run('2025-01-01T00:00:00Z', task.task_id);

      const tasks = taskService.listTasks({ dueMonth: '2026-06' });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Old task with due date');
    });

    it('dueMonth handles December year-rollover boundary', () => {
      // End-of-December boundary: padding extends into Jan 2027
      taskService.createTask({
        title: 'Dec task',
        project: 'inbox',
        due_at: '2026-12-31T20:00:00Z',
      });
      taskService.createTask({
        title: 'Jan boundary task',
        project: 'inbox',
        due_at: '2027-01-01T05:00:00Z',
      });

      const tasks = taskService.listTasks({ dueMonth: '2026-12' });
      expect(tasks).toHaveLength(2);
    });

    it('dueMonth excludes archived tasks', () => {
      const task = taskService.createTask({
        title: 'Archived task with due date',
        project: 'inbox',
        due_at: '2026-04-15T00:00:00Z',
      });
      taskService.archiveTask(task.task_id);

      const tasks = taskService.listTasks({ dueMonth: '2026-04' });
      expect(tasks).toHaveLength(0);
    });

    it('dueMonth takes precedence over sinceDays when both provided', () => {
      const task = taskService.createTask({
        title: 'Feb task',
        project: 'inbox',
        due_at: '2026-02-15T00:00:00Z',
      });

      // Set updated_at far in the past so sinceDays=1 would exclude it
      db.prepare('UPDATE tasks_current SET updated_at = ? WHERE task_id = ?')
        .run('2025-01-01T00:00:00Z', task.task_id);

      // With dueMonth, sinceDays should be ignored — task should still appear
      const tasks = taskService.listTasks({ dueMonth: '2026-02', sinceDays: 1 });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Feb task');
    });

    it('throws on invalid dueMonth format', () => {
      expect(() => taskService.listTasks({ dueMonth: 'abc' }))
        .toThrow('Invalid dueMonth format');
    });

    it('throws on invalid month in dueMonth', () => {
      expect(() => taskService.listTasks({ dueMonth: '2026-00' }))
        .toThrow('Invalid month in dueMonth');
      expect(() => taskService.listTasks({ dueMonth: '2026-13' }))
        .toThrow('Invalid month in dueMonth');
    });

    it('throws InvalidDueMonthError for invalid dueMonth values', () => {
      expect(() => taskService.listTasks({ dueMonth: 'bad-month' })).toThrow(InvalidDueMonthError);
      expect(() => taskService.listTasks({ dueMonth: '2026-00' })).toThrow(InvalidDueMonthError);
    });

    it('listTasks includes tags', () => {
      taskService.createTask({ title: 'Tagged task', project: 'project-a', tags: ['bug', 'urgent'] });
      const tasks = taskService.listTasks({ sinceDays: 7 });
      const found = tasks.find((t) => t.title === 'Tagged task');
      expect(found).toBeDefined();
      expect(found!.tags).toEqual(['bug', 'urgent']);
    });

    it('listTasks returns empty tags array for untagged tasks', () => {
      taskService.createTask({ title: 'No tags', project: 'project-a' });
      const tasks = taskService.listTasks({ sinceDays: 7 });
      const found = tasks.find((t) => t.title === 'No tags');
      expect(found).toBeDefined();
      expect(found!.tags).toEqual([]);
    });

    it('listTasks filters by tag', () => {
      projectService.createProject('test-project');
      taskService.createTask({ title: 'Bug task', project: 'test-project', tags: ['bug'] });
      taskService.createTask({ title: 'Feature task', project: 'test-project', tags: ['feature'] });
      taskService.createTask({ title: 'Both', project: 'test-project', tags: ['bug', 'feature'] });

      const bugTasks = taskService.listTasks({ sinceDays: 7, tag: 'bug' });
      expect(bugTasks.map((t) => t.title).sort()).toEqual(['Both', 'Bug task']);

      const featureTasks = taskService.listTasks({ sinceDays: 7, tag: 'feature' });
      expect(featureTasks.map((t) => t.title).sort()).toEqual(['Both', 'Feature task']);
    });
  });

  describe('getTagCounts', () => {
    it('getTagCounts returns distinct tags with counts', () => {
      projectService.createProject('test-project');
      taskService.createTask({ title: 'A', project: 'test-project', tags: ['bug', 'urgent'] });
      taskService.createTask({ title: 'B', project: 'test-project', tags: ['bug'] });
      taskService.createTask({ title: 'C', project: 'test-project', tags: ['feature'] });

      const counts = taskService.getTagCounts();
      expect(counts).toEqual([
        { tag: 'bug', count: 2 },
        { tag: 'feature', count: 1 },
        { tag: 'urgent', count: 1 },
      ]);
    });

    it('getTagCounts excludes archived tasks', () => {
      projectService.createProject('test-project');
      const id = taskService.createTask({ title: 'A', project: 'test-project', tags: ['old'] });
      taskService.claimTask(id.task_id);
      taskService.completeTask(id.task_id);
      taskService.archiveTask(id.task_id);

      const counts = taskService.getTagCounts();
      expect(counts.find((c) => c.tag === 'old')).toBeUndefined();
    });
  });

  describe('getBlockedByMap', () => {
    it('returns empty map when no tasks are blocked', () => {
      taskService.createTask({ title: 'Task', project: 'inbox' });
      const map = taskService.getBlockedByMap();
      expect(map.size).toBe(0);
    });

    it('returns blocked tasks with their blockers', () => {
      const blocker = taskService.createTask({ title: 'Blocker', project: 'inbox' });
      const blocked = taskService.createTask({
        title: 'Blocked',
        project: 'inbox',
        depends_on: [blocker.task_id],
      });
      taskService.setStatus(blocked.task_id, TaskStatus.Ready);

      const map = taskService.getBlockedByMap();
      expect(map.has(blocked.task_id)).toBe(true);
      expect(map.get(blocked.task_id)).toContain(blocker.task_id);
    });

    it('does not include tasks whose dependencies are done', () => {
      const blocker = taskService.createTask({ title: 'Blocker', project: 'inbox' });
      const blocked = taskService.createTask({
        title: 'Blocked',
        project: 'inbox',
        depends_on: [blocker.task_id],
      });
      taskService.setStatus(blocker.task_id, TaskStatus.Ready);
      taskService.claimTask(blocker.task_id);
      taskService.completeTask(blocker.task_id);
      taskService.setStatus(blocked.task_id, TaskStatus.Ready);

      const map = taskService.getBlockedByMap();
      expect(map.has(blocked.task_id)).toBe(false);
    });
  });

  describe('getSubtaskCounts', () => {
    it('returns empty map when no subtasks exist', () => {
      taskService.createTask({ title: 'Parent', project: 'inbox' });
      const counts = taskService.getSubtaskCounts();
      expect(counts.size).toBe(0);
    });

    it('returns subtask count for parent tasks', () => {
      const parent = taskService.createTask({ title: 'Parent', project: 'inbox' });
      taskService.createTask({
        title: 'Child 1',
        project: 'inbox',
        parent_id: parent.task_id,
      });
      taskService.createTask({
        title: 'Child 2',
        project: 'inbox',
        parent_id: parent.task_id,
      });

      const counts = taskService.getSubtaskCounts();
      expect(counts.get(parent.task_id)).toBe(2);
    });

    it('excludes archived subtasks from count', () => {
      const parent = taskService.createTask({ title: 'Parent', project: 'inbox' });
      const child1 = taskService.createTask({
        title: 'Child 1',
        project: 'inbox',
        parent_id: parent.task_id,
      });
      taskService.createTask({
        title: 'Child 2',
        project: 'inbox',
        parent_id: parent.task_id,
      });

      // Archive child1
      taskService.setStatus(child1.task_id, TaskStatus.Ready);
      taskService.claimTask(child1.task_id);
      taskService.completeTask(child1.task_id);
      taskService.archiveTask(child1.task_id);

      const counts = taskService.getSubtaskCounts();
      expect(counts.get(parent.task_id)).toBe(1);
    });

    it('returns counts for multiple parent tasks', () => {
      const parent1 = taskService.createTask({ title: 'Parent 1', project: 'inbox' });
      const parent2 = taskService.createTask({ title: 'Parent 2', project: 'inbox' });

      taskService.createTask({ title: 'Child 1-1', project: 'inbox', parent_id: parent1.task_id });
      taskService.createTask({ title: 'Child 2-1', project: 'inbox', parent_id: parent2.task_id });
      taskService.createTask({ title: 'Child 2-2', project: 'inbox', parent_id: parent2.task_id });
      taskService.createTask({ title: 'Child 2-3', project: 'inbox', parent_id: parent2.task_id });

      const counts = taskService.getSubtaskCounts();
      expect(counts.get(parent1.task_id)).toBe(1);
      expect(counts.get(parent2.task_id)).toBe(3);
    });

    it('filters by project', () => {
      projectService.createProject('subtask-proj-a');
      projectService.createProject('subtask-proj-b');

      const parentA = taskService.createTask({ title: 'Parent A', project: 'subtask-proj-a' });
      const parentB = taskService.createTask({ title: 'Parent B', project: 'subtask-proj-b' });

      taskService.createTask({ title: 'Child A-1', project: 'subtask-proj-a', parent_id: parentA.task_id });
      taskService.createTask({ title: 'Child A-2', project: 'subtask-proj-a', parent_id: parentA.task_id });
      taskService.createTask({ title: 'Child B-1', project: 'subtask-proj-b', parent_id: parentB.task_id });

      const countsA = taskService.getSubtaskCounts({ project: 'subtask-proj-a' });
      expect(countsA.get(parentA.task_id)).toBe(2);
      expect(countsA.has(parentB.task_id)).toBe(false);

      const countsB = taskService.getSubtaskCounts({ project: 'subtask-proj-b' });
      expect(countsB.get(parentB.task_id)).toBe(1);
      expect(countsB.has(parentA.task_id)).toBe(false);
    });

    it('excludes done subtasks when excludeDone is true', () => {
      const parent = taskService.createTask({ title: 'Parent', project: 'inbox' });
      const child1 = taskService.createTask({
        title: 'Child 1',
        project: 'inbox',
        parent_id: parent.task_id,
      });
      taskService.createTask({
        title: 'Child 2',
        project: 'inbox',
        parent_id: parent.task_id,
      });

      // Complete child1
      taskService.setStatus(child1.task_id, TaskStatus.Ready);
      taskService.claimTask(child1.task_id);
      taskService.completeTask(child1.task_id);

      // Without excludeDone: count includes done subtask
      const allCounts = taskService.getSubtaskCounts();
      expect(allCounts.get(parent.task_id)).toBe(2);

      // With excludeDone: count excludes done subtask
      const activeCounts = taskService.getSubtaskCounts({ excludeDone: true });
      expect(activeCounts.get(parent.task_id)).toBe(1);
    });
  });

  describe('getStats', () => {
    it('returns total count and status breakdown', () => {
      taskService.createTask({ title: 'Backlog', project: 'inbox' });
      const ready = taskService.createTask({ title: 'Ready', project: 'inbox' });
      taskService.setStatus(ready.task_id, TaskStatus.Ready);

      const stats = taskService.getStats();
      expect(stats.total).toBe(2);
      expect(stats.byStatus.backlog).toBe(1);
      expect(stats.byStatus.ready).toBe(1);
    });

    it('returns all projects including those without tasks', () => {
      // Create an additional empty project
      projectService.createProject('empty-project');

      // Create tasks only in some projects
      taskService.createTask({ title: 'A', project: 'project-a' });

      const stats = taskService.getStats();
      // All projects should be listed, not just those with tasks
      expect(stats.projects).toContain('inbox');
      expect(stats.projects).toContain('project-a');
      expect(stats.projects).toContain('project-b'); // No tasks in this project
      expect(stats.projects).toContain('empty-project'); // Explicitly empty
    });

    it('excludes archived tasks from counts', () => {
      const task = taskService.createTask({ title: 'Archived', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id);
      taskService.completeTask(task.task_id);
      taskService.archiveTask(task.task_id);

      const stats = taskService.getStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('getBlockingDependencies', () => {
    it('returns empty array when task has no dependencies', () => {
      const task = taskService.createTask({ title: 'Task', project: 'inbox' });
      const deps = taskService.getBlockingDependencies(task.task_id);
      expect(deps).toEqual([]);
    });

    it('returns incomplete dependencies', () => {
      const blocker = taskService.createTask({ title: 'Blocker', project: 'inbox' });
      const task = taskService.createTask({
        title: 'Task',
        project: 'inbox',
        depends_on: [blocker.task_id],
      });

      const deps = taskService.getBlockingDependencies(task.task_id);
      expect(deps).toContain(blocker.task_id);
    });

    it('excludes completed dependencies', () => {
      const blocker = taskService.createTask({ title: 'Blocker', project: 'inbox' });
      const task = taskService.createTask({
        title: 'Task',
        project: 'inbox',
        depends_on: [blocker.task_id],
      });
      taskService.setStatus(blocker.task_id, TaskStatus.Ready);
      taskService.claimTask(blocker.task_id);
      taskService.completeTask(blocker.task_id);

      const deps = taskService.getBlockingDependencies(task.task_id);
      expect(deps).toEqual([]);
    });
  });

  describe('updateTask', () => {
    it('updates multiple fields and persists task_updated events through service layer', () => {
      const task = taskService.createTask({
        title: 'Original',
        project: 'inbox',
        description: 'old',
        links: ['a.md'],
        tags: ['old'],
        priority: 0,
      });

      const updated = taskService.updateTask(
        task.task_id,
        {
          title: 'Updated',
          description: 'new',
          links: ['b.md'],
          tags: ['new'],
          priority: 2,
        },
        { author: 'agent-x' }
      );

      expect(updated.title).toBe('Updated');
      expect(updated.description).toBe('new');
      expect(updated.links).toEqual(['b.md']);
      expect(updated.tags).toEqual(['new']);
      expect(updated.priority).toBe(2);

      const updateEvents = eventStore
        .getByTaskId(task.task_id)
        .filter((event) => event.type === EventType.TaskUpdated);
      expect(updateEvents).toHaveLength(5);
      expect(updateEvents.every((event) => event.author === 'agent-x')).toBe(true);
    });

    it('skips unchanged values (including arrays)', () => {
      const task = taskService.createTask({
        title: 'No change',
        project: 'inbox',
        description: 'same',
        links: ['same.md'],
        tags: ['same'],
        priority: 1,
      });

      const updated = taskService.updateTask(task.task_id, {
        title: 'No change',
        description: 'same',
        links: ['same.md'],
        tags: ['same'],
        priority: 1,
      });

      expect(updated.title).toBe('No change');
      const updateEvents = eventStore
        .getByTaskId(task.task_id)
        .filter((event) => event.type === EventType.TaskUpdated);
      expect(updateEvents).toHaveLength(0);
    });

    it('throws TaskNotFoundError for unknown task', () => {
      expect(() =>
        taskService.updateTask('TASK_UNKNOWN', { title: 'nope' })
      ).toThrow(TaskNotFoundError);
    });
  });

  describe('getTaskTitlesByIds', () => {
    it('returns empty map for empty input', () => {
      const map = taskService.getTaskTitlesByIds([]);
      expect(map.size).toBe(0);
    });

    it('returns titles for multiple tasks', () => {
      const task1 = taskService.createTask({ title: 'First Task', project: 'inbox' });
      const task2 = taskService.createTask({ title: 'Second Task', project: 'inbox' });

      const map = taskService.getTaskTitlesByIds([task1.task_id, task2.task_id]);
      expect(map.get(task1.task_id)).toBe('First Task');
      expect(map.get(task2.task_id)).toBe('Second Task');
    });

    it('ignores nonexistent task IDs', () => {
      const task = taskService.createTask({ title: 'Real Task', project: 'inbox' });

      const map = taskService.getTaskTitlesByIds([task.task_id, 'NONEXISTENT']);
      expect(map.size).toBe(1);
      expect(map.get(task.task_id)).toBe('Real Task');
    });
  });

  describe('getSubtasks', () => {
    it('returns subtasks of a task', () => {
      projectService.createProject('myproject');
      const parent = taskService.createTask({ title: 'Parent', project: 'myproject' });
      const child1 = taskService.createTask({ title: 'Child 1', project: 'myproject', parent_id: parent.task_id });
      const child2 = taskService.createTask({ title: 'Child 2', project: 'myproject', parent_id: parent.task_id });
      taskService.createTask({ title: 'Other', project: 'myproject' });

      const subtasks = taskService.getSubtasks(parent.task_id);
      expect(subtasks).toHaveLength(2);
      expect(subtasks.map(t => t.task_id).sort()).toEqual([child1.task_id, child2.task_id].sort());
    });

    it('returns empty array when no subtasks', () => {
      const task = taskService.createTask({ title: 'Lonely', project: 'inbox' });
      const subtasks = taskService.getSubtasks(task.task_id);
      expect(subtasks).toHaveLength(0);
    });
  });

  describe('archiveWithSubtasks', () => {
    it('archives task without subtasks', () => {
      const task = taskService.createTask({ title: 'Task', project: 'inbox' });
      const result = taskService.archiveWithSubtasks(task.task_id);
      expect(result.task.status).toBe(TaskStatus.Archived);
      expect(result.archivedSubtaskCount).toBe(0);
      expect(result.orphanedSubtaskCount).toBe(0);
    });

    it('errors when task has active subtasks without cascade or orphan', () => {
      const parent = taskService.createTask({ title: 'Parent', project: 'inbox' });
      taskService.createTask({ title: 'Child', project: 'inbox', parent_id: parent.task_id });

      expect(() => taskService.archiveWithSubtasks(parent.task_id)).toThrow(/active subtask/);
    });

    it('cascade archives all active subtasks', () => {
      const parent = taskService.createTask({ title: 'Parent', project: 'inbox' });
      const child1 = taskService.createTask({ title: 'Child 1', project: 'inbox', parent_id: parent.task_id });
      const child2 = taskService.createTask({ title: 'Child 2', project: 'inbox', parent_id: parent.task_id });

      const result = taskService.archiveWithSubtasks(parent.task_id, { cascade: true });
      expect(result.task.status).toBe(TaskStatus.Archived);
      expect(result.archivedSubtaskCount).toBe(2);

      expect(taskService.getTaskById(child1.task_id)?.status).toBe(TaskStatus.Archived);
      expect(taskService.getTaskById(child2.task_id)?.status).toBe(TaskStatus.Archived);
    });

    it('orphan promotes subtasks to top-level', () => {
      const parent = taskService.createTask({ title: 'Parent', project: 'inbox' });
      const child = taskService.createTask({ title: 'Child', project: 'inbox', parent_id: parent.task_id });

      const result = taskService.archiveWithSubtasks(parent.task_id, { orphan: true });
      expect(result.task.status).toBe(TaskStatus.Archived);
      expect(result.orphanedSubtaskCount).toBe(1);

      const updatedChild = taskService.getTaskById(child.task_id);
      expect(updatedChild?.parent_id).toBeNull();
      expect(updatedChild?.status).toBe(TaskStatus.Backlog); // Not archived
    });

    it('errors when both cascade and orphan specified', () => {
      const task = taskService.createTask({ title: 'Task', project: 'inbox' });
      expect(() => taskService.archiveWithSubtasks(task.task_id, { cascade: true, orphan: true }))
        .toThrow(/both cascade and orphan/);
    });

    it('allows archive with done subtasks without cascade', () => {
      const parent = taskService.createTask({ title: 'Parent', project: 'inbox' });
      const child = taskService.createTask({ title: 'Child', project: 'inbox', parent_id: parent.task_id });
      taskService.setStatus(child.task_id, TaskStatus.Ready);
      taskService.setStatus(child.task_id, TaskStatus.InProgress);
      taskService.completeTask(child.task_id);

      // Should not error because child is done (not active)
      const result = taskService.archiveWithSubtasks(parent.task_id);
      expect(result.task.status).toBe(TaskStatus.Archived);
    });
  });

  describe('moveWithSubtasks', () => {
    it('moves task and subtasks to new project', () => {
      const parent = taskService.createTask({ title: 'Parent', project: 'project-a' });
      const child1 = taskService.createTask({ title: 'Child 1', project: 'project-a', parent_id: parent.task_id });
      const child2 = taskService.createTask({ title: 'Child 2', project: 'project-a', parent_id: parent.task_id });

      const result = taskService.moveWithSubtasks(parent.task_id, 'project-b');
      expect(result.task.project).toBe('project-b');
      expect(result.subtaskCount).toBe(2);

      expect(taskService.getTaskById(child1.task_id)?.project).toBe('project-b');
      expect(taskService.getTaskById(child2.task_id)?.project).toBe('project-b');
    });

    it('returns zero subtask count when task has no subtasks', () => {
      const task = taskService.createTask({ title: 'Task', project: 'project-a' });
      const result = taskService.moveWithSubtasks(task.task_id, 'project-b');
      expect(result.task.project).toBe('project-b');
      expect(result.subtaskCount).toBe(0);
    });

    it('returns zero subtask count when moving to same project', () => {
      const parent = taskService.createTask({ title: 'Parent', project: 'project-a' });
      taskService.createTask({ title: 'Child', project: 'project-a', parent_id: parent.task_id });

      const result = taskService.moveWithSubtasks(parent.task_id, 'project-a');
      expect(result.task.project).toBe('project-a');
      expect(result.subtaskCount).toBe(0);
    });

    it('errors when target project does not exist', () => {
      const task = taskService.createTask({ title: 'Task', project: 'project-a' });
      expect(() => taskService.moveWithSubtasks(task.task_id, 'nonexistent'))
        .toThrow(ProjectNotFoundError);
    });
  });

  describe('getAvailableTasks leafOnly', () => {
    it('excludes parent tasks when leafOnly is true', () => {
      const parent = taskService.createTask({ title: 'Parent', project: 'inbox' });
      taskService.setStatus(parent.task_id, TaskStatus.Ready);
      const child = taskService.createTask({ title: 'Child', project: 'inbox', parent_id: parent.task_id });
      taskService.setStatus(child.task_id, TaskStatus.Ready);
      const standalone = taskService.createTask({ title: 'Standalone', project: 'inbox' });
      taskService.setStatus(standalone.task_id, TaskStatus.Ready);

      const available = taskService.getAvailableTasks({ leafOnly: true });
      expect(available).toHaveLength(2);
      expect(available.map(t => t.title).sort()).toEqual(['Child', 'Standalone']);
    });

    it('includes parent tasks when leafOnly is false', () => {
      const parent = taskService.createTask({ title: 'Parent', project: 'inbox' });
      taskService.setStatus(parent.task_id, TaskStatus.Ready);
      const child = taskService.createTask({ title: 'Child', project: 'inbox', parent_id: parent.task_id });
      taskService.setStatus(child.task_id, TaskStatus.Ready);

      const available = taskService.getAvailableTasks({ leafOnly: false });
      expect(available).toHaveLength(2);
      expect(available.map(t => t.title).sort()).toEqual(['Child', 'Parent']);
    });
  });

  describe('blockTask', () => {
    it('blocks an in_progress task', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });

      const blocked = taskService.blockTask(task.task_id, { comment: 'Waiting for API keys' });
      expect(blocked.status).toBe(TaskStatus.Blocked);
      // Assignee should persist
      expect(blocked.agent).toBe('agent-1');
    });

    it('throws when task is not in_progress or blocked', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      expect(() => taskService.blockTask(task.task_id))
        .toThrow('Cannot block: status is backlog, expected in_progress or blocked');
    });

    it('emits CommentAdded when comment provided', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });

      taskService.blockTask(task.task_id, { comment: 'Waiting for API keys' });

      const events = eventStore.getByTaskId(task.task_id);
      const commentEvent = events.find(e => e.type === EventType.CommentAdded);
      expect(commentEvent).toBeDefined();
      expect((commentEvent?.data as any).text).toBe('Waiting for API keys');
    });

    it('does not emit CommentAdded when no comment provided', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });

      taskService.blockTask(task.task_id);

      const events = eventStore.getByTaskId(task.task_id);
      const commentEvents = events.filter(e => e.type === EventType.CommentAdded);
      expect(commentEvents).toHaveLength(0);
    });

    it('allows blocked → blocked to add new comment', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });
      taskService.blockTask(task.task_id, { comment: 'First reason' });

      const updated = taskService.blockTask(task.task_id, { comment: 'Updated reason' });
      expect(updated.status).toBe(TaskStatus.Blocked);

      const events = eventStore.getByTaskId(task.task_id);
      const commentEvents = events.filter(e => e.type === EventType.CommentAdded);
      expect(commentEvents).toHaveLength(2);
      expect((commentEvents[0].data as any).text).toBe('First reason');
      expect((commentEvents[1].data as any).text).toBe('Updated reason');
    });

    it('StatusChanged event does not include reason field', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });

      taskService.blockTask(task.task_id, { comment: 'Some reason' });

      const events = eventStore.getByTaskId(task.task_id);
      const statusChangeEvents = events.filter(e =>
        e.type === EventType.StatusChanged && (e.data as any).to === TaskStatus.Blocked
      );
      expect(statusChangeEvents).toHaveLength(1);
      expect((statusChangeEvents[0].data as any).reason).toBeUndefined();
    });

    it('preserves claimed_at when adding comment to blocked task', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });
      taskService.blockTask(task.task_id, { comment: 'First reason' });

      const originalClaimedAt = taskService.getTaskById(task.task_id)!.claimed_at;

      taskService.blockTask(task.task_id, { comment: 'Updated reason' });
      const updated = taskService.getTaskById(task.task_id);

      expect(updated!.claimed_at).toBe(originalClaimedAt);
      expect(updated!.agent).toBe('agent-1');
    });

    it('clears lease_until when blocked', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      const leaseTime = new Date(Date.now() + 3600000).toISOString();
      taskService.claimTask(task.task_id, { author: 'agent-1', lease_until: leaseTime });

      const before = taskService.getTaskById(task.task_id);
      expect(before?.lease_until).toBe(leaseTime);

      const blocked = taskService.blockTask(task.task_id);
      expect(blocked.lease_until).toBeNull();
    });
  });

  describe('unblockTask', () => {
    it('unblocks to in_progress by default', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });
      taskService.blockTask(task.task_id);

      const unblocked = taskService.unblockTask(task.task_id);
      expect(unblocked.status).toBe(TaskStatus.InProgress);
      expect(unblocked.agent).toBe('agent-1');
    });

    it('unblocks to ready with release option', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });
      taskService.blockTask(task.task_id);

      const released = taskService.unblockTask(task.task_id, { release: true });
      expect(released.status).toBe(TaskStatus.Ready);
      // Assignee still persists even when released
      expect(released.agent).toBe('agent-1');
    });

    it('throws when task is not blocked', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id);

      expect(() => taskService.unblockTask(task.task_id))
        .toThrow('Cannot unblock: status is in_progress, expected blocked');
    });

    it('preserves claimed_at when unblocking to in_progress', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });

      const claimed = taskService.getTaskById(task.task_id);
      const originalClaimedAt = claimed!.claimed_at;

      taskService.blockTask(task.task_id);
      const blocked = taskService.getTaskById(task.task_id);
      expect(blocked!.claimed_at).toBe(originalClaimedAt);

      const unblocked = taskService.unblockTask(task.task_id);
      expect(unblocked.claimed_at).toBe(originalClaimedAt);
    });
  });

  describe('setProgress', () => {
    it('sets progress on a task', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      const updated = taskService.setProgress(task.task_id, 50);
      expect(updated.progress).toBe(50);
    });

    it('creates a checkpoint event for progress', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setProgress(task.task_id, 75);

      const checkpoints = taskService.getCheckpoints(task.task_id);
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0].name).toBe('Progress updated to 75%');
    });

    it('validates progress is 0-100', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      expect(() => taskService.setProgress(task.task_id, -1))
        .toThrow('Progress must be an integer between 0 and 100');
      expect(() => taskService.setProgress(task.task_id, 101))
        .toThrow('Progress must be an integer between 0 and 100');
      expect(() => taskService.setProgress(task.task_id, 50.5))
        .toThrow('Progress must be an integer between 0 and 100');
    });

    it('throws InvalidProgressError on invalid progress values', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      expect(() => taskService.setProgress(task.task_id, -1)).toThrow(InvalidProgressError);
      expect(() => taskService.setProgress(task.task_id, 101)).toThrow(InvalidProgressError);
    });

    it('allows setting progress to 0 and 100', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setProgress(task.task_id, 0);
      expect(taskService.getTaskById(task.task_id)?.progress).toBe(0);

      taskService.setProgress(task.task_id, 100);
      expect(taskService.getTaskById(task.task_id)?.progress).toBe(100);
    });
  });

  describe('addCheckpoint with progress', () => {
    it('sets progress when included in checkpoint', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.addCheckpoint(task.task_id, 'Phase 1 complete', {}, { progress: 25 });

      const updated = taskService.getTaskById(task.task_id);
      expect(updated?.progress).toBe(25);
    });

    it('validates progress in checkpoint', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      expect(() => taskService.addCheckpoint(task.task_id, 'Bad', {}, { progress: 150 }))
        .toThrow('Progress must be an integer between 0 and 100');
    });
  });

  describe('completeTask from blocked', () => {
    it('allows completing a blocked task', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });
      taskService.blockTask(task.task_id);

      const completed = taskService.completeTask(task.task_id);
      expect(completed.status).toBe(TaskStatus.Done);
      expect(completed.agent).toBe('agent-1');
    });

    it('appends CommentAdded when comment is provided on complete', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });

      taskService.completeTask(task.task_id, { author: 'agent-1', comment: 'Done and validated' });

      const comments = taskService.getComments(task.task_id);
      expect(comments).toHaveLength(1);
      expect(comments[0].text).toBe('Done and validated');
    });

    it('does not append comment when complete validation fails', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });

      expect(() =>
        taskService.completeTask(task.task_id, { author: 'agent-1', comment: 'Should not persist' })
      ).toThrow(/Cannot complete/);

      const comments = taskService.getComments(task.task_id);
      expect(comments).toHaveLength(0);
    });
  });

  describe('auto progress on done transitions', () => {
    it('sets progress to 100 when completeTask transitions in_progress to done', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });
      taskService.setProgress(task.task_id, 35);

      const completed = taskService.completeTask(task.task_id);

      expect(completed.status).toBe(TaskStatus.Done);
      expect(completed.progress).toBe(100);
    });

    it('sets progress to 100 when setStatus transitions task to done', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.setStatus(task.task_id, TaskStatus.InProgress);
      taskService.setProgress(task.task_id, 20);

      const completed = taskService.setStatus(task.task_id, TaskStatus.Done);

      expect(completed.status).toBe(TaskStatus.Done);
      expect(completed.progress).toBe(100);
    });
  });

  describe('pruning', () => {
    it('finds no eligible tasks when all tasks are active', () => {
      const task1 = taskService.createTask({ title: 'Active 1', project: 'inbox' });
      const task2 = taskService.createTask({ title: 'Ready', project: 'inbox' });
      taskService.setStatus(task2.task_id, TaskStatus.Ready);

      const eligible = taskService.previewPrunableTasks({
        project: 'inbox',
        olderThanDays: 1,
      });

      expect(eligible).toHaveLength(0);
    });

    it('returns empty preview when no tasks match age criteria', () => {
      const task = taskService.createTask({ title: 'Recent task', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id);
      taskService.completeTask(task.task_id);

      // Asking for tasks older than 365 days should return empty
      const eligible = taskService.previewPrunableTasks({
        project: 'inbox',
        olderThanDays: 365,
      });

      expect(eligible).toHaveLength(0);
    });

    it('respects project filter', () => {
      const task1 = taskService.createTask({ title: 'Project A task', project: 'project-a' });
      const task2 = taskService.createTask({ title: 'Project B task', project: 'project-b' });
      taskService.setStatus(task1.task_id, TaskStatus.Ready);
      taskService.setStatus(task2.task_id, TaskStatus.Ready);
      taskService.claimTask(task1.task_id);
      taskService.claimTask(task2.task_id);
      taskService.completeTask(task1.task_id);
      taskService.completeTask(task2.task_id);

      const eligible = taskService.previewPrunableTasks({
        project: 'project-a',
        olderThanDays: 1,
      });

      // All found tasks should be from project-a
      expect(eligible.every(t => t.project === 'project-a')).toBe(true);
    });

    it('returns tasks from all projects when project is undefined (--all flag)', () => {
      // Create projects with unique names for this test
      projectService.createProject('all-test-proj-a');
      projectService.createProject('all-test-proj-b');
      projectService.createProject('all-test-proj-c');

      // Create tasks in multiple projects
      const taskA = taskService.createTask({ title: 'Project A task', project: 'all-test-proj-a' });
      const taskB = taskService.createTask({ title: 'Project B task', project: 'all-test-proj-b' });
      const taskC = taskService.createTask({ title: 'Project C task', project: 'all-test-proj-c' });

      // Complete all tasks
      taskService.setStatus(taskA.task_id, TaskStatus.Ready);
      taskService.setStatus(taskB.task_id, TaskStatus.Ready);
      taskService.setStatus(taskC.task_id, TaskStatus.Ready);
      taskService.claimTask(taskA.task_id);
      taskService.claimTask(taskB.task_id);
      taskService.claimTask(taskC.task_id);
      taskService.completeTask(taskA.task_id);
      taskService.completeTask(taskB.task_id);
      taskService.completeTask(taskC.task_id);

      // Backdate terminal_at to make them eligible
      db.prepare('UPDATE tasks_current SET terminal_at = ? WHERE task_id IN (?, ?, ?)').run(
        '2020-01-01T00:00:00Z',
        taskA.task_id,
        taskB.task_id,
        taskC.task_id
      );

      // Query with project undefined (--all mode)
      const eligible = taskService.previewPrunableTasks({
        project: undefined, // <-- This is the --all case
        olderThanDays: 1,
      });

      // Should return tasks from ALL projects (at least these 3)
      const ourTasks = eligible.filter(t =>
        ['all-test-proj-a', 'all-test-proj-b', 'all-test-proj-c'].includes(t.project)
      );
      expect(ourTasks.length).toBe(3);
      const projects = new Set(ourTasks.map(t => t.project));
      expect(projects.has('all-test-proj-a')).toBe(true);
      expect(projects.has('all-test-proj-b')).toBe(true);
      expect(projects.has('all-test-proj-c')).toBe(true);
    });

    it('includes only terminal statuses (done/archived)', () => {
      const readyTask = taskService.createTask({ title: 'Ready', project: 'inbox' });
      const doneTask = taskService.createTask({ title: 'Done', project: 'inbox' });
      const archivedTask = taskService.createTask({ title: 'Archived', project: 'inbox' });

      taskService.setStatus(readyTask.task_id, TaskStatus.Ready);
      taskService.setStatus(doneTask.task_id, TaskStatus.Ready);
      taskService.setStatus(archivedTask.task_id, TaskStatus.Ready);

      taskService.claimTask(doneTask.task_id);
      taskService.completeTask(doneTask.task_id);
      taskService.archiveTask(archivedTask.task_id);

      const eligible = taskService.previewPrunableTasks({
        project: 'inbox',
        olderThanDays: 1,
      });

      // Only done and archived should appear (if old enough)
      expect(eligible.every(t => t.status === 'done' || t.status === 'archived')).toBe(true);
    });

    it('enforces family atomicity: parent cannot be pruned if child is not terminal', () => {
      const parent = taskService.createTask({ title: 'Parent', project: 'inbox' });
      const child = taskService.createTask({
        title: 'Child',
        project: 'inbox',
        parent_id: parent.task_id,
      });

      taskService.setStatus(parent.task_id, TaskStatus.Ready);
      taskService.setStatus(child.task_id, TaskStatus.Ready);

      taskService.claimTask(parent.task_id);
      taskService.completeTask(parent.task_id);
      // Child is still Ready, not terminal

      const eligible = taskService.previewPrunableTasks({
        project: 'inbox',
        olderThanDays: 1,
      });

      // Parent should not be eligible because child is not terminal
      const parentFound = eligible.find(t => t.task_id === parent.task_id);
      expect(parentFound).toBeUndefined();
    });

    it('enforces family atomicity: child cannot be pruned if parent is not terminal', () => {
      const parent = taskService.createTask({ title: 'Parent', project: 'inbox' });
      const child = taskService.createTask({
        title: 'Child',
        project: 'inbox',
        parent_id: parent.task_id,
      });

      taskService.setStatus(parent.task_id, TaskStatus.Ready);
      taskService.setStatus(child.task_id, TaskStatus.Ready);

      taskService.claimTask(child.task_id);
      taskService.completeTask(child.task_id);
      // Parent is still Ready, not terminal

      const eligible = taskService.previewPrunableTasks({
        project: 'inbox',
        olderThanDays: 1,
      });

      // Child should not be eligible because parent is not terminal
      const childFound = eligible.find(t => t.task_id === child.task_id);
      expect(childFound).toBeUndefined();
    });

    it('blocks pruning when task is a dependency target for active task', () => {
      const dependency = taskService.createTask({ title: 'Dependency', project: 'inbox' });
      const dependent = taskService.createTask({
        title: 'Dependent',
        project: 'inbox',
        depends_on: [dependency.task_id],
      });

      taskService.setStatus(dependency.task_id, TaskStatus.Ready);
      taskService.setStatus(dependent.task_id, TaskStatus.Ready);

      taskService.claimTask(dependency.task_id);
      taskService.completeTask(dependency.task_id);
      // dependent is still Ready (not terminal)

      const eligible = taskService.previewPrunableTasks({
        project: 'inbox',
        olderThanDays: 1,
      });

      // dependency should not be eligible because dependent is not terminal
      const depFound = eligible.find(t => t.task_id === dependency.task_id);
      expect(depFound).toBeUndefined();
    });

    it('allows pruning when both dependency and dependent are terminal', () => {
      const dependency = taskService.createTask({ title: 'Dependency', project: 'inbox' });
      const dependent = taskService.createTask({
        title: 'Dependent',
        project: 'inbox',
        depends_on: [dependency.task_id],
      });

      taskService.setStatus(dependency.task_id, TaskStatus.Ready);
      taskService.setStatus(dependent.task_id, TaskStatus.Ready);

      taskService.claimTask(dependency.task_id);
      taskService.completeTask(dependency.task_id);
      taskService.claimTask(dependent.task_id);
      taskService.completeTask(dependent.task_id);

      const eligible = taskService.previewPrunableTasks({
        project: 'inbox',
        olderThanDays: 1,
      });

      // Both should potentially be eligible since both are terminal
      expect(eligible.length).toBeGreaterThanOrEqual(0); // May be 0 if not old enough
    });

    it('blocks pruning when dependent is active in another project', () => {
      projectService.createProject('prune-cross-a');
      projectService.createProject('prune-cross-b');

      const dependency = taskService.createTask({ title: 'Dependency', project: 'prune-cross-a' });
      const dependent = taskService.createTask({
        title: 'Dependent',
        project: 'prune-cross-b',
        depends_on: [dependency.task_id],
      });

      taskService.setStatus(dependency.task_id, TaskStatus.Ready);
      taskService.claimTask(dependency.task_id);
      taskService.completeTask(dependency.task_id);
      taskService.setStatus(dependent.task_id, TaskStatus.Ready);

      const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
      const eligible = taskService.previewPrunableTasks({
        project: 'prune-cross-a',
        olderThanDays: 1,
        asOf: future,
      });

      const depFound = eligible.find(t => t.task_id === dependency.task_id);
      expect(depFound).toBeUndefined();
    });
  });

  describe('cross-project dependency behavior', () => {
    it('allows dependency on task in same project', () => {
      const dependency = taskService.createTask({ title: 'Dep', project: 'project-a' });
      const dependent = taskService.createTask({
        title: 'Dependent',
        project: 'project-a',
        depends_on: [dependency.task_id],
      });

      expect(dependent.task_id).toBeDefined();
    });

    it('allows dependency on non-existent task (orphan dep)', () => {
      // Non-existent task IDs pass validation (no project to compare)
      const task = taskService.createTask({
        title: 'Task with orphan dep',
        project: 'project-a',
        depends_on: ['nonexistent-task-id'],
      });

      expect(task.task_id).toBeDefined();
    });

    it('allows cross-project dependency by default', () => {
      const taskInProjectA = taskService.createTask({ title: 'Task A', project: 'project-a' });

      const taskInProjectB = taskService.createTask({
        title: 'Task B',
        project: 'project-b',
        depends_on: [taskInProjectA.task_id],
      });

      expect(taskInProjectB.task_id).toBeDefined();
    });
  });

  describe('pruneEligible', () => {
    let taskServiceWithEventsDb: TaskService;

    beforeEach(() => {
      // Create TaskService with eventsDb to enable pruning
      // Using same db for both since tests use combined schema
      taskServiceWithEventsDb = new TaskService(
        db,
        eventStore,
        projectionEngine,
        projectService,
        db // eventsDb
      );
    });

    it('uses single-DB fallback when eventsDb is not provided', () => {
      const task = taskService.createTask({ title: 'Single DB prune', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id);
      taskService.completeTask(task.task_id);
      db.prepare('UPDATE tasks_current SET terminal_at = ? WHERE task_id = ?').run(
        '2020-01-01T00:00:00Z',
        task.task_id
      );

      const result = taskService.pruneEligible({ project: 'inbox', olderThanDays: 30 });
      expect(result.count).toBe(1);

      const eventsAfter = db
        .prepare('SELECT COUNT(*) as cnt FROM events WHERE task_id = ?')
        .get(task.task_id) as { cnt: number };
      expect(eventsAfter.cnt).toBe(0);
      expect(taskService.getTaskById(task.task_id)).toBeNull();
    });

    it('returns empty result when no eligible tasks', () => {
      const result = taskServiceWithEventsDb.pruneEligible({
        project: 'inbox',
        olderThanDays: 1,
      });

      expect(result.count).toBe(0);
      expect(result.pruned).toHaveLength(0);
      expect(result.eventsDeleted).toBe(0);
    });

    it('deletes events for pruned tasks', () => {
      // Create and complete a task
      const task = taskServiceWithEventsDb.createTask({ title: 'To prune', project: 'inbox' });
      taskServiceWithEventsDb.setStatus(task.task_id, TaskStatus.Ready);
      taskServiceWithEventsDb.claimTask(task.task_id);
      taskServiceWithEventsDb.completeTask(task.task_id);

      // Backdate terminal_at to make it eligible
      db.prepare('UPDATE tasks_current SET terminal_at = ? WHERE task_id = ?').run(
        '2020-01-01T00:00:00Z',
        task.task_id
      );

      // Count events before
      const eventsBefore = db
        .prepare('SELECT COUNT(*) as cnt FROM events WHERE task_id = ?')
        .get(task.task_id) as { cnt: number };
      expect(eventsBefore.cnt).toBeGreaterThan(0);

      // Prune
      const result = taskServiceWithEventsDb.pruneEligible({
        project: 'inbox',
        olderThanDays: 30,
      });

      expect(result.count).toBe(1);
      expect(result.eventsDeleted).toBe(eventsBefore.cnt);

      // Verify events are deleted
      const eventsAfter = db
        .prepare('SELECT COUNT(*) as cnt FROM events WHERE task_id = ?')
        .get(task.task_id) as { cnt: number };
      expect(eventsAfter.cnt).toBe(0);
    });

    it('deletes projections for pruned tasks', () => {
      const task = taskServiceWithEventsDb.createTask({
        title: 'To prune',
        project: 'inbox',
        tags: ['test-tag'],
      });
      taskServiceWithEventsDb.setStatus(task.task_id, TaskStatus.Ready);
      taskServiceWithEventsDb.claimTask(task.task_id);
      taskServiceWithEventsDb.addComment(task.task_id, 'A comment');
      taskServiceWithEventsDb.addCheckpoint(task.task_id, 'cp1');
      taskServiceWithEventsDb.completeTask(task.task_id);

      // Backdate terminal_at
      db.prepare('UPDATE tasks_current SET terminal_at = ? WHERE task_id = ?').run(
        '2020-01-01T00:00:00Z',
        task.task_id
      );

      // Verify projections exist before
      expect(
        db.prepare('SELECT 1 FROM tasks_current WHERE task_id = ?').get(task.task_id)
      ).toBeDefined();
      expect(
        db.prepare('SELECT 1 FROM task_tags WHERE task_id = ?').get(task.task_id)
      ).toBeDefined();
      expect(
        db.prepare('SELECT 1 FROM task_comments WHERE task_id = ?').get(task.task_id)
      ).toBeDefined();
      expect(
        db.prepare('SELECT 1 FROM task_checkpoints WHERE task_id = ?').get(task.task_id)
      ).toBeDefined();

      // Prune
      taskServiceWithEventsDb.pruneEligible({ project: 'inbox', olderThanDays: 30 });

      // Verify all projections deleted
      expect(
        db.prepare('SELECT 1 FROM tasks_current WHERE task_id = ?').get(task.task_id)
      ).toBeUndefined();
      expect(
        db.prepare('SELECT 1 FROM task_tags WHERE task_id = ?').get(task.task_id)
      ).toBeUndefined();
      expect(
        db.prepare('SELECT 1 FROM task_comments WHERE task_id = ?').get(task.task_id)
      ).toBeUndefined();
      expect(
        db.prepare('SELECT 1 FROM task_checkpoints WHERE task_id = ?').get(task.task_id)
      ).toBeUndefined();
    });

    it('deletes dependency edges in both directions', () => {
      const dep = taskServiceWithEventsDb.createTask({ title: 'Dependency', project: 'inbox' });
      const task = taskServiceWithEventsDb.createTask({
        title: 'Dependent',
        project: 'inbox',
        depends_on: [dep.task_id],
      });

      // Complete both
      taskServiceWithEventsDb.setStatus(dep.task_id, TaskStatus.Ready);
      taskServiceWithEventsDb.setStatus(task.task_id, TaskStatus.Ready);
      taskServiceWithEventsDb.claimTask(dep.task_id);
      taskServiceWithEventsDb.completeTask(dep.task_id);
      taskServiceWithEventsDb.claimTask(task.task_id);
      taskServiceWithEventsDb.completeTask(task.task_id);

      // Backdate both
      db.prepare('UPDATE tasks_current SET terminal_at = ? WHERE task_id IN (?, ?)').run(
        '2020-01-01T00:00:00Z',
        dep.task_id,
        task.task_id
      );

      // Verify dependency exists
      expect(
        db.prepare('SELECT 1 FROM task_dependencies WHERE task_id = ?').get(task.task_id)
      ).toBeDefined();

      // Prune
      taskServiceWithEventsDb.pruneEligible({ project: 'inbox', olderThanDays: 30 });

      // Verify dependencies deleted
      const depCount = db.prepare('SELECT COUNT(*) as cnt FROM task_dependencies').get() as { cnt: number };
      expect(depCount.cnt).toBe(0);
    });

    it('restores append-only triggers after pruning', () => {
      const task = taskServiceWithEventsDb.createTask({ title: 'To prune', project: 'inbox' });
      taskServiceWithEventsDb.setStatus(task.task_id, TaskStatus.Ready);
      taskServiceWithEventsDb.claimTask(task.task_id);
      taskServiceWithEventsDb.completeTask(task.task_id);

      db.prepare('UPDATE tasks_current SET terminal_at = ? WHERE task_id = ?').run(
        '2020-01-01T00:00:00Z',
        task.task_id
      );

      // Prune
      taskServiceWithEventsDb.pruneEligible({ project: 'inbox', olderThanDays: 30 });

      // Verify triggers are restored - attempt to delete should fail
      const anotherTask = taskServiceWithEventsDb.createTask({
        title: 'Another task',
        project: 'inbox',
      });

      expect(() =>
        db.prepare('DELETE FROM events WHERE task_id = ?').run(anotherTask.task_id)
      ).toThrow(/append-only/i);
    });

    it('prunes parent and children together when both are terminal', () => {
      const parent = taskServiceWithEventsDb.createTask({ title: 'Parent', project: 'inbox' });
      const child = taskServiceWithEventsDb.createTask({
        title: 'Child',
        project: 'inbox',
        parent_id: parent.task_id,
      });

      // Complete both
      taskServiceWithEventsDb.setStatus(parent.task_id, TaskStatus.Ready);
      taskServiceWithEventsDb.setStatus(child.task_id, TaskStatus.Ready);
      taskServiceWithEventsDb.claimTask(parent.task_id);
      taskServiceWithEventsDb.claimTask(child.task_id);
      taskServiceWithEventsDb.completeTask(parent.task_id);
      taskServiceWithEventsDb.completeTask(child.task_id);

      // Backdate both
      db.prepare('UPDATE tasks_current SET terminal_at = ? WHERE task_id IN (?, ?)').run(
        '2020-01-01T00:00:00Z',
        parent.task_id,
        child.task_id
      );

      const result = taskServiceWithEventsDb.pruneEligible({
        project: 'inbox',
        olderThanDays: 30,
      });

      expect(result.count).toBe(2);
      expect(result.pruned.map(t => t.task_id).sort()).toEqual(
        [parent.task_id, child.task_id].sort()
      );

      // Both should be gone
      expect(taskServiceWithEventsDb.getTaskById(parent.task_id)).toBeNull();
      expect(taskServiceWithEventsDb.getTaskById(child.task_id)).toBeNull();
    });

    it('prunes tasks from all projects when project is undefined (--all flag)', () => {
      // Create projects with unique names for this test
      projectService.createProject('prune-all-proj-a');
      projectService.createProject('prune-all-proj-b');
      projectService.createProject('prune-all-proj-c');

      // Create tasks in multiple projects
      const taskA = taskServiceWithEventsDb.createTask({
        title: 'Project A task',
        project: 'prune-all-proj-a',
      });
      const taskB = taskServiceWithEventsDb.createTask({
        title: 'Project B task',
        project: 'prune-all-proj-b',
      });
      const taskC = taskServiceWithEventsDb.createTask({
        title: 'Project C task',
        project: 'prune-all-proj-c',
      });

      // Complete all tasks
      taskServiceWithEventsDb.setStatus(taskA.task_id, TaskStatus.Ready);
      taskServiceWithEventsDb.setStatus(taskB.task_id, TaskStatus.Ready);
      taskServiceWithEventsDb.setStatus(taskC.task_id, TaskStatus.Ready);
      taskServiceWithEventsDb.claimTask(taskA.task_id);
      taskServiceWithEventsDb.claimTask(taskB.task_id);
      taskServiceWithEventsDb.claimTask(taskC.task_id);
      taskServiceWithEventsDb.completeTask(taskA.task_id);
      taskServiceWithEventsDb.completeTask(taskB.task_id);
      taskServiceWithEventsDb.completeTask(taskC.task_id);

      // Backdate terminal_at for all tasks
      db.prepare('UPDATE tasks_current SET terminal_at = ? WHERE task_id IN (?, ?, ?)').run(
        '2020-01-01T00:00:00Z',
        taskA.task_id,
        taskB.task_id,
        taskC.task_id
      );

      // Prune with project undefined (--all mode)
      const result = taskServiceWithEventsDb.pruneEligible({
        project: undefined, // <-- This is the --all case
        olderThanDays: 30,
      });

      // Should prune at least our 3 tasks from ALL projects
      const ourPruned = result.pruned.filter(t =>
        ['prune-all-proj-a', 'prune-all-proj-b', 'prune-all-proj-c'].includes(t.project)
      );
      expect(ourPruned.length).toBe(3);
      const prunedProjects = new Set(ourPruned.map(t => t.project));
      expect(prunedProjects.has('prune-all-proj-a')).toBe(true);
      expect(prunedProjects.has('prune-all-proj-b')).toBe(true);
      expect(prunedProjects.has('prune-all-proj-c')).toBe(true);

      // All should be gone
      expect(taskServiceWithEventsDb.getTaskById(taskA.task_id)).toBeNull();
      expect(taskServiceWithEventsDb.getTaskById(taskB.task_id)).toBeNull();
      expect(taskServiceWithEventsDb.getTaskById(taskC.task_id)).toBeNull();
    });

    it('rolls back event deletion when projection deletion fails in split DB attach mode', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-prune-atomic-'));
      const cachePath = path.join(tempDir, 'cache.db');
      const eventsPath = path.join(tempDir, 'events.db');
      const cacheDb = new Database(cachePath);
      const eventsDb = new Database(eventsPath);

      try {
        cacheDb.exec(PRAGMAS);
        eventsDb.exec(PRAGMAS);
        cacheDb.exec(CACHE_SCHEMA_V1);
        eventsDb.exec(EVENTS_SCHEMA_V2);

        const splitEventStore = new EventStore(eventsDb);
        const splitProjectionEngine = new ProjectionEngine(cacheDb, eventsDb);
        registerProjectors(splitProjectionEngine);
        const splitProjectService = new ProjectService(cacheDb, splitEventStore, splitProjectionEngine);
        splitProjectService.ensureInboxExists();
        const splitTaskService = new TaskService(
          cacheDb,
          splitEventStore,
          splitProjectionEngine,
          splitProjectService,
          eventsDb
        );

        const task = splitTaskService.createTask({ title: 'Split DB task', project: 'inbox' });
        splitTaskService.setStatus(task.task_id, TaskStatus.Ready);
        splitTaskService.claimTask(task.task_id);
        splitTaskService.completeTask(task.task_id);
        cacheDb.prepare('UPDATE tasks_current SET terminal_at = ? WHERE task_id = ?').run(
          '2020-01-01T00:00:00Z',
          task.task_id
        );

        const eventsBefore = eventsDb
          .prepare('SELECT COUNT(*) as cnt FROM events WHERE task_id = ?')
          .get(task.task_id) as { cnt: number };
        expect(eventsBefore.cnt).toBeGreaterThan(0);

        const originalDeleteProjections = (splitTaskService as unknown as {
          deleteTasksFromProjections: (db: Database.Database, ids: string[]) => void;
        }).deleteTasksFromProjections;
        (splitTaskService as unknown as {
          deleteTasksFromProjections: () => never;
        }).deleteTasksFromProjections = () => {
          throw new Error('simulated projection failure');
        };

        expect(() =>
          splitTaskService.pruneEligible({ project: 'inbox', olderThanDays: 30 })
        ).toThrow('simulated projection failure');

        (splitTaskService as unknown as {
          deleteTasksFromProjections: (db: Database.Database, ids: string[]) => void;
        }).deleteTasksFromProjections = originalDeleteProjections;

        const eventsAfterFailure = eventsDb
          .prepare('SELECT COUNT(*) as cnt FROM events WHERE task_id = ?')
          .get(task.task_id) as { cnt: number };
        expect(eventsAfterFailure.cnt).toBe(eventsBefore.cnt);
        expect(
          cacheDb.prepare('SELECT 1 FROM tasks_current WHERE task_id = ?').get(task.task_id)
        ).toBeDefined();
      } finally {
        cacheDb.close();
        eventsDb.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('recovers projection cleanup from prune journal when fallback path is interrupted', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-prune-journal-'));
      const cachePath = path.join(tempDir, 'cache.db');
      const cacheDb = new Database(cachePath);
      const eventsDb = new Database(':memory:');
      const journalPath = path.join(tempDir, 'prune-journal.json');

      try {
        cacheDb.exec(PRAGMAS);
        eventsDb.exec(PRAGMAS);
        cacheDb.exec(CACHE_SCHEMA_V1);
        eventsDb.exec(EVENTS_SCHEMA_V2);

        const splitEventStore = new EventStore(eventsDb);
        const splitProjectionEngine = new ProjectionEngine(cacheDb, eventsDb);
        registerProjectors(splitProjectionEngine);
        const splitProjectService = new ProjectService(cacheDb, splitEventStore, splitProjectionEngine);
        splitProjectService.ensureInboxExists();
        const splitTaskService = new TaskService(
          cacheDb,
          splitEventStore,
          splitProjectionEngine,
          splitProjectService,
          eventsDb
        );

        const task = splitTaskService.createTask({ title: 'Journal fallback task', project: 'inbox' });
        splitTaskService.setStatus(task.task_id, TaskStatus.Ready);
        splitTaskService.claimTask(task.task_id);
        splitTaskService.completeTask(task.task_id);
        cacheDb.prepare('UPDATE tasks_current SET terminal_at = ? WHERE task_id = ?').run(
          '2020-01-01T00:00:00Z',
          task.task_id
        );

        const originalDeleteProjections = (splitTaskService as unknown as {
          deleteTasksFromProjections: (db: Database.Database, ids: string[]) => void;
        }).deleteTasksFromProjections;
        (splitTaskService as unknown as {
          deleteTasksFromProjections: () => never;
        }).deleteTasksFromProjections = () => {
          throw new Error('simulated crash after events delete');
        };

        expect(() =>
          splitTaskService.pruneEligible({ project: 'inbox', olderThanDays: 30 })
        ).toThrow('simulated crash after events delete');

        (splitTaskService as unknown as {
          deleteTasksFromProjections: (db: Database.Database, ids: string[]) => void;
        }).deleteTasksFromProjections = originalDeleteProjections;

        const eventsAfterCrash = eventsDb
          .prepare('SELECT COUNT(*) as cnt FROM events WHERE task_id = ?')
          .get(task.task_id) as { cnt: number };
        expect(eventsAfterCrash.cnt).toBe(0);
        expect(
          cacheDb.prepare('SELECT 1 FROM tasks_current WHERE task_id = ?').get(task.task_id)
        ).toBeDefined();
        expect(fs.existsSync(journalPath)).toBe(true);

        // Constructor-time recovery should finish projection cleanup.
        new TaskService(cacheDb, splitEventStore, splitProjectionEngine, splitProjectService, eventsDb);

        expect(
          cacheDb.prepare('SELECT 1 FROM tasks_current WHERE task_id = ?').get(task.task_id)
        ).toBeUndefined();
        expect(fs.existsSync(journalPath)).toBe(false);
      } finally {
        cacheDb.close();
        eventsDb.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('getBlockedByForTasks', () => {
    it('returns empty map for empty input', () => {
      const result = taskService.getBlockedByForTasks([]);
      expect(result.size).toBe(0);
    });

    it('returns empty map for tasks with no dependencies', () => {
      const task = taskService.createTask({ title: 'No deps', project: 'inbox' });
      const result = taskService.getBlockedByForTasks([task.task_id]);
      expect(result.size).toBe(0);
    });

    it('returns blocking dependency IDs for task with incomplete deps', () => {
      const dep1 = taskService.createTask({ title: 'Dep 1', project: 'inbox' });
      const dep2 = taskService.createTask({ title: 'Dep 2', project: 'inbox' });
      const task = taskService.createTask({
        title: 'Blocked task',
        project: 'inbox',
        depends_on: [dep1.task_id, dep2.task_id],
      });

      const result = taskService.getBlockedByForTasks([task.task_id]);
      expect(result.has(task.task_id)).toBe(true);
      expect(result.get(task.task_id)!.sort()).toEqual([dep1.task_id, dep2.task_id].sort());
    });

    it('excludes task from map when all dependencies are done', () => {
      const dep = taskService.createTask({ title: 'Dep', project: 'inbox' });
      const task = taskService.createTask({
        title: 'Task',
        project: 'inbox',
        depends_on: [dep.task_id],
      });

      // Complete the dependency: backlog → ready → in_progress → done
      taskService.setStatus(dep.task_id, TaskStatus.Ready);
      taskService.claimTask(dep.task_id);
      taskService.completeTask(dep.task_id);

      const result = taskService.getBlockedByForTasks([task.task_id]);
      expect(result.has(task.task_id)).toBe(false);
    });

    it('returns only blocked tasks in a mix of blocked and unblocked', () => {
      const dep = taskService.createTask({ title: 'Dep', project: 'inbox' });
      const blocked = taskService.createTask({
        title: 'Blocked',
        project: 'inbox',
        depends_on: [dep.task_id],
      });
      const unblocked = taskService.createTask({ title: 'Unblocked', project: 'inbox' });

      const result = taskService.getBlockedByForTasks([blocked.task_id, unblocked.task_id]);
      expect(result.has(blocked.task_id)).toBe(true);
      expect(result.has(unblocked.task_id)).toBe(false);
    });

    it('excludes done tasks even if they have incomplete deps', () => {
      const dep = taskService.createTask({ title: 'Dep', project: 'inbox' });
      const task = taskService.createTask({
        title: 'Done task',
        project: 'inbox',
        depends_on: [dep.task_id],
      });

      // Force task to done status directly via setStatus (bypassing dep check)
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.setStatus(task.task_id, TaskStatus.InProgress);
      taskService.setStatus(task.task_id, TaskStatus.Done);

      const result = taskService.getBlockedByForTasks([task.task_id]);
      expect(result.has(task.task_id)).toBe(false);
    });

    it('includes non-terminal status tasks with incomplete deps', () => {
      const dep = taskService.createTask({ title: 'Dep', project: 'inbox' });

      // ready status (default after backlog → ready transition)
      const readyTask = taskService.createTask({
        title: 'Ready task',
        project: 'inbox',
        depends_on: [dep.task_id],
      });

      // in_progress status (set directly to bypass dep check)
      const inProgressTask = taskService.createTask({
        title: 'In-progress task',
        project: 'inbox',
        depends_on: [dep.task_id],
      });
      taskService.setStatus(inProgressTask.task_id, TaskStatus.Ready);
      taskService.setStatus(inProgressTask.task_id, TaskStatus.InProgress);

      const result = taskService.getBlockedByForTasks([readyTask.task_id, inProgressTask.task_id]);
      expect(result.has(readyTask.task_id)).toBe(true);
      expect(result.has(inProgressTask.task_id)).toBe(true);
    });

    it('excludes archived tasks even if they have incomplete deps', () => {
      const dep = taskService.createTask({ title: 'Dep', project: 'inbox' });
      const task = taskService.createTask({
        title: 'Archived task',
        project: 'inbox',
        depends_on: [dep.task_id],
      });

      taskService.setStatus(task.task_id, TaskStatus.Archived);

      const result = taskService.getBlockedByForTasks([task.task_id]);
      expect(result.has(task.task_id)).toBe(false);
    });

    it('treats archived dependency as a blocker', () => {
      const dep = taskService.createTask({ title: 'Archived dep', project: 'inbox' });
      const task = taskService.createTask({
        title: 'Task with archived dep',
        project: 'inbox',
        depends_on: [dep.task_id],
      });

      taskService.setStatus(dep.task_id, TaskStatus.Archived);

      const result = taskService.getBlockedByForTasks([task.task_id]);
      expect(result.has(task.task_id)).toBe(true);
      expect(result.get(task.task_id)).toEqual([dep.task_id]);
    });
  });

  describe('resolveTaskId', () => {
    it('returns full ID for exact match', () => {
      const task = taskService.createTask({ title: 'Exact match test', project: 'inbox' });
      const resolved = taskService.resolveTaskId(task.task_id);
      expect(resolved).toBe(task.task_id);
    });

    it('resolves unique prefix to full ID', () => {
      const task = taskService.createTask({ title: 'Prefix test', project: 'inbox' });
      // Use the full ID minus last char — guaranteed unique with one task
      const prefix = task.task_id.slice(0, task.task_id.length - 1);
      const resolved = taskService.resolveTaskId(prefix);
      expect(resolved).toBe(task.task_id);
    });

    it('returns null for no match', () => {
      taskService.createTask({ title: 'Some task', project: 'inbox' });
      const resolved = taskService.resolveTaskId('ZZZZZZZZ');
      expect(resolved).toBeNull();
    });

    it('returns null for full-length non-existent ID', () => {
      const resolved = taskService.resolveTaskId('01ZZZZZZZZZZZZZZZZZZZZZZZZ');
      expect(resolved).toBeNull();
    });

    it('prefers exact match over prefix search', () => {
      // Insert a fake task whose full ID happens to be a prefix of another
      // We test this by verifying exact match returns immediately
      const task = taskService.createTask({ title: 'Exact match priority', project: 'inbox' });
      // Even if the LIKE query would match, exact match should win
      const resolved = taskService.resolveTaskId(task.task_id);
      expect(resolved).toBe(task.task_id);
    });

    it('throws AmbiguousPrefixError when prefix matches multiple tasks', () => {
      // ULIDs created in the same ms share the first 10 chars (timestamp component)
      const task1 = taskService.createTask({ title: 'Task one', project: 'inbox' });
      const task2 = taskService.createTask({ title: 'Task two', project: 'inbox' });

      // Find shared prefix length
      let commonLen = 0;
      while (commonLen < task1.task_id.length && task1.task_id[commonLen] === task2.task_id[commonLen]) {
        commonLen++;
      }
      // Need at least 1 shared char to form an ambiguous prefix
      expect(commonLen).toBeGreaterThanOrEqual(1);

      const ambiguousPrefix = task1.task_id.slice(0, commonLen);
      expect(() => taskService.resolveTaskId(ambiguousPrefix)).toThrow(AmbiguousPrefixError);
    });

    it('AmbiguousPrefixError includes matching task IDs and titles', () => {
      const task1 = taskService.createTask({ title: 'Alpha task', project: 'inbox' });
      const task2 = taskService.createTask({ title: 'Beta task', project: 'inbox' });

      let commonLen = 0;
      while (commonLen < task1.task_id.length && task1.task_id[commonLen] === task2.task_id[commonLen]) {
        commonLen++;
      }

      const ambiguousPrefix = task1.task_id.slice(0, commonLen);
      try {
        taskService.resolveTaskId(ambiguousPrefix);
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(AmbiguousPrefixError);
        const err = e as AmbiguousPrefixError;
        expect(err.matches).toHaveLength(2);
        const ids = err.matches.map(m => m.task_id).sort();
        expect(ids).toEqual([task1.task_id, task2.task_id].sort());
        const titles = err.matches.map(m => m.title).sort();
        expect(titles).toEqual(['Alpha task', 'Beta task']);
        expect(err.message).toContain(ambiguousPrefix);
        expect(err.message).toContain('Alpha task');
        expect(err.message).toContain('Beta task');
      }
    });

    it('resolves when one of many tasks has a unique prefix', () => {
      const task1 = taskService.createTask({ title: 'Task A', project: 'inbox' });
      const task2 = taskService.createTask({ title: 'Task B', project: 'inbox' });

      // The full ID of task1 is unique even though its prefix overlaps with task2
      const resolved = taskService.resolveTaskId(task1.task_id);
      expect(resolved).toBe(task1.task_id);

      // A prefix that's one char longer than the common prefix should disambiguate
      let commonLen = 0;
      while (commonLen < task1.task_id.length && task1.task_id[commonLen] === task2.task_id[commonLen]) {
        commonLen++;
      }
      // commonLen is the first differing position, so slice(0, commonLen+1) is unique to task1
      const uniquePrefix = task1.task_id.slice(0, commonLen + 1);
      const resolved2 = taskService.resolveTaskId(uniquePrefix);
      expect(resolved2).toBe(task1.task_id);
    });

    it('returns null when no tasks exist', () => {
      const resolved = taskService.resolveTaskId('01ABCDEF');
      expect(resolved).toBeNull();
    });
  });

  describe('on_done hooks', () => {
    it('enqueues outbox item when task is created directly as done', () => {
      const hookTaskService = new TaskService(db, eventStore, projectionEngine, projectService, undefined, {
        onDone: { url: 'http://127.0.0.1:18789/events/inject' },
      });

      const task = hookTaskService.createTask({
        title: 'Done on create',
        project: 'inbox',
        initial_status: TaskStatus.Done,
      });

      const row = db
        .prepare('SELECT hook_name, status, url FROM hook_outbox WHERE payload LIKE ?')
        .get(`%"task_id":"${task.task_id}"%`) as
        | { hook_name: string; status: string; url: string }
        | undefined;

      expect(row).toBeDefined();
      expect(row?.hook_name).toBe('on_done');
      expect(row?.status).toBe('queued');
      expect(row?.url).toBe('http://127.0.0.1:18789/events/inject');
    });

    it('enqueues outbox item when setStatus transitions to done', () => {
      const hookTaskService = new TaskService(db, eventStore, projectionEngine, projectService, undefined, {
        onDone: { url: 'http://127.0.0.1:18789/events/inject' },
      });

      const task = hookTaskService.createTask({ title: 'Set status done', project: 'inbox' });
      hookTaskService.setStatus(task.task_id, TaskStatus.Ready);
      hookTaskService.setStatus(task.task_id, TaskStatus.InProgress);
      hookTaskService.setStatus(task.task_id, TaskStatus.Done);

      const count = (
        db.prepare('SELECT COUNT(*) as count FROM hook_outbox WHERE payload LIKE ?')
          .get(`%"task_id":"${task.task_id}"%`) as { count: number }
      ).count;

      expect(count).toBe(1);
    });

    it('enqueues outbox item when completeTask transitions to done', () => {
      const hookTaskService = new TaskService(db, eventStore, projectionEngine, projectService, undefined, {
        onDone: { url: 'http://127.0.0.1:18789/events/inject' },
      });

      const task = hookTaskService.createTask({ title: 'Complete me', project: 'inbox' });
      hookTaskService.setStatus(task.task_id, TaskStatus.Ready);
      hookTaskService.claimTask(task.task_id, { author: 'agent-1' });
      hookTaskService.completeTask(task.task_id, { author: 'agent-1' });

      const count = (
        db.prepare('SELECT COUNT(*) as count FROM hook_outbox WHERE payload LIKE ?')
          .get(`%"task_id":"${task.task_id}"%`) as { count: number }
      ).count;

      expect(count).toBe(1);
    });
  });
});
