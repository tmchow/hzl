---
status: complete
priority: p2
issue_id: "003"
tags: [code-review, performance, hzl-web]
dependencies: []
---

# N+1 Query Pattern in Event Handler

## Problem Statement

The `/api/events` endpoint executes a separate query for each unique task to fetch its title. With 50 events from 50 different tasks, this results in 51 database queries per poll.

## Findings

**Location:** `/packages/hzl-web/src/server.ts` lines 336-343

```typescript
const taskIds = [...new Set(rows.map((r) => r.task_id))];
const titleMap = new Map<string, string>();
for (const tid of taskIds) {
  const task = getTaskStmt.get(tid) as { title: string } | undefined;
  if (task) {
    titleMap.set(tid, task.title);
  }
}
```

**Impact at scale:**
- 50 events * 10 concurrent users = 500+ queries every 5 seconds
- Adds latency to event endpoint

**From performance-oracle agent review.**

## Proposed Solutions

### Option 1: Batch query with IN clause (Recommended)
**Pros:** Single query, simple change
**Cons:** Dynamic SQL (still parameterized)
**Effort:** Small
**Risk:** Low

```typescript
const placeholders = taskIds.map(() => '?').join(',');
const titles = cacheDb.prepare(`
  SELECT task_id, title FROM tasks_current
  WHERE task_id IN (${placeholders})
`).all(...taskIds);
```

### Option 2: JOIN in original query
**Pros:** Single query total
**Cons:** More complex query
**Effort:** Small
**Risk:** Low

Join tasks_current directly in the events query.

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `packages/hzl-web/src/server.ts`

## Acceptance Criteria

- [ ] Single batch query for task titles
- [ ] Event endpoint response time unchanged or improved

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-31 | Identified during code review | Classic N+1 pattern |

## Resources

- PR: feature/hzl-web-dashboard
- Performance-oracle agent review
