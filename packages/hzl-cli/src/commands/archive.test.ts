// packages/hzl-cli/src/commands/archive.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runArchive } from './archive.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runArchive', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-archive-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
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
});
