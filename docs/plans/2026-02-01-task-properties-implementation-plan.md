# Implementation Plan: Task Properties (Assignee, Progress, Blocked)

**Date:** 2026-02-01
**Design Doc:** [2026-02-01-task-properties-design.md](./2026-02-01-task-properties-design.md)
**Type:** feat
**Status:** Reviewed - Ready for Implementation

## Overview

Implement three task property changes from the design doc:
1. **Assignee** - Replace `claimed_by_author`/`claimed_by_agent_id` with single `assignee` field
2. **Progress** - Add 0-100 progress percentage
3. **Blocked status** - Add `blocked` to TaskStatus enum

All changes ship together with automatic migration via projection rebuild.

---

## Phase 1: Core Type & Schema Changes

**Goal:** Update event types, schemas, and interfaces - the foundation for everything else.

### 1.1 Event Types (`packages/hzl-core/src/events/types.ts`)

- [ ] Add `Blocked = 'blocked'` to `TaskStatus` enum (line 18-24)
- [ ] Add `assignee` field to `TaskCreatedSchema` (line 121-132):
  ```typescript
  assignee: z.string().max(FIELD_LIMITS.IDENTIFIER).optional(),
  ```
- [ ] Add `progress` field to `CheckpointRecordedSchema` (line 207-210):
  ```typescript
  progress: z.number().int().min(0).max(100).optional(),
  ```
- [ ] Add `'assignee'` to `UPDATABLE_TASK_FIELDS` array (line 155-164)
- [ ] Add `assigneeString` validator with `updatableFieldValidators` entry

### 1.2 Cache Schema (`packages/hzl-core/src/db/schema.ts`)

- [ ] Add `blocked` to status CHECK constraint (line 79):
  ```sql
  CHECK (status IN ('backlog','ready','in_progress','blocked','done','archived'))
  ```
- [ ] Remove `claimed_by_author TEXT` column (line 88)
- [ ] Remove `claimed_by_agent_id TEXT` column (line 89)
- [ ] Add `assignee TEXT` column
- [ ] Add `progress INTEGER CHECK (progress >= 0 AND progress <= 100)` column
- [ ] **Defer** assignee index (add later if performance warrants)

### 1.3 Task Interface (`packages/hzl-core/src/services/task-service.ts`)

- [ ] Update `Task` interface (line 116-134):
  - Remove `claimed_by_author: string | null`
  - Remove `claimed_by_agent_id: string | null`
  - Add `assignee: string | null`
  - Add `progress: number | null`
- [ ] Update `TaskRow` type to match (line 136-154)
- [ ] Update `CreateTaskInput` interface - add `assignee?: string` (line 15-26)
- [ ] Update `ClaimNextOptions` interface - add `assignee?: string` (line 40-46)
- [ ] Update `StuckTask` interface - replace `claimed_by_*` with `assignee` (line 61-69)
- [ ] Update `rowToTask()` function to map new fields

### 1.4 Tests for Phase 1

- [ ] `packages/hzl-core/src/events/types.test.ts`:
  - Test TaskCreated with assignee validates
  - Test CheckpointRecorded with progress validates (0, 50, 100)
  - Test CheckpointRecorded rejects progress < 0 or > 100
  - Test TaskStatus.Blocked is valid enum value

**Run:** `npm test -w hzl-core -- src/events/types.test.ts`

---

## Phase 2: Projection Changes

**Goal:** Update projection logic for assignee persistence, progress tracking, and blocked status.

> **Critical:** This phase MUST complete before schema version is bumped to avoid migration using old projection logic.

### 2.1 TasksCurrentProjector (`packages/hzl-core/src/projections/tasks-current.ts`)

- [ ] Update `handleTaskCreated()` to include `assignee` in INSERT (line 43-67):
  ```typescript
  INSERT INTO tasks_current (
    task_id, title, project, status, parent_id, description,
    links, tags, priority, due_at, metadata,
    assignee,  // NEW
    created_at, updated_at, last_event_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ```
  Pass `data.assignee ?? null`

- [ ] Update `handleStatusChanged()` (line 69-115):

  **When status → `in_progress`:**
  ```typescript
  if (toStatus === TaskStatus.InProgress) {
    // Set assignee from event.author OR event.agent_id (fallback for historical events)
    // If neither provided, preserve existing assignee
    const newAssignee = event.author || event.agent_id || null;
    db.prepare(`
      UPDATE tasks_current SET
        status = ?,
        claimed_at = ?,
        assignee = COALESCE(?, assignee),  -- Preserve if not provided
        lease_until = ?,
        updated_at = ?,
        last_event_id = ?
      WHERE task_id = ?
    `).run(toStatus, event.timestamp, newAssignee, data.lease_until ?? null, ...);
  }
  ```

  **When status → `blocked`:**
  ```typescript
  else if (toStatus === TaskStatus.Blocked) {
    // Preserve assignee, claimed_at; clear lease_until
    db.prepare(`
      UPDATE tasks_current SET
        status = ?,
        lease_until = NULL,  -- Clear lease (meaningless while blocked)
        updated_at = ?,
        last_event_id = ?
      WHERE task_id = ?
    `).run(toStatus, event.timestamp, event.rowid, event.task_id);
  }
  ```

  **When status leaves `in_progress` (to done, ready, etc.):**
  - **Do NOT clear assignee** - this is the key behavioral change
  - Remove old logic that clears `claimed_by_*` fields (line 94-105)

- [ ] Add `handleCheckpointRecorded()` method:
  ```typescript
  private handleCheckpointRecorded(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as CheckpointRecordedData;
    if (data.progress !== undefined) {
      db.prepare(`
        UPDATE tasks_current SET progress = ?, updated_at = ?, last_event_id = ?
        WHERE task_id = ?
      `).run(data.progress, event.timestamp, event.rowid, event.task_id);
    }
  }
  ```

- [ ] Add `EventType.CheckpointRecorded` to the `apply()` switch statement

### 2.2 Tests for Phase 2

- [ ] Test assignee persists when task completes (in_progress → done)
- [ ] Test assignee preserved on anonymous claim (no --assignee flag)
- [ ] Test assignee overwritten when claim includes --assignee
- [ ] Test historical events: author=null, agent_id="x" → assignee="x"
- [ ] Test historical events: author="x", agent_id="y" → assignee="x"
- [ ] Test progress updated via CheckpointRecorded event
- [ ] Test blocked status transitions (in_progress ↔ blocked)
- [ ] Test lease_until cleared when entering blocked
- [ ] Test assignee in handleTaskCreated INSERT

**Run:** `npm test -w hzl-core -- src/projections/tasks-current.test.ts`

---

## Phase 3: Migration Infrastructure

**Goal:** Implement schema versioning and automatic projection rebuild.

> **Note:** Schema version is bumped HERE, after Phase 2 projection changes are complete.

### 3.1 Migration Logic (`packages/hzl-core/src/db/datastore.ts`)

> **File path correction:** Use `datastore.ts`, not `index.ts` (which doesn't exist)

Add inline schema version check in `createDatastore()`:

```typescript
const CURRENT_SCHEMA_VERSION = 2;

function checkAndMigrateSchema(
  cacheDb: Database.Database,
  eventsDb: Database.Database,
  projectionEngine: ProjectionEngine
): void {
  // Get current version
  const row = cacheDb.prepare(
    "SELECT value FROM hzl_local_meta WHERE key = 'schema_version'"
  ).get() as { value: string } | undefined;
  const currentVersion = row ? parseInt(row.value, 10) : 1;

  if (currentVersion < CURRENT_SCHEMA_VERSION) {
    console.error(`Upgrading database schema (v${currentVersion} → v${CURRENT_SCHEMA_VERSION})...`);

    // Wrap entire rebuild in transaction for atomicity
    cacheDb.exec('BEGIN IMMEDIATE');
    try {
      // Drop all projection tables
      cacheDb.exec('DROP TABLE IF EXISTS tasks_current');
      cacheDb.exec('DROP TABLE IF EXISTS dependencies');
      cacheDb.exec('DROP TABLE IF EXISTS tags');
      cacheDb.exec('DROP TABLE IF EXISTS checkpoints');
      // ... other projection tables

      // Recreate with new schema
      cacheDb.exec(CACHE_SCHEMA);

      // Replay all events
      rebuildAllProjections(cacheDb, eventsDb, projectionEngine);

      // Update schema version
      cacheDb.prepare(
        "INSERT OR REPLACE INTO hzl_local_meta (key, value) VALUES ('schema_version', ?)"
      ).run(CURRENT_SCHEMA_VERSION.toString());

      cacheDb.exec('COMMIT');
      console.error('Schema upgrade complete.');
    } catch (e) {
      cacheDb.exec('ROLLBACK');
      throw e;
    }
  }
}
```

### 3.2 Integration Point

- [ ] Call `checkAndMigrateSchema()` in `createDatastore()` after opening databases

### 3.3 Tests for Phase 3

- [ ] Test schema version detection (null → 1, 1 → 2)
- [ ] Test projection rebuild preserves event data
- [ ] Test migration is transactional (simulate crash, verify rollback)
- [ ] Test fresh database gets version 2 without rebuild

**Run:** `npm test -w hzl-core -- src/db/`

---

## Phase 4: Service Layer

**Goal:** Add new service methods and update existing ones.

### 4.1 TaskService (`packages/hzl-core/src/services/task-service.ts`)

- [ ] Update `createTask()` to accept and pass `assignee` to event data

- [ ] Update `claimTask()` to set `assignee` from `opts.author` (line 338-369)

- [ ] Add status transition validation helper:
  ```typescript
  private readonly VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
    [TaskStatus.Backlog]: [TaskStatus.Ready, TaskStatus.Archived],
    [TaskStatus.Ready]: [TaskStatus.InProgress, TaskStatus.Backlog, TaskStatus.Archived],
    [TaskStatus.InProgress]: [TaskStatus.Done, TaskStatus.Ready, TaskStatus.Blocked, TaskStatus.Archived],
    [TaskStatus.Blocked]: [TaskStatus.InProgress, TaskStatus.Ready],
    [TaskStatus.Done]: [TaskStatus.Ready, TaskStatus.Archived],
    [TaskStatus.Archived]: [],
  };

  private validateTransition(from: TaskStatus, to: TaskStatus): void {
    if (!this.VALID_TRANSITIONS[from].includes(to)) {
      throw new Error(`Invalid transition: ${from} → ${to}`);
    }
  }
  ```

- [ ] Add `blockTask()` method:
  ```typescript
  blockTask(taskId: string, opts?: { reason?: string } & EventContext): Task {
    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);
      this.validateTransition(task.status, TaskStatus.Blocked);

      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.StatusChanged,
        data: { from: task.status, to: TaskStatus.Blocked, reason: opts?.reason },
        author: opts?.author,
      });
      this.projectionEngine.applyEvent(event);
      return this.getTaskById(taskId)!;
    });
  }
  ```

- [ ] Add `unblockTask()` method:
  ```typescript
  unblockTask(taskId: string, opts?: { release?: boolean } & EventContext): Task {
    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);
      const toStatus = opts?.release ? TaskStatus.Ready : TaskStatus.InProgress;
      this.validateTransition(task.status, toStatus);

      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.StatusChanged,
        data: { from: task.status, to: toStatus },
        author: opts?.author,
      });
      this.projectionEngine.applyEvent(event);
      return this.getTaskById(taskId)!;
    });
  }
  ```

- [ ] Add `setProgress()` method:
  ```typescript
  setProgress(taskId: string, progress: number, ctx?: EventContext): Task {
    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);
      if (progress < 0 || progress > 100) {
        throw new Error('Progress must be between 0 and 100');
      }
      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.CheckpointRecorded,
        data: { name: `Progress updated to ${progress}%`, progress },
        author: ctx?.author,
      });
      this.projectionEngine.applyEvent(event);
      return this.getTaskById(taskId)!;
    });
  }
  ```

- [ ] Update `listTasks()` to support `assignee` filter option

- [ ] Update `claimNext()` to prioritize tasks assigned to the caller:
  ```typescript
  // Order: assigned to caller first, then unassigned, then by priority/creation
  ```

- [ ] **Update `stealTask()`** (line 559-577) to use `assignee` instead of `claimed_by_*`:
  ```typescript
  // Replace direct UPDATE that uses claimed_by_author/claimed_by_agent_id
  // with assignee column
  ```

### 4.2 Tests for Phase 4

- [ ] Test `createTask()` with assignee
- [ ] Test `claimTask()` sets assignee
- [ ] Test `claimTask()` without assignee preserves pre-assignment
- [ ] Test `blockTask()` only works from in_progress
- [ ] Test `blockTask()` rejects invalid transitions (ready → blocked)
- [ ] Test `unblockTask()` returns to in_progress by default
- [ ] Test `unblockTask({ release: true })` returns to ready
- [ ] Test `setProgress()` bounds validation
- [ ] Test `listTasks({ assignee })` filtering
- [ ] Test `claimNext()` prioritizes assigned tasks
- [ ] Test `stealTask()` updates assignee correctly

**Run:** `npm test -w hzl-core -- src/services/task-service.test.ts`

---

## Phase 5: CLI Commands

**Goal:** Update existing commands and add new ones.

### 5.1 Update Existing Commands

**`packages/hzl-cli/src/commands/task/add.ts`:**
- [ ] Add `--assignee <id>` / `-a <id>` option
- [ ] Pass assignee to `createTask()`

**`packages/hzl-cli/src/commands/task/claim.ts`:**
- [ ] Replace `--author` with `--assignee` / `-a` (optional)
- [ ] Remove `--agent` option
- [ ] Update `ClaimResult` interface (remove `claimed_by_*`, add `assignee`)

**`packages/hzl-cli/src/commands/task/next.ts`:**
- [ ] Add `--assignee <id>` / `-a <id>` option
- [ ] Pass to `claimNext()` for filtering

**`packages/hzl-cli/src/commands/task/list.ts`:**
- [ ] Add `--assignee <id>` filter option
- [ ] Update output columns (remove `claimed_by_*`, add `assignee`)

**`packages/hzl-cli/src/commands/task/checkpoint.ts`:**
- [ ] Add `--progress <0-100>` option
- [ ] Pass progress to checkpoint event

### 5.2 New Commands

**`packages/hzl-cli/src/commands/task/block.ts`:**

Follow existing command patterns with proper structure:

```typescript
export interface BlockResult {
  task_id: string;
  title: string;
  status: string;
  assignee: string | null;
  reason: string | null;
}

interface BlockCommandOptions {
  // no additional options currently
}

export function runBlock(options: {
  services: Services;
  taskId: string;
  reason?: string;
  json: boolean;
}): BlockResult {
  const { services, taskId, reason, json } = options;
  const task = services.taskService.blockTask(taskId, { reason });

  const result: BlockResult = {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
    assignee: task.assignee,
    reason: reason ?? null,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Blocked task ${task.task_id}: ${task.title}`);
    if (reason) console.log(`  Reason: ${reason}`);
  }

  return result;
}

export function createBlockCommand(): Command {
  return new Command('block')
    .description('Block a task (mark as waiting for external dependency)')
    .argument('<taskId>', 'Task ID')
    .argument('[reason]', 'Reason for blocking')
    .action(function(this: Command, taskId: string, reason?: string) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runBlock({ services, taskId, reason, json: globalOpts.json ?? false });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
```

**`packages/hzl-cli/src/commands/task/unblock.ts`:**
- [ ] Follow same pattern as block.ts
- [ ] Add `--release` option
- [ ] Export `UnblockResult`, `runUnblock()`, `createUnblockCommand()`

**`packages/hzl-cli/src/commands/task/progress.ts`:**
- [ ] Follow same pattern
- [ ] Validate progress is integer 0-100 in CLI layer before calling service
- [ ] Export `ProgressResult`, `runProgress()`, `createProgressCommand()`

### 5.3 Register Commands

- [ ] Register new commands in `packages/hzl-cli/src/commands/task/index.ts`

### 5.4 Tests for Phase 5

- [ ] Test `add --assignee` pre-assigns task
- [ ] Test `claim --assignee` sets assignee
- [ ] Test `claim` without --assignee preserves pre-assignment
- [ ] Test `next --assignee` prioritizes assigned tasks
- [ ] Test `list --assignee` filters correctly
- [ ] Test `checkpoint --progress` sets progress
- [ ] Test `block` command with and without reason
- [ ] Test `block` rejects invalid transitions
- [ ] Test `unblock` command default and --release
- [ ] Test `progress` command bounds validation (CLI-layer)
- [ ] Test `progress` command rejects non-integer input

**Run:** `npm test -w hzl-cli`

---

## Phase 6: Integration & Documentation

### 6.1 Integration Tests

- [ ] End-to-end test: create → assign → claim → checkpoint with progress → complete
- [ ] End-to-end test: create → claim → block → unblock → complete
- [ ] Migration test: v1 database upgrades correctly to v2
- [ ] Historical event replay: events with agent_id but no author

### 6.2 Documentation Updates

- [ ] Update CLI help text for all modified commands

### 6.3 Final Verification

- [ ] `npm run build` - all packages build
- [ ] `npm test` - all tests pass
- [ ] `npm run typecheck` - no type errors
- [ ] `npm run lint` - no lint errors

---

## Acceptance Criteria

- [ ] `hzl task add "title" -P proj --assignee agent-x` pre-assigns task
- [ ] `hzl task claim <id> --assignee agent-x` sets assignee
- [ ] `hzl task claim <id>` (no flag) preserves existing assignee
- [ ] `hzl task next -P proj --assignee agent-x` returns assigned tasks first
- [ ] `hzl task list --assignee agent-x` filters by assignee
- [ ] `hzl task checkpoint <id> "msg" --progress 50` sets progress
- [ ] `hzl task progress <id> 75` sets progress standalone
- [ ] `hzl task block <id> "reason"` transitions to blocked status
- [ ] `hzl task block <id>` from non-in_progress fails with clear error
- [ ] `hzl task unblock <id>` returns to in_progress
- [ ] `hzl task unblock <id> --release` returns to ready
- [ ] `hzl task list --status blocked` shows blocked tasks
- [ ] Schema migration runs automatically on first command after upgrade
- [ ] Old events replay correctly with new projection logic
- [ ] Historical events with agent_id (no author) map to assignee correctly
- [ ] Assignee persists when task completes (not cleared)

---

## Breaking Changes

| Change | Migration |
|--------|-----------|
| `--author` → `--assignee` / `-a` on claim | Update scripts |
| `--agent` removed | Use `--assignee` |
| `claimed_by_author` column removed | Automatic projection rebuild |
| `claimed_by_agent_id` column removed | Automatic projection rebuild |
| JSON output structure changed | Update consumers |

---

## Review Feedback Applied

| Finding | Resolution |
|---------|------------|
| Phase 2/3 dependency | Schema version bump moved to Phase 3 (after projections) |
| Wrong file path | Fixed: use `datastore.ts` not `index.ts` |
| author/agent_id mapping | Use `author \|\| agent_id \|\| null` for historical events |
| stealTask() update | Added to Phase 4 |
| handleTaskCreated missing assignee | Added to Phase 2 INSERT |
| No transaction around rebuild | Wrapped in BEGIN IMMEDIATE...COMMIT |
| Status transitions not validated | Added validation helper |
| CLI commands missing structure | Added proper Result/runX/createX pattern |
| Remove was_preassigned | Removed from plan |
| Defer assignee index | Deferred |
| Inline schema version | Inlined in datastore.ts |

---

## Dependencies

None - all changes are internal to HZL.
