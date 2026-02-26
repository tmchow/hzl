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

  function createServer(port: number, host = '127.0.0.1', allowFraming = false): ServerHandle {
    server = createWebServer({ port, host, allowFraming, taskService, eventStore });
    return server;
  }

  async function fetchJson(path: string): Promise<{ status: number; data: unknown }> {
    const res = await globalThis.fetch(`${server.url}${path}`);
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }

  async function fetchText(path: string): Promise<{ status: number; body: string }> {
    const res = await globalThis.fetch(`${server.url}${path}`);
    const body = await res.text();
    return { status: res.status, body };
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

    it('closes promptly even with an active SSE stream', async () => {
      const s = createServer(4504);
      const controller = new AbortController();
      const response = await globalThis.fetch(`${s.url}/api/events/stream`, {
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      expect(response.status).toBe(200);

      const closePromise = s.close();
      const closedQuickly = await Promise.race([
        closePromise.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500)),
      ]);

      if (!closedQuickly) {
        controller.abort();
        await closePromise;
      }

      expect(closedQuickly).toBe(true);

      controller.abort();
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

    it('preserves assignee names with spaces and emojis', async () => {
      taskService.createTask({
        title: 'Space Name',
        project: 'test-project',
        assignee: 'Trevin C',
      });
      taskService.createTask({
        title: 'Emoji Name',
        project: 'test-project',
        assignee: 'Clara 📝',
      });

      createServer(4518);
      const { data } = await fetchJson('/api/tasks');
      const tasks = (data as { tasks: Array<{ title: string; assignee: string | null }> }).tasks;
      const assigneeByTitle = new Map(tasks.map((task) => [task.title, task.assignee]));

      expect(assigneeByTitle.get('Space Name')).toBe('Trevin C');
      expect(assigneeByTitle.get('Emoji Name')).toBe('Clara 📝');
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

    it('returns tasks filtered by due_month', async () => {
      createServer(4530);
      taskService.createTask({
        title: 'Feb task',
        project: 'test-project',
        due_at: '2026-02-15T00:00:00Z',
      });
      taskService.createTask({
        title: 'Jan task',
        project: 'test-project',
        due_at: '2026-01-10T00:00:00Z',
      });

      const { data } = await fetchJson('/api/tasks?due_month=2026-02');
      const tasks = (data as { tasks: Array<{ title: string; due_at: string | null }> }).tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Feb task');
      expect(tasks[0].due_at).toBe('2026-02-15T00:00:00Z');
    });

    it('applies project filter with due_month', async () => {
      createServer(4531);
      projectService.createProject('other-project');
      taskService.createTask({
        title: 'Feb in test',
        project: 'test-project',
        due_at: '2026-02-15T00:00:00Z',
      });
      taskService.createTask({
        title: 'Feb in other',
        project: 'other-project',
        due_at: '2026-02-15T00:00:00Z',
      });

      const { data } = await fetchJson('/api/tasks?due_month=2026-02&project=test-project');
      const tasks = (data as { tasks: Array<{ title: string }> }).tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Feb in test');
    });

    it('returns 400 for invalid due_month format', async () => {
      createServer(4532);
      const { status } = await fetchJson('/api/tasks?due_month=abc');
      expect(status).toBe(400);
    });

    it('returns 400 for invalid month in due_month', async () => {
      createServer(4533);
      const { status } = await fetchJson('/api/tasks?due_month=2026-13');
      expect(status).toBe(400);
    });

    it('excludes tasks without due_at from due_month query', async () => {
      createServer(4534);
      taskService.createTask({
        title: 'No due date',
        project: 'test-project',
      });
      taskService.createTask({
        title: 'Has due date',
        project: 'test-project',
        due_at: '2026-02-15T00:00:00Z',
      });

      const { data } = await fetchJson('/api/tasks?due_month=2026-02');
      const tasks = (data as { tasks: Array<{ title: string }> }).tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Has due date');
    });

    it('includes due_month in response metadata when querying by month', async () => {
      createServer(4535);

      const { data } = await fetchJson('/api/tasks?due_month=2026-02');
      const response = data as { due_month?: string; since?: string };
      expect(response.due_month).toBe('2026-02');
      expect(response.since).toBeUndefined();
    });

    it('returns 400 for month 00 in due_month', async () => {
      createServer(4536);
      const { status } = await fetchJson('/api/tasks?due_month=2026-00');
      expect(status).toBe(400);
    });

    it('ignores since param when due_month is present', async () => {
      createServer(4538);
      taskService.createTask({
        title: 'Feb task',
        project: 'test-project',
        due_at: '2026-02-15T00:00:00Z',
      });

      // Set updated_at far in the past
      const allTasks = taskService.listTasks({});
      const task = allTasks.find(t => t.title === 'Feb task');
      db.prepare('UPDATE tasks_current SET updated_at = ? WHERE task_id = ?')
        .run('2025-01-01T00:00:00Z', task!.task_id);

      // since=1d would normally exclude this old task, but due_month should take precedence
      const { data } = await fetchJson('/api/tasks?due_month=2026-02&since=1d');
      const tasks = (data as { tasks: Array<{ title: string }> }).tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Feb task');
    });

    it('returns subtask counts for parent tasks in due_month mode', async () => {
      createServer(4537);
      const parent = taskService.createTask({
        title: 'Parent with due date',
        project: 'test-project',
        due_at: '2026-02-15T00:00:00Z',
      });
      taskService.createTask({
        title: 'Child task',
        project: 'test-project',
        parent_id: parent.task_id,
      });

      const { data } = await fetchJson('/api/tasks?due_month=2026-02');
      const tasks = (data as { tasks: Array<{ title: string; subtask_count: number; subtask_total: number }> }).tasks;
      const parentTask = tasks.find(t => t.title === 'Parent with due date');
      expect(parentTask?.subtask_count).toBe(1);
      expect(parentTask?.subtask_total).toBe(1);
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

    it('includes task metadata fields in events', async () => {
      const task = taskService.createTask({
        title: 'Named Task',
        project: 'test-project',
        assignee: 'Clara 📝',
        description: 'Task details for activity filtering',
      });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      createServer(4552);
      const { data } = await fetchJson('/api/events?since=0');

      const events = (data as {
        events: Array<{
          task_id: string;
          type: string;
          task_title: string | null;
          task_assignee: string | null;
          task_description: string | null;
          task_status: string | null;
        }>;
      }).events;
      const createEvent = events.find((e) => e.task_id === task.task_id && e.type === 'task_created');
      expect(createEvent?.task_title).toBe('Named Task');
      expect(createEvent?.task_assignee).toBe('Clara 📝');
      expect(createEvent?.task_description).toBe('Task details for activity filtering');
      expect(createEvent?.task_status).toBe(TaskStatus.Ready);
    });
  });

  describe('GET /api/tasks/:id/events', () => {
    it('returns events for a specific task', async () => {
      const task = taskService.createTask({
        title: 'Delegated Task',
        project: 'test-project',
        assignee: 'kenji',
      }, {
        author: 'clara',
      });
      taskService.setStatus(task.task_id, TaskStatus.Ready, { author: 'clara' });

      createServer(4553);
      const { status, data } = await fetchJson(`/api/tasks/${task.task_id}/events`);

      expect(status).toBe(200);
      const events = (data as {
        events: Array<{ type: string; author: string | null; data: Record<string, unknown> }>;
      }).events;
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[0].type).toBe('task_created');
      expect(events[0].author).toBe('clara');
      expect(events[0].data.assignee).toBe('kenji');
    });

    it('respects limit parameter', async () => {
      const task = taskService.createTask({ title: 'Task', project: 'test-project' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'worker-1' });

      createServer(4554);
      const { data } = await fetchJson(`/api/tasks/${task.task_id}/events?limit=1`);
      expect((data as { events: unknown[] }).events).toHaveLength(1);
    });
  });

  describe('SSE + client wiring contracts', () => {
    it('exposes an SSE route with event-stream content type', async () => {
      server = createServer(4555);

      const res = await globalThis.fetch(`${server.url}/api/events/stream`, {
        headers: { Accept: 'text/event-stream' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type') ?? '').toMatch(/text\/event-stream/i);
      await res.body?.cancel();
    });

    it('includes EventSource usage and wiring in dashboard HTML', async () => {
      server = createServer(4556);

      const { body } = await fetchText('/');
      const eventSourceInit = body.match(
        /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*new\s+EventSource\s*\([\s\S]*?\)/i,
      );

      expect(eventSourceInit).toBeTruthy();
      expect(body).toMatch(/SSE_ENDPOINT\s*=\s*['"]\/api\/events\/stream['"]/i);

      const eventSourceVar = eventSourceInit?.[1];
      expect(eventSourceVar).toBeTruthy();
      const eventSourceWiring = new RegExp(
        `${eventSourceVar}\\s*\\.\\s*(?:onopen|onmessage|onerror|addEventListener\\s*\\()`,
        'i',
      );
      expect(body).toMatch(eventSourceWiring);
    });

    it('does not rely on setInterval(poll, ...) as the primary update loop', async () => {
      server = createServer(4557);

      const { body } = await fetchText('/');
      expect(body).not.toMatch(/setInterval\s*\(\s*poll\s*,/i);
    });

    it('checks both visibility and focus before opening SSE connections', async () => {
      server = createServer(4558);

      const { body } = await fetchText('/');
      const connectSetup = body.match(
        /function\s+connectEventStream\s*\([^)]*\)\s*\{[\s\S]*?if\s*\(\s*!\s*([a-zA-Z_$][\w$]*)\s*\(\s*\)\s*\)\s*\{[\s\S]{0,260}?pauseLiveUpdates\s*\(\s*\)[\s\S]{0,260}?return[\s\S]*?new\s+EventSource\s*\(/i,
      );

      expect(connectSetup).toBeTruthy();
      const liveUpdateGate = connectSetup?.[1];
      expect(liveUpdateGate).toBeTruthy();
      const gateFunctionPattern = new RegExp(
        `function\\s+${liveUpdateGate}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?(?:document\\.(?:hidden|visibilityState)[\\s\\S]*?document\\.hasFocus\\s*\\(\\s*\\)|document\\.hasFocus\\s*\\(\\s*\\)[\\s\\S]*?document\\.(?:hidden|visibilityState))`,
        'i',
      );
      expect(body).toMatch(gateFunctionPattern);
    });

    it('wires blur/focus/visibilitychange handlers to pause and resume live updates', async () => {
      server = createServer(4559);

      const { body } = await fetchText('/');

      expect(body).toMatch(
        /(?:window|document)\s*\.\s*addEventListener\s*\(\s*['"]blur['"]\s*,[\s\S]{0,240}?pauseLiveUpdates\s*\(/i,
      );
      expect(body).toMatch(
        /(?:window|document)\s*\.\s*addEventListener\s*\(\s*['"]focus['"]\s*,[\s\S]{0,240}?resumeLiveUpdates\s*\(/i,
      );
      expect(body).toMatch(
        /document\s*\.\s*addEventListener\s*\(\s*['"]visibilitychange['"]\s*,[\s\S]{0,500}?pauseLiveUpdates\s*\([\s\S]{0,500}?resumeLiveUpdates\s*\(/i,
      );
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
      expect(res.headers.get('content-security-policy')).not.toContain('frame-ancestors');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    });

    it('omits X-Frame-Options and adds frame-ancestors when allowFraming is true', async () => {
      server = createServer(4562, '127.0.0.1', true);

      const res = await globalThis.fetch(server.url);
      expect(res.headers.get('x-frame-options')).toBeNull();
      expect(res.headers.get('content-security-policy')).toContain('frame-ancestors *');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    });

    it('renders project metadata in the top-right header and assignee metadata in card footer', async () => {
      server = createServer(4590);

      const { body } = await fetchText('/');
      const renderCardBlock = body.match(/function\s+renderCard\s*\([^)]*\)\s*\{[\s\S]*?return\s*`[\s\S]*?`;\s*}/i);

      expect(renderCardBlock).toBeTruthy();
      expect(renderCardBlock?.[0]).toMatch(
        /const\s+projectHtml\s*=\s*`[\s\S]*class=["']card-project["'][\s\S]*`;/i,
      );
      expect(renderCardBlock?.[0]).toMatch(
        /const\s+assigneeClass\s*=\s*hasAssignee\s*\?\s*['"][^'"]*\bcard-assignee\b[^'"]*['"]\s*:\s*['"][^'"]*\bcard-assignee\b[^'"]*['"]/i,
      );
      expect(renderCardBlock?.[0]).toMatch(
        /const\s+assigneeHtml\s*=\s*`[\s\S]*class=["']\$\{assigneeClass\}["'][\s\S]*`;/i,
      );
      expect(renderCardBlock?.[0]).toMatch(
        /<div[^>]*class=["']card-header-right["'][^>]*>[\s\S]*\$\{projectHtml\}[\s\S]*<\/div>/i,
      );
      expect(renderCardBlock?.[0]).toMatch(
        /<div[^>]*class=["']card-meta["'][^>]*>[\s\S]*\$\{assigneeHtml\}[\s\S]*<\/div>/i,
      );
    });

    it('truncates card assignee labels to 10 characters plus ellipsis', async () => {
      server = createServer(4598);

      const { body } = await fetchText('/');
      const renderCardBlock = body.match(/function\s+renderCard\s*\([^)]*\)\s*\{[\s\S]*?return\s*`[\s\S]*?`;\s*}/i);

      expect(renderCardBlock).toBeTruthy();
      expect(body).toMatch(/function\s+truncateCardLabel\s*\(value,\s*maxChars\s*=\s*10\)\s*\{/i);
      expect(renderCardBlock?.[0]).toMatch(/const\s+assigneeCardText\s*=\s*truncateCardLabel\(assigneeText,\s*10\)/i);
      expect(renderCardBlock?.[0]).toMatch(
        /title="\$\{escapeHtml\(assigneeText\)\}"[^>]*>\$\{escapeHtml\(assigneeCardText\)\}<\/span>/i,
      );
    });

    it('binds modal assignee metadata with an Unassigned fallback value', async () => {
      server = createServer(4591);

      const { body } = await fetchText('/');
      const openTaskModalBlock = body.match(/async\s+function\s+openTaskModal\s*\([^)]*\)\s*\{[\s\S]*?let\s+html\s*=\s*`[\s\S]*?`;/i);

      expect(openTaskModalBlock).toBeTruthy();
      expect(openTaskModalBlock?.[0]).toMatch(
        /const\s+assigneeValue\s*=\s*hasAssignee[\s\S]*<span[^>]*class=["']modal-meta-fallback["'][^>]*>\s*Unassigned\s*<\/span>/i,
      );
      expect(openTaskModalBlock?.[0]).toMatch(
        /<div[^>]*class=["']modal-meta-label["'][^>]*>\s*Assignee\s*<\/div>[\s\S]*?<div[^>]*class=["']modal-meta-value["'][^>]*>\s*\$\{assigneeValue\}\s*<\/div>/i,
      );
    });

    it('binds modal task id display to task.task_id', async () => {
      server = createServer(4592);

      const { body } = await fetchText('/');
      const hasTaskIdSourceBinding = /data\.task\.task_id/i.test(body);
      const hasModalTaskIdDisplayBinding =
        /modalTaskIdValue\s*\.\s*textContent\s*=\s*(?:data\.task\.task_id|[a-zA-Z0-9_$]*taskId[a-zA-Z0-9_$]*)/i.test(body);

      expect(hasTaskIdSourceBinding).toBe(true);
      expect(hasModalTaskIdDisplayBinding).toBe(true);
    });

    it('includes a modal copy control for task id', async () => {
      server = createServer(4593);

      const { body } = await fetchText('/');
      expect(body).toMatch(
        /<div[^>]*class=["']modal-task-id-row["'][^>]*>[\s\S]*id=["']modalTaskIdValue["'][\s\S]*<button[^>]*id=["']modalTaskIdCopy["'][^>]*>[\s\S]*\bcopy\b[\s\S]*<\/button>/i,
      );
    });

    it('includes a copy handler that uses clipboard API and/or execCommand fallback', async () => {
      server = createServer(4594);

      const { body } = await fetchText('/');
      const hasCopyHandlerFunction =
        /(?:async\s+)?function\s+[a-zA-Z0-9_$]*copy[a-zA-Z0-9_$]*\s*\(/i.test(body) ||
        /(?:const|let)\s+[a-zA-Z0-9_$]*copy[a-zA-Z0-9_$]*\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/i.test(body);
      const hasClipboardOrExecCommand =
        /navigator\.clipboard\s*\.\s*writeText\s*\(|document\.execCommand\(\s*["']copy["']\s*\)/i.test(body);

      expect(hasCopyHandlerFunction).toBe(true);
      expect(hasClipboardOrExecCommand).toBe(true);
    });

    it('includes assignee filter select with id assigneeFilter', async () => {
      server = createServer(4563);

      const { body } = await fetchText('/');
      expect(body).toMatch(/<select[^>]*id=["']assigneeFilter["'][^>]*>/i);
    });

    it('includes a default assignee option containing Any Agent', async () => {
      server = createServer(4564);

      const { body } = await fetchText('/');
      const assigneeSelect = body.match(/<select[^>]*id=["']assigneeFilter["'][^>]*>([\s\S]*?)<\/select>/i);
      expect(assigneeSelect).toBeTruthy();
      expect(assigneeSelect?.[1]).toMatch(/<option[^>]*>[\s\S]*?Any Agent[\s\S]*?<\/option>/i);
    });

    it('includes script wiring for assignee filter change handling', async () => {
      server = createServer(4565);

      const { body } = await fetchText('/');
      const hasAssigneeReference =
        /getElementById\(\s*['"]assigneeFilter['"]\s*\)/.test(body) ||
        /querySelector\(\s*['"]#assigneeFilter['"]\s*\)/.test(body) ||
        /assigneeFilter/.test(body);
      const hasAssigneeChangeListener =
        /assigneeFilter\s*\.\s*addEventListener\(\s*['"]change['"]/.test(body) ||
        /getElementById\(\s*['"]assigneeFilter['"]\s*\)\s*\.\s*addEventListener\(\s*['"]change['"]/.test(body) ||
        /querySelector\(\s*['"]#assigneeFilter['"]\s*\)\s*\.\s*addEventListener\(\s*['"]change['"]/.test(body);

      expect(hasAssigneeReference).toBe(true);
      expect(hasAssigneeChangeListener).toBe(true);
    });

    it('preserves full assignee strings in board and activity filter wiring', async () => {
      server = createServer(4600);

      const { body } = await fetchText('/');
      expect(body).toMatch(
        /function\s+getAssigneeValue\s*\(value\)\s*\{[\s\S]*value\.trim\(\)\.length\s*>\s*0[\s\S]*\?\s*value\s*:\s*['"]{2}/i,
      );
      expect(body).toMatch(
        /filtered\s*=\s*filtered\.filter\(\s*task\s*=>\s*getAssigneeValue\(task\.assignee\)\s*===\s*assigneeFilter\.value\s*\)/i,
      );
      expect(body).toMatch(
        /const\s+assignee\s*=\s*getAssigneeValue\(task\.assignee\);\s*if\s*\(!assignee\)\s*continue;[\s\S]*option\.value\s*=\s*assignee/i,
      );
      expect(body).toMatch(
        /const\s+taskAssignee\s*=\s*getAssigneeValue\(event\.task_assignee\);\s*if\s*\(taskAssignee\)\s*return\s+taskAssignee;[\s\S]*return\s+getAssigneeValue\(event\.data\?\.assignee\)/i,
      );
    });

    it('includes activity assignee and keyword filter controls', async () => {
      server = createServer(4566);

      const { body } = await fetchText('/');
      expect(body).toMatch(/<select[^>]*id=["']activityAssigneeFilter["'][^>]*>/i);
      expect(body).toMatch(/<input[^>]*id=["']activityKeywordFilter["'][^>]*>/i);
    });

    it('applies activity keyword filtering only at 3+ characters', async () => {
      server = createServer(4567);

      const { body } = await fetchText('/');
      expect(body).toMatch(/keyword\.length\s*>=\s*3/);
    });

    it('includes activity item markup with task id binding attribute', async () => {
      server = createServer(4568);

      const { body } = await fetchText('/');
      expect(body).toMatch(
        /<div(?=[^>]*\bclass=["'][^"']*\bactivity-item\b[^"']*["'])(?=[^>]*\bdata-task-id\s*=\s*["'][^"']*event\.task_id[^"']*["'])[^>]*>/i,
      );
    });

    it('includes activity list click delegation wired to openTaskModal', async () => {
      server = createServer(4569);

      const { body } = await fetchText('/');
      expect(body).toMatch(
        /(?:activityList|getElementById\(\s*["']activityList["']\s*\)|querySelector\(\s*["']#activityList["']\s*\))\s*\.\s*addEventListener\(\s*["']click["']\s*,[\s\S]*?closest\(\s*["']\.activity-item["']\s*\)[\s\S]*?openTaskModal\b/i,
      );
    });

    it('shows static Live text with green connection-dot live state when stream is healthy', async () => {
      server = createServer(4598);

      const { body } = await fetchText('/');
      expect(body).toMatch(/\.connection-dot\.live\s*\{[\s\S]*--status-done/i);
      expect(body).toMatch(/connectionText\.textContent\s*=\s*['"]Live['"]/);
      expect(body).not.toMatch(/Live\s*\$\{ago\}s/);
    });

    it('uses hidden-by-default column scrollbars with scroll/touch reveal behavior', async () => {
      server = createServer(4599);

      const { body } = await fetchText('/');
      expect(body).toMatch(/\.column-cards\s*\{[\s\S]*scrollbar-width:\s*none[\s\S]*-ms-overflow-style:\s*none/i);
      expect(body).toMatch(/\.column-cards\.is-scrolling[\s\S]*::\-webkit-scrollbar/i);
      expect(body).toMatch(/function\s+bindColumnScrollIndicators\s*\(/i);
      expect(body).toMatch(/classList\.add\(\s*['"]is-scrolling['"]\s*\)/i);
    });

    it('renders an explicit activity actor/author element in task modal activity entries', async () => {
      server = createServer(4595);

      const { body } = await fetchText('/');
      const activityMarkupBlock = body.match(/displayTaskActivity\.map\([\s\S]*?\)\.join\(\s*['"]{2}\s*\)/i);

      expect(activityMarkupBlock).toBeTruthy();
      expect(activityMarkupBlock?.[0]).toMatch(
        /class=["'][^"']*(?:activity|event)[^"']*(?:actor|author)[^"']*["']/i,
      );
      expect(activityMarkupBlock?.[0]).toMatch(/\$\{escapeHtml\(\s*actor\s*\)\}/i);
    });

    it('uses dedicated modal classes for checkpoint and activity author fields (not just .comment-author)', async () => {
      server = createServer(4596);

      const { body } = await fetchText('/');
      const modalMarkupBlock = body.match(
        /async\s+function\s+openTaskModal\s*\([^)]*\)\s*\{[\s\S]*?modalBody\.innerHTML\s*=\s*html\s*;/i,
      );
      const checkpointMarkupBlock = modalMarkupBlock?.[0].match(
        /visibleCheckpoints\.map\([\s\S]*?\)\.join\(\s*['"]{2}\s*\)/i,
      );
      const activityMarkupBlock = modalMarkupBlock?.[0].match(
        /displayTaskActivity\.map\([\s\S]*?\)\.join\(\s*['"]{2}\s*\)/i,
      );

      expect(modalMarkupBlock).toBeTruthy();
      expect(checkpointMarkupBlock).toBeTruthy();
      expect(activityMarkupBlock).toBeTruthy();
      expect(checkpointMarkupBlock?.[0]).toMatch(
        /class=["'][^"']*\b(?:modal-|task-)?(?:checkpoint|cp)-[^"']*["']/i,
      );
      expect(activityMarkupBlock?.[0]).toMatch(
        /class=["'][^"']*\b(?:modal-|task-)?(?:activity|event)-[^"']*["']/i,
      );
      expect(checkpointMarkupBlock?.[0]).not.toMatch(/\bcomment-author\b/i);
      expect(activityMarkupBlock?.[0]).not.toMatch(/\bcomment-author\b/i);
    });

    it('styles modal checkpoint author/name with dedicated non-accent class rules', async () => {
      server = createServer(4597);

      const { body } = await fetchText('/');
      const checkpointStyleRule = body.match(
        /\.(?:modal-|task-)?(?:checkpoint|cp)-[\w-]*(?:entry|item|author|name|title|meta)?[\w-]*\s*\{[\s\S]*?\}/i,
      );

      expect(checkpointStyleRule).toBeTruthy();
      expect(checkpointStyleRule?.[0]).toMatch(/(?:color|border(?:-left|-color)?)\s*:/i);
      expect(checkpointStyleRule?.[0]).not.toMatch(/--accent|--status-in-progress|orange/i);
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
