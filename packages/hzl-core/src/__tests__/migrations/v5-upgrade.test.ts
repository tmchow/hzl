import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'libsql';
import { runCacheMigrations } from '../../db/migrations/index.js';
import { CACHE_SCHEMA_V1 } from '../../db/schema.js';

describe('v5 migration (stale_after_minutes column)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  function getColumns(table: string): string[] {
    const rows = db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[];
    return rows.map((row) => row.name);
  }

  it('adds stale_after_minutes column to existing tasks_current table', () => {
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
        agent TEXT,
        progress INTEGER,
        lease_until TEXT,
        terminal_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_event_id INTEGER NOT NULL
      );
    `);

    expect(getColumns('tasks_current')).not.toContain('stale_after_minutes');

    runCacheMigrations(db);

    expect(getColumns('tasks_current')).toContain('stale_after_minutes');
  });

  it('is idempotent when stale_after_minutes already exists', () => {
    db.exec(CACHE_SCHEMA_V1);

    expect(getColumns('tasks_current')).toContain('stale_after_minutes');
    expect(() => runCacheMigrations(db)).not.toThrow();
  });
});
