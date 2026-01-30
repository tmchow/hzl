// packages/hzl-cli/src/commands/history.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runHistory } from './history.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runHistory', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-history-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty list for non-existent task', () => {
    const result = runHistory({ services, taskId: 'nonexistent', json: false });
    expect(result.events).toHaveLength(0);
  });

  it('returns task creation event', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });

    const result = runHistory({ services, taskId: task.task_id, json: false });
    expect(result.events.length).toBeGreaterThanOrEqual(1);
    expect(result.events[0].type).toBe('task_created');
  });

  it('includes all status change events', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.setStatus(task.task_id, TaskStatus.InProgress);

    const result = runHistory({ services, taskId: task.task_id, json: false });
    // Should have at least: task_created, status_changed (ready), status_changed (in_progress)
    expect(result.events.length).toBeGreaterThanOrEqual(3);
  });
});
