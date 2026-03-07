import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatastore, type Datastore } from '../db/datastore.js';
import { EventStore } from '../events/store.js';
import { ProjectionEngine } from '../projections/engine.js';
import { TasksCurrentProjector } from '../projections/tasks-current.js';
import { DependenciesProjector } from '../projections/dependencies.js';
import { TagsProjector } from '../projections/tags.js';
import { CommentsCheckpointsProjector } from '../projections/comments-checkpoints.js';
import { SearchProjector } from '../projections/search.js';
import { ProjectsProjector } from '../projections/projects.js';
import { ProjectService } from './project-service.js';
import { StatsService } from './stats-service.js';
import { TaskService } from './task-service.js';
import { EventType, TaskStatus } from '../events/types.js';

describe('StatsService', () => {
  let datastore: Datastore;
  let eventStore: EventStore;
  let projectionEngine: ProjectionEngine;
  let projectService: ProjectService;
  let taskService: TaskService;
  let statsService: StatsService;

  beforeEach(() => {
    seededEventCounter = 0;
    datastore = createDatastore({
      events: { path: ':memory:', syncMode: 'offline', readYourWrites: true },
      cache: { path: ':memory:' },
    });

    eventStore = new EventStore(datastore.eventsDb);
    projectionEngine = new ProjectionEngine(datastore.cacheDb, datastore.eventsDb);
    projectionEngine.register(new TasksCurrentProjector());
    projectionEngine.register(new DependenciesProjector());
    projectionEngine.register(new TagsProjector());
    projectionEngine.register(new CommentsCheckpointsProjector());
    projectionEngine.register(new SearchProjector());
    projectionEngine.register(new ProjectsProjector());

    projectService = new ProjectService(datastore.cacheDb, eventStore, projectionEngine);
    taskService = new TaskService(
      datastore.cacheDb,
      eventStore,
      projectionEngine,
      projectService,
      datastore.eventsDb
    );
    projectService.ensureInboxExists();
    statsService = new StatsService(datastore.cacheDb, datastore.eventsDb, taskService);
  });

  afterEach(() => {
    datastore.close();
  });

  let seededEventCounter = 0;

  function seedEvent(input: {
    taskId: string;
    type: EventType;
    data: Record<string, unknown>;
    timestamp: string;
    author?: string;
    agentId?: string;
  }): void {
    seededEventCounter += 1;
    const eventId = `seed-event-${seededEventCounter}`;
    const payload = {
      rowid: 0,
      event_id: eventId,
      task_id: input.taskId,
      type: input.type,
      data: input.data,
      author: input.author,
      agent_id: input.agentId,
      timestamp: input.timestamp,
    };

    datastore.eventsDb.prepare(`
      INSERT INTO events (
        event_id, task_id, type, data, schema_version, author, agent_id, timestamp
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      eventId,
      input.taskId,
      input.type,
      JSON.stringify(input.data),
      input.author ?? null,
      input.agentId ?? null,
      input.timestamp
    );

    const row = datastore.eventsDb
      .prepare('SELECT id FROM events WHERE event_id = ?')
      .get(eventId) as { id: number };

    projectionEngine.applyEvent({ ...payload, rowid: row.id });
  }

  function seedCompletedTask(input: {
    taskId: string;
    title: string;
    project: string;
    agent: string;
    readyAt: string;
    startedAt: string;
    doneAt: string;
  }): void {
    seedEvent({
      taskId: input.taskId,
      type: EventType.TaskCreated,
      timestamp: input.readyAt,
      data: {
        title: input.title,
        project: input.project,
        agent: input.agent,
      },
    });
    seedEvent({
      taskId: input.taskId,
      type: EventType.StatusChanged,
      timestamp: input.readyAt,
      author: input.agent,
      data: {
        from: TaskStatus.Backlog,
        to: TaskStatus.Ready,
      },
    });
    seedEvent({
      taskId: input.taskId,
      type: EventType.StatusChanged,
      timestamp: input.startedAt,
      author: input.agent,
      data: {
        from: TaskStatus.Ready,
        to: TaskStatus.InProgress,
        agent: input.agent,
      },
    });
    seedEvent({
      taskId: input.taskId,
      type: EventType.StatusChanged,
      timestamp: input.doneAt,
      author: input.agent,
      data: {
        from: TaskStatus.InProgress,
        to: TaskStatus.Done,
      },
    });
  }

  it('returns the canonical empty stats shape', () => {
    const stats = statsService.getStats();

    expect(stats).toMatchObject({
      window: '24h',
      projects: ['inbox'],
      queue: {
        backlog: 0,
        ready: 0,
        in_progress: 0,
        blocked: 0,
        done: 0,
        archived: 0,
        available: 0,
        stale: 0,
        expired_leases: 0,
      },
      completions: {
        total: 0,
        by_agent: {},
      },
      execution_time_ms: {
        count: 0,
        mean: null,
        min: null,
        max: null,
        excluded_without_start: 0,
      },
    });
    expect(stats.generated_at).toBeTruthy();
  });

  it('reports queue depth, availability, stale tasks, and expired leases', () => {
    projectService.createProject('project-a');

    const backlog = taskService.createTask({ title: 'Backlog', project: 'project-a' });
    const ready = taskService.createTask({ title: 'Ready', project: 'project-a' });
    taskService.setStatus(ready.task_id, TaskStatus.Ready);

    const dep = taskService.createTask({ title: 'Dependency', project: 'project-a' });
    const blockedReady = taskService.createTask({
      title: 'Blocked ready',
      project: 'project-a',
      depends_on: [dep.task_id],
    });
    taskService.setStatus(blockedReady.task_id, TaskStatus.Ready);

    const stale = taskService.createTask({ title: 'Stale', project: 'project-a' });
    taskService.setStatus(stale.task_id, TaskStatus.Ready);
    taskService.claimTask(stale.task_id, { author: 'agent-1' });
    datastore.cacheDb
      .prepare('UPDATE tasks_current SET claimed_at = ? WHERE task_id = ?')
      .run(new Date(Date.now() - 15 * 60_000).toISOString(), stale.task_id);

    const expired = taskService.createTask({ title: 'Expired', project: 'project-a' });
    taskService.setStatus(expired.task_id, TaskStatus.Ready);
    taskService.claimTask(expired.task_id, {
      author: 'agent-2',
      lease_until: new Date(Date.now() - 60_000).toISOString(),
    });

    const done = taskService.createTask({ title: 'Done', project: 'project-a' });
    taskService.setStatus(done.task_id, TaskStatus.Ready);
    taskService.claimTask(done.task_id, { author: 'agent-3' });
    taskService.completeTask(done.task_id, { author: 'agent-3' });

    const archived = taskService.createTask({ title: 'Archived', project: 'project-a' });
    taskService.setStatus(archived.task_id, TaskStatus.Ready);
    taskService.claimTask(archived.task_id, { author: 'agent-4' });
    taskService.completeTask(archived.task_id, { author: 'agent-4' });
    taskService.archiveTask(archived.task_id);

    const stats = statsService.getStats({ project: 'project-a' });

    expect(backlog.task_id).toBeTruthy();
    expect(stats.queue).toMatchObject({
      backlog: 2,
      ready: 2,
      in_progress: 2,
      done: 1,
      archived: 1,
      available: 1,
      stale: 1,
      expired_leases: 1,
    });
  });

  it('uses current project and current agent for completion counts', () => {
    projectService.createProject('project-a');
    projectService.createProject('project-b');

    const task = taskService.createTask({
      title: 'Reassigned completion',
      project: 'project-a',
      agent: 'agent-a',
    });
    taskService.setStatus(task.task_id, TaskStatus.Ready);
    taskService.claimTask(task.task_id, { author: 'agent-a' });
    taskService.completeTask(task.task_id, { author: 'agent-a' });
    taskService.moveTask(task.task_id, 'project-b');
    taskService.reopenTask(task.task_id);
    taskService.claimTask(task.task_id, { author: 'agent-b' });
    taskService.completeTask(task.task_id, { author: 'agent-b' });

    const projectAStats = statsService.getStats({ project: 'project-a' });
    const projectBStats = statsService.getStats({ project: 'project-b' });

    expect(projectAStats.completions.total).toBe(0);
    expect(projectBStats.completions.total).toBe(2);
    expect(projectBStats.completions.by_agent).toEqual({ 'agent-b': 2 });
  });

  it('computes execution-time summaries per completed cycle and excludes completions without a start', () => {
    const cycled = taskService.createTask({ title: 'Cycled', project: 'inbox' });
    taskService.setStatus(cycled.task_id, TaskStatus.Ready);
    taskService.claimTask(cycled.task_id, { author: 'agent-1' });
    taskService.completeTask(cycled.task_id, { author: 'agent-1' });
    taskService.reopenTask(cycled.task_id);
    taskService.claimTask(cycled.task_id, { author: 'agent-1' });
    taskService.completeTask(cycled.task_id, { author: 'agent-1' });

    const noStart = taskService.createTask({ title: 'No start', project: 'inbox' });
    taskService.setStatus(noStart.task_id, TaskStatus.Ready);
    taskService.setStatus(noStart.task_id, TaskStatus.Done);

    const stats = statsService.getStats();

    expect(stats.completions.total).toBe(3);
    expect(stats.execution_time_ms.count).toBe(2);
    expect(stats.execution_time_ms.excluded_without_start).toBe(1);
    expect(stats.execution_time_ms.min).not.toBeNull();
    expect(stats.execution_time_ms.max).not.toBeNull();
    expect(stats.execution_time_ms.mean).not.toBeNull();
  });

  it('excludes completions and durations outside the requested window', () => {
    seedCompletedTask({
      taskId: 'old-task',
      title: 'Old completion',
      project: 'inbox',
      agent: 'agent-1',
      readyAt: '2026-03-06T07:40:00.000Z',
      startedAt: '2026-03-06T07:45:00.000Z',
      doneAt: '2026-03-06T08:00:00.000Z',
    });
    seedCompletedTask({
      taskId: 'recent-task',
      title: 'Recent completion',
      project: 'inbox',
      agent: 'agent-2',
      readyAt: '2026-03-07T07:10:00.000Z',
      startedAt: '2026-03-07T07:20:00.000Z',
      doneAt: '2026-03-07T07:30:00.000Z',
    });

    const stats = statsService.getStats({
      asOf: '2026-03-07T08:00:00.000Z',
      windowMinutes: 60,
      windowLabel: '1h',
    });

    expect(stats.window).toBe('1h');
    expect(stats.completions.total).toBe(1);
    expect(stats.completions.by_agent).toEqual({ 'agent-2': 1 });
    expect(stats.execution_time_ms.count).toBe(1);
  });
});
