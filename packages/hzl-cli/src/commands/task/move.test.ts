// packages/hzl-cli/src/commands/move.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runMove } from './move.js';
import { initializeDb, closeDb, type Services } from '../../db.js';

describe('runMove', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-move-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('throws for non-existent task', () => {
    expect(() => runMove({
      services,
      taskId: 'nonexistent',
      toProject: 'new-project',
      json: false,
    })).toThrow(/not found/);
  });

  it('moves task to new project', () => {
    services.projectService.createProject('old-project');
    services.projectService.createProject('new-project');
    const task = services.taskService.createTask({ title: 'Test', project: 'old-project' });

    const result = runMove({
      services,
      taskId: task.task_id,
      toProject: 'new-project',
      json: false,
    });

    expect(result.from_project).toBe('old-project');
    expect(result.to_project).toBe('new-project');

    // Verify in database
    const moved = services.taskService.getTaskById(task.task_id);
    expect(moved?.project).toBe('new-project');
  });

  it('returns same project when no-op', () => {
    services.projectService.createProject('same-project');
    const task = services.taskService.createTask({ title: 'Test', project: 'same-project' });

    const result = runMove({
      services,
      taskId: task.task_id,
      toProject: 'same-project',
      json: false,
    });

    expect(result.from_project).toBe('same-project');
    expect(result.to_project).toBe('same-project');
  });
});
