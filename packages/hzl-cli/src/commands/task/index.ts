import { Command } from 'commander';

export function createTaskCommand(): Command {
  return new Command('task').description('Task management commands');
}
