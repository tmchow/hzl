---
title: "feat: HZL Workflow Discoverability Improvements"
type: feat
date: 2026-02-03
source: docs/plans/2026-02-03-workflow-discoverability-design.md
deepened: 2026-02-03
reviewed: 2026-02-03
---

# HZL Workflow Discoverability Improvements

## Summary

Enable agents to create tasks in non-backlog states atomically, avoiding the confusing two-step workflow that causes agents to give up and work without tracking.

**Key changes:**
- Add `-s/--status` flag to `task add` (atomicity for multi-agent scenarios)
- Add `--assignee` flag to `task add` (for `-s in_progress`)
- Add `--reason` flag to `task add` (required for `-s blocked`)
- Rename `--author` to `--assignee` on `claim` (clarity over audit trail)
- Allow `blocked → blocked` transitions (update block reason)
- Improve error messages with inline hints

## Problem Statement

```
hzl task add "Research X" -P openclaw
# → Created task abc123 (status: backlog)

hzl task claim abc123 --assignee openclaw
# → Error: Task is not claimable: status is backlog, must be ready

# Agent gives up and works without tracking
```

**Why `-s ready` matters (atomicity):**
```
# Without -s flag, race condition window:
Agent A: hzl task add "Fix bug" → abc123
Agent B: hzl task add "Fix bug" → def456
Agent A: hzl task set-status abc123 ready
Agent B: hzl task set-status def456 ready
Agent A: hzl task claim abc123  # Works
Agent B: hzl task claim abc123  # Steals from A!

# With -s flag, atomic:
Agent A: hzl task add "Fix bug" -s ready → abc123 (already ready)
Agent B: hzl task add "Fix bug" -s ready → def456 (already ready)
# No race condition
```

## Design Decisions

### Flags on `task add`

| Flag | Purpose | Rationale |
|------|---------|-----------|
| `-s/--status` | Initial status | Atomicity for multi-agent |
| `--assignee` | Who owns task (for `-s in_progress`) | Clarity of intent |
| `--reason` | Block reason (required for `-s blocked`) | Semantic requirement |

**Removed from original design:**
- `--agent-id` - Redundant with `--assignee`
- `--lease` - No atomicity benefit; use `claim --lease` separately

### `--assignee` vs `--author`

| Term | Meaning | Commands |
|------|---------|----------|
| `--assignee` | Who owns the task | `claim`, `add` |
| `--author` | Who performed the action (audit) | `checkpoint`, `complete`, `block`, etc. |

**Breaking change:** Rename `claim --author` to `claim --assignee` for consistency. Clean break, no deprecation period.

### No Warnings System

Operations without `--assignee` are allowed silently. Agents who want attribution will provide it.

### Error Messages

Inline hints in the error string. No structured `CLIErrorData` - simpler implementation, agents parse strings fine.

```
Task abc123 is not claimable (status: backlog)
Hint: hzl task set-status abc123 ready
```

---

## Implementation

### Phase 1: Core Service Changes

**File:** `packages/hzl-core/src/services/task-service.ts`

**1.1 Extend CreateTaskInput (lines 15-27)**

```typescript
export interface CreateTaskInput {
  title: string;
  project: string;
  parent_id?: string;
  description?: string;
  links?: string[];
  depends_on?: string[];
  tags?: string[];
  priority?: number;
  due_at?: string;
  metadata?: Record<string, unknown>;
  // Note: remove unused `assignee` field to avoid confusion
  // NEW fields
  initial_status?: TaskStatus;  // defaults to Backlog
  block_reason?: string;        // required if initial_status is Blocked
}
```

**1.2 Update createTask() (lines 256-311)**

After `TaskCreated` event is emitted:

```typescript
// Handle initial_status if different from Backlog
if (input.initial_status && input.initial_status !== TaskStatus.Backlog) {
  // Validate block_reason requirement
  if (input.initial_status === TaskStatus.Blocked && !input.block_reason) {
    throw new Error('block_reason is required when initial_status is Blocked');
  }

  const statusData: StatusChangedData = {
    from: TaskStatus.Backlog,
    to: input.initial_status,
    ...(input.block_reason && { reason: input.block_reason }),
  };

  // Emit StatusChanged event - author becomes assignee for in_progress
  const statusEvent = this.eventStore.append({
    task_id: taskId,
    type: EventType.StatusChanged,
    data: statusData,
    author: ctx?.author,  // Becomes assignee via projection
    agent_id: ctx?.agent_id,
    session_id: ctx?.session_id,
    correlation_id: ctx?.correlation_id,
    causation_id: ctx?.causation_id,
  });
  this.projectionEngine.applyEvent(statusEvent);
}
```

**1.3 Update blockTask() (lines 611-630)**

Allow `blocked → blocked` and fix hardcoded `from` status:

```typescript
blockTask(taskId: string, opts?: { reason?: string } & EventContext): Task {
  return withWriteTransaction(this.db, () => {
    const task = this.getTaskById(taskId);
    if (!task) throw new TaskNotFoundError(taskId);

    // Allow blocked → blocked for reason updates
    if (task.status !== TaskStatus.InProgress && task.status !== TaskStatus.Blocked) {
      throw new Error(`Cannot block: status is ${task.status}, expected in_progress or blocked`);
    }

    const event = this.eventStore.append({
      task_id: taskId,
      type: EventType.StatusChanged,
      data: { from: task.status, to: TaskStatus.Blocked, reason: opts?.reason },  // Use task.status!
      author: opts?.author,
      agent_id: opts?.agent_id,
    });

    this.projectionEngine.applyEvent(event);
    return this.getTaskById(taskId)!;
  });
}
```

**File:** `packages/hzl-core/src/projections/tasks-current.ts`

Add explicit branch for `blocked → blocked`:

```typescript
} else if (fromStatus === TaskStatus.Blocked && toStatus === TaskStatus.Blocked) {
  // Updating block reason - preserve claim metadata
  db.prepare(`
    UPDATE tasks_current SET
      block_reason = ?,
      updated_at = ?,
      last_event_id = ?
    WHERE task_id = ?
  `).run(data.reason || null, event.timestamp, event.rowid, event.task_id);
}
```

### Phase 2: CLI Changes

**File:** `packages/hzl-cli/src/commands/task/add.ts`

**2.1 Add new flags**

```typescript
.option('-s, --status <status>', 'Initial status (backlog, ready, in_progress, blocked, done)')
.option('--assignee <name>', 'Who to assign the task to (for -s in_progress)')
.option('--reason <reason>', 'Block reason (required with -s blocked)')
```

**2.2 Validation**

```typescript
// Validate status
if (opts.status) {
  const status = opts.status.toLowerCase();
  const validStatuses = ['backlog', 'ready', 'in_progress', 'blocked', 'done'];

  if (!validStatuses.includes(status)) {
    throw new CLIError(`Invalid status: ${opts.status}. Valid: ${validStatuses.join(', ')}`, ExitCode.InvalidInput);
  }

  if (status === 'archived') {
    throw new CLIError('Cannot create task as archived. Use -s done, then archive separately.', ExitCode.InvalidInput);
  }

  if (status === 'blocked' && !opts.reason) {
    throw new CLIError('Blocked status requires --reason flag.\nHint: hzl task add "..." -s blocked --reason "why"', ExitCode.InvalidInput);
  }

  if (opts.reason && status !== 'blocked') {
    throw new CLIError('--reason only valid with -s blocked', ExitCode.InvalidInput);
  }
}
```

**File:** `packages/hzl-cli/src/commands/task/claim.ts`

**2.3 Rename `--author` to `--assignee`**

```typescript
// OLD
.option('--author <name>', 'Author name (human identifier)')

// NEW
.option('--assignee <name>', 'Who to assign the task to')
```

Update internal usage from `opts.author` to `opts.assignee`.

### Phase 3: Error Message Improvements

Update error messages to include task ID and inline hints:

**File:** `packages/hzl-cli/src/commands/task/claim.ts`

```typescript
// When task not claimable
throw new CLIError(
  `Task ${taskId} is not claimable (status: ${task.status})\nHint: hzl task set-status ${taskId} ready`,
  ExitCode.InvalidInput
);
```

**File:** `packages/hzl-cli/src/commands/task/block.ts`

```typescript
// When task not blockable
throw new CLIError(
  `Cannot block task ${taskId} (status: ${task.status})\nHint: hzl task claim ${taskId} --assignee <name>`,
  ExitCode.InvalidInput
);
```

**File:** `packages/hzl-cli/src/commands/task/complete.ts`

```typescript
// When task not completable
throw new CLIError(
  `Cannot complete task ${taskId} (status: ${task.status})\nHint: Claim the task first to start working on it`,
  ExitCode.InvalidInput
);
```

### Phase 4: Documentation Updates

**File:** `docs/snippets/agent-policy.md`

Add after "Workflow:" section:

```markdown
**Task lifecycle:**
- New tasks start in `backlog` (not claimable)
- To work: `set-status <id> ready` → `claim <id>` → work → `complete <id>`
- Or create ready: `hzl task add "..." -P project -s ready`

**Quick commands:**
| Action | Command |
|--------|---------|
| Create (ready to work) | `hzl task add "title" -P project -s ready` |
| Create (planning) | `hzl task add "title" -P project` |
| Claim | `hzl task claim <id> --assignee <name>` |
| Complete | `hzl task complete <id>` |
```

**File:** `skills/hzl/SKILL.md` and `docs/openclaw/skills/hzl/SKILL.md`

Add task status definitions, workflow rules, and troubleshooting table.

---

## Files to Change

| File | Change |
|------|--------|
| `packages/hzl-core/src/services/task-service.ts` | Extend CreateTaskInput, update createTask(), fix blockTask() |
| `packages/hzl-core/src/projections/tasks-current.ts` | Add blocked→blocked branch |
| `packages/hzl-cli/src/commands/task/add.ts` | Add `-s`, `--assignee`, `--reason` flags |
| `packages/hzl-cli/src/commands/task/claim.ts` | Rename `--author` to `--assignee`, improve error |
| `packages/hzl-cli/src/commands/task/block.ts` | Improve error message |
| `packages/hzl-cli/src/commands/task/complete.ts` | Improve error message |
| `skills/hzl/SKILL.md` | Add lifecycle, troubleshooting |
| `docs/openclaw/skills/hzl/SKILL.md` | Fix description, add content |
| `docs/snippets/agent-policy.md` | Add lifecycle, quick commands |

---

## Test Requirements

```typescript
// claim --assignee works
it('--assignee sets task assignee', () => {
  const task = runClaim({ taskId: 'abc', assignee: 'agent-1', ... });
  expect(task.assignee).toBe('agent-1');
});

// add -s in_progress --assignee works
it('creates task and assigns to specified user', () => {
  const task = runAdd({
    title: 'Test',
    project: 'inbox',
    status: 'in_progress',
    assignee: 'agent-1',
    ...
  });
  expect(task.status).toBe('in_progress');
  expect(task.assignee).toBe('agent-1');
});

// blocked → blocked preserves claimed_at
it('preserves claimed_at when updating block reason', () => {
  const task = taskService.createTask({ title: 'Test', project: 'inbox' });
  taskService.setStatus(task.task_id, TaskStatus.Ready);
  taskService.claimTask(task.task_id, { author: 'agent-1' });
  taskService.blockTask(task.task_id, { reason: 'First reason' });

  const originalClaimedAt = taskService.getTaskById(task.task_id)!.claimed_at;

  taskService.blockTask(task.task_id, { reason: 'Updated reason' });
  const updated = taskService.getTaskById(task.task_id);

  expect(updated!.block_reason).toBe('Updated reason');
  expect(updated!.claimed_at).toBe(originalClaimedAt);  // MUST preserve
});

// Error messages include hints
it('includes hint in claim error', () => {
  const task = runAdd({ title: 'Test', project: 'inbox', ... });
  // Task is in backlog
  expect(() => runClaim({ taskId: task.task_id, ... }))
    .toThrow(/Hint:.*set-status/);
});
```

---

## Acceptance Criteria

- [x] `hzl task add "..." -s ready` creates task in ready status
- [x] `hzl task add "..." -s in_progress --assignee X` creates claimed task
- [x] `hzl task add "..." -s blocked --reason "..."` creates blocked task
- [x] `hzl task claim <id> --assignee X` works (replaces `--author`)
- [x] `hzl task block <id> --reason "new"` updates existing blocked task
- [x] Error messages include task ID and actionable hints
- [x] Event sourcing integrity maintained (two events for non-backlog creation)
- [x] `blocked → blocked` preserves `claimed_at`

---

## References

- Design spec: `docs/plans/2026-02-03-workflow-discoverability-design.md`
- Event sourcing patterns: `docs/solutions/best-practices/event-sourcing-bypass-in-stealtask-hzl-core-20260201.md`
- Projection metadata: `docs/solutions/logic-errors/projection-claim-metadata-loss.md`
