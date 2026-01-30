// packages/hzl-cli/src/errors.test.ts
import { describe, it, expect } from 'vitest';
import { CLIError, ExitCode } from './errors.js';

describe('CLIError', () => {
  it('creates error with message and default exit code', () => {
    const error = new CLIError('Something went wrong');
    expect(error.message).toBe('Something went wrong');
    expect(error.exitCode).toBe(ExitCode.GeneralError);
  });

  it('creates error with custom exit code', () => {
    const error = new CLIError('Not found', ExitCode.NotFound);
    expect(error.exitCode).toBe(ExitCode.NotFound);
  });
});
