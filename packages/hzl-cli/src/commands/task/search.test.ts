// packages/hzl-cli/src/commands/search.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runSearch } from './search.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runSearch', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-search-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('finds tasks by title', () => {
    services.projectService.createProject('webapp');
    services.taskService.createTask({ title: 'Fix authentication bug', project: 'webapp' });
    services.taskService.createTask({ title: 'Add new feature', project: 'webapp' });

    const result = runSearch({ services, query: 'authentication', json: false });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe('Fix authentication bug');
  });

  it('finds tasks by title when searching different projects', () => {
    services.projectService.createProject('project-a');
    services.projectService.createProject('project-b');
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

  it('filters by status', () => {
    const ready = services.taskService.createTask({ title: 'Auth issue', project: 'inbox' });
    services.taskService.createTask({ title: 'Auth note', project: 'inbox' });
    services.taskService.setStatus(ready.task_id, TaskStatus.Ready);

    const result = runSearch({ services, query: 'Auth', status: TaskStatus.Ready, json: false });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].status).toBe(TaskStatus.Ready);
  });

  it('returns full total when results are paginated', () => {
    services.taskService.createTask({ title: 'Search match 1', project: 'inbox' });
    services.taskService.createTask({ title: 'Search match 2', project: 'inbox' });
    services.taskService.createTask({ title: 'Search match 3', project: 'inbox' });

    const result = runSearch({ services, query: 'Search', limit: 2, json: false });
    expect(result.tasks).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  it('rejects invalid status', () => {
    expect(() =>
      runSearch({ services, query: 'anything', status: 'not-a-status', json: false })
    ).toThrow(/Invalid status/);
  });

  it('rejects invalid limit', () => {
    expect(() => runSearch({ services, query: 'anything', limit: 0, json: false })).toThrow(
      /Limit must be an integer >= 1/
    );
  });

  it('rejects invalid offset', () => {
    expect(() => runSearch({ services, query: 'anything', offset: -1, json: false })).toThrow(
      /Offset must be an integer >= 0/
    );
  });
});
