# Permissive Status Transitions

## Problem

The `VALID_TRANSITIONS` matrix added in #152 enforces a rigid state machine on `setStatus()`. This creates friction for agents and users who have legitimate reasons to skip steps (e.g., marking a backlog item as done because it was resolved elsewhere). HZL is a coordination ledger, not a workflow enforcer — it should record state faithfully and let agents decide.

## Design

### Principle

Enforce only data-integrity invariants, not workflow preferences. The only true invariant is that `archived` is terminal (archived tasks may be pruned or excluded from projections).

### Changes

**`setStatus()` — replace matrix with single guard**
- Block transitions *out of* `archived` (throw `InvalidStatusTransitionError`)
- No-op on self-transitions: return the current task without appending an event
- Allow all other transitions

**`claimTask()` — remove dependency check, loosen status check**
- Remove `DependenciesNotDoneError` check (if an agent explicitly claims a task, trust them)
- Allow claiming from any non-archived, non-done status (not just `ready`)
- Keep the semantic behavior: sets status to `in_progress`, assigns agent

**`claimNext()` — no change**
- Still filters by `ready` status and incomplete dependencies in SQL
- This is selection help (pick the best candidate), not enforcement

**Specialized methods — no change**
- `completeTask()`, `releaseTask()`, `blockTask()`, `unblockTask()`, `reopenTask()`, `archiveTask()` keep their precondition checks
- Their guards are about what the operation *means* (set progress to 100, clear assignee), not workflow enforcement

**Remove `VALID_TRANSITIONS` export**
- No longer needed. Remove the constant and its type.

### Tests

- Replace matrix test block with: "allows any transition except from archived" and "no-ops on self-transition"
- Remove "throws if task has incomplete dependencies" from `claimTask` tests
- Update `claimTask` tests: claiming from `backlog`, `in_progress`, `blocked` all succeed
- Update property-based invariant tests to reflect permissive model
