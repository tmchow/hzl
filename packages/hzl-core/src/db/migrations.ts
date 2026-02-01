import type Database from 'libsql';
import crypto from 'crypto';

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
