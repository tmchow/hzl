# Core Hardening: 8 Fixes

Date: 2026-02-28

Eight independent fixes addressing the weakest parts of the system, identified via deep codebase audit. Each fix is a separate PR, all parallelizable.

---

## Fix 1: Event Schema Evolution (Upcasters)

**Problem:** No event versioning. Adding a required field to any event schema breaks replay of existing databases. The only backward-compat strategy is ad-hoc (`assignee`/`agent` dual-field).

**Files changed:**
- `packages/hzl-core/src/events/types.ts` — add `CURRENT_SCHEMA_VERSION` constant
- `packages/hzl-core/src/events/store.ts` — stamp `schema_version` on write, run upcasters on read
- `packages/hzl-core/src/events/upcasters.ts` — new file: `EventUpcaster` interface and `UpcasterRegistry`
- `packages/hzl-core/src/db/schema.ts` — add `schema_version` column to events table
- `packages/hzl-core/src/db/migrations/index.ts` — migration to add column with default `1`

**Design:**

1. Add `schema_version INTEGER NOT NULL DEFAULT 1` column to `events` table via migration.

2. `CURRENT_SCHEMA_VERSION = 1` constant in `types.ts`. Bumped whenever any event schema changes.

3. New `EventUpcaster` interface:
   ```typescript
   interface EventUpcaster {
     eventType: EventType;
     fromVersion: number;
     toVersion: number;
     up(data: Record<string, unknown>): Record<string, unknown>;
   }
   ```

4. `UpcasterRegistry` — an ordered list of upcasters. Given an event with `schema_version=N` and current version `M`, applies all upcasters from N→N+1→...→M in sequence.

5. Integration point: `EventStore.rowToEnvelope()` runs `registry.upcast(type, version, data)` before returning. All consumers (projectors, rebuild, web API) get current-shape events transparently.

6. `EventStore.append()` stamps `CURRENT_SCHEMA_VERSION` on every new event. `validateEventData()` continues to validate against the current schema only.

7. No existing events break — version 1 is the current shape. No upcasters are registered yet. The infrastructure is ready for the first real schema change.

**Tests:**
- Unit test `UpcasterRegistry` with a mock upcaster chain (v1→v2→v3)
- Integration test: insert a v1 event with old shape, verify `getByTaskId` returns current shape
- Test that `append` stamps current version
- Test that unknown versions (future events from a newer HZL) pass through unchanged with a warning

**Branch:** `feat/event-schema-versioning`

---

## Fix 3: Cross-DB Pruning Atomicity

**Problem:** `pruneEligible` wraps events deletion in a transaction on `eventsDb`, but projection deletions target `cacheDb` separately. Crash between the two leaves inconsistent state. Trigger drop/recreate also happens outside the transaction.

**Files changed:**
- `packages/hzl-core/src/services/task-service.ts` — rewrite `pruneEligible`, `deleteTasksFromEvents`, `deleteTasksFromProjections`

**Design:**

1. Use `ATTACH DATABASE` to bring both databases under one connection for the prune operation:
   ```sql
   ATTACH DATABASE '/path/to/events.db' AS events_src;
   BEGIN IMMEDIATE;
   -- drop triggers on events_src.events
   -- delete from events_src.events
   -- delete from all projection tables (main db)
   -- recreate triggers on events_src.events
   COMMIT;
   DETACH DATABASE events_src;
   ```

2. The `cacheDb` connection runs the transaction. Events DB is attached temporarily. All trigger manipulation happens inside the transaction — DDL is transactional in SQLite.

3. For single-DB setups (tests with in-memory DBs, combined DB mode): detect `eventsDb === db` or `eventsDb` is undefined, use the existing single-transaction path. No behavioral change for tests.

4. For the case where `eventsDb` path is unavailable (e.g., in-memory events DB that can't be attached), fall back to a **prune journal**:
   - Write a `prune-journal.json` file listing task IDs before starting
   - Delete events, delete projections
   - Delete the journal file on success
   - On next startup, if journal exists, complete the incomplete prune (delete any remaining projection rows for those task IDs)

**Tests:**
- Test that pruning with split DBs removes from both atomically
- Test crash recovery: simulate journal-based fallback by interrupting between deletes
- Existing prune tests continue to pass (single-DB path unchanged)

**Branch:** `feat/atomic-pruning`

---

## Fix 4: `setStatus` State Machine Enforcement

**Problem:** `setStatus()` accepts any status transition without validation. `done→backlog`, `archived→in_progress` — all allowed. The specific methods guard transitions, but `setStatus` is a bypass.

**Files changed:**
- `packages/hzl-core/src/services/task-service.ts` — add transition matrix and validation in `setStatus()`

**Design:**

1. Add a `VALID_TRANSITIONS` constant:
   ```typescript
   const VALID_TRANSITIONS: Record<TaskStatus, Set<TaskStatus>> = {
     [TaskStatus.Backlog]:    new Set([TaskStatus.Ready, TaskStatus.Archived]),
     [TaskStatus.Ready]:      new Set([TaskStatus.Backlog, TaskStatus.InProgress, TaskStatus.Archived]),
     [TaskStatus.InProgress]: new Set([TaskStatus.Ready, TaskStatus.InProgress, TaskStatus.Blocked, TaskStatus.Done, TaskStatus.Archived]),
     [TaskStatus.Blocked]:    new Set([TaskStatus.InProgress, TaskStatus.Blocked, TaskStatus.Done, TaskStatus.Archived]),
     [TaskStatus.Done]:       new Set([TaskStatus.Ready]),
     [TaskStatus.Archived]:   new Set([]),  // must use reopenTask
   };
   ```

2. `setStatus()` checks `VALID_TRANSITIONS[task.status].has(toStatus)` before appending the event. Throws `InvalidStatusTransitionError` on invalid transitions.

3. Individual methods (`claimTask`, `completeTask`, etc.) keep their own guards — they add semantic validation (agent ownership, dependency checks). `setStatus` adds structural validation.

4. Export `VALID_TRANSITIONS` for use in tests and documentation.

**Tests:**
- Test every valid transition succeeds
- Test every invalid transition throws `InvalidStatusTransitionError`
- Property-based test: add `setStatus` with random statuses to the action generator, verify only valid transitions succeed

**Branch:** `feat/status-transition-matrix`

---

## Fix 5: Defensive Field Whitelist in Projector

**Problem:** `TasksCurrentProjector.handleTaskUpdated()` interpolates `data.field` directly into SQL. Upstream Zod validates, but the projector has no defense-in-depth guard.

**Files changed:**
- `packages/hzl-core/src/projections/tasks-current.ts`

**Design:**

1. Add a `SAFE_COLUMNS` set of actual column names in `tasks_current`:
   ```typescript
   const SAFE_COLUMNS = new Set([
     'title', 'description', 'links', 'tags',
     'priority', 'due_at', 'metadata', 'parent_id', 'agent',
   ]);
   ```

2. In `handleTaskUpdated`, after mapping `assignee→agent`, check `if (!SAFE_COLUMNS.has(field)) return;`. Return silently — the event is already persisted, throwing would break replay.

3. ~5 lines of code.

**Tests:**
- Test that a `TaskUpdated` event with an invalid field name is silently skipped
- Test that valid field updates still work

**Branch:** `feat/projector-field-whitelist`

---

## Fix 6: Replace Busy-Wait Spin Loop

**Problem:** `transaction.ts` burns CPU in `while (Date.now() - start < sleepTime) {}` for SQLITE_BUSY backoff.

**Files changed:**
- `packages/hzl-core/src/db/transaction.ts`

**Design:**

1. Replace the spin loop with `Atomics.wait()`:
   ```typescript
   const sleepTime = busySleepMs * attempt;
   Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sleepTime);
   ```

2. This blocks the thread without spinning, yielding the CPU. Works in Node.js without flags.

3. The `sleepTime` calculation (exponential backoff) and retry logic stay identical.

**Tests:**
- Existing transaction tests continue to pass
- Verify the sleep actually pauses (timing test: measure elapsed time)

**Branch:** `feat/atomics-wait-backoff`

---

## Fix 7: Prepared Statement Caching in Projectors

**Problem:** All 6 projectors call `db.prepare()` on every event application. During rebuild of thousands of events, this means tens of thousands of redundant prepare calls.

**Files changed:**
- `packages/hzl-core/src/projections/tasks-current.ts`
- `packages/hzl-core/src/projections/dependencies.ts`
- `packages/hzl-core/src/projections/tags.ts`
- `packages/hzl-core/src/projections/search.ts`
- `packages/hzl-core/src/projections/comments-checkpoints.ts`
- `packages/hzl-core/src/projections/projects.ts`

**Design:**

1. Add a statement cache to each projector. Since `db` is passed per-call (not in constructor), cache must handle DB reference changes (rebuild creates a fresh DB):
   ```typescript
   private cachedDb: Database.Database | null = null;
   private stmts: Record<string, Database.Statement> = {};

   private stmt(db: Database.Database, key: string, sql: string): Database.Statement {
     if (db !== this.cachedDb) {
       this.stmts = {};
       this.cachedDb = db;
     }
     if (!this.stmts[key]) {
       this.stmts[key] = db.prepare(sql);
     }
     return this.stmts[key];
   }
   ```

2. Replace all `db.prepare(...)` calls with `this.stmt(db, 'key', ...)` calls. Each unique SQL string gets a descriptive key.

3. Special case: `TasksCurrentProjector.handleTaskUpdated` uses dynamic SQL (the `${field}` interpolation). For this one, the cache key includes the field name: `this.stmt(db, \`update_${field}\`, ...)`.

4. Mechanical change — no logic changes, just wrapping.

**Tests:**
- Rebuild equivalence tests continue to pass (correctness unchanged)
- Optional: benchmark test comparing rebuild time before/after (informational, not gating)

**Branch:** `feat/projector-stmt-cache`

---

## Fix 8: Workflow Service Test Coverage

**Problem:** 259 lines of tests covering 940 lines of source (0.28x ratio). Delegate rollback paths, resume policies, and filtering options are entirely untested.

**Files changed:**
- `packages/hzl-core/src/services/workflow-service.test.ts` — expand significantly

**Design — tests to add:**

### `start` workflow:
- Tag filtering: create tasks with/without tags, verify only matching tasks are returned
- Project filtering: tasks in different projects, verify scope
- Lease setting: verify `lease_until` is set on claimed task
- Resume policies: `first` (oldest claimed_at), `latest` (newest claimed_at), `priority` (highest priority first)
- `include_others: false`: verify others array is empty
- `others_limit`: verify truncation

### `handoff` workflow:
- With `auto_op_id`: verify idempotent replay returns cached result
- Across projects: source in project A, follow-on in project B
- Rollback on complete failure: verify follow-on is archived when source completion fails
- Rollback on checkpoint failure: verify cleanup

### `delegate` workflow:
- Without pausing parent: `pause_parent: false`, verify parent stays in_progress
- With `auto_op_id`: idempotent replay
- Rollback: dependency added then checkpoint fails → verify dependency removed and delegated task archived
- Rollback: all 3 catch blocks exercised via mock/spy on taskService methods
- Parent already blocked: delegate with `pause_parent: true` when parent is blocked, verify no double-block

### Edge cases:
- Concurrent claim race in `start`: two agents call start simultaneously, verify no double-claim (may need real concurrency test or mock)

**No production code changes.** Tests only.

**Branch:** `feat/workflow-service-tests`

---

## Fix 10: Route `task update` Through TaskService

**Problem:** `update.ts` bypasses `TaskService` and calls `eventStore.append()` + `projectionEngine.applyEvent()` directly. Every other command goes through the service layer.

**Files changed:**
- `packages/hzl-core/src/services/task-service.ts` — add `updateTask()` method
- `packages/hzl-cli/src/commands/task/update.ts` — call `taskService.updateTask()` instead of raw event/projection calls

**Design:**

1. Add `TaskService.updateTask(taskId, updates, ctx?)` method:
   ```typescript
   updateTask(taskId: string, updates: TaskUpdates, ctx?: EventContext): Task {
     return withWriteTransaction(this.db, () => {
       const task = this.getTaskById(taskId);
       if (!task) throw new TaskNotFoundError(taskId);

       // Emit one TaskUpdated event per changed field
       for (const [field, newValue] of Object.entries(updates)) {
         if (newValue === undefined) continue;
         const oldValue = task[field];
         // Skip if unchanged (for non-array fields)
         // ... emit event, apply projection
       }

       return this.getTaskById(taskId)!;
     });
   }
   ```

2. The `TaskUpdates` type moves to `task-service.ts` (or is re-exported).

3. `update.ts` simplifies to:
   ```typescript
   const updatedTask = services.taskService.updateTask(taskId, updates, { author });
   ```

4. The `setParent` call stays separate (it already goes through the service layer).

**Tests:**
- Add `updateTask` unit tests in `task-service.test.ts`
- Existing `update.test.ts` CLI tests continue to pass

**Branch:** `feat/update-through-service`

---

## Execution Strategy

All 8 fixes are independent — different files, no conflicts. Run as **8 parallel subagents in isolated worktrees**, each producing a branch. Review results, then create PRs.

| Fix | Size | Risk |
|-----|------|------|
| #5 field whitelist | tiny | low |
| #6 spin loop | tiny | low |
| #4 status matrix | small | low |
| #10 update service | small-medium | low |
| #7 stmt caching | medium | low (mechanical) |
| #8 workflow tests | medium | none (tests only) |
| #1 event versioning | large | medium (new infra) |
| #3 atomic pruning | medium-large | medium (DB changes) |
