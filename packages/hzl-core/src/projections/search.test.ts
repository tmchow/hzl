// packages/hzl-core/src/projections/search.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import { SearchProjector } from './search.js';
import { TasksCurrentProjector } from './tasks-current.js';
import { runMigrations } from '../db/migrations.js';
import { EventStore } from '../events/store.js';
import { EventType } from '../events/types.js';

describe('SearchProjector', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let tasksProjector: TasksCurrentProjector;
  let searchProjector: SearchProjector;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    eventStore = new EventStore(db);
    tasksProjector = new TasksCurrentProjector();
    searchProjector = new SearchProjector();
  });

  afterEach(() => {
    db.close();
  });

  describe('task_created', () => {
    it('indexes title and description', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: {
          title: 'Implement authentication',
          project: 'inbox',
          description: 'Add OAuth2 support',
        },
      });
      tasksProjector.apply(event, db);
      searchProjector.apply(event, db);

      const results = db.prepare(
        "SELECT task_id FROM task_search WHERE task_search MATCH 'authentication'"
      ).all() as any[];
      expect(results.map(r => r.task_id)).toContain('TASK1');
    });
  });

  describe('task_updated', () => {
    it('updates index when title changes', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Original title', project: 'inbox' },
      });
      tasksProjector.apply(createEvent, db);
      searchProjector.apply(createEvent, db);

      const updateEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskUpdated,
        data: { field: 'title', new_value: 'Updated title' },
      });
      tasksProjector.apply(updateEvent, db);
      searchProjector.apply(updateEvent, db);

      const oldResults = db.prepare(
        "SELECT task_id FROM task_search WHERE task_search MATCH 'Original'"
      ).all();
      expect(oldResults).toHaveLength(0);

      const newResults = db.prepare(
        "SELECT task_id FROM task_search WHERE task_search MATCH 'Updated'"
      ).all() as any[];
      expect(newResults.map(r => r.task_id)).toContain('TASK1');
    });
  });

  describe('reset', () => {
    it('clears search index', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      tasksProjector.apply(event, db);
      searchProjector.apply(event, db);

      searchProjector.reset!(db);

      const count = db.prepare('SELECT COUNT(*) as cnt FROM task_search').get() as any;
      expect(count.cnt).toBe(0);
    });
  });
});
