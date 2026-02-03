// packages/hzl-core/src/projections/tasks-current.ts
import type Database from 'libsql';
import type { PersistedEventEnvelope } from '../events/store.js';
import type { Projector } from './types.js';
import {
  EventType,
  TaskStatus,
  type CheckpointRecordedData,
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
      case EventType.CheckpointRecorded:
        this.handleCheckpointRecorded(event, db);
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
        assignee,
        created_at, updated_at, last_event_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      data.assignee ?? null,
      event.timestamp,
      event.timestamp,
      event.rowid
    );
  }

  private handleStatusChanged(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as StatusChangedData;
    const toStatus = data.to;
    const isTerminal = toStatus === TaskStatus.Done || toStatus === TaskStatus.Archived;

    if (toStatus === TaskStatus.InProgress) {
      const newAssignee = event.author || event.agent_id || null;

      // Steal case: in_progress → in_progress - always overwrite assignee and claimed_at
      if (data.from === TaskStatus.InProgress) {
        db.prepare(`
          UPDATE tasks_current SET
            claimed_at = ?,
            assignee = ?,
            lease_until = ?,
            updated_at = ?,
            last_event_id = ?
          WHERE task_id = ?
        `).run(
          event.timestamp,
          newAssignee,
          data.lease_until ?? null,
          event.timestamp,
          event.rowid,
          event.task_id
        );
      } else if (data.from === TaskStatus.Blocked) {
        // Unblock case: blocked → in_progress - preserve claimed_at, update assignee only if provided
        db.prepare(`
          UPDATE tasks_current SET
            status = ?,
            assignee = COALESCE(?, assignee),
            lease_until = ?,
            updated_at = ?,
            last_event_id = ?
          WHERE task_id = ?
        `).run(
          toStatus,
          newAssignee,
          data.lease_until ?? null,
          event.timestamp,
          event.rowid,
          event.task_id
        );
      } else {
        // Normal claim (ready → in_progress) - set claimed_at, preserve assignee if no new one
        db.prepare(`
          UPDATE tasks_current SET
            status = ?,
            claimed_at = ?,
            assignee = COALESCE(?, assignee),
            lease_until = ?,
            updated_at = ?,
            last_event_id = ?
          WHERE task_id = ?
        `).run(
          toStatus,
          event.timestamp,
          newAssignee,
          data.lease_until ?? null,
          event.timestamp,
          event.rowid,
          event.task_id
        );
      }
    } else if (toStatus === TaskStatus.Blocked) {
      // When blocked: preserve assignee and claimed_at, clear lease_until
      db.prepare(`
        UPDATE tasks_current SET
          status = ?,
          lease_until = NULL,
          updated_at = ?,
          last_event_id = ?
        WHERE task_id = ?
      `).run(toStatus, event.timestamp, event.rowid, event.task_id);
    } else if (data.from === TaskStatus.InProgress || data.from === TaskStatus.Blocked) {
      // When leaving in_progress/blocked: clear claimed_at and lease, but PRESERVE assignee
      // If transitioning to terminal state, set terminal_at
      db.prepare(`
        UPDATE tasks_current SET
          status = ?,
          claimed_at = NULL,
          lease_until = NULL,
          terminal_at = CASE WHEN ? THEN ? ELSE terminal_at END,
          updated_at = ?,
          last_event_id = ?
        WHERE task_id = ?
      `).run(toStatus, isTerminal ? 1 : 0, isTerminal ? event.timestamp : null, event.timestamp, event.rowid, event.task_id);
    } else {
      // Generic status change (including ready → done, backlog → archived, etc.)
      // If transitioning to terminal state, set terminal_at
      db.prepare(`
        UPDATE tasks_current SET
          status = ?,
          terminal_at = CASE WHEN ? THEN ? ELSE terminal_at END,
          updated_at = ?,
          last_event_id = ?
        WHERE task_id = ?
      `).run(toStatus, isTerminal ? 1 : 0, isTerminal ? event.timestamp : null, event.timestamp, event.rowid, event.task_id);
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
        terminal_at = ?,
        updated_at = ?,
        last_event_id = ?
      WHERE task_id = ?
    `).run(TaskStatus.Archived, event.timestamp, event.timestamp, event.rowid, event.task_id);
  }

  private handleCheckpointRecorded(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as CheckpointRecordedData;
    // Only update progress if it's present in the checkpoint
    if (data.progress !== undefined) {
      db.prepare(`
        UPDATE tasks_current SET
          progress = ?,
          updated_at = ?,
          last_event_id = ?
        WHERE task_id = ?
      `).run(data.progress, event.timestamp, event.rowid, event.task_id);
    }
  }
}
