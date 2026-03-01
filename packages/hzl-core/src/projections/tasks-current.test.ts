// packages/hzl-core/src/projections/tasks-current.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import { TasksCurrentProjector } from './tasks-current.js';
import { createTestDb } from '../db/test-utils.js';
import { EventStore } from '../events/store.js';
import type { PersistedEventEnvelope } from '../events/store.js';
import { EventType, TaskStatus } from '../events/types.js';

describe('TasksCurrentProjector', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let projector: TasksCurrentProjector;

  beforeEach(() => {
    db = createTestDb();
    // Schema applied by createTestDb
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

    it('sets agent when transitioning to in_progress', () => {
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
      expect(task.agent).toBe('agent-1');
      expect(task.lease_until).toBe('2026-01-30T12:00:00Z');
    });

    it('preserves agent when released', () => {
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
      expect(task.agent).toBe('agent-1'); // Assignee persists!
      expect(task.lease_until).toBeNull();
    });

    it('handles blocked status', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const claimEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.StatusChanged,
        data: { from: TaskStatus.Ready, to: TaskStatus.InProgress, lease_until: '2026-01-30T12:00:00Z' },
        author: 'agent-1',
      });
      projector.apply(claimEvent, db);

      const blockEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.StatusChanged,
        data: { from: TaskStatus.InProgress, to: TaskStatus.Blocked },
      });
      projector.apply(blockEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.status).toBe('blocked');
      expect(task.agent).toBe('agent-1'); // Preserved
      expect(task.lease_until).toBeNull(); // Cleared
    });

    it('preserves pre-assignment when claiming without author', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox', agent: 'pre-assigned-agent' },
      });
      projector.apply(createEvent, db);

      // Claim without specifying author
      const claimEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.StatusChanged,
        data: { from: TaskStatus.Ready, to: TaskStatus.InProgress },
        // No author provided
      });
      projector.apply(claimEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.agent).toBe('pre-assigned-agent'); // Pre-assignment preserved
    });

    it('supports legacy assignee event fields during replay', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox', assignee: 'legacy-owner' },
      });
      projector.apply(createEvent, db);

      const claimEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.StatusChanged,
        data: { from: TaskStatus.Ready, to: TaskStatus.InProgress, assignee: 'legacy-claimant' },
      });
      projector.apply(claimEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.agent).toBe('legacy-claimant');
    });

    it('overwrites agent when task is stolen (in_progress → in_progress)', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      // First claim by agent-1
      const claimEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.StatusChanged,
        data: { from: TaskStatus.Ready, to: TaskStatus.InProgress },
        author: 'agent-1',
      });
      projector.apply(claimEvent, db);

      let task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.agent).toBe('agent-1');

      // Steal by agent-2
      const stealEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.StatusChanged,
        data: { from: TaskStatus.InProgress, to: TaskStatus.InProgress, reason: 'stolen' },
        author: 'agent-2',
      });
      projector.apply(stealEvent, db);

      task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.agent).toBe('agent-2'); // Assignee overwritten to new owner
    });

    it('prefers explicit agent over event author for in_progress transitions', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const claimEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.StatusChanged,
        data: { from: TaskStatus.Backlog, to: TaskStatus.InProgress, agent: 'kenji' },
        author: 'clara',
      });
      projector.apply(claimEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.agent).toBe('kenji');
    });

    it('sets progress to 100 when transitioning to done', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const checkpointEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.CheckpointRecorded,
        data: { name: 'Started', progress: 40 },
      });
      projector.apply(checkpointEvent, db);

      const doneEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.StatusChanged,
        data: { from: TaskStatus.InProgress, to: TaskStatus.Done },
      });
      projector.apply(doneEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.status).toBe('done');
      expect(task.progress).toBe(100);
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

    it('skips invalid field names defensively', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Original', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const before = db.prepare('SELECT title, updated_at, last_event_id FROM tasks_current WHERE task_id = ?')
        .get('TASK1') as any;

      const invalidUpdateEvent: PersistedEventEnvelope = {
        rowid: 9999,
        event_id: 'invalid-field-event',
        task_id: 'TASK1',
        type: EventType.TaskUpdated,
        data: {
          field: 'title = ?, status = ?',
          new_value: 'Malicious update',
        },
        timestamp: '2026-01-30T12:00:00.000Z',
      };

      expect(() => projector.apply(invalidUpdateEvent, db)).not.toThrow();

      const task = db.prepare('SELECT title, status, updated_at, last_event_id FROM tasks_current WHERE task_id = ?')
        .get('TASK1') as any;
      expect(task.title).toBe('Original');
      expect(task.status).toBe('backlog');
      expect(task.updated_at).toBe(before.updated_at);
      expect(task.last_event_id).toBe(before.last_event_id);
    });

    it('still applies valid updates after skipping an invalid field', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Original', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const invalidUpdateEvent: PersistedEventEnvelope = {
        rowid: 9999,
        event_id: 'invalid-field-event',
        task_id: 'TASK1',
        type: EventType.TaskUpdated,
        data: {
          field: 'title = ?, status = ?',
          new_value: 'Malicious update',
        },
        timestamp: '2026-01-30T12:00:00.000Z',
      };
      projector.apply(invalidUpdateEvent, db);

      const validUpdateEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskUpdated,
        data: { field: 'title', old_value: 'Original', new_value: 'Updated' },
      });
      projector.apply(validUpdateEvent, db);

      const task = db.prepare('SELECT title, last_event_id FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.title).toBe('Updated');
      expect(task.last_event_id).toBe(validUpdateEvent.rowid);
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

  describe('checkpoint_recorded', () => {
    it('updates progress when present', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const checkpointEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.CheckpointRecorded,
        data: { name: 'Halfway done', progress: 50 },
      });
      projector.apply(checkpointEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.progress).toBe(50);
    });

    it('does not change progress when not present', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const checkpointEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.CheckpointRecorded,
        data: { name: 'Just a checkpoint' },
      });
      projector.apply(checkpointEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.progress).toBeNull();
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
