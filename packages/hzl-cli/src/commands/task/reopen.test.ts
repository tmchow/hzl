// packages/hzl-cli/src/commands/reopen.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runReopen } from './reopen.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runReopen', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-reopen-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('reopens a done task to ready', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id);
    services.taskService.completeTask(task.task_id);

    const result = runReopen({
      services,
      taskId: task.task_id,
      json: false,
    });

    expect(result.status).toBe(TaskStatus.Ready);
  });

  it('can reopen to backlog instead', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id);
    services.taskService.completeTask(task.task_id);

    const result = runReopen({
      services,
      taskId: task.task_id,
      toStatus: TaskStatus.Backlog,
      json: false,
    });

    expect(result.status).toBe(TaskStatus.Backlog);
  });
});
