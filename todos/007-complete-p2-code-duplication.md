---
status: complete
priority: p2
issue_id: "007"
tags: [code-review, quality, hzl-web]
dependencies: []
---

# Duplicate Column Grouping Logic in Frontend

## Problem Statement

The same task grouping logic (sorting tasks into Kanban columns) is duplicated in two places: `renderBoard()` and `renderMobileCards()`.

## Findings

**Location:** `/packages/hzl-web/src/ui/index.html`

**First occurrence** - lines 817-832:
```javascript
const columns = {
  backlog: [], blocked: [], ready: [], in_progress: [], done: [],
};
for (const task of tasks) {
  const isBlocked = task.blocked_by && task.blocked_by.length > 0;
  const status = isBlocked && task.status === 'ready' ? 'blocked' : task.status;
  if (columns[status]) {
    columns[status].push(task);
  }
}
```

**Second occurrence** - lines 859-877 (identical code)

**From pattern-recognition-specialist agent review.**

## Proposed Solutions

### Option 1: Extract shared function (Recommended)
**Pros:** DRY, single source of truth
**Cons:** Minor refactor
**Effort:** Small
**Risk:** Low

```javascript
function groupTasksByStatus(tasks) {
  const columns = { backlog: [], blocked: [], ready: [], in_progress: [], done: [] };
  for (const task of tasks) {
    const isBlocked = task.blocked_by && task.blocked_by.length > 0;
    const status = isBlocked && task.status === 'ready' ? 'blocked' : task.status;
    if (columns[status]) columns[status].push(task);
  }
  return columns;
}
```

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `packages/hzl-web/src/ui/index.html`

## Acceptance Criteria

- [ ] Single `groupTasksByStatus()` function
- [ ] Both render functions use shared helper
- [ ] No behavior change

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-31 | Identified during code review | DRY principle |

## Resources

- PR: feature/hzl-web-dashboard
- Pattern-recognition-specialist agent review
