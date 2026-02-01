import { describe, it, expect } from 'vitest';
import * as hzlCore from './index.js';

describe('hzl-core public API', () => {
  describe('database exports', () => {
    it('exports withWriteTransaction', () => {
      expect(hzlCore.withWriteTransaction).toBeDefined();
      expect(typeof hzlCore.withWriteTransaction).toBe('function');
    });

    it('exports createDatastore', () => {
      expect(hzlCore.createDatastore).toBeDefined();
      expect(typeof hzlCore.createDatastore).toBe('function');
    });

    it('exports runMigrationsWithRollback', () => {
      expect(hzlCore.runMigrationsWithRollback).toBeDefined();
      expect(typeof hzlCore.runMigrationsWithRollback).toBe('function');
    });

    it('exports MigrationError', () => {
      expect(hzlCore.MigrationError).toBeDefined();
    });

    it('exports DatabaseLock', () => {
      expect(hzlCore.DatabaseLock).toBeDefined();
    });
  });

  describe('event exports', () => {
    it('exports EventStore class', () => {
      expect(hzlCore.EventStore).toBeDefined();
    });

    it('exports EventType enum', () => {
      expect(hzlCore.EventType).toBeDefined();
      expect(hzlCore.EventType.TaskCreated).toBe('task_created');
    });

    it('exports TaskStatus enum', () => {
      expect(hzlCore.TaskStatus).toBeDefined();
      expect(hzlCore.TaskStatus.Ready).toBe('ready');
    });

    it('exports validateEventData', () => {
      expect(hzlCore.validateEventData).toBeDefined();
      expect(typeof hzlCore.validateEventData).toBe('function');
    });
  });

  describe('projection exports', () => {
    it('exports ProjectionEngine class', () => {
      expect(hzlCore.ProjectionEngine).toBeDefined();
    });

    it('exports all projector classes', () => {
      expect(hzlCore.TasksCurrentProjector).toBeDefined();
      expect(hzlCore.DependenciesProjector).toBeDefined();
      expect(hzlCore.TagsProjector).toBeDefined();
      expect(hzlCore.SearchProjector).toBeDefined();
      expect(hzlCore.CommentsCheckpointsProjector).toBeDefined();
    });

    it('exports rebuildAllProjections', () => {
      expect(hzlCore.rebuildAllProjections).toBeDefined();
      expect(typeof hzlCore.rebuildAllProjections).toBe('function');
    });
  });

  describe('service exports', () => {
    it('exports TaskService class', () => {
      expect(hzlCore.TaskService).toBeDefined();
    });

    it('exports ValidationService class', () => {
      expect(hzlCore.ValidationService).toBeDefined();
    });

    it('exports SearchService class', () => {
      expect(hzlCore.SearchService).toBeDefined();
    });

    it('exports BackupService class', () => {
      expect(hzlCore.BackupService).toBeDefined();
    });

    it('exports error classes', () => {
      expect(hzlCore.TaskNotFoundError).toBeDefined();
      expect(hzlCore.TaskNotClaimableError).toBeDefined();
      expect(hzlCore.DependenciesNotDoneError).toBeDefined();
    });
  });

  describe('utility exports', () => {
    it('exports generateId', () => {
      expect(hzlCore.generateId).toBeDefined();
      expect(typeof hzlCore.generateId).toBe('function');
    });

    it('exports isValidId', () => {
      expect(hzlCore.isValidId).toBeDefined();
      expect(typeof hzlCore.isValidId).toBe('function');
    });
  });

  describe('fixture exports', () => {
    it('exports SAMPLE_TASKS', () => {
      expect(hzlCore.SAMPLE_TASKS).toBeDefined();
      expect(Array.isArray(hzlCore.SAMPLE_TASKS)).toBe(true);
    });

    it('exports SAMPLE_PROJECT_NAME', () => {
      expect(hzlCore.SAMPLE_PROJECT_NAME).toBeDefined();
      expect(typeof hzlCore.SAMPLE_PROJECT_NAME).toBe('string');
    });
  });

  describe('type exports', () => {
    it('module has expected export count', () => {
      const exportKeys = Object.keys(hzlCore);
      expect(exportKeys.length).toBeGreaterThan(15);
      expect(exportKeys.length).toBeLessThan(100);
    });
  });
});
