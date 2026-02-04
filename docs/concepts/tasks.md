---
layout: default
title: Tasks
parent: Concepts
nav_order: 2
---

# Tasks

Tasks are the units of work in HZL. They track what needs to be done, who's working on it, and progress made.

## Creating Tasks

```bash
hzl task add "Implement user authentication" -P my-project
```

Tasks require a title and project:
- **Title:** Clear description of what to do
- **Project:** Which project this belongs to (`-P` or `--project`)

## Task Statuses

Tasks move through these statuses:

| Status | Meaning |
|--------|---------|
| `ready` | Available to be claimed |
| `in_progress` | Someone is working on it |
| `blocked` | Stuck on an external issue |
| `done` | Work complete |
| `archived` | No longer relevant |

Note: `blocked` is different from dependency blocking. A task with unmet dependencies won't appear in `--available` lists, but its status remains `ready`. The `blocked` status is for tasks that are stuck due to external issues (waiting for API access, human decision, etc.).

## Claiming Tasks

Before working on a task, claim it:

```bash
hzl task claim <id> --author "Claude Code"
```

The `--author` flag identifies who's working on the task. This becomes the task's **assignee**.

For AI agents that need session tracking, add `--agent-id`:

```bash
hzl task claim 1 --author "Claude Code" --agent-id "session-xyz"
```

## Tracking Who Did What

HZL tracks authorship at two levels:

| Concept | What it tracks | Set by |
|---------|----------------|--------|
| **Assignee** | Who owns the task | `--author` or `--agent-id` on `claim` |
| **Event author** | Who performed an action | `--author` on any command |

The `--author` flag appears on many commands (checkpoint, comment, block, etc.) to record who performed each action:

```bash
# Task owned by Alice
hzl task claim 1 --author "Alice"

# Bob adds a checkpoint (doesn't change ownership)
hzl task checkpoint 1 "Fixed the bug" --author "Bob"

# The task is still assigned to Alice, but the checkpoint was recorded by Bob
```

This separation lets you track contributions even when someone else owns the task.

### Why Claim?

- Prevents two agents from working on the same task
- Creates audit trail of who did what
- Enables `hzl task next` to skip claimed tasks

## Recording Progress

Use checkpoints to record progress while working:

```bash
hzl task checkpoint <id> "Designed the schema, moving to implementation"
```

Checkpoints:
- Preserve context for future sessions
- Show progress in the dashboard
- Help other agents understand status

### Progress Percentage

Track completion with a 0-100 progress value:

```bash
hzl task progress <id> 50   # 50% complete
```

Progress is shown in `hzl task show` and the web dashboard.

## Blocking Tasks

When a task is stuck waiting on external factors, mark it blocked:

```bash
hzl task block <id> --comment "Blocked: waiting for API credentials from DevOps"
```

Blocked tasks:
- Stay visible in the dashboard (Blocked column)
- Keep their assignee
- Don't appear in `--available` lists

To resume work:

```bash
hzl task unblock <id>
```

This returns the task to `in_progress` status.

## Completing Tasks

When done:

```bash
hzl task complete <id>
```

This marks the task as `done` and unblocks any dependent tasks.

## Listing Tasks

```bash
# All tasks
hzl task list

# In a specific project
hzl task list -P my-project

# Only available (ready, not blocked)
hzl task list --available

# JSON output
hzl task list --json
```

## Getting the Next Task

Let HZL pick the next available task:

```bash
hzl task next -P my-project
```

This returns a task that is:
- Status: `ready`
- Not claimed by anyone
- All dependencies satisfied

## Task Details

View full task information:

```bash
hzl task show <id>
```

Shows:
- Title and description
- Status and author
- Dependencies
- Checkpoints

## Archiving Tasks

For tasks no longer needed:

```bash
hzl task archive <id>
```

Archived tasks are hidden from normal lists but preserved in history.

## Example Workflow

```bash
# Create task
hzl task add "Build login form" -P auth

# Claim it
hzl task claim 1 --author claude-code

# Record progress
hzl task checkpoint 1 "Form HTML complete, adding validation"
hzl task checkpoint 1 "Validation done, testing"

# Mark complete
hzl task complete 1
```

## Pruning Old Tasks

Over time, completed tasks accumulate. Pruning permanently removes old terminal tasks (done/archived) to keep HZL lean:

```bash
# Preview what would be pruned (safe)
hzl task prune --project my-project --dry-run

# Prune tasks older than 30 days (default)
hzl task prune --project my-project --yes

# Prune tasks older than 90 days
hzl task prune --project my-project --older-than 90d --yes

# Prune across all projects
hzl task prune --all --yes
```

**Important:** Pruning is destructive and cannot be undone. Always use `--dry-run` first to preview.

See [Pruning](pruning.md) for detailed guidance on when and how to prune.

## Best Practices

1. **Keep tasks small** - 1-2 hours of focused work
2. **Use descriptive titles** - Future you will thank you
3. **Checkpoint frequently** - Preserve context
4. **Always identify yourself** - Use `--author` or `--agent-id` to track who did what
5. **Block when stuck** - Use `hzl task block` instead of leaving tasks in limbo
6. **Complete or archive** - Don't leave tasks hanging
7. **Prune periodically** - Clean up old done/archived tasks to keep the database lean
