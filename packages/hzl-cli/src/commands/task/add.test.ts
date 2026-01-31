// packages/hzl-cli/src/commands/add.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runAdd } from './add.js';
import { initializeDb, closeDb, type Services } from '../../db.js';

describe('runAdd', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-add-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a task with just title', () => {
    const result = runAdd({
      services,
      project: 'inbox',
      title: 'Test task',
      json: false,
    });

    expect(result.task_id).toBeDefined();
    expect(result.title).toBe('Test task');
    expect(result.project).toBe('inbox');
  });

  it('creates a task with all options', () => {
    services.projectService.createProject('my-project');
    const result = runAdd({
      services,
      project: 'my-project',
      title: 'Full task',
      description: 'A description',
      tags: ['urgent', 'backend'],
      priority: 2,
      json: false,
    });

    expect(result.project).toBe('my-project');
    expect(result.priority).toBe(2);
  });

  it('creates a task with dependencies', () => {
    const dep = runAdd({ services, project: 'inbox', title: 'Dependency', json: false });
    const result = runAdd({
      services,
      project: 'inbox',
      title: 'Dependent task',
      dependsOn: [dep.task_id],
      json: false,
    });

    expect(result.task_id).toBeDefined();
    // Dependent task should have the dependency recorded
    const task = services.taskService.getTaskById(result.task_id);
    expect(task).toBeDefined();
  });
});
