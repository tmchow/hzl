---
layout: doc
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
| `-s, --status` | Initial status (backlog, ready, in_progress, blocked, done, archived) |
| `--agent` | Initial agent (free-form string, no identity lookup) |
| `--author` | Optional actor attribution for task creation events |
| `--depends-on` | Comma-separated task IDs this depends on |
| `--parent` | Parent task ID (creates a subtask) |

### Linking to Context

Keep tasks focused on the work itself. Use `--links` to reference supporting documents:

```bash
hzl task add "Implement auth flow per design" -P myapp \
  --links docs/designs/auth-flow.md,https://example.com/spec
```

Descriptions can be multiline Markdown. Use shell quoting or a heredoc:

```bash
hzl task add "Write rollout plan" -P myapp \
  -d "$(cat <<'EOF'
## Goal
- Roll out behind feature flag

## Acceptance Criteria
- [ ] Canary metrics stay within baseline
- [ ] Rollback steps documented
EOF
)"
```

To track who delegated work, set both agent and author:

```bash
hzl task add "Investigate flaky auth test" -P myapp -s ready \
  --agent kenji \
  --author clara
```

## Ownership vs Authorship

HZL separates task ownership from action attribution:

- **Agent (`--agent`)**: who currently owns the task.
- **Author (`--author`)**: who performed a specific mutation event.

`--author` is optional. Use it when one actor is operating on behalf of another (delegation, handoffs, audits). Skip it for solo/self-tracking flows.

Important behavior:
- `hzl task claim` has no `--author` flag; the `--agent` value is recorded as the event author.
- `hzl task steal` uses `--agent` for takeover ownership and optional `--author` for attribution (`--owner` remains as a deprecated alias).

## Task Statuses

Tasks move through these statuses:

| Status | Meaning |
|--------|---------|
| `backlog` | Not ready to be claimed yet |
| `ready` | Available to be claimed |
| `in_progress` | Someone is working on it |
| `blocked` | Stuck on an external issue |
| `done` | Work complete |
| `archived` | No longer relevant |

Note: `blocked` is different from dependency blocking. A task with unmet dependencies won't appear in `--available` lists, but its status remains `ready`. The `blocked` status is for tasks that are stuck due to external issues (waiting for API access, human decision, etc.).

## Claiming Tasks

Before working on a task, claim it:

```bash
hzl task claim <id> --agent worker-1
```

Claiming:
- Changes status to `in_progress`
- Records who is working on it
- Prevents other agents from claiming

See [Claiming & Leases](./claiming-leases) for atomic claiming, agent IDs, and lease-based recovery.

## Recording Progress

Use checkpoints to record progress while working:

```bash
hzl task checkpoint <id> "Designed the schema, moving to implementation"
```

Track completion with a 0-100 progress value:

```bash
hzl task progress <id> 50   # 50% complete
```

See [Checkpoints](./checkpoints) for best practices on preserving context across sessions.

## Blocking Tasks

When a task is stuck waiting on external factors:

```bash
hzl task block <id> --comment "Blocked: waiting for API credentials from DevOps"
```

To resume work:

```bash
hzl task unblock <id>
```

See [Blocking & Unblocking](/workflows/blocking-unblocking) for the full workflow.

## Completing Tasks

When done:

```bash
hzl task complete <id>
```

This marks the task as `done` and unblocks any dependent tasks.

## Listing and Finding Tasks

```bash
# All tasks
hzl task list

# In a specific project
hzl task list -P my-project

# Assigned to a specific agent/person
hzl task list --agent kenji

# Assigned to a specific agent/person in one project
hzl task list -P my-project --agent kenji

# Only available (ready, not blocked)
hzl task list --available

# Get next available task
hzl task claim --next -P my-project
```

## Task Details

```bash
hzl task show <id>
hzl task show <id> --deep   # Full subtask fields + blocked_by
```

Shows title, description, status, dependencies, and checkpoints.

The `--deep` flag expands subtask data from a summary (`task_id`, `title`, `status`) to all Task fields plus a computed `blocked_by` array. This lets agents get complete context on a parent task and all its children in a single call.

## Updating Tasks

```bash
hzl task update <id> --title "New title"
hzl task update <id> --desc "Updated description"
hzl task update <id> --links doc1.md,doc2.md
hzl task update <id> --tags bug,urgent
hzl task update <id> --priority 2
hzl task update <id> --title "New title" --author clara
hzl task move <id> my-project --author clara
hzl task add-dep <id> <depends-on-id> --author clara
hzl task remove-dep <id> <depends-on-id> --author clara
```

To clear a field, pass an empty string:

```bash
hzl task update <id> --desc ""     # Clear description
hzl task update <id> --links ""    # Remove all links
```

## Archiving Tasks

For tasks no longer needed:

```bash
hzl task archive <id>
```

Archived tasks are hidden from normal lists but preserved in history.

## Pruning Old Tasks

Completed tasks accumulate over time. Pruning permanently removes old terminal tasks:

```bash
# Preview what would be pruned (safe)
hzl task prune --project my-project --dry-run

# Prune tasks older than 30 days (default)
hzl task prune --project my-project --yes

# Prune tasks older than 90 days
hzl task prune --project my-project --older-than 90d --yes
```

**Warning:** Pruning is destructive and cannot be undone. Always use `--dry-run` first.

## Best Practices

1. **Keep tasks small** - 1-2 hours of focused work
2. **Use descriptive titles** - Future you will thank you
3. **Checkpoint frequently** - Preserve context across sessions
4. **Track ownership first** - Use `--agent` to set who owns active work
5. **Use `--author` selectively** - Add it when attribution differs from ownership
6. **Block when stuck** - Use `hzl task block` instead of leaving tasks in limbo
7. **Complete or archive** - Don't leave tasks hanging
