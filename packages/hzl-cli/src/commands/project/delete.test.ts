import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runProjectDelete } from './delete.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { CLIError } from '../../errors.js';

describe('runProjectDelete', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-project-delete-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
    services.projectService.createProject('source');
    services.projectService.createProject('target');
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('deletes empty project', () => {
    services.projectService.createProject('empty');

    runProjectDelete({ services, name: 'empty', json: false });

    expect(services.projectService.getProject('empty')).toBeNull();
  });

  it('moves tasks when --move-to is used', () => {
    const task = services.taskService.createTask({ title: 'Move me', project: 'source' });

    runProjectDelete({ services, name: 'source', moveTo: 'target', json: false });

    const moved = services.taskService.getTaskById(task.task_id);
    expect(moved?.project).toBe('target');
    expect(services.projectService.getProject('source')).toBeNull();
  });

  it('archives tasks when --archive-tasks is used', () => {
    const task = services.taskService.createTask({ title: 'Archive me', project: 'source' });

    runProjectDelete({ services, name: 'source', archiveTasks: true, json: false });

    const archived = services.taskService.getTaskById(task.task_id);
    expect(archived).toBeNull();
  });

  it('deletes tasks when --delete-tasks is used', () => {
    const task = services.taskService.createTask({ title: 'Delete me', project: 'source' });

    runProjectDelete({ services, name: 'source', deleteTasks: true, json: false });

    const deleted = services.taskService.getTaskById(task.task_id);
    expect(deleted).toBeNull();
  });

  it('throws when project has tasks and no option specified', () => {
    services.taskService.createTask({ title: 'Task', project: 'source' });

    expect(() => runProjectDelete({ services, name: 'source', json: false })).toThrow(
      CLIError
    );
  });

  it('validates mutually exclusive flags', () => {
    expect(() =>
      runProjectDelete({
        services,
        name: 'source',
        moveTo: 'target',
        archiveTasks: true,
        json: false,
      })
    ).toThrow(CLIError);
  });

  it('records task counts in ProjectDeleted event', () => {
    services.taskService.createTask({ title: 'Active', project: 'source' });
    const archived = services.taskService.createTask({ title: 'Archived', project: 'source' });
    services.taskService.archiveTask(archived.task_id);

    runProjectDelete({ services, name: 'source', moveTo: 'target', json: false });

    const deletedEvent = services.db
      .prepare(`SELECT data FROM events WHERE type = 'project_deleted'`)
      .get() as { data: string } | undefined;
    expect(deletedEvent).toBeDefined();
    const data = JSON.parse(deletedEvent!.data) as any;
    expect(data.task_count).toBe(1);
    expect(data.archived_task_count).toBe(1);
  });
});
