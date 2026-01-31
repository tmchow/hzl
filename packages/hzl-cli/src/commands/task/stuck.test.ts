// packages/hzl-cli/src/commands/stuck.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runStuck } from './stuck.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runStuck', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-stuck-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty list when no stuck tasks', () => {
    const result = runStuck({ services, json: false });
    expect(result.tasks).toHaveLength(0);
  });

  it('finds tasks with expired leases', () => {
    const task = services.taskService.createTask({ title: 'Stuck task', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    // Claim with lease in the past
    const pastLease = new Date(Date.now() - 60000).toISOString();
    services.taskService.claimTask(task.task_id, { author: 'stalled-agent', lease_until: pastLease });

    const result = runStuck({ services, json: false });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].task_id).toBe(task.task_id);
  });

  it('filters by project', () => {
    services.projectService.createProject('project-a');
    services.projectService.createProject('project-b');
    // Stuck task in project-a
    const task1 = services.taskService.createTask({ title: 'Stuck task 1', project: 'project-a' });
    services.taskService.setStatus(task1.task_id, TaskStatus.Ready);
    const pastLease = new Date(Date.now() - 60000).toISOString();
    services.taskService.claimTask(task1.task_id, { lease_until: pastLease });

    // Stuck task in project-b
    const task2 = services.taskService.createTask({ title: 'Stuck task 2', project: 'project-b' });
    services.taskService.setStatus(task2.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task2.task_id, { lease_until: pastLease });

    const result = runStuck({ services, project: 'project-a', json: false });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].project).toBe('project-a');
  });
});
