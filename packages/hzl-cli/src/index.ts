import { Command } from 'commander';
import { createInitCommand } from './commands/init.js';
import { createWhichDbCommand } from './commands/which-db.js';
import { createConfigCommand } from './commands/config.js';
// project commands live under ./commands/project
import { createProjectCommand } from './commands/project/index.js';
import { createTaskCommand } from './commands/task/index.js';
import { createValidateCommand } from './commands/validate.js';
import { createStatsCommand } from './commands/stats.js';
import { createExportEventsCommand } from './commands/export-events.js';
import { createSampleProjectCommand } from './commands/sample-project.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('hzl')
    .description('HZL - Lightweight task tracking for AI agents and swarms')
    .version('0.1.0')
    .option('--db <path>', 'Path to database file')
    .option('--json', 'Output in JSON format', false);

  program.addCommand(createInitCommand());
  program.addCommand(createWhichDbCommand());
  program.addCommand(createConfigCommand());
  program.addCommand(createProjectCommand());
  program.addCommand(createTaskCommand());
  program.addCommand(createValidateCommand());
  program.addCommand(createStatsCommand());
  program.addCommand(createExportEventsCommand());
  program.addCommand(createSampleProjectCommand());

  return program;
}
