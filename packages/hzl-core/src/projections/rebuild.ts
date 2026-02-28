// packages/hzl-core/src/projections/rebuild.ts
import type Database from 'libsql';
import type { ProjectionEngine } from './engine.js';

const BATCH_SIZE = 1000;

export function rebuildAllProjections(
  db: Database.Database,
  engine: ProjectionEngine
): void {
  const projectors = engine.getProjectors();
  const alreadyInTransaction = db.inTransaction;

  if (!alreadyInTransaction) db.exec('BEGIN');
  try {
    for (const projector of projectors) {
      if (projector.reset) {
        projector.reset(db);
      }
    }

    db.exec('DELETE FROM projection_state');

    let lastId = 0;
    while (true) {
      const events = engine.getEventsSince(lastId, BATCH_SIZE);
      if (events.length === 0) break;

      for (const event of events) {
        engine.applyEvent(event);
        lastId = event.rowid;
      }
    }

    for (const projector of projectors) {
      if (lastId > 0) {
        engine.updateProjectionState(projector.name, lastId);
      }
    }

    if (!alreadyInTransaction) db.exec('COMMIT');
  } catch (err) {
    if (!alreadyInTransaction) db.exec('ROLLBACK');
    throw err;
  }
}
