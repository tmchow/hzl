// packages/hzl-core/src/projections/engine.ts
import type Database from 'better-sqlite3';
import type { PersistedEventEnvelope } from '../events/store.js';
import type { Projector, ProjectionState } from './types.js';

export class ProjectionEngine {
  private projectors: Projector[] = [];
  private getStateStmt: Database.Statement;
  private upsertStateStmt: Database.Statement;
  private getEventsSinceStmt: Database.Statement;

  constructor(private db: Database.Database) {
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
    this.getEventsSinceStmt = db.prepare(`
      SELECT * FROM events WHERE id > ? ORDER BY id ASC LIMIT ?
    `);
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
    const rows = this.getEventsSinceStmt.all(afterId, limit) as any[];
    return rows.map((row) => ({
      rowid: row.id,
      event_id: row.event_id,
      task_id: row.task_id,
      type: row.type,
      data: JSON.parse(row.data),
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
