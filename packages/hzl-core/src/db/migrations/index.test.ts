import { describe, it, expect } from 'vitest';
import Database from 'libsql';
import { runEventsMigrations } from './index.js';

describe('runEventsMigrations', () => {
  it('adds schema_version to existing events tables and backfills default value', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        task_id TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        author TEXT,
        agent_id TEXT,
        session_id TEXT,
        correlation_id TEXT,
        causation_id TEXT,
        timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
    `);
    db.prepare(`
      INSERT INTO events (event_id, task_id, type, data, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'evt-legacy-1',
      'task-legacy-1',
      'task_created',
      '{"title":"Legacy","project":"inbox"}',
      new Date().toISOString()
    );

    runEventsMigrations(db);

    const columns = db.prepare(`SELECT name FROM pragma_table_info('events')`).all() as { name: string }[];
    expect(columns.map(c => c.name)).toContain('schema_version');

    const row = db
      .prepare('SELECT schema_version FROM events WHERE event_id = ?')
      .get('evt-legacy-1') as { schema_version: number };
    expect(row.schema_version).toBe(1);

    db.close();
  });

  it('is idempotent when schema_version already exists', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        task_id TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        schema_version INTEGER NOT NULL DEFAULT 1,
        timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
    `);

    expect(() => runEventsMigrations(db)).not.toThrow();
    expect(() => runEventsMigrations(db)).not.toThrow();

    db.close();
  });
});
