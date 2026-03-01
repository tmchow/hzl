// packages/hzl-core/src/projections/tasks-current.ts
import type Database from 'libsql';
import type { PersistedEventEnvelope } from '../events/store.js';
import { CachingProjector } from './types.js';
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

export class TasksCurrentProjector extends CachingProjector {
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
    this.stmt(db, 'taskCreated', `
      INSERT INTO tasks_current (
        task_id, title, project, status, parent_id, description,
        links, tags, priority, due_at, metadata,
        agent,
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
      data.agent ?? data.assignee ?? null,
      event.timestamp,
      event.timestamp,
      event.rowid
    );
  }

  private handleStatusChanged(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as StatusChangedData;
    const toStatus = data.to;
    const isTerminal = toStatus === TaskStatus.Done || toStatus === TaskStatus.Archived;
    const isDone = toStatus === TaskStatus.Done;

    if (toStatus === TaskStatus.InProgress) {
      const newAssignee = data.agent ?? data.assignee ?? event.author ?? event.agent_id ?? null;

      // Steal case: in_progress → in_progress - always overwrite agent and claimed_at
      if (data.from === TaskStatus.InProgress) {
        this.stmt(db, 'statusChangedSteal', `
          UPDATE tasks_current SET
            claimed_at = ?,
            agent = ?,
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
        // Unblock case: blocked → in_progress - preserve claimed_at, update agent only if provided
        this.stmt(db, 'statusChangedUnblockToInProgress', `
          UPDATE tasks_current SET
            status = ?,
            agent = COALESCE(?, agent),
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
        // Normal claim (ready → in_progress) - set claimed_at, preserve agent if no new one
        this.stmt(db, 'statusChangedClaimToInProgress', `
          UPDATE tasks_current SET
            status = ?,
            claimed_at = ?,
            agent = COALESCE(?, agent),
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
    } else if (data.from === TaskStatus.Blocked && toStatus === TaskStatus.Blocked) {
      // Updating block reason: preserve agent, claimed_at - just update timestamp
      this.stmt(db, 'statusChangedBlockedToBlocked', `
        UPDATE tasks_current SET
          updated_at = ?,
          last_event_id = ?
        WHERE task_id = ?
      `).run(event.timestamp, event.rowid, event.task_id);
    } else if (toStatus === TaskStatus.Blocked) {
      // Entering blocked state: preserve agent and claimed_at, clear lease_until
      this.stmt(db, 'statusChangedToBlocked', `
        UPDATE tasks_current SET
          status = ?,
          lease_until = NULL,
          updated_at = ?,
          last_event_id = ?
        WHERE task_id = ?
      `).run(toStatus, event.timestamp, event.rowid, event.task_id);
    } else if (data.from === TaskStatus.InProgress || data.from === TaskStatus.Blocked) {
      // When leaving in_progress/blocked: clear claimed_at and lease, but PRESERVE agent
      // If transitioning to terminal state, set terminal_at
      this.stmt(db, 'statusChangedLeaveInProgressOrBlocked', `
        UPDATE tasks_current SET
          status = ?,
          claimed_at = NULL,
          lease_until = NULL,
          progress = CASE WHEN ? THEN 100 ELSE progress END,
          terminal_at = CASE WHEN ? THEN ? ELSE terminal_at END,
          updated_at = ?,
          last_event_id = ?
        WHERE task_id = ?
      `).run(
        toStatus,
        isDone ? 1 : 0,
        isTerminal ? 1 : 0,
        isTerminal ? event.timestamp : null,
        event.timestamp,
        event.rowid,
        event.task_id
      );
    } else {
      // Generic status change (including ready → done, backlog → archived, etc.)
      // If transitioning to terminal state, set terminal_at
      this.stmt(db, 'statusChangedGeneric', `
        UPDATE tasks_current SET
          status = ?,
          progress = CASE WHEN ? THEN 100 ELSE progress END,
          terminal_at = CASE WHEN ? THEN ? ELSE terminal_at END,
          updated_at = ?,
          last_event_id = ?
        WHERE task_id = ?
      `).run(
        toStatus,
        isDone ? 1 : 0,
        isTerminal ? 1 : 0,
        isTerminal ? event.timestamp : null,
        event.timestamp,
        event.rowid,
        event.task_id
      );
    }
  }

  private handleTaskMoved(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as TaskMovedData;
    this.stmt(db, 'taskMoved', `
      UPDATE tasks_current SET
        project = ?,
        updated_at = ?,
        last_event_id = ?
      WHERE task_id = ?
    `).run(data.to_project, event.timestamp, event.rowid, event.task_id);
  }

  private handleTaskUpdated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as TaskUpdatedData;
    const field = data.field === 'assignee' ? 'agent' : data.field;
    const newValue = JSON_FIELDS.has(field)
      ? JSON.stringify(data.new_value)
      : data.new_value;

    this.stmt(db, `taskUpdated:${field}`, `
      UPDATE tasks_current SET
        ${field} = ?,
        updated_at = ?,
        last_event_id = ?
      WHERE task_id = ?
    `).run(newValue, event.timestamp, event.rowid, event.task_id);
  }

  private handleTaskArchived(event: PersistedEventEnvelope, db: Database.Database): void {
    this.stmt(db, 'taskArchived', `
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
      this.stmt(db, 'checkpointRecordedProgress', `
        UPDATE tasks_current SET
          progress = ?,
          updated_at = ?,
          last_event_id = ?
        WHERE task_id = ?
      `).run(data.progress, event.timestamp, event.rowid, event.task_id);
    }
  }
}
