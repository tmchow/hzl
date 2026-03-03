// packages/hzl-cli/src/commands/stuck.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runStuck } from './stuck.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runStuck', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-stuck-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty list when no stuck tasks', () => {
    const result = runStuck({ services, json: false });
    expect(result.tasks).toHaveLength(0);
  });

  it('finds tasks with expired leases', () => {
    const task = services.taskService.createTask({ title: 'Stuck task', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    // Claim with lease in the past
    const pastLease = new Date(Date.now() - 60000).toISOString();
    services.taskService.claimTask(task.task_id, { author: 'stalled-agent', lease_until: pastLease });

    const result = runStuck({ services, json: false });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].task_id).toBe(task.task_id);
  });

  it('includes claimed_at in output', () => {
    const task = services.taskService.createTask({ title: 'Stuck task', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    const pastLease = new Date(Date.now() - 60000).toISOString();
    services.taskService.claimTask(task.task_id, { author: 'stalled-agent', lease_until: pastLease });

    const result = runStuck({ services, json: false });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].claimed_at).toBeTruthy();
    expect(typeof result.tasks[0].claimed_at).toBe('string');
  });

  it('filters by project', () => {
    services.projectService.createProject('project-a');
    services.projectService.createProject('project-b');
    // Stuck task in project-a
    const task1 = services.taskService.createTask({ title: 'Stuck task 1', project: 'project-a' });
    services.taskService.setStatus(task1.task_id, TaskStatus.Ready);
    const pastLease = new Date(Date.now() - 60000).toISOString();
    services.taskService.claimTask(task1.task_id, { lease_until: pastLease });

    // Stuck task in project-b
    const task2 = services.taskService.createTask({ title: 'Stuck task 2', project: 'project-b' });
    services.taskService.setStatus(task2.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task2.task_id, { lease_until: pastLease });

    const result = runStuck({ services, project: 'project-a', json: false });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].project).toBe('project-a');
  });

  describe('--stale flag', () => {
    it('does not include stale tasks by default', () => {
      const task = services.taskService.createTask({ title: 'Silent claim', project: 'inbox' });
      services.taskService.setStatus(task.task_id, TaskStatus.Ready);
      services.taskService.claimTask(task.task_id, { author: 'agent-1' });

      const result = runStuck({ services, json: false });
      expect(result.tasks).toHaveLength(0);
    });

    it('includes stale tasks when --stale is set', () => {
      const task = services.taskService.createTask({ title: 'Silent claim', project: 'inbox' });
      services.taskService.setStatus(task.task_id, TaskStatus.Ready);
      services.taskService.claimTask(task.task_id, { author: 'agent-1' });

      const result = runStuck({ services, json: false, stale: true, staleThresholdMinutes: 0 });
      expect(result.tasks.length).toBeGreaterThanOrEqual(1);
      const found = result.tasks.find(t => t.task_id === task.task_id);
      expect(found).toBeDefined();
      expect(found!.reason).toBe('stale');
    });

    it('separates stuck and stale tasks in result', () => {
      // Create a stuck task (expired lease)
      const stuckTask = services.taskService.createTask({ title: 'Stuck task', project: 'inbox' });
      services.taskService.setStatus(stuckTask.task_id, TaskStatus.Ready);
      const pastLease = new Date(Date.now() - 60000).toISOString();
      services.taskService.claimTask(stuckTask.task_id, { author: 'agent-1', lease_until: pastLease });

      // Create a stale task (no checkpoint, no lease)
      const staleTask = services.taskService.createTask({ title: 'Stale task', project: 'inbox' });
      services.taskService.setStatus(staleTask.task_id, TaskStatus.Ready);
      services.taskService.claimTask(staleTask.task_id, { author: 'agent-2' });

      const result = runStuck({ services, json: false, stale: true, staleThresholdMinutes: 0 });
      const stuck = result.tasks.find(t => t.task_id === stuckTask.task_id);
      const stale = result.tasks.find(t => t.task_id === staleTask.task_id);

      expect(stuck?.reason).toBe('lease_expired');
      expect(stale?.reason).toBe('stale');
    });

    it('does not flag stale task that has checkpoints', () => {
      const task = services.taskService.createTask({ title: 'Active task', project: 'inbox' });
      services.taskService.setStatus(task.task_id, TaskStatus.Ready);
      services.taskService.claimTask(task.task_id, { author: 'agent-1' });
      services.taskService.addCheckpoint(task.task_id, 'started', {});

      const result = runStuck({ services, json: false, stale: true, staleThresholdMinutes: 0 });
      const found = result.tasks.find(t => t.task_id === task.task_id);
      expect(found).toBeUndefined();
    });
  });
});
