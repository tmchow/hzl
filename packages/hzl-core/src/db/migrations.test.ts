import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations, getCurrentVersion } from './migrations.js';

describe('migrations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('creates schema_migrations table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates events table with correct columns', () => {
    runMigrations(db);
    const columns = db.prepare("PRAGMA table_info(events)").all();
    const columnNames = columns.map((c: any) => c.name);
    expect(columnNames).toContain('event_id');
    expect(columnNames).toContain('task_id');
    expect(columnNames).toContain('type');
    expect(columnNames).toContain('data');
    expect(columnNames).toContain('timestamp');
  });

  it('creates tasks_current projection table with lease fields', () => {
    runMigrations(db);
    const columns = db.prepare("PRAGMA table_info(tasks_current)").all();
    const columnNames = columns.map((c: any) => c.name);
    expect(columnNames).toContain('task_id');
    expect(columnNames).toContain('title');
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('project');
    expect(columnNames).toContain('claimed_at');
    expect(columnNames).toContain('lease_until');
  });

  it('creates task_dependencies table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_dependencies'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates projection_state table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='projection_state'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates task_tags table for fast tag filtering', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_tags'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates task_comments table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_comments'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates task_checkpoints table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_checkpoints'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates task_search FTS5 table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_search'"
    ).get();
    expect(table).toBeDefined();
  });

  it('is idempotent', () => {
    runMigrations(db);
    runMigrations(db);
    const version = getCurrentVersion(db);
    expect(version).toBe(1);
  });
});
