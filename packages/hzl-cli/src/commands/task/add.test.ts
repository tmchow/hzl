// packages/hzl-cli/src/commands/add.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runAdd } from './add.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';

describe('runAdd', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-add-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a task with just title', () => {
    const result = runAdd({
      services,
      project: 'inbox',
      title: 'Test task',
      json: false,
    });

    expect(result.task_id).toBeDefined();
    expect(result.title).toBe('Test task');
    expect(result.project).toBe('inbox');
  });

  it('creates a task with all options', () => {
    services.projectService.createProject('my-project');
    const result = runAdd({
      services,
      project: 'my-project',
      title: 'Full task',
      description: 'A description',
      tags: ['urgent', 'backend'],
      priority: 2,
      json: false,
    });

    expect(result.project).toBe('my-project');
    expect(result.priority).toBe(2);
  });

  it('creates a task with dependencies', () => {
    const dep = runAdd({ services, project: 'inbox', title: 'Dependency', json: false });
    const result = runAdd({
      services,
      project: 'inbox',
      title: 'Dependent task',
      dependsOn: [dep.task_id],
      json: false,
    });

    expect(result.task_id).toBeDefined();
    // Dependent task should have the dependency recorded
    const task = services.taskService.getTaskById(result.task_id);
    expect(task).toBeDefined();
  });

  it('creates a subtask with parent', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });

    const result = runAdd({
      services,
      project: 'inbox', // ignored when parent specified
      title: 'Subtask',
      parent: parent.task_id,
      json: false,
    });

    expect(result.task_id).toBeDefined();
    const task = services.taskService.getTaskById(result.task_id);
    expect(task?.parent_id).toBe(parent.task_id);
    expect(task?.project).toBe('myproject'); // inherited from parent
  });

  it('inherits project from parent, ignoring --project', () => {
    services.projectService.createProject('myproject');
    services.projectService.createProject('other');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });

    const result = runAdd({
      services,
      project: 'other', // should be ignored
      title: 'Subtask',
      parent: parent.task_id,
      json: false,
    });

    const task = services.taskService.getTaskById(result.task_id);
    expect(task?.project).toBe('myproject'); // not 'other'
  });

  it('errors when parent does not exist', () => {
    expect(() => runAdd({
      services,
      project: 'inbox',
      title: 'Subtask',
      parent: 'nonexistent',
      json: false,
    })).toThrow(/parent.*not found/i);
  });

  it('errors when parent is archived', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    services.taskService.archiveTask(parent.task_id);

    expect(() => runAdd({
      services,
      project: 'inbox',
      title: 'Subtask',
      parent: parent.task_id,
      json: false,
    })).toThrow(/(archived.*parent|parent.*archived)/i);
  });

  it('errors when parent already has a parent (max 1 level)', () => {
    services.projectService.createProject('myproject');
    const grandparent = services.taskService.createTask({ title: 'Grandparent', project: 'myproject' });
    const parent = services.taskService.createTask({
      title: 'Parent',
      project: 'myproject',
      parent_id: grandparent.task_id
    });

    expect(() => runAdd({
      services,
      project: 'inbox',
      title: 'Grandchild',
      parent: parent.task_id,
      json: false,
    })).toThrow(/max.*level|cannot create subtask of a subtask/i);
  });
});
