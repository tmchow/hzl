import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'libsql';
import { EVENTS_SCHEMA_V2, CACHE_SCHEMA_V1, PRAGMAS } from 'hzl-core/db/schema.js';
import { initializeDbFromPath, closeDb, type Services } from './db.js';

describe('db.ts schema migration', () => {
  let testDir: string;
  let dbPath: string;
  let cachePath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-db-test-'));
    dbPath = path.join(testDir, 'events.db');
    cachePath = path.join(testDir, 'cache.db');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function getSchemaVersion(cacheDbPath: string): number | null {
    const db = new Database(cacheDbPath);
    try {
      const row = db.prepare(
        "SELECT value FROM hzl_local_meta WHERE key = 'schema_version'"
      ).get() as { value: string } | undefined;
      return row ? parseInt(row.value, 10) : null;
    } finally {
      db.close();
    }
  }

  function getEventCount(eventsDbPath: string): number {
    const db = new Database(eventsDbPath);
    try {
      const row = db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
      return row.count;
    } finally {
      db.close();
    }
  }

  function getColumns(cacheDbPath: string, table: string): string[] {
    const db = new Database(cacheDbPath);
    try {
      const rows = db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[];
      return rows.map(row => row.name);
    } finally {
      db.close();
    }
  }

  describe('fresh database (no events)', () => {
    it('sets schema version without replaying events', () => {
      // Capture stderr to verify no migration message
      const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      let services: Services | undefined;
      try {
        services = initializeDbFromPath(dbPath);

        // Schema version should be set to current (3)
        expect(getSchemaVersion(cachePath)).toBe(4);

        // Note: initializeDb creates the inbox project, so 1 event exists after init
        // The point is that BEFORE any events existed (during checkAndMigrateSchema),
        // no replay was triggered - this is verified by the absence of migration messages
        expect(getEventCount(dbPath)).toBe(1); // inbox project creation event

        // No migration message should be printed
        const migrationCalls = stderrSpy.mock.calls.filter(
          call => String(call[0]).includes('Upgrading database schema')
        );
        expect(migrationCalls).toHaveLength(0);
      } finally {
        if (services) closeDb(services);
        stderrSpy.mockRestore();
      }
    });

    it('does not print "Replaying events" message for fresh database', () => {
      const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      let services: Services | undefined;
      try {
        services = initializeDbFromPath(dbPath);

        const replayCalls = stderrSpy.mock.calls.filter(
          call => String(call[0]).includes('Replaying')
        );
        expect(replayCalls).toHaveLength(0);
      } finally {
        if (services) closeDb(services);
        stderrSpy.mockRestore();
      }
    });
  });

  describe('database with old cache schema and no events', () => {
    it('rebuilds cache schema when no events exist (zero-event migration path)', () => {
      // Create old cache schema without terminal_at column and no schema_version.
      // Importantly, this old schema also lacks projection_cursor and projection_state
      // tables - the migration must handle this gracefully using DROP TABLE IF EXISTS.
      const eventsDb = new Database(dbPath);
      const cacheDb = new Database(cachePath);

      eventsDb.exec(PRAGMAS);
      eventsDb.exec(EVENTS_SCHEMA_V2);

      cacheDb.exec(PRAGMAS);
      cacheDb.exec(`
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

      eventsDb.close();
      cacheDb.close();

      // Capture stderr to verify zero-event path (no replay message)
      const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      let services: Services | undefined;
      try {
        services = initializeDbFromPath(dbPath);

        // Schema version should now be current
        expect(getSchemaVersion(cachePath)).toBe(4);

        // Cache schema should include terminal_at after rebuild
        const columns = getColumns(cachePath, 'tasks_current');
        expect(columns).toContain('terminal_at');

        // Zero-event path should NOT print migration/replay messages
        const migrationCalls = stderrSpy.mock.calls.filter(
          call => String(call[0]).includes('Upgrading database schema')
        );
        const replayCalls = stderrSpy.mock.calls.filter(
          call => String(call[0]).includes('Replaying')
        );
        expect(migrationCalls).toHaveLength(0);
        expect(replayCalls).toHaveLength(0);
      } finally {
        if (services) closeDb(services);
        stderrSpy.mockRestore();
      }
    });

    it('clears stale projection metadata during zero-events schema rebuild', () => {
      // Create cache with stale projection state from a previous schema version
      const eventsDb = new Database(dbPath);
      const cacheDb = new Database(cachePath);

      eventsDb.exec(PRAGMAS);
      eventsDb.exec(EVENTS_SCHEMA_V2);

      cacheDb.exec(PRAGMAS);
      // Old schema without terminal_at - will trigger migration
      cacheDb.exec(`
        CREATE TABLE hzl_local_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE projection_cursor (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE projection_state (
          name TEXT PRIMARY KEY,
          last_event_id INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
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

      // Insert stale projection metadata that would be invalid after rebuild
      cacheDb.prepare(
        "INSERT INTO projection_cursor (key, value) VALUES ('last_event_id', '999')"
      ).run();
      cacheDb.prepare(
        "INSERT INTO projection_state (name, last_event_id, updated_at) VALUES ('tasks_current', 999, '2024-01-01T00:00:00Z')"
      ).run();
      cacheDb.prepare(
        "INSERT INTO projection_state (name, last_event_id, updated_at) VALUES ('dependencies', 500, '2024-01-01T00:00:00Z')"
      ).run();

      eventsDb.close();
      cacheDb.close();

      let services: Services | undefined;
      try {
        services = initializeDbFromPath(dbPath);

        // Verify stale projection metadata was cleared
        const checkDb = new Database(cachePath);
        try {
          const cursorRows = checkDb.prepare('SELECT * FROM projection_cursor').all();
          const stateRows = checkDb.prepare('SELECT * FROM projection_state').all();

          // Should have no stale entries from before migration
          // (projection_state may have new entries from ensureInboxExists, but not the old ones)
          type CursorRow = { key: string; value: string };
          type StateRow = { name: string; last_event_id: number };
          expect((cursorRows as CursorRow[]).find(r => r.key === 'last_event_id' && r.value === '999')).toBeUndefined();
          expect((stateRows as StateRow[]).find(r => r.name === 'tasks_current' && r.last_event_id === 999)).toBeUndefined();
          expect((stateRows as StateRow[]).find(r => r.name === 'dependencies' && r.last_event_id === 500)).toBeUndefined();
        } finally {
          checkDb.close();
        }
      } finally {
        if (services) closeDb(services);
      }
    });
  });

  describe('database with existing events but no schema version', () => {
    it('runs migration when events exist and schema version is missing', () => {
      // Create database with events but no schema_version (simulates pre-migration database)
      const eventsDb = new Database(dbPath);
      const cacheDb = new Database(cachePath);

      eventsDb.exec(PRAGMAS);
      eventsDb.exec(EVENTS_SCHEMA_V2);
      cacheDb.exec(PRAGMAS);
      cacheDb.exec(CACHE_SCHEMA_V1);

      // Add a test event
      eventsDb.prepare(`
        INSERT INTO events (event_id, task_id, type, data, timestamp)
        VALUES ('evt-1', 'task-1', 'TaskCreated', '{"title":"Test","project":"inbox","status":"ready"}', datetime('now'))
      `).run();

      eventsDb.close();
      cacheDb.close();

      // Capture stderr to verify migration message
      const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      let services: Services | undefined;
      try {
        services = initializeDbFromPath(dbPath);

        // Schema version should now be set
        expect(getSchemaVersion(cachePath)).toBe(4);

        // Migration message should have been printed
        const migrationCalls = stderrSpy.mock.calls.filter(
          call => String(call[0]).includes('Upgrading database schema')
        );
        expect(migrationCalls.length).toBeGreaterThan(0);
      } finally {
        if (services) closeDb(services);
        stderrSpy.mockRestore();
      }
    });
  });

  describe('database with current schema version', () => {
    it('skips migration when schema version is already current', () => {
      // Create database with current schema version already set
      const eventsDb = new Database(dbPath);
      const cacheDb = new Database(cachePath);

      eventsDb.exec(PRAGMAS);
      eventsDb.exec(EVENTS_SCHEMA_V2);
      cacheDb.exec(PRAGMAS);
      cacheDb.exec(CACHE_SCHEMA_V1);

      // Set schema version to previous schema generation (2)
      cacheDb.prepare(
        "INSERT INTO hzl_local_meta (key, value) VALUES ('schema_version', '2')"
      ).run();

      // Add a test event
      eventsDb.prepare(`
        INSERT INTO events (event_id, task_id, type, data, timestamp)
        VALUES ('evt-1', 'task-1', 'TaskCreated', '{"title":"Test","project":"inbox","status":"ready"}', datetime('now'))
      `).run();

      eventsDb.close();
      cacheDb.close();

      const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      let services: Services | undefined;
      try {
        services = initializeDbFromPath(dbPath);

        // Schema version should be upgraded to current
        expect(getSchemaVersion(cachePath)).toBe(4);

        // Migration message should be printed
        const migrationCalls = stderrSpy.mock.calls.filter(
          call => String(call[0]).includes('Upgrading database schema')
        );
        expect(migrationCalls.length).toBeGreaterThan(0);
      } finally {
        if (services) closeDb(services);
        stderrSpy.mockRestore();
      }
    });
  });
});
