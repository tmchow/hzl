// packages/hzl-cli/src/commands/sample-project.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runSampleProjectCreate, runSampleProjectReset } from './sample-project.js';
import { initializeDb, closeDb, type Services } from '../db.js';

describe('sample-project command', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-sample-'));
    dbPath = path.join(tempDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function withDb<T>(fn: (services: Services) => T): T {
    const services = initializeDb(dbPath);
    try {
      return fn(services);
    } finally {
      closeDb(services);
    }
  }

  describe('create', () => {
    it('creates sample project with tasks in various states', () => {
      const result = runSampleProjectCreate({ dbPath, json: false });

      expect(result.project).toBe('sample-project');
      expect(result.tasksCreated).toBeGreaterThan(0);

      withDb(({ db }) => {
        const tasks = db
          .prepare("SELECT * FROM tasks_current WHERE project = 'sample-project'")
          .all() as any[];
        expect(tasks.length).toBeGreaterThan(0);

        const statuses = new Set(tasks.map((t) => t.status));
        expect(statuses.size).toBeGreaterThan(1);
      });
    });

    it('creates tasks with dependencies', () => {
      runSampleProjectCreate({ dbPath, json: false });

      withDb(({ db }) => {
        const deps = db.prepare('SELECT * FROM task_dependencies').all();
        expect(deps.length).toBeGreaterThan(0);
      });
    });

    it('creates tasks with tags and comments', () => {
      runSampleProjectCreate({ dbPath, json: false });

      withDb(({ db }) => {
        const tags = db.prepare('SELECT * FROM task_tags').all();
        const comments = db.prepare('SELECT * FROM task_comments').all();

        expect(tags.length).toBeGreaterThan(0);
        expect(comments.length).toBeGreaterThan(0);
      });
    });

    it('is idempotent (does not duplicate on second run)', () => {
      runSampleProjectCreate({ dbPath, json: false });
      const result2 = runSampleProjectCreate({ dbPath, json: false });

      expect(result2.skipped).toBe(true);

      withDb(({ db }) => {
        const taskCount = db
          .prepare("SELECT COUNT(*) as count FROM tasks_current WHERE project = 'sample-project'")
          .get() as { count: number };
        expect(taskCount.count).toBeLessThan(100);
      });
    });

    it('returns JSON output when requested', () => {
      const result = runSampleProjectCreate({ dbPath, json: true });
      expect(typeof result.project).toBe('string');
      expect(typeof result.tasksCreated).toBe('number');
    });
  });

  describe('reset', () => {
    it('deletes and recreates sample project', () => {
      runSampleProjectCreate({ dbPath, json: false });

      const originalIds = withDb(({ db }) =>
        (db
          .prepare("SELECT task_id FROM tasks_current WHERE project = 'sample-project'")
          .all() as { task_id: string }[]).map((t) => t.task_id)
      );

      const result = runSampleProjectReset({ dbPath, json: false });
      expect(result.deleted).toBeGreaterThan(0);
      expect(result.created).toBeGreaterThan(0);

      const newIds = withDb(({ db }) =>
        (db
          .prepare("SELECT task_id FROM tasks_current WHERE project = 'sample-project'")
          .all() as { task_id: string }[]).map((t) => t.task_id)
      );

      const overlap = newIds.filter((id) => originalIds.includes(id));
      expect(overlap.length).toBe(0);
    });

    it('handles reset when project does not exist', () => {
      const result = runSampleProjectReset({ dbPath, json: false });
      expect(result.deleted).toBe(0);
      expect(result.created).toBeGreaterThan(0);
    });
  });
});
