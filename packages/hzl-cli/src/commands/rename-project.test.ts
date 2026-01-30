// packages/hzl-cli/src/commands/rename-project.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runRenameProject } from './rename-project.js';
import { initializeDb, closeDb, type Services } from '../db.js';

describe('runRenameProject', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-rename-project-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('renames project by moving all tasks', () => {
    services.taskService.createTask({ title: 'Task 1', project: 'old-project' });
    services.taskService.createTask({ title: 'Task 2', project: 'old-project' });

    const result = runRenameProject({
      services,
      from: 'old-project',
      to: 'new-project',
      force: false,
      json: false,
    });

    expect(result.moved_count).toBe(2);
    
    // Verify tasks are in new project via direct DB query
    const newTasks = services.db.prepare('SELECT * FROM tasks_current WHERE project = ?').all('new-project');
    expect(newTasks).toHaveLength(2);
    
    // Verify old project is empty
    const oldTasks = services.db.prepare('SELECT * FROM tasks_current WHERE project = ?').all('old-project');
    expect(oldTasks).toHaveLength(0);
  });

  it('throws when target project exists without force flag', () => {
    services.taskService.createTask({ title: 'Task 1', project: 'project-a' });
    services.taskService.createTask({ title: 'Task 2', project: 'project-b' });

    expect(() => runRenameProject({
      services,
      from: 'project-a',
      to: 'project-b',
      force: false,
      json: false,
    })).toThrow(/already exists/);
  });

  it('merges projects when force flag is set', () => {
    services.taskService.createTask({ title: 'Task 1', project: 'project-a' });
    services.taskService.createTask({ title: 'Task 2', project: 'project-b' });

    const result = runRenameProject({
      services,
      from: 'project-a',
      to: 'project-b',
      force: true,
      json: false,
    });

    expect(result.moved_count).toBe(1);
    
    const tasks = services.db.prepare('SELECT * FROM tasks_current WHERE project = ?').all('project-b');
    expect(tasks).toHaveLength(2);
  });

  it('returns zero when source project has no tasks', () => {
    const result = runRenameProject({
      services,
      from: 'nonexistent',
      to: 'new-project',
      force: false,
      json: false,
    });

    expect(result.moved_count).toBe(0);
  });
});
