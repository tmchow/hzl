// packages/hzl-cli/src/commands/task/unblock.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runUnblock } from './unblock.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runUnblock', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-unblock-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('unblocks to in_progress by default', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id, { author: 'agent-1' });
    services.taskService.blockTask(task.task_id);

    const result = runUnblock({
      services,
      taskId: task.task_id,
      json: false,
    });

    expect(result.status).toBe('in_progress');
    expect(result.agent).toBe('agent-1');
  });

  it('unblocks to ready with release option', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id, { author: 'agent-1' });
    services.taskService.blockTask(task.task_id);

    const result = runUnblock({
      services,
      taskId: task.task_id,
      release: true,
      json: false,
    });

    expect(result.status).toBe('ready');
    // Assignee should persist even when released
    expect(result.agent).toBe('agent-1');
  });
});
