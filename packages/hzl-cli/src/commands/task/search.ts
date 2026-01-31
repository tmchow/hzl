// packages/hzl-cli/src/commands/search.ts
import { Command } from 'commander';
import { resolveDbPath } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import type { GlobalOptions } from '../../types.js';
import type { SearchTaskResult } from 'hzl-core/services/search-service.js';

export interface SearchTask {
  task_id: string;
  title: string;
  project: string;
  status: string;
}

export interface SearchResult {
  tasks: SearchTask[];
  total: number;
}

export function runSearch(options: {
  services: Services;
  query: string;
  project?: string;
  status?: string;
  limit?: number;
  offset?: number;
  json: boolean;
}): SearchResult {
  const { services, query, project, status, limit = 20, offset = 0, json } = options;
  
  // Use search service if available
  let tasks: SearchTask[];
  
  if (services.searchService) {
    const searchResult = services.searchService.search(query, { project, limit, offset });
    tasks = searchResult.tasks.map((r: SearchTaskResult) => ({
      task_id: r.task_id,
      title: r.title,
      project: r.project,
      status: r.status,
    }));
  } else {
    // Fallback: basic LIKE search on title, project, description
    const searchPattern = `%${query}%`;
    let sql = `
      SELECT task_id, title, project, status 
      FROM tasks_current 
      WHERE (title LIKE ? OR project LIKE ? OR description LIKE ?)
    `;
    const params: any[] = [searchPattern, searchPattern, searchPattern];
    
    if (project) {
      sql += ' AND project = ?';
      params.push(project);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    tasks = services.db.prepare(sql).all(...params) as SearchTask[];
  }

  const result: SearchResult = {
    tasks,
    total: tasks.length,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    if (tasks.length === 0) {
      console.log(`No tasks matching "${query}"`);
    } else {
      console.log(`Found ${tasks.length} task(s):`);
      for (const task of tasks) {
        console.log(`  [${task.task_id.slice(0, 8)}] ${task.title} (${task.project})`);
      }
    }
  }

  return result;
}

export function createSearchCommand(): Command {
  return new Command('search')
    .description('Search for tasks')
    .argument('<query>', 'Search query')
    .option('-p, --project <project>', 'Filter by project')
    .option('-s, --status <status>', 'Filter by status')
    .option('-l, --limit <n>', 'Max results', '20')
    .action(function (this: Command, query: string, opts: any) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        runSearch({
          services,
          query,
          project: opts.project,
          status: opts.status,
          limit: parseInt(opts.limit, 10),
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
