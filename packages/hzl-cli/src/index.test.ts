import { describe, it, expect } from 'vitest';
import * as hzlCli from './index.js';

describe('hzl-cli public API', () => {
  it('exports createProgram', () => {
    expect(hzlCli.createProgram).toBeDefined();
    expect(typeof hzlCli.createProgram).toBe('function');
  });

  it('exports run', () => {
    expect(hzlCli.run).toBeDefined();
    expect(typeof hzlCli.run).toBe('function');
  });

  it('exports CLIError', () => {
    expect(hzlCli.CLIError).toBeDefined();
  });

  it('exports ExitCode', () => {
    expect(hzlCli.ExitCode).toBeDefined();
    expect(hzlCli.ExitCode.Success).toBe(0);
  });

  it('exports config utilities', () => {
    expect(hzlCli.resolveDbPaths).toBeDefined();
    expect(hzlCli.readConfig).toBeDefined();
  });

  it('exports output utilities', () => {
    expect(hzlCli.formatOutput).toBeDefined();
    expect(hzlCli.printSuccess).toBeDefined();
    expect(hzlCli.printError).toBeDefined();
    expect(hzlCli.printTable).toBeDefined();
  });

  it('detects removed task next surface', () => {
    expect(hzlCli.detectLegacySurface(['task', 'next'])).toBe('task_next');
  });

  it('detects removed json flag', () => {
    expect(hzlCli.detectLegacySurface(['task', 'list', '--json'])).toBe('json_flag');
  });

  it('detects renamed assignee flag', () => {
    expect(hzlCli.detectLegacySurface(['task', 'claim', 'abc', '--assignee', 'a1'])).toBe(
      'assignee_flag'
    );
  });

  it('normalizes legacy and minor syntax variants', () => {
    const program = hzlCli.createProgram();
    const normalized = hzlCli.normalizeInvocationArgs(
      ['task', 'next', '--assignee', 'agent-1', '--json'],
      program
    );

    expect(normalized.args).toEqual(['task', 'claim', '--next', '--agent', 'agent-1']);
    expect(normalized.notes.length).toBe(3);
  });

  it('does not rewrite --assignee when --agent is not supported in command scope', () => {
    const program = hzlCli.createProgram();
    const normalized = hzlCli.normalizeInvocationArgs(['project', 'list', '--assignee', 'a1'], program);

    expect(normalized.args).toEqual(['project', 'list', '--assignee', 'a1']);
    expect(normalized.notes).toHaveLength(0);
  });

  it('normalizes underscored subcommands', () => {
    const program = hzlCli.createProgram();
    const normalized = hzlCli.normalizeInvocationArgs(['task', 'add_dep', 'A', 'B'], program);

    expect(normalized.args).toEqual(['task', 'add-dep', 'A', 'B']);
    expect(normalized.notes).toHaveLength(1);
  });

  it('builds detailed usage error for unknown option', () => {
    const program = hzlCli.createProgram();
    const error = hzlCli.buildUsageError(
      ['task', 'claim', '--agnt', 'agent-1'],
      program,
      "error: unknown option '--agnt'"
    );

    expect(error.code).toBe('invalid_usage');
    expect(error.exitCode).toBe(hzlCli.ExitCode.InvalidUsage);

    const details = error.details as {
      reason: string;
      did_you_mean?: string[];
      examples: string[];
    };
    expect(details.reason).toContain('--agnt');
    expect(details.did_you_mean).toContain('--agent');
    expect(details.examples.length).toBeGreaterThanOrEqual(2);
  });
});
