import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createConnection } from '../../db/connection.js';
import { EventStore } from '../../events/store.js';
import { ProjectionEngine } from '../../projections/engine.js';
import { TasksCurrentProjector } from '../../projections/tasks-current.js';
import { DependenciesProjector } from '../../projections/dependencies.js';
import { TagsProjector } from '../../projections/tags.js';
import { SearchProjector } from '../../projections/search.js';
import { CommentsCheckpointsProjector } from '../../projections/comments-checkpoints.js';
import { rebuildAllProjections } from '../../projections/rebuild.js';
import { TaskService } from '../../services/task-service.js';
import { TaskStatus } from '../../events/types.js';

describe('Projection Rebuild Equivalence Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;
  let eventStore: EventStore;
  let projectionEngine: ProjectionEngine;
  let taskService: TaskService;

  function setupProjectors(engine: ProjectionEngine): void {
    engine.register(new TasksCurrentProjector());
    engine.register(new DependenciesProjector());
    engine.register(new TagsProjector());
    engine.register(new SearchProjector());
    engine.register(new CommentsCheckpointsProjector());
  }

  function captureProjectionState(database: Database.Database): {
    tasks: any[];
    dependencies: any[];
    tags: any[];
    comments: any[];
    checkpoints: any[];
    search: any[];
  } {
    return {
      tasks: database.prepare('SELECT * FROM tasks_current ORDER BY task_id').all(),
      dependencies: database
        .prepare('SELECT * FROM task_dependencies ORDER BY task_id, depends_on_id')
        .all(),
      tags: database.prepare('SELECT * FROM task_tags ORDER BY task_id, tag').all(),
      comments: database.prepare('SELECT * FROM task_comments ORDER BY event_rowid').all(),
      checkpoints: database
        .prepare('SELECT * FROM task_checkpoints ORDER BY event_rowid')
        .all(),
      search: database
        .prepare('SELECT task_id, title, description FROM task_search ORDER BY task_id')
        .all(),
    };
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-rebuild-'));
    dbPath = path.join(tempDir, 'test.db');
    db = createConnection(dbPath);
    eventStore = new EventStore(db);
    projectionEngine = new ProjectionEngine(db);
    setupProjectors(projectionEngine);
    taskService = new TaskService(db, eventStore, projectionEngine);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('incremental vs full rebuild equivalence', () => {
    it('full rebuild produces identical state to incremental application', () => {
      const task1 = taskService.createTask({
        title: 'Task 1',
        project: 'inbox',
        tags: ['urgent', 'backend'],
        priority: 2,
      });
      const task2 = taskService.createTask({
        title: 'Task 2',
        project: 'inbox',
        depends_on: [task1.task_id],
      });

      taskService.setStatus(task1.task_id, TaskStatus.Ready);
      taskService.claimTask(task1.task_id, {
        author: 'agent-1',
        lease_until: '2026-02-01T00:00:00Z',
      });
      taskService.addComment(task1.task_id, 'Working on it');
      taskService.addCheckpoint(task1.task_id, 'step1', { progress: 50 });
      taskService.completeTask(task1.task_id);

      taskService.setStatus(task2.task_id, TaskStatus.Ready);
      taskService.claimTask(task2.task_id, { author: 'agent-2' });

      const incrementalState = captureProjectionState(db);

      db.exec('DELETE FROM tasks_current');
      db.exec('DELETE FROM task_dependencies');
      db.exec('DELETE FROM task_tags');
      db.exec('DELETE FROM task_comments');
      db.exec('DELETE FROM task_checkpoints');
      db.exec('DELETE FROM task_search');
      db.exec('DELETE FROM projection_state');

      rebuildAllProjections(db, projectionEngine);

      const rebuiltState = captureProjectionState(db);

      expect(rebuiltState.tasks).toEqual(incrementalState.tasks);
      expect(rebuiltState.dependencies).toEqual(incrementalState.dependencies);
      expect(rebuiltState.tags).toEqual(incrementalState.tags);
      expect(rebuiltState.comments).toEqual(incrementalState.comments);
      expect(rebuiltState.checkpoints).toEqual(incrementalState.checkpoints);
      expect(rebuiltState.search).toEqual(incrementalState.search);
    });

    it('handles complex event sequences correctly', () => {
      const tasks: string[] = [];
      for (let i = 0; i < 10; i++) {
        const task = taskService.createTask({
          title: `Task ${i}`,
          project: i % 2 === 0 ? 'project-a' : 'project-b',
          tags: [`tag${i % 3}`],
          priority: i % 4,
        });
        tasks.push(task.task_id);
      }

      for (let i = 1; i < tasks.length; i++) {
        db.prepare('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)').run(
          tasks[i],
          tasks[i - 1]
        );
      }

      taskService.setStatus(tasks[0], TaskStatus.Ready);
      taskService.claimTask(tasks[0], { author: 'agent-1' });
      taskService.addComment(tasks[0], 'Comment 1');
      taskService.addComment(tasks[0], 'Comment 2');
      taskService.addCheckpoint(tasks[0], 'checkpoint1');
      taskService.completeTask(tasks[0]);

      taskService.setStatus(tasks[1], TaskStatus.Ready);
      taskService.claimTask(tasks[1], { author: 'agent-2' });
      taskService.releaseTask(tasks[1], { reason: 'Blocked' });
      taskService.claimTask(tasks[1], { author: 'agent-3' });

      taskService.archiveTask(tasks[5], { reason: 'No longer needed' });

      const originalState = captureProjectionState(db);

      db.exec('DELETE FROM tasks_current');
      db.exec('DELETE FROM task_dependencies');
      db.exec('DELETE FROM task_tags');
      db.exec('DELETE FROM task_comments');
      db.exec('DELETE FROM task_checkpoints');
      db.exec('DELETE FROM task_search');
      db.exec('DELETE FROM projection_state');
      rebuildAllProjections(db, projectionEngine);

      const rebuiltState = captureProjectionState(db);

      expect(rebuiltState.tasks).toEqual(originalState.tasks);
      expect(rebuiltState.comments).toEqual(originalState.comments);
      expect(rebuiltState.checkpoints).toEqual(originalState.checkpoints);
    });
  });

  describe('partial corruption recovery', () => {
    it('recovers from corrupted tasks_current projection', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      db.exec('DELETE FROM tasks_current');

      const corruptedCount = db
        .prepare('SELECT COUNT(*) as count FROM tasks_current')
        .get() as { count: number };
      expect(corruptedCount.count).toBe(0);

      rebuildAllProjections(db, projectionEngine);

      const recoveredTask = db
        .prepare('SELECT * FROM tasks_current WHERE task_id = ?')
        .get(task.task_id) as any;
      expect(recoveredTask).toBeDefined();
      expect(recoveredTask.status).toBe('ready');
    });

    it('recovers from corrupted dependencies projection', () => {
      const task1 = taskService.createTask({ title: 'Task 1', project: 'inbox' });
      const task2 = taskService.createTask({
        title: 'Task 2',
        project: 'inbox',
        depends_on: [task1.task_id],
      });

      db.exec('DELETE FROM task_dependencies');

      rebuildAllProjections(db, projectionEngine);

      const dep = db
        .prepare('SELECT * FROM task_dependencies WHERE task_id = ?')
        .get(task2.task_id);
      expect(dep).toBeDefined();
    });

    it('recovers from corrupted tags projection', () => {
      const task = taskService.createTask({
        title: 'Tagged',
        project: 'inbox',
        tags: ['tag1', 'tag2'],
      });

      db.exec('DELETE FROM task_tags');

      rebuildAllProjections(db, projectionEngine);

      const tags = db
        .prepare('SELECT tag FROM task_tags WHERE task_id = ? ORDER BY tag')
        .all(task.task_id) as { tag: string }[];
      expect(tags.map((t) => t.tag)).toEqual(['tag1', 'tag2']);
    });

    it('recovers from corrupted search index', () => {
      const task = taskService.createTask({
        title: 'Searchable task',
        project: 'inbox',
        description: 'With description',
      });

      db.exec('DELETE FROM task_search');

      rebuildAllProjections(db, projectionEngine);

      const results = db
        .prepare("SELECT task_id FROM task_search WHERE task_search MATCH 'Searchable'")
        .all() as { task_id: string }[];
      expect(results.map((r) => r.task_id)).toContain(task.task_id);
    });
  });

  describe('rebuild idempotency', () => {
    it('multiple rebuilds produce identical results', () => {
      const task = taskService.createTask({
        title: 'Task',
        project: 'inbox',
        tags: ['tag'],
      });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.addComment(task.task_id, 'Comment');

      db.exec('DELETE FROM tasks_current');
      db.exec('DELETE FROM task_tags');
      db.exec('DELETE FROM task_comments');
      db.exec('DELETE FROM projection_state');
      rebuildAllProjections(db, projectionEngine);
      const state1 = captureProjectionState(db);

      db.exec('DELETE FROM tasks_current');
      db.exec('DELETE FROM task_tags');
      db.exec('DELETE FROM task_comments');
      db.exec('DELETE FROM projection_state');
      rebuildAllProjections(db, projectionEngine);
      const state2 = captureProjectionState(db);

      db.exec('DELETE FROM tasks_current');
      db.exec('DELETE FROM task_tags');
      db.exec('DELETE FROM task_comments');
      db.exec('DELETE FROM projection_state');
      rebuildAllProjections(db, projectionEngine);
      const state3 = captureProjectionState(db);

      expect(state1).toEqual(state2);
      expect(state2).toEqual(state3);
    });
  });

  describe('projection_state tracking', () => {
    it('updates projection_state after rebuild', () => {
      taskService.createTask({ title: 'Task', project: 'inbox' });

      db.exec('DELETE FROM tasks_current');
      db.exec('DELETE FROM projection_state');
      rebuildAllProjections(db, projectionEngine);

      const states = db
        .prepare('SELECT * FROM projection_state ORDER BY name')
        .all() as { name: string; last_event_id: number }[];
      expect(states.length).toBeGreaterThan(0);

      const lastEventIds = states.map((s) => s.last_event_id);
      const uniqueIds = new Set(lastEventIds);
      expect(uniqueIds.size).toBe(1);
    });

    it('incremental rebuild from last known position', () => {
      const task1 = taskService.createTask({ title: 'Task 1', project: 'inbox' });

      const position1 = db
        .prepare('SELECT MAX(id) as max_id FROM events')
        .get() as { max_id: number };

      taskService.createTask({ title: 'Task 2', project: 'inbox' });
      taskService.setStatus(task1.task_id, TaskStatus.Ready);

      const baselineEvents = projectionEngine
        .getEventsSince(0, 1000)
        .filter((event) => event.rowid <= position1.max_id);

      db.exec('DELETE FROM projection_state');
      db.exec('DELETE FROM tasks_current');
      db.exec('DELETE FROM task_dependencies');
      db.exec('DELETE FROM task_tags');
      db.exec('DELETE FROM task_comments');
      db.exec('DELETE FROM task_checkpoints');
      db.exec('DELETE FROM task_search');

      for (const event of baselineEvents) {
        projectionEngine.applyEvent(event);
      }

      for (const projector of projectionEngine.getProjectors()) {
        db.prepare(
          'INSERT INTO projection_state (name, last_event_id, updated_at) VALUES (?, ?, ?)'
        ).run(projector.name, position1.max_id, new Date().toISOString());
      }

      const newEvents = projectionEngine.getEventsSince(position1.max_id, 1000);
      expect(newEvents.length).toBe(2);

      for (const event of newEvents) {
        projectionEngine.applyEvent(event);
      }

      const task1State = db
        .prepare('SELECT status FROM tasks_current WHERE task_id = ?')
        .get(task1.task_id) as { status: string };
      expect(task1State.status).toBe('ready');
    });
  });
});
