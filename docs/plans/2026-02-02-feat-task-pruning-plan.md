---
title: "feat: Add task pruning command"
type: feat
date: 2026-02-02
brainstorm: docs/brainstorms/2026-02-01-task-pruning-brainstorm.md
---

# feat: Add task pruning command

## Overview

Add an on-demand `hzl task prune` command that permanently deletes old tasks in terminal states (`done`, `archived`) along with their events. This helps keep HZL lightweight since it's not meant for long-term task storage.

The command deletes both events AND projections, breaking the append-only model as a deliberate maintenance escape hatch. This achieves true database size reduction.

## Problem Statement

HZL is designed as a task coordination tool for agents, not long-term task storage. Over time, completed and archived tasks accumulate, causing:

1. **Database bloat** - Events and projections grow unbounded
2. **Noisy queries** - Agents see irrelevant old tasks
3. **Slower performance** - Larger datasets affect query times

Users need a way to periodically clean up old, irrelevant tasks while maintaining safety against accidental data loss.

## Proposed Solution

A new CLI command `hzl task prune` with:

- **Explicit scope requirement** - Must specify `--project <name>` or `--all`
- **Configurable age threshold** - `--older-than 30d` (default 30 days)
- **Interactive confirmation** - Shows preview of tasks to be pruned
- **Atomic family pruning** - Only prune if parent AND all children are terminal and old enough
- **Dependency-safe pruning** - Do not prune tasks that are prerequisites for any non-prunable task
- **Scripting support** - `--yes` flag bypasses confirmation
- **Dry-run mode** - `--dry-run` for scripted preview without confirmation
- **Optional vacuum** - `--vacuum` to reclaim disk space after deletion (can be slow)
- **Export before delete** - `--export <path>` writes pruned tasks/events to NDJSON for recovery

## Technical Approach

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  CLI Command    │────▶│   TaskService    │────▶│  Databases  │
│  prune.ts       │     │  pruneEligible() │     │             │
└─────────────────┘     └──────────────────┘     │  events.db  │
        │                        │               │  cache.db   │
        │                        │               └─────────────┘
        ▼                        ▼
   Confirmation            Transaction:
   via readline            1. Disable triggers
                           2. Delete projections (cache.db) - recoverable if interrupted
                           3. Delete events (events.db)
                           4. Re-enable triggers
```

### Implementation Phases

#### Phase 1: Core Service Layer

**Files to create/modify:**

| File | Action | Purpose |
|------|--------|---------|
| `packages/hzl-core/src/services/task-service.ts` | Modify | Add `previewPrunableTasks()` and `pruneEligible()` methods |
| `packages/hzl-core/src/services/task-service.test.ts` | Modify | Add tests for pruning logic |
| `packages/hzl-core/src/projections/tasks-current.ts` | Modify | Track `terminal_at` when status enters done/archived |
| `packages/hzl-core/src/db/migrations/*` | Add | Add `terminal_at` column + index on `tasks_current(terminal_at)` |
| `packages/hzl-core/src/db/schema.ts` | Modify | Backfill `terminal_at` on rebuild |

**Service methods:**

```typescript
// In TaskService

interface PrunableTask {
  task_id: string;
  title: string;
  project: string;
  status: 'done' | 'archived';
  terminal_since: string; // ISO timestamp
  parent_id: string | null;
}

interface PruneOptions {
  project?: string;     // Specific project or undefined for all
  olderThanDays: number;
  asOf?: string;        // ISO timestamp for deterministic pruning
}

interface PruneResult {
  pruned: PrunableTask[];
  count: number;
  eventsDeleted: number;
}

/**
 * Find tasks eligible for pruning (preview only).
 * A task is eligible if:
 * 1. Status is 'done' or 'archived'
 * 2. Has been in terminal state for >= olderThanDays
 * 3. If parent: all children must also be eligible
 * 4. If child: parent must also be eligible (atomic family)
 * 5. If dependency target: all dependents must also be eligible
 */
previewPrunableTasks(opts: PruneOptions): PrunableTask[]

/**
 * Permanently delete eligible tasks and their events.
 * DANGEROUS: Breaks append-only event model.
 * Recomputes eligibility inside the prune transaction to avoid TOCTOU.
 */
pruneEligible(opts: PruneOptions): PruneResult
```

**Key implementation details:**

1. **Age calculation** - Use a projection field `terminal_at` maintained by the projector:
   ```sql
   SELECT task_id, terminal_at
   FROM tasks_current
   WHERE status IN ('done','archived') AND terminal_at IS NOT NULL;
   ```
   Backfill `terminal_at` during migration by scanning events once.

2. **Family + dependency pruning** - Query pattern:
   ```sql
   -- Get all tasks with their family eligibility
   WITH family_status AS (
     SELECT
       t.task_id,
       t.parent_id,
       t.status,
       -- Check if task itself is terminal and old enough
       CASE WHEN t.status IN ('done', 'archived')
            AND t.terminal_at < datetime('now', '-' || ? || ' days')
       THEN 1 ELSE 0 END as self_eligible
     FROM tasks_current t
     WHERE t.project = ? OR ? IS NULL
   ),
   dep_blockers AS (
     -- Tasks that are depended on by non-eligible tasks cannot be pruned
     SELECT d.depends_on_id AS task_id
     FROM task_dependencies d
     JOIN family_status t ON t.task_id = d.task_id
     WHERE t.self_eligible = 0
   ),
   family_eligible AS (
     -- A task is family-eligible only if itself AND all family members are eligible
     SELECT f.task_id
     FROM family_status f
     WHERE f.self_eligible = 1
       -- If has children, all must be eligible
       AND NOT EXISTS (
         SELECT 1 FROM family_status c
         WHERE c.parent_id = f.task_id AND c.self_eligible = 0
       )
       -- If has parent, parent must be eligible
       AND (f.parent_id IS NULL OR EXISTS (
         SELECT 1 FROM family_status p
         WHERE p.task_id = f.parent_id AND p.self_eligible = 1
       ))
       -- Not depended on by any non-eligible task
       AND NOT EXISTS (SELECT 1 FROM dep_blockers b WHERE b.task_id = f.task_id)
   )
   SELECT * FROM tasks_current WHERE task_id IN (SELECT task_id FROM family_eligible)
   ```

3. **Trigger management and deletion order**:
   ```typescript
   // IMPORTANT: Delete projections FIRST, then events
   // If interrupted after projections but before events:
   //   - Events remain intact
   //   - Projections can be rebuilt via `hzl doctor --rebuild`
   // If events deleted first and interrupted:
   //   - Orphaned projections with no source of truth
   //   - Unrecoverable state

   // Step 1: Delete from projections (cache.db) - recoverable
   deleteTasksFromProjections(this.cacheDb, taskIds);

   // Step 2: Delete from events (events.db) - requires trigger bypass
   withWriteTransaction(this.eventsDb, () => {
     // Disable triggers
     this.eventsDb.exec('DROP TRIGGER IF EXISTS events_no_delete');
     this.eventsDb.exec('DROP TRIGGER IF EXISTS events_no_update');

     try {
       // Avoid SQLite parameter limits on large prune sets
       this.eventsDb.exec('CREATE TEMP TABLE prune_targets (task_id TEXT PRIMARY KEY)');
       const insert = this.eventsDb.prepare('INSERT INTO prune_targets (task_id) VALUES (?)');
       for (const id of taskIds) insert.run(id);
       const result = this.eventsDb
         .prepare('DELETE FROM events WHERE task_id IN (SELECT task_id FROM prune_targets)')
         .run();
       this.eventsDb.exec('DROP TABLE prune_targets');

       // Re-enable triggers
       this.eventsDb.exec(EVENTS_TRIGGERS_SQL);

       return { eventsDeleted: result.changes };
     } catch (err) {
       // Re-enable triggers even on error
       this.eventsDb.exec(EVENTS_TRIGGERS_SQL);
       throw err;
     }
   });
   ```

4. **Startup trigger verification** (defensive measure):
   ```typescript
   // In initializeDb() - verify event protection triggers exist
   function ensureEventTriggers(eventsDb: Database.Database): void {
     const triggers = eventsDb.prepare(`
       SELECT name FROM sqlite_master
       WHERE type = 'trigger' AND name IN ('events_no_update', 'events_no_delete')
     `).all();

     if (triggers.length < 2) {
       console.warn('Recreating missing event protection triggers');
       eventsDb.exec(EVENTS_TRIGGERS_SQL);
     }
   }
   ```

   This guards against the rare case where a crash occurs after dropping triggers but before recreating them.

**Estimated effort:** Medium (2-3 hours)

#### Phase 2: CLI Command

**Files to create/modify:**

| File | Action | Purpose |
|------|--------|---------|
| `packages/hzl-cli/src/commands/task/prune.ts` | Create | CLI command implementation |
| `packages/hzl-cli/src/commands/task/prune.test.ts` | Create | CLI tests |
| `packages/hzl-cli/src/commands/task/index.ts` | Modify | Register prune command |

**Command structure:**

```typescript
// prune.ts

import { Command } from 'commander';
import readline from 'readline';

interface PruneCommandOptions {
  project?: string;
  all?: boolean;
  olderThan?: string;
  asOf?: string;
  yes?: boolean;
  dryRun?: boolean;
  vacuum?: boolean;
  export?: string;
}

export function createPruneCommand(): Command {
  return new Command('prune')
    .description('Permanently delete old tasks in terminal states')
    .option('-P, --project <name>', 'Prune tasks in specific project')
    .option('-A, --all', 'Prune tasks in all projects')
    .option('--older-than <duration>', 'Age threshold (e.g., 30d)', '30d')
    .option('--as-of <timestamp>', 'Evaluate age threshold as of a fixed time (ISO)')
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('--dry-run', 'Preview what would be pruned without deleting')
    .option('--vacuum', 'Run VACUUM after pruning to reclaim disk space')
    .option('--export <path>', 'Write pruned tasks/events to NDJSON before deleting')
    .action(function (this: Command, opts: PruneCommandOptions) {
      // Implementation
    });
}
```

**Validation logic:**

```typescript
// Scope validation
if (!opts.project && !opts.all) {
  throw new CLIError(
    'Must specify --project <name> or --all',
    ExitCode.InvalidUsage
  );
}
if (opts.project && opts.all) {
  throw new CLIError(
    'Cannot specify both --project and --all',
    ExitCode.InvalidUsage
  );
}

// Age parsing (only Nd format, minimum 1 day)
const ageMatch = opts.olderThan?.match(/^(\d+)d$/);
if (!ageMatch) {
  throw new CLIError(
    'Invalid --older-than format. Use Nd (e.g., 30d for 30 days)',
    ExitCode.InvalidUsage
  );
}
const olderThanDays = parseInt(ageMatch[1], 10);
if (olderThanDays < 1) {
  throw new CLIError(
    '--older-than must be at least 1d',
    ExitCode.InvalidUsage
  );
}

// JSON mode requires --yes only when actually deleting
if (json && !opts.yes && !opts.dryRun) {
  throw new CLIError(
    'Cannot use --json without --yes for destructive operations',
    ExitCode.InvalidUsage
  );
}

// Optional as-of parsing
let asOf: string | undefined;
if (opts.asOf) {
  const ts = Date.parse(opts.asOf);
  if (Number.isNaN(ts)) {
    throw new CLIError(
      'Invalid --as-of timestamp. Use ISO 8601 (e.g., 2026-02-03T12:00:00Z)',
      ExitCode.InvalidUsage
    );
  }
  asOf = new Date(ts).toISOString();
}

// Non-TTY requires --yes (unless --dry-run)
if (!process.stdin.isTTY && !opts.yes && !opts.dryRun) {
  throw new CLIError(
    'Cannot prompt for confirmation in non-interactive mode. Use --yes to confirm.',
    ExitCode.InvalidUsage
  );
}
```

**Dry-run handling:**

```typescript
// Early exit for --dry-run (preview only, no deletion)
if (opts.dryRun) {
  const tasks = taskService.previewPrunableTasks({ project: opts.project, olderThanDays, asOf });
  if (json) {
    console.log(JSON.stringify({ wouldPrune: tasks, count: tasks.length }, null, 2));
  } else {
    if (tasks.length === 0) {
      console.log('No tasks eligible for pruning');
    } else {
      console.log(`Would prune ${tasks.length} task(s):`);
      for (const t of tasks.slice(0, 20)) {
        console.log(`  [${t.task_id.slice(0, 8)}] ${t.title} (${t.project})`);
      }
      if (tasks.length > 20) {
        console.log(`  ... and ${tasks.length - 20} more`);
      }
    }
  }
  return; // Exit without deleting
}
```

**Confirmation prompt:**

```typescript
async function confirmPrune(
  prunableTasks: PrunableTask[]
): Promise<boolean> {
  // Group by project
  const byProject = new Map<string, PrunableTask[]>();
  for (const task of prunableTasks) {
    const list = byProject.get(task.project) || [];
    list.push(task);
    byProject.set(task.project, list);
  }

  console.error('');
  console.error(`Ready to permanently delete ${prunableTasks.length} task(s):`);
  console.error('');

  for (const [project, tasks] of byProject) {
    console.error(`  Project '${project}': ${tasks.length} task(s)`);
    const shown = tasks.slice(0, 10);
    for (const t of shown) {
      const title = t.title.length > 40 ? t.title.slice(0, 37) + '...' : t.title;
      console.error(`    [${t.task_id.slice(0, 8)}] ${title}`);
    }
    if (tasks.length > 10) {
      console.error(`    ... and ${tasks.length - 10} more`);
    }
  }

  console.error('');
  console.error('WARNING: This action cannot be undone. Events will be permanently deleted.');
  console.error('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question("Type 'yes' to confirm: ", (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}
```

**Output formats:**

```typescript
// Human-readable output
console.log(`Pruned ${result.count} task(s) (${result.eventsDeleted} events deleted)`);

// JSON output
console.log(JSON.stringify({
  pruned: result.pruned.map(t => ({
    task_id: t.task_id,
    title: t.title,
    project: t.project,
    status: t.status,
  })),
  count: result.count,
  eventsDeleted: result.eventsDeleted,
}, null, 2));
```

**Estimated effort:** Medium (2-3 hours)

#### Phase 3: Documentation

**Files to create/modify:**

| File | Action | Purpose |
|------|--------|---------|
| `docs/concepts/pruning.md` | Create | Philosophy and usage guide |
| `README.md` | Modify | Add prune to CLI reference |
| `AGENTS.md` | Modify | Add destructive command warning |
| `docs/snippets/agent-policy.md` | Modify | Add prune to key commands |
| `packages/hzl-marketplace/plugins/hzl-skills/skills/hzl-task-management/SKILL.md` | Modify | Add prune command reference |
| `docs/openclaw/skills/hzl/SKILL.md` | Modify | Add prune command reference |

**New documentation page: `docs/concepts/pruning.md`:**

```markdown
---
layout: default
title: Pruning
parent: Concepts
nav_order: 6
---

# Pruning

HZL is designed for task coordination, not long-term storage. The `prune` command helps keep your database lightweight by permanently removing old, completed work.

## Philosophy

Tasks in HZL have a lifecycle:
1. **Active** - Being worked on
2. **Terminal** - Work is complete (`done`) or no longer needed (`archived`)
3. **Prunable** - Terminal and old enough to remove

Pruning is a deliberate maintenance action. Once pruned, tasks and their history are permanently deleted.

## When to Prune

Consider pruning when:
- A project wraps up and you no longer need its history
- Quarterly cleanup of old completed work
- Database size becomes a concern
- You want to reduce noise for agents querying tasks

## Using the Command

### Basic Usage

```bash
# Prune tasks in a specific project (default: 30 days old)
hzl task prune --project myproject

# Prune tasks across all projects
hzl task prune --all

# Custom age threshold
hzl task prune --all --older-than 90d

# Reclaim disk space (can take time)
hzl task prune --all --older-than 90d --yes --vacuum
```

### Preview (Dry Run)

```bash
# Preview what would be pruned (human-readable)
hzl task prune --all --dry-run

# Preview with JSON output (for scripting)
hzl task prune --all --dry-run --json
```

### Scripting

```bash
# Skip confirmation for automation
hzl task prune --all --older-than 30d --yes

# JSON output for parsing
hzl task prune --all --json --yes

# Export pruned tasks/events before deletion
hzl task prune --all --older-than 30d --yes --export ./pruned.ndjson

# Conditional prune based on count
count=$(hzl task prune --all --dry-run --json | jq .count)
if [ "$count" -lt 100 ]; then
  hzl task prune --all --yes
fi
```

## What Gets Pruned

| Data | Pruned? |
|------|---------|
| Task record | Yes |
| Task events | Yes |
| Checkpoints | Yes |
| Comments | Yes |
| Tags | Yes |
| Dependencies | Yes |
| Export file (optional) | Yes (written before deletion) |

## Safety Features

1. **Explicit scope required** - Must specify `--project` or `--all`
2. **Terminal state required** - Only `done` and `archived` tasks
3. **Age threshold** - Default 30 days, configurable
4. **Interactive confirmation** - Shows exactly what will be deleted
5. **Atomic family pruning** - Parent and children pruned together

## Best Practices

1. **Review before pruning** - Run without `--yes` first to see the preview
2. **Use conservative thresholds** - Start with longer periods (90d) and adjust
3. **Prune by project** - More control than `--all`
4. **Document your schedule** - If you prune regularly, note it in your project docs
```

**AGENTS.md warning table update:**

```markdown
### ⚠️ DESTRUCTIVE COMMANDS - AI AGENTS READ THIS

| Command | Effect |
|---------|--------|
| `hzl init --force` | **DELETES ALL DATA.** Prompts for confirmation. |
| `hzl init --force --yes` | **DELETES ALL DATA WITHOUT CONFIRMATION.** |
| `hzl task prune --all` | **DELETES OLD TASKS.** Prompts for confirmation. |
| `hzl task prune --all --yes` | **DELETES OLD TASKS WITHOUT CONFIRMATION.** |

**AI agents: NEVER run these commands unless the user EXPLICITLY asks.**
```

**Estimated effort:** Small (1-2 hours)

#### Phase 4: Testing

**Test scenarios:**

| Scenario | Test File | Description |
|----------|-----------|-------------|
| Happy path | `prune.test.ts` | Eligible tasks, user confirms, tasks deleted |
| No eligible tasks | `prune.test.ts` | Returns empty result, exit 0 |
| Family atomicity | `task-service.test.ts` | Mixed terminal states, only eligible families prune |
| Dependency blockers | `task-service.test.ts` | Dependencies to non-terminal tasks block pruning |
| Age threshold | `task-service.test.ts` | Tasks at boundary, respects threshold |
| Minimum age validation | `prune.test.ts` | `--older-than 0d` rejected |
| Missing scope | `prune.test.ts` | Error without --project or --all |
| Conflicting scope | `prune.test.ts` | Error with both --project and --all |
| Project not found | `prune.test.ts` | Error for non-existent project |
| Non-TTY without --yes | `prune.test.ts` | Error requiring --yes |
| JSON without --yes | `prune.test.ts` | Error requiring --yes |
| Dry-run human output | `prune.test.ts` | Shows preview, exits without deleting |
| Dry-run JSON output | `prune.test.ts` | JSON preview, exits without deleting |
| Dry-run JSON without --yes | `prune.test.ts` | Allowed and returns preview |
| Export output | `prune.test.ts` | Writes NDJSON before deletion |
| Dry-run in non-TTY | `prune.test.ts` | Works without --yes (no confirmation needed) |
| Trigger restoration | `task-service.test.ts` | Triggers restored after prune |
| Startup trigger check | `db.test.ts` | Missing triggers recreated on init |

**Estimated effort:** Medium (2-3 hours)

## Acceptance Criteria

### Functional Requirements

- [ ] `hzl task prune --project <name>` prunes tasks in specified project
- [ ] `hzl task prune --all` prunes tasks in all projects
- [ ] `--older-than <Nd>` configures age threshold (default 30d, minimum 1d)
- [ ] Interactive confirmation shows task count and sample titles
- [ ] `--yes` bypasses confirmation
- [ ] `--dry-run` shows preview without deleting (works in non-TTY without --yes)
- [ ] `--json` outputs structured result (requires `--yes` unless `--dry-run`)
- [ ] Only terminal states (`done`, `archived`) are prunable
- [ ] Parent/child families pruned atomically
- [ ] Projections deleted first (cache.db), then events (events.db) - order matters for recovery
- [ ] Startup verification recreates missing event protection triggers
- [ ] `--vacuum` runs after deletion and reclaims disk space
- [ ] `--export` writes NDJSON before deletion
- [ ] `--as-of` allows deterministic age evaluation for automation

### Non-Functional Requirements

- [ ] Exit code 0 on success (including "no eligible tasks")
- [ ] Exit code 2 for invalid usage (missing scope, invalid format)
- [ ] Transaction rollback on failure leaves database consistent
- [ ] SQLite triggers restored even on error
- [ ] Confirmation output goes to stderr (doesn't interfere with JSON)

### Quality Gates

- [ ] All existing tests pass
- [ ] New tests cover happy path, edge cases, error cases
- [ ] TypeScript types pass (`npm run typecheck`)
- [ ] ESLint passes (`npm run lint`)
- [ ] Documentation updated (README, AGENTS.md, concepts page)

## Dependencies & Prerequisites

- None - uses existing codebase patterns

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Trigger not restored after error | Low | High | Try/finally ensures trigger recreation |
| Prune while sync configured | Medium | High | Add warning/guard for sync databases |
| User accidentally prunes recent work | Low | Medium | Interactive confirmation, age threshold |
| Large prune set causes memory issues | Low | Medium | Consider batching in future version |
| VACUUM locks DB for longer time | Medium | Medium | Make it explicit with `--vacuum` and warn in output |

## Future Considerations

- `--status` filter to prune only `done` or only `archived`
- Batched deletion for very large datasets
- Sync database handling (block or special logic)

## References & Research

### Internal References

- Confirmation pattern: `packages/hzl-cli/src/commands/init.ts:62-90`
- Transaction pattern: `packages/hzl-core/src/db/transaction.ts:8-38`
- Projection deletion: `packages/hzl-cli/src/commands/project/delete.ts:42-69`
- Subtask queries: `packages/hzl-core/src/services/task-service.ts:205-213`
- Event triggers: `packages/hzl-core/src/db/schema.ts:18-30`

### Institutional Learnings

- Event sourcing bypass warning: `docs/solutions/best-practices/event-sourcing-bypass-in-stealtask-hzl-core-20260201.md`
- Service layer pattern: `docs/solutions/architecture-issues/web-layer-bypassing-service-layer.md`

### Related Work

- Brainstorm: `docs/brainstorms/2026-02-01-task-pruning-brainstorm.md`
