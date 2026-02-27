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
});
