// packages/hzl-cli/src/resolve-id.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { resolveId } from './resolve-id.js';
import { initializeDbFromPath, closeDb, type Services } from './db.js';
import { CLIError, ExitCode } from './errors.js';

describe('resolveId', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-resolve-id-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves full ID', () => {
    const task = services.taskService.createTask({ title: 'Test task', project: 'inbox' });
    const resolved = resolveId(services, task.task_id);
    expect(resolved).toBe(task.task_id);
  });

  it('resolves unique prefix to full ID', () => {
    const task = services.taskService.createTask({ title: 'Prefix task', project: 'inbox' });
    const prefix = task.task_id.slice(0, task.task_id.length - 1);
    const resolved = resolveId(services, prefix);
    expect(resolved).toBe(task.task_id);
  });

  it('throws CLIError with NotFound for no match', () => {
    services.taskService.createTask({ title: 'Some task', project: 'inbox' });
    try {
      resolveId(services, 'ZZZZZZZZ');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
      expect((e as CLIError).exitCode).toBe(ExitCode.NotFound);
      expect((e as CLIError).message).toContain('ZZZZZZZZ');
    }
  });

  it('throws CLIError with InvalidInput for ambiguous prefix', () => {
    const task1 = services.taskService.createTask({ title: 'Task one', project: 'inbox' });
    const task2 = services.taskService.createTask({ title: 'Task two', project: 'inbox' });

    // Find shared prefix
    let commonLen = 0;
    while (commonLen < task1.task_id.length && task1.task_id[commonLen] === task2.task_id[commonLen]) {
      commonLen++;
    }
    expect(commonLen).toBeGreaterThanOrEqual(10);

    const ambiguousPrefix = task1.task_id.slice(0, commonLen);
    try {
      resolveId(services, ambiguousPrefix);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
      expect((e as CLIError).exitCode).toBe(ExitCode.InvalidInput);
      expect((e as CLIError).message).toContain('Ambiguous prefix');
      expect((e as CLIError).message).toContain('Task one');
      expect((e as CLIError).message).toContain('Task two');
    }
  });

  it('throws CLIError with NotFound when no tasks exist', () => {
    try {
      resolveId(services, '01ABCDEF');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
      expect((e as CLIError).exitCode).toBe(ExitCode.NotFound);
    }
  });
});
