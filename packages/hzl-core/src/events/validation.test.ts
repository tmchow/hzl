import { describe, it, expect } from 'vitest';
import { validateEventData, EventType, TaskStatus } from './types.js';

describe('event validation', () => {
  describe('task_created', () => {
    it('accepts valid data', () => {
      const data = { title: 'Test task', project: 'inbox' };
      expect(() => validateEventData(EventType.TaskCreated, data)).not.toThrow();
    });

    it('accepts valid data with all optional fields', () => {
      const data = {
        title: 'Test task',
        project: 'inbox',
        description: 'A description',
        links: ['docs/spec.md', 'https://example.com'],
        depends_on: ['TASK1', 'TASK2'],
        tags: ['urgent', 'backend'],
        priority: 2,
        due_at: '2026-02-01T00:00:00Z',
        metadata: { custom: 'value' },
      };
      expect(() => validateEventData(EventType.TaskCreated, data)).not.toThrow();
    });

    it('rejects missing title', () => {
      const data = { project: 'inbox' };
      expect(() => validateEventData(EventType.TaskCreated, data)).toThrow();
    });

    it('rejects invalid priority', () => {
      const data = { title: 'Test', project: 'inbox', priority: 5 };
      expect(() => validateEventData(EventType.TaskCreated, data)).toThrow();
    });

    it('rejects empty tags', () => {
      const data = { title: 'Test', project: 'inbox', tags: ['valid', ''] };
      expect(() => validateEventData(EventType.TaskCreated, data)).toThrow();
    });
  });

  describe('status_changed', () => {
    it('accepts valid transition', () => {
      const data = { from: TaskStatus.Ready, to: TaskStatus.InProgress };
      expect(() => validateEventData(EventType.StatusChanged, data)).not.toThrow();
    });

    it('accepts transition with lease_until', () => {
      const data = {
        from: TaskStatus.Ready,
        to: TaskStatus.InProgress,
        lease_until: '2026-01-30T12:00:00Z',
      };
      expect(() => validateEventData(EventType.StatusChanged, data)).not.toThrow();
    });

    it('rejects invalid status', () => {
      const data = { from: 'ready', to: 'invalid_status' };
      expect(() => validateEventData(EventType.StatusChanged, data)).toThrow();
    });

    it('rejects invalid lease_until format', () => {
      const data = {
        from: TaskStatus.Ready,
        to: TaskStatus.InProgress,
        lease_until: 'not-a-date',
      };
      expect(() => validateEventData(EventType.StatusChanged, data)).toThrow();
    });
  });

  describe('comment_added', () => {
    it('accepts valid comment', () => {
      const data = { text: 'This is a comment' };
      expect(() => validateEventData(EventType.CommentAdded, data)).not.toThrow();
    });

    it('rejects empty text', () => {
      const data = { text: '' };
      expect(() => validateEventData(EventType.CommentAdded, data)).toThrow();
    });
  });

  describe('checkpoint_recorded', () => {
    it('accepts valid checkpoint', () => {
      const data = { name: 'step1', data: { progress: 50 } };
      expect(() => validateEventData(EventType.CheckpointRecorded, data)).not.toThrow();
    });

    it('rejects missing name', () => {
      const data = { data: {} };
      expect(() => validateEventData(EventType.CheckpointRecorded, data)).toThrow();
    });
  });
});
