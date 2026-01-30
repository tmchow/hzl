// packages/hzl-cli/src/commands/comment.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runComment } from './comment.js';
import { initializeDb, closeDb, type Services } from '../db.js';

describe('runComment', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-comment-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('adds a comment to a task', () => {
    const task = services.taskService.createTask({ title: 'Test task', project: 'inbox' });

    const result = runComment({
      services,
      taskId: task.task_id,
      text: 'This is a comment',
      author: 'test-user',
      json: false,
    });

    expect(result.task_id).toBe(task.task_id);
    expect(result.text).toBe('This is a comment');
  });

  it('comment shows in task comments', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });

    runComment({
      services,
      taskId: task.task_id,
      text: 'A comment',
      json: false,
    });

    const comments = services.taskService.getComments(task.task_id);
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe('A comment');
  });
});
