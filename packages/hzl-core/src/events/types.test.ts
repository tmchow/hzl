import { describe, it, expect } from 'vitest';
import { EventType, validateEventData, FIELD_LIMITS, UPDATABLE_TASK_FIELDS } from './types.js';

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

describe('Field size limits', () => {
  describe('FIELD_LIMITS export', () => {
    it('should export FIELD_LIMITS constant', () => {
      expect(FIELD_LIMITS).toBeDefined();
      expect(FIELD_LIMITS.TITLE).toBe(128);
      expect(FIELD_LIMITS.DESCRIPTION).toBe(16384);
      expect(FIELD_LIMITS.ARRAY_MAX_ITEMS).toBe(100);
    });

    it('should export UPDATABLE_TASK_FIELDS', () => {
      expect(UPDATABLE_TASK_FIELDS).toContain('title');
      expect(UPDATABLE_TASK_FIELDS).toContain('description');
      expect(UPDATABLE_TASK_FIELDS).toContain('tags');
      expect(UPDATABLE_TASK_FIELDS).not.toContain('status');
    });
  });

  describe('TaskCreated field limits', () => {
    const validTask = { title: 'Test', project: 'inbox' };

    it('should accept title at exactly max length', () => {
      expect(() =>
        validateEventData(EventType.TaskCreated, {
          ...validTask,
          title: 'a'.repeat(FIELD_LIMITS.TITLE),
        })
      ).not.toThrow();
    });

    it('should reject title exceeding max length', () => {
      expect(() =>
        validateEventData(EventType.TaskCreated, {
          ...validTask,
          title: 'a'.repeat(FIELD_LIMITS.TITLE + 1),
        })
      ).toThrow();
    });

    it('should accept description at exactly max length', () => {
      expect(() =>
        validateEventData(EventType.TaskCreated, {
          ...validTask,
          description: 'a'.repeat(FIELD_LIMITS.DESCRIPTION),
        })
      ).not.toThrow();
    });

    it('should reject description exceeding max length', () => {
      expect(() =>
        validateEventData(EventType.TaskCreated, {
          ...validTask,
          description: 'a'.repeat(FIELD_LIMITS.DESCRIPTION + 1),
        })
      ).toThrow();
    });

    it('should accept tags array at exactly max items', () => {
      const tags = Array(FIELD_LIMITS.ARRAY_MAX_ITEMS).fill('tag');
      expect(() =>
        validateEventData(EventType.TaskCreated, { ...validTask, tags })
      ).not.toThrow();
    });

    it('should reject tags array exceeding max items', () => {
      const tags = Array(FIELD_LIMITS.ARRAY_MAX_ITEMS + 1).fill('tag');
      expect(() =>
        validateEventData(EventType.TaskCreated, { ...validTask, tags })
      ).toThrow();
    });

    it('should reject individual tag exceeding max length', () => {
      expect(() =>
        validateEventData(EventType.TaskCreated, {
          ...validTask,
          tags: ['a'.repeat(FIELD_LIMITS.TAG + 1)],
        })
      ).toThrow();
    });

    it('should accept links array at exactly max items', () => {
      const links = Array(FIELD_LIMITS.ARRAY_MAX_ITEMS).fill('https://example.com');
      expect(() =>
        validateEventData(EventType.TaskCreated, { ...validTask, links })
      ).not.toThrow();
    });

    it('should reject links array exceeding max items', () => {
      const links = Array(FIELD_LIMITS.ARRAY_MAX_ITEMS + 1).fill('https://example.com');
      expect(() =>
        validateEventData(EventType.TaskCreated, { ...validTask, links })
      ).toThrow();
    });

    it('should reject individual link exceeding max length', () => {
      expect(() =>
        validateEventData(EventType.TaskCreated, {
          ...validTask,
          links: ['a'.repeat(FIELD_LIMITS.LINK + 1)],
        })
      ).toThrow();
    });

    it('should accept depends_on array at exactly max items', () => {
      const depends_on = Array(FIELD_LIMITS.ARRAY_MAX_ITEMS).fill('task_123');
      expect(() =>
        validateEventData(EventType.TaskCreated, { ...validTask, depends_on })
      ).not.toThrow();
    });

    it('should reject depends_on array exceeding max items', () => {
      const depends_on = Array(FIELD_LIMITS.ARRAY_MAX_ITEMS + 1).fill('task_123');
      expect(() =>
        validateEventData(EventType.TaskCreated, { ...validTask, depends_on })
      ).toThrow();
    });
  });

  describe('Priority validation', () => {
    const validTask = { title: 'Test', project: 'inbox' };

    it('should accept priority at lower boundary (0)', () => {
      expect(() =>
        validateEventData(EventType.TaskCreated, { ...validTask, priority: 0 })
      ).not.toThrow();
    });

    it('should accept priority at upper boundary (3)', () => {
      expect(() =>
        validateEventData(EventType.TaskCreated, { ...validTask, priority: 3 })
      ).not.toThrow();
    });

    it('should reject priority below lower boundary', () => {
      expect(() =>
        validateEventData(EventType.TaskCreated, { ...validTask, priority: -1 })
      ).toThrow();
    });

    it('should reject priority above upper boundary', () => {
      expect(() =>
        validateEventData(EventType.TaskCreated, { ...validTask, priority: 4 })
      ).toThrow();
    });

    it('should reject non-integer priority', () => {
      expect(() =>
        validateEventData(EventType.TaskCreated, { ...validTask, priority: 1.5 })
      ).toThrow();
    });
  });

  describe('Metadata limits', () => {
    const validTask = { title: 'Test', project: 'inbox' };

    it('should accept metadata at exactly max keys', () => {
      const metadata: Record<string, string> = {};
      for (let i = 0; i < FIELD_LIMITS.METADATA_MAX_KEYS; i++) {
        metadata[`key${i}`] = 'value';
      }
      expect(() =>
        validateEventData(EventType.TaskCreated, { ...validTask, metadata })
      ).not.toThrow();
    });

    it('should reject metadata exceeding max keys', () => {
      const metadata: Record<string, string> = {};
      for (let i = 0; i < FIELD_LIMITS.METADATA_MAX_KEYS + 1; i++) {
        metadata[`key${i}`] = 'value';
      }
      expect(() =>
        validateEventData(EventType.TaskCreated, { ...validTask, metadata })
      ).toThrow();
    });

    it('should reject metadata exceeding max bytes', () => {
      const metadata = {
        largeValue: 'x'.repeat(FIELD_LIMITS.METADATA_MAX_BYTES),
      };
      expect(() =>
        validateEventData(EventType.TaskCreated, { ...validTask, metadata })
      ).toThrow();
    });
  });

  describe('Checkpoint data limits', () => {
    it('should reject checkpoint data exceeding max bytes', () => {
      expect(() =>
        validateEventData(EventType.CheckpointRecorded, {
          name: 'checkpoint',
          data: { largeValue: 'x'.repeat(FIELD_LIMITS.CHECKPOINT_DATA_MAX_BYTES) },
        })
      ).toThrow();
    });

    it('should accept checkpoint data within limits', () => {
      expect(() =>
        validateEventData(EventType.CheckpointRecorded, {
          name: 'checkpoint',
          data: { value: 'small data' },
        })
      ).not.toThrow();
    });
  });
});

describe('TaskUpdated schema', () => {
  it('should accept valid field updates', () => {
    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'title',
        old_value: 'Old title',
        new_value: 'New title',
      })
    ).not.toThrow();
  });

  it('should reject unknown field names', () => {
    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'unknown_field',
        new_value: 'value',
      })
    ).toThrow();
  });

  it('should reject field names not in whitelist', () => {
    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'status',
        new_value: 'done',
      })
    ).toThrow();
  });

  it('should validate new_value based on field type', () => {
    // Title must be string
    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'title',
        new_value: 123,
      })
    ).toThrow();

    // Priority must be number
    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'priority',
        new_value: 'high',
      })
    ).toThrow();

    // Tags must be array
    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'tags',
        new_value: 'not-an-array',
      })
    ).toThrow();
  });

  it('should enforce field-specific limits on new_value', () => {
    // Title exceeds limit
    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'title',
        new_value: 'a'.repeat(FIELD_LIMITS.TITLE + 1),
      })
    ).toThrow();

    // Description exceeds limit
    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'description',
        new_value: 'a'.repeat(FIELD_LIMITS.DESCRIPTION + 1),
      })
    ).toThrow();
  });

  it('should allow nullable fields to be set to null', () => {
    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'description',
        old_value: 'old desc',
        new_value: null,
      })
    ).not.toThrow();

    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'due_at',
        new_value: null,
      })
    ).not.toThrow();
  });

  it('should validate links update', () => {
    // Valid links array
    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'links',
        new_value: ['https://example.com', 'https://test.com'],
      })
    ).not.toThrow();

    // Invalid: not an array
    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'links',
        new_value: 'https://example.com',
      })
    ).toThrow();

    // Invalid: link too long
    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'links',
        new_value: ['a'.repeat(FIELD_LIMITS.LINK + 1)],
      })
    ).toThrow();
  });

  it('should validate metadata update', () => {
    // Valid metadata
    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'metadata',
        new_value: { key: 'value', count: 42 },
      })
    ).not.toThrow();

    // Invalid: too many keys
    const tooManyKeys: Record<string, string> = {};
    for (let i = 0; i < FIELD_LIMITS.METADATA_MAX_KEYS + 1; i++) {
      tooManyKeys[`key${i}`] = 'value';
    }
    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'metadata',
        new_value: tooManyKeys,
      })
    ).toThrow();
  });

  it('should validate parent_id update', () => {
    // Valid parent_id
    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'parent_id',
        new_value: 'task_abc123',
      })
    ).not.toThrow();

    // Valid: null to remove parent
    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'parent_id',
        new_value: null,
      })
    ).not.toThrow();

    // Invalid: empty string
    expect(() =>
      validateEventData(EventType.TaskUpdated, {
        field: 'parent_id',
        new_value: '',
      })
    ).toThrow();
  });
});
