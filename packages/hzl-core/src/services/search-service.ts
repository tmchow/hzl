// packages/hzl-core/src/services/search-service.ts
import type Database from 'libsql';

export interface SearchTaskResult { task_id: string; title: string; project: string; status: string; description: string | null; priority: number; rank: number; }
export interface SearchResult { tasks: SearchTaskResult[]; total: number; limit: number; offset: number; }
export interface SearchOptions { project?: string; limit?: number; offset?: number; }

export class SearchService {
  constructor(private db: Database.Database) {}

  search(query: string, opts?: SearchOptions): SearchResult {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const trimmedQuery = query.trim();

    if (!trimmedQuery) return { tasks: [], total: 0, limit, offset };

    const safeQuery = trimmedQuery.split(/\s+/).filter(w => w.length > 0).map(w => w.replace(/[^a-zA-Z0-9]/g, '')).filter(w => w.length > 0).join(' ');
    if (!safeQuery) return { tasks: [], total: 0, limit, offset };

    let countQuery: string, searchQuery: string;
    const params: Array<string | number> = [];

    if (opts?.project) {
      countQuery = `SELECT COUNT(*) as total FROM task_search s JOIN tasks_current t ON s.task_id = t.task_id WHERE task_search MATCH ? AND t.project = ?`;
      searchQuery = `SELECT t.task_id, t.title, t.project, t.status, t.description, t.priority, rank FROM task_search s JOIN tasks_current t ON s.task_id = t.task_id WHERE task_search MATCH ? AND t.project = ? ORDER BY rank LIMIT ? OFFSET ?`;
      params.push(safeQuery, opts.project, limit, offset);
    } else {
      countQuery = `SELECT COUNT(*) as total FROM task_search s JOIN tasks_current t ON s.task_id = t.task_id WHERE task_search MATCH ?`;
      searchQuery = `SELECT t.task_id, t.title, t.project, t.status, t.description, t.priority, rank FROM task_search s JOIN tasks_current t ON s.task_id = t.task_id WHERE task_search MATCH ? ORDER BY rank LIMIT ? OFFSET ?`;
      params.push(safeQuery, limit, offset);
    }

    const countParams: Array<string | number> = opts?.project
      ? [safeQuery, opts.project]
      : [safeQuery];
    const total = (this.db.prepare(countQuery).get(...countParams) as { total: number }).total;
    const rows = this.db.prepare(searchQuery).all(...params) as SearchTaskResult[];

    return { tasks: rows, total, limit, offset };
  }
}
