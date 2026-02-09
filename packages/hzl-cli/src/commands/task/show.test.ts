// packages/hzl-cli/src/commands/show.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runShow } from './show.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { CLIError, ExitCode } from '../../errors.js';

describe('runShow', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-show-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('throws CLIError for non-existent task', () => {
    expect(() => runShow({ services, taskId: 'nonexistent', json: false })).toThrow(CLIError);
    try {
      runShow({ services, taskId: 'nonexistent', json: false });
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
      expect((e as CLIError).exitCode).toBe(ExitCode.NotFound);
      expect((e as CLIError).message).toBe('Task not found: nonexistent');
    }
  });

  it('returns task details', () => {
    services.projectService.createProject('test-project');
    const task = services.taskService.createTask({
      title: 'Test task',
      project: 'test-project',
      description: 'A description',
      tags: ['urgent'],
      priority: 2,
    });

    const result = runShow({ services, taskId: task.task_id, json: false });
    expect(result).not.toBeNull();
    expect(result!.task.title).toBe('Test task');
    expect(result!.task.description).toBe('A description');
    expect(result!.task.priority).toBe(2);
  });

  it('includes comments and checkpoints', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.addComment(task.task_id, 'A comment', { author: 'test-user' });
    services.taskService.addCheckpoint(task.task_id, 'checkpoint-1', { data: 'value' });

    const result = runShow({ services, taskId: task.task_id, json: false });
    expect(result!.comments).toHaveLength(1);
    expect(result!.comments[0].text).toBe('A comment');
    expect(result!.checkpoints).toHaveLength(1);
    expect(result!.checkpoints[0].name).toBe('checkpoint-1');
  });

  it('shows parent task info', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    const child = services.taskService.createTask({
      title: 'Child',
      project: 'myproject',
      parent_id: parent.task_id,
    });

    const result = runShow({ services, taskId: child.task_id, json: false });
    expect(result.task.parent_id).toBe(parent.task_id);
  });

  it('includes subtasks in output', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    services.taskService.createTask({ title: 'Child 1', project: 'myproject', parent_id: parent.task_id });
    services.taskService.createTask({ title: 'Child 2', project: 'myproject', parent_id: parent.task_id });

    const result = runShow({ services, taskId: parent.task_id, json: false });
    expect(result.subtasks).toHaveLength(2);
    expect(result.subtasks?.map(s => s.title).sort()).toEqual(['Child 1', 'Child 2']);
  });

  it('excludes subtasks with --no-subtasks', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    services.taskService.createTask({ title: 'Child', project: 'myproject', parent_id: parent.task_id });

    const result = runShow({ services, taskId: parent.task_id, showSubtasks: false, json: false });
    expect(result.subtasks).toBeUndefined();
  });

  describe('backfilled parent fields', () => {
    it('includes links field (empty array for no links)', () => {
      const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
      const result = runShow({ services, taskId: task.task_id, json: false });
      expect(result.task.links).toEqual([]);
    });

    it('includes links field with values when set', () => {
      const task = services.taskService.createTask({
        title: 'Test',
        project: 'inbox',
        links: ['docs/spec.md', 'https://example.com'],
      });
      const result = runShow({ services, taskId: task.task_id, json: false });
      expect(result.task.links).toEqual(['docs/spec.md', 'https://example.com']);
    });

    it('includes metadata field (empty object for no metadata)', () => {
      const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
      const result = runShow({ services, taskId: task.task_id, json: false });
      expect(result.task.metadata).toEqual({});
    });

    it('includes due_at field (null when not set)', () => {
      const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
      const result = runShow({ services, taskId: task.task_id, json: false });
      expect(result.task.due_at).toBeNull();
    });

    it('includes claimed_at and lease_until fields (null when not set)', () => {
      const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
      const result = runShow({ services, taskId: task.task_id, json: false });
      expect(result.task.claimed_at).toBeNull();
      expect(result.task.lease_until).toBeNull();
    });
  });
});
