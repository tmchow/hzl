// packages/hzl-cli/src/commands/show.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runShow } from './show.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { CLIError, ExitCode } from '../../errors.js';
import { TaskStatus } from 'hzl-core/events/types.js';
import type { Task } from 'hzl-core/services/task-service.js';
import type { DeepSubtask } from './show.js';

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
    const fullTask = result!.task as Task;
    expect(fullTask.title).toBe('Test task');
    expect(fullTask.description).toBe('A description');
    expect(fullTask.priority).toBe(2);
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
    it('includes default values for all Task fields', () => {
      const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
      const result = runShow({ services, taskId: task.task_id, json: false });
      const fullTask = result.task as Task;
      expect(fullTask.links).toEqual([]);
      expect(fullTask.metadata).toEqual({});
      expect(fullTask.due_at).toBeNull();
      expect(fullTask.claimed_at).toBeNull();
      expect(fullTask.lease_until).toBeNull();
    });

    it('includes links field with values when set', () => {
      const task = services.taskService.createTask({
        title: 'Test',
        project: 'inbox',
        links: ['docs/spec.md', 'https://example.com'],
      });
      const result = runShow({ services, taskId: task.task_id, json: false });
      const fullTask = result.task as Task;
      expect(fullTask.links).toEqual(['docs/spec.md', 'https://example.com']);
    });
  });

  describe('--view', () => {
    it('summary view returns minimal task fields and omits comments/checkpoints', () => {
      const task = services.taskService.createTask({
        title: 'Test',
        project: 'inbox',
        description: 'Full description',
        tags: ['urgent'],
      });
      services.taskService.addComment(task.task_id, 'A comment');

      const result = runShow({ services, taskId: task.task_id, view: 'summary', json: false });
      expect(result.task).toHaveProperty('task_id');
      expect(result.task).toHaveProperty('title');
      expect(result.task).toHaveProperty('status');
      expect(result.task).toHaveProperty('project');
      expect(result.task).toHaveProperty('priority');
      expect(result.task).toHaveProperty('parent_id');
      expect(result.task).toHaveProperty('agent');
      expect(result.task).not.toHaveProperty('description');
      expect(result.task).not.toHaveProperty('links');
      expect(result.task).not.toHaveProperty('metadata');
      expect(result.comments).toEqual([]);
      expect(result.checkpoints).toEqual([]);
    });

    it('standard view includes due_at and tags but omits description/links/metadata', () => {
      const task = services.taskService.createTask({
        title: 'Test',
        project: 'inbox',
        description: 'Full description',
        tags: ['urgent'],
      });

      const result = runShow({ services, taskId: task.task_id, view: 'standard', json: false });
      expect(result.task).toHaveProperty('tags');
      expect(result.task).toHaveProperty('due_at');
      expect(result.task).not.toHaveProperty('description');
      expect(result.task).not.toHaveProperty('links');
      expect(result.task).not.toHaveProperty('metadata');
      expect(result).toHaveProperty('comments');
      expect(result).toHaveProperty('checkpoints');
    });

    it('full view returns everything (default behavior)', () => {
      const task = services.taskService.createTask({
        title: 'Test',
        project: 'inbox',
        description: 'Full description',
      });

      const result = runShow({ services, taskId: task.task_id, view: 'full', json: false });
      expect(result.task).toHaveProperty('description');
      expect(result.task).toHaveProperty('links');
      expect(result.task).toHaveProperty('metadata');
      expect(result).toHaveProperty('comments');
      expect(result).toHaveProperty('checkpoints');
    });

    it('defaults to full view when --view not specified', () => {
      const task = services.taskService.createTask({ title: 'Test', project: 'inbox', description: 'desc' });
      const result = runShow({ services, taskId: task.task_id, json: false });
      expect(result.task).toHaveProperty('description');
    });
  });

  describe('--deep flag', () => {
    it('returns full Task fields plus blocked_by for subtasks', () => {
      services.projectService.createProject('myproject');
      const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
      services.taskService.createTask({ title: 'Child 1', project: 'myproject', parent_id: parent.task_id });

      const result = runShow({ services, taskId: parent.task_id, deep: true, json: false });
      expect(result.subtasks).toHaveLength(1);
      const sub = result.subtasks![0] as DeepSubtask;
      expect(sub.title).toBe('Child 1');
      expect(sub.blocked_by).toEqual([]);
      // Verify full Task field values
      expect(sub.project).toBe('myproject');
      expect(sub.tags).toEqual([]);
      expect(sub.priority).toBe(0);
      expect(sub.links).toEqual([]);
      expect(sub.metadata).toEqual({});
      expect(sub.created_at).toBeDefined();
    });

    it('includes blocked_by with incomplete dependency', () => {
      services.projectService.createProject('myproject');
      const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
      const dep = services.taskService.createTask({ title: 'Dep', project: 'myproject', parent_id: parent.task_id });
      const child = services.taskService.createTask({
        title: 'Child',
        project: 'myproject',
        parent_id: parent.task_id,
        depends_on: [dep.task_id],
      });

      const result = runShow({ services, taskId: parent.task_id, deep: true, json: false });
      const childResult = (result.subtasks as DeepSubtask[]).find(s => s.task_id === child.task_id)!;
      expect(childResult.blocked_by).toEqual([dep.task_id]);
    });

    it('returns empty blocked_by when all deps are done', () => {
      services.projectService.createProject('myproject');
      const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
      const dep = services.taskService.createTask({ title: 'Dep', project: 'myproject', parent_id: parent.task_id });
      const child = services.taskService.createTask({
        title: 'Child',
        project: 'myproject',
        parent_id: parent.task_id,
        depends_on: [dep.task_id],
      });
      // Complete the dependency
      services.taskService.setStatus(dep.task_id, TaskStatus.Ready);
      services.taskService.claimTask(dep.task_id, { author: 'agent' });
      services.taskService.completeTask(dep.task_id);

      const result = runShow({ services, taskId: parent.task_id, deep: true, json: false });
      const childResult = (result.subtasks as DeepSubtask[]).find(s => s.task_id === child.task_id)!;
      expect(childResult.blocked_by).toEqual([]);
    });

    it('returns empty blocked_by for done subtask with incomplete deps', () => {
      services.projectService.createProject('myproject');
      const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
      const dep = services.taskService.createTask({ title: 'Dep', project: 'myproject', parent_id: parent.task_id });
      const child = services.taskService.createTask({
        title: 'Child',
        project: 'myproject',
        parent_id: parent.task_id,
        depends_on: [dep.task_id],
      });
      // Mark child as done even though dep is not (using setStatus directly)
      services.taskService.setStatus(child.task_id, TaskStatus.Done);

      const result = runShow({ services, taskId: parent.task_id, deep: true, json: false });
      const childResult = (result.subtasks as DeepSubtask[]).find(s => s.task_id === child.task_id)!;
      expect(childResult.blocked_by).toEqual([]);
    });

    it('returns empty subtasks array for task with no children', () => {
      const task = services.taskService.createTask({ title: 'Leaf', project: 'inbox' });
      const result = runShow({ services, taskId: task.task_id, deep: true, json: false });
      expect(result.subtasks).toEqual([]);
    });

    it('returns empty subtasks array for child task', () => {
      services.projectService.createProject('myproject');
      const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
      const child = services.taskService.createTask({ title: 'Child', project: 'myproject', parent_id: parent.task_id });

      const result = runShow({ services, taskId: child.task_id, deep: true, json: false });
      expect(result.subtasks).toEqual([]);
    });

    it('--no-subtasks takes precedence over --deep', () => {
      services.projectService.createProject('myproject');
      const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
      services.taskService.createTask({ title: 'Child', project: 'myproject', parent_id: parent.task_id });

      const result = runShow({ services, taskId: parent.task_id, deep: true, showSubtasks: false, json: false });
      expect(result.subtasks).toBeUndefined();
    });

    it('without --deep returns summary shape', () => {
      services.projectService.createProject('myproject');
      const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
      services.taskService.createTask({ title: 'Child', project: 'myproject', parent_id: parent.task_id });

      const result = runShow({ services, taskId: parent.task_id, json: false });
      expect(result.subtasks).toHaveLength(1);
      const sub = result.subtasks![0];
      // Summary shape: only task_id, title, status
      expect(Object.keys(sub).sort()).toEqual(['status', 'task_id', 'title']);
    });

    it('--deep without --json still returns deep data in result', () => {
      services.projectService.createProject('myproject');
      const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
      services.taskService.createTask({ title: 'Child', project: 'myproject', parent_id: parent.task_id });

      const result = runShow({ services, taskId: parent.task_id, deep: true, json: false });
      const sub = result.subtasks![0] as DeepSubtask;
      expect(sub).toHaveProperty('blocked_by');
      expect(sub).toHaveProperty('project');
    });
  });
});
