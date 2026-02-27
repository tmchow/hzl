// packages/hzl-cli/src/commands/claim.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { calculateClaimStaggerOffsetMs, runClaim, runClaimNext } from './claim.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runClaim', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-claim-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('claims a ready task', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);

    const result = runClaim({
      services,
      taskId: task.task_id,
      agent: 'test-agent',
      json: false,
    });

    expect(result.task_id).toBe(task.task_id);
    expect(result.status).toBe(TaskStatus.InProgress);
    expect(result.agent).toBe('test-agent');
    expect(result.decision_trace.mode).toBe('explicit');
    expect(result.decision_trace.outcome.reason_code).toBe('claimed');
  });

  it('sets lease when specified', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);

    const result = runClaim({
      services,
      taskId: task.task_id,
      agent: 'test-agent',
      leaseMinutes: 30,
      json: false,
    });

    expect(result.lease_until).toBeDefined();
  });

  it('includes hint in error when task is not claimable', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });
    // Task is in backlog - not claimable

    expect(() => runClaim({
      services,
      taskId: task.task_id,
      agent: 'test-agent',
      json: false,
    })).toThrow(/Hint:.*set-status/);
  });

  it('claims next eligible task when using next mode', () => {
    const low = services.taskService.createTask({ title: 'Low', project: 'inbox', priority: 0 });
    const high = services.taskService.createTask({ title: 'High', project: 'inbox', priority: 3 });
    services.taskService.setStatus(low.task_id, TaskStatus.Ready);
    services.taskService.setStatus(high.task_id, TaskStatus.Ready);

    const result = runClaimNext({
      services,
      agent: 'agent-1',
      json: false,
    });

    expect(result.task_id).toBe(high.task_id);
    expect(result.agent).toBe('agent-1');
    expect(result.decision_trace.mode).toBe('next');
    expect(result.decision_trace.outcome.reason_code).toBe('claimed');
  });

  it('returns no-candidates decision trace when no eligible tasks exist in next mode', () => {
    const result = runClaimNext({
      services,
      agent: 'agent-1',
      json: false,
    });

    expect(result.task_id).toBeNull();
    expect(result.task).toBeNull();
    expect(result.decision_trace.outcome.reason_code).toBe('no_candidates');
  });

  it('supports full view payload for explicit claim', () => {
    const task = services.taskService.createTask({
      title: 'Detailed',
      project: 'inbox',
      description: 'Long markdown body',
      tags: ['a', 'b'],
      links: ['https://example.com'],
      metadata: { foo: 'bar' },
    });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);

    const result = runClaim({
      services,
      taskId: task.task_id,
      agent: 'test-agent',
      view: 'full',
      json: false,
    });

    expect(result.task?.description).toBe('Long markdown body');
    expect(result.task?.metadata).toEqual({ foo: 'bar' });
    expect(result.task?.links).toEqual(['https://example.com']);
  });

  it('computes deterministic anti-herd offsets in range', () => {
    const offset = calculateClaimStaggerOffsetMs('agent-1', 1000, 1_700_000_000_000);
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(offset).toBeLessThan(1000);

    const sameOffset = calculateClaimStaggerOffsetMs('agent-1', 1000, 1_700_000_000_000);
    expect(sameOffset).toBe(offset);
  });

  it('changes offset across time buckets', () => {
    const offsets = Array.from({ length: 6 }, (_, index) =>
      calculateClaimStaggerOffsetMs('agent-1', 1000, 1_700_000_000_000 + index * 1000)
    );
    expect(new Set(offsets).size).toBeGreaterThan(1);
  });
});
