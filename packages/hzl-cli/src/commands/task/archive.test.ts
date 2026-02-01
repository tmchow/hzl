// packages/hzl-cli/src/commands/archive.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runArchive } from './archive.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runArchive', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-archive-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('archives a done task', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id);
    services.taskService.completeTask(task.task_id);

    const result = runArchive({
      services,
      taskId: task.task_id,
      json: false,
    });

    expect(result.status).toBe(TaskStatus.Archived);
  });

  it('accepts a reason', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id);
    services.taskService.completeTask(task.task_id);

    const result = runArchive({
      services,
      taskId: task.task_id,
      reason: 'project cancelled',
      json: false,
    });

    expect(result.status).toBe(TaskStatus.Archived);
  });

  it('errors when archiving parent with active subtasks without flag', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    services.taskService.createTask({
      title: 'Child',
      project: 'myproject',
      parent_id: parent.task_id
    });

    expect(() => runArchive({
      services,
      taskId: parent.task_id,
      json: false,
    })).toThrow(/active subtasks|--cascade|--orphan/i);
  });

  it('archives parent and subtasks with --cascade', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    const child = services.taskService.createTask({
      title: 'Child',
      project: 'myproject',
      parent_id: parent.task_id
    });

    runArchive({
      services,
      taskId: parent.task_id,
      cascade: true,
      json: false,
    });

    const archivedParent = services.taskService.getTaskById(parent.task_id);
    const archivedChild = services.taskService.getTaskById(child.task_id);
    expect(archivedParent?.status).toBe(TaskStatus.Archived);
    expect(archivedChild?.status).toBe(TaskStatus.Archived);
  });

  it('archives parent and promotes subtasks with --orphan', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    const child = services.taskService.createTask({
      title: 'Child',
      project: 'myproject',
      parent_id: parent.task_id
    });

    runArchive({
      services,
      taskId: parent.task_id,
      orphan: true,
      json: false,
    });

    const archivedParent = services.taskService.getTaskById(parent.task_id);
    const promotedChild = services.taskService.getTaskById(child.task_id);
    expect(archivedParent?.status).toBe(TaskStatus.Archived);
    expect(promotedChild?.status).not.toBe(TaskStatus.Archived);
    expect(promotedChild?.parent_id).toBeNull();
  });

  it('archives normally when no active subtasks', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    const child = services.taskService.createTask({
      title: 'Child',
      project: 'myproject',
      parent_id: parent.task_id
    });
    services.taskService.setStatus(child.task_id, TaskStatus.Done);

    // Should work without flags since child is done
    runArchive({
      services,
      taskId: parent.task_id,
      json: false,
    });

    const archivedParent = services.taskService.getTaskById(parent.task_id);
    expect(archivedParent?.status).toBe(TaskStatus.Archived);
  });

  it('errors when both --cascade and --orphan specified', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    services.taskService.createTask({
      title: 'Child',
      project: 'myproject',
      parent_id: parent.task_id
    });

    expect(() => runArchive({
      services,
      taskId: parent.task_id,
      cascade: true,
      orphan: true,
      json: false,
    })).toThrow(/cannot use both.*--cascade.*--orphan|only one of/i);
  });
});
