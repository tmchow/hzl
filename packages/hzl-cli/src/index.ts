import { Command } from 'commander';
import { createRequire } from 'node:module';
import { createInitCommand } from './commands/init.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };
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
import { createDoctorCommand } from './commands/doctor.js';
import { createLockCommand } from './commands/lock.js';
import { createSampleProjectCommand } from './commands/sample-project.js';
import { createServeCommand } from './commands/serve.js';
import { createGuideCommand } from './commands/guide.js';
import { CLIError, ExitCode } from './errors.js';
import { resolveDbPaths, readConfig } from './config.js';
import { formatOutput, printSuccess, printError, printTable } from './output.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('hzl')
    .description('External task ledger for coding agents and OpenClaw.')
    .version(pkg.version)
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
  program.addCommand(createDoctorCommand());
  program.addCommand(createLockCommand());
  program.addCommand(createServeCommand());
  program.addCommand(createGuideCommand());

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}

export {
  CLIError,
  ExitCode,
  resolveDbPaths,
  readConfig,
  formatOutput,
  printSuccess,
  printError,
  printTable,
};
