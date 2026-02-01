// packages/hzl-cli/src/commands/sample-project.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runSampleProjectCreate, runSampleProjectReset } from './sample-project.js';
import { initializeDbFromPath, closeDb, type Services } from '../db.js';

describe('sample-project command', () => {
  let tempDir: string;
  let eventsDbPath: string;
  let cacheDbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-sample-'));
    eventsDbPath = path.join(tempDir, 'events.db');
    cacheDbPath = path.join(tempDir, 'cache.db');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function withDb<T>(fn: (services: Services) => T): T {
    const services = initializeDbFromPath(eventsDbPath);
    try {
      return fn(services);
    } finally {
      closeDb(services);
    }
  }

  describe('create', () => {
    it('creates sample project with tasks in various states', () => {
      const result = runSampleProjectCreate({ eventsDbPath, cacheDbPath, json: false });

      expect(result.project).toBe('sample-project');
      expect(result.tasksCreated).toBeGreaterThan(0);

      withDb(({ cacheDb }) => {
        const tasks = cacheDb
          .prepare("SELECT * FROM tasks_current WHERE project = 'sample-project'")
          .all() as any[];
        expect(tasks.length).toBeGreaterThan(0);

        const statuses = new Set(tasks.map((t) => t.status));
        expect(statuses.size).toBeGreaterThan(1);
      });
    });

    it('creates tasks with dependencies', () => {
      runSampleProjectCreate({ eventsDbPath, cacheDbPath, json: false });

      withDb(({ cacheDb }) => {
        const deps = cacheDb.prepare('SELECT * FROM task_dependencies').all();
        expect(deps.length).toBeGreaterThan(0);
      });
    });

    it('creates tasks with tags and comments', () => {
      runSampleProjectCreate({ eventsDbPath, cacheDbPath, json: false });

      withDb(({ cacheDb }) => {
        const tags = cacheDb.prepare('SELECT * FROM task_tags').all();
        const comments = cacheDb.prepare('SELECT * FROM task_comments').all();

        expect(tags.length).toBeGreaterThan(0);
        expect(comments.length).toBeGreaterThan(0);
      });
    });

    it('is idempotent (does not duplicate on second run)', () => {
      runSampleProjectCreate({ eventsDbPath, cacheDbPath, json: false });
      const result2 = runSampleProjectCreate({ eventsDbPath, cacheDbPath, json: false });

      expect(result2.skipped).toBe(true);

      withDb(({ cacheDb }) => {
        const taskCount = cacheDb
          .prepare("SELECT COUNT(*) as count FROM tasks_current WHERE project = 'sample-project'")
          .get() as { count: number };
        expect(taskCount.count).toBeLessThan(100);
      });
    });

    it('returns JSON output when requested', () => {
      const result = runSampleProjectCreate({ eventsDbPath, cacheDbPath, json: true });
      expect(typeof result.project).toBe('string');
      expect(typeof result.tasksCreated).toBe('number');
    });
  });

  describe('reset', () => {
    it('deletes and recreates sample project', () => {
      runSampleProjectCreate({ eventsDbPath, cacheDbPath, json: false });

      const originalIds = withDb(({ cacheDb }) =>
        (cacheDb
          .prepare("SELECT task_id FROM tasks_current WHERE project = 'sample-project'")
          .all() as { task_id: string }[]).map((t) => t.task_id)
      );

      const result = runSampleProjectReset({ eventsDbPath, cacheDbPath, json: false });
      expect(result.deleted).toBeGreaterThan(0);
      expect(result.created).toBeGreaterThan(0);

      const newIds = withDb(({ cacheDb }) =>
        (cacheDb
          .prepare("SELECT task_id FROM tasks_current WHERE project = 'sample-project'")
          .all() as { task_id: string }[]).map((t) => t.task_id)
      );

      const overlap = newIds.filter((id) => originalIds.includes(id));
      expect(overlap.length).toBe(0);
    });

    it('handles reset when project does not exist', () => {
      const result = runSampleProjectReset({ eventsDbPath, cacheDbPath, json: false });
      expect(result.deleted).toBe(0);
      expect(result.created).toBeGreaterThan(0);
    });
  });
});
