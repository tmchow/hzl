import { Command } from 'commander';
import { createAgentStatusCommand } from './status.js';
import { createAgentLogCommand } from './log.js';

export function createAgentCommand(): Command {
  const command = new Command('agent').description('Agent-oriented query commands');
  command.addCommand(createAgentStatusCommand());
  command.addCommand(createAgentLogCommand());
  return command;
}
