// packages/hzl-core/src/projections/dependencies.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import { DependenciesProjector } from './dependencies.js';
import { createTestDb } from '../db/test-utils.js';
import { EventStore } from '../events/store.js';
import { EventType } from '../events/types.js';

describe('DependenciesProjector', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let projector: DependenciesProjector;

  beforeEach(() => {
    db = createTestDb();
    // Schema applied by createTestDb
    eventStore = new EventStore(db);
    projector = new DependenciesProjector();
  });

  afterEach(() => {
    db.close();
  });

  describe('task_created with depends_on', () => {
    it('inserts dependency edges', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: {
          title: 'Test',
          project: 'inbox',
          depends_on: ['DEP1', 'DEP2'],
        },
      });

      projector.apply(event, db);

      const deps = db.prepare(
        'SELECT depends_on_id FROM task_dependencies WHERE task_id = ? ORDER BY depends_on_id'
      ).all('TASK1') as any[];
      expect(deps.map(d => d.depends_on_id)).toEqual(['DEP1', 'DEP2']);
    });
  });

  describe('dependency_added', () => {
    it('adds new dependency edge', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.DependencyAdded,
        data: { depends_on_id: 'DEP1' },
      });

      projector.apply(event, db);

      const dep = db.prepare(
        'SELECT * FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?'
      ).get('TASK1', 'DEP1');
      expect(dep).toBeDefined();
    });

    it('is idempotent for duplicate adds', () => {
      const event1 = eventStore.append({
        task_id: 'TASK1',
        type: EventType.DependencyAdded,
        data: { depends_on_id: 'DEP1' },
      });
      projector.apply(event1, db);

      const event2 = eventStore.append({
        task_id: 'TASK1',
        type: EventType.DependencyAdded,
        data: { depends_on_id: 'DEP1' },
      });
      projector.apply(event2, db);

      const deps = db.prepare(
        'SELECT * FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?'
      ).all('TASK1', 'DEP1');
      expect(deps).toHaveLength(1);
    });
  });

  describe('dependency_removed', () => {
    it('removes dependency edge', () => {
      const addEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.DependencyAdded,
        data: { depends_on_id: 'DEP1' },
      });
      projector.apply(addEvent, db);

      const removeEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.DependencyRemoved,
        data: { depends_on_id: 'DEP1' },
      });
      projector.apply(removeEvent, db);

      const dep = db.prepare(
        'SELECT * FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?'
      ).get('TASK1', 'DEP1');
      expect(dep).toBeUndefined();
    });
  });

  describe('reset', () => {
    it('clears all dependencies', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.DependencyAdded,
        data: { depends_on_id: 'DEP1' },
      });
      projector.apply(event, db);

      projector.reset!(db);

      const count = db.prepare('SELECT COUNT(*) as cnt FROM task_dependencies').get() as any;
      expect(count.cnt).toBe(0);
    });
  });
});
