// packages/hzl-cli/src/commands/show.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runShow } from './show.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runShow', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-show-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null for non-existent task', () => {
    const result = runShow({ services, taskId: 'nonexistent', json: false });
    expect(result).toBeNull();
  });

  it('returns task details', () => {
    const task = services.taskService.createTask({
      title: 'Test task',
      project: 'test-project',
      description: 'A description',
      tags: ['urgent'],
      priority: 2,
    });

    const result = runShow({ services, taskId: task.task_id, json: false });
    expect(result).not.toBeNull();
    expect(result!.task.title).toBe('Test task');
    expect(result!.task.description).toBe('A description');
    expect(result!.task.priority).toBe(2);
  });

  it('includes comments and checkpoints', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.addComment(task.task_id, 'A comment', { author: 'test-user' });
    services.taskService.addCheckpoint(task.task_id, 'checkpoint-1', { data: 'value' });

    const result = runShow({ services, taskId: task.task_id, json: false });
    expect(result!.comments).toHaveLength(1);
    expect(result!.comments[0].text).toBe('A comment');
    expect(result!.checkpoints).toHaveLength(1);
    expect(result!.checkpoints[0].name).toBe('checkpoint-1');
  });
});
