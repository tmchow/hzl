// packages/hzl-cli/src/commands/list.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runList } from './list.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runList', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-list-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty list when no tasks', () => {
    const result = runList({ services, json: false });
    expect(result.tasks).toHaveLength(0);
  });

  it('lists all tasks', () => {
    services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    services.taskService.createTask({ title: 'Task 2', project: 'inbox' });

    const result = runList({ services, json: false });
    expect(result.tasks).toHaveLength(2);
  });

  it('filters by project', () => {
    services.projectService.createProject('project-a');
    services.projectService.createProject('project-b');
    services.taskService.createTask({ title: 'Task A', project: 'project-a' });
    services.taskService.createTask({ title: 'Task B', project: 'project-b' });

    const result = runList({ services, project: 'project-a', json: false });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].project).toBe('project-a');
  });

  it('filters by status', () => {
    const task1 = services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    services.taskService.createTask({ title: 'Task 2', project: 'inbox' });
    
    services.taskService.setStatus(task1.task_id, TaskStatus.Ready);

    const result = runList({ services, status: TaskStatus.Ready, json: false });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].status).toBe(TaskStatus.Ready);
  });

  it('respects limit', () => {
    for (let i = 0; i < 10; i++) {
      services.taskService.createTask({ title: `Task ${i}`, project: 'inbox' });
    }

    const result = runList({ services, limit: 5, json: false });
    expect(result.tasks).toHaveLength(5);
  });

  it('filters by parent', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    services.taskService.createTask({ title: 'Child 1', project: 'myproject', parent_id: parent.task_id });
    services.taskService.createTask({ title: 'Child 2', project: 'myproject', parent_id: parent.task_id });
    services.taskService.createTask({ title: 'Orphan', project: 'myproject' });

    const result = runList({ services, parent: parent.task_id, json: false });
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks.every(t => t.title.startsWith('Child'))).toBe(true);
  });

  it('filters to root tasks with --root', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    services.taskService.createTask({ title: 'Child', project: 'myproject', parent_id: parent.task_id });
    services.taskService.createTask({ title: 'Standalone', project: 'myproject' });

    const result = runList({ services, rootOnly: true, json: false });
    expect(result.tasks).toHaveLength(2); // Parent and Standalone
    expect(result.tasks.every(t => t.parent_id === null)).toBe(true);
  });

  it('combines --root with --status', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    services.taskService.setStatus(parent.task_id, TaskStatus.Ready);
    services.taskService.createTask({ title: 'Standalone', project: 'myproject' }); // backlog

    const result = runList({ services, rootOnly: true, status: TaskStatus.Ready, json: false });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe('Parent');
  });

  it('includes parent_id in output', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    services.taskService.createTask({ title: 'Child', project: 'myproject', parent_id: parent.task_id });

    const result = runList({ services, json: false });
    const child = result.tasks.find(t => t.title === 'Child');
    expect(child?.parent_id).toBe(parent.task_id);
  });

  it('--available excludes parent tasks (leaf-only)', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    services.taskService.setStatus(parent.task_id, TaskStatus.Ready);
    const child = services.taskService.createTask({
      title: 'Child',
      project: 'myproject',
      parent_id: parent.task_id,
    });
    services.taskService.setStatus(child.task_id, TaskStatus.Ready);
    const standalone = services.taskService.createTask({ title: 'Standalone', project: 'myproject' });
    services.taskService.setStatus(standalone.task_id, TaskStatus.Ready);

    const result = runList({ services, availableOnly: true, json: false });
    // Parent should be excluded since it has children
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks.map(t => t.title).sort()).toEqual(['Child', 'Standalone']);
  });
});
