// packages/hzl-cli/src/commands/update.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runUpdate } from './update.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';

describe('runUpdate', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-update-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('throws for non-existent task', () => {
    expect(() => runUpdate({
      services,
      taskId: 'nonexistent',
      updates: { title: 'New title' },
      json: false,
    })).toThrow(/not found/);
  });

  it('updates task title', () => {
    const task = services.taskService.createTask({ title: 'Old title', project: 'inbox' });

    const result = runUpdate({
      services,
      taskId: task.task_id,
      updates: { title: 'New title' },
      json: false,
    });

    expect(result.title).toBe('New title');
    
    // Verify in database
    const updated = services.taskService.getTaskById(task.task_id);
    expect(updated?.title).toBe('New title');
  });

  it('updates priority', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox', priority: 0 });

    const result = runUpdate({
      services,
      taskId: task.task_id,
      updates: { priority: 3 },
      json: false,
    });

    expect(result.priority).toBe(3);
  });

  it('updates description', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });

    const result = runUpdate({
      services,
      taskId: task.task_id,
      updates: { description: 'New description' },
      json: false,
    });

    expect(result.description).toBe('New description');
  });
});
