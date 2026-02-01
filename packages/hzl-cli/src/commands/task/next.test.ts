// packages/hzl-cli/src/commands/next.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runNext } from './next.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runNext', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-next-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null when no tasks available', () => {
    const result = runNext({ services, json: false });
    expect(result).toBeNull();
  });

  it('returns next available task sorted by priority', () => {
    const low = services.taskService.createTask({ title: 'Low priority', project: 'inbox', priority: 0 });
    const high = services.taskService.createTask({ title: 'High priority', project: 'inbox', priority: 3 });
    
    services.taskService.setStatus(low.task_id, TaskStatus.Ready);
    services.taskService.setStatus(high.task_id, TaskStatus.Ready);

    const result = runNext({ services, json: false });
    expect(result?.task_id).toBe(high.task_id);
  });

  it('respects project filter', () => {
    services.projectService.createProject('project-a');
    services.projectService.createProject('project-b');
    const taskA = services.taskService.createTask({ title: 'Task A', project: 'project-a' });
    const taskB = services.taskService.createTask({ title: 'Task B', project: 'project-b' });
    
    services.taskService.setStatus(taskA.task_id, TaskStatus.Ready);
    services.taskService.setStatus(taskB.task_id, TaskStatus.Ready);

    const result = runNext({ services, project: 'project-b', json: false });
    expect(result?.task_id).toBe(taskB.task_id);
  });

  it('skips tasks with incomplete dependencies', () => {
    const dep = services.taskService.createTask({ title: 'Dependency', project: 'inbox' });
    const main = services.taskService.createTask({ title: 'Main task', project: 'inbox', depends_on: [dep.task_id] });
    
    services.taskService.setStatus(dep.task_id, TaskStatus.Ready);
    services.taskService.setStatus(main.task_id, TaskStatus.Ready);

    const result = runNext({ services, json: false });
    // Should get the dependency first since main has incomplete deps
    expect(result?.task_id).toBe(dep.task_id);
  });
});
