import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EVENTS_SCHEMA_V2 } from '../schema.js';

describe('append-only enforcement', () => {
    let db: Database.Database;
    const testDbPath = path.join(os.tmpdir(), `append-only-test-${Date.now()}.db`);

    beforeEach(() => {
        db = new Database(testDbPath);
        // EVENTS_SCHEMA_V2 might not exist yet, preventing this from running until I create it.
        // However, for TDD, I should try to import it. If it fails, that's part of the process.
        // But since I can't import runtime undefined, I'll mock the expectation or relies on the next step to add it.
        // For now, let's assume I'll add it in the next step.
        db.exec(EVENTS_SCHEMA_V2);
    });

    afterEach(() => {
        db.close();
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    it('allows INSERT into events table', () => {
        const stmt = db.prepare(`
      INSERT INTO events (event_id, task_id, type, data, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
        expect(() => stmt.run('evt-1', 'task-1', 'TaskCreated', '{}', new Date().toISOString())).not.toThrow();
    });

    it('rejects UPDATE on events table', () => {
        db.prepare(`
      INSERT INTO events (event_id, task_id, type, data, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run('evt-1', 'task-1', 'TaskCreated', '{}', new Date().toISOString());

        expect(() => {
            db.prepare('UPDATE events SET type = ? WHERE event_id = ?').run('Modified', 'evt-1');
        }).toThrow(/cannot UPDATE/i);
    });

    it('rejects DELETE on events table', () => {
        db.prepare(`
      INSERT INTO events (event_id, task_id, type, data, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run('evt-1', 'task-1', 'TaskCreated', '{}', new Date().toISOString());

        expect(() => {
            db.prepare('DELETE FROM events WHERE event_id = ?').run('evt-1');
        }).toThrow(/cannot DELETE/i);
    });
});
