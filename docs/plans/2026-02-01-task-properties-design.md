# Task Properties: Assignee, Progress, and Blocked Status

**Date:** 2026-02-01
**Status:** Ready for Implementation

## Overview

This design adds three changes to HZL task properties to improve agent coordination:

1. **Assignee** - Refactor `claimed_by_author`/`claimed_by_agent_id` into a single `assignee` field that persists across status changes
2. **Progress** - Add 0-100 progress percentage, settable via checkpoint or standalone
3. **Blocked status** - Add `blocked` to TaskStatus enum for tasks stuck on external dependencies

All changes ship together with automatic migration via projection rebuild.

---

## 1. Assignee

### Problem

Current `claimed_by_author` and `claimed_by_agent_id` fields:
- Only set when status transitions to `in_progress`
- Cleared when status leaves `in_progress`
- Cannot be set at task creation (no pre-assignment)
- Two fields for essentially one concept

This prevents orchestrators from pre-assigning tasks during planning, and loses history of who worked on completed tasks.

### Solution

Replace with single `assignee` field:

| Aspect | Current | New |
|--------|---------|-----|
| Fields | `claimed_by_author`, `claimed_by_agent_id` | `assignee` |
| Set at creation | No | Yes: `--assignee agent-x` |
| Set on claim | Yes (implicit) | Optional: `--assignee agent-x` or `-a agent-x` |
| Cleared on complete | Yes | No - persists |

### Behavior

- **At creation:** Optional `--assignee <id>` pre-assigns the task
- **On claim:** Optional `--assignee <id>` sets assignee; if omitted, preserves pre-assignment or stays NULL
- **On complete:** Assignee persists - shows who finished the task
- **Reassignment:** `hzl task update <id> --assignee <new-id>`

**Assignee resolution on claim:**

| Pre-assigned | Claim with `--assignee` | Result |
|--------------|------------------------|--------|
| `agent-x` | (none) | `agent-x` (preserved) |
| `agent-x` | `--assignee agent-y` | `agent-y` (overwritten) |
| NULL | (none) | NULL |
| NULL | `--assignee agent-x` | `agent-x` |

### CLI Changes

```bash
# Pre-assign at creation
hzl task add "Implement auth" -P myproject --assignee agent-frontend

# Claim with identity (optional)
hzl task claim abc123 --assignee agent-frontend
hzl task claim abc123 -a agent-frontend  # shorthand
hzl task claim abc123                     # anonymous claim, preserves pre-assignment

# Get next task (prioritizes assigned to me, then unassigned)
hzl task next -P myproject --assignee agent-frontend

# List my assigned tasks
hzl task list --assignee agent-frontend
```

**`task next --assignee X` behavior:**
1. Returns tasks assigned to X first (in priority/creation order)
2. Then returns unassigned tasks
3. JSON output includes `was_preassigned: true/false` to indicate if task was pre-assigned to the caller

### Schema Changes

**tasks_current table:**
```sql
-- Remove
claimed_by_author TEXT
claimed_by_agent_id TEXT

-- Add
assignee TEXT
```

**TaskCreatedData (events/types.ts):**
```typescript
const TaskCreatedSchema = z.object({
  // ... existing fields
  assignee: z.string().max(FIELD_LIMITS.IDENTIFIER).optional(),
});
```

**UPDATABLE_TASK_FIELDS:**
```typescript
export const UPDATABLE_TASK_FIELDS = [
  // ... existing fields
  'assignee',
] as const;
```

### Projection Changes

**TasksCurrentProjector.handleStatusChanged:**
- When status → `in_progress`: set `assignee` from `event.author` only if `event.author` is provided; otherwise preserve existing `assignee`
- When status leaves `in_progress`: do NOT clear `assignee`

**Decision:** On claim, `--assignee` overwrites pre-assignment if provided. If omitted, pre-assignment is preserved. This supports both single-agent (anonymous) and multi-agent (identity-aware) workflows.

---

## 2. Progress

### Problem

For long-running tasks, there's no quantitative way to see how far along a task is. Checkpoints provide textual updates, but an orchestrator or human can't quickly see "this is 70% done."

### Solution

Add `progress` field (0-100 integer) to tasks.

### Behavior

- **Default:** `NULL` (unknown/not tracked)
- **Set via checkpoint:** `hzl task checkpoint <id> "message" --progress 50`
- **Set standalone:** `hzl task progress <id> 75`
- **Query:** `hzl task show <id>` displays progress if set

### CLI Changes

```bash
# Set progress with checkpoint message
hzl task checkpoint abc123 "Completed API integration" --progress 50

# Set progress standalone (no message required)
hzl task progress abc123 75

# View task with progress
hzl task show abc123
# Output includes: Progress: 75%
```

### Schema Changes

**tasks_current table:**
```sql
-- Add
progress INTEGER CHECK (progress >= 0 AND progress <= 100)
```

**CheckpointRecordedData (events/types.ts):**
```typescript
const CheckpointRecordedSchema = z.object({
  name: checkpointNameString,
  data: checkpointDataRecord.optional(),
  progress: z.number().int().min(0).max(100).optional(),  // NEW
});
```

**New event type for standalone progress:**

Option A: Reuse CheckpointRecorded with empty/auto-generated name
Option B: Add new `ProgressUpdated` event type

**Recommendation:** Option A - reuse CheckpointRecorded. A progress update is a type of checkpoint. The `name` field can be auto-generated like "Progress updated to 75%".

### Projection Changes

**TasksCurrentProjector:**
- Handle `CheckpointRecorded` events: if `progress` is present in event data, update `tasks_current.progress`

---

## 3. Blocked Status

### Problem

Tasks can get stuck waiting for external dependencies (human review, API credentials, deploy to complete). Currently, agents must:
- Keep task `in_progress` (misleading)
- Add a checkpoint explaining the block (unstructured)
- Other agents can't easily find blocked tasks

### Solution

Add `blocked` to TaskStatus enum.

### Status Transitions

```
                    ┌──────────┐
                    │ blocked  │
                    └────▲─┬───┘
                   block │ │ unblock
                         │ │
┌─────────┐  ready  ┌────┴─▼────┐  complete  ┌──────┐
│ backlog │────────►│in_progress│────────────►│ done │
└─────────┘         └───────────┘             └──────┘
```

Valid transitions:
- `in_progress` → `blocked` (task is stuck)
- `blocked` → `in_progress` (resume work)
- `blocked` → `ready` (release for others to pick up)

### Behavior

- **Block:** Agent marks task blocked, optionally adds comment explaining why
- **Unblock:** Manual - agent or human explicitly unblocks
- **No auto-unblock:** Keeps event sourcing simple, avoids complex edge cases (see design discussion)

### Relationship to depends_on

- `depends_on` = pre-start gate ("can't start until X is done")
- `blocked` status = mid-execution pause ("started but stuck")
- `depends_on` is editable anytime - if blocked by another task, add dependency then mark blocked
- When blocking task completes, someone manually unblocks

### CLI Changes

```bash
# Block a task
hzl task block abc123 "Waiting for DevOps to provision API keys"

# Unblock a task (returns to in_progress)
hzl task unblock abc123

# Unblock and release (returns to ready)
hzl task unblock abc123 --release

# List blocked tasks
hzl task list --status blocked
```

### Schema Changes

**TaskStatus enum (events/types.ts):**
```typescript
export enum TaskStatus {
  Backlog = 'backlog',
  Ready = 'ready',
  InProgress = 'in_progress',
  Blocked = 'blocked',  // NEW
  Done = 'done',
  Archived = 'archived',
}
```

### Projection Changes

**TasksCurrentProjector.handleStatusChanged:**
- Handle `blocked` status like other statuses
- When transitioning to `blocked`: preserve `assignee` and `claimed_at`, clear `lease_until` (lease is meaningless while blocked)
- When transitioning from `blocked` to `in_progress`: agent should re-claim with new lease if desired

---

## 4. Migration

### Approach

Automatic projection rebuild on schema version mismatch.

### Why Projection Rebuild

HZL is event-sourced:
- `events.db` = immutable source of truth
- `cache.db` = derived projections (tasks_current, dependencies, etc.)

Projections can be rebuilt from events at any time. This is the cleanest migration path.

### Implementation

**Schema version tracking (use existing `hzl_local_meta` table):**
```sql
-- Already exists in cache.db
CREATE TABLE IF NOT EXISTS hzl_local_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Store: key='schema_version', value='2'
```

**Migration flow (on any CLI command):**

```
1. Open databases
2. Check hzl_local_meta.schema_version in cache.db
3. If version < CURRENT_SCHEMA_VERSION:
   a. Log "Upgrading database schema (v{old} → v{new})..."
   b. Drop all projection tables
   c. Run schema creation (new tables with new columns)
   d. Replay all events from events.db
   e. Update hzl_local_meta.schema_version
   f. Log "Schema upgrade complete."
4. Proceed with command
```

**Version history:**
- v1: Original schema
- v2: Add `assignee`, `progress`, `blocked` status support

### Event Compatibility

Events don't change format. The projection logic changes how events are interpreted:

| Event | Old Projection | New Projection |
|-------|---------------|----------------|
| StatusChanged (to in_progress) | Sets `claimed_by_author`, `claimed_by_agent_id` | Sets `assignee` from `event.author` |
| StatusChanged (from in_progress) | Clears `claimed_by_*` | Preserves `assignee` |
| CheckpointRecorded | Ignores progress | Updates `progress` if present |
| StatusChanged (to blocked) | N/A (invalid status) | Sets status to `blocked` |

Old events without `progress` in CheckpointRecorded → `progress` stays NULL. This is correct.

### Rollback

If needed, users can:
1. Downgrade CLI to previous version
2. Delete `cache.db`
3. Old CLI recreates projections with old schema

Events are preserved. No data loss.

---

## 5. Summary of Changes

### New/Changed Files

**hzl-core:**
- `src/events/types.ts` - Add `Blocked` status, `assignee` to TaskCreatedData, `progress` to CheckpointRecordedData
- `src/projections/tasks-current.ts` - Handle assignee persistence, progress updates, blocked status
- `src/services/task-service.ts` - Add `blockTask()`, `unblockTask()`, `setProgress()` methods
- `src/db/schema.ts` - Add `assignee` column, `progress` column, `blocked` to CHECK constraint
- `src/db/migrations.ts` - Schema version check and rebuild logic using `hzl_local_meta`

**hzl-cli:**
- `src/commands/task/add.ts` - Add `--assignee` / `-a` option
- `src/commands/task/claim.ts` - Replace `--author`/`--agent` with `--assignee` / `-a` (optional)
- `src/commands/task/next.ts` - Add `--assignee` / `-a` option, filter and prioritize by assignee
- `src/commands/task/block.ts` - New command
- `src/commands/task/unblock.ts` - New command
- `src/commands/task/progress.ts` - New command
- `src/commands/task/checkpoint.ts` - Add `--progress` option
- `src/commands/task/list.ts` - Add `--assignee` filter

### Breaking Changes

- `--author` flag replaced with `--assignee` / `-a` on claim (now optional)
- `--agent` flag removed (use `--assignee`)
- `claimed_by_author`, `claimed_by_agent_id` columns removed from tasks_current (replaced with `assignee`)

Migration is automatic - no user action required.

---

## 6. Design Decisions

### Why single `assignee` instead of `claimed_by_*` + separate `assignee`?

Having both would be redundant. When an agent claims, they'd set both fields to themselves. One field with clear semantics ("who's responsible") is simpler.

### Why not auto-unblock when blocking task completes?

This would be the first "reactive" behavior in HZL. Considered edge cases:
- Task C completes → A auto-unblocks → A resumes → C regresses → ???
- Should A re-block? What if A is now done?

Manual unblock keeps event sourcing pure (all state changes are explicit events) and avoids complex cascading logic.

### Why `--assignee` instead of `--as` or `--author`?

`--assignee` matches the field name and works consistently across all commands (add, claim, next, list). The shorthand `-a` provides brevity for frequent use. The `author` field on EventEnvelope remains for audit trail.

### Why is `--assignee` optional on claim?

Anonymous claiming supports single-agent workflows (e.g., one orchestrator like OpenClaw) where passing identity on every claim is unnecessary overhead. Pre-assignment is preserved if `--assignee` is omitted, so planning still works.

For multi-agent coordination, agents should pass `--assignee` to identify themselves.

### Why reuse CheckpointRecorded for progress updates?

A progress update is conceptually a checkpoint - "I'm now at 75%". Adding a separate event type adds complexity without benefit. The checkpoint `name` can be auto-generated for standalone progress updates.

### Why no `--blocked` shorthand?

`--status blocked` is sufficient and consistent with other status filtering. Adding shorthand flags for specific statuses creates inconsistency.

---

## 7. Implementation Notes

### Migration Safety

Based on code review, address these concerns:

1. **Use existing `hzl_local_meta` table** for schema version tracking (not a new `schema_meta` table)

2. **Wrap projection rebuild in a transaction** to prevent corruption if interrupted mid-rebuild

3. **Document `author`/`agent_id` → `assignee` mapping:**
   - If `event.author` exists, use it as `assignee`
   - `agent_id` is discarded (was redundant)
   - Historical tasks claimed with both fields: `author` wins

4. **Forward compatibility limitation:** If `blocked` status is used, rolling back to a pre-v2 CLI will fail on projection rebuild (old CLI doesn't know `blocked` status). Document this limitation.

5. **Defer assignee index:** Add later if performance warrants - premature optimization for local SQLite database.

### Lease Handling When Blocked

When task transitions to `blocked`:
- Preserve `assignee`
- Clear `lease_until` (lease becomes meaningless while blocked)
- Preserve `claimed_at` (for history)

When task transitions from `blocked` to `in_progress`:
- Agent should re-claim with new lease if desired

---

## 8. Resolved Questions

1. **Should `--assignee` be required on claim?** No - optional to support single-agent workflows. Pre-assignment is preserved if omitted.

2. **What should `task next --assignee X` return if no tasks assigned to X?** Returns assigned-to-X first, then unassigned tasks.

3. **Should progress auto-set to 100 when task is completed?** No - keep progress orthogonal. Agent sets explicitly if desired.

4. **Should blocked tasks show differently in `task list` output?** No special indicator needed - `status: blocked` is sufficient.
