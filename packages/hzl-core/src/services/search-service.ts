// packages/hzl-core/src/services/search-service.ts
import type Database from 'libsql';

export interface SearchTaskResult { task_id: string; title: string; project: string; status: string; description: string | null; priority: number; rank: number; }
export interface SearchResult { tasks: SearchTaskResult[]; total: number; limit: number; offset: number; }
export interface SearchOptions { project?: string; status?: string; limit?: number; offset?: number; }

export class SearchService {
  constructor(private db: Database.Database) {}

  search(query: string, opts?: SearchOptions): SearchResult {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const trimmedQuery = query.trim();

    if (!trimmedQuery) return { tasks: [], total: 0, limit, offset };

    const safeQuery = trimmedQuery.split(/\s+/).filter(w => w.length > 0).map(w => w.replace(/[^a-zA-Z0-9]/g, '')).filter(w => w.length > 0).map(w => `${w}*`).join(' ');
    if (!safeQuery) return { tasks: [], total: 0, limit, offset };

    const where: string[] = ['task_search MATCH ?'];
    const whereParams: Array<string | number> = [safeQuery];

    if (opts?.project) {
      where.push('t.project = ?');
      whereParams.push(opts.project);
    }

    if (opts?.status) {
      where.push('t.status = ?');
      whereParams.push(opts.status);
    }

    const whereClause = where.join(' AND ');
    const countQuery = `SELECT COUNT(*) as total FROM task_search s JOIN tasks_current t ON s.task_id = t.task_id WHERE ${whereClause}`;
    const searchQuery = `SELECT t.task_id, t.title, t.project, t.status, t.description, t.priority, rank FROM task_search s JOIN tasks_current t ON s.task_id = t.task_id WHERE ${whereClause} ORDER BY rank LIMIT ? OFFSET ?`;
    const total = (this.db.prepare(countQuery).get(...whereParams) as { total: number }).total;
    const rows = this.db.prepare(searchQuery).all(...whereParams, limit, offset) as SearchTaskResult[];

    return { tasks: rows, total, limit, offset };
  }
}
