// packages/hzl-web/src/server.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWebServer, type ServerHandle } from './server.js';
import { createTestDb } from 'hzl-core/db/test-utils';
import { EventStore } from 'hzl-core/events/store';
import { ProjectionEngine } from 'hzl-core/projections/engine';
import { TasksCurrentProjector } from 'hzl-core/projections/tasks-current';
import { DependenciesProjector } from 'hzl-core/projections/dependencies';
import { CommentsCheckpointsProjector } from 'hzl-core/projections/comments-checkpoints';
import { ProjectsProjector } from 'hzl-core/projections/projects';
import { TaskService } from 'hzl-core/services/task-service';
import { ProjectService } from 'hzl-core/services/project-service';
import { TaskStatus } from 'hzl-core/events/types';
import Database from 'libsql';

describe('hzl-web server', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let projectionEngine: ProjectionEngine;
  let taskService: TaskService;
  let projectService: ProjectService;
  let server: ServerHandle;

  beforeEach(() => {
    db = createTestDb();
    eventStore = new EventStore(db);
    projectionEngine = new ProjectionEngine(db);
    projectionEngine.register(new TasksCurrentProjector());
    projectionEngine.register(new DependenciesProjector());
    projectionEngine.register(new CommentsCheckpointsProjector());
    projectionEngine.register(new ProjectsProjector());

    projectService = new ProjectService(db, eventStore, projectionEngine);
    projectService.ensureInboxExists();
    projectService.createProject('test-project');

    taskService = new TaskService(db, eventStore, projectionEngine, projectService);
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
    db.close();
  });

  function createServer(port: number, host = '127.0.0.1'): ServerHandle {
    server = createWebServer({ port, host, taskService, eventStore });
    return server;
  }

  async function fetchJson(path: string): Promise<{ status: number; data: unknown }> {
    const res = await globalThis.fetch(`${server.url}${path}`);
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }

  describe('server configuration', () => {
    it('starts on specified port', async () => {
      const s = createServer(4500);
      await new Promise((r) => setTimeout(r, 20));
      expect(s.port).toBe(4500);
      expect(s.url).toContain('4500');
    });

    it('binds to specified host', async () => {
      const s = createServer(4501, '127.0.0.1');
      await new Promise((r) => setTimeout(r, 20));
      expect(s.host).toBe('127.0.0.1');
    });

    it('defaults host to localhost in URL when using 0.0.0.0', async () => {
      const s = createServer(4502, '0.0.0.0');
      await new Promise((r) => setTimeout(r, 20));
      expect(s.url).toBe('http://localhost:4502');
    });

    it('closes gracefully', async () => {
      const s = createServer(4503);
      // Wait until server responds to prove it's ready (retry on connection refused)
      for (let i = 0; i < 20; i++) {
        try {
          await globalThis.fetch(s.url);
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 10));
        }
      }
      await expect(s.close()).resolves.not.toThrow();
      // Prevent afterEach from closing again
      server = undefined as unknown as ServerHandle;
    });
  });

  describe('GET /api/tasks', () => {
    it('returns empty task list initially', async () => {
      createServer(4510);
      const { status, data } = await fetchJson('/api/tasks');

      expect(status).toBe(200);
      expect(data).toMatchObject({
        tasks: [],
        since: '3d',
        project: null,
      });
    });

    it('returns tasks after creation', async () => {
      taskService.createTask({
        title: 'Test Task',
        project: 'test-project',
        priority: 3,
      });

      createServer(4511);
      const { status, data } = await fetchJson('/api/tasks');

      expect(status).toBe(200);
      const tasks = (data as { tasks: unknown[] }).tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({
        title: 'Test Task',
        project: 'test-project',
      });
    });

    it('filters by project', async () => {
      projectService.createProject('other-project');
      taskService.createTask({ title: 'Task 1', project: 'test-project' });
      taskService.createTask({ title: 'Task 2', project: 'other-project' });

      createServer(4512);
      const { data } = await fetchJson('/api/tasks?project=test-project');

      const tasks = (data as { tasks: Array<{ title: string }> }).tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Task 1');
    });

    it('respects since parameter', async () => {
      createServer(4513);
      const { data } = await fetchJson('/api/tasks?since=7d');

      expect((data as { since: string }).since).toBe('7d');
    });

    it('marks blocked tasks', async () => {
      // Blocker task stays in backlog (not done)
      const blocker = taskService.createTask({
        title: 'Blocker',
        project: 'test-project',
      });
      // Blocked task depends on blocker and is set to ready
      const blocked = taskService.createTask({
        title: 'Blocked Task',
        project: 'test-project',
        depends_on: [blocker.task_id],
      });
      // Set blocked task to ready so it appears as "blocked" in the UI
      taskService.setStatus(blocked.task_id, TaskStatus.Ready);

      createServer(4514);
      const { data } = await fetchJson('/api/tasks');

      const tasks = (data as { tasks: Array<{ title: string; blocked_by: string[] | null }> }).tasks;
      const blockedTask = tasks.find((t) => t.title === 'Blocked Task');
      expect(blockedTask?.blocked_by).toContain(blocker.task_id);
    });

    it('includes subtask_count for parent tasks', async () => {
      const parent = taskService.createTask({
        title: 'Parent Task',
        project: 'test-project',
      });
      taskService.createTask({
        title: 'Child 1',
        project: 'test-project',
        parent_id: parent.task_id,
      });
      taskService.createTask({
        title: 'Child 2',
        project: 'test-project',
        parent_id: parent.task_id,
      });

      createServer(4515);
      const { data } = await fetchJson('/api/tasks');

      const tasks = (data as { tasks: Array<{ title: string; subtask_count: number }> }).tasks;
      const parentTask = tasks.find((t) => t.title === 'Parent Task');
      expect(parentTask?.subtask_count).toBe(2);
    });

    it('excludes archived subtasks from subtask_count', async () => {
      const parent = taskService.createTask({
        title: 'Parent Task',
        project: 'test-project',
      });
      const child1 = taskService.createTask({
        title: 'Child 1',
        project: 'test-project',
        parent_id: parent.task_id,
      });
      taskService.createTask({
        title: 'Child 2',
        project: 'test-project',
        parent_id: parent.task_id,
      });

      // Archive child1
      taskService.setStatus(child1.task_id, TaskStatus.Ready);
      taskService.claimTask(child1.task_id);
      taskService.completeTask(child1.task_id);
      taskService.archiveTask(child1.task_id);

      createServer(4516);
      const { data } = await fetchJson('/api/tasks');

      const tasks = (data as { tasks: Array<{ title: string; subtask_count: number }> }).tasks;
      const parentTask = tasks.find((t) => t.title === 'Parent Task');
      expect(parentTask?.subtask_count).toBe(1);
    });

    it('filters subtask_count by project', async () => {
      projectService.createProject('other-project');

      const parentA = taskService.createTask({
        title: 'Parent A',
        project: 'test-project',
      });
      const parentB = taskService.createTask({
        title: 'Parent B',
        project: 'other-project',
      });

      taskService.createTask({
        title: 'Child A-1',
        project: 'test-project',
        parent_id: parentA.task_id,
      });
      taskService.createTask({
        title: 'Child A-2',
        project: 'test-project',
        parent_id: parentA.task_id,
      });
      taskService.createTask({
        title: 'Child B-1',
        project: 'other-project',
        parent_id: parentB.task_id,
      });

      createServer(4517);

      // Filter by test-project - should only see Parent A with count 2
      const { data: dataA } = await fetchJson('/api/tasks?project=test-project');
      const tasksA = (dataA as { tasks: Array<{ title: string; subtask_count: number }> }).tasks;
      const parentTaskA = tasksA.find((t) => t.title === 'Parent A');
      expect(parentTaskA?.subtask_count).toBe(2);
      // Parent B should not be in results
      expect(tasksA.find((t) => t.title === 'Parent B')).toBeUndefined();

      // Filter by other-project - should only see Parent B with count 1
      const { data: dataB } = await fetchJson('/api/tasks?project=other-project');
      const tasksB = (dataB as { tasks: Array<{ title: string; subtask_count: number }> }).tasks;
      const parentTaskB = tasksB.find((t) => t.title === 'Parent B');
      expect(parentTaskB?.subtask_count).toBe(1);
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('returns task detail', async () => {
      const task = taskService.createTask({
        title: 'Detailed Task',
        project: 'test-project',
        priority: 3,
        description: 'A detailed description',
      });

      createServer(4520);
      const { status, data } = await fetchJson(`/api/tasks/${task.task_id}`);

      expect(status).toBe(200);
      expect((data as { task: unknown }).task).toMatchObject({
        task_id: task.task_id,
        title: 'Detailed Task',
        description: 'A detailed description',
        priority: 3,
      });
    });

    it('returns 404 for nonexistent task', async () => {
      createServer(4521);
      const { status, data } = await fetchJson('/api/tasks/nonexistent');

      expect(status).toBe(404);
      expect((data as { error: string }).error).toContain('not found');
    });
  });

  describe('GET /api/tasks/:id/comments', () => {
    it('returns task comments', async () => {
      const task = taskService.createTask({
        title: 'Task with comments',
        project: 'test-project',
      });
      taskService.addComment(task.task_id, 'First comment', { author: 'tester' });

      createServer(4530);
      const { status, data } = await fetchJson(`/api/tasks/${task.task_id}/comments`);

      expect(status).toBe(200);
      const comments = (data as { comments: Array<{ text: string }> }).comments;
      expect(comments).toHaveLength(1);
      expect(comments[0].text).toBe('First comment');
    });

    it('returns empty array for task with no comments', async () => {
      const task = taskService.createTask({
        title: 'Task without comments',
        project: 'test-project',
      });

      createServer(4531);
      const { status, data } = await fetchJson(`/api/tasks/${task.task_id}/comments`);

      expect(status).toBe(200);
      expect((data as { comments: unknown[] }).comments).toHaveLength(0);
    });
  });

  describe('GET /api/tasks/:id/checkpoints', () => {
    it('returns task checkpoints', async () => {
      const task = taskService.createTask({
        title: 'Task with checkpoints',
        project: 'test-project',
      });
      // Task must be ready before it can be claimed
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'worker' });
      taskService.addCheckpoint(task.task_id, 'progress-1', { progress: 50 });

      createServer(4535);
      const { status, data } = await fetchJson(`/api/tasks/${task.task_id}/checkpoints`);

      expect(status).toBe(200);
      const checkpoints = (data as { checkpoints: Array<{ name: string }> }).checkpoints;
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0].name).toBe('progress-1');
    });
  });

  describe('GET /api/stats', () => {
    it('returns task statistics', async () => {
      taskService.createTask({ title: 'Task 1', project: 'test-project' });
      taskService.createTask({ title: 'Task 2', project: 'test-project' });

      createServer(4540);
      const { status, data } = await fetchJson('/api/stats');

      expect(status).toBe(200);
      expect(data).toMatchObject({
        total: 2,
        projects: expect.arrayContaining(['test-project']),
      });
    });

    it('groups by status', async () => {
      const task = taskService.createTask({ title: 'Ready Task', project: 'test-project' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      createServer(4541);
      const { data } = await fetchJson('/api/stats');

      expect((data as { by_status: Record<string, number> }).by_status.ready).toBe(1);
    });
  });

  describe('GET /api/events', () => {
    it('returns recent events', async () => {
      taskService.createTask({ title: 'New Task', project: 'test-project' });

      createServer(4550);
      const { status, data } = await fetchJson('/api/events?since=0');

      expect(status).toBe(200);
      const events = (data as { events: Array<{ type: string }> }).events;
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === 'task_created')).toBe(true);
    });

    it('filters events by since parameter', async () => {
      taskService.createTask({ title: 'Task', project: 'test-project' });

      createServer(4551);

      // Get events since a high ID (should return nothing)
      const { data } = await fetchJson('/api/events?since=99999');
      expect((data as { events: unknown[] }).events).toHaveLength(0);
    });

    it('includes task titles in events', async () => {
      taskService.createTask({ title: 'Named Task', project: 'test-project' });

      createServer(4552);
      const { data } = await fetchJson('/api/events?since=0');

      const events = (data as { events: Array<{ type: string; task_title: string | null }> }).events;
      const createEvent = events.find((e) => e.type === 'task_created');
      expect(createEvent?.task_title).toBe('Named Task');
    });
  });

  describe('GET / (dashboard HTML)', () => {
    it('serves HTML at root', async () => {
      server = createServer(4560);

      const res = await globalThis.fetch(server.url);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
    });

    it('includes security headers', async () => {
      server = createServer(4561);

      const res = await globalThis.fetch(server.url);
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toBeTruthy();
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    });
  });

  describe('404 handling', () => {
    it('returns 404 for unknown routes', async () => {
      createServer(4570);
      const { status } = await fetchJson('/api/unknown');

      expect(status).toBe(404);
    });

    it('returns JSON error for 404', async () => {
      createServer(4571);
      const { data } = await fetchJson('/api/unknown');

      expect((data as { error: string }).error).toBe('Not Found');
    });
  });

  describe('JSON API response format', () => {
    it('does not include CORS headers', async () => {
      createServer(4580);
      const res = await globalThis.fetch(`${server.url}/api/tasks`);

      // CORS header should NOT be present (removed for security)
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });
  });
});
