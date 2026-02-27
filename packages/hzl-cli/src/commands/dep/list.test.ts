import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TaskStatus } from 'hzl-core/events/types.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { runDepList } from './list.js';

describe('runDepList', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-dep-list-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('lists dependency edges and marks missing targets safely', () => {
    const dep = services.taskService.createTask({ title: 'Dep', project: 'inbox' });
    const dependent = services.taskService.createTask({
      title: 'Dependent',
      project: 'inbox',
      depends_on: [dep.task_id],
    });

    services.taskService.setStatus(dependent.task_id, TaskStatus.Ready);
    services.taskService.createTask({
      title: 'Orphan edge',
      project: 'inbox',
      depends_on: ['missing-task-id'],
    });

    const result = runDepList({ services, json: false });
    expect(result.total).toBe(2);

    const existing = result.dependencies.find((d) => d.to_task_id === dep.task_id);
    expect(existing?.missing_to).toBe(false);

    const missing = result.dependencies.find((d) => d.to_task_id === 'missing-task-id');
    expect(missing?.missing_to).toBe(true);
    expect(missing?.blocking).toBe(false); // source task still backlog
  });

  it('filters by project for either side of edge', () => {
    services.projectService.createProject('alpha');
    services.projectService.createProject('beta');

    const depAlpha = services.taskService.createTask({ title: 'Dep Alpha', project: 'alpha' });
    services.taskService.createTask({
      title: 'From Beta',
      project: 'beta',
      depends_on: [depAlpha.task_id],
    });

    const resultAlpha = runDepList({ services, project: 'alpha', json: false });
    const resultBeta = runDepList({ services, project: 'beta', json: false });
    expect(resultAlpha.total).toBe(1);
    expect(resultBeta.total).toBe(1);
  });

  it('filters by from-project and to-project', () => {
    services.projectService.createProject('alpha');
    services.projectService.createProject('beta');

    const depAlpha = services.taskService.createTask({ title: 'Dep Alpha', project: 'alpha' });
    services.taskService.createTask({
      title: 'From Beta',
      project: 'beta',
      depends_on: [depAlpha.task_id],
    });
    const depBeta = services.taskService.createTask({ title: 'Dep Beta', project: 'beta' });
    services.taskService.createTask({
      title: 'From Beta 2',
      project: 'beta',
      depends_on: [depBeta.task_id],
    });

    const result = runDepList({
      services,
      fromProject: 'beta',
      toProject: 'alpha',
      json: false,
    });

    expect(result.total).toBe(1);
    expect(result.dependencies[0].from_project).toBe('beta');
    expect(result.dependencies[0].to_project).toBe('alpha');
  });

  it('filters by agent, from-agent, and to-agent', () => {
    const toMatch = services.taskService.createTask({
      title: 'Dep Match',
      project: 'inbox',
      agent: 'to-agent',
    });
    const toOther = services.taskService.createTask({
      title: 'Dep Other',
      project: 'inbox',
      agent: 'to-other',
    });
    const fromMatch = services.taskService.createTask({
      title: 'From Match',
      project: 'inbox',
      depends_on: [toMatch.task_id],
      agent: 'from-agent',
    });
    const fromOther = services.taskService.createTask({
      title: 'From Other',
      project: 'inbox',
      depends_on: [toOther.task_id],
      agent: 'from-other',
    });

    const fromAgent = runDepList({ services, fromAgent: 'from-agent', json: false });
    const toAgent = runDepList({ services, toAgent: 'to-agent', json: false });
    const eitherFrom = runDepList({ services, agent: 'from-agent', json: false });
    const eitherTo = runDepList({ services, agent: 'to-agent', json: false });

    expect(fromAgent.total).toBe(1);
    expect(toAgent.total).toBe(1);
    expect(eitherFrom.total).toBe(1);
    expect(eitherTo.total).toBe(1);
  });

  it('supports blocking-only filter', () => {
    const blocker = services.taskService.createTask({ title: 'Blocker', project: 'inbox' });
    const blocked = services.taskService.createTask({
      title: 'Blocked',
      project: 'inbox',
      depends_on: [blocker.task_id],
    });
    services.taskService.setStatus(blocked.task_id, TaskStatus.Ready);

    const doneDep = services.taskService.createTask({ title: 'Done dep', project: 'inbox' });
    services.taskService.setStatus(doneDep.task_id, TaskStatus.Ready);
    services.taskService.claimTask(doneDep.task_id);
    services.taskService.completeTask(doneDep.task_id);
    const unblocked = services.taskService.createTask({
      title: 'Unblocked',
      project: 'inbox',
      depends_on: [doneDep.task_id],
    });
    services.taskService.setStatus(unblocked.task_id, TaskStatus.Ready);

    const orphan = services.taskService.createTask({
      title: 'Orphan',
      project: 'inbox',
      depends_on: ['missing-for-blocking'],
    });
    services.taskService.setStatus(orphan.task_id, TaskStatus.Ready);

    const pausedParent = services.taskService.createTask({
      title: 'Paused Parent',
      project: 'inbox',
      depends_on: [blocker.task_id],
    });
    services.taskService.setStatus(pausedParent.task_id, TaskStatus.Blocked);

    const result = runDepList({ services, blockingOnly: true, json: false });
    const edgePairs = result.dependencies.map((d) => `${d.from_task_id}->${d.to_task_id}`).sort();
    expect(edgePairs).toEqual(
      [
        `${blocked.task_id}->${blocker.task_id}`,
        `${orphan.task_id}->missing-for-blocking`,
        `${pausedParent.task_id}->${blocker.task_id}`,
      ].sort()
    );
  });

  it('supports cross-project-only filter', () => {
    services.projectService.createProject('alpha');
    services.projectService.createProject('beta');

    const depAlpha = services.taskService.createTask({ title: 'Dep Alpha', project: 'alpha' });
    services.taskService.createTask({
      title: 'From Beta',
      project: 'beta',
      depends_on: [depAlpha.task_id],
    });
    const depBeta = services.taskService.createTask({ title: 'Dep Beta', project: 'beta' });
    services.taskService.createTask({
      title: 'From Beta 2',
      project: 'beta',
      depends_on: [depBeta.task_id],
    });

    const result = runDepList({ services, crossProjectOnly: true, json: false });
    expect(result.total).toBe(1);
    expect(result.dependencies[0].cross_project).toBe(true);
  });
});
