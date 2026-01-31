// packages/hzl-cli/src/commands/steal.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runSteal } from './steal.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runSteal', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-steal-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('steals a task with --force', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id, { author: 'original-owner' });

    const result = runSteal({
      services,
      taskId: task.task_id,
      newOwner: 'new-owner',
      force: true,
      json: false,
    });

    expect(result.claimed_by_author).toBe('new-owner');
    expect(result.stolen_from).toBe('original-owner');
  });

  it('steals a task with expired lease when --if-expired', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    // Claim with lease in the past
    const pastLease = new Date(Date.now() - 60000).toISOString();
    services.taskService.claimTask(task.task_id, { author: 'original-owner', lease_until: pastLease });

    const result = runSteal({
      services,
      taskId: task.task_id,
      newOwner: 'new-owner',
      ifExpired: true,
      json: false,
    });

    expect(result.claimed_by_author).toBe('new-owner');
  });

  it('throws when trying to steal non-expired task with --if-expired', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    // Claim with lease in the future
    const futureLease = new Date(Date.now() + 3600000).toISOString();
    services.taskService.claimTask(task.task_id, { author: 'original-owner', lease_until: futureLease });

    expect(() => runSteal({
      services,
      taskId: task.task_id,
      newOwner: 'new-owner',
      ifExpired: true,
      json: false,
    })).toThrow(/lease has not expired/);
  });
});
