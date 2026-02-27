import { Command } from 'commander';
import { createRequire } from 'node:module';
import { createInitCommand } from './commands/init.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };
import { createWhichDbCommand } from './commands/which-db.js';
import { createConfigCommand } from './commands/config.js';
// project commands live under ./commands/project
import { createProjectCommand } from './commands/project/index.js';
import { createAgentCommand } from './commands/agent/index.js';
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
import { createDepCommand } from './commands/dep/index.js';
import { createHookCommand } from './commands/hook.js';
import { createWorkflowCommand } from './commands/workflow/index.js';
import { CLIError, ExitCode } from './errors.js';
import { resolveDbPaths, readConfig } from './config.js';
import { createErrorEnvelope, formatOutput, printSuccess, printError, printTable } from './output.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('hzl')
    .description('External task ledger for coding agents and OpenClaw.')
    .version(pkg.version)
    .option('--db <path>', 'Path to database file')
    .option('--format <format>', 'Output format: json or md', 'json');

  program.addCommand(createInitCommand());
  program.addCommand(createWhichDbCommand());
  program.addCommand(createConfigCommand());
  program.addCommand(createProjectCommand());
  program.addCommand(createAgentCommand());
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
  program.addCommand(createDepCommand());
  program.addCommand(createHookCommand());
  program.addCommand(createWorkflowCommand());

  return program;
}

function optionConsumesValue(token: string): boolean {
  return token === '--db' || token === '--format';
}

function parseRequestedFormat(args: string[]): 'json' | 'md' {
  const formatIndex = args.findIndex((arg) => arg === '--format');
  if (formatIndex !== -1) {
    const candidate = args[formatIndex + 1];
    if (candidate === 'md') return 'md';
    return 'json';
  }

  const inlineFormat = args.find((arg) => arg.startsWith('--format='));
  if (inlineFormat) {
    const [, value] = inlineFormat.split('=', 2);
    return value === 'md' ? 'md' : 'json';
  }

  return 'json';
}

function getPositionalTokens(args: string[]): string[] {
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token.startsWith('-')) {
      if (optionConsumesValue(token) && args[index + 1] && !args[index + 1].startsWith('-')) {
        index += 1;
      }
      continue;
    }
    positionals.push(token);
  }

  return positionals;
}

export type LegacySurface = 'task_next' | 'json_flag' | 'assignee_flag';

export function detectLegacySurface(args: string[]): LegacySurface | null {
  if (args.some((arg) => arg === '--json')) {
    return 'json_flag';
  }

  if (args.some((arg) => arg === '--assignee' || arg.startsWith('--assignee='))) {
    return 'assignee_flag';
  }

  const positionals = getPositionalTokens(args);
  if (positionals[0] === 'task' && positionals[1] === 'next') {
    return 'task_next';
  }

  return null;
}

function renderLegacySurfaceError(
  legacySurface: LegacySurface,
  requestedFormat: 'json' | 'md'
): never {
  const migrationError = (() => {
    switch (legacySurface) {
      case 'task_next':
        return {
          code: 'command_removed',
          message: 'Command `task next` was removed in v2.',
          details: { replacement: 'hzl task claim --next' },
        };
      case 'json_flag':
        return {
          code: 'flag_removed',
          message: 'Flag `--json` was removed in v2.',
          details: { replacement: 'JSON is now default output. Use `--format md` for human-readable output.' },
        };
      case 'assignee_flag':
        return {
          code: 'flag_renamed',
          message: 'Flag `--assignee` was renamed in v2.',
          details: { replacement: 'Use `--agent`.' },
        };
      default:
        return {
          code: 'invalid_usage',
          message: 'Unsupported legacy invocation.',
        };
    }
  })();

  if (requestedFormat === 'json') {
    console.log(
      JSON.stringify(createErrorEnvelope(migrationError.code, migrationError.message, migrationError.details))
    );
  } else {
    console.error(`Error: ${migrationError.message}`);
    if (migrationError.details && typeof migrationError.details === 'object') {
      const replacement = (migrationError.details as { replacement?: string }).replacement;
      if (replacement) console.error(`Hint: ${replacement}`);
    }
  }

  process.exit(ExitCode.InvalidUsage);
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const args = argv.slice(2);
  const requestedFormat = parseRequestedFormat(args);
  const legacySurface = detectLegacySurface(args);
  if (legacySurface) {
    renderLegacySurfaceError(legacySurface, requestedFormat);
  }

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
