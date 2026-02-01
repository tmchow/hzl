import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runProjectList } from './list.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';

describe('runProjectList', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-project-list-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('lists projects including empty ones', () => {
    services.projectService.createProject('alpha');

    const result = runProjectList({ services, json: false });
    const names = result.projects.map((p) => p.name);

    expect(names).toContain('inbox');
    expect(names).toContain('alpha');
  });

  it('includes active and archived task counts', () => {
    services.projectService.createProject('alpha');
    const active = services.taskService.createTask({ title: 'Active', project: 'alpha' });
    const archived = services.taskService.createTask({ title: 'Archived', project: 'alpha' });
    services.taskService.archiveTask(archived.task_id);

    const result = runProjectList({ services, json: false });
    const alpha = result.projects.find((p) => p.name === 'alpha');

    expect(alpha).toBeDefined();
    expect(alpha?.task_count).toBe(2);
    expect(alpha?.archived_task_count).toBe(1);
    expect(alpha?.active_task_count).toBe(1);
  });
});
