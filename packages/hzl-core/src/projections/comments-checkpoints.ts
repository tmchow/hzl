// packages/hzl-core/src/projections/comments-checkpoints.ts
import type Database from 'better-sqlite3';
import type { PersistedEventEnvelope } from '../events/store.js';
import type { Projector } from './types.js';
import { EventType } from '../events/types.js';

export class CommentsCheckpointsProjector implements Projector {
  name = 'comments_checkpoints';

  apply(event: PersistedEventEnvelope, db: Database.Database): void {
    switch (event.type) {
      case EventType.CommentAdded:
        this.handleCommentAdded(event, db);
        break;
      case EventType.CheckpointRecorded:
        this.handleCheckpointRecorded(event, db);
        break;
    }
  }

  reset(db: Database.Database): void {
    db.exec('DELETE FROM task_comments');
    db.exec('DELETE FROM task_checkpoints');
  }

  private handleCommentAdded(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as any;
    db.prepare(`
      INSERT INTO task_comments (event_rowid, task_id, author, agent_id, text, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      event.rowid,
      event.task_id,
      event.author ?? null,
      event.agent_id ?? null,
      data.text,
      event.timestamp
    );
  }

  private handleCheckpointRecorded(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as any;
    db.prepare(`
      INSERT INTO task_checkpoints (event_rowid, task_id, name, data, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      event.rowid,
      event.task_id,
      data.name,
      JSON.stringify(data.data ?? {}),
      event.timestamp
    );
  }
}
