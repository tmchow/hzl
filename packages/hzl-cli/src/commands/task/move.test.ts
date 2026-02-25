// packages/hzl-cli/src/commands/move.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runMove } from './move.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';

describe('runMove', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-move-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('throws for non-existent task', () => {
    expect(() => runMove({
      services,
      taskId: 'nonexistent',
      toProject: 'new-project',
      json: false,
    })).toThrow(/not found/);
  });

  it('moves task to new project', () => {
    services.projectService.createProject('old-project');
    services.projectService.createProject('new-project');
    const task = services.taskService.createTask({ title: 'Test', project: 'old-project' });

    const result = runMove({
      services,
      taskId: task.task_id,
      toProject: 'new-project',
      json: false,
    });

    expect(result.from_project).toBe('old-project');
    expect(result.to_project).toBe('new-project');

    // Verify in database
    const moved = services.taskService.getTaskById(task.task_id);
    expect(moved?.project).toBe('new-project');
  });

  it('returns same project when no-op', () => {
    services.projectService.createProject('same-project');
    const task = services.taskService.createTask({ title: 'Test', project: 'same-project' });

    const result = runMove({
      services,
      taskId: task.task_id,
      toProject: 'same-project',
      json: false,
    });

    expect(result.from_project).toBe('same-project');
    expect(result.to_project).toBe('same-project');
  });

  it('cascades move to subtasks', () => {
    services.projectService.createProject('project-a');
    services.projectService.createProject('project-b');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'project-a' });
    const child1 = services.taskService.createTask({
      title: 'Child 1',
      project: 'project-a',
      parent_id: parent.task_id,
    });
    const child2 = services.taskService.createTask({
      title: 'Child 2',
      project: 'project-a',
      parent_id: parent.task_id,
    });

    const result = runMove({
      services,
      taskId: parent.task_id,
      toProject: 'project-b',
      json: false,
    });

    expect(result.to_project).toBe('project-b');

    // Verify subtasks moved too
    const movedChild1 = services.taskService.getTaskById(child1.task_id);
    const movedChild2 = services.taskService.getTaskById(child2.task_id);
    expect(movedChild1?.project).toBe('project-b');
    expect(movedChild2?.project).toBe('project-b');
  });

  it('moves task with no subtasks as before', () => {
    services.projectService.createProject('old-project');
    services.projectService.createProject('new-project');
    const task = services.taskService.createTask({ title: 'Standalone', project: 'old-project' });

    const result = runMove({
      services,
      taskId: task.task_id,
      toProject: 'new-project',
      json: false,
    });

    expect(result.to_project).toBe('new-project');
    const moved = services.taskService.getTaskById(task.task_id);
    expect(moved?.project).toBe('new-project');
  });

  it('records author on move events', () => {
    services.projectService.createProject('old-project');
    services.projectService.createProject('new-project');
    const task = services.taskService.createTask({ title: 'Test', project: 'old-project' });

    runMove({
      services,
      taskId: task.task_id,
      toProject: 'new-project',
      author: 'clara',
      json: false,
    });

    const events = services.eventStore.getByTaskId(task.task_id);
    const moveEvent = events.find((e) => e.type === 'task_moved');
    expect(moveEvent?.author).toBe('clara');
  });
});
