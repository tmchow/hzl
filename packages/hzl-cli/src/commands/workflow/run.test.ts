import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  runWorkflowDelegate,
  runWorkflowHandoff,
  runWorkflowStart,
} from './run.js';
import { closeDb, initializeDbFromPath, type Services } from '../../db.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('workflow run commands', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-workflow-run-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('start resumes in_progress task before claiming next', () => {
    const resumed = services.taskService.createTask({
      title: 'Resume',
      project: 'inbox',
      initial_status: TaskStatus.InProgress,
      agent: 'agent-1',
    });
    const ready = services.taskService.createTask({ title: 'Ready', project: 'inbox' });
    services.taskService.setStatus(ready.task_id, TaskStatus.Ready);

    const result = runWorkflowStart({
      services,
      agent: 'agent-1',
      json: false,
    });

    expect(result.mode).toBe('resume');
    expect(result.selected?.task_id).toBe(resumed.task_id);
    expect(services.taskService.getTaskById(ready.task_id)?.status).toBe(TaskStatus.Ready);
  });

  it('handoff applies guardrail requiring agent or project', () => {
    const source = services.taskService.createTask({ title: 'Source', project: 'inbox' });
    services.taskService.setStatus(source.task_id, TaskStatus.Ready);
    services.taskService.claimTask(source.task_id, { author: 'agent-1' });

    expect(() =>
      runWorkflowHandoff({
        services,
        fromTaskId: source.task_id,
        title: 'Follow on',
        json: false,
      })
    ).toThrow(/requires --agent, --project, or both/i);
  });

  it('delegate adds parent dependency by default', () => {
    const source = services.taskService.createTask({ title: 'Source', project: 'inbox' });
    services.taskService.setStatus(source.task_id, TaskStatus.Ready);
    services.taskService.claimTask(source.task_id, { author: 'agent-1' });

    const result = runWorkflowDelegate({
      services,
      fromTaskId: source.task_id,
      title: 'Delegated',
      json: false,
    });

    const row = services.cacheDb
      .prepare('SELECT depends_on_id FROM task_dependencies WHERE task_id = ?')
      .get(source.task_id) as { depends_on_id: string } | undefined;
    expect(row?.depends_on_id).toBe(result.delegated.task_id);
  });

  it('replays cached result when op_id table exists and op_id is reused', () => {
    services.db.exec(`
      CREATE TABLE op_id (
        op_id TEXT PRIMARY KEY,
        scope TEXT,
        input_hash TEXT,
        result TEXT,
        state TEXT,
        created_at TEXT,
        updated_at TEXT
      );
    `);

    const source = services.taskService.createTask({ title: 'Source', project: 'inbox' });
    services.taskService.setStatus(source.task_id, TaskStatus.Ready);
    services.taskService.claimTask(source.task_id, { author: 'agent-1' });

    const first = runWorkflowHandoff({
      services,
      fromTaskId: source.task_id,
      title: 'Follow on',
      project: 'inbox',
      opId: 'handoff-1',
      json: false,
    });

    const second = runWorkflowHandoff({
      services,
      fromTaskId: source.task_id,
      title: 'Follow on',
      project: 'inbox',
      opId: 'handoff-1',
      json: false,
    });

    expect(first.follow_on.task_id).toBe(second.follow_on.task_id);
    expect(second.idempotency.replayed).toBe(true);
  });
});
