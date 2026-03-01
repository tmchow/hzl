import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'libsql';
import { EventStore } from './store.js';
import { UpcasterRegistry, type EventUpcaster } from './upcasters.js';
import { CURRENT_SCHEMA_VERSION, EventType, TaskStatus } from './types.js';
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

    it('stamps CURRENT_SCHEMA_VERSION in the events table', () => {
      const event = store.append({
        task_id: 'TASK_SCHEMA',
        type: EventType.TaskCreated,
        data: { title: 'Versioned task', project: 'inbox' },
      });

      const row = db.prepare('SELECT schema_version FROM events WHERE event_id = ?').get(event.event_id) as {
        schema_version: number;
      };
      expect(row.schema_version).toBe(CURRENT_SCHEMA_VERSION);
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

    it('upcasts legacy event data before returning envelopes', () => {
      const upcasters: EventUpcaster[] = [
        {
          eventType: EventType.TaskCreated,
          fromVersion: 0,
          toVersion: 1,
          up(data) {
            const next = { ...data };
            if ('assignee' in next && typeof next.assignee === 'string' && !('agent' in next)) {
              next.agent = next.assignee;
              delete next.assignee;
            }
            return next;
          },
        },
      ];

      store = new EventStore(db, new UpcasterRegistry(upcasters));
      db.prepare(`
        INSERT INTO events (event_id, task_id, type, data, schema_version, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'EVT_LEGACY',
        'TASK_LEGACY',
        EventType.TaskCreated,
        JSON.stringify({ title: 'Legacy', project: 'inbox', assignee: 'agent-1' }),
        0,
        new Date().toISOString()
      );

      const events = store.getByTaskId('TASK_LEGACY');
      expect(events).toHaveLength(1);
      expect(events[0].data).toEqual({ title: 'Legacy', project: 'inbox', agent: 'agent-1' });
    });

    it('passes through future schema versions unchanged and warns', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      db.prepare(`
        INSERT INTO events (event_id, task_id, type, data, schema_version, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'EVT_FUTURE',
        'TASK_FUTURE',
        EventType.TaskCreated,
        JSON.stringify({ title: 'Future', project: 'inbox' }),
        CURRENT_SCHEMA_VERSION + 1,
        new Date().toISOString()
      );

      const events = store.getByTaskId('TASK_FUTURE');
      expect(events).toHaveLength(1);
      expect(events[0].data).toEqual({ title: 'Future', project: 'inbox' });
      expect(warnSpy).toHaveBeenCalledOnce();

      warnSpy.mockRestore();
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
