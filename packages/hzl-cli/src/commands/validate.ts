// packages/hzl-cli/src/commands/validate.ts
import type { Services } from '../db.js';
import type { OutputFormatter } from '../output.js';

export function validate(services: Services, out: OutputFormatter): boolean {
  const result = services.validationService.validate();
  if (result.isValid) {
    out.success('Database is valid - no issues found');
  } else {
    out.error('Database validation failed');
    for (const issue of result.issues) {
      out.text(`  [${issue.severity}] ${issue.type}: ${issue.message}`);
    }
  }
  return result.isValid;
}
