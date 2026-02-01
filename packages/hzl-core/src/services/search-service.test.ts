// packages/hzl-core/src/services/search-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import { SearchService } from './search-service.js';
import { createTestDb } from '../db/test-utils.js';
import { EventStore } from '../events/store.js';
import { ProjectionEngine } from '../projections/engine.js';
import { TasksCurrentProjector } from '../projections/tasks-current.js';
import { SearchProjector } from '../projections/search.js';
import { EventType } from '../events/types.js';

describe('SearchService', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let engine: ProjectionEngine;
  let searchService: SearchService;

  beforeEach(() => {
    db = createTestDb();
    // Schema applied by createTestDb
    eventStore = new EventStore(db);
    engine = new ProjectionEngine(db);
    engine.register(new TasksCurrentProjector());
    engine.register(new SearchProjector());
    searchService = new SearchService(db);
  });

  afterEach(() => { db.close(); });

  function createTask(taskId: string, title: string, project: string, description?: string) {
    const event = eventStore.append({ task_id: taskId, type: EventType.TaskCreated, data: { title, project, description } });
    engine.applyEvent(event);
  }

  describe('search', () => {
    it('finds tasks by title match', () => {
      createTask('TASK1', 'Implement authentication', 'project-a');
      createTask('TASK2', 'Write documentation', 'project-a');

      const results = searchService.search('authentication');
      expect(results.tasks).toHaveLength(1);
      expect(results.tasks[0].task_id).toBe('TASK1');
    });

    it('finds tasks by description match', () => {
      createTask('TASK1', 'Backend task', 'project-a', 'Implement OAuth2');

      const results = searchService.search('OAuth2');
      expect(results.tasks).toHaveLength(1);
    });

    it('supports project filter', () => {
      createTask('TASK1', 'Auth for A', 'project-a');
      createTask('TASK2', 'Auth for B', 'project-b');

      const results = searchService.search('Auth', { project: 'project-a' });
      expect(results.tasks).toHaveLength(1);
      expect(results.tasks[0].task_id).toBe('TASK1');
    });

    it('supports limit and offset pagination', () => {
      for (let i = 0; i < 5; i++) createTask(`TASK${i}`, `Test task ${i}`, 'inbox');

      const page1 = searchService.search('Test', { limit: 2, offset: 0 });
      const page2 = searchService.search('Test', { limit: 2, offset: 2 });

      expect(page1.tasks).toHaveLength(2);
      expect(page2.tasks).toHaveLength(2);
      expect(page1.total).toBe(5);
    });

    it('handles empty query', () => {
      createTask('TASK1', 'Test', 'inbox');
      const results = searchService.search('');
      expect(results.tasks).toHaveLength(0);
    });
  });
});
