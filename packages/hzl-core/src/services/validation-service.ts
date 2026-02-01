// packages/hzl-core/src/services/validation-service.ts
import type Database from 'libsql';

export interface CycleNode { taskId: string; dependsOnId: string; }
export interface MissingDep { taskId: string; missingDepId: string; }
export interface ValidationIssue { type: string; severity: string; message: string; details?: unknown; }
export interface ValidationResult { isValid: boolean; issues: ValidationIssue[]; cycles: CycleNode[][]; missingDeps: MissingDep[]; }

export class ValidationService {
  constructor(private db: Database.Database) {}

  detectCycles(): CycleNode[][] {
    const cycles: CycleNode[][] = [];
    const tasks = this.db.prepare('SELECT task_id FROM tasks_current').all() as { task_id: string }[];
    const taskIds = new Set(tasks.map(t => t.task_id));
    const deps = this.db.prepare('SELECT task_id, depends_on_id FROM task_dependencies').all() as { task_id: string; depends_on_id: string }[];

    const graph = new Map<string, string[]>();
    for (const taskId of taskIds) graph.set(taskId, []);
    for (const dep of deps) {
      if (taskIds.has(dep.task_id)) {
        graph.get(dep.task_id)!.push(dep.depends_on_id);
      }
    }

    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const taskId of taskIds) color.set(taskId, WHITE);

    const dfs = (u: string, path: string[]): void => {
      color.set(u, GRAY);
      for (const v of graph.get(u) || []) {
        if (u === v) { cycles.push([{ taskId: u, dependsOnId: v }]); continue; }
        if (!color.has(v)) continue;
        if (color.get(v) === GRAY) {
          const cycleStartIdx = path.indexOf(v);
          if (cycleStartIdx !== -1) {
            const cyclePath: CycleNode[] = [];
            for (let i = cycleStartIdx; i < path.length; i++) {
              cyclePath.push({ taskId: path[i], dependsOnId: i + 1 < path.length ? path[i + 1] : v });
            }
            cycles.push(cyclePath);
          }
        } else if (color.get(v) === WHITE) {
          dfs(v, [...path, v]);
        }
      }
      color.set(u, BLACK);
    };

    for (const taskId of taskIds) if (color.get(taskId) === WHITE) dfs(taskId, [taskId]);
    return cycles;
  }

  findMissingDeps(): MissingDep[] {
    const rows = this.db.prepare(`
      SELECT d.task_id, d.depends_on_id FROM task_dependencies d
      LEFT JOIN tasks_current t ON d.depends_on_id = t.task_id
      WHERE t.task_id IS NULL
    `).all() as { task_id: string; depends_on_id: string }[];
    return rows.map(r => ({ taskId: r.task_id, missingDepId: r.depends_on_id }));
  }

  validate(): ValidationResult {
    const issues: ValidationIssue[] = [];
    const cycles = this.detectCycles();
    const missingDeps = this.findMissingDeps();

    for (const cycle of cycles) {
      issues.push({ type: 'cycle', severity: 'error', message: `Dependency cycle detected`, details: cycle });
    }
    for (const missing of missingDeps) {
      issues.push({ type: 'missing_dep', severity: 'error', message: `Task ${missing.taskId} depends on non-existent task ${missing.missingDepId}`, details: missing });
    }

    return { isValid: issues.length === 0, issues, cycles, missingDeps };
  }
}
