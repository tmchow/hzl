import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import { TaskService } from '../../services/task-service.js';
import { BackupService } from '../../services/backup-service.js';
import { TaskStatus } from '../../events/types.js';
import Database from 'libsql';

describe('Backup/Restore Round-Trip Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let backupPath: string;
  let db: Database.Database;
  let taskService: TaskService;
  let backupService: BackupService;

  function setupServices(database: Database.Database): {
    taskService: TaskService;
    backupService: BackupService;
  } {
    const eventStore = new EventStore(database);
    const engine = new ProjectionEngine(database);
    engine.register(new TasksCurrentProjector());
    engine.register(new DependenciesProjector());
    engine.register(new TagsProjector());
    engine.register(new SearchProjector());
    engine.register(new CommentsCheckpointsProjector());
    return {
      taskService: new TaskService(database, eventStore, engine),
      backupService: new BackupService(database),
    };
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-backup-'));
    dbPath = path.join(tempDir, 'test.db');
    backupPath = path.join(tempDir, 'backup.db');
    db = createConnection(dbPath);
    const services = setupServices(db);
    taskService = services.taskService;
    backupService = services.backupService;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('backup', () => {
    it('creates a complete backup of the database', async () => {
      const task1 = taskService.createTask({ title: 'Task 1', project: 'inbox', tags: ['urgent'] });
      const task2 = taskService.createTask({
        title: 'Task 2',
        project: 'inbox',
        depends_on: [task1.task_id],
      });
      taskService.setStatus(task1.task_id, TaskStatus.Ready);
      taskService.claimTask(task1.task_id, { author: 'agent-1' });
      taskService.addComment(task1.task_id, 'Working on it');
      taskService.addCheckpoint(task1.task_id, 'step1', { progress: 50 });

      backupService.backup(backupPath);

      expect(fs.existsSync(backupPath)).toBe(true);

      const backupDb = new Database(backupPath, { readonly: true });
      const tables = backupDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[];
      expect(tables.map((t) => t.name)).toContain('events');
      expect(tables.map((t) => t.name)).toContain('tasks_current');
      backupDb.close();
    });

    it('backup is consistent (no partial writes)', async () => {
      for (let i = 0; i < 100; i++) {
        taskService.createTask({ title: `Task ${i}`, project: 'inbox' });
      }

      backupService.backup(backupPath);

      const backupDb = new Database(backupPath, { readonly: true });
      const eventCount = backupDb
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };
      const taskCount = backupDb
        .prepare('SELECT COUNT(*) as count FROM tasks_current')
        .get() as { count: number };

      expect(eventCount.count).toBe(101);
      expect(taskCount.count).toBe(100);
      backupDb.close();
    });
  });

  describe('restore', () => {
    it('restores database to exact state from backup', async () => {
      const task1 = taskService.createTask({ title: 'Original task', project: 'inbox' });
      taskService.setStatus(task1.task_id, TaskStatus.Ready);
      taskService.addComment(task1.task_id, 'Original comment');

      backupService.backup(backupPath);

      taskService.createTask({ title: 'New task after backup', project: 'inbox' });
      taskService.claimTask(task1.task_id, { author: 'agent-1' });
      taskService.completeTask(task1.task_id);

      db.close();
      fs.unlinkSync(dbPath);

      await backupService.restore(backupPath, dbPath);

      const restoredDb = createConnection(dbPath);

      const tasks = restoredDb.prepare('SELECT * FROM tasks_current').all() as any[];
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Original task');
      expect(tasks[0].status).toBe('ready');

      const newTaskCount = restoredDb
        .prepare("SELECT COUNT(*) as count FROM tasks_current WHERE title = 'New task after backup'")
        .get() as { count: number };
      expect(newTaskCount.count).toBe(0);

      restoredDb.close();
    });

    it('restore fails gracefully with invalid backup file', async () => {
      const invalidBackupPath = path.join(tempDir, 'invalid.db');
      fs.writeFileSync(invalidBackupPath, 'not a valid sqlite database');

      await expect(backupService.restore(invalidBackupPath, dbPath)).rejects.toThrow();
    });

    it('restore fails gracefully with non-existent backup file', async () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.db');
      await expect(backupService.restore(nonExistentPath, dbPath)).rejects.toThrow();
    });
  });

  describe('round-trip integrity', () => {
    it('preserves all data types through backup/restore cycle', async () => {
      const task = taskService.createTask({
        title: 'Complex task',
        project: 'test-project',
        description: 'A detailed description with special chars: "quotes" & <brackets>',
        tags: ['tag1', 'tag2', 'tag-with-dash'],
        priority: 3,
        due_at: '2026-12-31T23:59:59Z',
        metadata: { key1: 'value1', nested: { a: 1, b: [1, 2, 3] } },
        links: ['https://example.com', '/path/to/file.md'],
      });

      const dep = taskService.createTask({ title: 'Dependency', project: 'test-project' });
      taskService.setStatus(dep.task_id, TaskStatus.Ready);
      taskService.claimTask(dep.task_id, { author: 'agent', lease_until: '2026-02-01T00:00:00Z' });
      taskService.addComment(task.task_id, 'Comment with unicode: 你好世界 🎉');
      taskService.addCheckpoint(task.task_id, 'checkpoint1', { data: { complex: true } });

      backupService.backup(backupPath);
      db.close();

      const restorePath = path.join(tempDir, 'restored.db');
      await backupService.restore(backupPath, restorePath);

      const restoredDb = createConnection(restorePath);

      const restoredTask = restoredDb
        .prepare('SELECT * FROM tasks_current WHERE task_id = ?')
        .get(task.task_id) as any;

      expect(restoredTask.title).toBe('Complex task');
      expect(restoredTask.description).toBe(
        'A detailed description with special chars: "quotes" & <brackets>'
      );
      expect(JSON.parse(restoredTask.tags)).toEqual(['tag1', 'tag2', 'tag-with-dash']);
      expect(restoredTask.priority).toBe(3);
      expect(restoredTask.due_at).toBe('2026-12-31T23:59:59Z');
      expect(JSON.parse(restoredTask.metadata)).toEqual({
        key1: 'value1',
        nested: { a: 1, b: [1, 2, 3] },
      });
      expect(JSON.parse(restoredTask.links)).toEqual([
        'https://example.com',
        '/path/to/file.md',
      ]);

      const claimedTask = restoredDb
        .prepare('SELECT * FROM tasks_current WHERE task_id = ?')
        .get(dep.task_id) as any;
      expect(claimedTask.claimed_by_author).toBe('agent');
      expect(claimedTask.lease_until).toBe('2026-02-01T00:00:00Z');

      const comment = restoredDb
        .prepare('SELECT * FROM task_comments WHERE task_id = ?')
        .get(task.task_id) as any;
      expect(comment.text).toBe('Comment with unicode: 你好世界 🎉');

      const checkpoint = restoredDb
        .prepare('SELECT * FROM task_checkpoints WHERE task_id = ?')
        .get(task.task_id) as any;
      expect(checkpoint.name).toBe('checkpoint1');
      expect(JSON.parse(checkpoint.data)).toEqual({ data: { complex: true } });

      restoredDb.close();
    });

    it('preserves event ordering through backup/restore', async () => {
      const task = taskService.createTask({ title: 'Task', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });
      taskService.addComment(task.task_id, 'Comment 1');
      taskService.addComment(task.task_id, 'Comment 2');
      taskService.addCheckpoint(task.task_id, 'step1');
      taskService.completeTask(task.task_id);

      const originalEvents = db
        .prepare('SELECT event_id, type FROM events ORDER BY id')
        .all() as { event_id: string; type: string }[];

      backupService.backup(backupPath);
      db.close();

      const restorePath = path.join(tempDir, 'restored.db');
      await backupService.restore(backupPath, restorePath);

      const restoredDb = createConnection(restorePath);
      const restoredEvents = restoredDb
        .prepare('SELECT event_id, type FROM events ORDER BY id')
        .all() as { event_id: string; type: string }[];

      expect(restoredEvents).toEqual(originalEvents);

      restoredDb.close();
    });
  });
});
