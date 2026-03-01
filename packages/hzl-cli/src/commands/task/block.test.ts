// packages/hzl-cli/src/commands/task/block.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runBlock } from './block.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { CLIError } from '../../errors.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runBlock', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-block-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('blocks an in_progress task', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id, { author: 'agent-1' });

    const result = runBlock({
      services,
      taskId: task.task_id,
      comment: 'Waiting for API keys',
      json: false,
    });

    expect(result.status).toBe('blocked');
    expect(result.agent).toBe('agent-1');
  });

  it('preserves agent when blocked', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id, { author: 'agent-1' });

    const result = runBlock({
      services,
      taskId: task.task_id,
      json: false,
    });

    expect(result.agent).toBe('agent-1');
  });

  it('provides multi-step suggestions when status is backlog', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });

    try {
      runBlock({
        services,
        taskId: task.task_id,
        json: false,
      });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
      const err = e as CLIError;
      expect(err.suggestions).toEqual([
        `hzl task set-status ${task.task_id} ready`,
        `hzl task claim ${task.task_id} --agent <name>`,
      ]);
    }
  });

  it('provides reopen flow suggestions when status is done', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Done);

    try {
      runBlock({
        services,
        taskId: task.task_id,
        json: false,
      });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
      const err = e as CLIError;
      expect(err.suggestions).toEqual([
        `hzl task reopen ${task.task_id} --status ready`,
        `hzl task claim ${task.task_id} --agent <name>`,
      ]);
    }
  });
});
