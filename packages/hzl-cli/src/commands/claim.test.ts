// packages/hzl-cli/src/commands/claim.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runClaim } from './claim.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runClaim', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-claim-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('claims a ready task', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);

    const result = runClaim({
      services,
      taskId: task.task_id,
      author: 'test-agent',
      json: false,
    });

    expect(result.task_id).toBe(task.task_id);
    expect(result.status).toBe(TaskStatus.InProgress);
    expect(result.claimed_by_author).toBe('test-agent');
  });

  it('sets lease when specified', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);

    const result = runClaim({
      services,
      taskId: task.task_id,
      author: 'test-agent',
      leaseMinutes: 30,
      json: false,
    });

    expect(result.lease_until).toBeDefined();
  });
});
