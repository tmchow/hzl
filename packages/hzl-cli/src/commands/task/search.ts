// packages/hzl-cli/src/commands/search.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';
import { createShortId } from '../../short-id.js';
import { parseIntegerWithDefault, parseOptionalInteger, parseTaskStatus } from '../../parse.js';
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

interface SearchCommandOptions {
  project?: string;
  status?: string;
  limit?: string;
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
  const { services, query, project, status, json } = options;
  const limit = parseIntegerWithDefault(options.limit, 'Limit', 20, { min: 1 });
  const offset = parseIntegerWithDefault(options.offset, 'Offset', 0, { min: 0 });
  const parsedStatus = parseTaskStatus(status);
  
  // Use search service if available
  let tasks: SearchTask[];
  let total = 0;
  
  if (services.searchService) {
    const searchResult = services.searchService.search(query, {
      project,
      status: parsedStatus,
      limit,
      offset,
    });
    tasks = searchResult.tasks.map((r: SearchTaskResult) => ({
      task_id: r.task_id,
      title: r.title,
      project: r.project,
      status: r.status,
    }));
    total = searchResult.total;
  } else {
    // Fallback: basic LIKE search on title, project, description
    const searchPattern = `%${query}%`;
    let countSql = `
      SELECT COUNT(*) as total
      FROM tasks_current 
      WHERE (title LIKE ? OR project LIKE ? OR description LIKE ?)
    `;
    let sql = `
      SELECT task_id, title, project, status 
      FROM tasks_current 
      WHERE (title LIKE ? OR project LIKE ? OR description LIKE ?)
    `;
    const params: Array<string | number> = [searchPattern, searchPattern, searchPattern];
    
    if (project) {
      countSql += ' AND project = ?';
      sql += ' AND project = ?';
      params.push(project);
    }
    if (status) {
      countSql += ' AND status = ?';
      sql += ' AND status = ?';
      params.push(parsedStatus!);
    }
    sql += ` LIMIT ? OFFSET ?`;
    const totalRow = services.cacheDb.prepare(countSql).get(...params) as { total: number };
    params.push(limit, offset);
    
    tasks = services.cacheDb.prepare(sql).all(...params) as SearchTask[];
    total = totalRow.total;
  }

  const result: SearchResult = {
    tasks,
    total,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    if (tasks.length === 0) {
      console.log(`No tasks matching "${query}"`);
    } else {
      const shortId = createShortId(tasks.map(t => t.task_id));
      console.log(`Found ${tasks.length} task(s):`);
      for (const task of tasks) {
        console.log(`  [${shortId(task.task_id)}] ${task.title} (${task.project})`);
      }
    }
  }

  return result;
}

export function createSearchCommand(): Command {
  return new Command('search')
    .description('Search for tasks')
    .argument('<query>', 'Search query')
    .option('-P, --project <project>', 'Filter by project')
    .option('-s, --status <status>', 'Filter by status')
    .option('-l, --limit <n>', 'Max results', '20')
    .action(function (this: Command, query: string, opts: SearchCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const limit = parseOptionalInteger(opts.limit, 'Limit', { min: 1 });
        runSearch({
          services,
          query,
          project: opts.project,
          status: parseTaskStatus(opts.status),
          limit,
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
