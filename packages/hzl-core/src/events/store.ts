import type Database from 'better-sqlite3';
import { generateId } from '../utils/id.js';
import { EventEnvelope, EventType, validateEventData } from './types.js';

export interface AppendEventInput {
  event_id?: string;
  task_id: string;
  type: EventType;
  data: Record<string, unknown>;
  author?: string;
  agent_id?: string;
  session_id?: string;
  correlation_id?: string;
  causation_id?: string;
}

export interface PersistedEventEnvelope extends EventEnvelope {
  rowid: number;
}

export interface GetByTaskIdOptions {
  afterId?: number;
  limit?: number;
}

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

export class EventStore {
  private insertReturningStmt: Database.Statement;
  private insertIgnoreStmt: Database.Statement;
  private selectByTaskStmt: Database.Statement;
  private selectByEventIdStmt: Database.Statement;

  constructor(private db: Database.Database) {
    // Use RETURNING to get canonical DB timestamp and rowid
    this.insertReturningStmt = db.prepare(`
      INSERT INTO events (event_id, task_id, type, data, author, agent_id, session_id, correlation_id, causation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id, timestamp
    `);

    this.insertIgnoreStmt = db.prepare(`
      INSERT OR IGNORE INTO events (event_id, task_id, type, data, author, agent_id, session_id, correlation_id, causation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.selectByTaskStmt = db.prepare(`
      SELECT * FROM events
      WHERE task_id = ? AND id > COALESCE(?, 0)
      ORDER BY id ASC
      LIMIT COALESCE(?, 1000)
    `);

    this.selectByEventIdStmt = db.prepare(`
      SELECT * FROM events WHERE event_id = ?
    `);
  }

  append(input: AppendEventInput): PersistedEventEnvelope {
    validateEventData(input.type, input.data);

    const eventId = input.event_id ?? generateId();
    const row = this.insertReturningStmt.get(
      eventId,
      input.task_id,
      input.type,
      JSON.stringify(input.data),
      input.author ?? null,
      input.agent_id ?? null,
      input.session_id ?? null,
      input.correlation_id ?? null,
      input.causation_id ?? null
    ) as { id: number; timestamp: string };

    return {
      rowid: row.id,
      event_id: eventId,
      task_id: input.task_id,
      type: input.type,
      data: input.data,
      author: input.author,
      agent_id: input.agent_id,
      session_id: input.session_id,
      correlation_id: input.correlation_id,
      causation_id: input.causation_id,
      timestamp: row.timestamp,
    };
  }

  appendIdempotent(input: AppendEventInput): PersistedEventEnvelope | null {
    validateEventData(input.type, input.data);

    const eventId = input.event_id ?? generateId();
    const result = this.insertIgnoreStmt.run(
      eventId,
      input.task_id,
      input.type,
      JSON.stringify(input.data),
      input.author ?? null,
      input.agent_id ?? null,
      input.session_id ?? null,
      input.correlation_id ?? null,
      input.causation_id ?? null
    );

    // If no rows changed, the event_id already existed
    if (result.changes === 0) {
      return null;
    }

    // Fetch the inserted row to get canonical timestamp
    const row = this.selectByEventIdStmt.get(eventId) as EventRow | undefined;
    if (!row) {
      throw new Error(`Failed to load inserted event: ${eventId}`);
    }
    return this.rowToEnvelope(row);
  }

  getByTaskId(taskId: string, opts?: GetByTaskIdOptions): PersistedEventEnvelope[] {
    const rows = this.selectByTaskStmt.all(
      taskId,
      opts?.afterId ?? null,
      opts?.limit ?? null
    ) as EventRow[];
    return rows.map(row => this.rowToEnvelope(row));
  }

  private rowToEnvelope(row: EventRow): PersistedEventEnvelope {
    return {
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
    };
  }
}
