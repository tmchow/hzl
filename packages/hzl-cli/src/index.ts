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

interface NormalizationResult {
  args: string[];
  notes: string[];
}

interface OptionMetadata {
  expectsValue: boolean;
}

interface OptionScope {
  byFlag: Map<string, OptionMetadata>;
  longFlags: string[];
}

interface CommandMatch {
  name: string;
  command: Command;
  kind: 'exact' | 'normalized' | 'prefix' | 'typo';
}

interface ParseErrorDetails {
  received: string;
  reason: string;
  preferred_syntax?: string;
  did_you_mean?: string[];
  examples: string[];
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('hzl')
    .description('External task ledger for coding agents and OpenClaw.')
    .version(pkg.version)
    .option('--db <path>', 'Path to database file')
    .option('--format <format>', 'Output format: json or md', 'json');
  program.addHelpText(
    'after',
    `
Agent-friendly input handling:
  HZL accepts minor syntax mistakes when intent is clear (and prints a correction note).
  Preferred syntax is still the canonical one shown in help.

Examples:
  hzl task claim --next --agent codex
  hzl task list --project inbox --status ready
  hzl task update TASK_ID --progress 50
`
  );

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

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }

  return prev[b.length];
}

function pickUniqueBestMatch(
  token: string,
  candidates: string[],
  options: { maxDistance: number; minLength?: number } = { maxDistance: 2 }
): string | null {
  if (token.length < (options.minLength ?? 3)) {
    return null;
  }

  const prefixMatches = candidates.filter((candidate) => candidate.startsWith(token));
  if (prefixMatches.length === 1) {
    return prefixMatches[0];
  }
  if (prefixMatches.length > 1) {
    return null;
  }

  const scored = candidates
    .map((candidate) => ({ candidate, distance: editDistance(token, candidate) }))
    .filter((entry) => entry.distance <= options.maxDistance)
    .sort((left, right) => left.distance - right.distance);

  if (scored.length === 0) {
    return null;
  }
  if (scored.length > 1 && scored[0].distance === scored[1].distance) {
    return null;
  }
  return scored[0].candidate;
}

function childCommandsByName(command: Command): Map<string, Command> {
  const map = new Map<string, Command>();
  for (const child of command.commands) {
    map.set(child.name(), child);
  }
  return map;
}

function matchSubcommand(command: Command, token: string): CommandMatch | null {
  const children = childCommandsByName(command);
  const names = Array.from(children.keys());
  if (names.length === 0) return null;

  if (children.has(token)) {
    return { name: token, command: children.get(token)!, kind: 'exact' };
  }

  const normalized = token.replace(/_/g, '-');
  if (children.has(normalized)) {
    return { name: normalized, command: children.get(normalized)!, kind: 'normalized' };
  }

  const prefix = names.filter((name) => name.startsWith(normalized));
  if (prefix.length === 1) {
    return { name: prefix[0], command: children.get(prefix[0])!, kind: 'prefix' };
  }
  if (prefix.length > 1) {
    return null;
  }

  const typo = pickUniqueBestMatch(normalized, names, { maxDistance: 2, minLength: 3 });
  if (typo && children.has(typo)) {
    return { name: typo, command: children.get(typo)!, kind: 'typo' };
  }

  return null;
}

function optionExpectsValue(flags: string): boolean {
  return flags.includes('<') || flags.includes('[');
}

function buildOptionScope(commandPath: Command[]): OptionScope {
  const byFlag = new Map<string, OptionMetadata>();
  const longFlags: string[] = [];

  for (const command of commandPath) {
    for (const option of command.options) {
      const expectsValue = optionExpectsValue(option.flags);

      if (option.long) {
        byFlag.set(option.long, { expectsValue });
        longFlags.push(option.long);
      }
      if (option.short) {
        byFlag.set(option.short, { expectsValue });
      }
    }
  }

  return { byFlag, longFlags };
}

function normalizeLongOptionToken(
  token: string,
  scope: OptionScope
): { token: string; correction?: string } {
  const [rawName, inlineValue] = token.split('=', 2);

  if (rawName === '--assignee' && scope.byFlag.has('--agent')) {
    return {
      token: inlineValue === undefined ? '--agent' : `--agent=${inlineValue}`,
      correction: "Interpreted '--assignee' as '--agent'. Preferred: use '--agent'.",
    };
  }

  const normalizedName = `--${rawName.slice(2).replace(/_/g, '-')}`;
  if (rawName !== normalizedName && scope.byFlag.has(normalizedName)) {
    return {
      token: inlineValue === undefined ? normalizedName : `${normalizedName}=${inlineValue}`,
      correction: `Interpreted '${rawName}' as '${normalizedName}'. Preferred: use '${normalizedName}'.`,
    };
  }

  if (scope.byFlag.has(rawName)) {
    return { token };
  }

  const best = pickUniqueBestMatch(rawName, scope.longFlags, { maxDistance: 2, minLength: 4 });
  if (best && best !== rawName) {
    return {
      token: inlineValue === undefined ? best : `${best}=${inlineValue}`,
      correction: `Interpreted '${rawName}' as '${best}'. Preferred: use '${best}'.`,
    };
  }

  return { token };
}

function normalizeOptionToken(
  token: string,
  scope: OptionScope
): { token: string; correction?: string; remove?: true } {
  if (token === '--json') {
    return {
      token,
      remove: true,
      correction:
        "Interpreted '--json' as default JSON mode. Preferred: omit '--json' (or use '--format md' for markdown).",
    };
  }

  if (token.startsWith('--')) {
    return normalizeLongOptionToken(token, scope);
  }

  if (/^-[A-Za-z0-9_-]{2,}$/.test(token)) {
    const maybeLong = `--${token.slice(1).replace(/_/g, '-')}`;
    if (scope.byFlag.has(maybeLong)) {
      return {
        token: maybeLong,
        correction: `Interpreted '${token}' as '${maybeLong}'. Preferred: use '${maybeLong}'.`,
      };
    }
  }

  return { token };
}

function formatCorrectionNote(note: string): string {
  return `Note: ${note}`;
}

export function normalizeInvocationArgs(args: string[], program: Command): NormalizationResult {
  const normalized = [...args];
  const notes: string[] = [];

  let currentCommand = program;
  const commandPath: Command[] = [program];
  let commandResolutionOpen = true;

  for (let index = 0; index < normalized.length; index += 1) {
    let token = normalized[index];
    if (token === '--') break;

    const optionScope = buildOptionScope(commandPath);

    if (token.startsWith('-')) {
      const optionResult = normalizeOptionToken(token, optionScope);
      if (optionResult.correction) notes.push(optionResult.correction);

      if (optionResult.remove) {
        normalized.splice(index, 1);
        index -= 1;
        continue;
      }

      token = optionResult.token;
      normalized[index] = token;

      const tokenName = token.split('=', 1)[0];
      const optionMetadata = optionScope.byFlag.get(tokenName);
      if (
        optionMetadata?.expectsValue &&
        !token.includes('=') &&
        normalized[index + 1] &&
        !normalized[index + 1].startsWith('-')
      ) {
        index += 1;
      }
      continue;
    }

    if (!commandResolutionOpen) {
      continue;
    }

    if (currentCommand.name() === 'task' && token === 'next') {
      const claimCommand = currentCommand.commands.find((command) => command.name() === 'claim');
      if (claimCommand) {
        normalized[index] = 'claim';
        if (!normalized.includes('--next')) {
          normalized.splice(index + 1, 0, '--next');
        }
        notes.push("Interpreted 'task next' as 'task claim --next'. Preferred: use 'task claim --next'.");
        commandPath.push(claimCommand);
        currentCommand = claimCommand;
        continue;
      }
    }

    const match = matchSubcommand(currentCommand, token);
    if (match) {
      if (match.name !== token) {
        notes.push(`Interpreted '${token}' as '${match.name}'. Preferred: use '${match.name}'.`);
      }
      normalized[index] = match.name;
      commandPath.push(match.command);
      currentCommand = match.command;
      continue;
    }

    commandResolutionOpen = false;
  }

  return { args: normalized, notes };
}

interface CommandContext {
  commandPathTokens: string[];
  commandPath: Command[];
}

function resolveCommandContext(args: string[], program: Command): CommandContext {
  const commandPathTokens: string[] = [];
  const commandPath: Command[] = [program];
  let current = program;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--') break;

    const optionScope = buildOptionScope(commandPath);
    if (token.startsWith('-')) {
      const tokenName = token.split('=', 1)[0];
      const optionMetadata = optionScope.byFlag.get(tokenName);
      if (
        optionMetadata?.expectsValue &&
        !token.includes('=') &&
        args[index + 1] &&
        !args[index + 1].startsWith('-')
      ) {
        index += 1;
      }
      continue;
    }

    const child = current.commands.find((command) => command.name() === token);
    if (!child) break;
    commandPathTokens.push(token);
    commandPath.push(child);
    current = child;
  }

  return { commandPathTokens, commandPath };
}

function topLevelExamples(): string[] {
  return [
    'hzl task list --project inbox',
    'hzl task claim --next --agent codex',
    'hzl task show TASK_ID',
  ];
}

function examplesForNamespace(namespace: string | undefined): string[] {
  if (namespace === 'task') {
    return [
      'hzl task list --project inbox --status ready',
      'hzl task claim --next --agent codex',
      'hzl task update TASK_ID --progress 50',
    ];
  }
  if (namespace === 'project') {
    return ['hzl project list', 'hzl project create demo'];
  }
  if (namespace === 'workflow') {
    return ['hzl workflow list', 'hzl workflow run quick-sync'];
  }
  return topLevelExamples();
}

function buildUsageError(args: string[], program: Command, rawMessage: string): CLIError {
  const message = rawMessage.replace(/^error:\s*/i, '').trim();
  const received = `hzl ${args.join(' ')}`.trim();
  const context = resolveCommandContext(args, program);
  const namespace = context.commandPathTokens[0];
  const baseExamples = examplesForNamespace(namespace);

  const unknownCommandMatch = message.match(/unknown command '([^']+)'/i);
  if (unknownCommandMatch) {
    const unknown = unknownCommandMatch[1];
    const currentCommand = context.commandPath[context.commandPath.length - 1];
    const candidates = currentCommand.commands.map((command) => command.name());
    const best = pickUniqueBestMatch(unknown, candidates, { maxDistance: 2, minLength: 2 });
    const didYouMean = best ? [best] : [];
    const prefix = context.commandPathTokens.length ? `${context.commandPathTokens.join(' ')} ` : '';

    const examples = best
      ? [`hzl ${prefix}${best} --help`, ...baseExamples]
      : [`hzl ${prefix}--help`, ...baseExamples];

    const details: ParseErrorDetails = {
      received,
      reason: `Unknown command '${unknown}'.`,
      preferred_syntax: best ? `hzl ${prefix}${best}`.trim() : undefined,
      did_you_mean: didYouMean.length ? didYouMean : undefined,
      examples: examples.slice(0, 3),
    };

    return new CLIError(
      `Could not parse command '${unknown}'. Use one of the documented command names.`,
      ExitCode.InvalidUsage,
      'invalid_usage',
      details
    );
  }

  const unknownOptionMatch = message.match(/unknown option '([^']+)'/i);
  if (unknownOptionMatch) {
    const unknown = unknownOptionMatch[1];
    const scope = buildOptionScope(context.commandPath);
    const best = pickUniqueBestMatch(unknown, scope.longFlags, { maxDistance: 2, minLength: 3 });
    const commandPrefix = context.commandPathTokens.join(' ');
    const preferred = best ? `${commandPrefix} ${best}`.trim() : commandPrefix || '--help';
    const examples = best
      ? [`hzl ${commandPrefix} ${best}`.trim(), ...baseExamples]
      : [`hzl ${commandPrefix} --help`.trim(), ...baseExamples];

    const details: ParseErrorDetails = {
      received,
      reason: `Unknown option '${unknown}'.`,
      preferred_syntax: `hzl ${preferred}`.trim(),
      did_you_mean: best ? [best] : undefined,
      examples: examples.slice(0, 3),
    };

    return new CLIError(
      `Could not parse option '${unknown}'.`,
      ExitCode.InvalidUsage,
      'invalid_usage',
      details
    );
  }

  const missingArgumentMatch = message.match(/missing required argument '([^']+)'/i);
  if (missingArgumentMatch) {
    const missing = missingArgumentMatch[1];
    const prefix = context.commandPathTokens.join(' ');
    const details: ParseErrorDetails = {
      received,
      reason: `Required argument '${missing}' is missing.`,
      preferred_syntax: `hzl ${prefix} --help`.trim(),
      examples: [`hzl ${prefix} --help`.trim(), ...baseExamples].slice(0, 3),
    };
    return new CLIError(
      `Missing required argument '${missing}'.`,
      ExitCode.InvalidUsage,
      'invalid_usage',
      details
    );
  }

  const details: ParseErrorDetails = {
    received,
    reason: message || 'Invalid command usage.',
    preferred_syntax: 'hzl --help',
    examples: topLevelExamples(),
  };

  return new CLIError(
    'Could not parse the command. Run `hzl --help` and retry with one of the examples below.',
    ExitCode.InvalidUsage,
    'invalid_usage',
    details
  );
}

function renderUsageError(error: CLIError, requestedFormat: 'json' | 'md'): never {
  if (requestedFormat === 'json') {
    console.log(JSON.stringify(createErrorEnvelope(error.code, error.message, error.details)));
    process.exit(error.exitCode);
  }

  console.error(`Error: ${error.message}`);
  if (error.details && typeof error.details === 'object') {
    const details = error.details as ParseErrorDetails;
    if (details.reason) console.error(`Reason: ${details.reason}`);
    if (details.preferred_syntax) console.error(`Preferred: ${details.preferred_syntax}`);
    if (details.did_you_mean && details.did_you_mean.length > 0) {
      console.error(`Did you mean: ${details.did_you_mean.join(', ')}`);
    }
    if (details.examples && details.examples.length > 0) {
      console.error('Examples:');
      for (const example of details.examples) {
        console.error(`  ${example}`);
      }
    }
  }
  process.exit(error.exitCode);
}

function isCommanderExitError(
  error: unknown
): error is Error & { code: string; exitCode?: number; message: string } {
  const code = error instanceof Error ? (error as { code?: unknown }).code : undefined;
  return (
    error instanceof Error &&
    typeof code === 'string' &&
    code.startsWith('commander.')
  );
}

function applyCommanderOverrides(command: Command): void {
  command.exitOverride();
  command.configureOutput({
    writeErr: () => {},
  });

  for (const child of command.commands) {
    applyCommanderOverrides(child);
  }
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();
  applyCommanderOverrides(program);

  const rawArgs = argv.slice(2);
  const normalization = normalizeInvocationArgs(rawArgs, program);
  const requestedFormat = parseRequestedFormat(normalization.args);
  for (const note of normalization.notes) {
    console.error(formatCorrectionNote(note));
  }

  const normalizedArgv = [argv[0] ?? 'node', argv[1] ?? 'hzl', ...normalization.args];

  try {
    await program.parseAsync(normalizedArgv);
  } catch (error) {
    if (isCommanderExitError(error)) {
      const successfulCommanderExit = (error.exitCode ?? ExitCode.GeneralError) === ExitCode.Success;
      if (successfulCommanderExit) {
        return;
      }

      const usageError = buildUsageError(normalization.args, program, error.message);
      renderUsageError(usageError, requestedFormat);
    }

    throw error;
  }
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
  buildUsageError,
};
