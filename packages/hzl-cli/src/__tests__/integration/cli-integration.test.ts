// packages/hzl-cli/src/__tests__/integration/cli-integration.test.ts
// End-to-end integration tests for CLI commands using service layer directly
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { runInit } from '../../commands/init.js';
import { runWhichDb } from '../../commands/which-db.js';
import { runAdd } from '../../commands/add.js';
import { runList } from '../../commands/list.js';
import { runShow } from '../../commands/show.js';
import { runSetStatus } from '../../commands/set-status.js';
import { runClaim } from '../../commands/claim.js';
import { runComplete } from '../../commands/complete.js';
import { runArchive } from '../../commands/archive.js';
import { runNext } from '../../commands/next.js';
import { runAddDep } from '../../commands/add-dep.js';
import { runRemoveDep } from '../../commands/remove-dep.js';
import { runComment } from '../../commands/comment.js';
import { runCheckpoint } from '../../commands/checkpoint.js';
import { runSearch } from '../../commands/search.js';
import { runProjects } from '../../commands/projects.js';
import { runMove } from '../../commands/move.js';
import { runRenameProject } from '../../commands/rename-project.js';
import { runHistory } from '../../commands/history.js';
import { runStats } from '../../commands/stats.js';
import { runValidate } from '../../commands/validate.js';
import { runExportEvents } from '../../commands/export-events.js';
import { runRelease } from '../../commands/release.js';
import { runReopen } from '../../commands/reopen.js';
import { runSteal } from '../../commands/steal.js';
import { runStuck } from '../../commands/stuck.js';

describe('CLI Integration Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-integration-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDb(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('init command', () => {
    it('creates database file', async () => {
      const newDbPath = path.join(tempDir, 'new.db');
      await runInit({ dbPath: newDbPath, json: false });
      expect(fs.existsSync(newDbPath)).toBe(true);
    });

    it('is idempotent', async () => {
      const newDbPath = path.join(tempDir, 'new.db');
      await runInit({ dbPath: newDbPath, json: false });
      await runInit({ dbPath: newDbPath, json: false });
      expect(fs.existsSync(newDbPath)).toBe(true);
    });

    it('returns path information', async () => {
      const newDbPath = path.join(tempDir, 'new.db');
      const result = await runInit({ dbPath: newDbPath, json: true });
      expect(result.path).toBe(newDbPath);
      expect(result.created).toBe(true);
    });
  });

  describe('which-db command', () => {
    it('returns resolved database path', () => {
      const result = runWhichDb({ cliPath: dbPath, json: true });
      expect(result.path).toBe(dbPath);
      expect(result.source).toBe('cli');
    });
  });

  describe('task lifecycle round-trip', () => {
    it('creates, lists, claims, completes, and archives a task', () => {
      // Create task
      const created = runAdd({
        services,
        project: 'inbox',
        title: 'Test task',
        priority: 2,
        tags: ['urgent', 'backend'],
        json: true,
      });
      expect(created.title).toBe('Test task');
      const taskId = created.task_id;

      // List tasks
      const listResult = runList({ services, project: 'inbox', json: true });
      expect(listResult.tasks).toHaveLength(1);
      expect(listResult.tasks[0].status).toBe('backlog');

      // Set to ready
      runSetStatus({ services, taskId, status: 'ready', json: true });
      const afterReady = runShow({ services, taskId, json: true });
      expect(afterReady!.task.status).toBe('ready');

      // Claim task
      const claimed = runClaim({ services, taskId, author: 'agent-1', leaseMinutes: 30, json: true });
      expect(claimed.status).toBe('in_progress');
      expect(claimed.claimed_by_author).toBe('agent-1');

      // Complete task
      const completed = runComplete({ services, taskId, json: true });
      expect(completed.status).toBe('done');

      // Archive task
      const archived = runArchive({ services, taskId, json: true });
      expect(archived.status).toBe('archived');
    });

    it('next command respects priority ordering', () => {
      // Create tasks with different priorities
      runAdd({ services, project: 'inbox', title: 'Low priority', priority: 0, json: true });
      const high = runAdd({ services, project: 'inbox', title: 'High priority', priority: 3, json: true });
      runAdd({ services, project: 'inbox', title: 'Medium priority', priority: 1, json: true });

      // Set all to ready
      const tasks = runList({ services, project: 'inbox', json: true });
      for (const task of tasks.tasks) {
        runSetStatus({ services, taskId: task.task_id, status: 'ready', json: true });
      }

      // Next should get highest priority
      const next = runNext({ services, project: 'inbox', json: true });
      expect(next!.task_id).toBe(high.task_id);
    });

    it('next respects dependency ordering', () => {
      const dep = runAdd({ services, project: 'inbox', title: 'Dependency task', json: true });
      const main = runAdd({ services, project: 'inbox', title: 'Main task', dependsOn: [dep.task_id], json: true });

      // Set both to ready
      runSetStatus({ services, taskId: dep.task_id, status: 'ready', json: true });
      runSetStatus({ services, taskId: main.task_id, status: 'ready', json: true });

      // Next should skip main (has incomplete dep)
      const next1 = runNext({ services, project: 'inbox', json: true });
      expect(next1!.task_id).toBe(dep.task_id);

      // Claim and complete dep
      runClaim({ services, taskId: dep.task_id, author: 'agent-1', json: true });
      runComplete({ services, taskId: dep.task_id, json: true });

      // Now main should be claimable via next
      const next2 = runNext({ services, project: 'inbox', json: true });
      expect(next2!.task_id).toBe(main.task_id);
    });
  });

  describe('dependency management round-trip', () => {
    it('adds and removes dependencies', () => {
      const task1 = runAdd({ services, project: 'inbox', title: 'Task 1', json: true });
      const task2 = runAdd({ services, project: 'inbox', title: 'Task 2', json: true });

      // Add dependency
      const addResult = runAddDep({ services, taskId: task2.task_id, dependsOnId: task1.task_id, json: true });
      expect(addResult.task_id).toBe(task2.task_id);
      expect(addResult.depends_on_id).toBe(task1.task_id);

      // Verify via direct DB query that dependency was added
      const deps = services.db.prepare(
        'SELECT depends_on_id FROM task_dependencies WHERE task_id = ?'
      ).all(task2.task_id) as { depends_on_id: string }[];
      expect(deps.map(d => d.depends_on_id)).toContain(task1.task_id);

      // Remove dependency
      runRemoveDep({ services, taskId: task2.task_id, dependsOnId: task1.task_id, json: true });
      
      // Verify dependency was removed
      const depsAfter = services.db.prepare(
        'SELECT depends_on_id FROM task_dependencies WHERE task_id = ?'
      ).all(task2.task_id) as { depends_on_id: string }[];
      expect(depsAfter.map(d => d.depends_on_id)).not.toContain(task1.task_id);
    });

    it('rejects cyclic dependencies', () => {
      const task1 = runAdd({ services, project: 'inbox', title: 'Task 1', json: true });
      const task2 = runAdd({ services, project: 'inbox', title: 'Task 2', json: true });

      runAddDep({ services, taskId: task2.task_id, dependsOnId: task1.task_id, json: true });

      // Adding reverse dependency should fail
      expect(() => runAddDep({ services, taskId: task1.task_id, dependsOnId: task2.task_id, json: true }))
        .toThrow(/cycle/i);
    });
  });

  describe('comment and checkpoint round-trip', () => {
    it('adds comments and retrieves them', () => {
      const task = runAdd({ services, project: 'inbox', title: 'Test task', json: true });

      runComment({ services, taskId: task.task_id, text: 'First comment', author: 'user-1', json: true });
      runComment({ services, taskId: task.task_id, text: 'Second comment', author: 'user-2', json: true });

      const details = runShow({ services, taskId: task.task_id, json: true });
      expect(details!.comments).toHaveLength(2);
      expect(details!.comments[0].text).toBe('First comment');
    });

    it('adds checkpoints and retrieves them', () => {
      const task = runAdd({ services, project: 'inbox', title: 'Test task', json: true });

      runCheckpoint({ services, taskId: task.task_id, name: 'step1', data: { progress: 25 }, json: true });
      runCheckpoint({ services, taskId: task.task_id, name: 'step2', data: { progress: 50 }, json: true });

      const details = runShow({ services, taskId: task.task_id, json: true });
      expect(details!.checkpoints).toHaveLength(2);
      expect(details!.checkpoints[0].name).toBe('step1');
      expect(details!.checkpoints[0].data.progress).toBe(25);
    });
  });

  describe('search round-trip', () => {
    it('indexes and finds tasks by title', () => {
      runAdd({ services, project: 'inbox', title: 'Implement OAuth authentication', json: true });
      runAdd({ services, project: 'inbox', title: 'Write unit tests', json: true });
      runAdd({ services, project: 'inbox', title: 'Setup CI pipeline', json: true });

      const results = runSearch({ services, query: 'authentication', json: true });
      expect(results.tasks).toHaveLength(1);
      expect(results.tasks[0].title).toContain('OAuth');
    });

    it('finds tasks by description', () => {
      runAdd({ services, project: 'inbox', title: 'Backend task', description: 'Implement REST API endpoints', json: true });
      runAdd({ services, project: 'inbox', title: 'Frontend task', description: 'Create React components', json: true });

      const results = runSearch({ services, query: 'REST', json: true });
      expect(results.tasks).toHaveLength(1);
      expect(results.tasks[0].title).toBe('Backend task');
    });
  });

  describe('project management round-trip', () => {
    it('lists projects with task counts', () => {
      runAdd({ services, project: 'project-a', title: 'Task 1', json: true });
      runAdd({ services, project: 'project-a', title: 'Task 2', json: true });
      runAdd({ services, project: 'project-b', title: 'Task 3', json: true });

      const projects = runProjects({ services, json: true });
      expect(projects.projects).toHaveLength(2);

      const projectA = projects.projects.find((p: any) => p.name === 'project-a');
      expect(projectA?.task_count).toBe(2);
    });

    it('moves tasks between projects', () => {
      const task = runAdd({ services, project: 'project-a', title: 'Movable task', json: true });

      runMove({ services, taskId: task.task_id, toProject: 'project-b', json: true });

      const afterMove = runShow({ services, taskId: task.task_id, json: true });
      expect(afterMove!.task.project).toBe('project-b');
    });

    it('renames project by moving all tasks', () => {
      runAdd({ services, project: 'old-project', title: 'Task 1', json: true });
      runAdd({ services, project: 'old-project', title: 'Task 2', json: true });

      runRenameProject({ services, from: 'old-project', to: 'new-project', force: false, json: true });

      const projects = runProjects({ services, json: true });
      const names = projects.projects.map((p: any) => p.name);
      expect(names).toContain('new-project');
      expect(names).not.toContain('old-project');
    });
  });

  describe('history and event tracking', () => {
    it('shows full event history for a task', () => {
      const task = runAdd({ services, project: 'inbox', title: 'Test task', json: true });
      runSetStatus({ services, taskId: task.task_id, status: 'ready', json: true });
      runClaim({ services, taskId: task.task_id, author: 'agent-1', json: true });
      runComment({ services, taskId: task.task_id, text: 'Working on it', json: true });
      runComplete({ services, taskId: task.task_id, json: true });

      const history = runHistory({ services, taskId: task.task_id, json: true });
      const eventTypes = history.events.map((e: any) => e.type);

      expect(eventTypes).toContain('task_created');
      expect(eventTypes).toContain('status_changed');
      expect(eventTypes).toContain('comment_added');
    });
  });

  describe('stats command', () => {
    it('returns task counts by status', () => {
      // Create tasks in various states
      const t1 = runAdd({ services, project: 'inbox', title: 'Backlog task', json: true });
      const t2 = runAdd({ services, project: 'inbox', title: 'Ready task', json: true });
      const t3 = runAdd({ services, project: 'inbox', title: 'In progress task', json: true });
      const t4 = runAdd({ services, project: 'inbox', title: 'Done task', json: true });

      runSetStatus({ services, taskId: t2.task_id, status: 'ready', json: true });
      runSetStatus({ services, taskId: t3.task_id, status: 'ready', json: true });
      runClaim({ services, taskId: t3.task_id, author: 'agent-1', json: true });
      runSetStatus({ services, taskId: t4.task_id, status: 'ready', json: true });
      runClaim({ services, taskId: t4.task_id, author: 'agent-1', json: true });
      runComplete({ services, taskId: t4.task_id, json: true });

      const stats = runStats({ services, project: 'inbox', json: true });

      expect(stats.by_status.backlog).toBe(1);
      expect(stats.by_status.ready).toBe(1);
      expect(stats.by_status.in_progress).toBe(1);
      expect(stats.by_status.done).toBe(1);
    });
  });

  describe('validate command', () => {
    it('validates a clean database successfully', () => {
      runAdd({ services, project: 'inbox', title: 'Task 1', json: true });
      runAdd({ services, project: 'inbox', title: 'Task 2', json: true });

      const result = runValidate({ services, json: true });
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('export-events command', () => {
    it('exports events to JSONL file', () => {
      runAdd({ services, project: 'inbox', title: 'Task 1', json: true });
      runAdd({ services, project: 'inbox', title: 'Task 2', json: true });

      const exportPath = path.join(tempDir, 'events.jsonl');
      runExportEvents({ services, outputPath: exportPath, json: true });

      expect(fs.existsSync(exportPath)).toBe(true);
      const content = fs.readFileSync(exportPath, 'utf-8');
      const lines = content.trim().split('\n').filter((l) => l.length > 0);
      expect(lines).toHaveLength(2);

      // Verify each line is valid JSON
      for (const line of lines) {
        const event = JSON.parse(line);
        expect(event.type).toBe('task_created');
        expect(event.event_id).toBeDefined();
      }
    });
  });

  describe('release and reopen commands', () => {
    it('releases a claimed task back to ready', () => {
      const task = runAdd({ services, project: 'inbox', title: 'Task to release', json: true });
      runSetStatus({ services, taskId: task.task_id, status: 'ready', json: true });
      runClaim({ services, taskId: task.task_id, author: 'agent-1', json: true });

      const released = runRelease({ services, taskId: task.task_id, json: true });
      expect(released.status).toBe('ready');
      expect(released.claimed_by_author).toBeNull();
    });

    it('reopens a done task', () => {
      const task = runAdd({ services, project: 'inbox', title: 'Task to reopen', json: true });
      runSetStatus({ services, taskId: task.task_id, status: 'ready', json: true });
      runClaim({ services, taskId: task.task_id, author: 'agent-1', json: true });
      runComplete({ services, taskId: task.task_id, json: true });

      const reopened = runReopen({ services, taskId: task.task_id, json: true });
      expect(reopened.status).toBe('ready');
    });
  });

  describe('steal and stuck commands', () => {
    it('steals a task with force flag', () => {
      const task = runAdd({ services, project: 'inbox', title: 'Task to steal', json: true });
      runSetStatus({ services, taskId: task.task_id, status: 'ready', json: true });
      runClaim({ services, taskId: task.task_id, author: 'agent-1', leaseMinutes: 60, json: true });

      const stolen = runSteal({ services, taskId: task.task_id, force: true, newOwner: 'agent-2', json: true });
      expect(stolen.claimed_by_author).toBe('agent-2');
    });

    it('lists stuck tasks with expired leases', () => {
      const task = runAdd({ services, project: 'inbox', title: 'Stuck task', json: true });
      runSetStatus({ services, taskId: task.task_id, status: 'ready', json: true });
      // Use a lease that expires immediately (in the past)
      const pastLease = new Date(Date.now() - 60000).toISOString();
      services.taskService.claimTask(task.task_id, { author: 'stalled-agent', lease_until: pastLease });

      // The stuck command should find tasks with expired leases
      const stuckResult = runStuck({ services, olderThanMinutes: 0, json: true });
      expect(stuckResult.tasks.length).toBeGreaterThanOrEqual(1);
    });
  });
});
