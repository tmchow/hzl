import type Database from 'libsql';
import type { TaskService } from './task-service.js';

const DEFAULT_STALE_THRESHOLD_MINUTES = 10;
const DEFAULT_WINDOW_MINUTES = 24 * 60;
const TASK_CHUNK_SIZE = 500;

type TaskMetadataRow = {
  task_id: string;
  project: string;
  agent: string | null;
};

type StatusCountRow = {
  status: keyof QueueStats;
  count: number;
};

type CompletionRow = {
  task_id: string;
  done_at: string;
  started_at: string | null;
};

export interface StatsQueryOptions {
  project?: string;
  windowMinutes?: number;
  windowLabel?: string;
  asOf?: string;
}

export interface QueueStats {
  backlog: number;
  ready: number;
  in_progress: number;
  blocked: number;
  done: number;
  archived: number;
  available: number;
  stale: number;
  expired_leases: number;
}

export interface CompletionStats {
  total: number;
  by_agent: Record<string, number>;
}

export interface ExecutionTimeStats {
  count: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  excluded_without_start: number;
}

export interface StatsSnapshot {
  window: string;
  generated_at: string;
  projects: string[];
  queue: QueueStats;
  completions: CompletionStats;
  execution_time_ms: ExecutionTimeStats;
}

export class StatsService {
  constructor(
    private cacheDb: Database.Database,
    private eventsDb: Database.Database,
    private taskService: Pick<TaskService, 'getAvailableTasks' | 'getStaleTasks'>
  ) {}

  getStats(options: StatsQueryOptions = {}): StatsSnapshot {
    const generatedAt = options.asOf ?? new Date().toISOString();
    const windowMinutes = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
    const windowLabel = options.windowLabel ?? (windowMinutes === 24 * 60 ? '24h' : `${windowMinutes}m`);
    const windowStart = new Date(
      new Date(generatedAt).getTime() - windowMinutes * 60_000
    ).toISOString();

    const trackedTasks = this.getTrackedTasks(options.project);
    const historical = this.getHistoricalStats({
      trackedTasks,
      windowStart,
      windowEnd: generatedAt,
    });

    return {
      window: windowLabel,
      generated_at: generatedAt,
      projects: this.getProjects(),
      queue: this.getQueueStats({ project: options.project, asOf: generatedAt }),
      completions: historical.completions,
      execution_time_ms: historical.execution_time_ms,
    };
  }

  private getProjects(): string[] {
    const rows = this.cacheDb
      .prepare('SELECT name FROM projects ORDER BY name')
      .all() as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }

  private getTrackedTasks(project?: string): Map<string, TaskMetadataRow> {
    const rows = (project
      ? this.cacheDb
          .prepare('SELECT task_id, project, agent FROM tasks_current WHERE project = ?')
          .all(project)
      : this.cacheDb.prepare('SELECT task_id, project, agent FROM tasks_current').all()) as TaskMetadataRow[];

    return new Map(rows.map((row) => [row.task_id, row]));
  }

  private getQueueStats(options: { project?: string; asOf: string }): QueueStats {
    const params: string[] = [];
    const projectWhere = options.project ? 'WHERE project = ?' : '';
    if (options.project) {
      params.push(options.project);
    }

    const rows = this.cacheDb.prepare(`
      SELECT status, COUNT(*) as count
      FROM tasks_current
      ${projectWhere}
      GROUP BY status
    `).all(...params) as StatusCountRow[];

    const queue: QueueStats = {
      backlog: 0,
      ready: 0,
      in_progress: 0,
      blocked: 0,
      done: 0,
      archived: 0,
      available: this.taskService.getAvailableTasks({ project: options.project }).length,
      stale: this.taskService.getStaleTasks({
        project: options.project,
        thresholdMinutes: DEFAULT_STALE_THRESHOLD_MINUTES,
      }).size,
      expired_leases: this.getExpiredLeaseCount(options),
    };

    for (const row of rows) {
      queue[row.status] = row.count;
    }

    return queue;
  }

  private getExpiredLeaseCount(options: { project?: string; asOf: string }): number {
    const params = [options.asOf];
    let projectClause = '';
    if (options.project) {
      projectClause = 'AND project = ?';
      params.push(options.project);
    }

    const row = this.cacheDb.prepare(`
      SELECT COUNT(*) as count
      FROM tasks_current
      WHERE status = 'in_progress'
        AND lease_until IS NOT NULL
        AND lease_until < ?
        ${projectClause}
    `).get(...params) as { count: number };

    return row.count;
  }

  private getHistoricalStats(options: {
    trackedTasks: Map<string, TaskMetadataRow>;
    windowStart: string;
    windowEnd: string;
  }): {
    completions: CompletionStats;
    execution_time_ms: ExecutionTimeStats;
  } {
    const completions: CompletionStats = {
      total: 0,
      by_agent: {},
    };

    const durations: number[] = [];
    let excludedWithoutStart = 0;

    if (options.trackedTasks.size === 0) {
      return {
        completions,
        execution_time_ms: {
          count: 0,
          mean: null,
          min: null,
          max: null,
          excluded_without_start: 0,
        },
      };
    }

    const taskIds = [...options.trackedTasks.keys()];
    for (let index = 0; index < taskIds.length; index += TASK_CHUNK_SIZE) {
      const chunk = taskIds.slice(index, index + TASK_CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = this.eventsDb.prepare(`
        SELECT
          e.task_id,
          e.timestamp AS done_at,
          (
            SELECT start.timestamp
            FROM events start
            WHERE start.task_id = e.task_id
              AND start.type = 'status_changed'
              AND json_extract(start.data, '$.to') = 'in_progress'
              AND start.id < e.id
            ORDER BY start.id DESC
            LIMIT 1
          ) AS started_at
        FROM events e
        WHERE e.type = 'status_changed'
          AND json_extract(e.data, '$.to') = 'done'
          AND e.timestamp >= ?
          AND e.timestamp <= ?
          AND e.task_id IN (${placeholders})
        ORDER BY e.id ASC
      `).all(options.windowStart, options.windowEnd, ...chunk) as CompletionRow[];

      for (const row of rows) {
        const task = options.trackedTasks.get(row.task_id);
        if (!task) {
          continue;
        }

        completions.total += 1;
        if (task.agent) {
          completions.by_agent[task.agent] = (completions.by_agent[task.agent] ?? 0) + 1;
        }

        if (!row.started_at) {
          excludedWithoutStart += 1;
          continue;
        }

        const duration = new Date(row.done_at).getTime() - new Date(row.started_at).getTime();
        if (Number.isFinite(duration) && duration >= 0) {
          durations.push(duration);
        } else {
          excludedWithoutStart += 1;
        }
      }
    }

    const executionTimeMs: ExecutionTimeStats =
      durations.length === 0
        ? {
            count: 0,
            mean: null,
            min: null,
            max: null,
            excluded_without_start: excludedWithoutStart,
          }
        : {
            count: durations.length,
            mean: durations.reduce((sum, duration) => sum + duration, 0) / durations.length,
            min: Math.min(...durations),
            max: Math.max(...durations),
            excluded_without_start: excludedWithoutStart,
          };

    return {
      completions,
      execution_time_ms: executionTimeMs,
    };
  }
}
