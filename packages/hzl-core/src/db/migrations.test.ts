import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import { runMigrationsWithRollback, MigrationError } from './migrations.js';
import { createTestDb } from './test-utils.js';

describe('migrations with rollback', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('applies migrations successfully', () => {
    const migrations = [
      { id: 'v001', up: 'CREATE TABLE test1 (id INTEGER PRIMARY KEY)' },
      { id: 'v002', up: 'CREATE TABLE test2 (id INTEGER PRIMARY KEY)' },
    ];

    const result = runMigrationsWithRollback(db, migrations);
    expect(result.success).toBe(true);
    expect(result.applied).toEqual(['v001', 'v002']);

    // Tables should exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).toContain('test1');
    expect(tableNames).toContain('test2');
  });

  it('rolls back on partial failure', () => {
    const migrations = [
      { id: 'v001', up: 'CREATE TABLE test1 (id INTEGER PRIMARY KEY)' },
      { id: 'v002', up: 'INVALID SQL SYNTAX' }, // This will fail
    ];

    expect(() => runMigrationsWithRollback(db, migrations)).toThrow(MigrationError);

    // test1 should NOT exist due to rollback
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).not.toContain('test1');
  });

  it('skips already applied migrations', () => {
    const migrations = [
      { id: 'v001', up: 'CREATE TABLE test1 (id INTEGER PRIMARY KEY)' },
    ];

    // Apply first time
    runMigrationsWithRollback(db, migrations);

    // Apply again - should skip
    const result = runMigrationsWithRollback(db, migrations);
    expect(result.success).toBe(true);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(['v001']);
  });
});
