// packages/hzl-core/src/projections/search.ts
import type Database from 'better-sqlite3';
import type { PersistedEventEnvelope } from '../events/store.js';
import type { Projector } from './types.js';
import { EventType, type TaskCreatedData, type TaskUpdatedData } from '../events/types.js';

const SEARCHABLE_FIELDS = new Set(['title', 'description']);

export class SearchProjector implements Projector {
  name = 'search';

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
    db.exec('DELETE FROM task_search');
  }

  private handleTaskCreated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as TaskCreatedData;
    db.prepare(`
      INSERT INTO task_search (task_id, title, description)
      VALUES (?, ?, ?)
    `).run(event.task_id, data.title, data.description ?? '');
  }

  private handleTaskUpdated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as TaskUpdatedData;
    if (!SEARCHABLE_FIELDS.has(data.field)) return;

    const task = db.prepare(
      'SELECT title, description FROM tasks_current WHERE task_id = ?'
    ).get(event.task_id) as { title: string; description: string | null } | undefined;

    if (!task) return;

    db.prepare('DELETE FROM task_search WHERE task_id = ?').run(event.task_id);
    db.prepare(`
      INSERT INTO task_search (task_id, title, description)
      VALUES (?, ?, ?)
    `).run(event.task_id, task.title, task.description ?? '');
  }
}
