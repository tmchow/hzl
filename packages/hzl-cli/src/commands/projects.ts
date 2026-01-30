// packages/hzl-cli/src/commands/projects.ts
import { Command } from 'commander';
import { resolveDbPath } from '../config.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { createFormatter } from '../output.js';
import type { GlobalOptions } from '../types.js';

export interface ProjectInfo {
  name: string;
  task_count: number;
  statuses: Record<string, number>;
}

export interface ProjectsResult {
  projects: ProjectInfo[];
}

export function runProjects(options: { services: Services; json: boolean }): ProjectsResult {
  const { services, json } = options;
  const db = services.db;
  
  // Query for projects with task counts, excluding archived
  const rows = db.prepare(`
    SELECT 
      project as name,
      COUNT(*) as task_count,
      SUM(CASE WHEN status = 'backlog' THEN 1 ELSE 0 END) as backlog_count,
      SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready_count,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done_count
    FROM tasks_current 
    WHERE status != 'archived'
    GROUP BY project
    ORDER BY project
  `).all() as any[];

  const projects: ProjectInfo[] = rows.map(row => ({
    name: row.name,
    task_count: row.task_count,
    statuses: {
      backlog: row.backlog_count,
      ready: row.ready_count,
      in_progress: row.in_progress_count,
      done: row.done_count,
    },
  }));

  const result: ProjectsResult = { projects };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    if (projects.length === 0) {
      console.log('No projects found');
    } else {
      console.log('Projects:');
      for (const p of projects) {
        console.log(`  ${p.name}: ${p.task_count} tasks`);
      }
    }
  }

  return result;
}

export function createProjectsCommand(): Command {
  return new Command('projects')
    .description('List all projects with task counts')
    .action(function (this: Command) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        runProjects({ services, json: globalOpts.json ?? false });
      } finally {
        closeDb(services);
      }
    });
}
