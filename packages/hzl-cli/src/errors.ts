// packages/hzl-cli/src/errors.ts
import { createErrorEnvelope } from './output.js';

export enum ExitCode {
  Success = 0,
  GeneralError = 1,
  InvalidUsage = 2,
  InvalidInput = 3,
  NotFound = 4,
  DatabaseError = 5,
  ValidationError = 6,
}

export class CLIError extends Error {
  public readonly exitCode: ExitCode;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    exitCode: ExitCode = ExitCode.GeneralError,
    code?: string,
    details?: unknown
  ) {
    super(message);
    this.exitCode = exitCode;
    this.code = code ?? codeForExitCode(exitCode);
    this.details = details;
    this.name = 'CLIError';
  }
}

export function handleError(error: unknown, json: boolean = false): void {
  if (error instanceof CLIError) {
    if (json) {
      console.log(JSON.stringify(createErrorEnvelope(error.code, error.message, error.details)));
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(error.exitCode);
  }

  if (error instanceof Error) {
    const domainCode = (error as { code?: unknown }).code;
    if (typeof domainCode === 'string' && domainCode.startsWith('task_invalid_')) {
      if (json) {
        console.log(JSON.stringify(createErrorEnvelope(domainCode, error.message)));
      } else {
        console.error(`Error: ${error.message}`);
      }
      process.exit(ExitCode.InvalidInput);
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  if (json) {
    console.log(JSON.stringify(createErrorEnvelope(codeForExitCode(ExitCode.GeneralError), message)));
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(ExitCode.GeneralError);
}

export function codeForExitCode(exitCode: ExitCode): string {
  switch (exitCode) {
    case ExitCode.InvalidUsage:
      return 'invalid_usage';
    case ExitCode.InvalidInput:
      return 'invalid_input';
    case ExitCode.NotFound:
      return 'not_found';
    case ExitCode.DatabaseError:
      return 'database_error';
    case ExitCode.ValidationError:
      return 'validation_error';
    case ExitCode.GeneralError:
      return 'general_error';
    case ExitCode.Success:
      return 'success';
    default:
      return 'general_error';
  }
}
