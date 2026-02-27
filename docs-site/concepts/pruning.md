---
layout: doc
title: Pruning
parent: Concepts
nav_order: 5
---

# Task Pruning

Pruning permanently deletes old tasks that have completed. It reclaims storage space while maintaining referential integrity.

## Philosophy

In an event-sourced system, completed work still consumes space. Pruning selectively removes terminal tasks (done/archived) and their events, balancing storage efficiency with audit trails. The system ensures:

- **Family atomicity**: Parent and child tasks are pruned together or not at all
- **Dependency safety**: Tasks that are prerequisites for non-terminal work cannot be pruned
- **Projection cleanup**: Projections are deleted before events to enable recovery if needed

## When to Prune

Prune tasks when:
- Completed work is older than your retention policy (e.g., 30+ days old)
- Storage concerns require reclamation
- Archival needs are met (exported to external systems)

Do not prune:
- Tasks with active dependencies (non-terminal tasks depend on them)
- Tasks in subtask hierarchies where only some children are terminal
- Tasks before archival/export if you need the audit trail

## Usage

### Basic Pruning

Prune tasks older than 30 days in a specific project:

```bash
hzl task prune --project my-project --older-than 30d --yes
```

Prune across all projects:

```bash
hzl task prune --all --older-than 30d --yes
```

### Preview Before Deleting

See what would be deleted without removing anything:

```bash
hzl task prune --project my-project --older-than 30d --dry-run
```

### JSON Output

For scripting:

```bash
hzl task prune --project my-project --older-than 30d --yes
```

Returns:

```json
{
  "pruned": [
    {
      "task_id": "abc123",
      "title": "Completed task",
      "project": "my-project",
      "status": "done"
    }
  ],
  "count": 1,
  "eventsDeleted": 5
}
```

### Custom Date Threshold

Evaluate age as of a fixed date (ISO 8601):

```bash
hzl task prune --project my-project --older-than 30d --as-of 2026-01-15T00:00:00Z --yes
```

Tasks older than 30 days from January 15 would be pruned.

### Non-Interactive Scripting

In non-TTY environments (CI/cron), always use `--yes`:

```bash
hzl task prune --all --older-than 7d --yes
```

Without `--yes`, the command will fail in non-interactive mode.

## Safety Features

### Family Atomicity

If a parent task has children:

- Both parent and children must be terminal (done/archived) to prune
- Pruning a parent also prunes all children (automatically)
- Cannot prune a child without pruning siblings (enforced by SQL query)

Example: If a parent is done but a child is in-progress, neither can be pruned.

### Dependency Safety

Tasks that are prerequisites cannot be pruned if any dependent task is non-terminal.

Example:
- Task A (done) is a dependency of Task B (in-progress)
- Task A cannot be pruned until Task B completes or dependency is removed

### Confirmation Prompt

By default, prune prompts for confirmation and previews tasks:

```
Ready to permanently delete 5 task(s):

  Project 'inbox': 5 task(s)
    [abc123d4] Old completed task
    [def456e7] Another done task
    ...

WARNING: This action cannot be undone. Events will be permanently deleted.

Type 'yes' to confirm:
```

Skip the prompt with `--yes` (for scripting).

### Transaction Safety

Pruning operates in a single transaction:

- Projections are deleted first (for recovery safety)
- Events are deleted second
- On failure, the entire operation rolls back
- Never leaves partial deletions

## Best Practices

### 1. Start Conservative

Begin with a long retention period, then shorten:

```bash
# First time: 90-day threshold
hzl task prune --project my-project --older-than 90d --dry-run

# After reviewing: reduce to 30 days
hzl task prune --project my-project --older-than 30d --dry-run
```

### 2. Preview First

Always use `--dry-run` to see what will be deleted:

```bash
hzl task prune --project my-project --older-than 30d --dry-run
```

### 3. Export Before Pruning

If you need an audit trail, export tasks to NDJSON first:

```bash
hzl task prune --project my-project --older-than 30d --export backup.ndjson --yes
```

(Note: `--export` is reserved for future use; currently use external tooling for backup)

### 4. Schedule Regularly

Use cron for periodic cleanup:

```bash
# Every Sunday, prune tasks older than 30 days
0 0 * * 0 hzl task prune --all --older-than 30d --yes
```

### 5. Monitor Storage

Track before/after storage usage:

```bash
# Before pruning
du -sh .local/hzl/

# Prune
hzl task prune --all --older-than 30d --yes

# After pruning (consider running VACUUM to reclaim space)
du -sh .local/hzl/
```

Disk space is not immediately reclaimed; SQLite marks it as reusable. To actually reclaim:

```bash
hzl task prune --all --older-than 30d --yes --vacuum
```

(Note: `--vacuum` is reserved for future use)

## Terminology

- **Terminal state**: Task is either `done` or `archived`
- **Eligible**: Task meets all criteria for pruning (terminal, age threshold, no active dependents, not parent of non-terminal children)
- **Family**: Parent task and all its children (one level)
- **Prunability**: Whether a task can be safely deleted

## Limitations

- Pruning cannot be undone without a database backup
- Deletes events permanently—no recovery from events database after pruning
- Cannot selectively prune tasks mid-hierarchy (all or nothing per family)
- Age threshold is evaluated from `terminal_at` timestamp (when task became terminal)

## Troubleshooting

### "Cannot prune task X—has active dependents"

Task X is a prerequisite for a non-terminal task. Either:
- Complete the dependent task first
- Remove the dependency relationship
- Wait for the dependent to reach a terminal state

### "Cannot prompt for confirmation in non-interactive mode"

Running in a non-TTY environment (CI, cron, background job) without `--yes` flag. Add `--yes` to auto-confirm:

```bash
hzl task prune --project my-project --older-than 30d --yes
```

### No tasks eligible for pruning

Possible reasons:
- All tasks are younger than the threshold
- Tasks are not in terminal states (still in-progress, ready, blocked)
- Tasks have active dependents or non-terminal children

Use `--dry-run` and check output.
