import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { CLIError, ExitCode, handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface ProjectShowResult {
  project: {
    name: string;
    description: string | null;
    created_at: string;
    is_protected: boolean;
  };
  statuses: {
    backlog: number;
    ready: number;
    in_progress: number;
    done: number;
    archived: number;
  };
}

export interface ProjectShowOptions {
  services: Services;
  name: string;
  json: boolean;
}

export function runProjectShow(options: ProjectShowOptions): ProjectShowResult {
  const { services, name, json } = options;

  const project = services.projectService.getProject(name);
  if (!project) {
    throw new CLIError(`Project not found: ${name}`, ExitCode.NotFound);
  }

  const row = services.cacheDb
    .prepare(
      `
      SELECT
        SUM(CASE WHEN status = 'backlog' THEN 1 ELSE 0 END) as backlog,
        SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived
      FROM tasks_current
      WHERE project = ?
    `
    )
    .get(name) as {
    backlog: number | null;
    ready: number | null;
    in_progress: number | null;
    done: number | null;
    archived: number | null;
  };

  const statuses = {
    backlog: row?.backlog ?? 0,
    ready: row?.ready ?? 0,
    in_progress: row?.in_progress ?? 0,
    done: row?.done ?? 0,
    archived: row?.archived ?? 0,
  };

  const result: ProjectShowResult = {
    project: {
      name: project.name,
      description: project.description,
      created_at: project.created_at,
      is_protected: project.is_protected,
    },
    statuses,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`${project.name}`);
    if (project.description) {
      console.log(`Description: ${project.description}`);
    }
    console.log(`Created: ${project.created_at}`);
    console.log(`Protected: ${project.is_protected ? 'yes' : 'no'}`);
    console.log('Status breakdown:');
    console.log(`  backlog: ${statuses.backlog}`);
    console.log(`  ready: ${statuses.ready}`);
    console.log(`  in_progress: ${statuses.in_progress}`);
    console.log(`  done: ${statuses.done}`);
    console.log(`  archived: ${statuses.archived}`);
  }

  return result;
}

export function createProjectShowCommand(): Command {
  return new Command('show')
    .description('Show project details')
    .argument('<name>', 'Project name')
    .action(function (this: Command, name: string) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runProjectShow({ services, name, json: globalOpts.json ?? false });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
