// packages/hzl-core/src/projections/tasks-current.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { TasksCurrentProjector } from './tasks-current.js';
import { runMigrations } from '../db/migrations.js';
import { EventStore } from '../events/store.js';
import { EventType, TaskStatus } from '../events/types.js';

describe('TasksCurrentProjector', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let projector: TasksCurrentProjector;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    eventStore = new EventStore(db);
    projector = new TasksCurrentProjector();
  });

  afterEach(() => {
    db.close();
  });

  describe('task_created', () => {
    it('inserts new task with defaults', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test task', project: 'inbox' },
      });

      projector.apply(event, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.title).toBe('Test task');
      expect(task.project).toBe('inbox');
      expect(task.status).toBe('backlog');
      expect(task.priority).toBe(0);
      expect(JSON.parse(task.tags)).toEqual([]);
    });

    it('inserts task with all optional fields', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: {
          title: 'Full task',
          project: 'project-a',
          description: 'A description',
          tags: ['urgent', 'backend'],
          priority: 2,
          links: ['doc.md'],
          metadata: { key: 'value' },
        },
      });

      projector.apply(event, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.description).toBe('A description');
      expect(JSON.parse(task.tags)).toEqual(['urgent', 'backend']);
      expect(task.priority).toBe(2);
      expect(JSON.parse(task.links)).toEqual(['doc.md']);
      expect(JSON.parse(task.metadata)).toEqual({ key: 'value' });
    });
  });

  describe('status_changed', () => {
    it('updates status', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const statusEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.StatusChanged,
        data: { from: TaskStatus.Backlog, to: TaskStatus.Ready },
      });
      projector.apply(statusEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.status).toBe('ready');
    });

    it('sets claim fields when transitioning to in_progress', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
        author: 'agent-1',
        agent_id: 'AGENT001',
      });
      projector.apply(createEvent, db);

      const claimEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.StatusChanged,
        data: {
          from: TaskStatus.Ready,
          to: TaskStatus.InProgress,
          lease_until: '2026-01-30T12:00:00Z',
        },
        author: 'agent-1',
        agent_id: 'AGENT001',
      });
      projector.apply(claimEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.status).toBe('in_progress');
      expect(task.claimed_at).toBeDefined();
      expect(task.claimed_by_author).toBe('agent-1');
      expect(task.claimed_by_agent_id).toBe('AGENT001');
      expect(task.lease_until).toBe('2026-01-30T12:00:00Z');
    });

    it('clears claim fields when released', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const claimEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.StatusChanged,
        data: { from: TaskStatus.Ready, to: TaskStatus.InProgress },
        author: 'agent-1',
      });
      projector.apply(claimEvent, db);

      const releaseEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.StatusChanged,
        data: { from: TaskStatus.InProgress, to: TaskStatus.Ready },
      });
      projector.apply(releaseEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.status).toBe('ready');
      expect(task.claimed_at).toBeNull();
      expect(task.claimed_by_author).toBeNull();
      expect(task.lease_until).toBeNull();
    });
  });

  describe('task_moved', () => {
    it('updates project', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const moveEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskMoved,
        data: { from_project: 'inbox', to_project: 'project-a' },
      });
      projector.apply(moveEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.project).toBe('project-a');
    });
  });

  describe('task_updated', () => {
    it('updates title', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Original', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const updateEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskUpdated,
        data: { field: 'title', old_value: 'Original', new_value: 'Updated' },
      });
      projector.apply(updateEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.title).toBe('Updated');
    });

    it('updates tags as JSON', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const updateEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskUpdated,
        data: { field: 'tags', new_value: ['new-tag'] },
      });
      projector.apply(updateEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(JSON.parse(task.tags)).toEqual(['new-tag']);
    });
  });

  describe('task_archived', () => {
    it('sets status to archived', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const archiveEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskArchived,
        data: { reason: 'No longer needed' },
      });
      projector.apply(archiveEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.status).toBe('archived');
    });
  });

  describe('reset', () => {
    it('clears all task data', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      projector.reset!(db);

      const count = db.prepare('SELECT COUNT(*) as cnt FROM tasks_current').get() as any;
      expect(count.cnt).toBe(0);
    });
  });
});
