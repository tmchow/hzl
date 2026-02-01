// packages/hzl-core/src/projections/engine.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import { ProjectionEngine } from './engine.js';
import { Projector } from './types.js';
import { createTestDb } from '../db/test-utils.js';
import { EventStore, PersistedEventEnvelope } from '../events/store.js';
import { EventType } from '../events/types.js';

describe('ProjectionEngine', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let engine: ProjectionEngine;

  beforeEach(() => {
    db = createTestDb();
    // Schema applied by createTestDb
    eventStore = new EventStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('registers and applies projectors', () => {
    const applied: PersistedEventEnvelope[] = [];
    const testProjector: Projector = {
      name: 'test',
      apply: (event) => { applied.push(event); },
    };

    engine = new ProjectionEngine(db);
    engine.register(testProjector);

    const event = eventStore.append({
      task_id: 'TASK1',
      type: EventType.TaskCreated,
      data: { title: 'Test', project: 'inbox' },
    });

    engine.applyEvent(event);

    expect(applied).toHaveLength(1);
    expect(applied[0].event_id).toBe(event.event_id);
  });

  it('tracks projection state', () => {
    const testProjector: Projector = {
      name: 'test_state',
      apply: () => {},
    };

    engine = new ProjectionEngine(db);
    engine.register(testProjector);

    const event = eventStore.append({
      task_id: 'TASK1',
      type: EventType.TaskCreated,
      data: { title: 'Test', project: 'inbox' },
    });

    engine.applyEvent(event);
    engine.updateProjectionState('test_state', event.rowid);

    const state = engine.getProjectionState('test_state');
    expect(state?.last_event_id).toBe(event.rowid);
  });

  it('applies multiple projectors in registration order', () => {
    const order: string[] = [];
    const projector1: Projector = {
      name: 'first',
      apply: () => { order.push('first'); },
    };
    const projector2: Projector = {
      name: 'second',
      apply: () => { order.push('second'); },
    };

    engine = new ProjectionEngine(db);
    engine.register(projector1);
    engine.register(projector2);

    const event = eventStore.append({
      task_id: 'TASK1',
      type: EventType.TaskCreated,
      data: { title: 'Test', project: 'inbox' },
    });

    engine.applyEvent(event);

    expect(order).toEqual(['first', 'second']);
  });

  it('getEventsSince returns events after given id', () => {
    engine = new ProjectionEngine(db);

    const e1 = eventStore.append({
      task_id: 'TASK1',
      type: EventType.TaskCreated,
      data: { title: 'Test 1', project: 'inbox' },
    });
    const e2 = eventStore.append({
      task_id: 'TASK2',
      type: EventType.TaskCreated,
      data: { title: 'Test 2', project: 'inbox' },
    });

    const events = engine.getEventsSince(e1.rowid, 100);
    expect(events).toHaveLength(1);
    expect(events[0].event_id).toBe(e2.event_id);
  });
});
