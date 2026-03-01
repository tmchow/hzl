// packages/hzl-core/src/projections/tags.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import { TagsProjector } from './tags.js';
import { createTestDb } from '../db/test-utils.js';
import { EventStore } from '../events/store.js';
import { EventType } from '../events/types.js';

describe('TagsProjector', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let projector: TagsProjector;

  beforeEach(() => {
    db = createTestDb();
    // Schema applied by createTestDb
    eventStore = new EventStore(db);
    projector = new TagsProjector();
  });

  afterEach(() => {
    db.close();
  });

  describe('task_created with tags', () => {
    it('inserts tag rows', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: {
          title: 'Test',
          project: 'inbox',
          tags: ['urgent', 'backend'],
        },
      });

      projector.apply(event, db);

      const tags = db.prepare(
        'SELECT tag FROM task_tags WHERE task_id = ? ORDER BY tag'
      ).all('TASK1') as any[];
      expect(tags.map(t => t.tag)).toEqual(['backend', 'urgent']);
    });
  });

  describe('task_updated tags field', () => {
    it('replaces all tags', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox', tags: ['old1', 'old2'] },
      });
      projector.apply(createEvent, db);

      const updateEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskUpdated,
        data: { field: 'tags', new_value: ['new1', 'new2', 'new3'] },
      });
      projector.apply(updateEvent, db);

      const tags = db.prepare(
        'SELECT tag FROM task_tags WHERE task_id = ? ORDER BY tag'
      ).all('TASK1') as any[];
      expect(tags.map(t => t.tag)).toEqual(['new1', 'new2', 'new3']);
    });
  });

  describe('reset', () => {
    it('clears all tag data', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox', tags: ['tag1'] },
      });
      projector.apply(event, db);

      projector.reset!(db);

      const count = db.prepare('SELECT COUNT(*) as cnt FROM task_tags').get() as any;
      expect(count.cnt).toBe(0);
    });

    it('re-prepares statements when db reference changes', () => {
      const firstDb = createTestDb();
      const secondDb = createTestDb();
      const firstStore = new EventStore(firstDb);
      const secondStore = new EventStore(secondDb);
      const localProjector = new TagsProjector();

      try {
        const firstEvent = firstStore.append({
          task_id: 'TASK1',
          type: EventType.TaskCreated,
          data: { title: 'First', project: 'inbox', tags: ['first'] },
        });
        localProjector.apply(firstEvent, firstDb);

        const secondEvent = secondStore.append({
          task_id: 'TASK2',
          type: EventType.TaskCreated,
          data: { title: 'Second', project: 'inbox', tags: ['second'] },
        });
        localProjector.apply(secondEvent, secondDb);

        const tags = secondDb
          .prepare('SELECT tag FROM task_tags WHERE task_id = ? ORDER BY tag')
          .all('TASK2') as any[];
        expect(tags.map(t => t.tag)).toEqual(['second']);
      } finally {
        firstDb.close();
        secondDb.close();
      }
    });
  });
});
