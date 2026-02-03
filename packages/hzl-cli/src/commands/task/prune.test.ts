// packages/hzl-cli/src/commands/task/prune.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TaskStatus } from 'hzl-core/events/types.js';
import { initializeDbFromPath } from '../../db.js';
import { runPrune } from './prune.js';
import os from 'os';
import path from 'path';

// Helper to create a timestamp in the future for asOf parameter.
// This is needed because pruning uses `terminal_at < threshold` (strict less-than),
// so tasks completed "now" aren't eligible when threshold is also "now".
// By setting asOf to the future, we make recently completed tasks eligible.
function futureTimestamp(daysFromNow: number = 1): string {
  const future = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return future.toISOString();
}

describe('task prune command', () => {
  let dbPath: string;
  let services: ReturnType<typeof initializeDbFromPath>;

  beforeEach(() => {
    const tmpDir = path.join(os.tmpdir(), `hzl-prune-test-${Date.now()}`);
    dbPath = path.join(tmpDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  describe('pruning with --yes', () => {
    it('returns empty result when no tasks exist', () => {
      const result = runPrune({
        services,
        project: 'inbox',
        olderThanDays: 30,
        yes: true,
        json: false,
      });

      expect(result).toEqual({
        pruned: [],
        count: 0,
        eventsDeleted: 0,
      });
    });

    it('prunes only tasks from specified project', () => {
      // Create projects first
      services.projectService.createProject('project-a');
      services.projectService.createProject('project-b');

      const taskA = services.taskService.createTask({
        title: 'Project A task',
        project: 'project-a',
      });
      const taskB = services.taskService.createTask({
        title: 'Project B task',
        project: 'project-b',
      });

      services.taskService.setStatus(taskA.task_id, TaskStatus.Ready);
      services.taskService.setStatus(taskB.task_id, TaskStatus.Ready);
      services.taskService.claimTask(taskA.task_id);
      services.taskService.claimTask(taskB.task_id);
      services.taskService.completeTask(taskA.task_id);
      services.taskService.completeTask(taskB.task_id);

      // Prune only project-a with --yes
      // Use asOf in the future to make recently completed tasks eligible
      const result = runPrune({
        services,
        project: 'project-a',
        olderThanDays: 0,
        asOf: futureTimestamp(),
        yes: true,
        json: false,
      });

      // Should have pruned exactly 1 task from project-a
      expect(result).not.toBeNull();
      expect(result!.count).toBe(1);
      expect(result!.pruned.every(t => t.project === 'project-a')).toBe(true);

      // project-b task should still exist
      const taskBAfter = services.taskService.getTaskById(taskB.task_id);
      expect(taskBAfter).not.toBeNull();
      expect(taskBAfter!.project).toBe('project-b');
    });

    it('prunes tasks in done status', () => {
      const task = services.taskService.createTask({
        title: 'Done task',
        project: 'inbox',
      });

      services.taskService.setStatus(task.task_id, TaskStatus.Ready);
      services.taskService.claimTask(task.task_id);
      services.taskService.completeTask(task.task_id);

      const result = runPrune({
        services,
        project: 'inbox',
        olderThanDays: 0,
        asOf: futureTimestamp(),
        yes: true,
        json: false,
      });

      expect(result).not.toBeNull();
      expect(result!.count).toBe(1);
      expect(result!.pruned[0].status).toBe('done');

      // Task should be gone
      expect(services.taskService.getTaskById(task.task_id)).toBeNull();
    });

    it('prunes tasks in archived status', () => {
      const task = services.taskService.createTask({
        title: 'Archived task',
        project: 'inbox',
      });

      services.taskService.setStatus(task.task_id, TaskStatus.Ready);
      services.taskService.archiveTask(task.task_id);

      const result = runPrune({
        services,
        project: 'inbox',
        olderThanDays: 0,
        asOf: futureTimestamp(),
        yes: true,
        json: false,
      });

      expect(result).not.toBeNull();
      expect(result!.count).toBe(1);
      expect(result!.pruned[0].status).toBe('archived');

      // Task should be gone
      expect(services.taskService.getTaskById(task.task_id)).toBeNull();
    });

    it('respects olderThanDays threshold', () => {
      const task = services.taskService.createTask({
        title: 'Recent task',
        project: 'inbox',
      });

      services.taskService.setStatus(task.task_id, TaskStatus.Ready);
      services.taskService.claimTask(task.task_id);
      services.taskService.completeTask(task.task_id);

      // Ask for tasks older than 365 days - should return empty
      const result = runPrune({
        services,
        project: 'inbox',
        olderThanDays: 365,
        yes: true,
        json: false,
      });

      expect(result).not.toBeNull();
      expect(result!.count).toBe(0);

      // Task should still exist (not old enough)
      expect(services.taskService.getTaskById(task.task_id)).not.toBeNull();
    });

    it('does NOT prune non-terminal tasks (safety check)', () => {
      // Create tasks in various non-terminal states
      const readyTask = services.taskService.createTask({
        title: 'Ready task',
        project: 'inbox',
      });
      services.taskService.setStatus(readyTask.task_id, TaskStatus.Ready);

      const inProgressTask = services.taskService.createTask({
        title: 'In progress task',
        project: 'inbox',
      });
      services.taskService.setStatus(inProgressTask.task_id, TaskStatus.Ready);
      services.taskService.claimTask(inProgressTask.task_id);

      const blockedTask = services.taskService.createTask({
        title: 'Blocked task',
        project: 'inbox',
      });
      services.taskService.setStatus(blockedTask.task_id, TaskStatus.Ready);
      services.taskService.claimTask(blockedTask.task_id);
      services.taskService.blockTask(blockedTask.task_id);

      // Also create a completed task to verify pruning works for terminal tasks
      const doneTask = services.taskService.createTask({
        title: 'Done task',
        project: 'inbox',
      });
      services.taskService.setStatus(doneTask.task_id, TaskStatus.Ready);
      services.taskService.claimTask(doneTask.task_id);
      services.taskService.completeTask(doneTask.task_id);

      const result = runPrune({
        services,
        project: 'inbox',
        olderThanDays: 0,
        asOf: futureTimestamp(),
        yes: true,
        json: false,
      });

      // Should only prune the done task, not the active ones
      expect(result).not.toBeNull();
      expect(result!.count).toBe(1);
      expect(result!.pruned[0].task_id).toBe(doneTask.task_id);

      // Non-terminal tasks should still exist
      expect(services.taskService.getTaskById(readyTask.task_id)).not.toBeNull();
      expect(services.taskService.getTaskById(inProgressTask.task_id)).not.toBeNull();
      expect(services.taskService.getTaskById(blockedTask.task_id)).not.toBeNull();

      // Terminal task should be gone
      expect(services.taskService.getTaskById(doneTask.task_id)).toBeNull();
    });

    it('prunes tasks from all projects when project is undefined (--all flag)', () => {
      // Create multiple projects with tasks
      services.projectService.createProject('all-prune-proj-1');
      services.projectService.createProject('all-prune-proj-2');

      const task1 = services.taskService.createTask({
        title: 'Task in project 1',
        project: 'all-prune-proj-1',
      });
      const task2 = services.taskService.createTask({
        title: 'Task in project 2',
        project: 'all-prune-proj-2',
      });

      // Complete both tasks
      services.taskService.setStatus(task1.task_id, TaskStatus.Ready);
      services.taskService.setStatus(task2.task_id, TaskStatus.Ready);
      services.taskService.claimTask(task1.task_id);
      services.taskService.claimTask(task2.task_id);
      services.taskService.completeTask(task1.task_id);
      services.taskService.completeTask(task2.task_id);

      // Prune with project: undefined (equivalent to --all)
      const result = runPrune({
        services,
        project: undefined, // --all flag
        olderThanDays: 0,
        asOf: futureTimestamp(),
        yes: true,
        json: false,
      });

      expect(result).not.toBeNull();
      expect(result!.count).toBe(2);

      // Both tasks should be gone
      expect(services.taskService.getTaskById(task1.task_id)).toBeNull();
      expect(services.taskService.getTaskById(task2.task_id)).toBeNull();
    });
  });

  describe('confirmation behavior (without --yes)', () => {
    it('returns null and does not prune when --yes not provided', () => {
      const task = services.taskService.createTask({
        title: 'Task to keep',
        project: 'inbox',
      });

      services.taskService.setStatus(task.task_id, TaskStatus.Ready);
      services.taskService.claimTask(task.task_id);
      services.taskService.completeTask(task.task_id);

      // Without --yes, should return null and NOT prune
      const result = runPrune({
        services,
        project: 'inbox',
        olderThanDays: 0,
        asOf: futureTimestamp(),
        yes: false,
        json: false,
      });

      expect(result).toBeNull();

      // Task should still exist (not pruned)
      const taskAfter = services.taskService.getTaskById(task.task_id);
      expect(taskAfter).not.toBeNull();
      expect(taskAfter!.status).toBe(TaskStatus.Done);
    });

    it('returns empty result when no eligible tasks even without --yes', () => {
      // No tasks exist, so result should be empty (not null)
      const result = runPrune({
        services,
        project: 'inbox',
        olderThanDays: 30,
        yes: false,
        json: false,
      });

      // When no eligible tasks, returns empty result regardless of --yes
      expect(result).toEqual({
        pruned: [],
        count: 0,
        eventsDeleted: 0,
      });
    });
  });

  describe('dry-run mode', () => {
    it('previews without deleting when dry-run is true', () => {
      const task = services.taskService.createTask({
        title: 'Task to prune',
        project: 'inbox',
      });

      services.taskService.setStatus(task.task_id, TaskStatus.Ready);
      services.taskService.claimTask(task.task_id);
      services.taskService.completeTask(task.task_id);

      const result = runPrune({
        services,
        project: 'inbox',
        olderThanDays: 0,
        asOf: futureTimestamp(),
        dryRun: true,
        json: false,
      });

      // Dry-run returns null
      expect(result).toBeNull();

      // Task should still exist after dry-run
      const taskAfter = services.taskService.getTaskById(task.task_id);
      expect(taskAfter).not.toBeNull();
      expect(taskAfter!.status).toBe(TaskStatus.Done);
    });

    it('dry-run does not require --yes', () => {
      const task = services.taskService.createTask({
        title: 'Task',
        project: 'inbox',
      });

      services.taskService.setStatus(task.task_id, TaskStatus.Ready);
      services.taskService.claimTask(task.task_id);
      services.taskService.completeTask(task.task_id);

      // Should not throw even without --yes when using dry-run
      const result = runPrune({
        services,
        project: 'inbox',
        olderThanDays: 0,
        asOf: futureTimestamp(),
        dryRun: true,
        yes: false,
        json: false,
      });

      expect(result).toBeNull();

      // Task should still exist
      expect(services.taskService.getTaskById(task.task_id)).not.toBeNull();
    });
  });

  describe('JSON output', () => {
    it('returns structured result with --json and --yes', () => {
      const task = services.taskService.createTask({
        title: 'Task',
        project: 'inbox',
      });

      services.taskService.setStatus(task.task_id, TaskStatus.Ready);
      services.taskService.claimTask(task.task_id);
      services.taskService.completeTask(task.task_id);

      const result = runPrune({
        services,
        project: 'inbox',
        olderThanDays: 0,
        asOf: futureTimestamp(),
        yes: true,
        json: true,
      });

      expect(result).not.toBeNull();
      expect(result!.count).toBe(1);
      expect(result!.pruned).toHaveLength(1);
      expect(result!.eventsDeleted).toBeGreaterThan(0);
    });

    it('returns empty result with --json and --yes when no eligible tasks', () => {
      const result = runPrune({
        services,
        project: 'inbox',
        olderThanDays: 1,
        yes: true,
        json: true,
      });

      expect(result).toEqual({
        pruned: [],
        count: 0,
        eventsDeleted: 0,
      });
    });
  });
});
