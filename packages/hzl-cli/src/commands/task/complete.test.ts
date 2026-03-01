// packages/hzl-cli/src/commands/complete.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runComplete } from './complete.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { CLIError } from '../../errors.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runComplete', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-complete-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('completes an in-progress task', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id);

    const result = runComplete({
      services,
      taskId: task.task_id,
      json: false,
    });

    expect(result.status).toBe(TaskStatus.Done);
  });

  it('sets status to done', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id);

    runComplete({ services, taskId: task.task_id, json: false });

    const updated = services.taskService.getTaskById(task.task_id);
    expect(updated?.status).toBe(TaskStatus.Done);
  });

  it('adds completion comment when provided', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id);

    runComplete({
      services,
      taskId: task.task_id,
      comment: 'Implemented and verified',
      json: false,
    });

    const comments = services.taskService.getComments(task.task_id);
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe('Implemented and verified');
  });

  it('provides multi-step suggestions when status is backlog', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });

    try {
      runComplete({
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
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.setStatus(task.task_id, TaskStatus.InProgress);
    services.taskService.setStatus(task.task_id, TaskStatus.Done);

    try {
      runComplete({
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
