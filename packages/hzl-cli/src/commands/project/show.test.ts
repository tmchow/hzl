import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runProjectShow } from './show.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runProjectShow', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-project-show-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('shows project details and task status breakdown', () => {
    services.projectService.createProject('alpha', { description: 'Alpha project' });

    const backlog = services.taskService.createTask({ title: 'Backlog', project: 'alpha' });
    const ready = services.taskService.createTask({ title: 'Ready', project: 'alpha' });
    const inProgress = services.taskService.createTask({ title: 'In Progress', project: 'alpha' });
    const done = services.taskService.createTask({ title: 'Done', project: 'alpha' });
    const archived = services.taskService.createTask({ title: 'Archived', project: 'alpha' });

    services.taskService.setStatus(ready.task_id, TaskStatus.Ready);
    services.taskService.setStatus(inProgress.task_id, TaskStatus.Ready);
    services.taskService.claimTask(inProgress.task_id);
    services.taskService.setStatus(done.task_id, TaskStatus.Ready);
    services.taskService.claimTask(done.task_id);
    services.taskService.completeTask(done.task_id);
    services.taskService.archiveTask(archived.task_id);

    const result = runProjectShow({ services, name: 'alpha', json: false });

    expect(result.project.name).toBe('alpha');
    expect(result.project.description).toBe('Alpha project');
    expect(result.project.is_protected).toBe(false);
    expect(result.statuses.backlog).toBe(1);
    expect(result.statuses.ready).toBe(1);
    expect(result.statuses.in_progress).toBe(1);
    expect(result.statuses.done).toBe(1);
    expect(result.statuses.archived).toBe(1);
  });
});
