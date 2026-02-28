// packages/hzl-cli/src/resolve-id.ts
import { AmbiguousPrefixError } from 'hzl-core/services/task-service.js';
import type { Services } from './db.js';
import { CLIError, ExitCode } from './errors.js';

/**
 * Resolve a task ID prefix to a full task ID.
 * Throws CLIError with appropriate exit code on failure.
 */
export function resolveId(services: Services, idOrPrefix: string): string {
  try {
    const resolved = services.taskService.resolveTaskId(idOrPrefix);
    if (resolved === null) {
      throw new CLIError(`Task not found: ${idOrPrefix}`, ExitCode.NotFound, undefined, undefined, ['hzl task list']);
    }
    return resolved;
  } catch (e) {
    if (e instanceof AmbiguousPrefixError) {
      throw new CLIError(e.message, ExitCode.InvalidInput, undefined, undefined, e.matches.slice(0, 5).map(m => `hzl task show ${m.task_id}`));
    }
    throw e;
  }
}
