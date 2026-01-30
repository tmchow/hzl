import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runMigrations, getCurrentVersion } from '../../db/migrations.js';
import { createConnection } from '../../db/connection.js';

describe('Migration Upgrade Tests', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-migration-'));
    dbPath = path.join(tempDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('v1 schema creation', () => {
    it('creates all required tables', () => {
      const db = createConnection(dbPath);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain('events');
      expect(tableNames).toContain('tasks_current');
      expect(tableNames).toContain('task_dependencies');
      expect(tableNames).toContain('task_tags');
      expect(tableNames).toContain('task_comments');
      expect(tableNames).toContain('task_checkpoints');
      expect(tableNames).toContain('projection_state');
      expect(tableNames).toContain('schema_migrations');

      db.close();
    });

    it('creates all required indexes', () => {
      const db = createConnection(dbPath);

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
        .all() as { name: string }[];
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_events_task_id');
      expect(indexNames).toContain('idx_events_type');
      expect(indexNames).toContain('idx_tasks_current_project_status');
      expect(indexNames).toContain('idx_tasks_current_claim_next');
      expect(indexNames).toContain('idx_deps_depends_on');
      expect(indexNames).toContain('idx_task_tags_tag');

      db.close();
    });

    it('sets correct schema version', () => {
      const db = createConnection(dbPath);
      const version = getCurrentVersion(db);
      expect(version).toBe(1);
      db.close();
    });
  });

  describe('v1 fixture loading', () => {
    it('loads v1 fixture and verifies data integrity', () => {
      const db = new Database(dbPath);

      const fixturePath = path.join(__dirname, 'fixtures', 'v1-sample.sql');
      const fixtureSql = fs.readFileSync(fixturePath, 'utf-8');
      db.exec(fixtureSql);
      db.close();

      const migratedDb = createConnection(dbPath);

      const eventCount = migratedDb
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };
      expect(eventCount.count).toBeGreaterThan(0);

      const taskCount = migratedDb
        .prepare('SELECT COUNT(*) as count FROM tasks_current')
        .get() as { count: number };
      expect(taskCount.count).toBeGreaterThan(0);

      const taskWithDeps = migratedDb
        .prepare(
          `
          SELECT tc.task_id, COUNT(td.depends_on_id) as dep_count
          FROM tasks_current tc
          LEFT JOIN task_dependencies td ON tc.task_id = td.task_id
          GROUP BY tc.task_id
          HAVING dep_count > 0
        `
        )
        .all();
      expect(taskWithDeps.length).toBeGreaterThan(0);

      migratedDb.close();
    });
  });

  describe('v1 → v2 migration (future)', () => {
    it('preserves all existing data after upgrade', async () => {
      const db = createConnection(dbPath);

      db.exec(`
        INSERT INTO events (event_id, task_id, type, data, timestamp)
        VALUES 
          ('EVT001', 'TASK001', 'task_created', '{"title":"Test task","project":"inbox"}', '2026-01-01T00:00:00Z'),
          ('EVT002', 'TASK001', 'status_changed', '{"from":"backlog","to":"ready"}', '2026-01-01T00:01:00Z');
        
        INSERT INTO tasks_current (task_id, title, project, status, links, tags, metadata, created_at, updated_at, last_event_id)
        VALUES ('TASK001', 'Test task', 'inbox', 'ready', '[]', '["important"]', '{}', '2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z', 2);
        
        INSERT INTO task_tags (task_id, tag) VALUES ('TASK001', 'important');
      `);

      const preEventCount = db
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };
      const preTaskCount = db
        .prepare('SELECT COUNT(*) as count FROM tasks_current')
        .get() as { count: number };

      db.close();

      const migratedDb = createConnection(dbPath);

      const postEventCount = migratedDb
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };
      const postTaskCount = migratedDb
        .prepare('SELECT COUNT(*) as count FROM tasks_current')
        .get() as { count: number };

      expect(postEventCount.count).toBe(preEventCount.count);
      expect(postTaskCount.count).toBe(preTaskCount.count);

      const task = migratedDb
        .prepare('SELECT * FROM tasks_current WHERE task_id = ?')
        .get('TASK001') as any;
      expect(task.title).toBe('Test task');
      expect(task.status).toBe('ready');

      migratedDb.close();
    });

    it('handles empty database upgrade', () => {
      const db = new Database(dbPath);
      db.exec(`
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
        INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-01-01T00:00:00Z');
      `);
      db.close();

      const migratedDb = createConnection(dbPath);
      const version = getCurrentVersion(migratedDb);

      expect(version).toBeGreaterThanOrEqual(1);
      migratedDb.close();
    });

    it('migration is idempotent', () => {
      const db = createConnection(dbPath);
      const version1 = getCurrentVersion(db);
      db.close();

      const db2 = createConnection(dbPath);
      const version2 = getCurrentVersion(db2);
      db2.close();

      const db3 = createConnection(dbPath);
      const version3 = getCurrentVersion(db3);
      db3.close();

      expect(version1).toBe(version2);
      expect(version2).toBe(version3);
    });
  });

  describe('migration rollback scenarios', () => {
    it('fails gracefully on corrupted schema_migrations table', () => {
      const db = new Database(dbPath);
      db.exec(`
        CREATE TABLE schema_migrations (version TEXT, applied_at TEXT);
        INSERT INTO schema_migrations (version, applied_at) VALUES ('not_a_number', '2026-01-01');
      `);
      db.close();

      const migratedDb = createConnection(dbPath);
      const version = getCurrentVersion(migratedDb);
      expect(version).toBeGreaterThanOrEqual(1);
      migratedDb.close();
    });

    it('handles partial migration failure', () => {
      const db = new Database(dbPath);
      runMigrations(db);

      db.exec('DROP TABLE IF EXISTS task_search');
      db.close();

      const reconnectedDb = createConnection(dbPath);

      const ftsTable = reconnectedDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='task_search'")
        .get();
      expect(ftsTable).toBeDefined();

      reconnectedDb.close();
    });
  });

  describe('schema version tracking', () => {
    it('records migration timestamps', () => {
      const db = createConnection(dbPath);

      const migrations = db
        .prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version')
        .all() as { version: number; applied_at: string }[];

      expect(migrations.length).toBeGreaterThan(0);
      for (const m of migrations) {
        expect(m.version).toBeGreaterThan(0);
        expect(new Date(m.applied_at).getTime()).not.toBeNaN();
      }

      db.close();
    });

    it('does not re-run already applied migrations', () => {
      const db = createConnection(dbPath);

      db.exec(
        "INSERT INTO projection_state (name, last_event_id, updated_at) VALUES ('test_marker', 999, '2026-01-01')"
      );
      db.close();

      const db2 = createConnection(dbPath);

      const marker = db2
        .prepare("SELECT * FROM projection_state WHERE name = 'test_marker'")
        .get();
      expect(marker).toBeDefined();

      db2.close();
    });
  });
});
