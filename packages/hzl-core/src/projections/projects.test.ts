import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import { ProjectsProjector } from './projects.js';
import { EventType, PROJECT_EVENT_TASK_ID } from '../events/types.js';
import type { PersistedEventEnvelope } from '../events/store.js';
import { createTestDb } from '../db/test-utils.js';

describe('ProjectsProjector', () => {
  let db: Database.Database;
  let projector: ProjectsProjector;

  beforeEach(() => {
    db = createTestDb();
    projector = new ProjectsProjector();
  });

  afterEach(() => {
    db.close();
  });

  it('should have correct name', () => {
    expect(projector.name).toBe('projects');
  });

  it('should handle ProjectCreated event', () => {
    const event: PersistedEventEnvelope = {
      rowid: 1,
      event_id: 'evt-1',
      task_id: PROJECT_EVENT_TASK_ID,
      type: EventType.ProjectCreated,
      data: { name: 'myproject', description: 'Test project' },
      timestamp: '2026-01-30T12:00:00.000Z',
    };

    projector.apply(event, db);

    const row = db.prepare('SELECT * FROM projects WHERE name = ?').get('myproject') as any;
    expect(row).toBeDefined();
    expect(row.name).toBe('myproject');
    expect(row.description).toBe('Test project');
    expect(row.is_protected).toBe(0);
  });

  it('should handle ProjectCreated with is_protected', () => {
    const event: PersistedEventEnvelope = {
      rowid: 1,
      event_id: 'evt-1',
      task_id: PROJECT_EVENT_TASK_ID,
      type: EventType.ProjectCreated,
      data: { name: 'inbox', is_protected: true },
      timestamp: '2026-01-30T12:00:00.000Z',
    };

    projector.apply(event, db);

    const row = db.prepare('SELECT * FROM projects WHERE name = ?').get('inbox') as any;
    expect(row.is_protected).toBe(1);
  });

  it('should handle ProjectRenamed event', () => {
    db.prepare(
      'INSERT INTO projects (name, description, is_protected, created_at, last_event_id) VALUES (?, ?, ?, ?, ?)'
    ).run('oldname', null, 0, '2026-01-30T12:00:00.000Z', 1);

    const event: PersistedEventEnvelope = {
      rowid: 2,
      event_id: 'evt-2',
      task_id: PROJECT_EVENT_TASK_ID,
      type: EventType.ProjectRenamed,
      data: { old_name: 'oldname', new_name: 'newname' },
      timestamp: '2026-01-30T12:01:00.000Z',
    };

    projector.apply(event, db);

    const oldRow = db.prepare('SELECT * FROM projects WHERE name = ?').get('oldname');
    expect(oldRow).toBeUndefined();

    const newRow = db.prepare('SELECT * FROM projects WHERE name = ?').get('newname') as any;
    expect(newRow).toBeDefined();
    expect(newRow.name).toBe('newname');
  });

  it('should handle ProjectDeleted event', () => {
    db.prepare(
      'INSERT INTO projects (name, description, is_protected, created_at, last_event_id) VALUES (?, ?, ?, ?, ?)'
    ).run('myproject', null, 0, '2026-01-30T12:00:00.000Z', 1);

    const event: PersistedEventEnvelope = {
      rowid: 2,
      event_id: 'evt-2',
      task_id: PROJECT_EVENT_TASK_ID,
      type: EventType.ProjectDeleted,
      data: { name: 'myproject', task_count: 0, archived_task_count: 0 },
      timestamp: '2026-01-30T12:01:00.000Z',
    };

    projector.apply(event, db);

    const row = db.prepare('SELECT * FROM projects WHERE name = ?').get('myproject');
    expect(row).toBeUndefined();
  });

  it('should reset projection', () => {
    db.prepare(
      'INSERT INTO projects (name, description, is_protected, created_at, last_event_id) VALUES (?, ?, ?, ?, ?)'
    ).run('myproject', null, 0, '2026-01-30T12:00:00.000Z', 1);

    projector.reset(db);

    const count = db.prepare('SELECT COUNT(*) as count FROM projects').get() as {
      count: number;
    };
    expect(count.count).toBe(0);
  });
});
