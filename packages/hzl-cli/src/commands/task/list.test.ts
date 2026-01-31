// packages/hzl-cli/src/commands/list.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runList } from './list.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runList', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-list-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
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
});
