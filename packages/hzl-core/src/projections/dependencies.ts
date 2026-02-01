// packages/hzl-core/src/projections/dependencies.ts
import type Database from 'libsql';
import type { PersistedEventEnvelope } from '../events/store.js';
import type { Projector } from './types.js';
import { EventType, type DependencyData, type TaskCreatedData } from '../events/types.js';

export class DependenciesProjector implements Projector {
  name = 'dependencies';

  apply(event: PersistedEventEnvelope, db: Database.Database): void {
    switch (event.type) {
      case EventType.TaskCreated:
        this.handleTaskCreated(event, db);
        break;
      case EventType.DependencyAdded:
        this.handleDependencyAdded(event, db);
        break;
      case EventType.DependencyRemoved:
        this.handleDependencyRemoved(event, db);
        break;
    }
  }

  reset(db: Database.Database): void {
    db.exec('DELETE FROM task_dependencies');
  }

  private handleTaskCreated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as TaskCreatedData;
    const dependsOn = data.depends_on;
    if (!dependsOn || dependsOn.length === 0) return;

    const insertStmt = db.prepare(
      'INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)'
    );
    for (const depId of dependsOn) {
      insertStmt.run(event.task_id, depId);
    }
  }

  private handleDependencyAdded(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as DependencyData;
    db.prepare(
      'INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)'
    ).run(event.task_id, data.depends_on_id);
  }

  private handleDependencyRemoved(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as DependencyData;
    db.prepare(
      'DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?'
    ).run(event.task_id, data.depends_on_id);
  }
}
