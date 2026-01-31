import type Database from 'better-sqlite3';
import { EventType, PROJECT_EVENT_TASK_ID } from '../events/types.js';
import { generateId } from '../utils/id.js';
import { SCHEMA_V1, PRAGMAS } from './schema.js';

const MIGRATIONS: Record<number, string> = {
  1: SCHEMA_V1,
};

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

export function runMigrations(db: Database.Database): void {
  db.exec(PRAGMAS);

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const currentVersion = getCurrentVersion(db);
  const versions = Object.keys(MIGRATIONS)
    .map(Number)
    .sort((a, b) => a - b);

  for (const version of versions) {
    if (version > currentVersion) {
      db.transaction(() => {
        db.exec(MIGRATIONS[version]);
        db.prepare(
          'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)'
        ).run(version, new Date().toISOString());
      })();
    }
  }

  migrateToProjectsTable(db);
  db.exec(SCHEMA_V1);
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
