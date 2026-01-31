import { Command } from 'commander';
import { resolveDbPath } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface ProjectCreateResult {
  name: string;
  description: string | null;
  is_protected: boolean;
  created_at: string;
}

export interface ProjectCreateOptions {
  services: Services;
  name: string;
  description?: string;
  json: boolean;
}

interface ProjectCreateCommandOptions {
  description?: string;
}

export function runProjectCreate(
  options: ProjectCreateOptions
): ProjectCreateResult {
  const { services, name, description, json } = options;

  const project = services.projectService.createProject(name, {
    description,
  });

  const result: ProjectCreateResult = {
    name: project.name,
    description: project.description,
    is_protected: project.is_protected,
    created_at: project.created_at,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Created project ${project.name}`);
  }

  return result;
}

export function createProjectCreateCommand(): Command {
  return new Command('create')
    .description('Create a new project')
    .argument('<name>', 'Project name')
    .option('-d, --description <desc>', 'Project description')
    .action(function (this: Command, name: string, opts: ProjectCreateCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        runProjectCreate({
          services,
          name,
          description: opts.description,
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
