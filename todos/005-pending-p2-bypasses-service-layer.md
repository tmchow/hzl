---
status: pending
priority: p2
issue_id: "005"
tags: [code-review, architecture, hzl-web]
dependencies: []
---

# Web Dashboard Bypasses hzl-core Service Layer

## Problem Statement

The hzl-web package directly queries the database with raw SQL instead of using hzl-core services (TaskService, EventStore). This creates architectural debt:
- SQL logic duplicated across packages
- Schema changes require updates in multiple places
- No reuse of business logic

## Findings

**Location:** `/packages/hzl-web/src/server.ts` lines 126-202

```typescript
// Direct SQL queries instead of using TaskService
const listTasksStmt = cacheDb.prepare(`
  SELECT task_id, title, project, status, priority,
         claimed_by_agent_id, lease_until, updated_at
  FROM tasks_current
  WHERE status != 'archived'
    AND updated_at >= datetime('now', ?)
  ORDER BY priority DESC, updated_at DESC
`);
```

**Established pattern in hzl-core:**
- CLI -> Services -> EventStore/Projections
- hzl-web breaks this: CLI -> hzl-web -> Direct DB access

**From architecture-strategist agent review.**

## Proposed Solutions

### Option 1: Create QueryService in hzl-core (Recommended)
**Pros:** Centralizes read logic, enables reuse
**Cons:** Requires new abstraction
**Effort:** Medium
**Risk:** Low

```typescript
// packages/hzl-core/src/services/query-service.ts
export class QueryService {
  listTasks(opts: { since?: string; project?: string }): TaskListItem[]
  getTaskDetail(taskId: string): TaskDetail | null
  getComments(taskId: string): Comment[]
}
```

### Option 2: Accept current design for v1
**Pros:** Ship faster
**Cons:** Technical debt accumulates
**Effort:** None
**Risk:** Medium (maintenance burden)

Document the architectural deviation and plan future refactor.

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `packages/hzl-web/src/server.ts`
- New: `packages/hzl-core/src/services/query-service.ts`

## Acceptance Criteria

- [ ] Read queries centralized in hzl-core
- [ ] hzl-web imports from hzl-core
- [ ] No raw SQL in hzl-web

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-31 | Identified during code review | Service layer consistency |

## Resources

- PR: feature/hzl-web-dashboard
- Architecture-strategist agent review
