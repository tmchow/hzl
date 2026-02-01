// packages/hzl-cli/src/commands/validate.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../config.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { handleError } from '../errors.js';
import { GlobalOptionsSchema } from '../types.js';
import type { ValidationResult } from 'hzl-core/services/validation-service.js';

export function runValidate(options: {
  services: Services;
  json: boolean;
}): ValidationResult {
  const { services, json } = options;

  const result = services.validationService.validate();

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    if (result.isValid) {
      console.log('✓ Database is valid, no issues found');
    } else {
      console.log(`✗ Found ${result.issues.length} issue(s):`);
      for (const issue of result.issues) {
        const icon = issue.severity === 'error' ? '✗' : '⚠';
        console.log(`  ${icon} [${issue.type}] ${issue.message}`);
      }
      if (result.cycles.length > 0) {
        console.log(`\nCycles (${result.cycles.length}):`);
        for (const cycle of result.cycles) {
          const path = cycle.map((c) => c.taskId.slice(0, 8)).join(' → ');
          console.log(`  ${path} → (cycle)`);
        }
      }
      if (result.missingDeps.length > 0) {
        console.log(`\nMissing dependencies (${result.missingDeps.length}):`);
        for (const missing of result.missingDeps) {
          console.log(`  ${missing.taskId.slice(0, 8)} → ${missing.missingDepId.slice(0, 8)} (missing)`);
        }
      }
    }
  }

  return result;
}

export function createValidateCommand(): Command {
  return new Command('validate')
    .description('Validate database integrity (check for cycles, missing deps)')
    .action(function (this: Command) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const result = runValidate({ services, json: globalOpts.json ?? false });
        if (!result.isValid) {
          process.exitCode = 1;
        }
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
