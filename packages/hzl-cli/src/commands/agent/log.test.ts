import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';
import { runAgentLog } from './log.js';

describe('runAgentLog', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-agent-log-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns events for an agent', () => {
    const t1 = services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    services.taskService.setStatus(t1.task_id, TaskStatus.Ready);
    services.taskService.claimTask(t1.task_id, { author: 'agent-a' });

    const result = runAgentLog({ services, agent: 'agent-a', json: true });
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it('returns empty for unknown agent', () => {
    const result = runAgentLog({ services, agent: 'nonexistent', json: true });
    expect(result.events).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('respects limit option', () => {
    const t1 = services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    services.taskService.setStatus(t1.task_id, TaskStatus.Ready);
    services.taskService.claimTask(t1.task_id, { author: 'agent-a' });
    services.taskService.completeTask(t1.task_id, { author: 'agent-a' });

    const result = runAgentLog({ services, agent: 'agent-a', limit: 1, json: true });
    expect(result.events).toHaveLength(1);
    expect(result.total).toBeGreaterThan(1);
  });
});
