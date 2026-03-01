// packages/hzl-core/src/projections/search.ts
import type Database from 'libsql';
import type { PersistedEventEnvelope } from '../events/store.js';
import { CachingProjector } from './types.js';
import { EventType, type TaskCreatedData, type TaskUpdatedData } from '../events/types.js';

const SEARCHABLE_FIELDS = new Set(['title', 'description', 'tags']);

export class SearchProjector extends CachingProjector {
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
    const tags = Array.isArray(data.tags) ? data.tags.join(' ') : '';
    this.stmt(db, 'insertTaskSearch', `
      INSERT INTO task_search (task_id, title, description, tags)
      VALUES (?, ?, ?, ?)
    `).run(event.task_id, data.title, data.description ?? '', tags);
  }

  private handleTaskUpdated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as TaskUpdatedData;
    if (!SEARCHABLE_FIELDS.has(data.field)) return;

    // Get current values from task_search (avoids N+1 query to tasks_current)
    const current = this.stmt(
      db,
      'selectTaskSearchById',
      'SELECT title, description, tags FROM task_search WHERE task_id = ?'
    ).get(event.task_id) as { title: string; description: string; tags: string } | undefined;

    if (!current) return;

    // Use the new value from the event for the changed field
    const title = data.field === 'title' ? (data.new_value as string) : current.title;
    const description = data.field === 'description' ? (data.new_value as string | null) ?? '' : current.description;
    const tags = data.field === 'tags' ? (Array.isArray(data.new_value) ? (data.new_value as string[]).join(' ') : '') : current.tags;

    this.stmt(db, 'deleteTaskSearchById', 'DELETE FROM task_search WHERE task_id = ?').run(
      event.task_id
    );
    this.stmt(db, 'insertTaskSearch', `
      INSERT INTO task_search (task_id, title, description, tags)
      VALUES (?, ?, ?, ?)
    `).run(event.task_id, title, description, tags);
  }
}
