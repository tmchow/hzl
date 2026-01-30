// packages/hzl-cli/src/errors.ts
export enum ExitCode {
  Success = 0,
  GeneralError = 1,
  InvalidUsage = 2,
  NotFound = 3,
  DatabaseError = 4,
  ValidationError = 5,
}

export class CLIError extends Error {
  public readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode = ExitCode.GeneralError) {
    super(message);
    this.exitCode = exitCode;
    this.name = 'CLIError';
  }
}

export function handleError(error: unknown, json: boolean = false): never {
  if (error instanceof CLIError) {
    if (json) {
      console.log(JSON.stringify({ error: error.message, code: error.exitCode }));
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(error.exitCode);
  }

  const message = error instanceof Error ? error.message : String(error);
  if (json) {
    console.log(JSON.stringify({ error: message, code: ExitCode.GeneralError }));
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(ExitCode.GeneralError);
}
