// packages/hzl-core/src/projections/tasks-current.ts
import type Database from 'libsql';
import type { PersistedEventEnvelope } from '../events/store.js';
import type { Projector } from './types.js';
import {
  EventType,
  TaskStatus,
  type StatusChangedData,
  type TaskCreatedData,
  type TaskMovedData,
  type TaskUpdatedData,
} from '../events/types.js';

const JSON_FIELDS = new Set(['tags', 'links', 'metadata']);

export class TasksCurrentProjector implements Projector {
  name = 'tasks_current';

  apply(event: PersistedEventEnvelope, db: Database.Database): void {
    switch (event.type) {
      case EventType.TaskCreated:
        this.handleTaskCreated(event, db);
        break;
      case EventType.StatusChanged:
        this.handleStatusChanged(event, db);
        break;
      case EventType.TaskMoved:
        this.handleTaskMoved(event, db);
        break;
      case EventType.TaskUpdated:
        this.handleTaskUpdated(event, db);
        break;
      case EventType.TaskArchived:
        this.handleTaskArchived(event, db);
        break;
    }
  }

  reset(db: Database.Database): void {
    db.exec('DELETE FROM tasks_current');
  }

  private handleTaskCreated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as TaskCreatedData;
    db.prepare(`
      INSERT INTO tasks_current (
        task_id, title, project, status, parent_id, description,
        links, tags, priority, due_at, metadata,
        created_at, updated_at, last_event_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.task_id,
      data.title,
      data.project,
      TaskStatus.Backlog,
      data.parent_id ?? null,
      data.description ?? null,
      JSON.stringify(data.links ?? []),
      JSON.stringify(data.tags ?? []),
      data.priority ?? 0,
      data.due_at ?? null,
      JSON.stringify(data.metadata ?? {}),
      event.timestamp,
      event.timestamp,
      event.rowid
    );
  }

  private handleStatusChanged(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as StatusChangedData;
    const toStatus = data.to;

    if (toStatus === TaskStatus.InProgress) {
      db.prepare(`
        UPDATE tasks_current SET
          status = ?,
          claimed_at = ?,
          claimed_by_author = ?,
          claimed_by_agent_id = ?,
          lease_until = ?,
          updated_at = ?,
          last_event_id = ?
        WHERE task_id = ?
      `).run(
        toStatus,
        event.timestamp,
        event.author ?? null,
        event.agent_id ?? null,
        data.lease_until ?? null,
        event.timestamp,
        event.rowid,
        event.task_id
      );
    } else if (data.from === TaskStatus.InProgress) {
      db.prepare(`
        UPDATE tasks_current SET
          status = ?,
          claimed_at = NULL,
          claimed_by_author = NULL,
          claimed_by_agent_id = NULL,
          lease_until = NULL,
          updated_at = ?,
          last_event_id = ?
        WHERE task_id = ?
      `).run(toStatus, event.timestamp, event.rowid, event.task_id);
    } else {
      db.prepare(`
        UPDATE tasks_current SET
          status = ?,
          updated_at = ?,
          last_event_id = ?
        WHERE task_id = ?
      `).run(toStatus, event.timestamp, event.rowid, event.task_id);
    }
  }

  private handleTaskMoved(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as TaskMovedData;
    db.prepare(`
      UPDATE tasks_current SET
        project = ?,
        updated_at = ?,
        last_event_id = ?
      WHERE task_id = ?
    `).run(data.to_project, event.timestamp, event.rowid, event.task_id);
  }

  private handleTaskUpdated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as TaskUpdatedData;
    const field = data.field;
    const newValue = JSON_FIELDS.has(field)
      ? JSON.stringify(data.new_value)
      : data.new_value;

    db.prepare(`
      UPDATE tasks_current SET
        ${field} = ?,
        updated_at = ?,
        last_event_id = ?
      WHERE task_id = ?
    `).run(newValue, event.timestamp, event.rowid, event.task_id);
  }

  private handleTaskArchived(event: PersistedEventEnvelope, db: Database.Database): void {
    db.prepare(`
      UPDATE tasks_current SET
        status = ?,
        updated_at = ?,
        last_event_id = ?
      WHERE task_id = ?
    `).run(TaskStatus.Archived, event.timestamp, event.rowid, event.task_id);
  }
}
