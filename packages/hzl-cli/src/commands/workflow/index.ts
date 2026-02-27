import { Command } from 'commander';
import { createWorkflowListCommand } from './list.js';
import { createWorkflowShowCommand } from './show.js';
import { createWorkflowRunCommand } from './run.js';

export function createWorkflowCommand(): Command {
  const command = new Command('workflow').description('Workflow discovery and execution commands');

  command.addCommand(createWorkflowListCommand());
  command.addCommand(createWorkflowShowCommand());
  command.addCommand(createWorkflowRunCommand());

  return command;
}
