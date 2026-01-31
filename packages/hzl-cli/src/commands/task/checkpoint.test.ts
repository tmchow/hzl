// packages/hzl-cli/src/commands/checkpoint.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runCheckpoint } from './checkpoint.js';
import { initializeDb, closeDb, type Services } from '../../db.js';

describe('runCheckpoint', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-checkpoint-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('adds a checkpoint to a task', () => {
    const task = services.taskService.createTask({ title: 'Test task', project: 'inbox' });

    const result = runCheckpoint({
      services,
      taskId: task.task_id,
      name: 'progress-50',
      data: { percent: 50 },
      json: false,
    });

    expect(result.task_id).toBe(task.task_id);
    expect(result.name).toBe('progress-50');
  });

  it('checkpoint shows in task checkpoints', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });

    runCheckpoint({
      services,
      taskId: task.task_id,
      name: 'step-1',
      data: { step: 1 },
      json: false,
    });

    const checkpoints = services.taskService.getCheckpoints(task.task_id);
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].name).toBe('step-1');
  });
});
