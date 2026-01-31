import { Command } from 'commander';
import { resolveDbPath } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import type { GlobalOptions } from '../../types.js';

export interface ProjectListInfo {
  name: string;
  description: string | null;
  is_protected: boolean;
  task_count: number;
  archived_task_count: number;
  active_task_count: number;
}

export interface ProjectListResult {
  projects: ProjectListInfo[];
}

export function runProjectList(options: {
  services: Services;
  json: boolean;
}): ProjectListResult {
  const { services, json } = options;

  const rows = services.db
    .prepare(
      `
      SELECT
        p.name,
        p.description,
        p.is_protected,
        COUNT(tc.task_id) as task_count,
        SUM(CASE WHEN tc.status = 'archived' THEN 1 ELSE 0 END) as archived_task_count
      FROM projects p
      LEFT JOIN tasks_current tc ON tc.project = p.name
      GROUP BY p.name
      ORDER BY p.name
    `
    )
    .all() as {
    name: string;
    description: string | null;
    is_protected: number;
    task_count: number;
    archived_task_count: number | null;
  }[];

  const projects = rows.map((row) => {
    const archivedCount = row.archived_task_count ?? 0;
    const totalCount = row.task_count ?? 0;
    return {
      name: row.name,
      description: row.description,
      is_protected: row.is_protected === 1,
      task_count: totalCount,
      archived_task_count: archivedCount,
      active_task_count: totalCount - archivedCount,
    };
  });

  const result: ProjectListResult = { projects };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    if (projects.length === 0) {
      console.log('No projects found');
    } else {
      console.log('Projects:');
      for (const project of projects) {
        console.log(
          `  ${project.name}: ${project.active_task_count} active, ${project.archived_task_count} archived`
        );
      }
    }
  }

  return result;
}

export function createProjectListCommand(): Command {
  return new Command('list')
    .description('List projects with task counts')
    .action(function (this: Command) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        runProjectList({ services, json: globalOpts.json ?? false });
      } finally {
        closeDb(services);
      }
    });
}
