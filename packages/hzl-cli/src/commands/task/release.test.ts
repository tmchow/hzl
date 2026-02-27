// packages/hzl-cli/src/commands/release.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runRelease } from './release.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runRelease', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-release-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('releases a claimed task', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id);

    const result = runRelease({
      services,
      taskId: task.task_id,
      json: false,
    });

    expect(result.status).toBe(TaskStatus.Ready);
    expect(result.agent).toBeNull();
  });

  it('accepts a comment', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id);

    const result = runRelease({
      services,
      taskId: task.task_id,
      comment: 'blocked on external dependency',
      json: false,
    });

    expect(result.status).toBe(TaskStatus.Ready);
  });
});
