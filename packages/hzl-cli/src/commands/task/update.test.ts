// packages/hzl-cli/src/commands/update.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runUpdate } from './update.js';
import { EventType } from 'hzl-core/events/types.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';

describe('runUpdate', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-update-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('throws for non-existent task', () => {
    expect(() => runUpdate({
      services,
      taskId: 'nonexistent',
      updates: { title: 'New title' },
      json: false,
    })).toThrow(/not found/);
  });

  it('updates task title', () => {
    const task = services.taskService.createTask({ title: 'Old title', project: 'inbox' });

    const result = runUpdate({
      services,
      taskId: task.task_id,
      updates: { title: 'New title' },
      json: false,
    });

    expect(result.title).toBe('New title');
    
    // Verify in database
    const updated = services.taskService.getTaskById(task.task_id);
    expect(updated?.title).toBe('New title');
  });

  it('updates priority', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox', priority: 0 });

    const result = runUpdate({
      services,
      taskId: task.task_id,
      updates: { priority: 3 },
      json: false,
    });

    expect(result.priority).toBe(3);
  });

  it('updates description', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });

    const result = runUpdate({
      services,
      taskId: task.task_id,
      updates: { description: 'New description' },
      json: false,
    });

    expect(result.description).toBe('New description');
  });

  it('records author on task_updated events', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });

    runUpdate({
      services,
      taskId: task.task_id,
      updates: { title: 'Updated title' },
      author: 'clara',
      json: false,
    });

    const events = services.eventStore.getByTaskId(task.task_id);
    const updateEvent = events.find((e) => e.type === EventType.TaskUpdated);
    expect(updateEvent?.author).toBe('clara');
  });

  it('updates links', () => {
    const task = services.taskService.createTask({
      title: 'Test',
      project: 'inbox',
      links: ['old-link.md'],
    });

    const result = runUpdate({
      services,
      taskId: task.task_id,
      updates: { links: ['new-link.md', 'https://example.com'] },
      json: false,
    });

    expect(result.links).toEqual(['new-link.md', 'https://example.com']);

    // Verify in database
    const updated = services.taskService.getTaskById(task.task_id);
    expect(updated?.links).toEqual(['new-link.md', 'https://example.com']);
  });

  it('clears links when set to empty array', () => {
    const task = services.taskService.createTask({
      title: 'Test',
      project: 'inbox',
      links: ['some-link.md'],
    });

    const result = runUpdate({
      services,
      taskId: task.task_id,
      updates: { links: [] },
      json: false,
    });

    expect(result.links).toEqual([]);
  });

  it('clears description when set to null', () => {
    const task = services.taskService.createTask({
      title: 'Test',
      project: 'inbox',
      description: 'Some description',
    });

    const result = runUpdate({
      services,
      taskId: task.task_id,
      updates: { description: null },
      json: false,
    });

    expect(result.description).toBeNull();
  });

  it('clears tags when set to empty array', () => {
    const task = services.taskService.createTask({
      title: 'Test',
      project: 'inbox',
      tags: ['old-tag'],
    });

    const result = runUpdate({
      services,
      taskId: task.task_id,
      updates: { tags: [] },
      json: false,
    });

    expect(result.tags).toEqual([]);
  });

  it('sets parent on task', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    const child = services.taskService.createTask({ title: 'Child', project: 'myproject' });

    runUpdate({
      services,
      taskId: child.task_id,
      updates: { parent_id: parent.task_id },
      json: false,
    });

    const updated = services.taskService.getTaskById(child.task_id);
    expect(updated?.parent_id).toBe(parent.task_id);
  });

  it('moves task to parent project when setting parent', () => {
    services.projectService.createProject('project-a');
    services.projectService.createProject('project-b');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'project-a' });
    const child = services.taskService.createTask({ title: 'Child', project: 'project-b' });

    runUpdate({
      services,
      taskId: child.task_id,
      updates: { parent_id: parent.task_id },
      json: false,
    });

    const updated = services.taskService.getTaskById(child.task_id);
    expect(updated?.parent_id).toBe(parent.task_id);
    expect(updated?.project).toBe('project-a');
  });

  it('removes parent when set to null', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    const child = services.taskService.createTask({
      title: 'Child',
      project: 'myproject',
      parent_id: parent.task_id,
    });

    runUpdate({
      services,
      taskId: child.task_id,
      updates: { parent_id: null },
      json: false,
    });

    const updated = services.taskService.getTaskById(child.task_id);
    expect(updated?.parent_id).toBeNull();
    expect(updated?.project).toBe('myproject'); // stays in same project
  });

  it('errors when parent does not exist', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });

    expect(() => runUpdate({
      services,
      taskId: task.task_id,
      updates: { parent_id: 'nonexistent' },
      json: false,
    })).toThrow(/parent.*not found/i);
  });

  it('errors when setting self as parent', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });

    expect(() => runUpdate({
      services,
      taskId: task.task_id,
      updates: { parent_id: task.task_id },
      json: false,
    })).toThrow(/cannot be its own parent/i);
  });

  it('errors when parent already has a parent (max 1 level)', () => {
    services.projectService.createProject('myproject');
    const grandparent = services.taskService.createTask({ title: 'Grandparent', project: 'myproject' });
    const parent = services.taskService.createTask({
      title: 'Parent',
      project: 'myproject',
      parent_id: grandparent.task_id
    });
    const task = services.taskService.createTask({ title: 'Task', project: 'myproject' });

    expect(() => runUpdate({
      services,
      taskId: task.task_id,
      updates: { parent_id: parent.task_id },
      json: false,
    })).toThrow(/max.*level|subtask of a subtask/i);
  });

  it('errors when task has children (cannot make parent into subtask)', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    services.taskService.createTask({
      title: 'Child',
      project: 'myproject',
      parent_id: parent.task_id
    });
    const newParent = services.taskService.createTask({ title: 'New Parent', project: 'myproject' });

    expect(() => runUpdate({
      services,
      taskId: parent.task_id,
      updates: { parent_id: newParent.task_id },
      json: false,
    })).toThrow(/has children|cannot make.*parent.*into.*subtask/i);
  });
});
