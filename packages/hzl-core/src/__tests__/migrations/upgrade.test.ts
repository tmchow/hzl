import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createTestDbAtPath } from '../../db/test-utils.js';
import { EVENTS_SCHEMA_V2, CACHE_SCHEMA_V1, PRAGMAS } from '../../db/schema.js';
import { runMigrationsWithRollback, MigrationError, type Migration } from '../../db/migrations.js';

describe('Schema Creation Tests', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-migration-'));
    dbPath = path.join(tempDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('V2 schema creation', () => {
    it('creates all required tables', () => {
      const db = createTestDbAtPath(dbPath);

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
      const db = createTestDbAtPath(dbPath);

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

    it('creates schema_migrations table with correct structure', () => {
      const db = createTestDbAtPath(dbPath);

      const columns = db
        .prepare("PRAGMA table_info(schema_migrations)")
        .all() as { name: string; type: string }[];
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('migration_id');
      expect(columnNames).toContain('applied_at_ms');
      expect(columnNames).toContain('checksum');

      db.close();
    });
  });

  describe('schema idempotency', () => {
    it('schema creation is idempotent', () => {
      const db = new Database(dbPath);
      db.exec(PRAGMAS);
      db.exec(EVENTS_SCHEMA_V2);
      db.exec(CACHE_SCHEMA_V1);

      const tablesBefore = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];

      // Run schema again
      db.exec(EVENTS_SCHEMA_V2);
      db.exec(CACHE_SCHEMA_V1);

      const tablesAfter = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];

      expect(tablesAfter.map(t => t.name)).toEqual(tablesBefore.map(t => t.name));
      db.close();
    });

    it('preserves data across multiple schema applications', () => {
      const db = createTestDbAtPath(dbPath);

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

      // Apply schema again (should be idempotent via IF NOT EXISTS)
      db.exec(EVENTS_SCHEMA_V2);
      db.exec(CACHE_SCHEMA_V1);

      const postEventCount = db
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };

      expect(postEventCount.count).toBe(preEventCount.count);

      const task = db
        .prepare('SELECT * FROM tasks_current WHERE task_id = ?')
        .get('TASK001') as any;
      expect(task.title).toBe('Test task');
      expect(task.status).toBe('ready');

      db.close();
    });
  });

  describe('runMigrationsWithRollback', () => {
    it('applies pending migrations', () => {
      const db = createTestDbAtPath(dbPath);

      const migrations: Migration[] = [
        {
          id: 'test-001',
          up: "CREATE TABLE test_table (id INTEGER PRIMARY KEY)",
        },
        {
          id: 'test-002',
          up: "ALTER TABLE test_table ADD COLUMN name TEXT",
        },
      ];

      const result = runMigrationsWithRollback(db, migrations);

      expect(result.success).toBe(true);
      expect(result.applied).toEqual(['test-001', 'test-002']);
      expect(result.skipped).toEqual([]);

      // Verify table was created
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'")
        .all() as { name: string }[];
      expect(tables.length).toBe(1);

      // Verify migrations were recorded
      const recorded = db
        .prepare('SELECT migration_id FROM schema_migrations ORDER BY migration_id')
        .all() as { migration_id: string }[];
      expect(recorded.map(r => r.migration_id)).toEqual(['test-001', 'test-002']);

      db.close();
    });

    it('skips already applied migrations', () => {
      const db = createTestDbAtPath(dbPath);

      const migrations: Migration[] = [
        {
          id: 'test-001',
          up: "CREATE TABLE test_table (id INTEGER PRIMARY KEY)",
        },
      ];

      // Apply once
      runMigrationsWithRollback(db, migrations);

      // Apply again
      const result = runMigrationsWithRollback(db, migrations);

      expect(result.success).toBe(true);
      expect(result.applied).toEqual([]);
      expect(result.skipped).toEqual(['test-001']);

      db.close();
    });

    it('rolls back all changes on failure', () => {
      const db = createTestDbAtPath(dbPath);

      const migrations: Migration[] = [
        {
          id: 'good-001',
          up: "CREATE TABLE good_table (id INTEGER PRIMARY KEY)",
        },
        {
          id: 'bad-002',
          up: "CREATE TABLE INVALID SYNTAX",  // This will fail
        },
      ];

      expect(() => runMigrationsWithRollback(db, migrations)).toThrow(MigrationError);

      // Verify the first migration was rolled back
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='good_table'")
        .all() as { name: string }[];
      expect(tables.length).toBe(0);

      // Verify no migrations were recorded
      const recorded = db
        .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id LIKE 'good-%' OR migration_id LIKE 'bad-%'")
        .all() as { migration_id: string }[];
      expect(recorded.length).toBe(0);

      db.close();
    });

    it('records migration timestamps and checksums', () => {
      const db = createTestDbAtPath(dbPath);
      const beforeMs = Date.now();

      const migrations: Migration[] = [
        {
          id: 'test-001',
          up: "CREATE TABLE test_table (id INTEGER PRIMARY KEY)",
        },
      ];

      runMigrationsWithRollback(db, migrations);

      const afterMs = Date.now();

      const recorded = db
        .prepare('SELECT migration_id, applied_at_ms, checksum FROM schema_migrations WHERE migration_id = ?')
        .get('test-001') as { migration_id: string; applied_at_ms: number; checksum: string };

      expect(recorded.migration_id).toBe('test-001');
      expect(recorded.applied_at_ms).toBeGreaterThanOrEqual(beforeMs);
      expect(recorded.applied_at_ms).toBeLessThanOrEqual(afterMs);
      expect(recorded.checksum).toBeDefined();
      expect(recorded.checksum.length).toBeGreaterThan(0);

      db.close();
    });
  });

  describe('data persistence', () => {
    it('preserves existing data on reconnection', () => {
      const db = createTestDbAtPath(dbPath);

      db.exec(
        "INSERT INTO projection_state (name, last_event_id, updated_at) VALUES ('test_marker', 999, '2026-01-01')"
      );
      db.close();

      const db2 = createTestDbAtPath(dbPath);

      const marker = db2
        .prepare("SELECT * FROM projection_state WHERE name = 'test_marker'")
        .get();
      expect(marker).toBeDefined();

      db2.close();
    });
  });
});
