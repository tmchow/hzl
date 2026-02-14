// packages/hzl-cli/src/commands/next.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runNext } from './next.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('runNext', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-next-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null when no tasks available', () => {
    const result = runNext({ services, json: false });
    expect(result).toBeNull();
  });

  it('returns next available task sorted by priority', () => {
    const low = services.taskService.createTask({ title: 'Low priority', project: 'inbox', priority: 0 });
    const high = services.taskService.createTask({ title: 'High priority', project: 'inbox', priority: 3 });
    
    services.taskService.setStatus(low.task_id, TaskStatus.Ready);
    services.taskService.setStatus(high.task_id, TaskStatus.Ready);

    const result = runNext({ services, json: false });
    expect(result?.task_id).toBe(high.task_id);
  });

  it('respects project filter', () => {
    services.projectService.createProject('project-a');
    services.projectService.createProject('project-b');
    const taskA = services.taskService.createTask({ title: 'Task A', project: 'project-a' });
    const taskB = services.taskService.createTask({ title: 'Task B', project: 'project-b' });
    
    services.taskService.setStatus(taskA.task_id, TaskStatus.Ready);
    services.taskService.setStatus(taskB.task_id, TaskStatus.Ready);

    const result = runNext({ services, project: 'project-b', json: false });
    expect(result?.task_id).toBe(taskB.task_id);
  });

  it('skips tasks with incomplete dependencies', () => {
    const dep = services.taskService.createTask({ title: 'Dependency', project: 'inbox' });
    const main = services.taskService.createTask({ title: 'Main task', project: 'inbox', depends_on: [dep.task_id] });

    services.taskService.setStatus(dep.task_id, TaskStatus.Ready);
    services.taskService.setStatus(main.task_id, TaskStatus.Ready);

    const result = runNext({ services, json: false });
    // Should get the dependency first since main has incomplete deps
    expect(result?.task_id).toBe(dep.task_id);
  });

  it('skips parent tasks (returns leaf tasks only)', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    services.taskService.setStatus(parent.task_id, TaskStatus.Ready);
    const child = services.taskService.createTask({
      title: 'Child',
      project: 'myproject',
      parent_id: parent.task_id
    });
    services.taskService.setStatus(child.task_id, TaskStatus.Ready);

    const result = runNext({ services, project: 'myproject', json: false });
    expect(result?.task_id).toBe(child.task_id); // Returns child, not parent
  });

  it('returns standalone tasks (no children, no parent)', () => {
    services.projectService.createProject('myproject');
    const standalone = services.taskService.createTask({ title: 'Standalone', project: 'myproject' });
    services.taskService.setStatus(standalone.task_id, TaskStatus.Ready);

    const result = runNext({ services, project: 'myproject', json: false });
    expect(result?.task_id).toBe(standalone.task_id);
  });

  it('filters by parent with --parent flag', () => {
    services.projectService.createProject('myproject');
    const parent1 = services.taskService.createTask({ title: 'Parent 1', project: 'myproject' });
    const parent2 = services.taskService.createTask({ title: 'Parent 2', project: 'myproject' });
    const child1 = services.taskService.createTask({
      title: 'Child of P1',
      project: 'myproject',
      parent_id: parent1.task_id
    });
    services.taskService.setStatus(child1.task_id, TaskStatus.Ready);
    const child2 = services.taskService.createTask({
      title: 'Child of P2',
      project: 'myproject',
      parent_id: parent2.task_id
    });
    services.taskService.setStatus(child2.task_id, TaskStatus.Ready);

    const result = runNext({ services, parent: parent1.task_id, json: false });
    expect(result?.task_id).toBe(child1.task_id);
  });

  it('never returns parent even when all subtasks done', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    services.taskService.setStatus(parent.task_id, TaskStatus.Ready);
    const child = services.taskService.createTask({
      title: 'Child',
      project: 'myproject',
      parent_id: parent.task_id
    });
    services.taskService.setStatus(child.task_id, TaskStatus.Done);

    const result = runNext({ services, project: 'myproject', json: false });
    expect(result).toBeNull(); // No available leaf tasks
  });

  it('errors when parent task does not exist', () => {
    expect(() => runNext({
      services,
      parent: 'nonexistent_task_id',
      json: false,
    })).toThrow(/parent.*not found/i);
  });

  describe('--claim', () => {
    it('claims the found task', () => {
      const task = services.taskService.createTask({ title: 'Claimable', project: 'inbox' });
      services.taskService.setStatus(task.task_id, TaskStatus.Ready);

      const result = runNext({ services, claim: true, json: false });
      expect(result).not.toBeNull();
      expect(result!.task_id).toBe(task.task_id);
      expect(result!.status).toBe('in_progress');
      expect(result!.claimed).toBe(true);

      // Verify task is actually claimed in the database
      const updated = services.taskService.getTaskById(task.task_id);
      expect(updated!.status).toBe('in_progress');
    });

    it('sets assignee when provided', () => {
      const task = services.taskService.createTask({ title: 'Assignable', project: 'inbox' });
      services.taskService.setStatus(task.task_id, TaskStatus.Ready);

      const result = runNext({ services, claim: true, assignee: 'agent-42', json: false });
      expect(result).not.toBeNull();
      expect(result!.assignee).toBe('agent-42');
    });

    it('returns null when no tasks available', () => {
      const result = runNext({ services, claim: true, json: false });
      expect(result).toBeNull();
    });

    it('includes claim fields in JSON output', () => {
      const task = services.taskService.createTask({ title: 'JSON claim', project: 'inbox' });
      services.taskService.setStatus(task.task_id, TaskStatus.Ready);

      const result = runNext({ services, claim: true, json: true });
      expect(result).not.toBeNull();
      expect(result!.claimed).toBe(true);
      expect(result!.status).toBe('in_progress');
      expect(result).toHaveProperty('assignee');
      expect(result).toHaveProperty('lease_until');
    });
  });
});
