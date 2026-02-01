import type Database from 'libsql';
import crypto from 'crypto';
import { EventType, PROJECT_EVENT_TASK_ID } from '../events/types.js';
import { generateId } from '../utils/id.js';
import { SCHEMA_V1, PRAGMAS } from './schema.js';

export interface Migration {
  id: string;
  up: string;
  down?: string; // Optional rollback SQL
}

export interface MigrationResult {
  success: boolean;
  applied: string[];
  skipped: string[];
  error?: string;
}

export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly failedMigration: string,
    public readonly rolledBack: string[]
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

function computeChecksum(sql: string): string {
  return crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16);
}

function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id TEXT PRIMARY KEY,
      applied_at_ms INTEGER NOT NULL,
      checksum TEXT NOT NULL
    )
  `);
}

function getAppliedMigrations(db: Database.Database): Set<string> {
  const rows = db.prepare('SELECT migration_id FROM schema_migrations').all() as { migration_id: string }[];
  return new Set(rows.map(r => r.migration_id));
}

/**
 * Run migrations with atomic rollback on failure.
 * All pending migrations are run in a single transaction.
 * If any migration fails, ALL changes are rolled back.
 */
export function runMigrationsWithRollback(
  db: Database.Database,
  migrations: Migration[]
): MigrationResult {
  ensureMigrationsTable(db);

  const applied: string[] = [];
  const skipped: string[] = [];
  const alreadyApplied = getAppliedMigrations(db);

  // Filter to pending migrations
  const pendingMigrations = migrations.filter(m => {
    if (alreadyApplied.has(m.id)) {
      skipped.push(m.id);
      return false;
    }
    return true;
  });

  if (pendingMigrations.length === 0) {
    return { success: true, applied, skipped };
  }

  // Run all pending migrations in a single transaction for atomic rollback
  try {
    db.exec('BEGIN IMMEDIATE');

    for (const migration of pendingMigrations) {
      try {
        db.exec(migration.up);

        // Record migration
        db.prepare(
          'INSERT INTO schema_migrations (migration_id, applied_at_ms, checksum) VALUES (?, ?, ?)'
        ).run(migration.id, Date.now(), computeChecksum(migration.up));

        applied.push(migration.id);
      } catch (err) {
        // Rollback the entire transaction
        db.exec('ROLLBACK');

        throw new MigrationError(
          `Migration ${migration.id} failed: ${err instanceof Error ? err.message : String(err)}`,
          migration.id,
          applied // These were applied before failure but are now rolled back
        );
      }
    }

    db.exec('COMMIT');
    return { success: true, applied, skipped };
  } catch (err) {
    if (err instanceof MigrationError) {
      throw err;
    }
    // Unexpected error - ensure rollback
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback errors
    }
    throw err;
  }
}

/**
 * Legacy migration runner for backward compatibility with connection.ts
 * Uses the monolithic SCHEMA_V1 and performs the project migration check.
 */
export function runMigrations(db: Database.Database): void {
  db.exec(PRAGMAS);

  // Support old-style schema_migrations table for getVersion check if needed,
  // but mostly we just ensure SCHEMA_V1 is applied.
  // Note: SCHEMA_V1 uses IF NOT EXISTS, so it's safe to run multiple times.
  db.exec(SCHEMA_V1);

  migrateToProjectsTable(db);
}

// Helper to get current version from old style table (legacy support)
export function getCurrentVersion(db: Database.Database): number {
  try {
    const rows = db
      .prepare('SELECT version FROM schema_migrations')
      .all() as { version: number | string | null }[];
    let maxVersion = 0;
    for (const row of rows) {
      const parsed = Number(row.version);
      if (Number.isFinite(parsed) && parsed > maxVersion) {
        maxVersion = parsed;
      }
    }
    return maxVersion;
  } catch {
    return 0;
  }
}

function migrateToProjectsTable(db: Database.Database): void {
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
    .get();

  if (!tableExists) {
    db.exec(`
      CREATE TABLE projects (
        name TEXT PRIMARY KEY,
        description TEXT,
        is_protected INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_event_id INTEGER NOT NULL
      );
      CREATE INDEX idx_projects_protected ON projects(is_protected);
    `);
  }

  const eventsTableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'")
    .get();
  if (!eventsTableExists) {
    return;
  }

  const tasksCurrentExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks_current'")
    .get();

  const existingProjects = tasksCurrentExists
    ? (db.prepare('SELECT DISTINCT project FROM tasks_current').all() as {
      project: string;
    }[])
    : [];

  // Check what work needs to be done before starting any transaction
  const existingProjectNames = new Set(
    (db.prepare('SELECT name FROM projects').all() as { name: string }[]).map(
      (r) => r.name
    )
  );

  const projectsToCreate = existingProjects.filter(
    ({ project }) => !existingProjectNames.has(project)
  );
  const needsInbox = !existingProjectNames.has('inbox');
  const inboxNeedsProtection =
    existingProjectNames.has('inbox') &&
    (db.prepare('SELECT is_protected FROM projects WHERE name = ?').get('inbox') as {
      is_protected: number;
    } | undefined)?.is_protected !== 1;

  // Only start a transaction if there's actual work to do
  if (projectsToCreate.length === 0 && !needsInbox && !inboxNeedsProtection) {
    return;
  }

  const timestamp = new Date().toISOString();
  const insertEvent = db.prepare(`
    INSERT INTO events (event_id, task_id, type, data, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertProject = db.prepare(`
    INSERT OR IGNORE INTO projects (name, description, is_protected, created_at, last_event_id)
    VALUES (?, NULL, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const { project } of projectsToCreate) {
      const eventId = generateId();
      const data = JSON.stringify({ name: project });
      const result = insertEvent.run(
        eventId,
        PROJECT_EVENT_TASK_ID,
        EventType.ProjectCreated,
        data,
        timestamp
      );
      insertProject.run(project, 0, timestamp, result.lastInsertRowid);
    }

    if (needsInbox) {
      const eventId = generateId();
      const data = JSON.stringify({ name: 'inbox', is_protected: true });
      const result = insertEvent.run(
        eventId,
        PROJECT_EVENT_TASK_ID,
        EventType.ProjectCreated,
        data,
        timestamp
      );
      insertProject.run('inbox', 1, timestamp, result.lastInsertRowid);
    } else if (inboxNeedsProtection) {
      db.prepare('UPDATE projects SET is_protected = 1 WHERE name = ?').run('inbox');
    }
  })();
}
