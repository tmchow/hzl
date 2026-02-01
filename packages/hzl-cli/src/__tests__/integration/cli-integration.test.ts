import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import Database from 'libsql';
import { initializeDbFromPath, closeDb } from '../../db.js';
import {
  createTestContext,
  hzlJson,
  hzlMayFail,
  type TestContext,
} from './helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '../../..');
const cliBinaryPath = path.join(packageRoot, 'dist', 'cli.js');

beforeAll(() => {
  execSync('npm run build', { cwd: packageRoot, stdio: 'inherit' });
});

describe('CLI Integration Tests', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  const addTask = (project: string, title: string, extraArgs = '') => {
    if (project !== 'inbox') {
      hzlMayFail(ctx, `project create ${project}`);
    }
    const args = extraArgs ? ` ${extraArgs}` : '';
    return hzlJson<{ task_id: string; title: string; status: string }>(
      ctx,
      `task add "${title}" -P ${project}${args}`
    );
  };

  describe('init command', () => {
    it('creates database file', () => {
      const result = hzlJson<{ eventsDbPath: string; created: boolean }>(ctx, 'init');
      expect(result.created).toBe(true);
      expect(result.eventsDbPath).toBe(ctx.dbPath);
      expect(fs.existsSync(ctx.dbPath)).toBe(true);
    });

    it('is idempotent', () => {
      const first = hzlJson<{ eventsDbPath: string; created: boolean }>(ctx, 'init');
      const second = hzlJson<{ eventsDbPath: string; created: boolean }>(ctx, 'init');
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(fs.existsSync(ctx.dbPath)).toBe(true);
    });

    it('returns path information', () => {
      const result = hzlJson<{ eventsDbPath: string; created: boolean }>(ctx, 'init');
      expect(result.eventsDbPath).toBe(ctx.dbPath);
      expect(result.created).toBe(true);
    });
  });

  describe('which-db command', () => {
    it('returns resolved database path', () => {
      const result = hzlJson<{ eventsDbPath: string; cacheDbPath: string }>(ctx, 'which-db');
      expect(result.eventsDbPath).toBe(ctx.dbPath);
      expect(result.cacheDbPath).toBe(ctx.cachePath);
    });
  });

  describe('task lifecycle round-trip', () => {
    it('creates, lists, claims, completes, and archives a task', () => {
      const created = addTask('inbox', 'Test task', '--priority 2 --tags urgent,backend');
      const taskId = created.task_id;

      const listResult = hzlJson<{ tasks: Array<{ status: string }> }>(
        ctx,
        'task list --project inbox'
      );
      expect(listResult.tasks).toHaveLength(1);
      expect(listResult.tasks[0].status).toBe('backlog');

      hzlJson(ctx, `task set-status ${taskId} ready`);
      const afterReady = hzlJson<{ task: { status: string } }>(ctx, `task show ${taskId}`);
      expect(afterReady.task.status).toBe('ready');

      hzlJson(ctx, `task claim ${taskId} --author agent-1 --lease 30`);
      const afterClaim = hzlJson<{ task: { status: string; claimed_by_author: string | null } }>(
        ctx,
        `task show ${taskId}`
      );
      expect(afterClaim.task.status).toBe('in_progress');
      expect(afterClaim.task.claimed_by_author).toBe('agent-1');

      hzlJson(ctx, `task complete ${taskId} --author agent-1`);
      const afterComplete = hzlJson<{ task: { status: string } }>(ctx, `task show ${taskId}`);
      expect(afterComplete.task.status).toBe('done');

      hzlJson(ctx, `task archive ${taskId} --reason done --author agent-1`);
      const afterArchive = hzlJson<{ task: { status: string } }>(ctx, `task show ${taskId}`);
      expect(afterArchive.task.status).toBe('archived');
    });

    it('next command respects priority ordering', () => {
      addTask('inbox', 'Low priority', '--priority 0');
      const high = addTask('inbox', 'High priority', '--priority 3');
      addTask('inbox', 'Medium priority', '--priority 1');

      const tasks = hzlJson<{ tasks: Array<{ task_id: string }> }>(
        ctx,
        'task list --project inbox'
      );
      for (const task of tasks.tasks) {
        hzlJson(ctx, `task set-status ${task.task_id} ready`);
      }

      const next = hzlJson<{ task_id: string }>(ctx, 'task next --project inbox');
      expect(next.task_id).toBe(high.task_id);
    });

    it('next respects dependency ordering', () => {
      const dep = addTask('inbox', 'Dependency task');
      const main = addTask('inbox', 'Main task', `--depends-on ${dep.task_id}`);

      hzlJson(ctx, `task set-status ${dep.task_id} ready`);
      hzlJson(ctx, `task set-status ${main.task_id} ready`);

      const next1 = hzlJson<{ task_id: string }>(ctx, 'task next --project inbox');
      expect(next1.task_id).toBe(dep.task_id);

      hzlJson(ctx, `task claim ${dep.task_id} --author agent-1`);
      hzlJson(ctx, `task complete ${dep.task_id} --author agent-1`);

      const next2 = hzlJson<{ task_id: string }>(ctx, 'task next --project inbox');
      expect(next2.task_id).toBe(main.task_id);
    });
  });

  describe('dependency management round-trip', () => {
    it('adds and removes dependencies', () => {
      const task1 = addTask('inbox', 'Task 1');
      const task2 = addTask('inbox', 'Task 2');

      const addResult = hzlJson<{ task_id: string; depends_on_id: string }>(
        ctx,
        `task add-dep ${task2.task_id} ${task1.task_id}`
      );
      expect(addResult.task_id).toBe(task2.task_id);
      expect(addResult.depends_on_id).toBe(task1.task_id);

      const db = new Database(ctx.cachePath);
      const deps = db
        .prepare('SELECT depends_on_id FROM task_dependencies WHERE task_id = ?')
        .all(task2.task_id) as { depends_on_id: string }[];
      expect(deps.map((d) => d.depends_on_id)).toContain(task1.task_id);
      db.close();

      hzlJson(ctx, `task remove-dep ${task2.task_id} ${task1.task_id}`);

      const dbAfter = new Database(ctx.cachePath);
      const depsAfter = dbAfter
        .prepare('SELECT depends_on_id FROM task_dependencies WHERE task_id = ?')
        .all(task2.task_id) as { depends_on_id: string }[];
      expect(depsAfter.map((d) => d.depends_on_id)).not.toContain(task1.task_id);
      dbAfter.close();
    });

    it('rejects cyclic dependencies', () => {
      const task1 = addTask('inbox', 'Task 1');
      const task2 = addTask('inbox', 'Task 2');

      hzlJson(ctx, `task add-dep ${task2.task_id} ${task1.task_id}`);

      const result = hzlMayFail(ctx, `task add-dep ${task1.task_id} ${task2.task_id}`);
      expect(result.success).toBe(false);
    });
  });

  describe('comment and checkpoint round-trip', () => {
    it('adds comments and retrieves them', () => {
      const task = addTask('inbox', 'Test task');

      hzlJson(ctx, `task comment ${task.task_id} "First comment" --author user-1`);
      hzlJson(ctx, `task comment ${task.task_id} "Second comment" --author user-2`);

      const details = hzlJson<{ comments: Array<{ text: string }> }>(
        ctx,
        `task show ${task.task_id}`
      );
      expect(details.comments).toHaveLength(2);
      expect(details.comments[0].text).toBe('First comment');
    });

    it('adds checkpoints and retrieves them', () => {
      const task = addTask('inbox', 'Test task');

      hzlJson(ctx, `task checkpoint ${task.task_id} step1 --data '{"progress":25}'`);
      hzlJson(ctx, `task checkpoint ${task.task_id} step2 --data '{"progress":50}'`);

      const details = hzlJson<{ checkpoints: Array<{ name: string; data: { progress: number } }> }>(
        ctx,
        `task show ${task.task_id}`
      );
      expect(details.checkpoints).toHaveLength(2);
      expect(details.checkpoints[0].name).toBe('step1');
      expect(details.checkpoints[0].data.progress).toBe(25);
    });
  });

  describe('search round-trip', () => {
    it('indexes and finds tasks by title', () => {
      addTask('inbox', 'Implement OAuth authentication');
      addTask('inbox', 'Write unit tests');
      addTask('inbox', 'Setup CI pipeline');

      const results = hzlJson<{ tasks: Array<{ title: string }> }>(
        ctx,
        'task search authentication'
      );
      expect(results.tasks).toHaveLength(1);
      expect(results.tasks[0].title).toContain('OAuth');
    });

    it('finds tasks by description', () => {
      addTask('inbox', 'Backend task', '--description "Implement REST API endpoints"');
      addTask('inbox', 'Frontend task', '--description "Create React components"');

      const results = hzlJson<{ tasks: Array<{ title: string }> }>(ctx, 'task search REST');
      expect(results.tasks).toHaveLength(1);
      expect(results.tasks[0].title).toBe('Backend task');
    });
  });

  describe('project management round-trip', () => {
    it('lists projects with task counts', () => {
      addTask('project-a', 'Task 1');
      addTask('project-a', 'Task 2');
      addTask('project-b', 'Task 3');

      const projects = hzlJson<{ projects: Array<{ name: string; task_count: number }> }>(
        ctx,
        'project list'
      );
      expect(projects.projects).toHaveLength(3);

      const projectA = projects.projects.find((p) => p.name === 'project-a');
      expect(projectA?.task_count).toBe(2);
    });

    it('moves tasks between projects', () => {
      const task = addTask('project-a', 'Movable task');
      hzlMayFail(ctx, 'project create project-b');

      hzlJson(ctx, `task move ${task.task_id} project-b`);

      const afterMove = hzlJson<{ task: { project: string } }>(
        ctx,
        `task show ${task.task_id}`
      );
      expect(afterMove.task.project).toBe('project-b');
    });

    it('renames project by moving all tasks', () => {
      addTask('old-project', 'Task 1');
      addTask('old-project', 'Task 2');

      hzlJson(ctx, 'project rename old-project new-project');

      const projects = hzlJson<{ projects: Array<{ name: string }> }>(
        ctx,
        'project list'
      );
      const names = projects.projects.map((p) => p.name);
      expect(names).toContain('new-project');
      expect(names).not.toContain('old-project');
    });
  });

  describe('history and event tracking', () => {
    it('shows full event history for a task', () => {
      const task = addTask('inbox', 'Test task');
      hzlJson(ctx, `task set-status ${task.task_id} ready`);
      hzlJson(ctx, `task claim ${task.task_id} --author agent-1`);
      hzlJson(ctx, `task comment ${task.task_id} "Working on it"`);
      hzlJson(ctx, `task complete ${task.task_id} --author agent-1`);

      const history = hzlJson<{ events: Array<{ type: string }> }>(
        ctx,
        `task history ${task.task_id}`
      );
      const eventTypes = history.events.map((e) => e.type);

      expect(eventTypes).toContain('task_created');
      expect(eventTypes).toContain('status_changed');
      expect(eventTypes).toContain('comment_added');
    });
  });

  describe('stats command', () => {
    it('returns task counts by status', () => {
      const t1 = addTask('inbox', 'Backlog task');
      const t2 = addTask('inbox', 'Ready task');
      const t3 = addTask('inbox', 'In progress task');
      const t4 = addTask('inbox', 'Done task');

      hzlJson(ctx, `task set-status ${t2.task_id} ready`);
      hzlJson(ctx, `task set-status ${t3.task_id} ready`);
      hzlJson(ctx, `task claim ${t3.task_id} --author agent-1`);
      hzlJson(ctx, `task set-status ${t4.task_id} ready`);
      hzlJson(ctx, `task claim ${t4.task_id} --author agent-1`);
      hzlJson(ctx, `task complete ${t4.task_id} --author agent-1`);

      const stats = hzlJson<{ by_status: Record<string, number> }>(ctx, 'stats --project inbox');

      expect(stats.by_status.backlog).toBe(1);
      expect(stats.by_status.ready).toBe(1);
      expect(stats.by_status.in_progress).toBe(1);
      expect(stats.by_status.done).toBe(1);
    });
  });

  describe('validate command', () => {
    it('validates a clean database successfully', () => {
      addTask('inbox', 'Task 1');
      addTask('inbox', 'Task 2');

      const result = hzlJson<{ isValid: boolean; issues: unknown[] }>(ctx, 'validate');
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('export-events command', () => {
    it('exports events to JSONL file', () => {
      addTask('inbox', 'Task 1');
      addTask('inbox', 'Task 2');

      const exportPath = path.join(ctx.tempDir, 'events.jsonl');
      hzlJson(ctx, `export-events ${exportPath}`);

      expect(fs.existsSync(exportPath)).toBe(true);
      const content = fs.readFileSync(exportPath, 'utf-8');
      const lines = content.trim().split('\n').filter((line) => line.length > 0);
      // 1 project_created (inbox) + 2 task_created events
      expect(lines).toHaveLength(3);

      const events = lines.map((line) => JSON.parse(line));
      expect(events[0].type).toBe('project_created');
      expect(events[1].type).toBe('task_created');
      expect(events[2].type).toBe('task_created');
      for (const event of events) {
        expect(event.event_id).toBeDefined();
      }
    });
  });

  describe('release and reopen commands', () => {
    it('releases a claimed task back to ready', () => {
      const task = addTask('inbox', 'Task to release');
      hzlJson(ctx, `task set-status ${task.task_id} ready`);
      hzlJson(ctx, `task claim ${task.task_id} --author agent-1`);

      const released = hzlJson<{ status: string; claimed_by_author: string | null }>(
        ctx,
        `task release ${task.task_id}`
      );
      expect(released.status).toBe('ready');
      expect(released.claimed_by_author).toBeNull();
    });

    it('reopens a done task', () => {
      const task = addTask('inbox', 'Task to reopen');
      hzlJson(ctx, `task set-status ${task.task_id} ready`);
      hzlJson(ctx, `task claim ${task.task_id} --author agent-1`);
      hzlJson(ctx, `task complete ${task.task_id} --author agent-1`);

      const reopened = hzlJson<{ status: string }>(ctx, `task reopen ${task.task_id}`);
      expect(reopened.status).toBe('ready');
    });
  });

  describe('steal and stuck commands', () => {
    it('steals a task with force flag', () => {
      const task = addTask('inbox', 'Task to steal');
      hzlJson(ctx, `task set-status ${task.task_id} ready`);
      hzlJson(ctx, `task claim ${task.task_id} --author agent-1 --lease 60`);

      const stolen = hzlJson<{ claimed_by_author: string | null }>(
        ctx,
        `task steal ${task.task_id} --force --owner agent-2`
      );
      expect(stolen.claimed_by_author).toBe('agent-2');
    });

    it('lists stuck tasks with expired leases', () => {
      const task = addTask('inbox', 'Stuck task');
      hzlJson(ctx, `task set-status ${task.task_id} ready`);

      const pastLease = new Date(Date.now() - 60000).toISOString();
      const services = initializeDbFromPath(ctx.dbPath);
      try {
        services.taskService.claimTask(task.task_id, {
          author: 'stalled-agent',
          lease_until: pastLease,
        });
      } finally {
        closeDb(services);
      }

      const stuckResult = hzlJson<{ tasks: Array<{ task_id: string }> }>(
        ctx,
        'task stuck --older-than 0'
      );
      expect(stuckResult.tasks.length).toBeGreaterThanOrEqual(1);
    });
  });
});
