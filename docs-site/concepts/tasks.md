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

### Optional Flags

| Flag | Description |
|------|-------------|
| `-d, --description` | Detailed description of the task |
| `-l, --links` | Comma-separated URLs or file paths to reference docs |
| `-t, --tags` | Comma-separated tags for filtering |
| `-p, --priority` | Priority level 0-3 (higher = more important) |
| `-s, --status` | Initial status (backlog, ready, in_progress, blocked, done) |
| `--depends-on` | Comma-separated task IDs this depends on |
| `--parent` | Parent task ID (creates a subtask) |

### Linking to Context

Keep tasks focused on the work itself. Use `--links` to reference supporting documents:

```bash
hzl task add "Implement auth flow per design" -P myapp \
  --links docs/designs/auth-flow.md,https://example.com/spec
```

Agents can read linked files for context while the task stays actionable.

## Parent Tasks and Subtasks

HZL supports one level of task hierarchy: **parent tasks** contain **subtasks**.

### Structure

- **Project** = repository or workspace. One per repo. Always check `hzl project list` first.
- **Task** = feature or work item (can be a parent task)
- **Subtask** = breakdown of a parent (`--parent <id>`). Max 1 level deep.

### Anti-pattern: Project Sprawl

Don't create a new project for every feature:

```bash
# Wrong: feature is not a project
hzl project create "query-perf"
```

Features should be parent tasks within a single project:

```bash
# Correct: parent task for the feature
hzl task add "Query perf" -P myrepo

# Subtasks break down the work
hzl task add "Fix N+1 queries" --parent <parent-id>
hzl task add "Add query caching" --parent <parent-id>
```

### Creating Subtasks

Use `--parent` to create a subtask:

```bash
hzl task add "Subtask A" --parent <id>
hzl task add "Subtask B" --parent <id> --depends-on <subtask-a-id>
```

### Working with Subtasks

```bash
# Get next available subtask of a parent
hzl task next --parent <id>

# After completing a subtask, check the parent
hzl task show <parent-id> --json    # Any subtasks left?
hzl task complete <parent-id>       # Complete parent when all subtasks done
```

See [Subtasks](subtasks.md) for more patterns and examples.

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

Before working on a task, claim it (you can also use `hzl task start` as an alias):

```bash
hzl task claim <id> --assignee "Claude Code"
```

The `--assignee` flag identifies who's working on the task.

For AI agents that need session tracking, add `--agent-id`:

```bash
hzl task claim 1 --assignee "Claude Code" --agent-id "session-xyz"
```

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

## Updating Tasks

Modify task properties after creation:

```bash
hzl task update <id> --title "New title"
hzl task update <id> --desc "Updated description"
hzl task update <id> --links doc1.md,doc2.md
hzl task update <id> --tags bug,urgent
hzl task update <id> --priority 2
```

To clear a field, pass an empty string:

```bash
hzl task update <id> --links ""    # Remove all links
hzl task update <id> --tags ""     # Remove all tags
hzl task update <id> --desc ""     # Clear description
```

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
hzl task claim 1 --assignee claude-code

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
4. **Always identify yourself** - Use `--assignee` or `--agent-id` to track who did what
5. **Block when stuck** - Use `hzl task block` instead of leaving tasks in limbo
6. **Complete or archive** - Don't leave tasks hanging
7. **Prune periodically** - Clean up old done/archived tasks to keep the database lean
