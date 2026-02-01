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
import { createSyncCommand } from './commands/sync.js';
import { createStatusCommand } from './commands/status.js';
import { createSampleProjectCommand } from './commands/sample-project.js';
import { CLIError, ExitCode } from './errors.js';
import { resolveDbPath, readConfig } from './config.js';
import { formatOutput, printSuccess, printError, printTable } from './output.js';

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
  program.addCommand(createSyncCommand());
  program.addCommand(createStatusCommand());

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}

export {
  CLIError,
  ExitCode,
  resolveDbPath,
  readConfig,
  formatOutput,
  printSuccess,
  printError,
  printTable,
};
