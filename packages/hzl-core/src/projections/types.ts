// packages/hzl-core/src/projections/types.ts
import type Database from 'libsql';
import type { PersistedEventEnvelope } from '../events/store.js';

export interface Projector {
  name: string;
  apply(event: PersistedEventEnvelope, db: Database.Database): void;
  reset?(db: Database.Database): void;
}

/**
 * Base class for projectors that caches prepared statements.
 *
 * Since `db` is passed per-call (not in constructor), the cache detects
 * when the db reference changes (e.g., during rebuild with a fresh DB)
 * and automatically invalidates all cached statements.
 */
export abstract class CachingProjector implements Projector {
  abstract name: string;
  abstract apply(event: PersistedEventEnvelope, db: Database.Database): void;

  private cachedDb: Database.Database | null = null;
  private statementCache = new Map<string, Database.Statement>();

  protected stmt(db: Database.Database, key: string, sql: string): Database.Statement {
    if (this.cachedDb !== db) {
      this.cachedDb = db;
      this.statementCache.clear();
    }

    let cached = this.statementCache.get(key);
    if (!cached) {
      cached = db.prepare(sql);
      this.statementCache.set(key, cached);
    }
    return cached;
  }
}

export interface ProjectionState {
  name: string;
  last_event_id: number;
  updated_at: string;
}
