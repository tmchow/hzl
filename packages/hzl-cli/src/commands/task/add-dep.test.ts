// packages/hzl-cli/src/commands/add-dep.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runAddDep } from './add-dep.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';

describe('runAddDep', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-add-dep-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('adds a dependency between two tasks', () => {
    const task1 = services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    const task2 = services.taskService.createTask({ title: 'Task 2', project: 'inbox' });

    const result = runAddDep({
      services,
      taskId: task1.task_id,
      dependsOnId: task2.task_id,
      json: false,
    });

    expect(result.task_id).toBe(task1.task_id);
    expect(result.depends_on_id).toBe(task2.task_id);
    expect(result.added).toBe(true);
  });

  it('throws when dependency would create a cycle', () => {
    const task1 = services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    const task2 = services.taskService.createTask({ title: 'Task 2', project: 'inbox', depends_on: [task1.task_id] });

    // Task1 depends on Task2, now trying to make Task1 depend on Task2 would create cycle
    // Actually the cycle is: Task1 <- Task2. If we add Task1 -> Task2, then Task2 depends on Task1 AND Task1 depends on Task2 = cycle
    expect(() => runAddDep({
      services,
      taskId: task1.task_id,
      dependsOnId: task2.task_id,
      json: false,
    })).toThrow(/cycle/i);
  });
});
