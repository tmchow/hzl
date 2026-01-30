import { describe, it, expect, afterEach } from 'vitest';
import { createConnection, getDefaultDbPath, withWriteTransaction } from './connection.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('connection', () => {
  const testDbPath = path.join(os.tmpdir(), 'hzl-test-' + Date.now() + '.db');

  afterEach(() => {
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
      if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
    } catch {}
  });

  it('creates database file at specified path', () => {
    const db = createConnection(testDbPath);
    expect(fs.existsSync(testDbPath)).toBe(true);
    db.close();
  });

  it('runs migrations on new database', () => {
    const db = createConnection(testDbPath);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all();
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).toContain('events');
    expect(tableNames).toContain('tasks_current');
    expect(tableNames).toContain('projection_state');
    db.close();
  });

  it('returns default path in ~/.hzl/', () => {
    const defaultPath = getDefaultDbPath();
    expect(defaultPath).toContain('.hzl');
    expect(defaultPath).toContain('data.db');
  });
});

describe('withWriteTransaction', () => {
  it('commits on success', () => {
    const db = createConnection(':memory:');
    withWriteTransaction(db, () => {
      db.prepare('INSERT INTO projection_state (name, last_event_id, updated_at) VALUES (?, ?, ?)').run('test', 0, new Date().toISOString());
    });
    const row = db.prepare('SELECT * FROM projection_state WHERE name = ?').get('test');
    expect(row).toBeDefined();
    db.close();
  });

  it('rolls back on error', () => {
    const db = createConnection(':memory:');
    try {
      withWriteTransaction(db, () => {
        db.prepare('INSERT INTO projection_state (name, last_event_id, updated_at) VALUES (?, ?, ?)').run('test', 0, new Date().toISOString());
        throw new Error('Intentional failure');
      });
    } catch {}
    const row = db.prepare('SELECT * FROM projection_state WHERE name = ?').get('test');
    expect(row).toBeUndefined();
    db.close();
  });
});
