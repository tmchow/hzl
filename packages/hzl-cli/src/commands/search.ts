// packages/hzl-cli/src/commands/search.ts
import type { Services } from '../db.js';
import type { OutputFormatter } from '../output.js';

export function search(services: Services, query: string, opts: { project?: string; limit?: number; offset?: number }, out: OutputFormatter): void {
  const result = services.searchService.search(query, opts);
  out.table(result.tasks as unknown as Record<string, unknown>[], ['task_id', 'title', 'project', 'status', 'priority']);
  out.text(`Showing ${result.tasks.length} of ${result.total} results`);
}
