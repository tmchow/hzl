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
    expect(hzlCli.resolveDbPath).toBeDefined();
    expect(hzlCli.readConfig).toBeDefined();
  });

  it('exports output utilities', () => {
    expect(hzlCli.formatOutput).toBeDefined();
    expect(hzlCli.printSuccess).toBeDefined();
    expect(hzlCli.printError).toBeDefined();
    expect(hzlCli.printTable).toBeDefined();
  });
});
