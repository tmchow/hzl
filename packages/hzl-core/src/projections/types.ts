// packages/hzl-core/src/projections/types.ts
import type Database from 'libsql';
import type { PersistedEventEnvelope } from '../events/store.js';

export interface Projector {
  name: string;
  apply(event: PersistedEventEnvelope, db: Database.Database): void;
  reset?(db: Database.Database): void;
}

export interface ProjectionState {
  name: string;
  last_event_id: number;
  updated_at: string;
}
