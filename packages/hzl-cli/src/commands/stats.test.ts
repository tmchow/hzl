// packages/hzl-cli/src/commands/stats.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runStats } from './stats.js';
import { initializeDb, closeDb, type Services } from '../db.js';

describe('runStats', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-stats-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns zero counts for empty database', () => {
    const result = runStats({ services, json: false });
    expect(result.total).toBe(0);
    expect(result.by_status.backlog).toBe(0);
  });

  it('counts tasks correctly', () => {
    services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    services.taskService.createTask({ title: 'Task 2', project: 'inbox' });
    services.taskService.createTask({ title: 'Task 3', project: 'inbox' });

    const result = runStats({ services, json: false });
    expect(result.total).toBe(3);
    expect(Object.values(result.by_status).reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('counts tasks by project', () => {
    services.projectService.createProject('project-a');
    services.projectService.createProject('project-b');
    services.taskService.createTask({ title: 'Task A', project: 'project-a' });
    services.taskService.createTask({ title: 'Task B', project: 'project-a' });
    services.taskService.createTask({ title: 'Task C', project: 'project-b' });

    const result = runStats({ services, json: false });
    expect(result.by_project['project-a']).toBe(2);
    expect(result.by_project['project-b']).toBe(1);
  });
});
