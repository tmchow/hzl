# HZL Workflow Discoverability Design

## Final Decisions (2026-02-03)

After review, the following changes were made to the original design:

| Original | Final Decision | Rationale |
|----------|----------------|-----------|
| `--author` flag on `add` and `claim` | Renamed to `--assignee` | Clarity of intent - "who owns the task" is clearer than audit trail semantics |
| `--agent-id` flag | **Removed** | Redundant with `--assignee` |
| `--lease` flag on `add` | **Removed** | No atomicity benefit; use `claim --lease` separately |
| Warnings for missing assignee | **Removed** | Allow operations silently; agents who want attribution will provide it |
| Structured `CLIErrorData` | **Removed** | Inline hints in error strings suffice; simpler implementation |
| `claim --author` | **Renamed to `claim --assignee`** | Breaking change, clean break (no deprecation period) |

**Final flag set for `task add`:**
- `-s/--status` - Initial status (atomicity for multi-agent)
- `--assignee` - Who owns the task (for `-s in_progress`)
- `--reason` - Block reason (required for `-s blocked`)

**Semantic distinction:**
- `--assignee` = who owns the task (used on `claim`, `add`)
- `--author` = who performed the action (audit trail, used on `checkpoint`, `complete`, `block`, etc.)

---

## Problem Statement

Agents (OpenClaw and likely others) don't understand HZL's task lifecycle. They create tasks, try to claim them immediately, fail because tasks start in `backlog` status, and then work around the error instead of following the proper workflow.

**Example failure:**
```
hzl task add "Research X" -P openclaw
# → Created task abc123 (status: backlog)

hzl task claim abc123 --assignee openclaw
# → Error: Task is not claimable: status is backlog, must be ready

# Agent gives up and works without tracking, violating the workflow
```

**Impact:** In multi-agent systems, untracked work causes duplicate effort and coordination failures.

## Root Causes

1. **Skills don't document the task lifecycle** (backlog → ready → in_progress → done)
2. **Error messages don't explain how to fix** the problem
3. **CLI lacks ergonomic flags** for common agent workflows

## Design

### 1. Core: Extend `CreateTaskInput` to support initial status

**Current interface** (`packages/hzl-core/src/services/task-service.ts`):
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
  assignee?: string;
  // Missing: initial_status
}
```

**Proposed changes:**
```typescript
export interface CreateTaskInput {
  // ... existing fields ...
  initial_status?: TaskStatus;  // NEW: defaults to Backlog
  block_reason?: string;        // NEW: required if initial_status is Blocked
  // Note: lease_minutes removed - use claim --lease separately
}
```

**`createTask()` behavior changes:**

1. If `initial_status` is not specified, use `TaskStatus.Backlog` (current behavior)
2. If `initial_status` is specified and differs from `Backlog`:
   - Emit `TaskCreated` event (creates task in Backlog)
   - Immediately emit `StatusChanged` event to transition to requested status
   - For `InProgress`: set `assignee` from `ctx.author` and optionally set `lease_until`
   - For `Blocked`: include `block_reason` in the `StatusChanged` event data
3. This maintains event sourcing integrity - all state transitions are recorded

### 2. CLI: Add `-s/--status` flag to `task add`

Allow setting initial status on creation. Any valid status is allowed to support retroactive recording.

```bash
hzl task add "Fix bug" -P myapp                           # default: backlog
hzl task add "Fix bug" -P myapp -s ready                  # skip backlog
hzl task add "Fix bug" -P myapp -s in_progress --assignee me
hzl task add "Fix bug" -P myapp -s blocked --reason "Waiting on API key"
hzl task add "Fix bug" -P myapp -s done --assignee me     # retroactive
```

### 3. CLI: Add contextual flags to `task add`

| Flag | Short | Purpose |
|------|-------|---------|
| `--status` | `-s` | Initial status (default: backlog) |
| `--assignee` | | Who owns the task (for `-s in_progress`) |
| `--reason` | | Why blocked (required if `-s blocked`) |

~~`--lease`~~ **Removed** - Use `claim --lease` separately (no atomicity benefit)
~~`--agent-id`~~ **Removed** - Redundant with `--assignee`

**Validation rules:**

| Scenario | Validation | Error Message |
|----------|------------|---------------|
| `-s blocked` without `--reason` | Error | `Blocked status requires --reason flag`<br>`Hint: hzl task add "..." -s blocked --reason "why"` |
| `--reason` without `-s blocked` | Error | `--reason only valid with -s blocked` |
| `-s archived` | Error | `Cannot create task as archived (use done, then archive separately)` |

~~Warnings for missing `--assignee`~~ **Removed** - Allow operations silently

### 4. Core: Allow `blockTask` on already-blocked tasks

Enable `blocked → blocked` transitions to update the block reason. This is consistent with how `steal` handles `in_progress → in_progress`.

**Current:**
```typescript
if (task.status !== TaskStatus.InProgress) {
  throw new Error(`Cannot block: status is ${task.status}, expected in_progress`);
}
```

**Proposed:**
```typescript
if (task.status !== TaskStatus.InProgress && task.status !== TaskStatus.Blocked) {
  throw new Error(`Cannot block: status is ${task.status}, expected in_progress or blocked`);
}
```

### 5. CLI: Improve error messages across the board

Follow the **Description + Reason + Resolution** pattern per [CLI best practices](https://clig.dev/).

**Examples:**

| Current | Improved |
|---------|----------|
| `Task is not claimable: status is backlog, must be ready` | `Task abc123 is not claimable (status: backlog)`<br>`Hint: Move it to ready first: hzl task set-status abc123 ready` |
| `Cannot block: status is ready, expected in_progress` | `Cannot block task abc123 (status: ready)`<br>`Hint: Claim the task first: hzl task claim abc123 --assignee <name>` |
| `Task has incomplete dependencies: [dep1, dep2]` | `Task abc123 has incomplete dependencies: dep1, dep2`<br>`Hint: Complete dependencies first, or use --force to override` |

### 6. Documentation: Update skills with workflow guidance

#### 6.1 Task Statuses (NEW SECTION)

```markdown
## Task Statuses

**backlog**: Task exists but is not ready for work.
- Cannot be claimed
- To make claimable: `hzl task set-status <id> ready`
- Or create with: `hzl task add "..." -s ready`

**ready**: Task is available to be claimed (if dependencies are met).
- Claim with: `hzl task claim <id> --assignee <name>`
- Move back to backlog: `hzl task set-status <id> backlog`

**in_progress**: Task is actively being worked by an assignee.
- Checkpoint progress: `hzl task checkpoint <id> "message" --progress N`
- Complete: `hzl task complete <id>`
- Block (external dependency): `hzl task block <id> --reason "..."`
- Release (stop working, return to queue): `hzl task release <id>`

**blocked**: Task is stuck on external dependency (not task dependencies).
- Unblock (resume work): `hzl task unblock <id>`
- Update reason: `hzl task block <id> --reason "new reason"`

**done**: Task is completed.
- Reopen if needed: `hzl task reopen <id>`
```

#### 6.2 Workflow Rules (NEW SECTION)

```markdown
## Workflow Rules

**To work on a task:**
- Task must be `ready` status AND have no incomplete dependencies
- If task is `backlog`: run `set-status <id> ready` first
- If task is `ready`: run `claim <id> --assignee <name>` to start work

**When creating tasks:**
- New tasks start in `backlog` by default (enables planning-first workflows)
- To work immediately: use `-s ready` flag: `task add "..." -s ready`
- To record completed work: use `-s done` flag: `task add "..." -s done`

**When finishing work:**
- If task is `in_progress` and done: run `complete <id>`
- If task is `in_progress` and stuck on external blocker: run `block <id> --reason "..."`
- If task is `blocked` and blocker resolved: run `unblock <id>`

**Common mistake:** Creating a task and immediately trying to claim it fails because tasks start in `backlog`. Either use `-s ready` on creation, or run `set-status <id> ready` before claiming.
```

#### 6.3 Scenario: Create and Work Immediately (NEW)

```markdown
## Scenario: Create and Work Immediately

When creating a task you will work on right now:

# Create as ready (skip backlog)
hzl task add "Fix login bug" -P myapp -s ready
# → Created task abc123 (status: ready)

# Claim and work
hzl task claim abc123 --assignee me
hzl task checkpoint abc123 "Found root cause" --progress 30
hzl task checkpoint abc123 "Implemented fix" --progress 80
hzl task complete abc123
```

#### 6.4 Scenario: Planning First (NEW)

```markdown
## Scenario: Planning First (Orchestrator Pattern)

When breaking down complex work before execution:

# 1. Create all tasks (they start in backlog - not yet claimable)
hzl task add "Auth feature" -P myapp
# → parent-123

hzl task add "Design schema" --parent parent-123
# → task-1

hzl task add "Implement endpoints" --parent parent-123 --depends-on task-1
# → task-2

hzl task add "Write tests" --parent parent-123 --depends-on task-2
# → task-3

# 2. Review the breakdown
hzl task show parent-123

# 3. (Optional) Check for circular or missing dependencies
hzl validate
# If issues found:
#   - Circular dependency: `hzl task remove-dep <taskId> <depId>` to break cycle
#   - Missing dependency: create the task or `hzl task remove-dep <taskId> <missingId>`

# 4. Release tasks for work (mark ready)
hzl task set-status task-1 ready
hzl task set-status task-2 ready
hzl task set-status task-3 ready

# 5. Now workers can claim tasks
hzl task next --parent parent-123 --claim --assignee worker-1

Why backlog-first matters: It prevents workers from grabbing tasks before the
full plan is created. This avoids race conditions in multi-agent workflows.
```

#### 6.5 Scenario: Record Retroactive Work (NEW)

```markdown
## Scenario: Recording Completed Work

When documenting work that already happened (for the ledger):

hzl task add "Hotfix: patch CVE-2024-1234" -P myapp -s done --assignee me
```

#### 6.6 Troubleshooting Table (NEW)

```markdown
## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "status is backlog, must be ready" | Task not released for work | `hzl task set-status <id> ready` |
| "status is backlog, must be in_progress" | Trying to complete unclaimed task | Set ready → claim → complete |
| "Cannot block: expected in_progress" | Blocking unclaimed task | Claim first, then block |
| "Task has incomplete dependencies" | Dependencies not done | Complete dependencies first |
| "Task not found" | Wrong ID or task was pruned | Check `hzl task list` |
| "Circular dependency detected" | Tasks depend on each other | `hzl task remove-dep <id> <depId>` to break cycle |
| "Missing dependency" | Dependency references non-existent task | Create the task or `hzl task remove-dep <id> <missingId>` |
```

### 7. Agent Policy: Add critical workflow info

Update `docs/snippets/agent-policy.md` to include lifecycle and quick commands (always in context):

```markdown
### HZL task ledger (external task tracking for multi-session/multi-agent work)

[existing "when to use" and "structure" content...]

**Task lifecycle:**
- New tasks start in `backlog` status (not claimable)
- To work a task: `set-status <id> ready` → `claim <id>` → work → `complete <id>`
- Or create ready: `hzl task add "..." -P project -s ready`

**Quick commands:**
| Action | Command |
|--------|---------|
| Create task (ready to work) | `hzl task add "title" -P project -s ready` |
| Create task (planning) | `hzl task add "title" -P project` |
| Mark ready | `hzl task set-status <id> ready` |
| Claim | `hzl task claim <id> --assignee <name>` |
| Checkpoint | `hzl task checkpoint <id> "message"` |
| Complete | `hzl task complete <id>` |

Detailed workflow scenarios and troubleshooting are documented in the `hzl` skill.

[existing destructive commands warning...]
```

**Rationale:** Critical info always in context. Agents that can't invoke skills still get the essential workflow. Agents with skill support get pointed to detailed guidance.

### 8. OpenClaw Skill: Fix description for proper invocation

The OpenClaw skill description doesn't follow best practices for skill invocation. Per the skill-creator guidance, descriptions should use third-person and include specific trigger phrases.

**Current (poor):**
```yaml
description: OpenClaw's persistent task database. Coordinate sub-agents, checkpoint progress, survive session boundaries.
```

**Problems:**
- Missing "This skill should be used when..." pattern
- No trigger phrases matching agent intents
- Too abstract - doesn't mention "hzl" commands
- Missing action verbs: "create task", "claim", "track"

**Proposed (follows best practices):**
```yaml
description: This skill should be used when working with HZL for task tracking. Use when creating tasks, claiming work, checkpointing progress, completing tasks, or coordinating multi-agent work. Triggers include "track tasks with HZL", "break down work into tasks", "claim a task", "hzl task", "checkpoint progress", or when running hzl CLI commands.
```

**Why this matters:** The description determines when OpenClaw loads the skill. A poor description means the skill won't load when needed, which is exactly what happened in the reported issue.

## Files to Change

| Area | File | Change |
|------|------|--------|
| CLI | `packages/hzl-cli/src/commands/task/add.ts` | Add `-s`, `--assignee`, `--reason` flags |
| CLI | `packages/hzl-cli/src/commands/task/claim.ts` | Rename `--author` to `--assignee` (breaking change) |
| Core | `packages/hzl-core/src/services/task-service.ts` | Allow `blocked → blocked` in `blockTask` |
| CLI | Multiple command files | Update error messages with hints |
| Skills | `skills/hzl/SKILL.md` | Add lifecycle, workflows, troubleshooting, `remove-dep` to command reference |
| Skills | `docs/openclaw/skills/hzl/SKILL.md` | Fix description for proper skill invocation, add lifecycle, workflows, troubleshooting, `remove-dep` |
| Snippets | `docs/snippets/agent-policy.md` | Add task lifecycle, quick commands, optional skill reference |

## Design Rationale

| Decision | Reasoning |
|----------|-----------|
| `--status` not `--ready` | More general, explicit, consistent with other flags (`-p`, `-t`) |
| Backlog default preserved | Enables planning-first workflows, prevents race conditions |
| All statuses allowed on creation | Supports retroactive recording for ledger accuracy |
| Contextual flags on `task add` | One command with full context, no awkward follow-ups |
| `blocked → blocked` allowed | Idempotent reason updates (consistent with `steal` pattern) |
| Error hints | CLI best practice per clig.dev, helps agents self-correct |
| B+C format for lifecycle docs | Status definitions + decision rules = agent-parseable |
| Hybrid agent-policy + skill | Critical rules always in context; detailed scenarios in skill for platforms that support it |
| OpenClaw skill description fix | Third-person pattern + trigger phrases = proper skill invocation per skill-creator best practices |

## Test Requirements

| Component | Test File | Cases to Add |
|-----------|-----------|--------------|
| Core service | `packages/hzl-core/src/services/task-service.test.ts` | `createTask` with `initial_status` for each valid status, validation errors for invalid combinations, event emission sequence verification |
| Core service | `packages/hzl-core/src/services/task-service.test.ts` | `blockTask` on already-blocked task (idempotent update) |
| CLI add command | `packages/hzl-cli/src/commands/task/add.test.ts` | `-s` flag parsing, `--reason` validation, `--assignee` passthrough, JSON output includes status |
| CLI claim command | `packages/hzl-cli/src/commands/task/claim.test.ts` | `--assignee` flag works (replaces `--author`) |
| CLI error messages | `packages/hzl-cli/src/commands/task/*.test.ts` | Verify improved error messages include task ID and hint text |
| Integration | `packages/hzl-core/src/__tests__/integration/` | End-to-end: create with status → verify state → claim/complete flow |

**Event sourcing verification:**
Tests must verify that `createTask` with non-backlog `initial_status`:
1. Emits `TaskCreated` event (status: backlog)
2. Emits `StatusChanged` event (from: backlog, to: requested_status)
3. Final projected state matches requested status

## Rollout Order

Implementation should follow this sequence to maintain system stability:

1. **Core service changes** (`task-service.ts`)
   - Extend `CreateTaskInput` interface
   - Implement `initial_status` logic with event emission
   - Add `blocked → blocked` transition support
   - Add tests

2. **CLI flag support** (`add.ts`, `claim.ts`)
   - Add `-s/--status`, `--assignee`, `--reason` flags to `add.ts`
   - Rename `--author` to `--assignee` in `claim.ts` (breaking change)
   - Implement validation rules
   - Add tests

3. **Error message improvements** (multiple CLI files)
   - Update error messages in claim, block, complete commands
   - Follow Description + Reason + Resolution pattern
   - Add tests for new message format

4. **Documentation updates** (can be done in parallel with code)
   - Update `skills/hzl/SKILL.md` with lifecycle, workflows, troubleshooting
   - Update `docs/openclaw/skills/hzl/SKILL.md` with fixed description + content
   - Update `docs/snippets/agent-policy.md` with lifecycle + quick commands

**Dependencies:**
- Step 2 depends on Step 1 (CLI uses core interface)
- Step 3 is independent (error messages don't require new flags)
- Step 4 is independent (documentation can be written before code)

## Out of Scope

- Changing the default status (backlog is intentional)
- Auto-transitioning tasks (HZL is a dumb ledger, not an orchestrator)
- Workflow enforcement (agents decide their own patterns)
