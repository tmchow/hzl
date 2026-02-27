// packages/hzl-cli/src/commands/add.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runAdd } from './add.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';

describe('runAdd', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-add-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a task with just title', () => {
    const result = runAdd({
      services,
      project: 'inbox',
      title: 'Test task',
      json: false,
    });

    expect(result.task_id).toBeDefined();
    expect(result.title).toBe('Test task');
    expect(result.project).toBe('inbox');
  });

  it('creates a task with all options', () => {
    services.projectService.createProject('my-project');
    const result = runAdd({
      services,
      project: 'my-project',
      title: 'Full task',
      description: 'A description',
      tags: ['urgent', 'backend'],
      priority: 2,
      json: false,
    });

    expect(result.project).toBe('my-project');
    expect(result.priority).toBe(2);
  });

  it('creates a task with links', () => {
    const result = runAdd({
      services,
      project: 'inbox',
      title: 'Task with links',
      links: ['docs/design.md', 'https://example.com/spec'],
      json: false,
    });

    const task = services.taskService.getTaskById(result.task_id);
    expect(task?.links).toEqual(['docs/design.md', 'https://example.com/spec']);
  });

  it('creates a task with agent in backlog', () => {
    const result = runAdd({
      services,
      project: 'inbox',
      title: 'Backlog task',
      agent: 'kenji',
      json: false,
    });

    const task = services.taskService.getTaskById(result.task_id);
    expect(task?.status).toBe('backlog');
    expect(task?.assignee).toBe('kenji');
  });

  it('records author separately from agent on create', () => {
    const result = runAdd({
      services,
      project: 'inbox',
      title: 'Delegated task',
      agent: 'kenji',
      author: 'clara',
      status: 'ready',
      json: false,
    });

    const task = services.taskService.getTaskById(result.task_id);
    expect(task?.assignee).toBe('kenji');

    const events = services.eventStore.getByTaskId(result.task_id);
    expect(events[0].type).toBe('task_created');
    expect(events[0].author).toBe('clara');
    expect((events[0].data as { assignee?: string }).assignee).toBe('kenji');
  });

  it('creates a task with dependencies', () => {
    const dep = runAdd({ services, project: 'inbox', title: 'Dependency', json: false });
    const result = runAdd({
      services,
      project: 'inbox',
      title: 'Dependent task',
      dependsOn: [dep.task_id],
      json: false,
    });

    expect(result.task_id).toBeDefined();
    // Dependent task should have the dependency recorded
    const task = services.taskService.getTaskById(result.task_id);
    expect(task).toBeDefined();
  });

  it('creates a subtask with parent', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });

    const result = runAdd({
      services,
      project: 'inbox', // ignored when parent specified
      title: 'Subtask',
      parent: parent.task_id,
      json: false,
    });

    expect(result.task_id).toBeDefined();
    const task = services.taskService.getTaskById(result.task_id);
    expect(task?.parent_id).toBe(parent.task_id);
    expect(task?.project).toBe('myproject'); // inherited from parent
  });

  it('inherits project from parent, ignoring --project', () => {
    services.projectService.createProject('myproject');
    services.projectService.createProject('other');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });

    const result = runAdd({
      services,
      project: 'other', // should be ignored
      title: 'Subtask',
      parent: parent.task_id,
      json: false,
    });

    const task = services.taskService.getTaskById(result.task_id);
    expect(task?.project).toBe('myproject'); // not 'other'
  });

  it('errors when parent does not exist', () => {
    expect(() => runAdd({
      services,
      project: 'inbox',
      title: 'Subtask',
      parent: 'nonexistent',
      json: false,
    })).toThrow(/parent.*not found/i);
  });

  it('errors when parent is archived', () => {
    services.projectService.createProject('myproject');
    const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
    services.taskService.archiveTask(parent.task_id);

    expect(() => runAdd({
      services,
      project: 'inbox',
      title: 'Subtask',
      parent: parent.task_id,
      json: false,
    })).toThrow(/(archived.*parent|parent.*archived)/i);
  });

  it('errors when parent already has a parent (max 1 level)', () => {
    services.projectService.createProject('myproject');
    const grandparent = services.taskService.createTask({ title: 'Grandparent', project: 'myproject' });
    const parent = services.taskService.createTask({
      title: 'Parent',
      project: 'myproject',
      parent_id: grandparent.task_id
    });

    expect(() => runAdd({
      services,
      project: 'inbox',
      title: 'Grandchild',
      parent: parent.task_id,
      json: false,
    })).toThrow(/max.*level|cannot create subtask of a subtask/i);
  });

  describe('status flag', () => {
    it('creates task with -s ready', () => {
      const result = runAdd({
        services,
        project: 'inbox',
        title: 'Ready task',
        status: 'ready',
        json: false,
      });

      const task = services.taskService.getTaskById(result.task_id);
      expect(task?.status).toBe('ready');
    });

    it('creates task with -s ready and keeps agent', () => {
      const result = runAdd({
        services,
        project: 'inbox',
        title: 'Ready task',
        status: 'ready',
        agent: 'kenji',
        json: false,
      });

      const task = services.taskService.getTaskById(result.task_id);
      expect(task?.status).toBe('ready');
      expect(task?.assignee).toBe('kenji');
    });

    it('creates task with -s in_progress and sets agent', () => {
      const result = runAdd({
        services,
        project: 'inbox',
        title: 'In progress task',
        status: 'in_progress',
        agent: 'agent-1',
        json: false,
      });

      const task = services.taskService.getTaskById(result.task_id);
      expect(task?.status).toBe('in_progress');
      expect(task?.assignee).toBe('agent-1');
    });

    it('keeps agent when -s in_progress has distinct --author', () => {
      const result = runAdd({
        services,
        project: 'inbox',
        title: 'Delegated in progress task',
        status: 'in_progress',
        agent: 'kenji',
        author: 'clara',
        json: false,
      });

      const task = services.taskService.getTaskById(result.task_id);
      expect(task?.status).toBe('in_progress');
      expect(task?.assignee).toBe('kenji');

      const events = services.eventStore.getByTaskId(result.task_id);
      expect(events[0].author).toBe('clara');
      expect(events[1].author).toBe('clara');
    });

    it('creates task with -s blocked and --comment', () => {
      const result = runAdd({
        services,
        project: 'inbox',
        title: 'Blocked task',
        status: 'blocked',
        comment: 'Waiting for API keys',
        json: false,
      });

      const task = services.taskService.getTaskById(result.task_id);
      expect(task?.status).toBe('blocked');
    });

    it('creates task with -s blocked without --comment (optional)', () => {
      const result = runAdd({
        services,
        project: 'inbox',
        title: 'Blocked task',
        status: 'blocked',
        json: false,
      });

      const task = services.taskService.getTaskById(result.task_id);
      expect(task?.status).toBe('blocked');
    });

    it('errors on invalid status', () => {
      expect(() => runAdd({
        services,
        project: 'inbox',
        title: 'Task',
        status: 'invalid',
        json: false,
      })).toThrow(/invalid status/i);
    });

    it('errors on archived status with helpful message', () => {
      expect(() => runAdd({
        services,
        project: 'inbox',
        title: 'Task',
        status: 'archived',
        json: false,
      })).toThrow(/cannot create task as archived.*use -s done/i);
    });
  });
});
