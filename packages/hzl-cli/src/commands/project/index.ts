import { Command } from 'commander';
import { createProjectCreateCommand } from './create.js';
import { createProjectDeleteCommand } from './delete.js';
import { createProjectListCommand } from './list.js';
import { createProjectRenameCommand } from './rename.js';
import { createProjectShowCommand } from './show.js';

export function createProjectCommand(): Command {
  const command = new Command('project').description('Project management commands');

  command.addCommand(createProjectCreateCommand());
  command.addCommand(createProjectDeleteCommand());
  command.addCommand(createProjectListCommand());
  command.addCommand(createProjectRenameCommand());
  command.addCommand(createProjectShowCommand());

  return command;
}
