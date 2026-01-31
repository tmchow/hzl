import { describe, it, expect } from 'vitest';
import { EventType, validateEventData } from './types.js';

describe('Project event types', () => {
  it('should have ProjectCreated event type', () => {
    expect(EventType.ProjectCreated).toBe('project_created');
  });

  it('should have ProjectRenamed event type', () => {
    expect(EventType.ProjectRenamed).toBe('project_renamed');
  });

  it('should have ProjectDeleted event type', () => {
    expect(EventType.ProjectDeleted).toBe('project_deleted');
  });

  it('should validate ProjectCreated data', () => {
    expect(() =>
      validateEventData(EventType.ProjectCreated, {
        name: 'myproject',
        description: 'A test project',
      })
    ).not.toThrow();
  });

  it('should validate ProjectCreated with is_protected', () => {
    expect(() =>
      validateEventData(EventType.ProjectCreated, {
        name: 'inbox',
        is_protected: true,
      })
    ).not.toThrow();
  });

  it('should validate ProjectRenamed data', () => {
    expect(() =>
      validateEventData(EventType.ProjectRenamed, {
        old_name: 'oldproject',
        new_name: 'newproject',
      })
    ).not.toThrow();
  });

  it('should validate ProjectDeleted data', () => {
    expect(() =>
      validateEventData(EventType.ProjectDeleted, {
        name: 'myproject',
        task_count: 5,
        archived_task_count: 2,
      })
    ).not.toThrow();
  });

  it('should reject ProjectCreated without name', () => {
    expect(() => validateEventData(EventType.ProjectCreated, {})).toThrow();
  });

  it('should reject ProjectRenamed without old_name', () => {
    expect(() =>
      validateEventData(EventType.ProjectRenamed, { new_name: 'foo' })
    ).toThrow();
  });
});
