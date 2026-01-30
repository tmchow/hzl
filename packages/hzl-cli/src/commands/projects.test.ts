// packages/hzl-cli/src/commands/projects.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runProjects } from './projects.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { TaskStatus, EventType } from 'hzl-core/events/types.js';

describe('runProjects', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-projects-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty list when no tasks exist', () => {
    const result = runProjects({ services, json: false });
    expect(result.projects).toHaveLength(0);
  });

  it('lists projects with task counts', () => {
    // Create some tasks in different projects
    services.taskService.createTask({ title: 'Task 1', project: 'project-a' });
    services.taskService.createTask({ title: 'Task 2', project: 'project-a' });
    services.taskService.createTask({ title: 'Task 3', project: 'project-b' });

    const result = runProjects({ services, json: false });
    expect(result.projects).toHaveLength(2);
    
    const projectA = result.projects.find(p => p.name === 'project-a');
    const projectB = result.projects.find(p => p.name === 'project-b');
    
    expect(projectA?.task_count).toBe(2);
    expect(projectB?.task_count).toBe(1);
  });

  it('excludes archived tasks from count', () => {
    const task = services.taskService.createTask({ title: 'Task 1', project: 'test-project' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.setStatus(task.task_id, TaskStatus.Done);
    services.taskService.setStatus(task.task_id, TaskStatus.Archived);

    const result = runProjects({ services, json: false });
    expect(result.projects).toHaveLength(0);
  });
});
