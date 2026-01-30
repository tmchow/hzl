import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
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
import Database from 'better-sqlite3';

async function readJsonlFile(filePath: string): Promise<any[]> {
  const lines: any[] = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) {
      lines.push(JSON.parse(line));
    }
  }
  return lines;
}

describe('Import/Export Idempotency Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let exportPath: string;
  let db: Database.Database;
  let eventStore: EventStore;
  let taskService: TaskService;
  let backupService: BackupService;

  function setupServices(database: Database.Database): {
    eventStore: EventStore;
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
      eventStore,
      taskService: new TaskService(database, eventStore, engine),
      backupService: new BackupService(database),
    };
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-export-'));
    dbPath = path.join(tempDir, 'test.db');
    exportPath = path.join(tempDir, 'events.jsonl');
    db = createConnection(dbPath);
    const services = setupServices(db);
    eventStore = services.eventStore;
    taskService = services.taskService;
    backupService = services.backupService;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('export', () => {
    it('exports all events to JSONL format', async () => {
      const task1 = taskService.createTask({ title: 'Task 1', project: 'inbox' });
      taskService.setStatus(task1.task_id, TaskStatus.Ready);
      taskService.addComment(task1.task_id, 'A comment');

      await backupService.exportEvents(exportPath);

      expect(fs.existsSync(exportPath)).toBe(true);
      const events = await readJsonlFile(exportPath);

      expect(events.length).toBe(3);
      expect(events[0].type).toBe('task_created');
      expect(events[1].type).toBe('status_changed');
      expect(events[2].type).toBe('comment_added');
    });

    it('exports events with all fields preserved', async () => {
      const task = taskService.createTask(
        {
          title: 'Full task',
          project: 'test',
          description: 'Description',
          tags: ['tag1'],
        },
        {
          author: 'user-1',
          agent_id: 'AGENT001',
          session_id: 'SESSION001',
          correlation_id: 'CORR001',
        }
      );

      await backupService.exportEvents(exportPath);
      const events = await readJsonlFile(exportPath);

      const taskCreatedEvent = events[0];
      expect(taskCreatedEvent.event_id).toBeDefined();
      expect(taskCreatedEvent.task_id).toBe(task.task_id);
      expect(taskCreatedEvent.type).toBe('task_created');
      expect(taskCreatedEvent.data.title).toBe('Full task');
      expect(taskCreatedEvent.author).toBe('user-1');
      expect(taskCreatedEvent.agent_id).toBe('AGENT001');
      expect(taskCreatedEvent.session_id).toBe('SESSION001');
      expect(taskCreatedEvent.correlation_id).toBe('CORR001');
      expect(taskCreatedEvent.timestamp).toBeDefined();
    });

    it('exports events in chronological order', async () => {
      const task = taskService.createTask({ title: 'Task', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent' });
      taskService.completeTask(task.task_id);

      await backupService.exportEvents(exportPath);
      const events = await readJsonlFile(exportPath);

      expect(events[0].type).toBe('task_created');
      expect(events[1].type).toBe('status_changed');
      expect(events[1].data.to).toBe('ready');
      expect(events[2].type).toBe('status_changed');
      expect(events[2].data.to).toBe('in_progress');
      expect(events[3].type).toBe('status_changed');
      expect(events[3].data.to).toBe('done');

      for (let i = 1; i < events.length; i++) {
        expect(new Date(events[i].timestamp).getTime()).toBeGreaterThanOrEqual(
          new Date(events[i - 1].timestamp).getTime()
        );
      }
    });
  });

  describe('import', () => {
    it('imports events to empty database', async () => {
      const task = taskService.createTask({ title: 'Task', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      await backupService.exportEvents(exportPath);
      db.close();

      const newDbPath = path.join(tempDir, 'new.db');
      const newDb = createConnection(newDbPath);
      const newServices = setupServices(newDb);

      const result = await newServices.backupService.importEvents(exportPath);

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);

      const events = newDb.prepare('SELECT * FROM events ORDER BY id').all() as any[];
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('task_created');
      expect(events[1].type).toBe('status_changed');

      const tasks = newDb.prepare('SELECT * FROM tasks_current').all() as any[];
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('ready');

      newDb.close();
    });

    it('is idempotent - duplicate imports are skipped', async () => {
      const task = taskService.createTask({ title: 'Task', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      await backupService.exportEvents(exportPath);
      db.close();

      const newDbPath = path.join(tempDir, 'new.db');
      const newDb = createConnection(newDbPath);
      const newServices = setupServices(newDb);

      const result1 = await newServices.backupService.importEvents(exportPath);
      expect(result1.imported).toBe(2);
      expect(result1.skipped).toBe(0);

      const result2 = await newServices.backupService.importEvents(exportPath);
      expect(result2.imported).toBe(0);
      expect(result2.skipped).toBe(2);

      const result3 = await newServices.backupService.importEvents(exportPath);
      expect(result3.imported).toBe(0);
      expect(result3.skipped).toBe(2);

      const eventCount = newDb
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };
      expect(eventCount.count).toBe(2);

      newDb.close();
    });

    it('handles partial imports (some events already exist)', async () => {
      const task1 = taskService.createTask({ title: 'Task 1', project: 'inbox' });
      await backupService.exportEvents(exportPath);

      const task2 = taskService.createTask({ title: 'Task 2', project: 'inbox' });
      const exportPath2 = path.join(tempDir, 'events2.jsonl');
      await backupService.exportEvents(exportPath2);
      db.close();

      const newDbPath = path.join(tempDir, 'new.db');
      const newDb = createConnection(newDbPath);
      const newServices = setupServices(newDb);

      await newServices.backupService.importEvents(exportPath);

      const result = await newServices.backupService.importEvents(exportPath2);
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);

      newDb.close();
    });

    it('handles malformed JSONL gracefully', async () => {
      const malformedPath = path.join(tempDir, 'malformed.jsonl');
      fs.writeFileSync(
        malformedPath,
        `
{"event_id":"EVT1","task_id":"TASK1","type":"task_created","data":{"title":"Valid","project":"inbox"},"timestamp":"2026-01-01T00:00:00Z"}
not valid json
{"event_id":"EVT2","task_id":"TASK2","type":"task_created","data":{"title":"Also valid","project":"inbox"},"timestamp":"2026-01-01T00:01:00Z"}
`
      );

      const result = await backupService.importEvents(malformedPath);

      expect(result.imported).toBe(2);
      expect(result.errors).toBe(1);
    });
  });

  describe('round-trip integrity', () => {
    it('export then import produces identical event store', async () => {
      const task1 = taskService.createTask({
        title: 'Complex task',
        project: 'test',
        description: 'Description with unicode: 日本語',
        tags: ['tag1', 'tag2'],
        priority: 2,
        metadata: { key: 'value' },
      });
      const task2 = taskService.createTask({
        title: 'Dependent task',
        project: 'test',
        depends_on: [task1.task_id],
      });
      taskService.setStatus(task1.task_id, TaskStatus.Ready);
      taskService.claimTask(task1.task_id, {
        author: 'agent-1',
        lease_until: '2026-02-01T00:00:00Z',
      });
      taskService.addComment(task1.task_id, 'Comment with emoji 🎉');
      taskService.addCheckpoint(task1.task_id, 'step1', { progress: 50 });
      taskService.completeTask(task1.task_id);

      await backupService.exportEvents(exportPath);

      const originalEvents = db
        .prepare('SELECT event_id, task_id, type, data, author, agent_id, timestamp FROM events ORDER BY id')
        .all() as any[];
      db.close();

      const newDbPath = path.join(tempDir, 'new.db');
      const newDb = createConnection(newDbPath);
      const newServices = setupServices(newDb);
      await newServices.backupService.importEvents(exportPath);

      const importedEvents = newDb
        .prepare('SELECT event_id, task_id, type, data, author, agent_id, timestamp FROM events ORDER BY id')
        .all() as any[];

      expect(importedEvents.length).toBe(originalEvents.length);
      for (let i = 0; i < originalEvents.length; i++) {
        expect(importedEvents[i].event_id).toBe(originalEvents[i].event_id);
        expect(importedEvents[i].task_id).toBe(originalEvents[i].task_id);
        expect(importedEvents[i].type).toBe(originalEvents[i].type);
        expect(importedEvents[i].data).toBe(originalEvents[i].data);
        expect(importedEvents[i].author).toBe(originalEvents[i].author);
        expect(importedEvents[i].timestamp).toBe(originalEvents[i].timestamp);
      }

      newDb.close();
    });

    it('rebuilding projections after import produces consistent state', async () => {
      const task1 = taskService.createTask({ title: 'Task 1', project: 'inbox', tags: ['urgent'] });
      const task2 = taskService.createTask({ title: 'Task 2', project: 'inbox', depends_on: [task1.task_id] });
      taskService.setStatus(task1.task_id, TaskStatus.Ready);
      taskService.claimTask(task1.task_id, { author: 'agent' });
      taskService.addComment(task1.task_id, 'Comment');
      taskService.completeTask(task1.task_id);

      const originalTasks = db
        .prepare('SELECT * FROM tasks_current ORDER BY task_id')
        .all() as any[];
      const originalDeps = db
        .prepare('SELECT * FROM task_dependencies ORDER BY task_id')
        .all() as any[];
      const originalTags = db
        .prepare('SELECT * FROM task_tags ORDER BY task_id, tag')
        .all() as any[];
      const originalComments = db
        .prepare('SELECT * FROM task_comments ORDER BY event_rowid')
        .all() as any[];

      await backupService.exportEvents(exportPath);
      db.close();

      const newDbPath = path.join(tempDir, 'new.db');
      const newDb = createConnection(newDbPath);
      const newServices = setupServices(newDb);
      await newServices.backupService.importEvents(exportPath);

      const importedTasks = newDb
        .prepare('SELECT * FROM tasks_current ORDER BY task_id')
        .all() as any[];
      const importedDeps = newDb
        .prepare('SELECT * FROM task_dependencies ORDER BY task_id')
        .all() as any[];
      const importedTags = newDb
        .prepare('SELECT * FROM task_tags ORDER BY task_id, tag')
        .all() as any[];
      const importedComments = newDb
        .prepare('SELECT * FROM task_comments ORDER BY event_rowid')
        .all() as any[];

      expect(importedTasks.length).toBe(originalTasks.length);
      expect(importedDeps.length).toBe(originalDeps.length);
      expect(importedTags.length).toBe(originalTags.length);
      expect(importedComments.length).toBe(originalComments.length);

      for (let i = 0; i < originalTasks.length; i++) {
        expect(importedTasks[i].task_id).toBe(originalTasks[i].task_id);
        expect(importedTasks[i].title).toBe(originalTasks[i].title);
        expect(importedTasks[i].status).toBe(originalTasks[i].status);
        expect(importedTasks[i].tags).toBe(originalTasks[i].tags);
      }

      newDb.close();
    });
  });

  describe('edge cases', () => {
    it('handles empty database export', async () => {
      await backupService.exportEvents(exportPath);

      const events = await readJsonlFile(exportPath);
      expect(events).toHaveLength(0);
    });

    it('handles very large event data', async () => {
      const largeMetadata: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        largeMetadata[`key${i}`] = 'x'.repeat(100);
      }
      const task = taskService.createTask({
        title: 'Large task',
        project: 'inbox',
        metadata: largeMetadata,
      });

      await backupService.exportEvents(exportPath);
      db.close();

      const newDbPath = path.join(tempDir, 'new.db');
      const newDb = createConnection(newDbPath);
      const newServices = setupServices(newDb);
      const result = await newServices.backupService.importEvents(exportPath);

      expect(result.imported).toBe(1);

      const importedTask = newDb
        .prepare('SELECT * FROM tasks_current WHERE task_id = ?')
        .get(task.task_id) as any;
      const importedMetadata = JSON.parse(importedTask.metadata);
      expect(Object.keys(importedMetadata).length).toBe(1000);

      newDb.close();
    });

    it('handles special characters in event data', async () => {
      const task = taskService.createTask({
        title: 'Task with "quotes" and \\backslashes\\ and \nnewlines',
        project: 'inbox',
        description: 'Unicode: 你好 🌍 العربية',
      });
      taskService.addComment(task.task_id, 'Comment with\ttabs\nand\r\nwindows newlines');

      await backupService.exportEvents(exportPath);
      db.close();

      const newDbPath = path.join(tempDir, 'new.db');
      const newDb = createConnection(newDbPath);
      const newServices = setupServices(newDb);
      await newServices.backupService.importEvents(exportPath);

      const importedTask = newDb
        .prepare('SELECT * FROM tasks_current WHERE task_id = ?')
        .get(task.task_id) as any;
      expect(importedTask.title).toBe(
        'Task with "quotes" and \\backslashes\\ and \nnewlines'
      );
      expect(importedTask.description).toBe('Unicode: 你好 🌍 العربية');

      newDb.close();
    });
  });
});
