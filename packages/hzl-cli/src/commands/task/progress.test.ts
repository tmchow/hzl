// packages/hzl-cli/src/commands/task/progress.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runProgress } from './progress.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';

describe('runProgress', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-progress-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('sets progress on a task', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });

    const result = runProgress({
      services,
      taskId: task.task_id,
      progress: 50,
      json: false,
    });

    expect(result.progress).toBe(50);
  });

  it('creates a checkpoint for progress update', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });

    runProgress({
      services,
      taskId: task.task_id,
      progress: 75,
      json: false,
    });

    const checkpoints = services.taskService.getCheckpoints(task.task_id);
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].name).toBe('Progress updated to 75%');
  });
});
