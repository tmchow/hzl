import { describe, it, expect, afterEach } from 'vitest';
import Database from 'libsql';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('libsql API compatibility', () => {
  const testDbPath = path.join(os.tmpdir(), `libsql-test-${Date.now()}.db`);

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('supports better-sqlite3 compatible API', () => {
    const db = new Database(testDbPath);

    // Schema creation
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');

    // Prepared statements
    const insert = db.prepare('INSERT INTO test (name) VALUES (?)');
    const result = insert.run('hello');
    expect(result.changes).toBe(1);

    // Query
    const select = db.prepare('SELECT * FROM test WHERE id = ?');
    const row = select.get(result.lastInsertRowid) as { id: number; name: string };
    expect(row.name).toBe('hello');

    // Transaction
    const tx = db.transaction(() => {
      insert.run('world');
      return db.prepare('SELECT COUNT(*) as count FROM test').get() as { count: number };
    });
    const txResult = tx();
    expect(txResult.count).toBe(2);

    db.close();
  });

  it('supports sync method when syncUrl not configured', () => {
    const db = new Database(testDbPath);
    // sync() exists on the API surface
    expect(typeof db.sync).toBe('function');
    db.close();
  });
});
