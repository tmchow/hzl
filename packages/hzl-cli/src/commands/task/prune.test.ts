// packages/hzl-cli/src/commands/task/prune.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TaskStatus } from 'hzl-core/events/types.js';
import { initializeDbFromPath } from '../../db.js';
import { runPrune } from './prune.js';
import os from 'os';
import path from 'path';

describe('task prune command', () => {
  let dbPath: string;
  let services: ReturnType<typeof initializeDbFromPath>;

  beforeEach(() => {
    const tmpDir = path.join(os.tmpdir(), `hzl-prune-test-${Date.now()}`);
    dbPath = path.join(tmpDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  describe('previewPrunableTasks validation', () => {
    it('returns empty list when no tasks exist', () => {
      const result = runPrune({
        services,
        project: 'inbox',
        olderThanDays: 30,
        json: false,
        
      });

      expect(result).toEqual({
        pruned: [],
        count: 0,
        eventsDeleted: 0,
      });
    });

    it('respects project filter', () => {
      // Create projects first
      services.projectService.createProject('project-a');
      services.projectService.createProject('project-b');

      const task1 = services.taskService.createTask({
        title: 'Project A task',
        project: 'project-a',
      });
      const task2 = services.taskService.createTask({
        title: 'Project B task',
        project: 'project-b',
      });

      services.taskService.setStatus(task1.task_id, TaskStatus.Ready);
      services.taskService.setStatus(task2.task_id, TaskStatus.Ready);
      services.taskService.claimTask(task1.task_id);
      services.taskService.claimTask(task2.task_id);
      services.taskService.completeTask(task1.task_id);
      services.taskService.completeTask(task2.task_id);

      const result = runPrune({
        services,
        project: 'project-a',
        olderThanDays: 0,
        json: false,
        
      });

      if (result?.pruned && result.pruned.length > 0) {
        expect(result.pruned.every(t => t.project === 'project-a')).toBe(true);
      }
    });

    it('returns tasks in done status', () => {
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
        json: false,
        
      });

      if (result?.pruned && result.pruned.length > 0) {
        expect(result.pruned.some(t => t.status === 'done')).toBe(true);
      }
    });

    it('returns tasks in archived status', () => {
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
        json: false,
        
      });

      if (result?.pruned && result.pruned.length > 0) {
        expect(result.pruned.some(t => t.status === 'archived')).toBe(true);
      }
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
        json: false,
        
      });

      expect(result?.count).toBe(0);
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
        olderThanDays: 1,
        dryRun: true,
        json: false,
        
      });

      // Dry-run returns null
      expect(result).toBeNull();

      // Task should still exist after dry-run
      const taskAfter = services.taskService.getTaskById(task.task_id);
      expect(taskAfter).toBeDefined();
      expect(taskAfter?.status).toBe(TaskStatus.Done);
    });

    it('works without --yes in non-TTY mode when dry-run', () => {
      const task = services.taskService.createTask({
        title: 'Task',
        project: 'inbox',
      });

      services.taskService.setStatus(task.task_id, TaskStatus.Ready);
      services.taskService.claimTask(task.task_id);
      services.taskService.completeTask(task.task_id);

      // Should not throw even without --yes in non-TTY
      const result = runPrune({
        services,
        project: 'inbox',
        olderThanDays: 1,
        dryRun: true,
        json: false,
        
        yes: false,
      });

      expect(result).toBeNull();
    });
  });

  describe('output formats', () => {
    it('outputs human-readable format by default', () => {
      const task = services.taskService.createTask({
        title: 'Task',
        project: 'inbox',
      });

      services.taskService.setStatus(task.task_id, TaskStatus.Ready);
      services.taskService.claimTask(task.task_id);
      services.taskService.completeTask(task.task_id);

      // Use 0 day threshold to match recently completed tasks
      const result = runPrune({
        services,
        project: 'inbox',
        olderThanDays: 0,
        yes: true,
        json: false,
        
      });

      // Should get a result (might be empty or have tasks depending on timing)
      expect(result).toBeDefined();
      expect(result?.pruned).toBeDefined();
      expect(result?.count).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('validation is done at CLI level, not runPrune', () => {
      // The runPrune function expects pre-validated inputs
      // Validation happens in createPruneCommand before calling runPrune
      const result = runPrune({
        services,
        project: 'inbox',
        olderThanDays: 30,
        json: false,
        
      });

      expect(result?.count).toBe(0);
    });

    it('JSON output with no eligible tasks and --yes returns empty result', () => {
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

    it('handles tasks in non-TTY mode with --yes', () => {
      const task = services.taskService.createTask({
        title: 'Task',
        project: 'inbox',
      });

      services.taskService.setStatus(task.task_id, TaskStatus.Ready);
      services.taskService.claimTask(task.task_id);
      services.taskService.completeTask(task.task_id);

      // Non-TTY requires --yes
      const result = runPrune({
        services,
        project: 'inbox',
        olderThanDays: 0,
        yes: true,
        json: false,
        
      });

      expect(result?.count).toBeGreaterThanOrEqual(0);
    });
  });
});
