// packages/hzl-core/src/projections/tags.ts
import type Database from 'better-sqlite3';
import type { PersistedEventEnvelope } from '../events/store.js';
import type { Projector } from './types.js';
import { EventType, type TaskCreatedData, type TaskUpdatedData } from '../events/types.js';

export class TagsProjector implements Projector {
  name = 'tags';

  apply(event: PersistedEventEnvelope, db: Database.Database): void {
    switch (event.type) {
      case EventType.TaskCreated:
        this.handleTaskCreated(event, db);
        break;
      case EventType.TaskUpdated:
        this.handleTaskUpdated(event, db);
        break;
    }
  }

  reset(db: Database.Database): void {
    db.exec('DELETE FROM task_tags');
  }

  private handleTaskCreated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as TaskCreatedData;
    const tags = data.tags;
    if (!tags || tags.length === 0) return;

    this.insertTags(db, event.task_id, tags);
  }

  private handleTaskUpdated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as TaskUpdatedData;
    if (data.field !== 'tags') return;

    const newTags = Array.isArray(data.new_value) ? (data.new_value as string[]) : [];
    db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(event.task_id);
    if (newTags && newTags.length > 0) {
      this.insertTags(db, event.task_id, newTags);
    }
  }

  private insertTags(db: Database.Database, taskId: string, tags: string[]): void {
    const insertStmt = db.prepare(
      'INSERT OR IGNORE INTO task_tags (task_id, tag) VALUES (?, ?)'
    );
    for (const tag of tags) {
      insertStmt.run(taskId, tag);
    }
  }
}
