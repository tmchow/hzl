/**
 * Test that v2 migration correctly handles upgrading from old database schema
 * that doesn't have the terminal_at column.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import { runCacheMigrations } from '../../db/migrations/index.js';
import { CACHE_SCHEMA_V1 } from '../../db/schema.js';

describe('v2 migration (terminal_at column)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  function getColumns(table: string): string[] {
    const rows = db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[];
    return rows.map(r => r.name);
  }

  it('adds terminal_at column to existing table without it', () => {
    // Create OLD schema (without terminal_at column) - simulates pre-v2 database
    db.exec(`
      CREATE TABLE hzl_local_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE tasks_current (
        task_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        project TEXT NOT NULL,
        status TEXT NOT NULL,
        parent_id TEXT,
        description TEXT,
        links TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        priority INTEGER NOT NULL DEFAULT 0,
        due_at TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        claimed_at TEXT,
        assignee TEXT,
        progress INTEGER,
        lease_until TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_event_id INTEGER NOT NULL
      );
    `);

    const columnsBefore = getColumns('tasks_current');
    expect(columnsBefore).not.toContain('terminal_at');

    // Run migration
    runCacheMigrations(db);

    const columnsAfter = getColumns('tasks_current');
    expect(columnsAfter).toContain('terminal_at');
  });

  it('skips migration if table does not exist (fresh database)', () => {
    // Empty database - no tables
    db.exec(`
      CREATE TABLE hzl_local_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Should not throw
    expect(() => runCacheMigrations(db)).not.toThrow();

    // Table should not exist yet
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks_current'"
    ).get();
    expect(row).toBeUndefined();
  });

  it('skips migration if column already exists', () => {
    // Create table WITH terminal_at column (current schema)
    db.exec(CACHE_SCHEMA_V1);

    const columnsBefore = getColumns('tasks_current');
    expect(columnsBefore).toContain('terminal_at');

    // Should not throw (idempotent)
    expect(() => runCacheMigrations(db)).not.toThrow();

    const columnsAfter = getColumns('tasks_current');
    expect(columnsAfter).toContain('terminal_at');
  });

  it('creates index on terminal_at after adding column', () => {
    // Create OLD schema (without terminal_at column)
    db.exec(`
      CREATE TABLE hzl_local_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE tasks_current (
        task_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        project TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_event_id INTEGER NOT NULL
      );
    `);

    runCacheMigrations(db);

    // Check index exists
    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tasks_current'"
    ).all() as { name: string }[];
    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('idx_tasks_current_terminal_at');
  });

  it('full upgrade path: old database then CACHE_SCHEMA_V1', () => {
    // Simulate the actual upgrade path:
    // 1. Old database exists with tasks_current (no terminal_at)
    // 2. runCacheMigrations runs and adds terminal_at
    // 3. CACHE_SCHEMA_V1 runs (should be no-op for table, but creates indexes)

    db.exec(`
      CREATE TABLE hzl_local_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE projection_state (
        name TEXT PRIMARY KEY,
        last_event_id INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE projection_cursor (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE tasks_current (
        task_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        project TEXT NOT NULL,
        status TEXT NOT NULL,
        parent_id TEXT,
        description TEXT,
        links TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        priority INTEGER NOT NULL DEFAULT 0,
        due_at TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        claimed_at TEXT,
        assignee TEXT,
        progress INTEGER,
        lease_until TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_event_id INTEGER NOT NULL
      );

      CREATE TABLE task_dependencies (
        task_id TEXT NOT NULL,
        depends_on_id TEXT NOT NULL,
        PRIMARY KEY (task_id, depends_on_id)
      );
    `);

    // Step 1: Run migrations (adds terminal_at)
    runCacheMigrations(db);

    // Step 2: Run CACHE_SCHEMA_V1 (should not fail)
    expect(() => db.exec(CACHE_SCHEMA_V1)).not.toThrow();

    // Verify terminal_at exists and has index
    const columns = getColumns('tasks_current');
    expect(columns).toContain('terminal_at');

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tasks_current'"
    ).all() as { name: string }[];
    expect(indexes.map(i => i.name)).toContain('idx_tasks_current_terminal_at');
  });
});
