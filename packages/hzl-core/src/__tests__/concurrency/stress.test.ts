import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { Worker } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import Database from 'libsql';
import { createTestDbAtPath } from '../../db/test-utils.js';
import { EventStore } from '../../events/store.js';
import { ProjectionEngine } from '../../projections/engine.js';
import { TasksCurrentProjector } from '../../projections/tasks-current.js';
import { DependenciesProjector } from '../../projections/dependencies.js';
import { TagsProjector } from '../../projections/tags.js';
import { TaskService } from '../../services/task-service.js';
import { TaskStatus } from '../../events/types.js';

interface WorkerCommand {
  type: 'claim-next' | 'steal' | 'complete' | 'release' | 'claim-specific';
  project?: string;
  taskId?: string;
  author: string;
  leaseMinutes?: number;
  ifExpired?: boolean;
  force?: boolean;
}

interface WorkerResult {
  success: boolean;
  taskId?: string;
  error?: string;
  operation: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '../../..');
const distWorkerPath = path.join(packageRoot, 'dist/__tests__/concurrency/worker.js');

function runWorker(dbPath: string, command: WorkerCommand): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(distWorkerPath, {
      workerData: { dbPath, command },
    });
    worker.on('message', (message) => {
      if (settled) return;
      settled = true;
      resolve(message as WorkerResult);
    });
    worker.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    worker.on('exit', (code) => {
      if (settled || code === 0) return;
      settled = true;
      reject(new Error(`Worker exited with code ${code}`));
    });
  });
}

function setupServices(database: Database.Database) {
  const eventStore = new EventStore(database);
  const engine = new ProjectionEngine(database);
  engine.register(new TasksCurrentProjector());
  engine.register(new DependenciesProjector());
  engine.register(new TagsProjector());
  return {
    eventStore,
    engine,
    taskService: new TaskService(database, eventStore, engine),
  };
}

describe('Concurrency Stress Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;
  let taskService: TaskService;

  beforeAll(() => {
    execSync('npm run build', { cwd: packageRoot, stdio: 'inherit' });
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-stress-'));
    dbPath = path.join(tempDir, 'test.db');
    db = createTestDbAtPath(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    const services = setupServices(db);
    taskService = services.taskService;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('claim-next contention (cross-process)', () => {
    it('ensures exactly one agent claims each task under high contention', async () => {
      const taskIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const task = taskService.createTask({ title: `Task ${i}`, project: 'stress-test' });
        taskService.setStatus(task.task_id, TaskStatus.Ready);
        taskIds.push(task.task_id);
      }

      const claims = Array.from({ length: 20 }, (_, i) =>
        runWorker(dbPath, {
          type: 'claim-next',
          project: 'stress-test',
          author: `agent-${i}`,
        })
      );

      const results = await Promise.all(claims);
      const successes = results.filter((result) => result.success);
      expect(successes).toHaveLength(10);

      const claimedTaskIds = successes.map((result) => result.taskId);
      const uniqueClaimedIds = new Set(claimedTaskIds);
      expect(uniqueClaimedIds.size).toBe(10);

      for (const taskId of taskIds) {
        expect(claimedTaskIds).toContain(taskId);
      }

      const failedClaims = results.filter((result) => !result.success);
      expect(failedClaims).toHaveLength(10);
    });

    it('prevents double-claiming a single task across workers', async () => {
      const task = taskService.createTask({ title: 'Contested task', project: 'stress-test' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      const attempts = Array.from({ length: 20 }, (_, i) =>
        runWorker(dbPath, {
          type: 'claim-specific',
          taskId: task.task_id,
          author: `agent-${i}`,
        })
      );

      const results = await Promise.all(attempts);
      const successes = results.filter((result) => result.success);
      expect(successes).toHaveLength(1);
      expect(successes[0].taskId).toBe(task.task_id);

      const taskRow = db
        .prepare('SELECT status, agent FROM tasks_current WHERE task_id = ?')
        .get(task.task_id) as { status: string; agent: string | null };
      expect(taskRow.status).toBe('in_progress');
      expect(taskRow.agent).toBeDefined();
    });
  });

  describe('steal contention (cross-process)', () => {
    it('allows only one agent to steal an expired lease', async () => {
      const task = taskService.createTask({ title: 'Expired task', project: 'stress-test' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, {
        author: 'original-agent',
        lease_until: new Date(Date.now() - 60000).toISOString(),
      });

      const steals = Array.from({ length: 10 }, (_, i) =>
        runWorker(dbPath, {
          type: 'steal',
          taskId: task.task_id,
          author: `stealer-${i}`,
          ifExpired: true,
          leaseMinutes: 5,
        })
      );

      const results = await Promise.all(steals);
      const successes = results.filter((result) => result.success);
      expect(successes).toHaveLength(1);

      const updatedTask = taskService.getTaskById(task.task_id);
      expect(updatedTask?.agent).toBeTruthy();
    });

    it('rejects steal when lease is not expired', () => {
      const task = taskService.createTask({ title: 'Active task', project: 'stress-test' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, {
        author: 'original-agent',
        lease_until: new Date(Date.now() + 3600000).toISOString(),
      });

      const result = taskService.stealTask(task.task_id, {
        author: 'stealer',
        ifExpired: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not expired');
    });
  });

  describe('mixed operations stress test (cross-process)', () => {
    it('handles concurrent claim, complete, and release operations', async () => {
      for (let i = 0; i < 12; i++) {
        const task = taskService.createTask({ title: `Task ${i}`, project: 'stress-test' });
        taskService.setStatus(task.task_id, TaskStatus.Ready);
      }

      const claims = Array.from({ length: 6 }, (_, i) =>
        runWorker(dbPath, {
          type: 'claim-next',
          project: 'stress-test',
          author: `agent-${i}`,
        })
      );
      const claimResults = await Promise.all(claims);
      const claimed = claimResults.filter((result) => result.success && result.taskId);
      expect(claimed).toHaveLength(6);

      const completeOps = claimed.slice(0, 3).map((claim, index) =>
        runWorker(dbPath, {
          type: 'complete',
          taskId: claim.taskId,
          author: `finisher-${index}`,
        })
      );
      const releaseOps = claimed.slice(3, 5).map((claim, index) =>
        runWorker(dbPath, {
          type: 'release',
          taskId: claim.taskId,
          author: `releaser-${index}`,
        })
      );
      const followUpClaims = Array.from({ length: 2 }, (_, i) =>
        runWorker(dbPath, {
          type: 'claim-next',
          project: 'stress-test',
          author: `agent-${i + 10}`,
        })
      );

      const wave2Results = await Promise.all([...completeOps, ...releaseOps, ...followUpClaims]);
      const errors = wave2Results.filter(
        (result) => !result.success && result.operation !== 'claim-next'
      );
      expect(errors).toHaveLength(0);

      const taskCounts = db
        .prepare(
          `SELECT status, COUNT(*) as count FROM tasks_current
           WHERE project = 'stress-test' GROUP BY status`
        )
        .all() as { status: string; count: number }[];

      const totalTasks = taskCounts.reduce((sum, row) => sum + row.count, 0);
      expect(totalTasks).toBe(12);
    });
  });

  describe('invariant preservation under concurrency', () => {
    it('never allows double-claiming the same task via direct claim', async () => {
      const task = taskService.createTask({ title: 'Single task', project: 'stress-test' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      const claimPromises: Promise<{ success: boolean }>[] = [];
      for (let i = 0; i < 20; i++) {
        claimPromises.push(
          Promise.resolve().then(() => {
            try {
              taskService.claimTask(task.task_id, { author: `agent-${i}` });
              return { success: true };
            } catch {
              return { success: false };
            }
          })
        );
      }

      const results = await Promise.all(claimPromises);
      const successCount = results.filter((result) => result.success).length;
      expect(successCount).toBe(1);

      const taskRow = db
        .prepare('SELECT status, agent FROM tasks_current WHERE task_id = ?')
        .get(task.task_id) as { status: string; agent: string | null };
      expect(taskRow.status).toBe('in_progress');
      expect(taskRow.agent).toBeDefined();
    });

    it('maintains consistent event count under concurrent writes', async () => {
      const taskIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const task = taskService.createTask({ title: `Task ${i}`, project: 'stress-test' });
        taskService.setStatus(task.task_id, TaskStatus.Ready);
        taskIds.push(task.task_id);
      }

      const initialEventCount = db
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };

      const claimPromises = taskIds.map((_, i) =>
        Promise.resolve().then(() => {
          const result = taskService.claimNext({ author: `agent-${i}`, project: 'stress-test' });
          return { success: !!result };
        })
      );
      await Promise.all(claimPromises);

      const finalEventCount = db
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };
      expect(finalEventCount.count).toBeGreaterThan(initialEventCount.count);

      const statusChangedEvents = db
        .prepare("SELECT COUNT(*) as count FROM events WHERE type = 'status_changed'")
        .get() as { count: number };
      expect(statusChangedEvents.count).toBe(20);
    });
  });

  describe('transaction atomicity', () => {
    it('rolls back on error during event write', () => {
      const task = taskService.createTask({ title: 'Test', project: 'stress-test' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      const eventCountBefore = db
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };

      try {
        taskService.claimTask(task.task_id, { author: 'test' });
        taskService.claimTask(task.task_id, { author: 'another' });
      } catch {
        // Expected
      }

      const eventCountAfter = db
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };
      expect(eventCountAfter.count).toBe(eventCountBefore.count + 1);

      const taskRow = db
        .prepare('SELECT status FROM tasks_current WHERE task_id = ?')
        .get(task.task_id) as { status: string };
      expect(taskRow.status).toBe('in_progress');
    });
  });
});
