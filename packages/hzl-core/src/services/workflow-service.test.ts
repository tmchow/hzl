import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'libsql';
import { createTestDb } from '../db/test-utils.js';
import { EventStore } from '../events/store.js';
import { ProjectionEngine } from '../projections/engine.js';
import { TasksCurrentProjector } from '../projections/tasks-current.js';
import { DependenciesProjector } from '../projections/dependencies.js';
import { TagsProjector } from '../projections/tags.js';
import { CommentsCheckpointsProjector } from '../projections/comments-checkpoints.js';
import { SearchProjector } from '../projections/search.js';
import { ProjectsProjector } from '../projections/projects.js';
import { ProjectService } from './project-service.js';
import { TaskService } from './task-service.js';
import { WorkflowService } from './workflow-service.js';
import { TaskStatus } from '../events/types.js';

describe('WorkflowService', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let projectionEngine: ProjectionEngine;
  let projectService: ProjectService;
  let taskService: TaskService;
  let workflowService: WorkflowService;

  beforeEach(() => {
    db = createTestDb();
    eventStore = new EventStore(db);
    projectionEngine = new ProjectionEngine(db);
    projectionEngine.register(new TasksCurrentProjector());
    projectionEngine.register(new DependenciesProjector());
    projectionEngine.register(new TagsProjector());
    projectionEngine.register(new CommentsCheckpointsProjector());
    projectionEngine.register(new SearchProjector());
    projectionEngine.register(new ProjectsProjector());
    projectService = new ProjectService(db, eventStore, projectionEngine);
    projectService.ensureInboxExists();
    taskService = new TaskService(db, eventStore, projectionEngine, projectService);
    workflowService = new WorkflowService(db, eventStore, projectionEngine, taskService, db);
  });

  afterEach(() => {
    db.close();
  });

  it('lists built-in workflows', () => {
    const workflows = workflowService.listWorkflows();
    expect(workflows.map((workflow) => workflow.name)).toEqual(['start', 'handoff', 'delegate']);
  });

  it('shows start workflow with explicit auto-op-id guardrail note', () => {
    const definition = workflowService.showWorkflow('start');
    expect(definition.supports_auto_op_id).toBe(false);
    expect(definition.notes.join(' ')).toMatch(/auto-op-id/i);
  });

  it('start resumes existing in_progress task before claiming next', () => {
    const resumeTask = taskService.createTask({
      title: 'Resume me',
      project: 'inbox',
      initial_status: TaskStatus.InProgress,
      agent: 'agent-1',
    });
    const readyTask = taskService.createTask({ title: 'Ready', project: 'inbox', priority: 3 });
    taskService.setStatus(readyTask.task_id, TaskStatus.Ready);

    const result = workflowService.runStart({
      agent: 'agent-1',
      resume_policy: 'priority',
    });

    expect(result.mode).toBe('resume');
    expect(result.selected?.task_id).toBe(resumeTask.task_id);
    expect(taskService.getTaskById(readyTask.task_id)?.status).toBe(TaskStatus.Ready);
  });

  it('start claims next eligible task when nothing is in_progress', () => {
    const low = taskService.createTask({ title: 'Low', project: 'inbox', priority: 0 });
    const high = taskService.createTask({ title: 'High', project: 'inbox', priority: 3 });
    taskService.setStatus(low.task_id, TaskStatus.Ready);
    taskService.setStatus(high.task_id, TaskStatus.Ready);

    const result = workflowService.runStart({
      agent: 'agent-2',
      resume_policy: 'priority',
    });

    expect(result.mode).toBe('claim_next');
    expect(result.selected?.task_id).toBe(high.task_id);
    expect(taskService.getTaskById(high.task_id)?.status).toBe(TaskStatus.InProgress);
  });

  it('handoff requires agent or project routing guardrail', () => {
    const source = taskService.createTask({ title: 'Source', project: 'inbox' });
    taskService.setStatus(source.task_id, TaskStatus.Ready);
    taskService.claimTask(source.task_id, { author: 'agent-1' });

    expect(() =>
      workflowService.runHandoff({
        from_task_id: source.task_id,
        title: 'Follow up',
      })
    ).toThrow(/requires --agent, --project, or both/i);
  });

  it('handoff completes source and creates follow-on', () => {
    const source = taskService.createTask({ title: 'Source', project: 'inbox' });
    taskService.setStatus(source.task_id, TaskStatus.Ready);
    taskService.claimTask(source.task_id, { author: 'agent-1' });
    taskService.addCheckpoint(source.task_id, 'state', { step: 1 });

    const result = workflowService.runHandoff({
      from_task_id: source.task_id,
      title: 'Follow up',
      project: 'inbox',
    });

    expect(taskService.getTaskById(source.task_id)?.status).toBe(TaskStatus.Done);
    expect(result.follow_on.status).toBe(TaskStatus.Ready);
    expect(result.carried_checkpoint_count).toBe(1);
  });

  it('handoff does not complete source when follow-on creation fails', () => {
    const source = taskService.createTask({ title: 'Source', project: 'inbox' });
    taskService.setStatus(source.task_id, TaskStatus.Ready);
    taskService.claimTask(source.task_id, { author: 'agent-1' });

    expect(() =>
      workflowService.runHandoff({
        from_task_id: source.task_id,
        title: 'Follow up',
        project: 'missing-project',
      })
    ).toThrow();

    expect(taskService.getTaskById(source.task_id)?.status).toBe(TaskStatus.InProgress);
  });

  it('handoff archives follow-on task when completion step fails', () => {
    const source = taskService.createTask({ title: 'Source', project: 'inbox' });
    taskService.setStatus(source.task_id, TaskStatus.Ready);
    taskService.claimTask(source.task_id, { author: 'agent-1' });

    const createSpy = vi.spyOn(taskService, 'createTask');
    const completeSpy = vi
      .spyOn(taskService, 'completeTask')
      .mockImplementation(() => {
        throw new Error('forced complete failure');
      });

    try {
      expect(() =>
        workflowService.runHandoff({
          from_task_id: source.task_id,
          title: 'Follow up',
          project: 'inbox',
        })
      ).toThrow(/forced complete failure/);

      const created = createSpy.mock.results
        .map((result) => result.value)
        .find((task) => task.task_id !== source.task_id);
      expect(created).toBeDefined();
      if (!created) return;

      expect(taskService.getTaskById(created.task_id)?.status).toBe(TaskStatus.Archived);
      expect(taskService.getTaskById(source.task_id)?.status).toBe(TaskStatus.InProgress);
    } finally {
      completeSpy.mockRestore();
      createSpy.mockRestore();
    }
  });

  it('delegate adds dependency by default and can pause parent', () => {
    const source = taskService.createTask({ title: 'Parent', project: 'inbox' });
    taskService.setStatus(source.task_id, TaskStatus.Ready);
    taskService.claimTask(source.task_id, { author: 'agent-1' });

    const result = workflowService.runDelegate({
      from_task_id: source.task_id,
      title: 'Delegated',
      pause_parent: true,
      checkpoint: 'Passing this to another agent',
    });

    const depRow = db
      .prepare('SELECT depends_on_id FROM task_dependencies WHERE task_id = ?')
      .get(source.task_id) as { depends_on_id: string } | undefined;

    expect(depRow?.depends_on_id).toBe(result.delegated.task_id);
    expect(result.parent_paused).toBe(true);
    expect(taskService.getTaskById(source.task_id)?.status).toBe(TaskStatus.Blocked);
  });

  it('replays workflow result when explicit op_id is reused', () => {
    const source = taskService.createTask({ title: 'Source', project: 'inbox' });
    taskService.setStatus(source.task_id, TaskStatus.Ready);
    taskService.claimTask(source.task_id, { author: 'agent-1' });

    const first = workflowService.runHandoff({
      from_task_id: source.task_id,
      title: 'Follow up',
      project: 'inbox',
      op_id: 'handoff-1',
    });

    const second = workflowService.runHandoff({
      from_task_id: source.task_id,
      title: 'Follow up',
      project: 'inbox',
      op_id: 'handoff-1',
    });

    expect(first.follow_on.task_id).toBe(second.follow_on.task_id);
    expect(first.idempotency.replayed).toBe(false);
    expect(second.idempotency.replayed).toBe(true);
  });

  it('reclaims stale processing workflow op entries', () => {
    const source = taskService.createTask({ title: 'Source', project: 'inbox' });
    taskService.setStatus(source.task_id, TaskStatus.Ready);
    taskService.claimTask(source.task_id, { author: 'agent-1' });

    const first = workflowService.runDelegate({
      from_task_id: source.task_id,
      title: 'Delegated',
      project: 'inbox',
      op_id: 'stale-op',
    });
    expect(first.idempotency.replayed).toBe(false);

    const staleTs = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    db.prepare(
      `
      UPDATE workflow_ops
      SET state = 'processing', result_payload = NULL, error_payload = NULL, updated_at = ?
      WHERE op_id = ?
    `
    ).run(staleTs, 'stale-op');

    const second = workflowService.runDelegate({
      from_task_id: source.task_id,
      title: 'Delegated',
      project: 'inbox',
      op_id: 'stale-op',
    });

    expect(second.idempotency.replayed).toBe(false);
    expect(second.delegated.task_id).not.toBe(first.delegated.task_id);
  });

  it('rejects auto-op-id for start', () => {
    expect(() =>
      workflowService.runStart({
        agent: 'agent-1',
        auto_op_id: true,
      })
    ).toThrow(/auto-op-id is not supported/i);
  });
});
