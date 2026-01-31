import { Command } from 'commander';
import { resolveDbPath } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface ProjectRenameResult {
  old_name: string;
  new_name: string;
}

export interface ProjectRenameOptions {
  services: Services;
  oldName: string;
  newName: string;
  json: boolean;
}

export function runProjectRename(
  options: ProjectRenameOptions
): ProjectRenameResult {
  const { services, oldName, newName, json } = options;

  services.projectService.renameProject(oldName, newName);

  const result: ProjectRenameResult = {
    old_name: oldName,
    new_name: newName,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Renamed project '${oldName}' to '${newName}'`);
  }

  return result;
}

export function createProjectRenameCommand(): Command {
  return new Command('rename')
    .description('Rename a project')
    .argument('<oldName>', 'Current project name')
    .argument('<newName>', 'New project name')
    .action(function (this: Command, oldName: string, newName: string) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        runProjectRename({
          services,
          oldName,
          newName,
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
