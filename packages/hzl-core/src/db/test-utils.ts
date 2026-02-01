/**
 * Test utilities for creating in-memory databases with the correct schema.
 */
import Database from 'libsql';
import { EVENTS_SCHEMA_V2, CACHE_SCHEMA_V1, PRAGMAS } from './schema.js';

/**
 * Creates an in-memory database with the events schema applied.
 * For tests that only need events.
 */
export function createTestEventsDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(PRAGMAS);
  db.exec(EVENTS_SCHEMA_V2);
  return db;
}

/**
 * Creates an in-memory database with the cache schema applied.
 * For tests that need projections (tasks_current, etc).
 */
export function createTestCacheDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(PRAGMAS);
  db.exec(CACHE_SCHEMA_V1);
  return db;
}

/**
 * Creates both events and cache databases for tests.
 * Returns both databases.
 */
export function createTestDatabases(): { eventsDb: Database.Database; cacheDb: Database.Database } {
  return {
    eventsDb: createTestEventsDb(),
    cacheDb: createTestCacheDb(),
  };
}

/**
 * Creates a single combined in-memory database with both events and cache schemas.
 * This is for tests that use a single database (simpler test setup).
 */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(PRAGMAS);
  db.exec(EVENTS_SCHEMA_V2);
  db.exec(CACHE_SCHEMA_V1);
  return db;
}

/**
 * Creates a file-based database with both events and cache schemas.
 * For tests that need file I/O operations (backup, restore, etc).
 */
export function createTestDbAtPath(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.exec(PRAGMAS);
  db.exec(EVENTS_SCHEMA_V2);
  db.exec(CACHE_SCHEMA_V1);
  return db;
}
