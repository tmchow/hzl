// packages/hzl-cli/src/commands/task/block.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runBlock } from './block.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runBlock', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-block-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('blocks an in_progress task', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id, { author: 'agent-1' });

    const result = runBlock({
      services,
      taskId: task.task_id,
      reason: 'Waiting for API keys',
      json: false,
    });

    expect(result.status).toBe('blocked');
    expect(result.assignee).toBe('agent-1');
  });

  it('preserves assignee when blocked', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id, { author: 'agent-1' });

    const result = runBlock({
      services,
      taskId: task.task_id,
      json: false,
    });

    expect(result.assignee).toBe('agent-1');
  });
});
