# Event Sourcing Bypass in stealTask and CLI Consistency

---
module: hzl-core
date: 2026-02-01
problem_type: best_practice
component: service_object
symptoms:
  - "stealTask method bypassed event sourcing with direct SQL UPDATE"
  - "No progress indicator during schema migration"
  - "CLI arguments inconsistent (--agent vs --agent-id, positional vs option)"
  - "Duplicate progress validation code in setProgress and addCheckpoint"
  - "Missing status-only index for queries filtering by status without project"
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags: [event-sourcing, projection, cli, migration, code-review]
---

## Context

Code review of the `feat/task-properties` branch (implementing assignee, progress tracking, and blocked status) identified multiple architectural and consistency issues.

## Symptoms

### P2-1: Event Sourcing Bypass in stealTask
The `stealTask` method appended a StatusChanged event but then performed a direct SQL UPDATE to the projection table, bypassing the projection handler:

```typescript
// WRONG: Direct UPDATE after event.append() in stealTask
this.projectionEngine.applyEvent(event);

// This bypasses event sourcing - projection should handle this!
const newAssignee = opts.author || opts.agent_id || null;
this.db.prepare(`
  UPDATE tasks_current SET
    claimed_at = ?, assignee = ?, lease_until = ?, updated_at = ?, last_event_id = ?
  WHERE task_id = ?
`).run(new Date().toISOString(), newAssignee, opts.lease_until ?? null, ...);
```

### P2-4: No Migration Progress Indicator
Schema migration showed only "Upgrading database schema..." without indicating how many events would be replayed.

### P3-5: Inconsistent CLI Arguments
`block` command used positional argument for reason while `unblock` and `release` used `--reason` option.

### P3-6: Duplicate Progress Validation
Same validation code appeared in `setProgress()` and `addCheckpoint()`:
```typescript
if (progress < 0 || progress > 100 || !Number.isInteger(progress)) {
  throw new Error('Progress must be an integer between 0 and 100');
}
```

### P3-7: Confusing --agent Flag
`--agent <id>` in claim command was ambiguous - could be confused with "assignee".

### P3-9: Missing Status Index
No index on just `status` column for queries without project filter.

## Root Cause

The event sourcing pattern was not fully followed in `stealTask`. The "steal" case (in_progress → in_progress transition) wasn't explicitly handled by the projection handler, so a direct UPDATE was added as a workaround.

## Solution

### P2-1: Handle Steal in Projection Handler

Modified `tasks-current.ts:handleStatusChanged()` to detect and handle the steal case:

```typescript
// packages/hzl-core/src/projections/tasks-current.ts
if (toStatus === TaskStatus.InProgress) {
  const newAssignee = event.author || event.agent_id || null;

  // Steal case: in_progress → in_progress - always overwrite assignee and claimed_at
  if (data.from === TaskStatus.InProgress) {
    db.prepare(`
      UPDATE tasks_current SET
        claimed_at = ?,
        assignee = ?,
        lease_until = ?,
        updated_at = ?,
        last_event_id = ?
      WHERE task_id = ?
    `).run(
      event.timestamp,
      newAssignee,  // Always overwrite (no COALESCE)
      data.lease_until ?? null,
      event.timestamp,
      event.rowid,
      event.task_id
    );
  } else {
    // Normal claim - use COALESCE to preserve existing assignee if no new one
    db.prepare(`...COALESCE(?, assignee)...`).run(...);
  }
}
```

Then removed the direct UPDATE from `stealTask`:

```typescript
// packages/hzl-core/src/services/task-service.ts
stealTask(taskId: string, opts: StealOptions): StealResult {
  // ... validation ...

  const event = this.eventStore.append({
    task_id: taskId,
    type: EventType.StatusChanged,
    data: { from: TaskStatus.InProgress, to: TaskStatus.InProgress, reason: 'stolen', lease_until: opts.lease_until },
    author: opts.author,
    agent_id: opts.agent_id,
  });

  this.projectionEngine.applyEvent(event);
  // REMOVED: Direct UPDATE - projection handler now handles this

  return { success: true };
}
```

### P2-4: Add Migration Progress Indicator

```typescript
// packages/hzl-cli/src/db.ts
const eventCount = (eventsDb.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number }).count;
console.error(`Upgrading database schema (v${currentVersion} → v${CURRENT_SCHEMA_VERSION})...`);
console.error(`  Replaying ${eventCount.toLocaleString()} events...`);
```

### P3-5: Consistent CLI Arguments

Changed `block.ts` from positional argument to option:

```typescript
// BEFORE
.argument('[reason]', 'Block reason (why is this task stuck?)')

// AFTER
.option('--reason <reason>', 'Block reason (why is this task stuck?)')
```

### P3-6: Extract Shared Validation

```typescript
// packages/hzl-core/src/services/task-service.ts
function validateProgress(progress: number): void {
  if (progress < 0 || progress > 100 || !Number.isInteger(progress)) {
    throw new Error('Progress must be an integer between 0 and 100');
  }
}

// Used in setProgress() and addCheckpoint()
setProgress(taskId: string, progress: number, opts?: EventContext): Task {
  validateProgress(progress);
  // ...
}

addCheckpoint(taskId: string, name: string, data?: Record<string, unknown>, opts?: { progress?: number } & EventContext): Checkpoint {
  if (opts?.progress !== undefined) {
    validateProgress(opts.progress);
  }
  // ...
}
```

### P3-7: Rename --agent to --agent-id

```typescript
// packages/hzl-cli/src/commands/task/claim.ts
.option('--author <name>', 'Author name (human identifier)')
.option('--agent-id <id>', 'Agent ID (machine/AI identifier)')
```

### P3-9: Add Status Index

```sql
-- packages/hzl-core/src/db/schema.ts
CREATE INDEX IF NOT EXISTS idx_tasks_current_status ON tasks_current(status);
```

## Files Changed

- `packages/hzl-core/src/projections/tasks-current.ts` - Handle steal case in projection
- `packages/hzl-core/src/services/task-service.ts` - Remove direct UPDATE, add validateProgress helper
- `packages/hzl-core/src/db/schema.ts` - Add status-only index
- `packages/hzl-cli/src/db.ts` - Add migration progress indicator
- `packages/hzl-cli/src/commands/task/block.ts` - Change reason to option
- `packages/hzl-cli/src/commands/task/claim.ts` - Rename --agent to --agent-id

## Prevention Strategies

1. **Event sourcing code review checklist**: "Does this change include direct UPDATEs to projection tables after appending events?"

2. **Projection completeness check**: When adding new status transitions, ensure the projection handler covers all cases.

3. **CLI design review**: New commands should follow established patterns for options vs positional arguments.

4. **DRY validation**: Extract common validation logic to shared helpers.

## Related Documentation

- [AGENTS.md](/AGENTS.md) - Event sourcing patterns and architecture
- [Web Layer Bypassing Service Layer](/docs/solutions/architecture-issues/web-layer-bypassing-service-layer.md) - Similar architectural violation pattern

## Testing

Added test for steal case in projection:

```typescript
// packages/hzl-core/src/projections/tasks-current.test.ts
it('overwrites assignee when task is stolen (in_progress → in_progress)', () => {
  // First claim by agent-1
  const claimEvent = eventStore.append({
    task_id: 'TASK1',
    type: EventType.StatusChanged,
    data: { from: TaskStatus.Ready, to: TaskStatus.InProgress },
    author: 'agent-1',
  });
  projector.apply(claimEvent, db);
  expect(task.assignee).toBe('agent-1');

  // Steal by agent-2
  const stealEvent = eventStore.append({
    task_id: 'TASK1',
    type: EventType.StatusChanged,
    data: { from: TaskStatus.InProgress, to: TaskStatus.InProgress, reason: 'stolen' },
    author: 'agent-2',
  });
  projector.apply(stealEvent, db);
  expect(task.assignee).toBe('agent-2'); // Assignee overwritten to new owner
});
```

Run all tests:
```bash
npm test  # 360 tests pass
```
