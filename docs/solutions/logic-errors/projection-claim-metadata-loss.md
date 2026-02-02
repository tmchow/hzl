---
title: "Claim Metadata Loss on Unblock and Silent Assignee Option in claimNext"
category: logic-errors
tags:
  - event-sourcing
  - projections
  - claim-mechanics
  - assignee-filtering
  - status-transitions
severity: high
date_documented: 2026-02-01
module: hzl-core
symptoms:
  - Original claim timestamp lost when task transitions from blocked back to in_progress
  - claimed_at reset to current time, breaking blocked-preserves-claim semantics
  - Stuck-task detection metrics skewed by incorrect claim timing
  - Assignee option in claimNext silently ignored despite being exposed in API
affected_files:
  - packages/hzl-core/src/projections/tasks-current.ts
  - packages/hzl-core/src/services/task-service.ts
  - packages/hzl-core/src/services/task-service.test.ts
---

# Claim Metadata Loss on Unblock and Silent Assignee Option in claimNext

## Problem Summary

Two logic errors were identified in HZL's event-sourced task coordination system:

1. **Projection treated all in_progress transitions identically**, resetting `claimed_at` even when unblocking a task (where the original claim time should be preserved)
2. **`assignee` option in `ClaimNextOptions` was defined but never wired into query logic**, making it a silent no-op

## Root Cause Analysis

### Issue 1: claimed_at Reset on Unblock

**Location:** `packages/hzl-core/src/projections/tasks-current.ts:75-120`

The `handleStatusChanged` function treated ALL transitions to `in_progress` the same way:

```typescript
// BEFORE: Single branch for all in_progress transitions
if (toStatus === TaskStatus.InProgress) {
  db.prepare(`
    UPDATE tasks_current SET
      status = ?,
      claimed_at = ?,  // Always reset!
      assignee = COALESCE(?, assignee),
      ...
  `).run(toStatus, event.timestamp, newAssignee, ...);
}
```

This meant `blocked → in_progress` (unblock) was treated identically to `ready → in_progress` (new claim), resetting `claimed_at` and losing the original claim timing.

**Impact:**
- Stuck-task detection reported incorrect durations
- Claim ownership timeline was corrupted
- Violated the "blocked preserves claim" semantic guarantee

### Issue 2: Assignee Option Ignored in claimNext

**Location:** `packages/hzl-core/src/services/task-service.ts:41-48, 422-470`

The `ClaimNextOptions` interface defined an `assignee` field:

```typescript
export interface ClaimNextOptions {
  author?: string;
  agent_id?: string;
  project?: string;
  tags?: string[];
  lease_until?: string;
  assignee?: string;  // Defined but never used!
}
```

But the SQL queries in `claimNext` never used it:

```typescript
// BEFORE: ORDER BY didn't include assignee preference
ORDER BY tc.priority DESC, tc.created_at ASC, tc.task_id ASC LIMIT 1
```

**Impact:**
- Agents couldn't express preference for pre-assigned work
- The API contract was misleading (option existed but did nothing)

## Solution

### Fix 1: Conditional Status Transition Handling

Added explicit handling for `blocked → in_progress` that preserves `claimed_at`:

```typescript
// AFTER: Three distinct cases
if (toStatus === TaskStatus.InProgress) {
  // Steal case: in_progress → in_progress - always overwrite
  if (data.from === TaskStatus.InProgress) {
    db.prepare(`
      UPDATE tasks_current SET
        claimed_at = ?,
        assignee = ?,
        ...
    `).run(event.timestamp, newAssignee, ...);
  }
  // Unblock case: blocked → in_progress - PRESERVE claimed_at
  else if (data.from === TaskStatus.Blocked) {
    db.prepare(`
      UPDATE tasks_current SET
        status = ?,
        assignee = COALESCE(?, assignee),
        lease_until = ?,
        ...
      -- NOTE: claimed_at is NOT updated
    `).run(toStatus, newAssignee, ...);
  }
  // Normal claim: ready → in_progress - set claimed_at
  else {
    db.prepare(`
      UPDATE tasks_current SET
        status = ?,
        claimed_at = ?,
        assignee = COALESCE(?, assignee),
        ...
    `).run(toStatus, event.timestamp, newAssignee, ...);
  }
}
```

### Fix 2: Wire Assignee into claimNext Query

Added assignee as a tiebreaker in the ORDER BY clause:

```typescript
// AFTER: Assignee preference as tiebreaker
const assigneeForPriority = opts.assignee ?? opts.author ?? opts.agent_id ?? '';

ORDER BY tc.priority DESC, (tc.assignee = ?) DESC, tc.created_at ASC, tc.task_id ASC LIMIT 1
```

This ensures:
- Priority still wins (high-priority unassigned beats low-priority assigned)
- Among equal priority, assigned tasks are preferred
- Fallback chain: explicit `assignee` → `author` → `agent_id` → empty string

## Test Coverage Added

```typescript
// Test: claimed_at preserved when unblocking
it('preserves claimed_at when unblocking to in_progress', () => {
  const task = taskService.createTask({ title: 'Test', project: 'inbox' });
  taskService.setStatus(task.task_id, TaskStatus.Ready);
  taskService.claimTask(task.task_id, { author: 'agent-1' });

  const claimed = taskService.getTaskById(task.task_id);
  const originalClaimedAt = claimed!.claimed_at;

  taskService.blockTask(task.task_id);
  const unblocked = taskService.unblockTask(task.task_id);

  expect(unblocked.claimed_at).toBe(originalClaimedAt);  // Preserved!
});

// Test: assignee as tiebreaker
it('prioritizes assigned tasks as tiebreaker within same priority', () => {
  const assignedTask = taskService.createTask({
    title: 'Assigned to me', project: 'inbox', priority: 2, assignee: 'agent-1',
  });
  const unassignedTask = taskService.createTask({
    title: 'Unassigned', project: 'inbox', priority: 2,
  });

  taskService.setStatus(assignedTask.task_id, TaskStatus.Ready);
  taskService.setStatus(unassignedTask.task_id, TaskStatus.Ready);

  const claimed = taskService.claimNext({ author: 'agent-1' });
  expect(claimed!.task_id).toBe(assignedTask.task_id);  // Assigned wins tiebreaker
});

// Test: priority still beats assignment
it('prioritizes higher priority over assigned', () => {
  const lowPriorityAssigned = taskService.createTask({
    title: 'Low priority assigned', project: 'inbox', priority: 1, assignee: 'agent-1',
  });
  const highPriorityUnassigned = taskService.createTask({
    title: 'High priority', project: 'inbox', priority: 3,
  });

  taskService.setStatus(lowPriorityAssigned.task_id, TaskStatus.Ready);
  taskService.setStatus(highPriorityUnassigned.task_id, TaskStatus.Ready);

  const claimed = taskService.claimNext({ author: 'agent-1' });
  expect(claimed!.task_id).toBe(highPriorityUnassigned.task_id);  // Priority wins
});
```

## Prevention Strategies

### For Projection Status Transitions

1. **Explicit branching for each transition type** - Never use catch-all handlers for status changes
2. **Document metadata preservation rules** - Which fields are preserved/reset for each transition
3. **Test each transition path explicitly** - Don't rely on implicit coverage

### For Interface-to-Query Wiring

1. **Test that all interface options affect behavior** - If an option exists, there should be a test proving it works
2. **Code review checklist** - When adding interface fields, verify they're used in implementation
3. **Consider TypeScript strict checks** - Unused parameters can sometimes be caught

### Code Review Checklist

When reviewing projection changes:
- [ ] Each status transition has explicit handling
- [ ] Metadata fields (claimed_at, assignee, lease_until) have documented preservation rules
- [ ] Tests exist for each transition path

When reviewing interface additions:
- [ ] New fields are used in implementation
- [ ] Tests verify the field affects behavior
- [ ] Documentation updated if user-facing

## Related Documentation

- [AGENTS.md - Key Patterns](/AGENTS.md#key-patterns) - Event sourcing and atomic claiming architecture
- [Event Sourcing Skill](/.claude/skills/event-sourcing/SKILL.md) - Core principles for projections
- [Tasks Concept](/docs/concepts/tasks.md) - Task statuses and claiming workflow
- [Multi-Agent Coordination](/docs/scenarios/multi-agent-coordination.md) - Why atomic claiming matters
