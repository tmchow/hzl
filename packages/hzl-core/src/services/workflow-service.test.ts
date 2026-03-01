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
import { EventType, TaskStatus } from '../events/types.js';

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

  describe('start', () => {
    it('shows start workflow with explicit auto-op-id guardrail note', () => {
      const definition = workflowService.showWorkflow('start');
      expect(definition.supports_auto_op_id).toBe(false);
      expect(definition.notes.join(' ')).toMatch(/auto-op-id/i);
    });

    it('resumes existing in_progress task before claiming next', () => {
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

    it('claims next eligible task when nothing is in_progress', () => {
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

    it('respects tag filtering when claiming next task', () => {
      const tagged = taskService.createTask({
        title: 'Tagged',
        project: 'inbox',
        priority: 2,
        tags: ['alpha'],
      });
      const other = taskService.createTask({
        title: 'Other',
        project: 'inbox',
        priority: 3,
        tags: ['beta'],
      });
      taskService.setStatus(tagged.task_id, TaskStatus.Ready);
      taskService.setStatus(other.task_id, TaskStatus.Ready);

      const result = workflowService.runStart({
        agent: 'agent-tags',
        tags: ['alpha'],
      });

      expect(result.selected?.task_id).toBe(tagged.task_id);
      expect(taskService.getTaskById(other.task_id)?.status).toBe(TaskStatus.Ready);
    });

    it('respects project filtering when claiming next task', () => {
      projectService.createProject('project-a');
      projectService.createProject('project-b');
      const projectATask = taskService.createTask({ title: 'A', project: 'project-a', priority: 1 });
      const projectBTask = taskService.createTask({ title: 'B', project: 'project-b', priority: 3 });
      taskService.setStatus(projectATask.task_id, TaskStatus.Ready);
      taskService.setStatus(projectBTask.task_id, TaskStatus.Ready);

      const result = workflowService.runStart({
        agent: 'agent-project',
        project: 'project-a',
      });

      expect(result.selected?.task_id).toBe(projectATask.task_id);
      expect(taskService.getTaskById(projectBTask.task_id)?.status).toBe(TaskStatus.Ready);
    });

    it('sets lease_until on claimed task when lease_minutes is provided', () => {
      const task = taskService.createTask({ title: 'Leased', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      const before = Date.now();
      const result = workflowService.runStart({
        agent: 'agent-lease',
        lease_minutes: 15,
      });
      const after = Date.now();

      expect(result.selected?.lease_until).toBeTruthy();
      const leaseMs = Date.parse(result.selected!.lease_until!);
      expect(leaseMs).toBeGreaterThan(before);
      expect(leaseMs).toBeLessThanOrEqual(after + 16 * 60 * 1000);
    });

    it('resume_policy first picks oldest claimed_at', () => {
      const oldest = taskService.createTask({
        title: 'Oldest',
        project: 'inbox',
        initial_status: TaskStatus.InProgress,
        agent: 'agent-resume',
      });
      const newest = taskService.createTask({
        title: 'Newest',
        project: 'inbox',
        initial_status: TaskStatus.InProgress,
        agent: 'agent-resume',
      });
      db.prepare('UPDATE tasks_current SET claimed_at = ? WHERE task_id = ?').run(
        '2026-01-01T00:00:00.000Z',
        oldest.task_id
      );
      db.prepare('UPDATE tasks_current SET claimed_at = ? WHERE task_id = ?').run(
        '2026-01-02T00:00:00.000Z',
        newest.task_id
      );

      const result = workflowService.runStart({
        agent: 'agent-resume',
        resume_policy: 'first',
      });

      expect(result.mode).toBe('resume');
      expect(result.selected?.task_id).toBe(oldest.task_id);
    });

    it('resume_policy latest picks newest claimed_at', () => {
      const oldest = taskService.createTask({
        title: 'Oldest',
        project: 'inbox',
        initial_status: TaskStatus.InProgress,
        agent: 'agent-latest',
      });
      const newest = taskService.createTask({
        title: 'Newest',
        project: 'inbox',
        initial_status: TaskStatus.InProgress,
        agent: 'agent-latest',
      });
      db.prepare('UPDATE tasks_current SET claimed_at = ? WHERE task_id = ?').run(
        '2026-01-01T00:00:00.000Z',
        oldest.task_id
      );
      db.prepare('UPDATE tasks_current SET claimed_at = ? WHERE task_id = ?').run(
        '2026-01-02T00:00:00.000Z',
        newest.task_id
      );

      const result = workflowService.runStart({
        agent: 'agent-latest',
        resume_policy: 'latest',
      });

      expect(result.mode).toBe('resume');
      expect(result.selected?.task_id).toBe(newest.task_id);
    });

    it('include_others false omits others list while preserving count', () => {
      const one = taskService.createTask({
        title: 'One',
        project: 'inbox',
        initial_status: TaskStatus.InProgress,
        agent: 'agent-others',
        priority: 1,
      });
      taskService.createTask({
        title: 'Two',
        project: 'inbox',
        initial_status: TaskStatus.InProgress,
        agent: 'agent-others',
        priority: 0,
      });

      const result = workflowService.runStart({
        agent: 'agent-others',
        resume_policy: 'priority',
        include_others: false,
      });

      expect(result.mode).toBe('resume');
      expect(result.selected?.task_id).toBe(one.task_id);
      expect(result.others_total).toBe(1);
      expect(result.others).toEqual([]);
    });

    it('applies others_limit when returning alternates', () => {
      taskService.createTask({
        title: 'Top',
        project: 'inbox',
        initial_status: TaskStatus.InProgress,
        agent: 'agent-limit',
        priority: 3,
      });
      taskService.createTask({
        title: 'Mid',
        project: 'inbox',
        initial_status: TaskStatus.InProgress,
        agent: 'agent-limit',
        priority: 2,
      });
      taskService.createTask({
        title: 'Low',
        project: 'inbox',
        initial_status: TaskStatus.InProgress,
        agent: 'agent-limit',
        priority: 1,
      });
      taskService.createTask({
        title: 'Lowest',
        project: 'inbox',
        initial_status: TaskStatus.InProgress,
        agent: 'agent-limit',
        priority: 0,
      });

      const result = workflowService.runStart({
        agent: 'agent-limit',
        resume_policy: 'priority',
        others_limit: 2,
      });

      expect(result.mode).toBe('resume');
      expect(result.others_total).toBe(3);
      expect(result.others).toHaveLength(2);
    });

    it('avoids double-claiming under near-simultaneous runs from different agents', () => {
      const one = taskService.createTask({ title: 'Race one', project: 'inbox', priority: 1 });
      const two = taskService.createTask({ title: 'Race two', project: 'inbox', priority: 1 });
      taskService.setStatus(one.task_id, TaskStatus.Ready);
      taskService.setStatus(two.task_id, TaskStatus.Ready);

      const workflowServiceTwo = new WorkflowService(
        db,
        eventStore,
        projectionEngine,
        taskService,
        db
      );

      const first = workflowService.runStart({ agent: 'race-a' });
      const second = workflowServiceTwo.runStart({ agent: 'race-b' });

      expect(first.selected).not.toBeNull();
      expect(second.selected).not.toBeNull();
      expect(first.selected?.task_id).not.toBe(second.selected?.task_id);
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

  describe('handoff', () => {
    it('requires agent or project routing guardrail', () => {
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

    it('completes source and creates follow-on', () => {
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

    it('does not complete source when follow-on creation fails', () => {
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

    it('archives follow-on task when completion step fails', () => {
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

    it('auto_op_id can replay cached result when source last_event_id is unchanged', () => {
      const source = taskService.createTask({ title: 'Source auto', project: 'inbox' });
      taskService.setStatus(source.task_id, TaskStatus.Ready);
      taskService.claimTask(source.task_id, { author: 'agent-auto' });
      const before = db
        .prepare('SELECT last_event_id FROM tasks_current WHERE task_id = ?')
        .get(source.task_id) as { last_event_id: number };

      const first = workflowService.runHandoff({
        from_task_id: source.task_id,
        title: 'Follow up auto',
        project: 'inbox',
        auto_op_id: true,
      });
      db.prepare('UPDATE tasks_current SET last_event_id = ? WHERE task_id = ?').run(
        before.last_event_id,
        source.task_id
      );
      const replay = workflowService.runHandoff({
        from_task_id: source.task_id,
        title: 'Follow up auto',
        project: 'inbox',
        auto_op_id: true,
      });

      expect(first.idempotency.auto_generated).toBe(true);
      expect(first.idempotency.op_id).toBeTruthy();
      expect(replay.idempotency.replayed).toBe(true);
      expect(replay.follow_on.task_id).toBe(first.follow_on.task_id);
    });

    it('can route follow-on across projects', () => {
      projectService.createProject('project-a');
      projectService.createProject('project-b');
      const source = taskService.createTask({ title: 'Source A', project: 'project-a' });
      taskService.setStatus(source.task_id, TaskStatus.Ready);
      taskService.claimTask(source.task_id, { author: 'agent-x' });

      const result = workflowService.runHandoff({
        from_task_id: source.task_id,
        title: 'Follow up B',
        project: 'project-b',
      });

      expect(taskService.getTaskById(source.task_id)?.status).toBe(TaskStatus.Done);
      expect(result.follow_on.project).toBe('project-b');
    });

    it('archives follow-on when checkpoint carry step fails', () => {
      const source = taskService.createTask({ title: 'Source checkpoints', project: 'inbox' });
      taskService.setStatus(source.task_id, TaskStatus.Ready);
      taskService.claimTask(source.task_id, { author: 'agent-checkpoint' });
      taskService.addCheckpoint(source.task_id, 'state', { step: 1 });

      const originalAddCheckpoint = taskService.addCheckpoint.bind(taskService);
      const addCheckpointSpy = vi
        .spyOn(taskService, 'addCheckpoint')
        .mockImplementation((taskId, name, data, opts) => {
          if (taskId !== source.task_id) {
            throw new Error('forced checkpoint carry failure');
          }
          return originalAddCheckpoint(taskId, name, data, opts);
        });

      try {
        expect(() =>
          workflowService.runHandoff({
            from_task_id: source.task_id,
            title: 'Follow up checkpoint failure',
            project: 'inbox',
          })
        ).toThrow(/forced checkpoint carry failure/);

        const followOn = db
          .prepare('SELECT task_id FROM tasks_current WHERE title = ? ORDER BY created_at DESC LIMIT 1')
          .get('Follow up checkpoint failure') as { task_id: string } | undefined;
        expect(followOn).toBeDefined();
        expect(taskService.getTaskById(followOn!.task_id)?.status).toBe(TaskStatus.Archived);
        expect(taskService.getTaskById(source.task_id)?.status).toBe(TaskStatus.InProgress);
      } finally {
        addCheckpointSpy.mockRestore();
      }
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
  });

  describe('delegate', () => {
    it('adds dependency by default and can pause parent', () => {
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

    it('with pause_parent false keeps parent in_progress', () => {
      const source = taskService.createTask({ title: 'Source no pause', project: 'inbox' });
      taskService.setStatus(source.task_id, TaskStatus.Ready);
      taskService.claimTask(source.task_id, { author: 'agent-1' });

      const result = workflowService.runDelegate({
        from_task_id: source.task_id,
        title: 'Delegated no pause',
        pause_parent: false,
      });

      expect(result.parent_paused).toBe(false);
      expect(taskService.getTaskById(source.task_id)?.status).toBe(TaskStatus.InProgress);
    });

    it('auto_op_id can replay cached result when source last_event_id is unchanged', () => {
      const source = taskService.createTask({ title: 'Source delegate auto', project: 'inbox' });
      taskService.setStatus(source.task_id, TaskStatus.Ready);
      taskService.claimTask(source.task_id, { author: 'agent-auto' });
      const before = db
        .prepare('SELECT last_event_id FROM tasks_current WHERE task_id = ?')
        .get(source.task_id) as { last_event_id: number };

      const first = workflowService.runDelegate({
        from_task_id: source.task_id,
        title: 'Delegated auto',
        auto_op_id: true,
      });
      db.prepare('UPDATE tasks_current SET last_event_id = ? WHERE task_id = ?').run(
        before.last_event_id,
        source.task_id
      );
      const replay = workflowService.runDelegate({
        from_task_id: source.task_id,
        title: 'Delegated auto',
        auto_op_id: true,
      });

      expect(first.idempotency.auto_generated).toBe(true);
      expect(first.idempotency.op_id).toBeTruthy();
      expect(replay.idempotency.replayed).toBe(true);
      expect(replay.delegated.task_id).toBe(first.delegated.task_id);
    });

    it('rollback removes dependency and archives delegated task when checkpoint step fails', () => {
      const source = taskService.createTask({ title: 'Source rollback', project: 'inbox' });
      taskService.setStatus(source.task_id, TaskStatus.Ready);
      taskService.claimTask(source.task_id, { author: 'agent-rollback' });

      const addCheckpointSpy = vi
        .spyOn(taskService, 'addCheckpoint')
        .mockImplementation(() => {
          throw new Error('forced delegate checkpoint failure');
        });

      try {
        expect(() =>
          workflowService.runDelegate({
            from_task_id: source.task_id,
            title: 'Delegated rollback',
            checkpoint: 'carry context',
            pause_parent: false,
          })
        ).toThrow(/forced delegate checkpoint failure/);

        const delegated = db
          .prepare('SELECT task_id FROM tasks_current WHERE title = ? ORDER BY created_at DESC LIMIT 1')
          .get('Delegated rollback') as { task_id: string } | undefined;
        expect(delegated).toBeDefined();
        expect(taskService.getTaskById(delegated!.task_id)?.status).toBe(TaskStatus.Archived);

        const dep = db
          .prepare('SELECT 1 FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?')
          .get(source.task_id, delegated!.task_id);
        expect(dep).toBeUndefined();
      } finally {
        addCheckpointSpy.mockRestore();
      }
    });

    it('rollback swallow paths execute when dependency and archive cleanup operations fail', () => {
      const source = taskService.createTask({ title: 'Source rollback catches', project: 'inbox' });
      taskService.setStatus(source.task_id, TaskStatus.Ready);
      taskService.claimTask(source.task_id, { author: 'agent-catch' });

      const originalApply = projectionEngine.applyEvent.bind(projectionEngine);
      const addCheckpointSpy = vi.spyOn(taskService, 'addCheckpoint').mockImplementation(() => {
        throw new Error('forced delegate failure');
      });
      const archiveSpy = vi.spyOn(taskService, 'archiveTask').mockImplementation(() => {
        throw new Error('forced archive rollback failure');
      });
      const applySpy = vi.spyOn(projectionEngine, 'applyEvent').mockImplementation((event) => {
        if (event.type === EventType.DependencyRemoved) {
          throw new Error('forced dependency rollback failure');
        }
        return originalApply(event);
      });

      try {
        expect(() =>
          workflowService.runDelegate({
            from_task_id: source.task_id,
            title: 'Delegated rollback catches',
            checkpoint: 'context',
            pause_parent: false,
          })
        ).toThrow(/forced delegate failure/);
        expect(taskService.getTaskById(source.task_id)?.status).toBe(TaskStatus.InProgress);
      } finally {
        addCheckpointSpy.mockRestore();
        archiveSpy.mockRestore();
        applySpy.mockRestore();
      }
    });

    it('does not double-block when parent is already blocked and pause_parent=true', () => {
      const source = taskService.createTask({ title: 'Source blocked', project: 'inbox' });
      taskService.setStatus(source.task_id, TaskStatus.Ready);
      taskService.claimTask(source.task_id, { author: 'agent-blocked' });
      taskService.blockTask(source.task_id, { author: 'agent-blocked', comment: 'already blocked' });

      const result = workflowService.runDelegate({
        from_task_id: source.task_id,
        title: 'Delegated while blocked',
        pause_parent: true,
      });

      const blockedTransitions = eventStore
        .getByTaskId(source.task_id)
        .filter((event) => {
          if (event.type !== EventType.StatusChanged) return false;
          const data = event.data as { to?: string };
          return data.to === TaskStatus.Blocked;
        });

      expect(result.parent_paused).toBe(false);
      expect(taskService.getTaskById(source.task_id)?.status).toBe(TaskStatus.Blocked);
      expect(blockedTransitions).toHaveLength(1);
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
  });
});
