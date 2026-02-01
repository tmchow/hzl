// packages/hzl-core/src/services/validation-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import { ValidationService } from './validation-service.js';
import { createTestDb } from '../db/test-utils.js';
import { EventStore } from '../events/store.js';
import { ProjectionEngine } from '../projections/engine.js';
import { TasksCurrentProjector } from '../projections/tasks-current.js';
import { DependenciesProjector } from '../projections/dependencies.js';
import { EventType } from '../events/types.js';

describe('ValidationService', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let engine: ProjectionEngine;
  let validationService: ValidationService;

  beforeEach(() => {
    db = createTestDb();
    eventStore = new EventStore(db);
    engine = new ProjectionEngine(db);
    engine.register(new TasksCurrentProjector());
    engine.register(new DependenciesProjector());
    validationService = new ValidationService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('detectCycles', () => {
    it('returns empty array when no cycles exist', () => {
      const e1 = eventStore.append({ task_id: 'TASK_A', type: EventType.TaskCreated, data: { title: 'A', project: 'inbox' } });
      engine.applyEvent(e1);
      const e2 = eventStore.append({ task_id: 'TASK_B', type: EventType.TaskCreated, data: { title: 'B', project: 'inbox', depends_on: ['TASK_A'] } });
      engine.applyEvent(e2);

      const cycles = validationService.detectCycles();
      expect(cycles).toHaveLength(0);
    });

    it('detects simple cycle', () => {
      const e1 = eventStore.append({ task_id: 'TASK_A', type: EventType.TaskCreated, data: { title: 'A', project: 'inbox' } });
      engine.applyEvent(e1);
      const e2 = eventStore.append({ task_id: 'TASK_B', type: EventType.TaskCreated, data: { title: 'B', project: 'inbox', depends_on: ['TASK_A'] } });
      engine.applyEvent(e2);
      db.prepare('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)').run('TASK_A', 'TASK_B');

      const cycles = validationService.detectCycles();
      expect(cycles.length).toBeGreaterThan(0);
    });
  });

  describe('findMissingDeps', () => {
    it('finds missing dependency', () => {
      const e1 = eventStore.append({ task_id: 'TASK_A', type: EventType.TaskCreated, data: { title: 'A', project: 'inbox' } });
      engine.applyEvent(e1);
      db.prepare('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)').run('TASK_A', 'NONEXISTENT');

      const missing = validationService.findMissingDeps();
      expect(missing).toHaveLength(1);
      expect(missing[0].missingDepId).toBe('NONEXISTENT');
    });
  });

  describe('validate', () => {
    it('returns valid result when no issues', () => {
      const e1 = eventStore.append({ task_id: 'TASK_A', type: EventType.TaskCreated, data: { title: 'A', project: 'inbox' } });
      engine.applyEvent(e1);

      const result = validationService.validate();
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });
});
