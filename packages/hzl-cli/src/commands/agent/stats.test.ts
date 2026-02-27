import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';
import { runAgentStats } from './stats.js';

describe('runAgentStats', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-agent-stats-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns per-agent totals and per-status counts', () => {
    const t1 = services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    const t2 = services.taskService.createTask({ title: 'Task 2', project: 'inbox' });
    services.taskService.setStatus(t1.task_id, TaskStatus.Ready);
    services.taskService.setStatus(t2.task_id, TaskStatus.Ready);
    services.taskService.claimTask(t1.task_id, { author: 'clara' });
    services.taskService.claimTask(t2.task_id, { author: 'clara' });
    services.taskService.completeTask(t2.task_id, { author: 'clara' });

    const result = runAgentStats({ services, json: false });
    expect(result.total_agents).toBe(1);
    expect(result.total_tasks).toBe(2);
    expect(result.agents[0]?.agent).toBe('clara');
    expect(result.agents[0]?.by_status.in_progress).toBe(1);
    expect(result.agents[0]?.by_status.done).toBe(1);
  });

  it('supports project and status filters', () => {
    services.projectService.createProject('alpha');
    const t1 = services.taskService.createTask({ title: 'Task 1', project: 'alpha' });
    const t2 = services.taskService.createTask({ title: 'Task 2', project: 'inbox' });
    services.taskService.setStatus(t1.task_id, TaskStatus.Ready);
    services.taskService.setStatus(t2.task_id, TaskStatus.Ready);
    services.taskService.claimTask(t1.task_id, { author: 'agent-a' });
    services.taskService.claimTask(t2.task_id, { author: 'agent-a' });
    services.taskService.completeTask(t2.task_id, { author: 'agent-a' });

    const filtered = runAgentStats({
      services,
      project: 'alpha',
      status: TaskStatus.InProgress,
      json: false,
    });

    expect(filtered.total_agents).toBe(1);
    expect(filtered.total_tasks).toBe(1);
    expect(filtered.agents[0]?.by_status.in_progress).toBe(1);
  });
});

