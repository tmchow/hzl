import type Database from 'better-sqlite3';
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

  db.exec(SCHEMA_V1);
}
