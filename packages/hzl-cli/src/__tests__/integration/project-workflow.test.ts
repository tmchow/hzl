import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runInit } from '../../commands/init.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { runProjectCreate } from '../../commands/project/create.js';
import { runProjectDelete } from '../../commands/project/delete.js';
import { runAdd } from '../../commands/task/add.js';

describe('project workflow integration', () => {
  let tempDir: string;
  let dbPath: string;
  let configPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-project-workflow-'));
    dbPath = path.join(tempDir, 'data.db');
    configPath = path.join(tempDir, 'config.json');

    runInit({ dbPath, pathSource: 'cli', json: false, configPath });
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates project, adds tasks, deletes project and moves tasks', () => {
    const inbox = services.projectService.getProject('inbox');
    expect(inbox).not.toBeNull();
    expect(inbox?.is_protected).toBe(true);

    runProjectCreate({ services, name: 'myproject', json: false });

    const task1 = runAdd({
      services,
      project: 'myproject',
      title: 'Task 1',
      json: false,
    });
    const task2 = runAdd({
      services,
      project: 'inbox',
      title: 'Task 2',
      json: false,
    });

    runProjectDelete({ services, name: 'myproject', moveTo: 'inbox', json: false });

    const moved1 = services.taskService.getTaskById(task1.task_id);
    const moved2 = services.taskService.getTaskById(task2.task_id);

    expect(moved1?.project).toBe('inbox');
    expect(moved2?.project).toBe('inbox');
  });
});
