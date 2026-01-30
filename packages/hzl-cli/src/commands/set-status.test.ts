// packages/hzl-cli/src/commands/set-status.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runSetStatus } from './set-status.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runSetStatus', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-set-status-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('changes task status from backlog to ready', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });

    const result = runSetStatus({
      services,
      taskId: task.task_id,
      status: TaskStatus.Ready,
      json: false,
    });

    expect(result.status).toBe(TaskStatus.Ready);
  });

  it('changes task status to any valid status', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id);

    const result = runSetStatus({
      services,
      taskId: task.task_id,
      status: TaskStatus.Done,
      json: false,
    });

    expect(result.status).toBe(TaskStatus.Done);
  });
});
