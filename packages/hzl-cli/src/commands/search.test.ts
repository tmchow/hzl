// packages/hzl-cli/src/commands/search.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runSearch } from './search.js';
import { initializeDb, closeDb, type Services } from '../db.js';

describe('runSearch', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-search-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('finds tasks by title', () => {
    services.taskService.createTask({ title: 'Fix authentication bug', project: 'webapp' });
    services.taskService.createTask({ title: 'Add new feature', project: 'webapp' });

    const result = runSearch({ services, query: 'authentication', json: false });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe('Fix authentication bug');
  });

  it('finds tasks by title when searching different projects', () => {
    services.taskService.createTask({ title: 'Alpha task', project: 'project-a' });
    services.taskService.createTask({ title: 'Beta task', project: 'project-b' });

    const result = runSearch({ services, query: 'Alpha', json: false });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe('Alpha task');
  });

  it('returns empty list when no matches', () => {
    services.taskService.createTask({ title: 'Task 1', project: 'inbox' });

    const result = runSearch({ services, query: 'nonexistent', json: false });
    expect(result.tasks).toHaveLength(0);
  });
});
