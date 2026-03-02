import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';
import { runAgentStatus } from './status.js';

describe('runAgentStatus', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-agent-status-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns agent status with active and idle agents', () => {
    const t1 = services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    const t2 = services.taskService.createTask({ title: 'Task 2', project: 'inbox' });
    services.taskService.setStatus(t1.task_id, TaskStatus.Ready);
    services.taskService.setStatus(t2.task_id, TaskStatus.Ready);
    services.taskService.claimTask(t1.task_id, { author: 'agent-a' });
    services.taskService.claimTask(t2.task_id, { author: 'agent-b' });
    services.taskService.completeTask(t2.task_id, { author: 'agent-b' });

    const result = runAgentStatus({ services, json: true });
    expect(result.summary.active).toBe(1);
    expect(result.summary.idle).toBe(1);
    expect(result.agents).toHaveLength(2);
  });

  it('filters by single agent', () => {
    const t1 = services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    const t2 = services.taskService.createTask({ title: 'Task 2', project: 'inbox' });
    services.taskService.setStatus(t1.task_id, TaskStatus.Ready);
    services.taskService.setStatus(t2.task_id, TaskStatus.Ready);
    services.taskService.claimTask(t1.task_id, { author: 'agent-a' });
    services.taskService.claimTask(t2.task_id, { author: 'agent-b' });

    const result = runAgentStatus({ services, agent: 'agent-a', json: true });
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].agent).toBe('agent-a');
  });

  it('includes stats when requested', () => {
    const t1 = services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    services.taskService.setStatus(t1.task_id, TaskStatus.Ready);
    services.taskService.claimTask(t1.task_id, { author: 'agent-a' });

    const result = runAgentStatus({ services, stats: true, json: true });
    expect(result.agents[0].stats).not.toBeNull();
    expect(result.agents[0].stats!.total).toBe(1);
  });

  it('returns empty result when no agents', () => {
    const result = runAgentStatus({ services, json: true });
    expect(result.agents).toHaveLength(0);
    expect(result.summary).toEqual({ total: 0, active: 0, idle: 0 });
  });
});
