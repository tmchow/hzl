import type Database from 'libsql';
import type { PersistedEventEnvelope } from '../events/store.js';
import type { Projector } from './types.js';
import {
  EventType,
  type ProjectCreatedData,
  type ProjectDeletedData,
  type ProjectRenamedData,
} from '../events/types.js';

export class ProjectsProjector implements Projector {
  name = 'projects';

  apply(event: PersistedEventEnvelope, db: Database.Database): void {
    switch (event.type) {
      case EventType.ProjectCreated:
        this.handleProjectCreated(event, db);
        break;
      case EventType.ProjectRenamed:
        this.handleProjectRenamed(event, db);
        break;
      case EventType.ProjectDeleted:
        this.handleProjectDeleted(event, db);
        break;
    }
  }

  reset(db: Database.Database): void {
    db.exec('DELETE FROM projects');
  }

  private handleProjectCreated(
    event: PersistedEventEnvelope,
    db: Database.Database
  ): void {
    const data = event.data as ProjectCreatedData;
    db.prepare(
      `
      INSERT OR IGNORE INTO projects (name, description, is_protected, created_at, last_event_id)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(
      data.name,
      data.description ?? null,
      data.is_protected ? 1 : 0,
      event.timestamp,
      event.rowid
    );
  }

  private handleProjectRenamed(
    event: PersistedEventEnvelope,
    db: Database.Database
  ): void {
    const data = event.data as ProjectRenamedData;

    const oldProject = db
      .prepare('SELECT * FROM projects WHERE name = ?')
      .get(data.old_name) as
      | { description: string | null; is_protected: number; created_at: string }
      | undefined;
    if (!oldProject) return;

    db.prepare('DELETE FROM projects WHERE name = ?').run(data.old_name);
    db.prepare(
      `
      INSERT INTO projects (name, description, is_protected, created_at, last_event_id)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(
      data.new_name,
      oldProject.description,
      oldProject.is_protected,
      oldProject.created_at,
      event.rowid
    );

    db.prepare('UPDATE tasks_current SET project = ? WHERE project = ?').run(
      data.new_name,
      data.old_name
    );
  }

  private handleProjectDeleted(
    event: PersistedEventEnvelope,
    db: Database.Database
  ): void {
    const data = event.data as ProjectDeletedData;
    db.prepare('DELETE FROM projects WHERE name = ?').run(data.name);
  }
}
