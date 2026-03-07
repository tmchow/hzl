import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initializeDbFromPath, closeDb, type Services } from '../db.js';
import { runStats } from './stats.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runStats', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-stats-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns the redesigned canonical stats shape', () => {
    const result = runStats({ services, json: false, windowMinutes: 24 * 60, windowLabel: '24h' });

    expect(result).toMatchObject({
      window: '24h',
      projects: ['inbox'],
      queue: {
        backlog: 0,
        ready: 0,
        in_progress: 0,
        blocked: 0,
        done: 0,
        archived: 0,
        available: 0,
        stale: 0,
        expired_leases: 0,
      },
      completions: {
        total: 0,
        by_agent: {},
      },
      execution_time_ms: {
        count: 0,
        mean: null,
        min: null,
        max: null,
        excluded_without_start: 0,
      },
    });
  });

  it('reports queue and completion primitives', () => {
    const ready = services.taskService.createTask({ title: 'Ready', project: 'inbox' });
    services.taskService.setStatus(ready.task_id, TaskStatus.Ready);

    const stale = services.taskService.createTask({ title: 'Stale', project: 'inbox' });
    services.taskService.setStatus(stale.task_id, TaskStatus.Ready);
    services.taskService.claimTask(stale.task_id, { author: 'agent-1' });
    services.cacheDb
      .prepare('UPDATE tasks_current SET claimed_at = ? WHERE task_id = ?')
      .run(new Date(Date.now() - 15 * 60_000).toISOString(), stale.task_id);

    const done = services.taskService.createTask({ title: 'Done', project: 'inbox' });
    services.taskService.setStatus(done.task_id, TaskStatus.Ready);
    services.taskService.claimTask(done.task_id, { author: 'agent-1' });
    services.taskService.completeTask(done.task_id, { author: 'agent-1' });

    const result = runStats({ services, json: false, windowMinutes: 60, windowLabel: '1h' });

    expect(result.queue.ready).toBe(1);
    expect(result.queue.in_progress).toBe(1);
    expect(result.queue.available).toBe(1);
    expect(result.queue.stale).toBe(1);
    expect(result.completions.total).toBe(1);
    expect(result.completions.by_agent).toEqual({ 'agent-1': 1 });
    expect(result.execution_time_ms.count).toBe(1);
  });

  it('filters historical stats by current project', () => {
    services.projectService.createProject('project-a');
    services.projectService.createProject('project-b');

    const moved = services.taskService.createTask({ title: 'Moved task', project: 'project-a' });
    services.taskService.setStatus(moved.task_id, TaskStatus.Ready);
    services.taskService.claimTask(moved.task_id, { author: 'agent-1' });
    services.taskService.completeTask(moved.task_id, { author: 'agent-1' });
    services.taskService.moveTask(moved.task_id, 'project-b');

    const projectA = runStats({ services, json: false, project: 'project-a', windowMinutes: 60, windowLabel: '1h' });
    const projectB = runStats({ services, json: false, project: 'project-b', windowMinutes: 60, windowLabel: '1h' });

    expect(projectA.completions.total).toBe(0);
    expect(projectB.completions.total).toBe(1);
  });
});
