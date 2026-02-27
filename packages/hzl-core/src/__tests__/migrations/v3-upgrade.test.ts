import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import { runCacheMigrations } from '../../db/migrations/index.js';
import { CACHE_SCHEMA_V1 } from '../../db/schema.js';

describe('v3 migration (agent -> agent column)', () => {
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

  it('adds agent column and backfills from legacy agent', () => {
    db.exec(`
      CREATE TABLE tasks_current (
        task_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        project TEXT NOT NULL,
        status TEXT NOT NULL,
        agent TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_event_id INTEGER NOT NULL
      );
    `);
    db.prepare(`
      INSERT INTO tasks_current (task_id, title, project, status, agent, created_at, updated_at, last_event_id)
      VALUES ('task-1', 'T1', 'inbox', 'ready', 'clara1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 1)
    `).run();

    runCacheMigrations(db);

    const columns = getColumns('tasks_current');
    expect(columns).toContain('agent');
    const row = db.prepare('SELECT agent FROM tasks_current WHERE task_id = ?').get('task-1') as { agent: string | null };
    expect(row.agent).toBe('clara1');
  });

  it('is idempotent when agent already exists', () => {
    db.exec(CACHE_SCHEMA_V1);
    expect(() => runCacheMigrations(db)).not.toThrow();
    expect(() => runCacheMigrations(db)).not.toThrow();
  });

  it('creates index on agent column', () => {
    db.exec(`
      CREATE TABLE tasks_current (
        task_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        project TEXT NOT NULL,
        status TEXT NOT NULL,
        agent TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_event_id INTEGER NOT NULL
      );
    `);

    runCacheMigrations(db);

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tasks_current'"
    ).all() as { name: string }[];
    const names = indexes.map((index) => index.name);
    expect(names).toContain('idx_tasks_current_agent');
  });
});
