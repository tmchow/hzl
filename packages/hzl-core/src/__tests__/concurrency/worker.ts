// packages/hzl-core/src/__tests__/concurrency/worker.ts
// Worker script for concurrency stress tests
import { parentPort, workerData } from 'worker_threads';
import Database from 'better-sqlite3';
import { runMigrations } from '../../db/migrations.js';
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

const { dbPath, command } = workerData as { dbPath: string; command: WorkerCommand };

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

async function run(): Promise<WorkerResult> {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  
  const { taskService } = setupServices(db);

  try {
    switch (command.type) {
      case 'claim-next': {
        const leaseUntil = command.leaseMinutes
          ? new Date(Date.now() + command.leaseMinutes * 60000).toISOString()
          : undefined;
        const task = taskService.claimNext({
          project: command.project,
          author: command.author,
          lease_until: leaseUntil,
        });
        db.close();
        return { success: !!task, taskId: task?.task_id, operation: 'claim-next' };
      }
      
      case 'claim-specific': {
        const leaseUntil = command.leaseMinutes
          ? new Date(Date.now() + command.leaseMinutes * 60000).toISOString()
          : undefined;
        const task = taskService.claimTask(command.taskId!, {
          author: command.author,
          lease_until: leaseUntil,
        });
        db.close();
        return { success: true, taskId: task.task_id, operation: 'claim-specific' };
      }
      
      case 'steal': {
        const result = taskService.stealTask(command.taskId!, {
          ifExpired: command.ifExpired,
          force: command.force,
          author: command.author,
        });
        db.close();
        return { success: result.success, taskId: command.taskId, operation: 'steal', error: result.error };
      }
      
      case 'complete': {
        const task = taskService.completeTask(command.taskId!, { author: command.author });
        db.close();
        return { success: true, taskId: task.task_id, operation: 'complete' };
      }
      
      case 'release': {
        const task = taskService.releaseTask(command.taskId!, { author: command.author });
        db.close();
        return { success: true, taskId: task.task_id, operation: 'release' };
      }
      
      default:
        db.close();
        return { success: false, error: 'Unknown command', operation: command.type };
    }
  } catch (err: any) {
    db.close();
    return { success: false, error: err.message, operation: command.type };
  }
}

run().then((result) => parentPort?.postMessage(result));
