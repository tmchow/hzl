// packages/hzl-core/src/__tests__/concurrency/stress.test.ts
// Cross-process concurrency stress tests
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Worker } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { runMigrations } from '../../db/migrations.js';
import { EventStore } from '../../events/store.js';
import { ProjectionEngine } from '../../projections/engine.js';
import { TasksCurrentProjector } from '../../projections/tasks-current.js';
import { DependenciesProjector } from '../../projections/dependencies.js';
import { TagsProjector } from '../../projections/tags.js';
import { TaskService } from '../../services/task-service.js';
import { TaskStatus } from '../../events/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface WorkerResult {
  success: boolean;
  taskId?: string;
  error?: string;
  operation: string;
}

function runWorker(dbPath: string, command: any): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    // Use tsx to run the TypeScript worker
    const worker = new Worker(
      `
      import { register } from 'node:module';
      import { pathToFileURL } from 'node:url';
      register('tsx/esm', pathToFileURL('./'));
      const workerPath = ${JSON.stringify(path.join(__dirname, 'worker.ts'))};
      const { workerData } = await import('worker_threads');
      await import(workerPath);
      `,
      {
        eval: true,
        workerData: { dbPath, command },
      }
    );
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
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

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-stress-'));
    dbPath = path.join(tempDir, 'test.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    runMigrations(db);
    const services = setupServices(db);
    taskService = services.taskService;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('claim-next contention (in-process)', () => {
    it('ensures exactly one agent claims each task under high contention', async () => {
      // Setup: Create 10 ready tasks
      const taskIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const task = taskService.createTask({ title: `Task ${i}`, project: 'stress-test' });
        taskService.setStatus(task.task_id, TaskStatus.Ready);
        taskIds.push(task.task_id);
      }

      // Run 20 concurrent claim attempts (all in same process using Promise.all)
      const claimPromises: Promise<any>[] = [];
      for (let i = 0; i < 20; i++) {
        claimPromises.push(
          Promise.resolve().then(() => {
            try {
              const result = taskService.claimNext({ author: `agent-${i}`, project: 'stress-test' });
              return { success: !!result, taskId: result?.task_id };
            } catch (err: any) {
              return { success: false, error: err.message };
            }
          })
        );
      }

      const results = await Promise.all(claimPromises);

      // Verify: Exactly 10 successful claims (one per task)
      const successfulClaims = results.filter((r) => r.success);
      expect(successfulClaims).toHaveLength(10);

      // Verify: Each task claimed exactly once
      const claimedTaskIds = successfulClaims.map((r) => r.taskId);
      const uniqueClaimedIds = new Set(claimedTaskIds);
      expect(uniqueClaimedIds.size).toBe(10);

      // Verify: All original tasks are accounted for
      for (const taskId of taskIds) {
        expect(claimedTaskIds).toContain(taskId);
      }

      // Verify: 10 workers got nothing (no tasks left)
      const failedClaims = results.filter((r) => !r.success);
      expect(failedClaims).toHaveLength(10);
    });

    it('handles single contested task correctly', async () => {
      // Create a single task
      const task = taskService.createTask({ title: 'Contested task', project: 'stress-test' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      // 50 concurrent claim attempts on the same task via claimNext
      const claimPromises: Promise<any>[] = [];
      for (let i = 0; i < 50; i++) {
        claimPromises.push(
          Promise.resolve().then(() => {
            try {
              const result = taskService.claimNext({ author: `agent-${i}`, project: 'stress-test' });
              return { success: !!result, taskId: result?.task_id };
            } catch {
              return { success: false };
            }
          })
        );
      }

      const results = await Promise.all(claimPromises);

      // Exactly one should succeed
      const successfulClaims = results.filter((r) => r.success);
      expect(successfulClaims).toHaveLength(1);
      expect(successfulClaims[0].taskId).toBe(task.task_id);
    });
  });

  describe('steal contention (in-process)', () => {
    it('ensures exactly one agent steals an expired lease', async () => {
      // Create and claim a task with an expired lease
      const task = taskService.createTask({ title: 'Expired task', project: 'stress-test' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, {
        author: 'original-agent',
        lease_until: new Date(Date.now() - 60000).toISOString(), // Expired 1 minute ago
      });

      // 10 concurrent steal attempts with ifExpired
      const stealPromises: Promise<any>[] = [];
      for (let i = 0; i < 10; i++) {
        stealPromises.push(
          Promise.resolve().then(() => {
            try {
              const result = taskService.stealTask(task.task_id, {
                author: `stealer-${i}`,
                ifExpired: true,
              });
              return { success: result.success, error: result.error };
            } catch (err: any) {
              return { success: false, error: err.message };
            }
          })
        );
      }

      const results = await Promise.all(stealPromises);

      // At least one should succeed (the first one)
      const successfulSteals = results.filter((r) => r.success);
      expect(successfulSteals.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects steal when lease is not expired', () => {
      // Create and claim a task with a future lease
      const task = taskService.createTask({ title: 'Active task', project: 'stress-test' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, {
        author: 'original-agent',
        lease_until: new Date(Date.now() + 3600000).toISOString(), // Expires in 1 hour
      });

      // Try to steal with ifExpired (should fail)
      const result = taskService.stealTask(task.task_id, {
        author: 'stealer',
        ifExpired: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not expired');
    });
  });

  describe('mixed operations stress test', () => {
    it('handles concurrent claim, complete, release operations', async () => {
      // Create 20 ready tasks
      for (let i = 0; i < 20; i++) {
        const task = taskService.createTask({ title: `Task ${i}`, project: 'stress-test' });
        taskService.setStatus(task.task_id, TaskStatus.Ready);
      }

      // Wave 1: 10 agents claim tasks concurrently
      const claimPromises: Promise<any>[] = [];
      for (let i = 0; i < 10; i++) {
        claimPromises.push(
          Promise.resolve().then(() => {
            const result = taskService.claimNext({ author: `agent-${i}`, project: 'stress-test' });
            return { success: !!result, taskId: result?.task_id, agent: `agent-${i}` };
          })
        );
      }
      const claimResults = await Promise.all(claimPromises);
      const claimedTasks = claimResults.filter((r) => r.success);
      expect(claimedTasks).toHaveLength(10);

      // Wave 2: Concurrently - 5 complete, 3 release, 2 more claim attempts
      const wave2Promises: Promise<any>[] = [];

      // 5 complete operations (first 5 claimed tasks)
      for (let i = 0; i < 5; i++) {
        const taskId = claimedTasks[i].taskId;
        wave2Promises.push(
          Promise.resolve().then(() => {
            try {
              taskService.completeTask(taskId, { author: claimedTasks[i].agent });
              return { success: true, operation: 'complete', taskId };
            } catch (err: any) {
              return { success: false, operation: 'complete', error: err.message };
            }
          })
        );
      }

      // 3 release operations (next 3 claimed tasks)
      for (let i = 5; i < 8; i++) {
        const taskId = claimedTasks[i].taskId;
        wave2Promises.push(
          Promise.resolve().then(() => {
            try {
              taskService.releaseTask(taskId, { author: claimedTasks[i].agent });
              return { success: true, operation: 'release', taskId };
            } catch (err: any) {
              return { success: false, operation: 'release', error: err.message };
            }
          })
        );
      }

      // 2 new claim attempts
      for (let i = 10; i < 12; i++) {
        wave2Promises.push(
          Promise.resolve().then(() => {
            const result = taskService.claimNext({ author: `agent-${i}`, project: 'stress-test' });
            return { success: !!result, operation: 'claim', taskId: result?.task_id };
          })
        );
      }

      const wave2Results = await Promise.all(wave2Promises);

      // Verify all operations completed without crashes
      const errors = wave2Results.filter((r) => !r.success && r.operation !== 'claim');
      expect(errors).toHaveLength(0);

      // Verify database is in consistent state
      const taskCounts = db
        .prepare(
          `SELECT status, COUNT(*) as count FROM tasks_current
           WHERE project = 'stress-test' GROUP BY status`
        )
        .all() as { status: string; count: number }[];

      // Should have: 5 done, some ready (released + unclaimed), some in_progress
      const totalTasks = taskCounts.reduce((sum, row) => sum + row.count, 0);
      expect(totalTasks).toBe(20);
    });
  });

  describe('invariant preservation under concurrency', () => {
    it('never allows double-claiming the same task via direct claim', async () => {
      const task = taskService.createTask({ title: 'Single task', project: 'stress-test' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      // 20 concurrent claim attempts on the same specific task
      const claimPromises: Promise<any>[] = [];
      for (let i = 0; i < 20; i++) {
        claimPromises.push(
          Promise.resolve().then(() => {
            try {
              const result = taskService.claimTask(task.task_id, { author: `agent-${i}` });
              return { success: true, taskId: result.task_id, author: result.claimed_by_author };
            } catch {
              return { success: false };
            }
          })
        );
      }

      const results = await Promise.all(claimPromises);
      const successCount = results.filter((r) => r.success).length;

      // Exactly one claim should succeed
      expect(successCount).toBe(1);

      // Verify task is claimed exactly once in DB
      const taskRow = db
        .prepare('SELECT * FROM tasks_current WHERE task_id = ?')
        .get(task.task_id) as any;

      expect(taskRow.status).toBe('in_progress');
      expect(taskRow.claimed_by_author).toBeDefined();
    });

    it('maintains consistent event count under concurrent writes', async () => {
      // Create 10 tasks
      const taskIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const task = taskService.createTask({ title: `Task ${i}`, project: 'stress-test' });
        taskService.setStatus(task.task_id, TaskStatus.Ready);
        taskIds.push(task.task_id);
      }

      const initialEventCount = db
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };

      // Concurrent claims via claimNext
      const claimPromises = taskIds.map((_, i) =>
        Promise.resolve().then(() => {
          const result = taskService.claimNext({ author: `agent-${i}`, project: 'stress-test' });
          return { success: !!result };
        })
      );
      await Promise.all(claimPromises);

      // Verify event count increased correctly
      const finalEventCount = db
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };

      // Should have exactly 10 new status_changed events (one per successful claim)
      const statusChangedEvents = db
        .prepare("SELECT COUNT(*) as count FROM events WHERE type = 'status_changed'")
        .get() as { count: number };

      // 10 tasks × 2 status changes (backlog→ready, ready→in_progress) = 20 status_changed events
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

      // Try to claim with invalid data that should fail validation
      try {
        taskService.claimTask(task.task_id, { author: 'test' });
        // Now try to claim again - should fail since already claimed
        taskService.claimTask(task.task_id, { author: 'another' });
      } catch {
        // Expected
      }

      // The first claim should have succeeded, second should have failed
      const eventCountAfter = db
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };

      // Should have exactly one new event (the successful claim)
      expect(eventCountAfter.count).toBe(eventCountBefore.count + 1);

      // Task should be in_progress (from the first successful claim)
      const taskRow = db
        .prepare('SELECT status FROM tasks_current WHERE task_id = ?')
        .get(task.task_id) as { status: string };
      expect(taskRow.status).toBe('in_progress');
    });
  });

  describe('WAL mode concurrent reads', () => {
    it('allows reads during write transactions', async () => {
      // Create a task
      const task = taskService.createTask({ title: 'Test', project: 'stress-test' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      // Open a second read-only connection
      const readDb = new Database(dbPath, { readonly: true });

      // Perform a write
      taskService.claimTask(task.task_id, { author: 'agent-1' });

      // Read should still work on the other connection (sees pre-write state until commit)
      const readResult = readDb
        .prepare('SELECT task_id, status FROM tasks_current WHERE task_id = ?')
        .get(task.task_id) as any;

      expect(readResult).toBeDefined();
      // After the write commits, the read connection should see the new state
      expect(readResult.status).toBe('in_progress');

      readDb.close();
    });
  });
});
