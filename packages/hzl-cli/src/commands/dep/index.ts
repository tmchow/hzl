import { Command } from 'commander';
import { createDepListCommand } from './list.js';

export function createDepCommand(): Command {
  const command = new Command('dep').description('Dependency commands');
  command.addCommand(createDepListCommand());
  return command;
}
