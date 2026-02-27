import { Command } from 'commander';
import { createAgentStatsCommand } from './stats.js';

export function createAgentCommand(): Command {
  const command = new Command('agent').description('Agent-oriented query commands');
  command.addCommand(createAgentStatsCommand());
  return command;
}

