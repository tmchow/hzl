import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import { EventStore } from './store.js';
import { EventType, TaskStatus } from './types.js';
import { createTestDb } from '../db/test-utils.js';

describe('EventStore', () => {
  let db: Database.Database;
  let store: EventStore;

  beforeEach(() => {
    db = createTestDb();
    store = new EventStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('append', () => {
    it('inserts event and returns envelope with DB timestamp', () => {
      const event = store.append({
        task_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        type: EventType.TaskCreated,
        data: { title: 'Test task', project: 'inbox' },
      });

      expect(event.event_id).toBeDefined();
      expect(event.task_id).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
      expect(event.type).toBe(EventType.TaskCreated);
      expect(event.timestamp).toBeDefined();
      expect(event.rowid).toBeGreaterThan(0);
    });

    it('rejects duplicate event_id', () => {
      const eventId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
      store.append({
        event_id: eventId,
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });

      expect(() => store.append({
        event_id: eventId,
        task_id: 'TASK2',
        type: EventType.TaskCreated,
        data: { title: 'Test 2', project: 'inbox' },
      })).toThrow();
    });

    it('validates event data', () => {
      expect(() => store.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { project: 'inbox' }, // missing title
      })).toThrow();
    });
  });

  describe('getByTaskId', () => {
    it('returns events for a task in order', () => {
      const taskId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

      store.append({
        task_id: taskId,
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });

      store.append({
        task_id: taskId,
        type: EventType.StatusChanged,
        data: { from: TaskStatus.Backlog, to: TaskStatus.Ready },
      });

      const events = store.getByTaskId(taskId);
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe(EventType.TaskCreated);
      expect(events[1].type).toBe(EventType.StatusChanged);
    });

    it('supports pagination with afterId', () => {
      const taskId = 'TASK1';
      const e1 = store.append({
        task_id: taskId,
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      store.append({
        task_id: taskId,
        type: EventType.CommentAdded,
        data: { text: 'Comment 1' },
      });
      store.append({
        task_id: taskId,
        type: EventType.CommentAdded,
        data: { text: 'Comment 2' },
      });

      const events = store.getByTaskId(taskId, { afterId: e1.rowid });
      expect(events).toHaveLength(2);
      expect((events[0].data as any).text).toBe('Comment 1');
    });

    it('supports limit', () => {
      const taskId = 'TASK1';
      store.append({
        task_id: taskId,
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      for (let i = 0; i < 10; i++) {
        store.append({
          task_id: taskId,
          type: EventType.CommentAdded,
          data: { text: `Comment ${i}` },
        });
      }

      const events = store.getByTaskId(taskId, { limit: 5 });
      expect(events).toHaveLength(5);
    });
  });

  describe('appendIdempotent', () => {
    it('inserts new event', () => {
      const result = store.appendIdempotent({
        event_id: 'UNIQUE1',
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });

      expect(result).not.toBeNull();
      expect(result!.event_id).toBe('UNIQUE1');
    });

    it('returns null for duplicate event_id', () => {
      store.append({
        event_id: 'UNIQUE1',
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });

      const result = store.appendIdempotent({
        event_id: 'UNIQUE1',
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });

      expect(result).toBeNull();
    });
  });
});
