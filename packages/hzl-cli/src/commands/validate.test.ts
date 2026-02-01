// packages/hzl-cli/src/commands/validate.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runValidate } from './validate.js';
import { initializeDbFromPath, closeDb, type Services } from '../db.js';

describe('runValidate', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-validate-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns valid when no issues', () => {
    services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    services.taskService.createTask({ title: 'Task 2', project: 'inbox' });

    const result = runValidate({ services, json: false });
    expect(result.isValid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('returns issues when there are cycles', () => {
    // Create tasks with manual dependencies inserted via raw SQL to create a cycle
    const task1 = services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    const task2 = services.taskService.createTask({ title: 'Task 2', project: 'inbox', depends_on: [task1.task_id] });
    
    // Manually create cycle using raw SQL
    services.cacheDb.prepare('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)').run(task1.task_id, task2.task_id);

    const result = runValidate({ services, json: false });
    expect(result.isValid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
  });
});
