# Web Layer Bypassing Service Layer

**Date:** 2026-02-01
**Module:** hzl-web
**Category:** architecture-issues
**Tags:** [service-layer, architecture, separation-of-concerns, hzl-web]

## Symptoms

- Direct SQL queries in `packages/hzl-web/src/server.ts` instead of using `TaskService`
- Prepared statements created directly from database connections
- Business logic (date filtering, blocked task detection) duplicated outside `hzl-core`
- Web server required direct database access (`cacheDb`, `eventsDb`) instead of services

## Root Cause

During initial implementation of the hzl-web dashboard, direct database queries were used for convenience rather than going through the established service layer. This violated the architectural principle that all data access should flow through `hzl-core` services.

The problematic pattern:

```typescript
// WRONG: Direct SQL in web layer
const stmt = cacheDb.prepare(`
  SELECT task_id, title, project, status...
  FROM tasks_current
  WHERE status != 'archived'
    AND updated_at >= datetime('now', '-' || ? || ' days')
`);
const rows = stmt.all(days);
```

## Solution

Refactored to use the service layer by:

1. **Adding missing methods to TaskService** (`packages/hzl-core/src/services/task-service.ts`):

```typescript
// List tasks with filtering
listTasks(opts: { sinceDays?: number; project?: string } = {}): TaskListItem[]

// Get blocked dependencies map for all ready tasks
getBlockedByMap(): Map<string, string[]>

// Get task statistics by status
getStats(): TaskStats

// Get blocking dependencies for a specific task
getBlockingDependencies(taskId: string): string[]

// Batch fetch task titles (avoids N+1 queries)
getTaskTitlesByIds(taskIds: string[]): Map<string, string>
```

2. **Adding getRecentEvents to EventStore** (`packages/hzl-core/src/events/store.ts`):

```typescript
getRecentEvents(opts: {
  sinceId?: number;
  limit?: number;
  types?: EventType[];
} = {}): PersistedEventEnvelope[]
```

3. **Refactoring server.ts to use services**:

```typescript
// CORRECT: Use service layer
export interface ServerOptions {
  port: number;
  host?: string;
  taskService: TaskService;  // Not cacheDb
  eventStore: EventStore;    // Not eventsDb
}

function handleTasks(params: URLSearchParams, res: ServerResponse): void {
  const rows = taskService.listTasks({
    sinceDays: days,
    project: project ?? undefined,
  });
  const blockedMap = taskService.getBlockedByMap();
  // ...
}
```

## Files Changed

- `packages/hzl-core/src/services/task-service.ts` - Added new query methods
- `packages/hzl-core/src/events/store.ts` - Added `getRecentEvents()`
- `packages/hzl-core/src/index.ts` - Exported new types
- `packages/hzl-web/src/server.ts` - Refactored to use services
- `packages/hzl-web/src/server.test.ts` - Updated test setup
- `packages/hzl-cli/src/commands/serve.ts` - Pass services instead of databases
- `packages/hzl-core/src/services/task-service.test.ts` - Added 16 new tests

## Prevention Strategies

1. **Code review checklist item**: "Does this change bypass the service layer with direct SQL?"

2. **Architectural boundary enforcement**: Web packages should only depend on service interfaces, never on database modules directly.

3. **Import restrictions**: Consider linting rules that prevent `hzl-web` from importing database-related modules from `hzl-core`.

4. **Service-first development**: When adding new features, start by defining the service interface, then implement the handler that uses it.

## Related Documentation

- [AGENTS.md](/AGENTS.md) - Architecture overview and event sourcing patterns
- [hzl-web-dashboard-plan.md](/docs/plans/2026-01-31-feat-hzl-web-dashboard-plan.md) - Original implementation plan

## Testing

Added 16 unit tests for the new TaskService methods:
- `listTasks()` - filtering by date and project
- `getBlockedByMap()` - blocked dependency detection
- `getStats()` - task statistics aggregation
- `getBlockingDependencies()` - individual task blocking info
- `getTaskTitlesByIds()` - batched title fetching

Run tests with:
```bash
npm test -w hzl-core -- src/services/task-service.test.ts
npm test -w hzl-web -- src/server.test.ts
```
