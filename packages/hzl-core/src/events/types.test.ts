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

  describe('project name validation', () => {
    it('should accept valid project names', () => {
      const validNames = [
        'myproject',
        'my-project',
        'my_project',
        'MyProject123',
        '123project',
        'a',
        'A',
        '1',
      ];
      for (const name of validNames) {
        expect(() =>
          validateEventData(EventType.ProjectCreated, { name })
        ).not.toThrow();
      }
    });

    it('should reject project names with leading whitespace', () => {
      expect(() =>
        validateEventData(EventType.ProjectCreated, { name: ' myproject' })
      ).toThrow();
    });

    it('should reject project names with trailing whitespace', () => {
      expect(() =>
        validateEventData(EventType.ProjectCreated, { name: 'myproject ' })
      ).toThrow();
    });

    it('should reject project names with newlines', () => {
      expect(() =>
        validateEventData(EventType.ProjectCreated, { name: 'my\nproject' })
      ).toThrow();
    });

    it('should reject project names with control characters', () => {
      expect(() =>
        validateEventData(EventType.ProjectCreated, { name: 'my\x00project' })
      ).toThrow();
    });

    it('should reject project names with path separators', () => {
      expect(() =>
        validateEventData(EventType.ProjectCreated, { name: 'my/project' })
      ).toThrow();
      expect(() =>
        validateEventData(EventType.ProjectCreated, { name: 'my\\project' })
      ).toThrow();
    });

    it('should reject project names starting with hyphen', () => {
      expect(() =>
        validateEventData(EventType.ProjectCreated, { name: '-myproject' })
      ).toThrow();
    });

    it('should reject project names starting with underscore', () => {
      expect(() =>
        validateEventData(EventType.ProjectCreated, { name: '_myproject' })
      ).toThrow();
    });

    it('should reject project names with spaces', () => {
      expect(() =>
        validateEventData(EventType.ProjectCreated, { name: 'my project' })
      ).toThrow();
    });

    it('should reject project names with special characters', () => {
      const invalidNames = ['my@project', 'my#project', 'my$project', 'my.project'];
      for (const name of invalidNames) {
        expect(() =>
          validateEventData(EventType.ProjectCreated, { name })
        ).toThrow();
      }
    });

    it('should reject project names exceeding 255 characters', () => {
      const longName = 'a'.repeat(256);
      expect(() =>
        validateEventData(EventType.ProjectCreated, { name: longName })
      ).toThrow();
    });

    it('should accept project names at exactly 255 characters', () => {
      const maxName = 'a'.repeat(255);
      expect(() =>
        validateEventData(EventType.ProjectCreated, { name: maxName })
      ).not.toThrow();
    });

    it('should apply same validation to ProjectRenamed new_name', () => {
      expect(() =>
        validateEventData(EventType.ProjectRenamed, {
          old_name: 'valid-name',
          new_name: 'invalid name with spaces',
        })
      ).toThrow();
    });

    it('should apply same validation to ProjectRenamed old_name', () => {
      expect(() =>
        validateEventData(EventType.ProjectRenamed, {
          old_name: 'invalid/path',
          new_name: 'valid-name',
        })
      ).toThrow();
    });
  });
});
