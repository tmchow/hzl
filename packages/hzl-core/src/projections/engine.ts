// packages/hzl-core/src/projections/engine.ts
import type Database from 'libsql';
import type { PersistedEventEnvelope } from '../events/store.js';
import type { EventType } from '../events/types.js';
import type { Projector, ProjectionState } from './types.js';

type EventRow = {
  id: number;
  event_id: string;
  task_id: string;
  type: EventType;
  data: string;
  author: string | null;
  agent_id: string | null;
  session_id: string | null;
  correlation_id: string | null;
  causation_id: string | null;
  timestamp: string;
};

export class ProjectionEngine {
  private projectors: Projector[] = [];
  private getStateStmt: Database.Statement;
  private upsertStateStmt: Database.Statement;
  private getEventsSinceStmt: Database.Statement | null = null;

  /**
   * Creates a ProjectionEngine.
   * @param db - The cache database (where projections are stored)
   * @param eventsDb - Optional events database (defaults to db for combined database setups)
   */
  constructor(private db: Database.Database, private eventsDb?: Database.Database) {
    this.getStateStmt = db.prepare(
      'SELECT * FROM projection_state WHERE name = ?'
    );
    this.upsertStateStmt = db.prepare(`
      INSERT INTO projection_state (name, last_event_id, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        last_event_id = excluded.last_event_id,
        updated_at = excluded.updated_at
    `);
    // Don't prepare getEventsSince in constructor - it may fail if events table doesn't exist in cacheDb
    // and we may be using split databases
  }

  private ensureGetEventsSinceStmt(): Database.Statement {
    if (!this.getEventsSinceStmt) {
      const targetDb = this.eventsDb ?? this.db;
      this.getEventsSinceStmt = targetDb.prepare(`
        SELECT * FROM events WHERE id > ? ORDER BY id ASC LIMIT ?
      `);
    }
    return this.getEventsSinceStmt;
  }

  register(projector: Projector): void {
    this.projectors.push(projector);
  }

  applyEvent(event: PersistedEventEnvelope): void {
    for (const projector of this.projectors) {
      projector.apply(event, this.db);
    }
  }

  getProjectionState(name: string): ProjectionState | null {
    const row = this.getStateStmt.get(name) as ProjectionState | undefined;
    return row ?? null;
  }

  updateProjectionState(name: string, lastEventId: number): void {
    this.upsertStateStmt.run(name, lastEventId, new Date().toISOString());
  }

  getEventsSince(afterId: number, limit: number): PersistedEventEnvelope[] {
    const stmt = this.ensureGetEventsSinceStmt();
    const rows = stmt.all(afterId, limit) as EventRow[];
    return rows.map((row) => ({
      rowid: row.id,
      event_id: row.event_id,
      task_id: row.task_id,
      type: row.type,
      data: JSON.parse(row.data) as Record<string, unknown>,
      author: row.author ?? undefined,
      agent_id: row.agent_id ?? undefined,
      session_id: row.session_id ?? undefined,
      correlation_id: row.correlation_id ?? undefined,
      causation_id: row.causation_id ?? undefined,
      timestamp: row.timestamp,
    }));
  }

  getProjectors(): Projector[] {
    return [...this.projectors];
  }
}
