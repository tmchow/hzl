// packages/hzl-cli/src/commands/remove-dep.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runRemoveDep } from './remove-dep.js';
import { initializeDb, closeDb, type Services } from '../db.js';

describe('runRemoveDep', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-remove-dep-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('removes a dependency between two tasks', () => {
    const task1 = services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    const task2 = services.taskService.createTask({ title: 'Task 2', project: 'inbox', depends_on: [task1.task_id] });

    const result = runRemoveDep({
      services,
      taskId: task2.task_id,
      dependsOnId: task1.task_id,
      json: false,
    });

    expect(result.task_id).toBe(task2.task_id);
    expect(result.depends_on_id).toBe(task1.task_id);
    expect(result.removed).toBe(true);
  });

  it('succeeds even if dependency does not exist', () => {
    const task1 = services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    const task2 = services.taskService.createTask({ title: 'Task 2', project: 'inbox' });

    // Remove non-existent dependency - should still return removed: true (idempotent)
    const result = runRemoveDep({
      services,
      taskId: task1.task_id,
      dependsOnId: task2.task_id,
      json: false,
    });

    expect(result.removed).toBe(true);
  });
});
