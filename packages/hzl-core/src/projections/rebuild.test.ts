// packages/hzl-core/src/projections/rebuild.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { rebuildAllProjections } from './rebuild.js';
import { ProjectionEngine } from './engine.js';
import { TasksCurrentProjector } from './tasks-current.js';
import { DependenciesProjector } from './dependencies.js';
import { TagsProjector } from './tags.js';
import { CommentsCheckpointsProjector } from './comments-checkpoints.js';
import { SearchProjector } from './search.js';
import { runMigrations } from '../db/migrations.js';
import { EventStore } from '../events/store.js';
import { EventType, TaskStatus } from '../events/types.js';

describe('rebuildAllProjections', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let engine: ProjectionEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    eventStore = new EventStore(db);
    engine = new ProjectionEngine(db);
    engine.register(new TasksCurrentProjector());
    engine.register(new DependenciesProjector());
    engine.register(new TagsProjector());
    engine.register(new CommentsCheckpointsProjector());
    engine.register(new SearchProjector());
  });

  afterEach(() => {
    db.close();
  });

  it('rebuilds all projections from events', () => {
    const e1 = eventStore.append({
      task_id: 'TASK1',
      type: EventType.TaskCreated,
      data: { title: 'Test', project: 'inbox', tags: ['tag1'], depends_on: ['DEP1'] },
    });
    engine.applyEvent(e1);

    const e2 = eventStore.append({
      task_id: 'TASK1',
      type: EventType.StatusChanged,
      data: { from: TaskStatus.Backlog, to: TaskStatus.Ready },
    });
    engine.applyEvent(e2);

    // Manually corrupt projections
    db.exec('DELETE FROM tasks_current');
    db.exec('DELETE FROM task_tags');
    db.exec('DELETE FROM task_dependencies');

    // Rebuild
    rebuildAllProjections(db, engine);

    // Verify restoration
    const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
    expect(task.title).toBe('Test');
    expect(task.status).toBe('ready');

    const tags = db.prepare('SELECT tag FROM task_tags WHERE task_id = ?').all('TASK1') as any[];
    expect(tags.map(t => t.tag)).toContain('tag1');
  });
});
