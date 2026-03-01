// packages/hzl-cli/src/errors.test.ts
import { afterEach, describe, it, expect, vi } from 'vitest';
import { CLIError, ExitCode, codeForExitCode, handleError } from './errors.js';
import { SCHEMA_VERSION } from './output.js';

describe('CLIError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates error with message and default exit code', () => {
    const error = new CLIError('Something went wrong');
    expect(error.message).toBe('Something went wrong');
    expect(error.exitCode).toBe(ExitCode.GeneralError);
    expect(error.code).toBe('general_error');
  });

  it('creates error with custom exit code', () => {
    const error = new CLIError('Not found', ExitCode.NotFound);
    expect(error.exitCode).toBe(ExitCode.NotFound);
    expect(error.code).toBe('not_found');
  });

  it('creates error with suggestions', () => {
    const error = new CLIError('Task not found: abc', ExitCode.NotFound, undefined, undefined, [
      'hzl task list -P demo',
    ]);
    expect(error.suggestions).toEqual(['hzl task list -P demo']);
  });

  it('maps exit codes to stable symbolic codes', () => {
    expect(codeForExitCode(ExitCode.InvalidUsage)).toBe('invalid_usage');
    expect(codeForExitCode(ExitCode.InvalidInput)).toBe('invalid_input');
    expect(codeForExitCode(ExitCode.NotFound)).toBe('not_found');
  });

  it('prints structured error envelope in json mode', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`exit:${code}`);
    });

    expect(() => handleError(new CLIError('Bad input', ExitCode.InvalidInput), true)).toThrow(
      'exit:3'
    );
    expect(exitSpy).toHaveBeenCalledWith(ExitCode.InvalidInput);

    const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(payload).toEqual({
      schema_version: SCHEMA_VERSION,
      ok: false,
      error: {
        code: 'invalid_input',
        message: 'Bad input',
      },
    });
  });

  it('includes suggestions in error envelope JSON output', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`exit:${code}`);
    });

    const error = new CLIError('Task not found: abc', ExitCode.NotFound, undefined, undefined, [
      'hzl task list -P demo',
    ]);
    expect(() => handleError(error, true)).toThrow('exit:4');

    const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(payload.error.suggestions).toEqual(['hzl task list -P demo']);
  });

  it('maps typed task domain errors to invalid input exit code', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`exit:${code}`);
    });

    const domainError = new Error('Progress must be an integer between 0 and 100') as Error & {
      code: string;
    };
    domainError.code = 'task_invalid_progress';

    expect(() => handleError(domainError, true)).toThrow('exit:3');
    expect(exitSpy).toHaveBeenCalledWith(ExitCode.InvalidInput);

    const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(payload).toEqual({
      schema_version: SCHEMA_VERSION,
      ok: false,
      error: {
        code: 'task_invalid_progress',
        message: 'Progress must be an integer between 0 and 100',
      },
    });
  });
});
